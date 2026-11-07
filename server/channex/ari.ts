import type { PoolClient } from "pg";
import { validateRoomSelections, RoomSelectionError } from "./roomSelection";
import { calendarEffective, MAX_CALENDAR_CELLS } from "@shared/rate-calendar";

export type AriEvent = { id: string; kind: 'availability' | 'restrictions'; date_from: string; date_to: string; room_type_id: string | null; rate_plan_id: string | null; attempts: number; reason?: string; changed_fields?: string[] | null };
export type AriValue = { property_id: string; date_from: string; date_to: string;[key: string]: string | number | boolean };
export class AriConfigurationError extends Error { }
export const STAGING_URL = 'https://staging.channex.io/api/v1';
export const ARI_CALL_INTERVAL_MS = 6100; // Conservative global spacing: <=10 ARI calls/minute, hence <=10 per endpoint/property.
export function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || addDays(from, 0) !== from || addDays(to, 0) !== to || to < from) throw Error('Intervalo inválido');
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { if (days.length >= 500) throw Error('El horizonte máximo es de 500 días'); days.push(d); }
  return days;
}
export function retryDelay(attempt: number, retryAfter: string | null, now = Date.now(), random = Math.random) {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter || '') - now;
  return Math.max(60000, Number.isFinite(requested) ? Math.max(0, requested) : 0, Math.min(3600000, 60000 * 2 ** Math.min(attempt, 10)) * (1 + random() * .2));
}
export function compressValues(values: AriValue[]): AriValue[] {
  const result: AriValue[] = [];
  for (const value of values) {
    const prev = result[result.length - 1];
    const identity = ({ date_from, date_to, ...rest }: AriValue) => JSON.stringify(rest);
    if (prev && addDays(prev.date_to, 1) === value.date_from && value.date_to <= addDays(prev.date_from, 499) && identity(prev) === identity(value)) prev.date_to = value.date_to;
    else result.push({ ...value });
  }
  return result;
}
export async function inventoryPreview(c: Pick<PoolClient, 'query'>, connectionId: string, floor: number|null) {
  const { rows } = await c.query(`SELECT r.id,r.room_number AS "roomNumber",r.floor,r.room_type_id AS "roomTypeId",rt.name AS "roomTypeName",r.status,
   m.channex_room_type_id AS "channexRoomTypeId"
   FROM rooms r LEFT JOIN room_types rt ON rt.id=r.room_type_id
   LEFT JOIN channex_room_type_mappings m ON m.connection_id=$1 AND m.room_type_id=r.room_type_id AND (m.room_ids IS NULL OR r.id=ANY(m.room_ids))
   WHERE (($2::int IS NULL AND r.floor IS DISTINCT FROM 99) OR r.floor=$2) AND r.is_active AND NOT COALESCE(r.is_virtual,false) AND r.room_number<>'REUB'
   ORDER BY r.room_number::text`, [connectionId, floor]);
  return rows;
}
/** Recomputes current absolute values only for affected dates/types, never scans for changes. */
export async function buildAriValues(c: Pick<PoolClient, 'query'>, connection: any, events: AriEvent[], today: string): Promise<AriValue[]> {
  const horizonEnd = addDays(today, 499);
  // The rolling full sync is 500 days. An explicit calendar edit can start
  // later; keep its bounded period instead of silently truncating it.
  const dateSet = new Set<string>();
  for (const e of events) {
    const explicitCalendar = e.kind === 'restrictions' && e.reason?.startsWith('rate_calendar:');
    const from = e.date_from < today ? today : e.date_from;
    const to = explicitCalendar || e.date_to <= horizonEnd ? e.date_to : horizonEnd;
    if (to < from) continue;
    for (const day of daysBetween(from, to)) {
      dateSet.add(day);
      if (dateSet.size > MAX_CALENDAR_CELLS + 500) throw new AriConfigurationError('El lote supera el máximo de fechas admitidas; revisá los cambios de calendario antes de reenviar');
    }
  }
  const dates = [...dateSet].sort();
  if (!dates.length) return [];
  let mappings: any[];
  try { mappings = await validateRoomSelections(c, connection.id, connection.floor); }
  catch (error) { if (error instanceof RoomSelectionError) throw new AriConfigurationError(error.message); throw error; }
  const affected = (typeId: string, day: string, planId?: string) => events.some(e => e.date_from <= day && e.date_to >= day && (!e.room_type_id || e.room_type_id === typeId) && (!e.rate_plan_id || !planId || e.rate_plan_id === planId));
  const values: AriValue[] = [];
  if (events[0].kind === 'availability') {
    const rows = (await c.query(`WITH dates AS (SELECT unnest($3::date[]) AS day),
   blocked_groups AS (
    SELECT g.id,b.room_type_id,d.day,sum(b.quantity)::int AS quantity FROM groups g
    JOIN group_room_blocks b ON b.group_id=g.id CROSS JOIN dates d
    WHERE g.status IN ('tentative','blocked','confirmed','inhouse')
      AND d.day>=COALESCE(b.block_check_in_date,g.check_in_date)
      AND d.day<COALESCE(b.block_check_out_date,g.check_out_date)
    GROUP BY g.id,b.room_type_id,d.day
   ), unassigned AS (
    SELECT b.room_type_id,b.day,sum(GREATEST(0,b.quantity-(SELECT count(DISTINCT r.id) FROM reservations r
      JOIN group_reservation_links l ON l.reservation_id=r.id JOIN rooms rm ON rm.id=r.room_id
      WHERE l.group_id=b.id AND rm.room_type_id=b.room_type_id AND NOT COALESCE(rm.is_virtual,false) AND rm.room_number<>'REUB'
      AND r.status IN ('tentative','pending','reserved','confirmed','web_checkin','checked_in')
      AND r.check_in_date<=b.day AND r.check_out_date>b.day)))::int AS quantity
    FROM blocked_groups b GROUP BY b.room_type_id,b.day
   )
   SELECT m.room_type_id,m.channex_room_type_id,d.day::text,
    GREATEST(0,(SELECT count(*) FROM rooms r WHERE (($2::int IS NULL AND r.floor IS DISTINCT FROM 99) OR r.floor=$2) AND r.room_type_id=m.room_type_id AND (m.room_ids IS NULL OR r.id=ANY(m.room_ids))
      AND r.is_active AND NOT COALESCE(r.is_virtual,false) AND r.room_number<>'REUB' AND r.status NOT IN ('maintenance','oos')
      AND NOT EXISTS(SELECT 1 FROM reservations b WHERE b.room_id=r.id AND b.status IN ('tentative','pending','reserved','confirmed','web_checkin','checked_in') AND b.check_in_date<=d.day AND b.check_out_date>d.day)
      AND NOT EXISTS(SELECT 1 FROM maintenance_blocks b WHERE b.room_id=r.id AND b.block_from<=d.day AND b.block_to>=d.day)
    )-COALESCE(u.quantity,0))::int AS availability
   FROM channex_room_type_mappings m CROSS JOIN dates d
   LEFT JOIN unassigned u ON u.room_type_id=m.room_type_id AND u.day=d.day
   WHERE m.connection_id=$1 ORDER BY m.channex_room_type_id,d.day`, [connection.id, connection.floor, dates])).rows;
    for (const r of rows) if (affected(r.room_type_id, r.day)) values.push({ property_id: connection.channex_property_id, room_type_id: r.channex_room_type_id, date_from: r.day, date_to: r.day, availability: r.availability });
  } else {
    const plans = (await c.query(`SELECT m.channex_rate_plan_id,m.channex_room_type_id,m.rate_plan_id,m.sell_mode,p.room_type_id,p.base_rate,p.currency,p.valid_from::text,p.valid_to::text
    FROM channex_rate_plan_mappings m LEFT JOIN rate_plans p ON p.id=m.rate_plan_id WHERE m.connection_id=$1 ORDER BY m.channex_rate_plan_id`, [connection.id])).rows;
    if (!plans.length) throw new AriConfigurationError('Falta mapear los planes tarifarios');
    const overrides = (await c.query('SELECT *,stay_date::text AS day FROM rate_calendar_entries WHERE rate_plan_id=ANY($1::varchar[]) AND stay_date=ANY($2::date[])', [plans.map(p => p.rate_plan_id).filter(Boolean), dates])).rows;
    const byDay = new Map(overrides.map(o => [`${o.rate_plan_id}:${o.day}`, o]));
    for (const p of plans) {
      if (p.sell_mode === 'per_person') throw new AriConfigurationError('El plan de Channex usa precios por ocupación. Falta configurar y verificar su envío desde Maran; no se enviará una tarifa única por habitación.');
      if (connection.environment === 'real' && p.sell_mode !== 'per_room') throw new AriConfigurationError('Actualizá el catálogo y verificá la modalidad de precio del plan antes de publicar en producción');
      const room = mappings.find(m => m.channex_room_type_id === p.channex_room_type_id);
      if (!room || p.room_type_id !== room.room_type_id || !p.rate_plan_id) throw new AriConfigurationError('El plan tarifario no coincide con su categoría mapeada');
      for (const day of dates) if (affected(p.room_type_id, day, p.rate_plan_id)) {
        if (p.currency !== connection.currency) throw new AriConfigurationError('La moneda del plan debe coincidir con la moneda configurada para Channex');
        const calendar = calendarEffective({ id: p.rate_plan_id, base_rate: p.base_rate, currency: p.currency }, day, byDay.get(`${p.rate_plan_id}:${day}`));
        if ((p.valid_from && day < p.valid_from) || (p.valid_to && day > p.valid_to) || !/^\d+(\.\d{1,2})?$/.test(calendar.rate) || Number(calendar.rate) <= 0) throw new AriConfigurationError('Falta una tarifa vigente y positiva para las fechas a publicar');
        values.push({
          property_id: connection.channex_property_id, rate_plan_id: p.channex_rate_plan_id, date_from: day, date_to: day, rate: calendar.rate,
          min_stay_arrival: calendar.minStayArrival, min_stay_through: calendar.minStayArrival, max_stay: calendar.maxStay,
          stop_sell: calendar.stopSell, closed_to_arrival: calendar.closedToArrival, closed_to_departure: calendar.closedToDeparture
        });
      }
    }
  }
  return compressValues(values);
}

/** Absolute values for changed fields only. Unknown fields are never marked as published. */
export function ariDelta(current: AriValue, previous: AriValue | undefined, fields?: string[] | null, full = false): AriValue | null {
  const identity = new Set(['property_id', 'room_type_id', 'rate_plan_id', 'date_from', 'date_to']);
  const delta: AriValue = { property_id: current.property_id, date_from: current.date_from, date_to: current.date_to };
  if (current.room_type_id !== undefined) delta.room_type_id = current.room_type_id;
  if (current.rate_plan_id !== undefined) delta.rate_plan_id = current.rate_plan_id;
  let changed = false;
  const selected = fields == null ? null : new Set(fields);
  if (selected?.has('min_stay_arrival') || selected?.has('min_stay_through')) {
    selected.add('min_stay_arrival'); selected.add('min_stay_through');
  }
  const minChanged = current.min_stay_arrival !== previous?.min_stay_arrival || current.min_stay_through !== previous?.min_stay_through;
  for (const [key, value] of Object.entries(current)) {
    if (identity.has(key) || (!full && selected && !selected.has(key))) continue;
    const isMin = key === 'min_stay_arrival' || key === 'min_stay_through';
    if (full || (isMin ? minChanged : value !== previous?.[key])) { delta[key] = value; changed = true; }
  }
  return changed ? delta : null;
}
