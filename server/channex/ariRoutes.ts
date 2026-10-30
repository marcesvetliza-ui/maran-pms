import type { Express } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../auth';
import { inventoryPreview, STAGING_URL, addDays } from './ari';

const settingsInput = z.object({ floor: z.number().int().min(-5).max(100), currency: z.string().regex(/^[A-Z]{3}$/), enabled: z.boolean() }).strict();
async function enqueueFull(c: PoolClient, id: string, today: string) {
  if ((await c.query(`SELECT 1 FROM channex_ari_outbox WHERE connection_id=$1 AND reason='full_sync' AND created_at>now()-interval '24 hours' LIMIT 1`, [id])).rowCount) throw Error('Ya hay una sincronización completa registrada en las últimas 24 horas');
  await c.query(`INSERT INTO channex_ari_outbox(connection_id,kind,date_from,date_to,reason)
  SELECT $1,kind,$2,$3,'full_sync' FROM (VALUES('availability'),('restrictions')) k(kind)`, [id, today, addDays(today, 499)]);
}
export function registerChannexAriRoutes(app: Express, pool: Pool) {
  const configure = requirePermission('api:channex:config');
  app.get('/api/channex/connections/:id/ari', requireAuth, async (req, res) => {
    try {
      const c = await pool.connect(); try {
        if (!(await c.query('SELECT id FROM channex_connections WHERE id=$1', [req.params.id])).rowCount) return res.status(404).json({ error: 'Conexión no encontrada' });
        const settings = (await c.query('SELECT floor,currency,enabled,updated_at FROM channex_ari_settings WHERE connection_id=$1', [req.params.id])).rows[0] ?? { floor: 2, currency: 'ARS', enabled: false };
        const previewFloor = req.query.floor === undefined ? settings.floor : z.coerce.number().int().min(-5).max(100).parse(req.query.floor);
        const rooms = await inventoryPreview(c, req.params.id, previewFloor);
        const summary = (await c.query(`SELECT status,count(*)::int AS count FROM channex_ari_outbox WHERE connection_id=$1 GROUP BY status`, [req.params.id])).rows;
        const events = (await c.query(`SELECT id::text,kind,date_from::text,date_to::text,reason,status,attempts,task_ids,last_error,created_at FROM channex_ari_outbox WHERE connection_id=$1 ORDER BY id DESC LIMIT 30`, [req.params.id])).rows;
        res.json({ settings, rooms, summary, events, dispatchEnabled: process.env.CHANNEX_ARI_STAGING_ENABLED === 'true' });
      } finally { c.release(); }
    } catch (error) { res.status(error instanceof z.ZodError ? 400 : 503).json({ error: 'No se pudo consultar el alcance y la cola de Channex' }); }
  });
  app.patch('/api/channex/connections/:id/ari', configure, async (req, res) => {
    const parsed = settingsInput.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Indicá piso, moneda de tres letras y estado de captura' });
    let c: PoolClient | undefined;
    try {
      c = await pool.connect();
      await c.query('BEGIN');
      const connection = (await c.query('SELECT id,environment,base_url,is_active FROM channex_connections WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!connection) { await c.query('ROLLBACK'); return res.status(404).json({ error: 'Conexión no encontrada' }); }
      const previous = (await c.query('SELECT * FROM channex_ari_settings WHERE connection_id=$1', [req.params.id])).rows[0];
      const settings = parsed.data;
      if (previous?.enabled && (settings.floor !== previous.floor || settings.currency !== previous.currency)) throw Error('Pausá la captura antes de cambiar el piso o la moneda');
      if (settings.enabled) {
        if (connection.environment !== 'demo' || connection.base_url.replace(/\/$/, '') !== STAGING_URL || !connection.is_active) throw Error('Esta etapa requiere una conexión activa a Channex staging');
        const rooms = await inventoryPreview(c, req.params.id, settings.floor);
        if (!rooms.length || rooms.some(r => !r.channexRoomTypeId)) throw Error('El piso debe tener habitaciones físicas activas y todas sus categorías mapeadas');
        const maps = (await c.query('SELECT room_type_id FROM channex_room_type_mappings WHERE connection_id=$1', [req.params.id])).rows;
        if (maps.some(m => !m.room_type_id) || new Set(maps.map(m => m.room_type_id)).size !== maps.length) throw Error('Cada categoría debe tener un mapeo completo y único');
      }
      const today = (await c.query(`SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS today`)).rows[0].today;
      await c.query(`INSERT INTO channex_ari_settings(connection_id,floor,currency,enabled,last_horizon_date,capture_started_at)
    VALUES($1,$2,$3,$4,CASE WHEN $4 THEN $5::date END,CASE WHEN $4 THEN now() END)
    ON CONFLICT(connection_id) DO UPDATE SET floor=EXCLUDED.floor,currency=EXCLUDED.currency,enabled=EXCLUDED.enabled,
      capture_started_at=COALESCE(channex_ari_settings.capture_started_at,EXCLUDED.capture_started_at),
      last_horizon_date=CASE WHEN channex_ari_settings.capture_started_at IS NULL THEN EXCLUDED.last_horizon_date ELSE channex_ari_settings.last_horizon_date END,
      updated_at=now()`, [req.params.id, settings.floor, settings.currency, settings.enabled, today]);
      if (settings.enabled && !previous?.capture_started_at) await enqueueFull(c, req.params.id, today);
      else if (previous?.capture_started_at && (settings.floor !== previous.floor || settings.currency !== previous.currency)) {
        await c.query(`INSERT INTO channex_ari_outbox(connection_id,kind,date_from,date_to,reason)
          SELECT $1,kind,$2,$3,'scope_change' FROM (VALUES('availability'),('restrictions')) k(kind)`, [req.params.id, today, addDays(today, 499)]);
      }
      await c.query('COMMIT'); res.json({ settings });
    } catch (error) { await c?.query('ROLLBACK'); res.status(409).json({ error: error instanceof Error && !('code' in error) ? error.message : 'No se pudo guardar el alcance de Channex' }); } finally { c?.release(); }
  });
  app.post('/api/channex/connections/:id/ari/full-sync', configure, async (req, res) => {
    let c: PoolClient | undefined; try {
      c = await pool.connect();
      await c.query('BEGIN');
      const setting = (await c.query('SELECT enabled FROM channex_ari_settings WHERE connection_id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!setting?.enabled) throw Error('Configurá el alcance y activá la captura antes de sincronizar');
      if ((await c.query(`SELECT 1 FROM channex_ari_outbox WHERE connection_id=$1 AND reason='full_sync' AND created_at>now()-interval '24 hours' LIMIT 1`, [req.params.id])).rowCount) throw Error('Ya hay una sincronización completa registrada en las últimas 24 horas');
      const today = (await c.query(`SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS today`)).rows[0].today;
      await enqueueFull(c, req.params.id, today); await c.query('COMMIT'); res.status(202).json({ queued: true });
    } catch (error) { await c?.query('ROLLBACK'); res.status(409).json({ error: error instanceof Error && !('code' in error) ? error.message : 'No se pudo programar la sincronización' }); } finally { c?.release(); }
  });
  app.post('/api/channex/connections/:id/ari/retry', configure, async (req, res) => {
    try { const result = await pool.query(`UPDATE channex_ari_outbox SET status='pending',run_after=now(),last_error=NULL WHERE connection_id=$1 AND status='blocked' RETURNING id`, [req.params.id]); res.json({ queued: result.rowCount }); }
    catch { res.status(503).json({ error: 'No se pudo reintentar la cola de Channex' }); }
  });
}
