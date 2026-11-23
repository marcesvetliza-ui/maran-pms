import type { Express } from 'express';
import { requireAuth, requirePermission } from '../auth';
import { previewGroupAssignment, releaseGroupAssignment } from '../groupAssignmentRelease';

export function registerGroupAssignmentReleaseRoutes(app: Express) {
  const path = '/api/groups/:groupId/reservations/:reservationId';
  app.get(path + '/assignment-preview', requireAuth, requirePermission('sidebar:/groups'), async (req, res) => {
    try { res.json(await previewGroupAssignment(req.params.groupId, req.params.reservationId)); }
    catch (e: any) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'No se pudo verificar la asignación.' }); }
  });
  app.post(path + '/release-assignment', requireAuth, requirePermission('sidebar:/groups'), async (req, res) => {
    try { res.json(await releaseGroupAssignment(req.params.groupId, req.params.reservationId, req.body, req.user || {})); }
    catch (e: any) {
      if (!e.statusCode && e.code !== '55P03') console.error('Error liberando asignación grupal', e);
      res.status(e.statusCode || (e.code === '55P03' ? 409 : 500)).json({ error: e.statusCode ? e.message : e.code === '55P03' ? 'La cuenta está procesando otra operación. Actualizá y reintentá.' : 'No se pudo liberar la asignación. No se guardaron cambios.' });
    }
  });
}
