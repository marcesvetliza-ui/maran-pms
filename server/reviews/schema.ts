import { ensureReviewSectorSchema } from "./sectorSchema";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "../db";

export async function ensureReviewsSchema() {
  await withDatabaseTransaction(async () => {
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('reviews-surveys-schema-v1'))`,
    );
    await db.execute(
      sql.raw(`
      ALTER TABLE email_config ADD COLUMN IF NOT EXISTS checkout_delay_days integer NOT NULL DEFAULT 1;
      ALTER TABLE email_config ADD COLUMN IF NOT EXISTS checkout_send_time text NOT NULL DEFAULT '10:00';
      CREATE TABLE IF NOT EXISTS review_areas (
        key text PRIMARY KEY,name text NOT NULL,question text NOT NULL,active boolean NOT NULL DEFAULT true,in_survey boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 0,notification_area text NOT NULL DEFAULT 'reception');
      INSERT INTO review_areas(key,name,question,sort_order,notification_area) VALUES
        ('service','Recepción','¿Cómo evaluás la atención de recepción?',1,'reception'),
        ('room','Habitación','¿Cómo evaluás la comodidad y el estado de la habitación?',2,'reception'),
        ('cleanliness','Limpieza','¿Cómo encontraste la limpieza?',3,'housekeeping'),
        ('breakfast','Desayuno','¿Cómo fue el desayuno?',4,'restaurant'),
        ('food','Restaurante','¿Cómo fue tu experiencia en el restaurante?',5,'restaurant'),
        ('spa','Spa','¿Cómo fue tu experiencia en el Spa?',6,'spa') ON CONFLICT(key) DO NOTHING;
      INSERT INTO review_areas(key,name,question,sort_order,notification_area,in_survey)
        VALUES('maintenance','Mantenimiento','Estado de las instalaciones',7,'maintenance',false) ON CONFLICT(key) DO NOTHING;
      ALTER TABLE survey_responses ALTER COLUMN rating_room DROP NOT NULL;
      ALTER TABLE survey_responses ALTER COLUMN rating_cleanliness DROP NOT NULL;
      ALTER TABLE survey_responses ALTER COLUMN rating_service DROP NOT NULL;
      ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS area_ratings jsonb NOT NULL DEFAULT '{}';
      ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS area_questions jsonb NOT NULL DEFAULT '{}';
      ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS nps integer;
      ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS contact_requested boolean NOT NULL DEFAULT false;
      ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS survey_response_id varchar;
      ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS guest_display_name text;
      ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS area_ratings jsonb NOT NULL DEFAULT '{}';
      ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS area_questions jsonb NOT NULL DEFAULT '{}';
      ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS nps integer;
      ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS contact_requested boolean NOT NULL DEFAULT false;
      ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS followup_status text NOT NULL DEFAULT 'new';
      ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS assigned_to text;
      ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS action_areas text[] NOT NULL DEFAULT '{}';
      CREATE UNIQUE INDEX IF NOT EXISTS guest_reviews_survey_response_unique ON guest_reviews(survey_response_id) WHERE survey_response_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS review_events (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,review_id varchar NOT NULL REFERENCES guest_reviews(id) ON DELETE CASCADE,
        actor text NOT NULL,kind text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS review_events_review ON review_events(review_id,created_at);
      CREATE TABLE IF NOT EXISTS survey_dispatches (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,reservation_id varchar NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,stay_key text NOT NULL UNIQUE,
        checked_out_at timestamptz NOT NULL,scheduled_for timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','unknown','no_email','completed')),
        survey_token_id varchar REFERENCES survey_tokens(id) ON DELETE SET NULL,recipient_email text,attempts integer NOT NULL DEFAULT 0,
        claim_id varchar,claimed_at timestamptz,sent_at timestamptz,provider_id text,last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS survey_dispatches_due ON survey_dispatches(scheduled_for) WHERE status='queued';
      CREATE OR REPLACE FUNCTION survey_scheduled_time(checkout_time timestamptz) RETURNS timestamptz LANGUAGE sql AS $$
        SELECT GREATEST(checkout_time,(((checkout_time AT TIME ZONE 'America/Argentina/Buenos_Aires')::date+
          COALESCE((SELECT checkout_delay_days FROM email_config WHERE id=1),1))+
          COALESCE((SELECT checkout_send_time FROM email_config WHERE id=1),'10:00')::time) AT TIME ZONE 'America/Argentina/Buenos_Aires')
      $$;
      CREATE OR REPLACE FUNCTION queue_checkout_survey() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.status='checked_out' AND OLD.status IS DISTINCT FROM NEW.status THEN
            IF EXISTS(SELECT 1 FROM survey_dispatches WHERE reservation_id=NEW.id) THEN
              UPDATE survey_dispatches SET checked_out_at=now(),scheduled_for=survey_scheduled_time(now()),updated_at=now()
                WHERE reservation_id=NEW.id AND status IN ('queued','no_email');
              RETURN NEW;
            END IF;
            INSERT INTO survey_dispatches(reservation_id,stay_key,checked_out_at,scheduled_for,status,sent_at,survey_token_id)
              VALUES(NEW.id,COALESCE(NEW.guest_id,NEW.id)||':'||NEW.check_in_date::text||':'||NEW.check_out_date::text,now(),survey_scheduled_time(now()),
                CASE WHEN EXISTS(SELECT 1 FROM survey_tokens WHERE reservation_id=NEW.id AND completed=true) THEN 'completed'
                  WHEN EXISTS(SELECT 1 FROM email_logs WHERE reservation_id=NEW.id AND type='checkout' AND status='sent') THEN 'sent' ELSE 'queued' END,
                (SELECT max(sent_at) FROM email_logs WHERE reservation_id=NEW.id AND type='checkout' AND status='sent'),
                (SELECT id FROM survey_tokens WHERE reservation_id=NEW.id ORDER BY created_at DESC,id LIMIT 1))
            ON CONFLICT(stay_key) DO UPDATE SET checked_out_at=EXCLUDED.checked_out_at,
              scheduled_for=EXCLUDED.scheduled_for,updated_at=now() WHERE survey_dispatches.status IN ('queued','no_email');
          END IF;
          RETURN NEW;
        END
      $$;
      DROP TRIGGER IF EXISTS reservations_checkout_survey ON reservations;
      CREATE TRIGGER reservations_checkout_survey AFTER UPDATE OF status ON reservations
        FOR EACH ROW EXECUTE FUNCTION queue_checkout_survey();
    `),
    );
    await ensureReviewSectorSchema();
  });
}
