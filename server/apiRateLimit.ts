import {rateLimit,ipKeyGenerator} from 'express-rate-limit';

/** Install after Passport restores the server-side session. Staff sharing
 * the hotel IP have separate quotas; anonymous requests remain IP-limited. */
export function createApiLimiter(max = 500) {
  return rateLimit({
    windowMs:15*60*1000,max,standardHeaders:true,legacyHeaders:false,
    message:{error:'Demasiadas solicitudes, intente en unos minutos'},
    keyGenerator:req=>req.isAuthenticated?.() && req.user?.id
      ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown')}`,
    skip:req=>req.originalUrl.split('?')[0].startsWith('/api/public/'),
  });
}
