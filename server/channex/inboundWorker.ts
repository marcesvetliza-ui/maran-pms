import type { Pool } from "pg";
import { acknowledgeBookingRevision, ChannexApiError, fetchPendingBookingRevisions } from "./client";
import { decryptChannexApiKey } from "./credentials";
import { retryDelay, STAGING_URL } from "./ari";
export type InboundTransport = { feed(connection: any): Promise<any[]>; ack(connection: any, revisionId: string): Promise<void> };
function credentials(connection: any) {
  if (!connection.is_active || connection.environment !== "demo" || connection.base_url.replace(/\/$/, "") !== STAGING_URL) throw Error("STAGING_ONLY");
  return { apiKey: decryptChannexApiKey(connection.api_key_encrypted), baseUrl: STAGING_URL };
}
const transport: InboundTransport = {
  feed: c => fetchPendingBookingRevisions(credentials(c), c.channex_property_id),
  ack: (c, id) => acknowledgeBookingRevision(credentials(c), id),
};
export async function runInboundOnce(pool: Pool, options: { enabled?: boolean; transport?: InboundTransport; apply?: (connection: string, revision: string) => Promise<unknown> } = {}) {
  if (!(options.enabled ?? process.env.CHANNEX_INBOUND_STAGING_ENABLED === "true")) return "disabled";
  const c = await pool.connect(); let locked = false;
  try {
    locked = (await c.query("SELECT pg_try_advisory_lock(1296126535,906) AS locked")).rows[0].locked;
    if (!locked) return "busy";
    const { persistInboundRevision, applyInboundRevision } = await import("./inbound");
    const pending = (await c.query(`SELECT r.connection_id,r.revision_id FROM channex_inbound_revisions r
      JOIN channex_inbound_settings i ON i.connection_id=r.connection_id JOIN channex_ari_settings s ON s.connection_id=i.connection_id
      JOIN channex_connections x ON x.id=i.connection_id
      WHERE r.status='pending' AND i.enabled AND s.enabled AND x.is_active AND x.environment='demo' AND x.base_url=$1
      ORDER BY r.inserted_at,r.created_at LIMIT 1`, [STAGING_URL])).rows[0];
    if (pending) await (options.apply || applyInboundRevision)(pending.connection_id, pending.revision_id);
    const ack = (await c.query(`SELECT r.*,x.* FROM channex_inbound_revisions r JOIN channex_connections x ON x.id=r.connection_id
      JOIN channex_inbound_settings i ON i.connection_id=x.id WHERE i.enabled AND x.is_active AND x.environment='demo' AND x.base_url=$1
      AND r.acked_at IS NULL AND r.next_ack_at<=now() AND (r.review_code IS NULL OR r.review_code NOT IN ('INVALID_REVISION','WRONG_PROPERTY','REVISION_ID_COLLISION'))
      ORDER BY r.created_at LIMIT 1`, [STAGING_URL])).rows[0];
    const fetch = !ack && (await c.query(`SELECT x.*,i.notification_version,i.fetch_attempts FROM channex_connections x
      JOIN channex_inbound_settings i ON i.connection_id=x.id WHERE i.enabled AND i.notification_pending AND i.next_fetch_at<=now()
      AND x.is_active AND x.environment='demo' AND x.base_url=$1 ORDER BY i.next_fetch_at LIMIT 1`, [STAGING_URL])).rows[0];
    if (!ack && !fetch) return pending ? "applied" : "idle";
    const slot = await c.query(`UPDATE channex_inbound_dispatch SET next_request_at=now()+interval '3100 milliseconds'
      WHERE id=1 AND next_request_at<=now() RETURNING id`);
    if (!slot.rowCount) return "cooldown";
    const remote = options.transport || transport;
    if (ack) {
      try {
        await remote.ack(ack, ack.revision_id);
        await c.query("UPDATE channex_inbound_revisions SET acked_at=now(),ack_attempts=ack_attempts+1 WHERE connection_id=$1 AND revision_id=$2", [ack.connection_id, ack.revision_id]);
      } catch (e) {
        const delay = retryDelay(ack.ack_attempts, e instanceof ChannexApiError ? e.retryAfter : null);
        await c.query("UPDATE channex_inbound_revisions SET ack_attempts=ack_attempts+1,next_ack_at=now()+($3*interval '1 millisecond') WHERE connection_id=$1 AND revision_id=$2", [ack.connection_id, ack.revision_id, delay]);
        if (e instanceof ChannexApiError && e.status === 429) await c.query("UPDATE channex_inbound_dispatch SET next_request_at=now()+($1*interval '1 millisecond') WHERE id=1", [delay]);
      }
      return "ack";
    }
    try {
      const revisions = await remote.feed(fetch);
      if (!Array.isArray(revisions) || revisions.length > 1000) throw Error("INVALID_FEED");
      for (const revision of revisions) await persistInboundRevision(pool, fetch.id, revision);
      // A new webhook received during the fetch must not be erased. Nonempty
      // pages keep draining the feed after durable ACKs; no /bookings requests.
      await c.query(`UPDATE channex_inbound_settings SET notification_pending=(notification_version<>$2 OR $3),fetch_attempts=0,
        next_fetch_at=now()+interval '30 seconds' WHERE connection_id=$1`, [fetch.id, fetch.notification_version, revisions.length > 0]);
    } catch (e) {
      const delay = retryDelay(fetch.fetch_attempts, e instanceof ChannexApiError ? e.retryAfter : null);
      await c.query("UPDATE channex_inbound_settings SET fetch_attempts=fetch_attempts+1,next_fetch_at=now()+($2*interval '1 millisecond') WHERE connection_id=$1", [fetch.id, delay]);
      if (e instanceof ChannexApiError && e.status === 429) await c.query("UPDATE channex_inbound_dispatch SET next_request_at=now()+($1*interval '1 millisecond') WHERE id=1", [delay]);
    }
    return "feed";
  } finally { if (locked) await c.query("SELECT pg_advisory_unlock(1296126535,906)").catch(() => undefined); c.release(); }
}
export function startInboundWorker(pool: Pool) {
  if (process.env.CHANNEX_INBOUND_STAGING_ENABLED !== "true") return () => { };
  let running = false, stopped = false;
  const tick = async () => { if (running || stopped) return; running = true; try { await runInboundOnce(pool); } catch { /* retry from durable state, no payload/credential logs */ } finally { running = false; } };
  // Startup catch-up recovers webhook interruptions, without periodic source
  // table polling or activating a connection that has not opted in.
  void pool.query("UPDATE channex_inbound_settings SET notification_pending=true,notification_version=notification_version+1 WHERE enabled").then(tick).catch(() => undefined);
  const timer = setInterval(tick, 3500); timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
