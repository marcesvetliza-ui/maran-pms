import { inboundBookingDetail } from './bookingDetail';
import { inboxQuerySchema, listInboundBookings, inboundBookingHistory } from './inbox';
import {requireChannex, channexAccess} from './access';
import { assignmentRequestSchema, getInboundAssignmentOptions } from './manualAssignment';
import { applyInboundRevision } from './inbound';
import { BookingReviewError } from './bookingRevision';
import {workerEnvironment,operationAllowed,PRODUCTION_URL} from './connectionPolicy';
import type { Express } from "express";
import type { Pool } from "pg";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import { requireAuth, requirePermission } from "../auth";
import { STAGING_URL } from "./ari";
import { getChannexReadiness } from "./readiness";
import { saveSettlementRate, settlementSettingsSchema } from "./settlementConfig";
const tokenHash = (token: string) => createHash("sha256").update(token).digest();
/** Mounted before the session gate; a notification only requests a feed read.
 * No guest payload, URL/query token or browser session can authorize a booking. */
export function registerChannexInboundWebhook(app: Express, pool: Pool) {
  app.post("/api/channex/inbound/:id/notify", rateLimit({ windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const environment=workerEnvironment("inbound");
    if (!environment) return res.sendStatus(404);
    const baseUrl=environment==="real"?PRODUCTION_URL:STAGING_URL;
    const token = req.get("X-Channex-Webhook-Token");
    if (!token || token.length > 256) return res.sendStatus(401);
    try {
      const row = (await pool.query(`SELECT i.token_hash FROM channex_inbound_settings i JOIN channex_connections c ON c.id=i.connection_id
    WHERE i.connection_id=$1 AND i.enabled AND c.is_active AND c.environment='${environment}' AND c.base_url=$2`, [req.params.id, baseUrl])).rows[0];
      const expected = row?.token_hash && Buffer.from(row.token_hash, "hex");
      if (!expected || expected.length !== 32 || !timingSafeEqual(expected, tokenHash(token))) return res.sendStatus(401);
      await pool.query(`UPDATE channex_inbound_settings SET notification_pending=true,notification_version=notification_version+1,next_fetch_at=now() WHERE connection_id=$1 AND enabled`, [req.params.id]);
      res.sendStatus(202);
    } catch { res.sendStatus(503); }
  });
}
export function registerChannexInboundRoutes(app: Express, pool: Pool) {
  const permission = requireChannex("config");
  const root = "/api/channex/connections/:id/inbound";
  app.get("/api/reservations/:id/channex-settlement", requireChannex("read"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const row = (await pool.query(`SELECT source_currency,source_total,exchange_rate,settlement_currency,settlement_total,revision_id,created_at
        FROM channex_inbound_settlements WHERE reservation_id=$1 ORDER BY created_at DESC,revision_id DESC LIMIT 1`, [req.params.id])).rows[0];
      res.json(row || null);
    } catch { res.status(503).json({ error: "No se pudo consultar el importe original del canal" }); }
  });
  app.get(`${root}/bookings`, requireChannex("read"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const parsed = inboxQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: "Filtro o página inválidos" });
    try { res.type("application/json").send(JSON.stringify(await listInboundBookings(pool, req.params.id, parsed.data.view, parsed.data.page, parsed.data))); }
    catch { res.status(503).json({ error: "No se pudo consultar la bandeja de reservas" }); }
  });
  app.get(`${root}/booking-detail/:revisionId`, requireChannex("read"), async (req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    if(req.params.revisionId.length>160)return res.status(400).json({error:"Revisión inválida"});
    try{
      const detail=await inboundBookingDetail(pool,req.params.id,req.params.revisionId,{id:req.user?.id,name:req.user?.username||req.user?.fullName||"Sistema",ip:req.ip});
      if(!detail)return res.status(404).json({error:"Reserva no encontrada"});
      res.type("application/json").send(JSON.stringify(detail));
    }catch{res.status(503).json({error:"No se pudo consultar el detalle de la reserva"});}
  });
  app.get(`${root}/history/:revisionId`, requireChannex("read"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const parsed = inboxQuerySchema.safeParse(req.query);
    if (!parsed.success || req.params.revisionId.length > 160) return res.status(400).json({ error: "Página o revisión inválidas" });
    try { res.type("application/json").send(JSON.stringify(await inboundBookingHistory(pool, req.params.id, req.params.revisionId, parsed.data.page))); }
    catch { res.status(503).json({ error: "No se pudo consultar el historial de la reserva" }); }
  });
  const assignmentError = (res: any, error: any) => {
    if (error?.response && error?.statusCode) return res.status(error.statusCode).json(error.response);
    if (error instanceof BookingReviewError) {
      const messages: Record<string, string> = {
        INVALID_BOOKING: 'La reserva recibida tiene datos incompletos o con un formato no compatible. Revisá los datos de origen en Channex.',
        ROOM_TAX_TOTAL_REQUIRES_REVIEW: 'El total de la habitación no coincide con las tarifas y el IVA informado por el canal. Revisá el desglose antes de asignar.',
        TOTAL_REQUIRES_REVIEW: 'El total de la reserva no coincide con la suma de sus habitaciones. Revisá los importes recibidos del canal.',
        SETTLEMENT_RATE_REQUIRED: 'Guardá una cotización válida de pesos por dólar en Configuración y mapeos → Cotización antes de asignar.',
      };
      return res.status(409).json({ error: messages[error.code] || 'La reserva necesita revisión antes de asignarse.', code: error.code });
    }
    if (error?.code?.startsWith('ASSIGNMENT_') || ['NOT_FOUND','CATEGORY_CHANGE_CONFIRMATION_REQUIRED','MANUAL_SCOPE_CONFIRMATION_REQUIRED'].includes(error?.code))
      return res.status(error.statusCode || 409).json({ error: error.message, code: error.code });
    return res.status(409).json({ error: 'No se pudo asignar la reserva. Actualizá las habitaciones disponibles y revisá la configuración.' });
  };
  app.get(`${root}/assignment/:revisionId`, requireChannex('bookings'), async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.params.revisionId.length > 160) return res.sendStatus(400);
    try {
      const access = await channexAccess(req.user!.id);
      res.json(await getInboundAssignmentOptions(req.params.id, req.params.revisionId, access.config));
    } catch (error) { assignmentError(res, error); }
  });
  app.post(`${root}/assign/:revisionId`, requireChannex('bookings'), async (req, res) => {
    const parsed = assignmentRequestSchema.safeParse(req.body);
    if (!parsed.success || req.params.revisionId.length > 160) return res.status(400).json({error:'Revisá las habitaciones, las confirmaciones y el motivo de la asignación.'});
    try {
      const access = await channexAccess(req.user!.id);
      const result = await applyInboundRevision(req.params.id, req.params.revisionId, {...parsed.data,
        actor: {id:req.user!.id,name:req.user!.username || req.user!.fullName || 'Sistema',ip:req.ip},canOverrideScope:access.config});
      if (!result?.applied) return res.status(409).json({error:'La reserva cambió. Actualizá la bandeja antes de asignarla.'});
      res.json(result);
    } catch (error) { assignmentError(res, error); }
  });
  app.patch(`${root}/settlement-rate`, permission, async (req, res) => {
    const parsed = settlementSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Indicá pesos por dólar (hasta seis decimales) y el motivo o fuente de la cotización." });
    try {
      await saveSettlementRate(pool, req.params.id, parsed.data, (req as any).user?.username || "sistema");
      res.json({ ok: true });
    } catch { res.status(409).json({ error: "No se pudo guardar la cotización. Revisá la conexión y su configuración de recepción." }); }
  });
  app.get(`${root}/readiness`, permission, async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const readiness = await getChannexReadiness(pool, req.params.id);
      if (!readiness) return res.status(404).json({ error: "Conexión no encontrada" });
      res.json(readiness);
    } catch { res.status(503).json({ error: "No se pudo revisar la preparación de la conexión" }); }
  });
  app.get(root, requireChannex("read"), async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const settings = (await pool.query("SELECT enabled,token_hash IS NOT NULL AS has_token,fetch_attempts,notification_pending,settlement_exchange_rate,exchange_rate_updated_at FROM channex_inbound_settings WHERE connection_id=$1", [req.params.id])).rows[0] ?? { enabled: false, has_token: false };
      const revisions = (await pool.query(`SELECT v.revision_id,v.booking_id,v.status,v.review_code,v.acked_at,v.created_at,
        concat_ws(' ',v.payload#>>'{attributes,customer,name}',v.payload#>>'{attributes,customer,surname}') AS guest_name,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'code',r.reservation_code,'guestName',concat_ws(' ',g.first_name,g.last_name),'roomNumber',rm.room_number,'checkInDate',r.check_in_date,'checkOutDate',r.check_out_date,'status',r.status) ORDER BY rm.room_number)
          FROM channex_inbound_rooms link JOIN reservations r ON r.id=link.reservation_id
          JOIN guests g ON g.id=r.guest_id JOIN rooms rm ON rm.id=r.room_id
          WHERE link.connection_id=v.connection_id AND link.booking_id=v.booking_id),'[]'::jsonb) AS reservations
        FROM channex_inbound_revisions v WHERE v.connection_id=$1 ORDER BY v.created_at DESC LIMIT 50`, [req.params.id])).rows;
      res.type("application/json").send(JSON.stringify({ settings, revisions, serverEnabled: !!workerEnvironment("inbound") }));
    } catch { res.status(503).json({ error: "No se pudo consultar la recepción de reservas" }); }
  });
  app.patch(root, permission, async (req, res) => {
    if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "Indicá si se habilita la recepción" });
    try {
      const connection=(await pool.query('SELECT environment,base_url FROM channex_connections WHERE id=$1',[req.params.id])).rows[0];
      if(req.body.enabled&&!operationAllowed(connection,'inbound'))return res.status(409).json({error:'La recepción de este entorno todavía no está habilitada.'});
      const baseUrl=connection?.environment==='real'?PRODUCTION_URL:STAGING_URL;
      const environment=connection?.environment;
      const result = await pool.query(`INSERT INTO channex_inbound_settings(connection_id,enabled,notification_pending)
    SELECT c.id,$2,$2 FROM channex_connections c LEFT JOIN channex_ari_settings a ON a.connection_id=c.id
    WHERE c.id=$1 AND (NOT $2 OR (c.environment=$4 AND c.base_url=$3 AND c.is_active AND a.enabled))
    ON CONFLICT(connection_id) DO UPDATE SET enabled=EXCLUDED.enabled,notification_pending=EXCLUDED.notification_pending,
    notification_version=channex_inbound_settings.notification_version+1,updated_at=now() RETURNING connection_id`, [req.params.id, req.body.enabled, baseUrl,environment]);
      if (!result.rowCount) return res.status(409).json({ error: "Revisá la conexión y habilitá su alcance antes de recibir reservas" });
      res.json({ ok: true });
    } catch { res.status(503).json({ error: "No se pudo cambiar la recepción" }); }
  });
  app.post(`${root}/webhook-token`, permission, async (req, res) => {
    const token = randomBytes(32).toString("hex");
    try {
      const updated = await pool.query(`INSERT INTO channex_inbound_settings(connection_id,enabled,token_hash)
        SELECT id,false,$2 FROM channex_connections WHERE id=$1
        ON CONFLICT(connection_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,updated_at=now()
        RETURNING connection_id`, [req.params.id, tokenHash(token).toString("hex")]);
      if (!updated.rowCount) return res.status(404).json({ error: "Conexión no encontrada" });
      res.setHeader("Cache-Control", "private, no-store"); res.type("application/json").send(JSON.stringify({ token, header: "X-Channex-Webhook-Token", path: `/api/channex/inbound/${encodeURIComponent(req.params.id)}/notify` }));
    } catch { res.status(503).json({ error: "No se pudo generar el acceso del webhook" }); }
  });
  app.post(`${root}/retry`, requireChannex("bookings"), async (req, res) => {
    if (typeof req.body?.revisionId !== "string") return res.sendStatus(400);
    try {
      const updated = await pool.query(`UPDATE channex_inbound_revisions SET status='pending',review_code=NULL WHERE connection_id=$1 AND revision_id=$2 AND status='review'
    AND review_code NOT IN ('REVISION_ID_COLLISION','WRONG_PROPERTY','INVALID_REVISION','MASKED_GUEST_DATA') RETURNING revision_id`, [req.params.id, req.body.revisionId]);
      if (!updated.rowCount) return res.status(409).json({ error: "La revisión no se puede reintentar automáticamente" });
      res.json({ ok: true });
    } catch { res.status(503).json({ error: "No se pudo reintentar la revisión" }); }
  });
}
