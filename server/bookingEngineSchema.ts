// Additive migration only: no automatic selection of commercial plans.
export const BOOKING_ENGINE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS booking_engine_sales (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false
);
INSERT INTO booking_engine_sales(singleton,enabled) VALUES(true,false) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS booking_engine_configs (
 room_type_id varchar PRIMARY KEY REFERENCES room_types(id) ON DELETE CASCADE,
 rate_plan_id varchar REFERENCES rate_plans(id) ON DELETE RESTRICT,
 discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK(discount_percent>=0 AND discount_percent<100),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS booking_engine_photos (
 id uuid PRIMARY KEY, room_type_id varchar NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
 content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png')),
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 32 AND 614400),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_engine_photos_room_idx ON booking_engine_photos(room_type_id);
ALTER TABLE booking_engine_configs ADD COLUMN IF NOT EXISTS inherit_ota_ranges boolean NOT NULL DEFAULT false;
ALTER TABLE booking_engine_configs ADD COLUMN IF NOT EXISTS ota_adjustment_percent numeric(6,2) NOT NULL DEFAULT 0 CHECK(ota_adjustment_percent BETWEEN -99.99 AND 1000);
ALTER TABLE booking_engine_configs ADD COLUMN IF NOT EXISTS ota_reference_plans jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(ota_reference_plans)='object');
CREATE TABLE IF NOT EXISTS booking_engine_ota_source (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 connection_id varchar,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO booking_engine_ota_source(singleton,connection_id) VALUES(true,NULL) ON CONFLICT DO NOTHING;
`;

/** Additive startup/CI migration. Never enables public sales. */
export async function ensureBookingEngineSchema() {
  const { db, withDatabaseTransaction } = await import("./db");
  const { sql } = await import("drizzle-orm");
  await withDatabaseTransaction(async () => {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('booking-engine-schema'))`);
    await db.execute(sql.raw(BOOKING_ENGINE_SCHEMA_SQL));
  });
}
