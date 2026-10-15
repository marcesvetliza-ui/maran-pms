import { sql } from "drizzle-orm";
import { db } from "./db";

export async function ensureRevenueManagementSchema() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS revenue_demand_events (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    category text NOT NULL DEFAULT 'otro' CHECK(category IN ('feriado','evento_ciudad','otro')),
    impact text NOT NULL DEFAULT 'medio' CHECK(impact IN ('alto','medio','bajo')),
    notes text,
    created_by varchar,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    CHECK(end_date >= start_date)
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS revenue_demand_events_range_idx ON revenue_demand_events(start_date, end_date)`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS competitor_rates (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_name text NOT NULL,
    room_type_id varchar REFERENCES room_types(id),
    stay_date date NOT NULL,
    rate decimal(12,2) NOT NULL CHECK(rate >= 0),
    currency text NOT NULL DEFAULT 'ARS',
    source_note text,
    created_by varchar,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS competitor_rates_stay_date_idx ON competitor_rates(stay_date)`);
  // Condiciones necesarias para comparar de forma justa (reembolsabilidad,
  // tramo de ocupación). Nullable: mientras falten, la fila sigue siendo
  // válida como referencia manual pero el motor la excluye explícitamente.
  await db.execute(sql`ALTER TABLE competitor_rates ADD COLUMN IF NOT EXISTS refundable boolean`);
  await db.execute(sql`ALTER TABLE competitor_rates ADD COLUMN IF NOT EXISTS occupancy integer`);
  await db.execute(sql`ALTER TABLE competitor_rates DROP CONSTRAINT IF EXISTS competitor_rates_occupancy_check`);
  await db.execute(sql`ALTER TABLE competitor_rates ADD CONSTRAINT competitor_rates_occupancy_check CHECK(occupancy IS NULL OR occupancy BETWEEN 1 AND 4)`);
  // Desayuno e impuestos incluidos/no incluidos — mismo criterio: nullable,
  // referencia manual mientras falten, afuera del motor hasta cargarlas.
  await db.execute(sql`ALTER TABLE competitor_rates ADD COLUMN IF NOT EXISTS breakfast_included boolean`);
  await db.execute(sql`ALTER TABLE competitor_rates ADD COLUMN IF NOT EXISTS taxes_included boolean`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS revenue_pace_snapshots (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date date NOT NULL,
    stay_date date NOT NULL,
    rooms_sold integer NOT NULL DEFAULT 0,
    room_revenue decimal(12,2) NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now(),
    UNIQUE(snapshot_date, stay_date)
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS revenue_pace_snapshots_stay_date_idx ON revenue_pace_snapshots(stay_date)`);

  await db.execute(sql`CREATE TABLE IF NOT EXISTS revenue_rate_suggestion_config (
    id integer PRIMARY KEY DEFAULT 1 CHECK(id = 1),
    high_occupancy_threshold_pct decimal(5,2) NOT NULL DEFAULT 80,
    low_occupancy_threshold_pct decimal(5,2) NOT NULL DEFAULT 40,
    increase_suggestion_pct decimal(5,2) NOT NULL DEFAULT 10,
    decrease_suggestion_pct decimal(5,2) NOT NULL DEFAULT 10,
    consider_demand_events boolean NOT NULL DEFAULT true,
    consider_competitor_rates boolean NOT NULL DEFAULT true,
    updated_at timestamp NOT NULL DEFAULT now(),
    updated_by varchar
  )`);
  await db.execute(sql`INSERT INTO revenue_rate_suggestion_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  // Un registro por snapshotDate, escrito en la MISMA transacción que las
  // filas de revenue_pace_snapshots de ese día — ver server/revenue/metrics.ts
  // captureDailyPaceSnapshot(). Su sola existencia certifica que la captura
  // de ese día terminó por completo.
  await db.execute(sql`CREATE TABLE IF NOT EXISTS revenue_pace_snapshot_runs (
    snapshot_date date PRIMARY KEY,
    started_at timestamp NOT NULL DEFAULT now(),
    completed_at timestamp NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'completed' CHECK(status = 'completed'),
    days_captured integer NOT NULL DEFAULT 0,
    horizon_days integer NOT NULL DEFAULT 0
  )`);

  // Plan tarifario de referencia por tipo de habitación, configurado a mano.
  // Sin fila acá, ese tipo de habitación queda excluido de la comparación
  // contra competencia en el motor de sugerencias (ver competitorPricing.ts).
  await db.execute(sql`CREATE TABLE IF NOT EXISTS revenue_reference_rate_plans (
    room_type_id varchar PRIMARY KEY REFERENCES room_types(id),
    rate_plan_id varchar NOT NULL REFERENCES rate_plans(id),
    includes_breakfast boolean NOT NULL DEFAULT false,
    updated_at timestamp NOT NULL DEFAULT now(),
    updated_by varchar
  )`);
  await db.execute(sql`ALTER TABLE revenue_reference_rate_plans ADD COLUMN IF NOT EXISTS includes_breakfast boolean NOT NULL DEFAULT false`);
}
