import type { Pool } from 'pg';
export const rateCalendarSchemaSql = `
 CREATE TABLE IF NOT EXISTS rate_calendar_entries (
  rate_plan_id varchar NOT NULL REFERENCES rate_plans(id) ON DELETE CASCADE, stay_date date NOT NULL,
  rate numeric(10,2) CHECK(rate>0), min_stay_arrival integer NOT NULL DEFAULT 1 CHECK(min_stay_arrival BETWEEN 1 AND 365),
  min_stay_through integer NOT NULL DEFAULT 1 CHECK(min_stay_through BETWEEN 1 AND 365),
  max_stay integer NOT NULL DEFAULT 0 CHECK(max_stay BETWEEN 0 AND 365), stop_sell boolean NOT NULL DEFAULT false,
  closed_to_arrival boolean NOT NULL DEFAULT false, closed_to_departure boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by varchar,
  PRIMARY KEY(rate_plan_id,stay_date), CHECK(max_stay=0 OR max_stay>=GREATEST(min_stay_arrival,min_stay_through))
 );
 CREATE TABLE IF NOT EXISTS rate_calendar_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id varchar, changes jsonb NOT NULL, summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
 );
`;
export async function ensureRateCalendarSchema(pool: Pool) {
  const c = await pool.connect(); try {
    await c.query('BEGIN'); await c.query("SET LOCAL lock_timeout='3s'");
    await c.query('SELECT pg_advisory_xact_lock(1296126535,904)');
    await c.query(rateCalendarSchemaSql); await c.query('COMMIT');
  } catch (error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
}
