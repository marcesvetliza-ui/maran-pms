import type { Express } from "express";
import path from "node:path";
import { requireAuth } from "../auth";
import { hasPermission } from "../permissions";
import { MANUAL_TOPICS } from "../../shared/manual-library";

// Never serve these documents from a public/static directory. Every request,
// including browser PDF range requests and downloads, checks the session.
export function registerManualLibraryRoutes(app: Express) {
  const canReadRestricted = (role: string) => hasPermission(role, "api:manuals:restricted");
  app.get("/api/manuals", requireAuth, (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(MANUAL_TOPICS.filter(topic => !topic.restricted || canReadRestricted(req.user!.role)));
  });

  app.get("/api/manuals/:topic/:kind", requireAuth, (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const topic = MANUAL_TOPICS.find(item => item.id === req.params.topic);
    const kind = req.params.kind;
    if (!topic || !topic.documents.some(document => document.kind === kind)) {
      res.status(404).json({ message: "Documento no encontrado" });
      return;
    }
    if (topic.restricted && !canReadRestricted(req.user!.role)) {
      res.status(403).json({ message: "No tenés permiso para consultar este documento" });
      return;
    }
    const root = process.env.NODE_ENV === "production" ? "dist/server/assets" : "server/assets";
    const file = path.resolve(root, "manual-library", topic.id, `${kind}.pdf`);
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename="${topic.id}-${kind}.pdf"`);
    res.type("application/pdf");
    res.sendFile(file, { cacheControl: false }, error => {
      if (error && !res.headersSent) res.status(404).json({ message: "El PDF no está disponible" });
    });
  });
}
