import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Express } from "express";
import { db, withDatabaseTransaction } from "./db";
import { storage, getArgentinaToday } from "./db-storage";
import { withLodgingInventoryMutationLock } from "./inventoryMutationLock";
import { requireAuth, requirePermission } from "./auth";
import { getAppEnv } from "./app-env";
import { validCalendarDate } from "./stayEligibility";
import {
  isOperationalInventoryRoom,
  isRoomAvailableForInterval,
} from "@shared/room-availability";
import { historyAfterMove } from "@shared/roomAssignments";
import { compareBeds } from "@shared/housekeepingPlanning";
import { bedLabel } from "@shared/bedCatalog";
import {
  reservations,
  rooms,
  roomTypes,
  guests,
  bedTypes,
  maintenanceBlocks,
  groupReservationLinks,
  reservationRelocations,
  reservationChangelog,
  auditLogs,
  housekeepingTasks,
} from "@shared/schema";
import type { RelocationPreview } from "@shared/relocation";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fail(message: string, statusCode = 409): never {
  throw Object.assign(new Error(message), { statusCode });
}
const ready = (status: string) => ["available", "inspected"].includes(status);
const eligible = (r: any, today: string) =>
  ["tentative", "pending", "confirmed", "web_checkin", "checked_in"].includes(
    r.status,
  ) &&
  r.checkOutDate > today &&
  (r.status === "checked_in" ? r.checkInDate <= today : r.checkInDate >= today);
export const relocationRequest = z
  .object({
    operationId: z.string().uuid(),
    reservationToken: z.string().length(64),
    destinationToken: z.string().length(64),
    roomId: z.string().min(1).max(100),
    reason: z.string().trim().min(5).max(500),
    acknowledgePreparation: z.boolean().default(false),
    acknowledgeBedChange: z.boolean().default(false),
    overrideGroupWarning: z.boolean().default(false),
  })
  .strict();
export async function relocationSearch(query: string) {
  const today = getArgentinaToday(),
    q = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const rows =
    await db.execute(sql`SELECT r.id,r.reservation_code AS code,concat(g.last_name,' ',g.first_name) AS guest,
    rm.room_number AS room,r.check_in_date::text AS "checkIn",r.check_out_date::text AS "checkOut",r.status
    FROM reservations r LEFT JOIN guests g ON g.id=r.guest_id LEFT JOIN rooms rm ON rm.id=r.room_id
    WHERE r.status IN ('tentative','pending','confirmed','web_checkin','checked_in') AND r.check_out_date>${today}
    AND (r.status='checked_in' OR r.check_in_date>=${today})
    AND (r.reservation_code ILIKE ${q} OR concat(g.last_name,' ',g.first_name) ILIKE ${q} OR rm.room_number ILIKE ${q})
    ORDER BY CASE WHEN r.status='checked_in' THEN 0 ELSE 1 END,r.check_in_date,rm.room_number LIMIT 30`);
  return rows.rows;
}
export async function previewRelocation(
  id: string,
): Promise<RelocationPreview> {
  const [r] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, id));
  const today = getArgentinaToday();
  if (!r) fail("No se encontró la reserva.", 404);
  if (!eligible(r, today))
    fail(
      "Elegí una reserva futura o un huésped alojado con noches pendientes.",
    );
  const from = r.status === "checked_in" ? today : r.checkInDate,
    to = r.checkOutDate;
  if (!validCalendarDate(from) || !validCalendarDate(to) || from >= to)
    fail("El período de reubicación no es válido.");
  const [roomRows, typeRows, guestRows, bedRows, stays, blocks] =
    await Promise.all([
      db.select().from(rooms),
      db.select().from(roomTypes),
      db.select().from(guests).where(eq(guests.id, r.guestId)),
      db.select().from(bedTypes),
      db
        .select()
        .from(reservations)
        .where(
          sql`check_in_date<=${to} AND check_out_date>=${from} AND status IN ('tentative','pending','reserved','confirmed','web_checkin','checked_in')`,
        ),
      db
        .select()
        .from(maintenanceBlocks)
        .where(sql`block_from<${to} AND block_to>${from}`),
    ]);
  const origin = roomRows.find((room) => room.id === r.roomId),
    typeMap = new Map(typeRows.map((t) => [t.id, t]));
  const requested = bedRows.find((b) => b.id === r.bedTypeId),
    g = guestRows[0];
  const physicallyOccupied = new Set(
    (
      await db.execute(
        sql`SELECT room_id FROM reservations WHERE status='checked_in' AND id<>${r.id}`,
      )
    ).rows.map((row: any) => row.room_id),
  );
  const roomChoices: RelocationPreview["rooms"] = [];
  for (const room of roomRows) {
    if (room.id === r.roomId || !isOperationalInventoryRoom(room)) continue;
    const type = typeMap.get(room.roomTypeId);
    if (!type) continue;
    if (
      !isRoomAvailableForInterval({
        room,
        checkIn: from,
        checkOut: to,
        reservations: stays,
        maintenanceBlocks: blocks,
        excludedReservationIds: new Set([r.id]),
      })
    )
      continue;
    // A guest whose departure is overdue remains physically in house until out.
    if (
      from === today &&
      stays.some(
        (s) =>
          s.id !== r.id && s.roomId === room.id && s.status === "checked_in",
      )
    )
      continue;
    const occupiedNow = from === today && physicallyOccupied.has(room.id);
    if (occupiedNow) continue;
    if (
      stays.some(
        (s) =>
          s.id !== r.id &&
          s.roomId === room.id &&
          ((s.lateCheckOut && s.checkOutDate === from) ||
            (s.earlyCheckIn && s.checkInDate === to)),
      )
    )
      continue;
    const immediate = r.status === "checked_in";
    const fits =
      room.maxOccupancy === null || room.maxOccupancy >= r.numberOfGuests;
    const selectable = fits && (!immediate || ready(room.status));
    roomChoices.push({
      id: room.id,
      roomNumber: room.roomNumber,
      roomTypeId: room.roomTypeId,
      category: type.name,
      categoryOrder: type.sortOrder || 0,
      floor: room.floor,
      status: room.status,
      bed: room.bedConfig ? bedLabel(room.bedConfig, bedRows) : null,
      capacity: room.maxOccupancy,
      bedComparison: compareBeds(
        room.bedConfig,
        requested?.code || null,
        r.bedTypeNotes,
      ),
      ready: ready(room.status),
      selectable,
      unavailableReason: !fits
        ? "Capacidad insuficiente"
        : immediate && !ready(room.status)
          ? "Pendiente de preparación por Housekeeping"
          : null,
      token: hash(room),
    });
  }
  roomChoices.sort(
    (a, b) =>
      a.categoryOrder - b.categoryOrder ||
      a.category.localeCompare(b.category, "es") ||
      a.roomNumber.localeCompare(b.roomNumber, "es", { numeric: true }),
  );
  return {
    reservation: {
      id: r.id,
      code: r.reservationCode,
      guest: g ? `${g.lastName} ${g.firstName}` : "Sin huésped",
      room: origin?.roomNumber || "Sin habitación",
      category: typeMap.get(origin?.roomTypeId || r.roomTypeId)?.name || "",
      status: r.status,
      guests: r.numberOfGuests,
      requestedBed: requested?.name || "Sin informar",
      bedNotes: r.bedTypeNotes,
      preparation:
        r.housekeepingPreparation?.state === "prepared"
          ? r.housekeepingPreparation.note || "Preparación especial — NO MOVER"
          : null,
      from,
      to,
      token: hash(r),
    },
    rooms: roomChoices,
  };
}
export async function relocateReservation(
  id: string,
  input: z.infer<typeof relocationRequest>,
  actor: { id: string; username: string },
) {
  const requestHash = hash({ id, ...input });
  return withLodgingInventoryMutationLock(() =>
    withDatabaseTransaction(async () => {
      const [prior] = await db
        .select()
        .from(reservationRelocations)
        .where(eq(reservationRelocations.operationId, input.operationId));
      if (prior) {
        if (prior.requestHash !== requestHash)
          fail("Este intento ya fue utilizado con otros datos.");
        return prior.result;
      }
      await db.execute(
        sql`SELECT id FROM reservations WHERE id=${id} FOR UPDATE`,
      );
      const [r] = await db
        .select()
        .from(reservations)
        .where(eq(reservations.id, id));
      if (!r) fail("No se encontró la reserva.", 404);
      // Lock both rooms with the same deterministic order as other relocations.
      await db.execute(
        sql`SELECT id FROM rooms WHERE id IN (${r.roomId},${input.roomId}) ORDER BY id FOR UPDATE`,
      );
      const preview = await previewRelocation(id),
        choice = preview.rooms.find((room) => room.id === input.roomId);
      if (preview.reservation.token !== input.reservationToken)
        fail("La reserva cambió. Actualizá las opciones antes de confirmar.");
      if (!choice)
        fail(
          "La habitación elegida ya no está disponible para todo el período.",
        );
      if (choice.token !== input.destinationToken)
        fail("Cambió el estado o camaje del destino. Actualizá las opciones.");
      if (!choice.selectable)
        fail(choice.unavailableReason || "La habitación no está lista.");
      if (preview.reservation.preparation && !input.acknowledgePreparation)
        fail(
          "Confirmá la revisión de la preparación especial de Housekeeping.",
        );
      const bedReview = ["different", "review"].includes(choice.bedComparison);
      if (bedReview && !input.acknowledgeBedChange)
        fail("Revisá y confirmá el camaje del destino.");
      const [link] = await db
        .select()
        .from(groupReservationLinks)
        .where(eq(groupReservationLinks.reservationId, id));
      const inventory = await storage.evaluateReservationInventory({
        roomTypeId: choice.roomTypeId,
        checkInDate: preview.reservation.from,
        checkOutDate: r.checkOutDate,
        excludeReservationId: id,
        contextGroupId:
          choice.roomTypeId === r.roomTypeId ? link?.groupId : undefined,
        hasSpecificRoom: true,
        override: input.overrideGroupWarning,
      });
      if (
        inventory &&
        !(
          inventory.code === "GROUP_BLOCK_WARNING" && input.overrideGroupWarning
        )
      )
        throw Object.assign(
          new Error(
            inventory.code === "GROUP_BLOCK_WARNING"
              ? "El destino afecta cupos de grupos. Revisá y confirmá la advertencia."
              : "El destino está comprometido para grupos confirmados.",
          ),
          { statusCode: 409, code: inventory.code, warning: inventory },
        );
      const [origin] = await db
        .select()
        .from(rooms)
        .where(eq(rooms.id, r.roomId));
      const inHouse = r.status === "checked_in",
        now = new Date();
      const history = inHouse
        ? historyAfterMove(
            r,
            preview.reservation.from,
            origin?.roomTypeId || r.roomTypeId,
          )
        : r.roomHistory;
      const preparation = r.housekeepingPreparation
        ? {
            ...r.housekeepingPreparation,
            state: "review" as const,
            previousRoomId: r.roomId,
            roomId: choice.id,
            movedAt: now.toISOString(),
            movedBy: actor.username,
          }
        : null;
      // Room-only update. Do not invoke billing/checkout, duplicate a reservation,
      // touch nightly prices, group funding, payments, folios, or fiscal documents.
      await db
        .update(reservations)
        .set({
          roomId: choice.id,
          roomHistory: history,
          movedFromRoomNumber: inHouse
            ? r.movedFromRoomNumber || origin?.roomNumber
            : r.movedFromRoomNumber,
          housekeepingPreparation: preparation,
          housekeepingBedPreparation: null,
          lastModifiedBy: actor.id,
        })
        .where(eq(reservations.id, id));
      if (inHouse) {
        const other = (
          await db.execute(
            sql`SELECT id FROM reservations WHERE room_id=${r.roomId} AND status='checked_in' AND id<>${id} LIMIT 1`,
          )
        ).rows;
        if (origin && isOperationalInventoryRoom(origin) && !other.length)
          await db
            .update(rooms)
            .set({ status: "dirty" })
            .where(eq(rooms.id, r.roomId));
        await db
          .update(rooms)
          .set({ status: "occupied" })
          .where(eq(rooms.id, choice.id));
      }
      if (bedReview || preparation) {
        await db.insert(housekeepingTasks).values({
          roomId: choice.id,
          taskType: "inspection",
          status: "pending",
          priority: "high",
          scheduledDate: preview.reservation.from,
          notes: `Reubicar ${preview.reservation.room} → ${choice.roomNumber}. Revisar camaje: ${preview.reservation.requestedBed}. ${r.bedTypeNotes || ""} ${preparation?.note || ""}`,
          createdAt: now,
        } as any);
      }
      const description = `Reubicar: Hab. ${preview.reservation.room} → ${choice.roomNumber}; desde ${preview.reservation.from} hasta ${r.checkOutDate}. Motivo: ${input.reason}. Se conserva la tarifa acordada.`;
      await db.insert(reservationChangelog).values({
        reservationId: id,
        operador: actor.username,
        tipo: "habitacion",
        descripcion: description,
      });
      await db.insert(auditLogs).values({
        userId: actor.id,
        userName: actor.username,
        action: "update",
        module: "reservations",
        entityType: "reservation",
        entityId: id,
        description,
        details: JSON.stringify({
          operationId: input.operationId,
          fromRoomId: r.roomId,
          toRoomId: choice.id,
          from: preview.reservation.from,
          to: r.checkOutDate,
          reason: input.reason,
          history,
          preparationAcknowledged: input.acknowledgePreparation,
          bedAcknowledged: input.acknowledgeBedChange,
        }),
        timestamp: now,
      });
      const result = {
        id,
        roomId: choice.id,
        roomNumber: choice.roomNumber,
        from: preview.reservation.from,
        to: r.checkOutDate,
      };
      await db.insert(reservationRelocations).values({
        operationId: input.operationId,
        reservationId: id,
        requestHash,
        result,
      });
      return result;
    }),
  );
}
export function registerRelocationRoutes(app: Express) {
  const access = [requireAuth, requirePermission("sidebar:/reservations")];
  app.use("/api/relocations", (_req, res, next) =>
    getAppEnv() === "production"
      ? res.status(404).json({ error: "No disponible." })
      : next(),
  );
  const error = (res: any, e: any) =>
    res.status(e.statusCode || 500).json({
      error: e.statusCode ? e.message : "No se pudo completar la reubicación.",
      code: e.code,
      warning: e.warning,
    });
  app.get("/api/relocations/search", ...access, async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length > 100)
        return res
          .status(400)
          .json({ error: "La búsqueda es demasiado larga." });
      res.json(await relocationSearch(q));
    } catch (e) {
      error(res, e);
    }
  });
  app.get("/api/relocations/:id", ...access, async (req, res) => {
    try {
      res.json(await previewRelocation(req.params.id));
    } catch (e) {
      error(res, e);
    }
  });
  app.post("/api/relocations/:id", ...access, async (req, res) => {
    const parsed = relocationRequest.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error:
          "Revisá el destino y escribí un motivo de al menos 5 caracteres.",
      });
    try {
      res.json(
        await relocateReservation(req.params.id, parsed.data, {
          id: req.user!.id,
          username: req.user!.username,
        }),
      );
    } catch (e) {
      error(res, e);
    }
  });
}
