import { sql } from "drizzle-orm";
import { db } from "./db";
export const STAY_PROFILE_SCHEMA_SQL = `
ALTER TABLE guests ADD COLUMN IF NOT EXISTS stay_profile jsonb;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS stay_details jsonb;
ALTER TABLE reservation_companions ADD COLUMN IF NOT EXISTS profile_member_id varchar(100);
CREATE UNIQUE INDEX IF NOT EXISTS reservation_companions_profile_member_unique ON reservation_companions(reservation_id, profile_member_id) WHERE profile_member_id IS NOT NULL;
`;
export async function ensureGuestStaySchema() { await db.execute(sql.raw(STAY_PROFILE_SCHEMA_SQL)); }
