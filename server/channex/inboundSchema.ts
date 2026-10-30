import type { Pool } from "pg";
export const inboundSchemaSql = `
CREATE TABLE IF NOT EXISTS channex_inbound_settings (
 connection_id varchar PRIMARY KEY REFERENCES channex_connections(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false, token_hash text,
 notification_pending boolean NOT NULL DEFAULT false, notification_version bigint NOT NULL DEFAULT 0, next_fetch_at timestamptz NOT NULL DEFAULT now(),
 fetch_attempts integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS channex_inbound_revisions (
 connection_id varchar NOT NULL REFERENCES channex_connections(id) ON DELETE CASCADE,
 revision_id text NOT NULL, payload jsonb NOT NULL, payload_hash text NOT NULL,
 booking_id text, inserted_at timestamptz,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','stale','review')),
 acked_at timestamptz, ack_attempts integer NOT NULL DEFAULT 0, next_ack_at timestamptz NOT NULL DEFAULT now(),
 review_code text, created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz,
 PRIMARY KEY(connection_id,revision_id)
);
CREATE TABLE IF NOT EXISTS channex_inbound_bookings (
 connection_id varchar NOT NULL REFERENCES channex_connections(id) ON DELETE CASCADE,
 booking_id text NOT NULL, last_revision_id text, last_inserted_at timestamptz, guest_hash text, cancelled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(connection_id,booking_id)
);
ALTER TABLE channex_inbound_bookings ADD COLUMN IF NOT EXISTS guest_hash text;
CREATE TABLE IF NOT EXISTS channex_inbound_rooms (
 connection_id varchar NOT NULL, booking_id text NOT NULL, remote_room_id text NOT NULL,
 reservation_id varchar NOT NULL UNIQUE REFERENCES reservations(id), local_hash text,
 PRIMARY KEY(connection_id,booking_id,remote_room_id),
 FOREIGN KEY(connection_id,booking_id) REFERENCES channex_inbound_bookings(connection_id,booking_id)
);
CREATE TABLE IF NOT EXISTS channex_inbound_dispatch(id int PRIMARY KEY CHECK(id=1), next_request_at timestamptz NOT NULL DEFAULT now());
INSERT INTO channex_inbound_dispatch(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION channex_guard_inbound_history() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM channex_inbound_revisions WHERE connection_id=OLD.id) THEN
  RAISE EXCEPTION 'CHANNEX_INBOUND_HISTORY_REQUIRES_REVIEW';
 END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM channex_inbound_settings WHERE connection_id=OLD.id AND enabled)
  AND (OLD.environment,OLD.base_url,OLD.channex_property_id,OLD.api_key_encrypted,OLD.is_active)
   IS DISTINCT FROM (NEW.environment,NEW.base_url,NEW.channex_property_id,NEW.api_key_encrypted,NEW.is_active) THEN
  RAISE EXCEPTION 'PAUSE_CHANNEX_INBOUND_BEFORE_RECONFIGURING';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $body$;
DROP TRIGGER IF EXISTS channex_inbound_history_guard ON channex_connections;
CREATE TRIGGER channex_inbound_history_guard BEFORE DELETE OR UPDATE ON channex_connections
 FOR EACH ROW EXECUTE FUNCTION channex_guard_inbound_history();
CREATE INDEX IF NOT EXISTS channex_inbound_pending ON channex_inbound_revisions(created_at) WHERE status='pending';
`;
export async function ensureChannexInboundSchema(pool: Pool) {
  const c = await pool.connect();
  try { await c.query("BEGIN"); await c.query("SET LOCAL lock_timeout='3s'"); await c.query("SELECT pg_advisory_xact_lock(1296126535,905)"); await c.query(inboundSchemaSql); await c.query("COMMIT"); }
  catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
