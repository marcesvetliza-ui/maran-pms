import type {Express} from 'express';
import {requireAuth} from '../auth';
import {getBillingConfig} from './billingConfig';
import {HomologationProbeError, probeHomologation} from './homologationProbe';

export function registerHomologationProbeRoutes(app: Express) {
  let inFlight: ReturnType<typeof probeHomologation> | undefined;
  app.post('/api/billing/homologation-check', requireAuth, async (req, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({error: 'La comprobación requiere un administrador.'});
    try {
      if (!inFlight) {
        inFlight = (async () => {
          const config = await getBillingConfig();
          const {getTokenAuth} = await import('./wsaaClient');
          return probeHomologation(config, (cert, key, environment) => getTokenAuth(cert, key, environment));
        })().finally(() => {inFlight = undefined;});
      }
      res.json(await inFlight);
    } catch (error) {
      const known = error instanceof HomologationProbeError;
      res.status(known ? error.statusCode : 503).json({ok: false,
        code: known ? error.code : 'HOMOLOGATION_CHECK_FAILED',
        error: known ? error.message : 'No se pudo completar la comprobación de homologación.'});
    }
  });
}
