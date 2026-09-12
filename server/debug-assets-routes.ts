import path from "path";
import type { Express, NextFunction, Request, Response } from "express";
import { requireAuth } from "./auth";
import { assetPathDiagnostic } from "./utils/assetPath";
import { PILOT_EXTERNAL_ROLE } from "./pilot-external-role";

/**
 * Fase 9 del ambiente piloto: estas dos rutas vivían registradas
 * directamente en server/index.ts, antes de registerRoutes() — quedaban
 * fuera del alcance tanto de requireAuth como del middleware
 * authorizePilotExternalRole (server/pilot-external-role.ts), accesibles
 * sin sesión para cualquiera (hallazgo de la auditoría Fase 8).
 *
 * Corrección (ronda 2): requireAuth por sí solo no alcanza — un usuario
 * autenticado con el rol piloto_externo (la cuenta que se le da a un
 * tercero externo) no debe poder ver ninguna de las dos. Pero cada ruta
 * necesita una solución distinta:
 *
 * - GET /api/debug/assets vive bajo /api, así que si se registra DESPUÉS
 *   de que server/routes.ts monte `app.use("/api", authorizePilotExternalRole)`,
 *   ese middleware ya la cubre solo (piloto_externo no está en su
 *   allowlist → 403 por defecto). Por eso esta función se exporta por
 *   separado y se llama desde dentro de registerRoutes(), no desde
 *   server/index.ts.
 * - GET /descargar-colobig-pdf NO vive bajo /api — authorizePilotExternalRole
 *   está montado únicamente con ese prefijo, así que nunca la va a cubrir
 *   sin importar dónde se registre. Necesita su propio chequeo de rol
 *   inline.
 */
function denyPilotExternalRole(req: Request, res: Response, next: NextFunction): void {
  if ((req.user as Express.User | undefined)?.role === PILOT_EXTERNAL_ROLE) {
    res.status(403).json({ message: "No autorizado para esta acción" });
    return;
  }
  next();
}

/** Registrar desde server/index.ts — no vive bajo /api. */
export function registerDebugPdfDownloadRoute(app: Express): void {
  app.get("/descargar-colobig-pdf", requireAuth, denyPilotExternalRole, (_req, res) => {
    const filePath = path.join(process.cwd(), "attached_assets", "Respuesta_Colobig_ImplementacionGastronomica_Julio2026.pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="Respuesta_Colobig_ImplementacionGastronomica_Julio2026.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    res.sendFile(filePath, (err) => { if (err) res.status(404).json({ error: "Archivo no encontrado" }); });
  });
}

/**
 * Registrar desde dentro de registerRoutes() (server/routes.ts), después
 * de app.use("/api", authorizePilotExternalRole) — no desde server/index.ts.
 */
export function registerDebugAssetsApiRoute(app: Express): void {
  app.get("/api/debug/assets", requireAuth, (_req, res) => {
    res.json(assetPathDiagnostic());
  });
}
