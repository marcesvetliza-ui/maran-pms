import type { Pool } from "pg";
import { rateCalendarSchemaSql } from "../rates/calendarSchema";

/** Additive, transactional installation. Triggers record changes, never call a network service. */
export const ariSchemaSql = `
CREATE TABLE IF NOT EXISTS channex_ari_settings (
 connection_id varchar PRIMARY KEY REFERENCES channex_connections(id) ON DELETE CASCADE,
 floor integer NOT NULL DEFAULT 2, currency text NOT NULL DEFAULT 'ARS' CHECK(currency ~ '^[A-Z]{3}$'),
 enabled boolean NOT NULL DEFAULT false, capture_started_at timestamptz, last_horizon_date date,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE channex_ari_settings ADD COLUMN IF NOT EXISTS capture_started_at timestamptz;
CREATE TABLE IF NOT EXISTS channex_ari_outbox (
 id bigserial PRIMARY KEY, batch_id bigint NOT NULL DEFAULT txid_current(), connection_id varchar NOT NULL REFERENCES channex_connections(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('availability','restrictions')),
 date_from date NOT NULL, date_to date NOT NULL CHECK(date_to>=date_from),
 room_type_id varchar, rate_plan_id varchar, reason text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','blocked')),
 attempts integer NOT NULL DEFAULT 0, run_after timestamptz NOT NULL DEFAULT now(),
 task_ids jsonb, last_error text, created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz
);
ALTER TABLE channex_ari_outbox ADD COLUMN IF NOT EXISTS batch_id bigint NOT NULL DEFAULT txid_current();
CREATE INDEX IF NOT EXISTS channex_ari_outbox_pending ON channex_ari_outbox(connection_id,kind,run_after,id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS channex_ari_published (
 connection_id varchar NOT NULL REFERENCES channex_connections(id) ON DELETE CASCADE,
 kind text NOT NULL, target_id text NOT NULL, day date NOT NULL, value jsonb NOT NULL,
 PRIMARY KEY(connection_id,kind,target_id,day)
);
CREATE TABLE IF NOT EXISTS channex_ari_dispatch (
 id integer PRIMARY KEY CHECK(id=1), next_call_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO channex_ari_dispatch(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION channex_capture_ari() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE item jsonb; side integer; first_day date; last_day date; room_type varchar; rate_plan varchar; kind text;
 today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
 -- No capture until explicitly enabled once. Paused connections keep recording durable deltas.
 IF NOT EXISTS(SELECT 1 FROM channex_ari_settings WHERE capture_started_at IS NOT NULL) THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME IN ('channex_connections','channex_room_type_mappings','channex_rate_plan_mappings') THEN
  INSERT INTO channex_ari_outbox(connection_id,kind,date_from,date_to,reason)
   SELECT s.connection_id,k.kind,today,today+499,'mapping_change'
   FROM channex_ari_settings s CROSS JOIN (VALUES('availability'),('restrictions')) k(kind)
   WHERE s.capture_started_at IS NOT NULL AND s.connection_id IN (
    CASE WHEN TG_TABLE_NAME='channex_connections' THEN to_jsonb(OLD)->>'id' ELSE to_jsonb(OLD)->>'connection_id' END,
    CASE WHEN TG_TABLE_NAME='channex_connections' THEN to_jsonb(NEW)->>'id' ELSE to_jsonb(NEW)->>'connection_id' END
   );
  RETURN NULL;
 END IF;
 FOR side IN 1..2 LOOP
  IF side=1 AND TG_OP='INSERT' OR side=2 AND TG_OP='DELETE' THEN CONTINUE; END IF;
  item := CASE WHEN side=1 THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  first_day:=today; last_day:=today+499; room_type:=NULL; rate_plan:=NULL; kind:='availability';
  IF TG_TABLE_NAME='reservations' THEN
   IF NOT (item->>'status'=ANY(ARRAY['tentative','pending','reserved','confirmed','web_checkin','checked_in'])) THEN CONTINUE; END IF;
   first_day:=(item->>'check_in_date')::date; last_day:=(item->>'check_out_date')::date-1;
   SELECT room_type_id INTO room_type FROM rooms WHERE id=item->>'room_id';
  ELSIF TG_TABLE_NAME='maintenance_blocks' THEN
   -- Maintenance's last date is inclusive in the Planning UI.
   first_day:=(item->>'block_from')::date; last_day:=(item->>'block_to')::date;
   SELECT room_type_id INTO room_type FROM rooms WHERE id=item->>'room_id';
  ELSIF TG_TABLE_NAME='rooms' THEN room_type:=item->>'room_type_id';
  ELSIF TG_TABLE_NAME='rate_plans' THEN
   kind:='restrictions'; room_type:=item->>'room_type_id'; rate_plan:=item->>'id';
  ELSIF TG_TABLE_NAME='group_reservation_links' THEN
   SELECT check_in_date,check_out_date-1 INTO first_day,last_day FROM reservations WHERE id=item->>'reservation_id';
  ELSIF TG_TABLE_NAME='groups' THEN
   first_day:=(item->>'check_in_date')::date; last_day:=(item->>'check_out_date')::date-1;
  ELSIF TG_TABLE_NAME='group_room_blocks' THEN
   room_type:=item->>'room_type_id';
   SELECT COALESCE((item->>'block_check_in_date')::date,check_in_date),
     COALESCE((item->>'block_check_out_date')::date,check_out_date)-1
     INTO first_day,last_day FROM groups WHERE id=item->>'group_id';
  END IF;
  first_day:=GREATEST(first_day,today); last_day:=LEAST(last_day,today+499);
  IF first_day IS NULL OR last_day IS NULL OR last_day<first_day THEN CONTINUE; END IF;
  INSERT INTO channex_ari_outbox(connection_id,kind,date_from,date_to,room_type_id,rate_plan_id,reason)
   SELECT s.connection_id,kind,first_day,last_day,room_type,rate_plan,TG_TABLE_NAME||':'||lower(TG_OP)
   FROM channex_ari_settings s JOIN channex_connections c ON c.id=s.connection_id
   WHERE s.capture_started_at IS NOT NULL AND c.is_active;
 END LOOP;
 RETURN NULL;
END $body$;
CREATE OR REPLACE FUNCTION channex_guard_ari_mapping() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE connection varchar;
BEGIN
 connection:=CASE WHEN TG_TABLE_NAME='channex_connections' THEN to_jsonb(OLD)->>'id' ELSE COALESCE(to_jsonb(NEW)->>'connection_id',to_jsonb(OLD)->>'connection_id') END;
 IF EXISTS(SELECT 1 FROM channex_ari_settings WHERE connection_id=connection AND enabled) THEN
  RAISE EXCEPTION 'Pausá la captura de Channex antes de modificar la conexión o sus mapeos';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $body$;

CREATE OR REPLACE FUNCTION channex_capture_calendar() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE payload jsonb; today date:=(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM channex_ari_settings WHERE capture_started_at IS NOT NULL) THEN RETURN NULL; END IF;
 IF TG_OP='INSERT' THEN
  SELECT jsonb_agg(jsonb_build_object('plan',rate_plan_id,'day',stay_date)) INTO payload FROM calendar_new;
 ELSIF TG_OP='DELETE' THEN
  SELECT jsonb_agg(jsonb_build_object('plan',rate_plan_id,'day',stay_date)) INTO payload FROM calendar_old;
 ELSE
  SELECT jsonb_agg(jsonb_build_object('plan',rate_plan_id,'day',stay_date)) INTO payload
   FROM(SELECT rate_plan_id,stay_date FROM calendar_old UNION ALL SELECT rate_plan_id,stay_date FROM calendar_new) changed;
 END IF;
 INSERT INTO channex_ari_outbox(connection_id,kind,date_from,date_to,room_type_id,rate_plan_id,reason)
  SELECT s.connection_id,'restrictions',GREATEST(min(x.day),today),LEAST(max(x.day),today+499),p.room_type_id,x.plan,'rate_calendar:'||lower(TG_OP)
  FROM jsonb_to_recordset(COALESCE(payload,'[]'::jsonb)) AS x(plan varchar,day date)
  LEFT JOIN rate_plans p ON p.id=x.plan CROSS JOIN channex_ari_settings s
  JOIN channex_connections c ON c.id=s.connection_id
  WHERE s.capture_started_at IS NOT NULL AND c.is_active AND x.day BETWEEN today AND today+499
  GROUP BY s.connection_id,p.room_type_id,x.plan;
 RETURN NULL;
END $body$;
`;
const triggerColumns: Record<string, string> = {
  reservations: "room_id,check_in_date,check_out_date,status",
  rooms: "room_type_id,floor,status,is_active,is_virtual,room_number",
  rate_plans: "room_type_id,base_rate,currency,valid_from,valid_to",
  maintenance_blocks: "room_id,block_from,block_to",
  groups: "check_in_date,check_out_date,status",
  group_room_blocks: "group_id,room_type_id,quantity,block_check_in_date,block_check_out_date",
  group_reservation_links: "group_id,reservation_id",
};
export async function ensureChannexAriSchema(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SELECT pg_advisory_xact_lock(1296126535, 902)");
    await client.query(rateCalendarSchemaSql);
    await client.query(ariSchemaSql);
    for (const [table, columns] of Object.entries(triggerColumns)) {
      // Only recreate this integration's triggers, never any hotel/pricing triggers.
      await client.query(`DROP TRIGGER IF EXISTS channex_ari_change ON ${table}`);
      await client.query(`CREATE TRIGGER channex_ari_change AFTER INSERT OR DELETE OR UPDATE OF ${columns} ON ${table} FOR EACH ROW EXECUTE FUNCTION channex_capture_ari()`);
    }
    for (const [table, events] of Object.entries({
      channex_connections: 'DELETE OR UPDATE OF environment,base_url,channex_property_id',
      channex_room_type_mappings: 'INSERT OR DELETE OR UPDATE OF room_type_id,channex_room_type_id,connection_id',
      channex_rate_plan_mappings: 'INSERT OR DELETE OR UPDATE OF rate_plan_id,channex_rate_plan_id,channex_room_type_id,connection_id',
    })) {
      await client.query(`DROP TRIGGER IF EXISTS channex_ari_mapping_guard ON ${table}`);
      await client.query(`CREATE TRIGGER channex_ari_mapping_guard BEFORE ${events} ON ${table} FOR EACH ROW EXECUTE FUNCTION channex_guard_ari_mapping()`);
      await client.query(`DROP TRIGGER IF EXISTS channex_ari_mapping_change ON ${table}`);
      const captureEvents = table === 'channex_connections' ? 'UPDATE OF environment,base_url,channex_property_id,is_active' : events;
      await client.query(`CREATE TRIGGER channex_ari_mapping_change AFTER ${captureEvents} ON ${table} FOR EACH ROW EXECUTE FUNCTION channex_capture_ari()`);
    }
    for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
      const transition = event === 'INSERT' ? 'NEW TABLE AS calendar_new' : event === 'DELETE' ? 'OLD TABLE AS calendar_old' : 'OLD TABLE AS calendar_old NEW TABLE AS calendar_new';
      await client.query(`DROP TRIGGER IF EXISTS channex_calendar_${event.toLowerCase()} ON rate_calendar_entries`);
      await client.query(`CREATE TRIGGER channex_calendar_${event.toLowerCase()} AFTER ${event} ON rate_calendar_entries REFERENCING ${transition} FOR EACH STATEMENT EXECUTE FUNCTION channex_capture_calendar()`);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
