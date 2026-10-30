import type { RequestHandler } from "express";
import { canViewCash, canOperateCash, hasGlobalCashAccess } from "@shared/cash-user-access";

export const requireCashView: RequestHandler = (req, res, next) => {
  if (!canViewCash(req.user?.username)) {
    res.status(403).json({ error: "Tu cuenta no tiene acceso a cajas." });
    return;
  }
  next();
};

/** Closing hands over to a new open shift; taking a shift is also an operation.
 * For existing shifts resolve their stored area, ignoring any body area/operator.
 */
export function cashShiftAccess(loadArea: (id: string) => Promise<string | undefined>): RequestHandler {
  return async (req, res, next) => {
    const path = req.path.toLowerCase().replace(/\/+$/, "");
    const lifecycle = req.method === "POST" && path === "/shifts/open"
      || req.method === "POST" && /^\/shifts\/[^/]+\/close$/.test(path)
      || req.method === "PATCH" && /^\/shifts\/[^/]+\/tomar$/.test(path);
    if (req.method === "POST" && path === "/init-shifts"
      && !hasGlobalCashAccess(req.user?.username)) {
      res.status(403).json({ error: "No tenés permiso para inicializar cajas." });
      return;
    }
    if (!lifecycle) return next();
    try {
      let area = req.body?.area;
      if (path !== "/shifts/open") {
        area = await loadArea(decodeURIComponent(req.path.split("/")[2]));
        if (area === undefined) {
          res.status(404).json({ error: "Turno no encontrado." });
          return;
        }
      }
      if (typeof area !== "string" || !canOperateCash(req.user?.username, area)) {
        res.status(403).json({ error: "No tenés permiso para abrir, tomar o cerrar esta caja." });
        return;
      }
      next();
    } catch (error) { next(error); }
  };
}
