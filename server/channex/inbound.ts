import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";
import { db, pool, withDatabaseTransaction } from "../db";
import { storage } from "../db-storage";
import { withInvoiceAdvisoryLock } from "../billing/invoiceAdvisoryLock";
import { withLodgingInventoryMutationLock } from "../inventoryMutationLock";
import { withNightlyWriter, withReservationFinancialLocks } from "../nightlyPricingGuard";
import { amountString } from "@shared/nightlyPricing";
import { STAGING_URL } from "./ari";
import { BookingReviewError, parseBookingRevision, redactBooking, revisionHash, review } from "./bookingRevision";
import { settleBooking } from "./settlement";

export function assertInboundStaging(connection: any) {
  if (!connection?.is_active || connection.environment !== "demo" || connection.base_url?.replace(/\/$/, "") !== STAGING_URL) return review("STAGING_ONLY");
}
/** Revalidate durable, unacknowledged parser failures after a release. No remote
 * re-delivery is required, and payloads/collision decisions remain immutable. */
export async function recoverStoredInboundRevisions(target: Pool) {
  const rows = (await target.query(`SELECT r.connection_id,r.payload FROM channex_inbound_revisions r
    JOIN channex_connections c ON c.id=r.connection_id
    JOIN channex_inbound_settings i ON i.connection_id=c.id
    JOIN channex_ari_settings a ON a.connection_id=c.id
    WHERE r.status='review' AND r.review_code='INVALID_REVISION' AND r.acked_at IS NULL
      AND i.enabled AND a.enabled AND c.is_active AND c.environment='demo' AND c.base_url=$1
    ORDER BY r.created_at`, [STAGING_URL])).rows;
  for (const row of rows) await persistInboundRevision(target, row.connection_id, row.payload);
}
/** Immutable durable inbox. ACK is a separate post-commit action. */
export async function persistInboundRevision(target: Pool, connectionId: string, input: unknown) {
  const payload = redactBooking(input);
  if (!payload || typeof payload.id !== "string" || payload.id.length > 160 || !payload.id.length) return review("INVALID_REVISION_ID");
  if (Buffer.byteLength(JSON.stringify(payload)) > 1024 * 1024) return review("REVISION_TOO_LARGE");
  const c = await target.connect();
  try {
    await c.query("BEGIN");
    const connection = (await c.query("SELECT * FROM channex_connections WHERE id=$1 FOR SHARE", [connectionId])).rows[0];
    assertInboundStaging(connection);
    let booking: ReturnType<typeof parseBookingRevision> | undefined, code: string | null = null;
    try { booking = parseBookingRevision(payload, connection.channex_property_id); }
    catch (error) { if (!(error instanceof BookingReviewError)) throw error; code = error.code; }
    const trustedHead = code && !["INVALID_REVISION", "WRONG_PROPERTY"].includes(code);
    const hash = revisionHash(payload);
    const inserted = await c.query(`INSERT INTO channex_inbound_revisions(connection_id,revision_id,payload,payload_hash,booking_id,inserted_at,status,review_code)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING revision_id`,
      [connectionId, payload.id, payload, hash, booking?.bookingId || (trustedHead ? payload.attributes.booking_id : null), booking?.insertedAt || (trustedHead ? payload.attributes.inserted_at : null), code ? "review" : "pending", code]);
    if (!inserted.rowCount) {
      const existing = (await c.query("SELECT payload_hash FROM channex_inbound_revisions WHERE connection_id=$1 AND revision_id=$2 FOR UPDATE", [connectionId, payload.id])).rows[0];
      if (existing.payload_hash !== hash) {
        await c.query("UPDATE channex_inbound_revisions SET status='review',review_code='REVISION_ID_COLLISION' WHERE connection_id=$1 AND revision_id=$2", [connectionId, payload.id]);
      } else if (booking) {
        // Re-fetching an identical unacknowledged revision after a parser fix
        // can recover it. Keep the immutable payload/hash and all other review
        // decisions; normal application still checks scope, mapping and money.
        await c.query(`UPDATE channex_inbound_revisions SET status='pending',review_code=NULL,booking_id=$3,inserted_at=$4
          WHERE connection_id=$1 AND revision_id=$2 AND status='review' AND review_code='INVALID_REVISION' AND acked_at IS NULL`,
          [connectionId, payload.id, booking.bookingId, booking.insertedAt]);
      }
    }
    await c.query("COMMIT");
    return payload.id as string;
  } catch (error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
}
function guestFingerprint(g: any) {
  return revisionHash({ firstName: g.firstName, lastName: g.lastName, email: g.email || null, phone: g.phone || null });
}
function localFingerprint(r: any) {
  return revisionHash({
    guest: r.guestId, room: r.roomId, type: r.roomTypeId, plan: r.ratePlanId,
    arrival: r.checkInDate, departure: r.checkOutDate, status: r.status, nights: r.nightlyPricing, total: r.totalRoomAmount, occupancy: r.numberOfGuests
  });
}
/** Canonical storage owns overlap checks, pricing guards, audit and the ARI
 * triggers. The entire multi-room booking and revision cursor commit together. */
export async function applyInboundRevision(connectionId: string, revisionId: string) {
  const initial = (await db.execute(sql`SELECT booking_id,status FROM channex_inbound_revisions WHERE connection_id=${connectionId} AND revision_id=${revisionId}`)).rows[0] as any;
  if (!initial || initial.status !== "pending" || !initial.booking_id) return;
  return withInvoiceAdvisoryLock(pool, `channex-booking:${connectionId}:${initial.booking_id}`, async () => {
    const priorLinks = (await db.execute(sql`SELECT reservation_id FROM channex_inbound_rooms WHERE connection_id=${connectionId} AND booking_id=${initial.booking_id}`)).rows as any[];
    try {
      return await withReservationFinancialLocks(priorLinks.map(row => row.reservation_id), () => withLodgingInventoryMutationLock(() => withDatabaseTransaction(async () => {
        const source = (await db.execute(sql`SELECT * FROM channex_inbound_revisions WHERE connection_id=${connectionId} AND revision_id=${revisionId} FOR UPDATE`)).rows[0] as any;
        if (source.status !== "pending") return;
        const config = (await db.execute(sql`SELECT c.*,s.enabled,s.floor,s.currency,i.settlement_exchange_rate FROM channex_connections c
          JOIN channex_ari_settings s ON s.connection_id=c.id JOIN channex_inbound_settings i ON i.connection_id=c.id
          WHERE c.id=${connectionId} AND i.enabled FOR SHARE OF c,s,i`)).rows[0] as any;
        if (!config || !config.enabled) return;
        assertInboundStaging(config);
        const booking = parseBookingRevision(source.payload, config.channex_property_id);
        await db.execute(sql`INSERT INTO channex_inbound_bookings(connection_id,booking_id) VALUES(${connectionId},${booking.bookingId}) ON CONFLICT DO NOTHING`);
        const cursor = (await db.execute(sql`SELECT * FROM channex_inbound_bookings WHERE connection_id=${connectionId} AND booking_id=${booking.bookingId} FOR UPDATE`)).rows[0] as any;
        if (cursor.last_inserted_at && new Date(booking.insertedAt).getTime() <= new Date(cursor.last_inserted_at).getTime()) {
          if (new Date(booking.insertedAt).getTime() === new Date(cursor.last_inserted_at).getTime() && cursor.last_revision_id !== revisionId) return review("REVISION_ORDER_AMBIGUOUS");
          await db.execute(sql`UPDATE channex_inbound_revisions SET status='stale',applied_at=now(),review_code=NULL WHERE connection_id=${connectionId} AND revision_id=${revisionId}`);
          return;
        }
        const links = (await db.execute(sql`SELECT * FROM channex_inbound_rooms WHERE connection_id=${connectionId} AND booking_id=${booking.bookingId} ORDER BY remote_room_id FOR UPDATE`)).rows as any[];
        if (!links.length) {
          const duplicate = await db.execute(sql`SELECT 1 FROM reservations WHERE external_reservation_id=${booking.bookingId} LIMIT 1`);
          if (duplicate.rows.length) return review("UNLINKED_EXTERNAL_RESERVATION");
        }
        const existing = new Map<string, any>();
        for (const link of links) {
          // Lock before inspecting local history. Payment/charge FK inserts
          // must finish before this check or wait until the update commits.
          await db.execute(sql`SELECT id FROM reservations WHERE id=${link.reservation_id} FOR UPDATE`);
          const r = await storage.getReservation(link.reservation_id);
          if (!r || !["confirmed", "pending", "tentative", "cancelled"].includes(r.status)) return review("LOCAL_STAY_REQUIRES_REVIEW");
          if (link.local_hash && link.local_hash !== localFingerprint(r)) return review("LOCAL_RESERVATION_CHANGED");
          const money = await db.execute(sql`SELECT 1 FROM payments WHERE reservation_id=${r.id} AND status IS DISTINCT FROM 'anulado'
            UNION ALL SELECT 1 FROM sales_invoices WHERE reserva_id=${r.id} AND estado<>'descartada'
            UNION ALL SELECT 1 FROM charges WHERE reservation_id=${r.id} AND status IS DISTINCT FROM 'anulado'
            UNION ALL SELECT 1 FROM group_reservation_links WHERE reservation_id=${r.id} LIMIT 1`);
          if (money.rows.length) return review("LOCAL_FINANCIAL_HISTORY");
          existing.set(link.remote_room_id, r);
        }
        if (booking.status !== "cancelled" && (booking.currency !== config.currency || !["ARS", "USD"].includes(booking.currency!))) return review("UNSUPPORTED_CURRENCY");
        const priorCurrency = cursor.source_currency || (cursor.last_revision_id && !cursor.cancelled ? "ARS" : null);
        if (booking.status !== "cancelled" && priorCurrency && priorCurrency !== booking.currency) return review("SOURCE_CURRENCY_CHANGED");
        // A booking keeps its original conversion for all revisions. An
        // operator's later quote changes affect only newly received bookings.
        const settlementRate = booking.currency === "USD" ? cursor.settlement_exchange_rate || config.settlement_exchange_rate : "1.000000";
        const settledRooms = booking.status === "cancelled" ? [] : settleBooking(booking, settlementRate);
        if (booking.status !== "cancelled" && cursor.cancelled) return review("CANCELLED_BOOKING_REOPEN");
        const wanted = new Set(booking.rooms.map(room => room.key));
        for (const [key, r] of existing) {
          if (booking.status === "cancelled" || !wanted.has(key)) {
            if (r.status !== "cancelled") await storage.updateReservation(r.id, { status: "cancelled", lastModifiedBy: "Channex" });
            const saved = await storage.getReservation(r.id);
            await db.execute(sql`UPDATE channex_inbound_rooms SET local_hash=${localFingerprint(saved)} WHERE connection_id=${connectionId} AND booking_id=${booking.bookingId} AND remote_room_id=${key}`);
          }
        }
        let guestHash = cursor.guest_hash;
        if (booking.status !== "cancelled") {
          // Each channel booking owns a dedicated guest record; never merge
          // people based on similar names/email or overwrite a hotel guest.
          let guestId = links.length ? existing.values().next().value?.guestId : null;
          const profile = {
            firstName: booking.customer!.name, lastName: booking.customer!.surname || "—",
            email: booking.customer!.mail || null, phone: booking.customer!.phone || null
          };
          if (!guestId) guestId = (await storage.createGuest(profile)).id;
          else {
            await db.execute(sql`SELECT id FROM guests WHERE id=${guestId} FOR UPDATE`);
            const guest = await storage.getGuest(guestId);
            if (!guest || (cursor.guest_hash && guestFingerprint(guest) !== cursor.guest_hash)) return review("LOCAL_GUEST_CHANGED");
            if (guestFingerprint(guest) !== guestFingerprint(profile)) {
              const foreign = await db.execute(sql`SELECT 1 FROM reservations r WHERE r.guest_id=${guestId}
                AND NOT EXISTS(SELECT 1 FROM channex_inbound_rooms l WHERE l.connection_id=${connectionId} AND l.booking_id=${booking.bookingId} AND l.reservation_id=r.id) LIMIT 1`);
              if (foreign.rows.length) return review("SHARED_GUEST_REQUIRES_REVIEW");
              await storage.updateGuest(guestId, profile);
            }
          }
          guestHash = guestFingerprint(profile);
          for (const room of settledRooms) {
            const maps = (await db.execute(sql`SELECT rm.room_type_id,rp.rate_plan_id,rt.max_occupancy,p.currency,p.room_type_id AS plan_room_type
              FROM channex_room_type_mappings rm JOIN channex_rate_plan_mappings rp ON rp.connection_id=rm.connection_id AND rp.channex_room_type_id=rm.channex_room_type_id
              JOIN room_types rt ON rt.id=rm.room_type_id JOIN rate_plans p ON p.id=rp.rate_plan_id
              WHERE rm.connection_id=${connectionId} AND rm.channex_room_type_id=${room.remoteType} AND rp.channex_rate_plan_id=${room.remotePlan} FOR SHARE OF rm,rp,rt,p`)).rows as any[];
            if (maps.length !== 1 || maps[0].room_type_id !== maps[0].plan_room_type || maps[0].currency !== booking.currency) return review("INVALID_ROOM_MAPPING");
            const map = maps[0], old = existing.get(room.key);
            if (room.occupancy > map.max_occupancy) return review("OCCUPANCY_EXCEEDS_CAPACITY");
            const candidates = (await db.execute(sql`SELECT r.id FROM rooms r WHERE r.floor=${config.floor} AND r.room_type_id=${map.room_type_id}
              AND r.is_active AND NOT COALESCE(r.is_virtual,false) AND r.room_number<>'REUB' AND r.status NOT IN ('maintenance','oos') AND COALESCE(r.max_occupancy,${map.max_occupancy})>=${room.occupancy}
              AND NOT EXISTS(SELECT 1 FROM maintenance_blocks m WHERE m.room_id=r.id AND m.block_from<${booking.departure}::date AND m.block_to>=${booking.arrival}::date)
              AND NOT EXISTS(SELECT 1 FROM reservations x WHERE x.room_id=r.id AND x.id<>${old?.id || ""} AND x.status NOT IN ('cancelled','checked_out','no_show')
                AND x.check_in_date<${booking.departure}::date AND x.check_out_date>${booking.arrival}::date)
              ORDER BY (r.id=${old?.roomId || ""}) DESC,r.room_number::text FOR UPDATE OF r`)).rows as any[];
            if (!candidates.length) return review("NO_PILOT_ROOM_AVAILABLE");
            const average = amountString(Math.round(room.totalCents / room.nights.length));
            const patch = {
              // USD selling plans must not become peso repricing defaults.
              guestId, roomId: candidates[0].id, roomTypeId: map.room_type_id, ratePlanId: booking.currency === "USD" ? null : map.rate_plan_id,
              checkInDate: booking.arrival!, checkOutDate: booking.departure!, nights: room.nights.length,
              totalRoomAmount: amountString(room.totalCents), baseRatePerNight: average, finalRatePerNight: average,
              discountType: "none" as const, discountValue: "0", status: "confirmed" as const, numberOfGuests: room.occupancy, lastModifiedBy: "Channex"
            };
            let saved = old;
            if (old) {
              if (old.status === "cancelled") return review("CANCELLED_ROOM_REOPEN");
              saved = await withNightlyWriter(old.pricingRevision, () => storage.updateReservation(old.id, {
                ...patch,
                nightlyPricing: room.nights, pricingScheme: "nightly_v1", pricingRevision: old.pricingRevision + 1
              }));
            } else {
              const code = `CHX-${randomUUID()}`;
              saved = await storage.createReservation({
                ...patch, reservationCode: code, createdAt: new Date(), source: "ota",
                externalReservationId: booking.bookingId
              });
              saved = await withNightlyWriter(saved.pricingRevision, () => storage.updateReservation(saved.id, {
                nightlyPricing: room.nights, pricingScheme: "nightly_v1", pricingRevision: saved.pricingRevision + 1
              }));
            }
            await db.execute(sql`INSERT INTO channex_inbound_rooms(connection_id,booking_id,remote_room_id,reservation_id,local_hash)
              VALUES(${connectionId},${booking.bookingId},${room.key},${saved.id},${localFingerprint(saved)})
              ON CONFLICT(connection_id,booking_id,remote_room_id) DO UPDATE SET local_hash=EXCLUDED.local_hash`);
            const original = booking.rooms.find(sourceRoom => sourceRoom.key === room.key)!;
            await db.execute(sql`INSERT INTO channex_inbound_settlements(connection_id,revision_id,remote_room_id,reservation_id,source_currency,source_total,source_nights,source_rate_plan_id,exchange_rate,settlement_total,settlement_nights)
              VALUES(${connectionId},${revisionId},${room.key},${saved.id},${booking.currency},${amountString(original.totalCents)},${JSON.stringify(original.nights)}::jsonb,${original.remotePlan},${settlementRate},${amountString(room.totalCents)},${JSON.stringify(room.nights)}::jsonb)`);
          }
        }
        await db.execute(sql`UPDATE channex_inbound_bookings SET last_revision_id=${revisionId},last_inserted_at=${booking.insertedAt}::timestamptz,guest_hash=${guestHash},cancelled=${booking.status === "cancelled"} WHERE connection_id=${connectionId} AND booking_id=${booking.bookingId}`);
        if (booking.status !== "cancelled") await db.execute(sql`UPDATE channex_inbound_bookings SET source_currency=${booking.currency},settlement_exchange_rate=${settlementRate}
          WHERE connection_id=${connectionId} AND booking_id=${booking.bookingId}`);
        await db.execute(sql`UPDATE channex_inbound_revisions SET status='applied',applied_at=now(),review_code=NULL WHERE connection_id=${connectionId} AND revision_id=${revisionId}`);
      })));
    } catch (error) {
      // This runs after the canonical transaction rolled back. Never expose
      // raw SQL/provider errors, guest data or credentials in status/logs.
      const code = error instanceof BookingReviewError ? error.code : "PMS_APPLY_REQUIRES_REVIEW";
      await db.execute(sql`UPDATE channex_inbound_revisions SET status='review',review_code=${code} WHERE connection_id=${connectionId} AND revision_id=${revisionId} AND status='pending'`);
    }
  });
}
