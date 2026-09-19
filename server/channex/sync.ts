import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  channexBookings,
  channexConnections,
  channexRatePlanMappings,
  channexRoomTypeMappings,
  roomTypes,
  ratePlans,
  type ChannexBooking,
  type ChannexConnection,
} from "@shared/schema";
import {
  acknowledgeBookingRevision,
  ChannexApiError,
  fetchChannexBooking,
  fetchChannexRatePlans,
  fetchChannexRoomTypes,
  fetchPendingBookingRevisions,
} from "./client";

const SENSITIVE_KEY_PATTERN = /card|cvv|cvc|guarantee/i;

/** Nunca guardamos datos de tarjeta/garantía tal cual llegan de Channex. */
function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redactado]" : redactSensitive(val);
    }
    return out;
  }
  return value;
}

function toCredentials(connection: ChannexConnection) {
  return { apiKey: connection.apiKey, baseUrl: connection.baseUrl };
}

async function getConnectionOrThrow(connectionId: string): Promise<ChannexConnection> {
  const [connection] = await db.select().from(channexConnections).where(eq(channexConnections.id, connectionId));
  if (!connection) throw new Error("Conexión de Channex no encontrada");
  return connection;
}

export async function syncCatalog(connectionId: string) {
  const connection = await getConnectionOrThrow(connectionId);
  const credentials = toCredentials(connection);

  const [remoteRoomTypes, remoteRatePlans] = await Promise.all([
    fetchChannexRoomTypes(credentials, connection.channexPropertyId),
    fetchChannexRatePlans(credentials, connection.channexPropertyId),
  ]);

  for (const item of remoteRoomTypes) {
    const channexRoomTypeId = item.id as string;
    const title = item.attributes?.title ?? channexRoomTypeId;
    const [existing] = await db
      .select()
      .from(channexRoomTypeMappings)
      .where(and(eq(channexRoomTypeMappings.connectionId, connectionId), eq(channexRoomTypeMappings.channexRoomTypeId, channexRoomTypeId)));
    if (existing) {
      await db
        .update(channexRoomTypeMappings)
        .set({ channexRoomTypeTitle: title })
        .where(eq(channexRoomTypeMappings.id, existing.id));
    } else {
      await db.insert(channexRoomTypeMappings).values({
        connectionId,
        channexRoomTypeId,
        channexRoomTypeTitle: title,
        roomTypeId: null,
        createdAt: new Date(),
      });
    }
  }

  for (const item of remoteRatePlans) {
    const channexRatePlanId = item.id as string;
    const title = item.attributes?.title ?? channexRatePlanId;
    const channexRoomTypeId = item.relationships?.room_type?.data?.id ?? null;
    if (!channexRoomTypeId) continue; // no podemos mapear una tarifa sin saber a qué habitación pertenece
    const [existing] = await db
      .select()
      .from(channexRatePlanMappings)
      .where(and(eq(channexRatePlanMappings.connectionId, connectionId), eq(channexRatePlanMappings.channexRatePlanId, channexRatePlanId)));
    if (existing) {
      await db
        .update(channexRatePlanMappings)
        .set({ channexRatePlanTitle: title, channexRoomTypeId })
        .where(eq(channexRatePlanMappings.id, existing.id));
    } else {
      await db.insert(channexRatePlanMappings).values({
        connectionId,
        channexRatePlanId,
        channexRatePlanTitle: title,
        channexRoomTypeId,
        ratePlanId: null,
        createdAt: new Date(),
      });
    }
  }

  await db
    .update(channexConnections)
    .set({ lastCatalogSyncAt: new Date() })
    .where(eq(channexConnections.id, connectionId));

  return {
    roomTypes: remoteRoomTypes.length,
    ratePlans: remoteRatePlans.length,
  };
}

async function isMapped(connectionId: string, channexRoomTypeId: string | null, channexRatePlanId: string | null): Promise<boolean> {
  if (!channexRoomTypeId || !channexRatePlanId) return false;
  const [roomTypeMapping] = await db
    .select()
    .from(channexRoomTypeMappings)
    .where(and(eq(channexRoomTypeMappings.connectionId, connectionId), eq(channexRoomTypeMappings.channexRoomTypeId, channexRoomTypeId)));
  const [ratePlanMapping] = await db
    .select()
    .from(channexRatePlanMappings)
    .where(and(eq(channexRatePlanMappings.connectionId, connectionId), eq(channexRatePlanMappings.channexRatePlanId, channexRatePlanId)));
  return Boolean(roomTypeMapping?.roomTypeId) && Boolean(ratePlanMapping?.ratePlanId);
}

type ExtractedBooking = {
  channexBookingId: string;
  otaName: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  currency: string | null;
  totalAmount: string | null;
  channexRoomTypeId: string | null;
  channexRatePlanId: string | null;
  multiRoom: boolean;
  isCancelled: boolean;
  rawPayload: unknown;
};

/**
 * Los nombres de campo de `attributes.customer`/`attributes.occupancy` no se
 * pudieron confirmar contra la API real (la validación manual solo mostró
 * una versión recortada). Se prueban varios alias razonables; lo que no
 * aparezca queda null y es visible en rawPayload para revisar a mano.
 */
function extractBookingFields(item: any): ExtractedBooking {
  const a = item.attributes ?? {};
  const rooms: any[] = Array.isArray(a.rooms) ? a.rooms : [];
  const singleRoom = rooms.length === 1 ? rooms[0] : null;
  const customer = a.customer ?? a.guest ?? {};
  const occupancy = a.occupancy ?? singleRoom?.occupancy ?? {};

  const guestName =
    customer.name ??
    [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() ??
    null;

  return {
    channexBookingId: String(a.booking_id ?? item.id),
    otaName: a.ota_name ?? null,
    guestName: guestName || null,
    guestEmail: customer.mail ?? customer.email ?? null,
    guestPhone: customer.phone ?? null,
    arrivalDate: a.arrival_date ?? null,
    departureDate: a.departure_date ?? null,
    adults: occupancy.adults ?? null,
    children: occupancy.children ?? null,
    infants: occupancy.infants ?? null,
    currency: a.currency ?? null,
    totalAmount: a.amount != null ? String(a.amount) : null,
    channexRoomTypeId: singleRoom?.room_type_id ?? null,
    channexRatePlanId: singleRoom?.rate_plan_id ?? null,
    multiRoom: rooms.length > 1,
    isCancelled: a.status === "cancelled" || Boolean(singleRoom?.is_cancelled),
    rawPayload: redactSensitive(a),
  };
}

export type BookingSyncSummary = {
  fetched: number;
  created: number;
  updated: number;
  ackFailures: number;
};

export async function syncBookings(connectionId: string): Promise<BookingSyncSummary> {
  const connection = await getConnectionOrThrow(connectionId);
  const credentials = toCredentials(connection);
  const revisions = await fetchPendingBookingRevisions(credentials, connection.channexPropertyId);

  const summary: BookingSyncSummary = { fetched: revisions.length, created: 0, updated: 0, ackFailures: 0 };

  for (const revision of revisions) {
    const extracted = extractBookingFields(revision);
    const [existing] = await db
      .select()
      .from(channexBookings)
      .where(and(eq(channexBookings.connectionId, connectionId), eq(channexBookings.channexBookingId, extracted.channexBookingId)));

    const mapped = extracted.multiRoom
      ? false
      : await isMapped(connectionId, extracted.channexRoomTypeId, extracted.channexRatePlanId);

    let status: ChannexBooking["status"];
    if (extracted.isCancelled) {
      status = "cancelled";
    } else if (extracted.multiRoom) {
      status = "needs_review";
    } else if (existing?.status === "imported") {
      status = "modified";
    } else if (existing) {
      status = existing.status === "needs_review" || existing.status === "error" ? existing.status : "new";
    } else {
      status = "new";
    }

    const errorMessage = extracted.multiRoom
      ? "Reserva con varias habitaciones — revisar manualmente, no se puede mapear automáticamente."
      : null;

    const values = {
      connectionId,
      channexBookingId: extracted.channexBookingId,
      channexRevisionId: revision.id as string,
      status,
      otaName: extracted.otaName,
      guestName: extracted.guestName,
      guestEmail: extracted.guestEmail,
      guestPhone: extracted.guestPhone,
      arrivalDate: extracted.arrivalDate,
      departureDate: extracted.departureDate,
      adults: extracted.adults,
      children: extracted.children,
      infants: extracted.infants,
      currency: extracted.currency,
      totalAmount: extracted.totalAmount,
      channexRoomTypeId: extracted.channexRoomTypeId,
      channexRatePlanId: extracted.channexRatePlanId,
      isMapped: mapped,
      rawPayload: extracted.rawPayload,
      errorMessage,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(channexBookings).set(values).where(eq(channexBookings.id, existing.id));
      summary.updated += 1;
    } else {
      await db.insert(channexBookings).values({ ...values, createdAt: new Date() });
      summary.created += 1;
    }

    try {
      await acknowledgeBookingRevision(credentials, revision.id as string);
    } catch (err) {
      summary.ackFailures += 1;
      const note = err instanceof ChannexApiError
        ? `No se pudo confirmar la recepción a Channex (ack): ${err.message}`
        : `No se pudo confirmar la recepción a Channex (ack): ${(err as Error).message}`;
      await db
        .update(channexBookings)
        .set({ errorMessage: [errorMessage, note].filter(Boolean).join(" | "), updatedAt: new Date() })
        .where(and(eq(channexBookings.connectionId, connectionId), eq(channexBookings.channexBookingId, extracted.channexBookingId)));
    }
  }

  await db.update(channexConnections).set({ lastBookingSyncAt: new Date() }).where(eq(channexConnections.id, connectionId));

  return summary;
}

export async function retryBooking(bookingRowId: string): Promise<ChannexBooking> {
  const [row] = await db.select().from(channexBookings).where(eq(channexBookings.id, bookingRowId));
  if (!row) throw new Error("Reserva de Channex no encontrada");
  const connection = await getConnectionOrThrow(row.connectionId);
  const credentials = toCredentials(connection);

  const remote = await fetchChannexBooking(credentials, row.channexBookingId);
  if (!remote) throw new Error("Channex no devolvió esa reserva");

  const extracted = extractBookingFields(remote);
  const mapped = extracted.multiRoom
    ? false
    : await isMapped(row.connectionId, extracted.channexRoomTypeId, extracted.channexRatePlanId);

  const status: ChannexBooking["status"] = extracted.isCancelled
    ? "cancelled"
    : extracted.multiRoom
    ? "needs_review"
    : row.status === "imported"
    ? "modified"
    : "new";

  const [updated] = await db
    .update(channexBookings)
    .set({
      channexRevisionId: remote.id as string,
      status,
      otaName: extracted.otaName,
      guestName: extracted.guestName,
      guestEmail: extracted.guestEmail,
      guestPhone: extracted.guestPhone,
      arrivalDate: extracted.arrivalDate,
      departureDate: extracted.departureDate,
      adults: extracted.adults,
      children: extracted.children,
      infants: extracted.infants,
      currency: extracted.currency,
      totalAmount: extracted.totalAmount,
      channexRoomTypeId: extracted.channexRoomTypeId,
      channexRatePlanId: extracted.channexRatePlanId,
      isMapped: mapped,
      rawPayload: extracted.rawPayload,
      errorMessage: extracted.multiRoom
        ? "Reserva con varias habitaciones — revisar manualmente, no se puede mapear automáticamente."
        : null,
      updatedAt: new Date(),
    })
    .where(eq(channexBookings.id, bookingRowId))
    .returning();

  return updated;
}

export type ImportPreview = {
  booking: ChannexBooking;
  roomTypeName: string;
  ratePlanName: string;
};

export async function importBooking(bookingRowId: string, actor: string): Promise<ImportPreview> {
  const [row] = await db.select().from(channexBookings).where(eq(channexBookings.id, bookingRowId));
  if (!row) throw new Error("Reserva de Channex no encontrada");
  if (row.status === "cancelled") throw new Error("No se puede importar una reserva cancelada");
  if (!row.channexRoomTypeId || !row.channexRatePlanId) {
    throw new Error("Reserva con varias habitaciones u otro dato faltante — revisar manualmente antes de importar");
  }

  const [roomTypeMapping] = await db
    .select()
    .from(channexRoomTypeMappings)
    .where(and(eq(channexRoomTypeMappings.connectionId, row.connectionId), eq(channexRoomTypeMappings.channexRoomTypeId, row.channexRoomTypeId)));
  const [ratePlanMapping] = await db
    .select()
    .from(channexRatePlanMappings)
    .where(and(eq(channexRatePlanMappings.connectionId, row.connectionId), eq(channexRatePlanMappings.channexRatePlanId, row.channexRatePlanId)));

  if (!roomTypeMapping?.roomTypeId || !ratePlanMapping?.ratePlanId) {
    throw new Error("Faltan mapeos de habitación y/o tarifa para esta reserva — completalos en 'Mapeo' antes de importar");
  }

  const [roomType] = await db.select().from(roomTypes).where(eq(roomTypes.id, roomTypeMapping.roomTypeId));
  const [ratePlan] = await db.select().from(ratePlans).where(eq(ratePlans.id, ratePlanMapping.ratePlanId));

  const [updated] = await db
    .update(channexBookings)
    .set({ status: "imported", importedAt: new Date(), importedBy: actor, errorMessage: null, updatedAt: new Date() })
    .where(eq(channexBookings.id, bookingRowId))
    .returning();

  return {
    booking: updated,
    roomTypeName: roomType?.name ?? "(habitación no encontrada)",
    ratePlanName: ratePlan?.name ?? "(tarifa no encontrada)",
  };
}

export async function markForReview(bookingRowId: string): Promise<ChannexBooking> {
  const [updated] = await db
    .update(channexBookings)
    .set({ status: "needs_review", updatedAt: new Date() })
    .where(eq(channexBookings.id, bookingRowId))
    .returning();
  if (!updated) throw new Error("Reserva de Channex no encontrada");
  return updated;
}
