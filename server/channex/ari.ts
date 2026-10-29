import type { PoolClient } from "pg";

export type AriEvent = { id: string; kind: 'availability' | 'restrictions'; date_from: string; date_to: string; room_type_id: string | null; rate_plan_id: string | null; attempts: number };
export type AriValue = { property_id: string; date_from: string; date_to: string;[key: string]: string | number | boolean };
export class AriConfigurationError extends Error { }
export const STAGING_URL = 'https://staging.channex.io/api/v1';
export const ARI_CALL_INTERVAL_MS = 3100; // Global persisted spacing: at most 20 calls in any minute.
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
  return Math.max(3100, Number.isFinite(requested) ? Math.max(0, requested) : 0, Math.min(3600000, 5000 * 2 ** Math.min(attempt, 10)) * (1 + random() * .2));
}
export function compressValues(values: AriValue[]): AriValue[] {
  const result: AriValue[] = [];
  for (const value of values) {
    const prev = result[result.length - 1];
    const identity = ({ date_from, date_to, ...rest }: AriValue) => JSON.stringify(rest);
    if (prev && addDays(prev.date_to, 1) === value.date_from && identity(prev) === identity(value)) prev.date_to = value.date_to;
    else result.push({ ...value });
  }
  return result;
}
export async function inventoryPreview(c: Pick<PoolClient, 'query'>, connectionId: string, floor: number) {
  const { rows } = await c.query(`SELECT r.id,r.room_number AS "roomNumber",r.floor,r.room_type_id AS "roomTypeId",rt.name AS "roomTypeName",r.status,
   m.channex_room_type_id AS "channexRoomTypeId"
   FROM rooms r LEFT JOIN room_types rt ON rt.id=r.room_type_id
   LEFT JOIN channex_room_type_mappings m ON m.connection_id=$1 AND m.room_type_id=r.room_type_id
   WHERE r.floor=$2 AND r.is_active AND NOT COALESCE(r.is_virtual,false) AND r.room_number<>'REUB'
   ORDER BY r.room_number::text`, [connectionId, floor]);
  return rows;
}
/** Recomputes current absolute values only for affected dates/types, never scans for changes. */
export async function buildAriValues(c: Pick<PoolClient, 'query'>, connection: any, events: AriEvent[], today: string): Promise<AriValue[]> {
  const horizonEnd = addDays(today, 499);
  const dates = [...new Set(events.flatMap(e => e.date_to < today || e.date_from > horizonEnd ? [] : daysBetween(e.date_from < today ? today : e.date_from, e.date_to > horizonEnd ? horizonEnd : e.date_to)))].sort();
  if (!dates.length) return [];
  const mappings = (await c.query(`SELECT channex_room_type_id,room_type_id FROM channex_room_type_mappings WHERE connection_id=$1`, [connection.id])).rows;
  if (!mappings.length || mappings.some(m => !m.room_type_id) || new Set(mappings.map(m => m.room_type_id)).size !== mappings.length) throw new AriConfigurationError('Completá un mapeo único para cada categoría antes de sincronizar');
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
    GREATEST(0,(SELECT count(*) FROM rooms r WHERE r.floor=$2 AND r.room_type_id=m.room_type_id
      AND r.is_active AND NOT COALESCE(r.is_virtual,false) AND r.room_number<>'REUB' AND r.status NOT IN ('maintenance','oos')
      AND NOT EXISTS(SELECT 1 FROM reservations b WHERE b.room_id=r.id AND b.status IN ('tentative','pending','reserved','confirmed','web_checkin','checked_in') AND b.check_in_date<=d.day AND b.check_out_date>d.day)
      AND NOT EXISTS(SELECT 1 FROM maintenance_blocks b WHERE b.room_id=r.id AND b.block_from<=d.day AND b.block_to>=d.day)
    )-COALESCE(u.quantity,0))::int AS availability
   FROM channex_room_type_mappings m CROSS JOIN dates d
   LEFT JOIN unassigned u ON u.room_type_id=m.room_type_id AND u.day=d.day
   WHERE m.connection_id=$1 ORDER BY m.channex_room_type_id,d.day`, [connection.id, connection.floor, dates])).rows;
    for (const r of rows) if (affected(r.room_type_id, r.day)) values.push({ property_id: connection.channex_property_id, room_type_id: r.channex_room_type_id, date_from: r.day, date_to: r.day, availability: r.availability });
  } else {
    const plans = (await c.query(`SELECT m.channex_rate_plan_id,m.channex_room_type_id,m.rate_plan_id,p.room_type_id,p.base_rate,p.currency,p.valid_from::text,p.valid_to::text
    FROM channex_rate_plan_mappings m LEFT JOIN rate_plans p ON p.id=m.rate_plan_id WHERE m.connection_id=$1 ORDER BY m.channex_rate_plan_id`, [connection.id])).rows;
    if (!plans.length) throw new AriConfigurationError('Falta mapear los planes tarifarios');
    for (const p of plans) {
      const room = mappings.find(m => m.channex_room_type_id === p.channex_room_type_id);
      if (!room || p.room_type_id !== room.room_type_id || !p.rate_plan_id) throw new AriConfigurationError('El plan tarifario no coincide con su categoría mapeada');
      for (const day of dates) if (affected(p.room_type_id, day, p.rate_plan_id)) {
        if (p.currency !== connection.currency) throw new AriConfigurationError('La moneda del plan debe coincidir con la moneda configurada para Channex');
        if ((p.valid_from && day < p.valid_from) || (p.valid_to && day > p.valid_to) || !/^\d+(\.\d{1,2})?$/.test(p.base_rate) || Number(p.base_rate) <= 0) throw new AriConfigurationError('Falta una tarifa vigente y positiva para las fechas a publicar');
        values.push({ property_id: connection.channex_property_id, rate_plan_id: p.channex_rate_plan_id, date_from: day, date_to: day, rate: p.base_rate });
      }
    }
  }
  return compressValues(values);
}
