import { sql, type SQL } from "drizzle-orm";
import { PILOT_EXTERNAL_RESOURCE_KEYS } from "./permissions";

export async function seedPilotPermissionsOnce(database: {execute(query: SQL): Promise<unknown>}): Promise<void> {
  await database.execute(sql`WITH applied AS (
    INSERT INTO resource_permission_seeds(resource_key)
    VALUES('pilot-granular-permissions-20261009') ON CONFLICT DO NOTHING RETURNING resource_key
  ) INSERT INTO role_permissions(role,resource_key)
    SELECT 'piloto_externo', key FROM applied
    CROSS JOIN unnest(ARRAY[${sql.join(PILOT_EXTERNAL_RESOURCE_KEYS.map(key => sql`${key}`), sql`, `)}]::text[]) AS resources(key)
    ON CONFLICT DO NOTHING`);
}
