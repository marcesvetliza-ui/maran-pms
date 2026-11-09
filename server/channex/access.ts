import type { Express, RequestHandler } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { requireAuth } from '../auth';
import { hasPermission } from '../permissions';
import { CHANNEX_CAPABILITIES, type ChannexCapability } from '@shared/channexAccess';
const capabilities = Object.keys(CHANNEX_CAPABILITIES) as ChannexCapability[];
export async function ensureChannexAccessSchema() {
  // Preserve legacy overrides for audit only. Role permissions are authoritative.
  await db.execute(sql`CREATE TABLE IF NOT EXISTS user_permission_overrides(user_id varchar NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,resource_key text NOT NULL,allowed boolean NOT NULL,updated_at timestamp NOT NULL DEFAULT now(),updated_by varchar,UNIQUE(user_id,resource_key))`);
}
export async function channexAccess(userId: string) {
  const user = (await db.execute(sql`SELECT role FROM system_users WHERE id=${userId} AND is_active='true'`)).rows[0] as {role: string} | undefined;
  const owner = user?.role === 'admin';
  const grants = Object.fromEntries(capabilities.map(key => [key, !!user && (owner || hasPermission(user.role, `api:ota:${key}`))])) as Record<ChannexCapability, boolean>;
  return { owner, ownerConfigured: true, entry: Object.values(grants).some(Boolean), ...grants };
}
export function requireChannex(capability: ChannexCapability | 'entry'): RequestHandler {
  return (req, res, next) => requireAuth(req, res, async () => {
    try {
      const access = await channexAccess(req.user!.id);
      if (!access[capability]) return res.status(403).json({ error: 'No tenés permiso para esta función de Canales OTAs.' });
      next();
    } catch { res.status(503).json({ error: 'No se pudo verificar el permiso de Canales OTAs.' }); }
  });
}
export function registerChannexAccessRoutes(app: Express) {
  app.get('/api/channex/access', requireAuth, async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try { res.json(await channexAccess(req.user!.id)); }
    catch { res.status(503).json({ error: 'No se pudieron consultar tus permisos de OTAs.' }); }
  });
  // Old clients must not keep editing a second, invisible permission source.
  const retired: RequestHandler = (req, res) => requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') return res.sendStatus(403);
    res.status(410).json({ error: 'Los accesos de OTAs se administran en Permisos por Rol.' });
  });
  app.get('/api/channex/access/users', retired);
  app.put('/api/channex/access/users/:id', retired);
}
