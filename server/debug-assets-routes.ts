import path from "path";
import type { Express } from "express";
import { requireAuth } from "./auth";
import { assetPathDiagnostic } from "./utils/assetPath";

/**
 * Estas dos rutas vivían registradas directamente en server/index.ts, antes
 * de registerRoutes() — quedaban fuera del alcance de requireAuth,
 * accesibles sin sesión para cualquiera. Se extraen a un módulo propio,
 * con requireAuth explícito, para poder testearlas de forma aislada sin
 * levantar el servidor completo.
 */
export function registerDebugAssetRoutes(app: Express): void {
  app.get("/descargar-colobig-pdf", requireAuth, (_req, res) => {
    const filePath = path.join(process.cwd(), "attached_assets", "Respuesta_Colobig_ImplementacionGastronomica_Julio2026.pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="Respuesta_Colobig_ImplementacionGastronomica_Julio2026.pdf"');
    res.setHeader("Content-Type", "application/pdf");
    res.sendFile(filePath, (err) => { if (err) res.status(404).json({ error: "Archivo no encontrado" }); });
  });

  app.get("/api/debug/assets", requireAuth, (_req, res) => {
    res.json(assetPathDiagnostic());
  });
}
