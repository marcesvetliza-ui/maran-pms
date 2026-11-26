import { sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { db } from "./db";
import { BookingRuleError, type BookingPlan, type BookingOtaVariantConfig, type BookingOtaSourceSummary } from "@shared/booking-engine";
import { inventoryPreview, buildAriValues } from "./channex/ari";
import { validateRoomSelections } from "./channex/roomSelection";
import { calendarAddDays } from "@shared/rate-calendar";

/** Narrow bridge for our existing, trusted PostgreSQL SELECT readers. Values
 * remain bound parameters in the caller's Drizzle transaction, not interpolated
 * SQL. No user-supplied SQL or separate connection is accepted here. */
export const bookingChannelReader = {
  async query(text: string, values: unknown[] = []) {
    if (!/^\s*(SELECT|WITH)\b/i.test(text)) throw Error("El lector de inventario sólo admite consultas");
    const query = sql.empty();
    let offset = 0;
    for (const match of text.matchAll(/\$(\d+)/g)) {
      const index = Number(match[1]) - 1;
      if (index < 0 || index >= values.length) throw Error("Parámetro de inventario inválido");
      query.append(sql.raw(text.slice(offset, match.index)));
      query.append(sql`${sql.param(values[index])}`);
      offset = match.index! + match[0].length;
    }
    query.append(sql.raw(text.slice(offset)));
    return db.execute(query);
  },
} as Pick<PoolClient, "query">;

export type BookingScopeRoom = {
  id: string; roomNumber: string; roomTypeId: string; roomTypeName: string;
  channexRoomTypeId: string; floor: number | null; status: string;
};
export type BookingChannelPlan = BookingPlan & {
  name: string; channex_room_type_id: string;
  sell_mode: string | null; rate_mode: string | null; occupancies: number[] | null;
};
export type BookingOtaSource = {
  connection: { id: string; label: string; environment: string; base_url: string; channex_property_id: string; is_active: boolean; floor: number | null; room_ids: string[] | null; enabled: boolean; exchange_rate: string | null };
  sourceMode: "automatic" | "selected";
  rooms: BookingScopeRoom[];
  mappings: Array<{ remoteId: string; title: string; roomTypeId: string }>;
  plans: BookingChannelPlan[];
};
export type BookingVariant = BookingOtaVariantConfig;
export function isRealBookingConnection(connection: { environment: string; base_url: string }) {
  try {
    const url = new URL(connection.base_url);
    return connection.environment === "real" && url.origin === "https://app.channex.io" &&
      url.pathname.replace(/\/$/, "") === "/api/v1" && !url.search && !url.hash;
  } catch { return false; }
}
export async function bookingOtaConnections() {
  const rows = (await db.execute(sql`SELECT id,label,environment,base_url,channex_property_id,is_active FROM channex_connections ORDER BY created_at,id`)).rows as any[];
  return rows.filter(isRealBookingConnection);
}
export async function bookingOtaAdminSummary() {
  const configured = (await db.execute(sql`SELECT connection_id FROM booking_engine_ota_source WHERE singleton=true`)).rows[0] as any;
  const connections = (await bookingOtaConnections()).map(connection => ({ id: connection.id, label: connection.label }));
  try {
    const source = await loadBookingOtaSource();
    const summary: BookingOtaSourceSummary = {
      configuredConnectionId: configured?.connection_id || null,
      connectionId: source.connection.id, label: source.connection.label,
      sourceMode: source.sourceMode, paused: !source.connection.enabled || !source.connection.is_active,
      roomCount: source.rooms.length, error: null, connections,
    };
    return { summary, source };
  } catch (error) {
    if (!(error instanceof BookingRuleError)) throw error;
    const summary: BookingOtaSourceSummary = {
      configuredConnectionId: configured?.connection_id || null, connectionId: null, label: null,
      sourceMode: "unavailable", paused: false, roomCount: 0, error: error.message, connections,
    };
    return { summary, source: null };
  }
}
export async function loadBookingOtaSource(lock = false): Promise<BookingOtaSource> {
  const binding = (await db.execute(sql`SELECT connection_id FROM booking_engine_ota_source WHERE singleton=true ${lock ? sql`FOR SHARE` : sql``}`)).rows[0] as any;
  const candidates = await bookingOtaConnections();
  const candidate = binding?.connection_id ? candidates.find(c => c.id === binding.connection_id) : candidates.length === 1 ? candidates[0] : null;
  if (!candidate) throw new BookingRuleError("Elegí la conexión real de OTAs que compartirá habitaciones y restricciones con el motor");
  const inboundReady = (await db.execute(sql`SELECT to_regclass('channex_inbound_settings') IS NOT NULL AS present`)).rows[0] as any;
  const connection = (await db.execute(sql`SELECT c.id,c.label,c.environment,c.base_url,c.channex_property_id,c.is_active,
    s.floor,s.room_ids,s.enabled,${inboundReady?.present ? sql`i.settlement_exchange_rate::text` : sql`NULL::text`} AS exchange_rate
    FROM channex_connections c JOIN channex_ari_settings s ON s.connection_id=c.id
    ${inboundReady?.present ? sql`LEFT JOIN channex_inbound_settings i ON i.connection_id=c.id` : sql``} WHERE c.id=${candidate.id}
    ${lock ? sql`FOR SHARE OF c,s` : sql``}`)).rows[0] as BookingOtaSource["connection"] | undefined;
  if (!connection || !isRealBookingConnection(connection)) throw new BookingRuleError("Revisá el alcance de la conexión real de OTAs");
  try { await validateRoomSelections(bookingChannelReader, connection.id, connection.floor, true, connection.room_ids); }
  catch (error) { throw new BookingRuleError(error instanceof Error ? error.message : "Revisá las habitaciones seleccionadas en OTAs"); }
  const rooms = (await inventoryPreview(bookingChannelReader, connection.id, connection.floor, connection.room_ids)).filter((room: any) => room.channexRoomTypeId) as BookingScopeRoom[];
  const mappings = (await db.execute(sql`SELECT channex_room_type_id AS "remoteId",channex_room_type_title AS title,room_type_id AS "roomTypeId"
    FROM channex_room_type_mappings WHERE connection_id=${connection.id}`)).rows as BookingOtaSource["mappings"];
  const plans = (await db.execute(sql`SELECT p.*,p.valid_from::text,p.valid_to::text,m.channex_room_type_id,m.sell_mode,m.rate_mode,m.occupancies
    FROM channex_rate_plan_mappings m JOIN rate_plans p ON p.id=m.rate_plan_id
    WHERE m.connection_id=${connection.id} AND m.remote_present AND m.rate_mode IS DISTINCT FROM 'derived'
    ORDER BY p.id,m.id`)).rows as BookingChannelPlan[];
  return { connection, sourceMode: binding?.connection_id ? "selected" : "automatic", rooms, mappings, plans };
}

export function bookingCategoryVariants(source: BookingOtaSource, roomTypeId: string, ownPlanId: string | null, references: Record<string, string> = {}): BookingVariant[] {
  const rooms = source.rooms.filter(room => room.roomTypeId === roomTypeId);
  return [...new Set(rooms.map(room => room.channexRoomTypeId))].sort().map(id => {
    const pool = rooms.filter(room => room.channexRoomTypeId === id);
    const plans = [...new Map(source.plans.filter(plan => plan.channex_room_type_id === id && plan.room_type_id === roomTypeId).map(plan => [plan.id, plan])).values()];
    const chosen = references[id] ? plans.find(plan => plan.id === references[id])
      : plans.find(plan => plan.id === ownPlanId) || (plans.length === 1 ? plans[0] : undefined);
    return {
      id, name: source.mappings.find(mapping => mapping.remoteId === id)?.title || pool[0].roomTypeName,
      roomIds: pool.map(room => room.id), roomNumbers: pool.map(room => room.roomNumber),
      planId: chosen?.id || null, planName: chosen?.name || null,
      plans: plans.map(plan => ({ id: plan.id, name: plan.name, currency: plan.currency })),
      error: chosen ? (!['per_room','per_person'].includes(chosen.sell_mode || '') || (chosen.sell_mode === 'per_person' &&
        (chosen.rate_mode !== 'manual' || !chosen.occupancies?.length || new Set(chosen.occupancies).size !== chosen.occupancies.length ||
          chosen.occupancies.some(n => !Number.isInteger(n) || n < 1 || n > 4)))
        ? "Actualizá el catálogo y verificá la modalidad y ocupaciones del plan en OTAs" : null) : references[id] ? "El plan de referencia ya no está mapeado en esta variante de OTAs"
        : plans.length ? "Elegí el plan de referencia de esta variante" : "Falta un plan mapeado y vigente en OTAs para esta variante",
    };
  });
}

/** Use the existing OTA availability calculator as a read-only projection. The
 * requested arrival starts its bounded window; there is no dispatch or outbox
 * write, and a technical pause never changes the selected rooms. */
export async function bookingOtaQuotas(source: BookingOtaSource, stay: { checkIn: string; checkOut: string }) {
  try {
    const values = await buildAriValues(bookingChannelReader, source.connection, [{
      id: "booking-read-only", kind: "availability", date_from: stay.checkIn, date_to: calendarAddDays(stay.checkOut, -1),
      room_type_id: null, rate_plan_id: null, attempts: 0,
    }], stay.checkIn);
    const quotas = new Map<string, number>();
    for (const value of values) {
      const id = String(value.room_type_id);
      quotas.set(id, Math.min(quotas.get(id) ?? Infinity, Number(value.availability)));
    }
    return quotas;
  } catch (error) { throw new BookingRuleError(error instanceof Error ? error.message : "El inventario compartido requiere revisión"); }
}
