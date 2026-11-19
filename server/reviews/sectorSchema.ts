import { sql } from "drizzle-orm";
import { db } from "../db";

/** Additive only: existing responses, question wording, tokens and schedules are retained. */
export async function ensureReviewSectorSchema() {
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS review_sector_links (
      sector text PRIMARY KEY CHECK(sector IN ('hotel','spa','events','restaurant')),
      active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE review_areas ADD COLUMN IF NOT EXISTS sectors text[] NOT NULL DEFAULT ARRAY['hotel']::text[];
    CREATE TABLE IF NOT EXISTS survey_public_responses (
      id varchar PRIMARY KEY, submission_key uuid NOT NULL UNIQUE,
      sector text NOT NULL REFERENCES review_sector_links(sector),
      guest_name text,visit_date date,event_name text,contact_email text,contact_phone text,
      rating_overall integer NOT NULL CHECK(rating_overall BETWEEN 1 AND 5),
      area_ratings jsonb NOT NULL DEFAULT '{}',area_questions jsonb NOT NULL DEFAULT '{}',
      comment text,nps integer CHECK(nps BETWEEN 0 AND 10),contact_requested boolean NOT NULL DEFAULT false,
      submitted_at timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'));
    ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS survey_sector text;
    ALTER TABLE guest_reviews ADD COLUMN IF NOT EXISTS generic_response_id varchar REFERENCES survey_public_responses(id);
    CREATE UNIQUE INDEX IF NOT EXISTS guest_reviews_generic_response_unique ON guest_reviews(generic_response_id) WHERE generic_response_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS guest_reviews_sector_day ON guest_reviews(survey_sector,review_date);
    CREATE TABLE IF NOT EXISTS survey_manual_deliveries (
      reservation_id varchar PRIMARY KEY REFERENCES reservations(id),survey_token_id varchar NOT NULL REFERENCES survey_tokens(id),
      shared_at timestamptz NOT NULL DEFAULT now(),actor text NOT NULL);
  `),
  );
  // A newly installed sector grants its operators access once; subsequent starts
  // do not restore a permission that an administrator has revoked.
  const inserted = (
    await db.execute(
      sql`INSERT INTO review_sector_links(sector) VALUES('hotel'),('spa'),('events'),('restaurant') ON CONFLICT DO NOTHING RETURNING sector`,
    )
  ).rows as { sector: string }[];
  for (const { sector } of inserted) {
    const role = sector === "hotel" ? "resp_administracion" : sector;
    if (sector === "hotel")
      await db.execute(
        sql`INSERT INTO role_permissions(role,resource_key) VALUES(${role},'sidebar:/reviews'),(${role},'api:reviews:manage') ON CONFLICT DO NOTHING`,
      );
    else
      await db.execute(
        sql`INSERT INTO role_permissions(role,resource_key) VALUES(${role},${"api:reviews:sector:" + sector}) ON CONFLICT DO NOTHING`,
      );
    if (sector === "hotel") continue;
    await db.execute(
      sql`UPDATE review_areas SET sectors=array_append(sectors,${sector}) WHERE key='cleanliness' AND NOT (${sector}=ANY(sectors))`,
    );
    if (sector === "spa" || sector === "restaurant") {
      const key = sector === "spa" ? "spa" : "food";
      await db.execute(
        sql`UPDATE review_areas SET sectors=array_append(sectors,${sector}) WHERE key=${key} AND NOT (${sector}=ANY(sectors))`,
      );
    }
  }
  await db.execute(
    sql.raw(`INSERT INTO review_areas(key,name,question,sort_order,notification_area,sectors) VALUES
    ('spa_attention','Atención SPA','¿Cómo evaluás la atención del equipo del SPA?',10,'spa',ARRAY['spa']),
    ('events_organization','Organización','¿Cómo evaluás la organización del evento?',11,'events',ARRAY['events']),
    ('events_attention','Atención Eventos','¿Cómo evaluás la atención durante el evento?',12,'events',ARRAY['events']),
    ('restaurant_attention','Atención Restaurant','¿Cómo evaluás la atención en el restaurante?',13,'restaurant',ARRAY['restaurant'])
    ON CONFLICT(key) DO NOTHING`),
  );
}
