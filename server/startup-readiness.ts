import type { Express } from "express";

/** Listen early, but let the deployment healthcheck wait for routes, required
 * migrations and the permission cache before replacing the active instance. */
export function installStartupReadiness(app: Express, isReady: () => boolean) {
  app.get("/health", (_req, res) => {
    const ready = isReady();
    res.setHeader("Cache-Control", "no-store");
    if (!ready) res.setHeader("Retry-After", "3");
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "starting" });
  });
  app.use((req, res, next) => {
    if (isReady()) return next();
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "3");
    if (req.path === "/") return res.status(200).json({ status: "starting" });
    return res.status(503).json({ message: "La aplicación se está iniciando" });
  });
}
