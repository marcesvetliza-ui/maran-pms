import type { Pool } from "pg";
import { z } from "zod";
import { STAGING_URL } from "./ari";
import { settlementRateSchema } from "./settlement";

export const settlementSettingsSchema = z.object({
  rate: settlementRateSchema.nullable(),
  reason: z.string().trim().min(5).max(500),
}).strict();
/** Changes the quote for future bookings only. Existing snapshots are never
 * revalued. Audit and configuration commit or roll back together. */
export async function saveSettlementRate(pool: Pool, connectionId: string, input: z.infer<typeof settlementSettingsSchema>, actor: string) {
  const data = settlementSettingsSchema.parse(input);
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const connection = (await c.query("SELECT environment,base_url FROM channex_connections WHERE id=$1 FOR SHARE", [connectionId])).rows[0];
    if (!connection || connection.environment !== "demo" || connection.base_url.replace(/\/$/, "") !== STAGING_URL) throw new Error("La cotización de esta etapa solo admite una conexión staging.");
    await c.query("INSERT INTO channex_inbound_settings(connection_id) VALUES($1) ON CONFLICT DO NOTHING", [connectionId]);
    const settings = (await c.query("SELECT settlement_exchange_rate FROM channex_inbound_settings WHERE connection_id=$1 FOR UPDATE", [connectionId])).rows[0];
    if (!settings) throw new Error("Configurá primero la recepción de reservas.");
    await c.query("INSERT INTO channex_settlement_rate_edits(connection_id,previous_rate,new_rate,reason,actor) VALUES($1,$2,$3,$4,$5)", [connectionId, settings.settlement_exchange_rate, data.rate, data.reason, actor]);
    await c.query("UPDATE channex_inbound_settings SET settlement_exchange_rate=$2,exchange_rate_updated_at=now(),updated_at=now() WHERE connection_id=$1", [connectionId, data.rate]);
    await c.query("COMMIT");
  } catch (error) { await c.query("ROLLBACK"); throw error; }
  finally { c.release(); }
}
