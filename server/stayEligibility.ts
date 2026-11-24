import {sql} from "drizzle-orm";
/** Calendar date, independent of host timezone; rejects impossible dates. */
export function validCalendarDate(value:string):boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+"T12:00:00Z")) && new Date(value+"T12:00:00Z").toISOString().slice(0,10) === value;
}
/** Today's presence follows confirmed check-in until check-out is recorded.
 * Historical date lists retain the existing night-of-stay interval. */
export function inHouseEligibility(date:string,today:string,alias:'r'|'reservations'='r') {
  if(alias!=='r'&&alias!=='reservations')throw Error('Invalid reservation alias');
  const r=sql.identifier(alias);
  return sql`${r}.status='checked_in' AND ${r}.check_in_date<=${date}::date
    AND (${date}::date=${today}::date OR ${r}.check_out_date>${date}::date)`;
}
/** Operational breakfast forecast for the previous night. Alias r must be reservations. */
export function breakfastEligibility(date:string) {
  return sql`r.check_in_date < ${date}::date AND r.check_out_date >= ${date}::date
    AND (r.status = 'checked_in' OR (r.status = 'checked_out' AND ${date}::date <= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)
      OR (r.check_in_date = ${date}::date - 1 AND r.status IN ('confirmed','web_checkin','pending')))`;
}
