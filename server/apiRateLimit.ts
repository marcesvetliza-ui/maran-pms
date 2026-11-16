import { Router, type Request } from 'express';
import {rateLimit,ipKeyGenerator, type AugmentedRequest, type RateLimitExceededEventHandler} from 'express-rate-limit';
import { logger } from './logger';

function identityKey(req: Request) {
  return req.isAuthenticated?.() && req.user?.id
    ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown')}`;
}

function sessionAction(req: Request) {
  const path = req.originalUrl.split('?')[0].replace(/\/$/, '').toLowerCase();
  if (['GET', 'HEAD'].includes(req.method) && path === '/api/auth/me') return 'verify';
  if (req.method === 'POST' && path === '/api/auth/logout') return 'logout';
  return null;
}

function limited(scope: string): RateLimitExceededEventHandler {
  return (req, res, _next, options) => {
    // The normal HTTP logger runs after the limiter. Record the first rejection
    // in each window, without cookies, headers, query strings or request bodies.
    const info = (req as AugmentedRequest).rateLimit;
    if (info && info.used === info.limit + 1) {
      logger.warn('API request limit reached', {
        scope, method: req.method, path: req.path, userId: req.user?.id || null,
        retryAfter: res.getHeader('Retry-After'),
      });
    }
    res.status(options.statusCode).send(options.message);
  };
}

/** Install after Passport restores the server-side session. Staff sharing
 * the hotel IP have separate quotas; anonymous requests remain IP-limited. */
export function createApiLimiter(max = 500, sessionMax = 60) {
  const router = Router();
  // Business activity must not prevent verification or a manual logout.
  // These two operations retain their own per-user/IP and per-action limits.
  router.use(rateLimit({
    windowMs:60*1000,max:sessionMax,standardHeaders:true,legacyHeaders:false,
    message:{error:'Demasiadas verificaciones de sesión. Esperá un momento.'},
    keyGenerator:req=>`${sessionAction(req)}:${identityKey(req)}`,
    skip:req=>sessionAction(req) === null,
    handler:limited('session'),
  }));
  router.use(rateLimit({
    windowMs:15*60*1000,max,standardHeaders:true,legacyHeaders:false,
    message:{error:'Demasiadas solicitudes, intente en unos minutos'},
    keyGenerator:identityKey,
    skip:req=>sessionAction(req) !== null || req.originalUrl.split('?')[0].startsWith('/api/public/'),
    handler:limited('business'),
  }));
  return router;
}
