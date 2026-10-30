import type { Express } from "express";
import type { Pool } from "pg";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import { requirePermission } from "../auth";
import { STAGING_URL } from "./ari";
import { getChannexReadiness } from "./readiness";
const tokenHash = (token: string) => createHash("sha256").update(token).digest();
/** Mounted before the session gate; a notification only requests a feed read.
 * No guest payload, URL/query token or browser session can authorize a booking. */
export function registerChannexInboundWebhook(app: Express, pool: Pool) {
  app.post("/api/channex/inbound/:id/notify", rateLimit({ windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (process.env.CHANNEX_INBOUND_STAGING_ENABLED !== "true") return res.sendStatus(404);
    const token = req.get("X-Channex-Webhook-Token");
    if (!token || token.length > 256) return res.sendStatus(401);
    try {
      const row = (await pool.query(`SELECT i.token_hash FROM channex_inbound_settings i JOIN channex_connections c ON c.id=i.connection_id
    WHERE i.connection_id=$1 AND i.enabled AND c.is_active AND c.environment='demo' AND c.base_url=$2`, [req.params.id, STAGING_URL])).rows[0];
      const expected = row?.token_hash && Buffer.from(row.token_hash, "hex");
      if (!expected || expected.length !== 32 || !timingSafeEqual(expected, tokenHash(token))) return res.sendStatus(401);
      await pool.query(`UPDATE channex_inbound_settings SET notification_pending=true,notification_version=notification_version+1,next_fetch_at=now() WHERE connection_id=$1 AND enabled`, [req.params.id]);
      res.sendStatus(202);
    } catch { res.sendStatus(503); }
  });
}
export function registerChannexInboundRoutes(app: Express, pool: Pool) {
  const permission = requirePermission("api:channex:config");
  const root = "/api/channex/connections/:id/inbound";
  app.get(`${root}/readiness`, permission, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const readiness = await getChannexReadiness(pool, req.params.id);
      if (!readiness) return res.status(404).json({ error: "Conexión no encontrada" });
      res.json(readiness);
    } catch { res.status(503).json({ error: "No se pudo revisar la preparación para staging" }); }
  });
  app.get(root, permission, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const settings = (await pool.query("SELECT enabled,token_hash IS NOT NULL AS has_token,fetch_attempts,notification_pending FROM channex_inbound_settings WHERE connection_id=$1", [req.params.id])).rows[0] ?? { enabled: false, has_token: false };
      const revisions = (await pool.query("SELECT revision_id,booking_id,status,review_code,acked_at,created_at FROM channex_inbound_revisions WHERE connection_id=$1 ORDER BY created_at DESC LIMIT 50", [req.params.id])).rows;
      res.json({ settings, revisions, serverEnabled: process.env.CHANNEX_INBOUND_STAGING_ENABLED === "true" });
    } catch { res.status(503).json({ error: "No se pudo consultar la recepción de reservas" }); }
  });
  app.patch(root, permission, async (req, res) => {
    if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "Indicá si se habilita la recepción" });
    try {
      const result = await pool.query(`INSERT INTO channex_inbound_settings(connection_id,enabled,notification_pending)
    SELECT c.id,$2,$2 FROM channex_connections c LEFT JOIN channex_ari_settings a ON a.connection_id=c.id
    WHERE c.id=$1 AND (NOT $2 OR (c.environment='demo' AND c.base_url=$3 AND c.is_active AND a.enabled))
    ON CONFLICT(connection_id) DO UPDATE SET enabled=EXCLUDED.enabled,notification_pending=EXCLUDED.notification_pending,
    notification_version=channex_inbound_settings.notification_version+1,updated_at=now() RETURNING connection_id`, [req.params.id, req.body.enabled, STAGING_URL]);
      if (!result.rowCount) return res.status(409).json({ error: "Revisá la conexión staging y habilitá su alcance antes de recibir reservas" });
      res.json({ ok: true });
    } catch { res.status(503).json({ error: "No se pudo cambiar la recepción" }); }
  });
  app.post(`${root}/webhook-token`, permission, async (req, res) => {
    const token = randomBytes(32).toString("hex");
    try {
      const updated = await pool.query("UPDATE channex_inbound_settings SET token_hash=$2,updated_at=now() WHERE connection_id=$1 RETURNING connection_id", [req.params.id, tokenHash(token).toString("hex")]);
      if (!updated.rowCount) return res.status(409).json({ error: "Configurá primero la recepción" });
      res.setHeader("Cache-Control", "private, no-store"); res.type("application/json").send(JSON.stringify({ token, header: "X-Channex-Webhook-Token", path: `/api/channex/inbound/${encodeURIComponent(req.params.id)}/notify` }));
    } catch { res.status(503).json({ error: "No se pudo generar el acceso del webhook" }); }
  });
  app.post(`${root}/retry`, permission, async (req, res) => {
    if (typeof req.body?.revisionId !== "string") return res.sendStatus(400);
    try {
      const updated = await pool.query(`UPDATE channex_inbound_revisions SET status='pending',review_code=NULL WHERE connection_id=$1 AND revision_id=$2 AND status='review'
    AND review_code NOT IN ('REVISION_ID_COLLISION','WRONG_PROPERTY','INVALID_REVISION') RETURNING revision_id`, [req.params.id, req.body.revisionId]);
      if (!updated.rowCount) return res.status(409).json({ error: "La revisión no se puede reintentar automáticamente" });
      res.json({ ok: true });
    } catch { res.status(503).json({ error: "No se pudo reintentar la revisión" }); }
  });
}
