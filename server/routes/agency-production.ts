import type { Express } from 'express';
import { requireAuth, requirePermission } from '../auth';
import { getAgencyProductionReport, validateAgencyProductionFilters } from '../agencyProduction';

export function registerAgencyProductionRoutes(app: Express) {
  const readAccess = [requireAuth, requirePermission('sidebar:/agencies')];
  app.get('/api/agencies/report', ...readAccess, async (req, res) => {
    try { res.json(await getAgencyProductionReport(validateAgencyProductionFilters(req.query))); }
    catch (error: any) { res.status(error.statusCode || 500).json({ error: error.statusCode === 400 ? error.message : 'No se pudo consultar la producción por agencia.' }); }
  });
  app.get('/api/agencies/:id/stats', ...readAccess, async (req, res) => {
    try {
      const [report] = await getAgencyProductionReport({ agencyId: req.params.id });
      if (!report) return res.status(404).json({ error: 'Agencia no encontrada.' });
      res.json(report);
    } catch (error: any) { res.status(error.statusCode || 500).json({ error: 'No se pudieron consultar las estadísticas de la agencia.' }); }
  });
}
