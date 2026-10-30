import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { calendarDays, calendarIntents, calendarEffective, applyCalendarValues, calendarAddDays, MAX_CALENDAR_CELLS, type CalendarRequest, type CalendarCell, type CalendarSegment } from '@shared/rate-calendar';
export class CalendarConflict extends Error { }
export class CalendarInputError extends Error { }
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const key = (id: string, date: string) => `${id}:${date}`;
async function load(c: PoolClient, ids: string[], from: string, to: string, lock = false) {
  const plans = (await c.query(`SELECT id,room_type_id,base_rate,currency,valid_from::text,valid_to::text FROM rate_plans WHERE id=ANY($1::varchar[]) ORDER BY id ${lock ? 'FOR UPDATE' : ''}`, [ids])).rows;
  if (plans.length !== ids.length) throw new CalendarInputError('Uno de los planes ya no existe; actualizá la selección');
  const entries = (await c.query('SELECT *,stay_date::text AS date FROM rate_calendar_entries WHERE rate_plan_id=ANY($1::varchar[]) AND stay_date BETWEEN $2::date AND $3::date ORDER BY rate_plan_id,stay_date', [ids, from, to])).rows;
  return { plans, entries };
}
export async function readCalendar(pool: Pool, ids: string[], from: string, to: string) {
  let days: string[]; try { days = calendarDays(from, to); } catch (error) { throw new CalendarInputError((error as Error).message); }
  if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length || ids.length * days.length > MAX_CALENDAR_CELLS) throw new CalendarInputError('Seleccioná hasta 20 planes y un máximo de 5000 noches');
  const c = await pool.connect(); try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { plans, entries } = await load(c, ids, from, to), byDay = new Map(entries.map(e => [key(e.rate_plan_id, e.date), e]));
    const cells: CalendarCell[] = plans.flatMap(p => days.map(day => calendarEffective(p, day, byDay.get(key(p.id, day)))));
    await c.query('COMMIT'); return { cells };
  } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
}
export async function editCalendar(pool: Pool, request: CalendarRequest, actorId: string | null, previewToken?: string) {
  let intents: ReturnType<typeof calendarIntents>;
  try { intents = calendarIntents(request); } catch (error) { throw new CalendarInputError((error as Error).message); }
  const ids = [...new Set(intents.map(i => i.ratePlanId))].sort(), dates = intents.map(i => i.date).sort();
  if (ids.length > 20) throw new CalendarInputError('Un guardado admite hasta 20 planes');
  try { calendarDays(dates[0], dates[dates.length - 1]); } catch (error) { throw new CalendarInputError((error as Error).message); }
  const c = await pool.connect(); try {
    await c.query(previewToken ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await c.query("SET LOCAL lock_timeout='3s'"); await c.query("SET LOCAL statement_timeout='15s'");
    const { plans, entries } = await load(c, ids, dates[0], dates[dates.length - 1], !!previewToken);
    const byPlan = new Map(plans.map(p => [p.id, p])), byDay = new Map(entries.map(e => [key(e.rate_plan_id, e.date), e]));
    const changes = intents.map(intent => {
      const plan = byPlan.get(intent.ratePlanId)!;
      if ((plan.valid_from && intent.date < plan.valid_from) || (plan.valid_to && intent.date > plan.valid_to)) throw new CalendarInputError(`El período elegido está fuera de la vigencia de uno de los planes (${intent.date})`);
      const before = calendarEffective(plan, intent.date, byDay.get(key(intent.ratePlanId, intent.date)));
      let after: CalendarCell; try { after = applyCalendarValues(before, intent.values, plan.base_rate); } catch (error) { throw new CalendarInputError((error as Error).message); }
      return { before, after };
    }).filter(({ before, after }) => canonical(before) !== canonical(after));
    // Includes selected plan metadata and all selected cells; a concurrent price/currency/calendar edit invalidates review.
    const token = createHash('sha256').update(canonical({ intents, plans, entries })).digest('hex');
    const segments: CalendarSegment[] = [];
    const withoutDate = ({ date, ...cell }: CalendarCell) => canonical(cell);
    for (const { before, after } of changes) {
      const prev = segments[segments.length - 1];
      if (prev && prev.ratePlanId === after.ratePlanId && calendarAddDays(prev.dateTo, 1) === after.date && withoutDate(prev.before) === withoutDate(before) && withoutDate(prev.after) === withoutDate(after)) prev.dateTo = after.date;
      else segments.push({ ratePlanId: after.ratePlanId, dateFrom: after.date, dateTo: after.date, before, after });
    }
    const result = { previewToken: token, changedCells: changes.length, selectedCells: intents.length, segments };
    if (previewToken) {
      if (previewToken !== token) throw new CalendarConflict('El calendario cambió desde la revisión. Revisá la propuesta nuevamente antes de guardar');
      if (changes.length) {
        await c.query(`INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,rate,min_stay_arrival,min_stay_through,max_stay,stop_sell,closed_to_arrival,closed_to_departure,updated_by)
     SELECT x."ratePlanId",x.date::date,x."rateOverride",x."minStayArrival",x."minStayThrough",x."maxStay",x."stopSell",x."closedToArrival",x."closedToDeparture",$2
     FROM jsonb_to_recordset($1::jsonb) AS x("ratePlanId" varchar,date text,"rateOverride" numeric,"minStayArrival" int,"minStayThrough" int,"maxStay" int,"stopSell" boolean,"closedToArrival" boolean,"closedToDeparture" boolean)
     ON CONFLICT(rate_plan_id,stay_date) DO UPDATE SET rate=EXCLUDED.rate,min_stay_arrival=EXCLUDED.min_stay_arrival,min_stay_through=EXCLUDED.min_stay_through,max_stay=EXCLUDED.max_stay,
       stop_sell=EXCLUDED.stop_sell,closed_to_arrival=EXCLUDED.closed_to_arrival,closed_to_departure=EXCLUDED.closed_to_departure,updated_at=now(),updated_by=EXCLUDED.updated_by`, [JSON.stringify(changes.map(c => c.after)), actorId]);
        await c.query('INSERT INTO rate_calendar_edits(actor_id,changes,summary) VALUES($1,$2,$3)', [actorId, JSON.stringify(request), JSON.stringify({ selectedCells: intents.length, changedCells: changes.length, segments })]);
      }
    }
    await c.query('COMMIT'); return result;
  } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
}
