import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/** 
 * Serve static files (JS/CSS/images) immediately on startup.
 * Call this BEFORE httpServer.listen so Replit's healthcheck gets 200 for /
 * (express.static serves index.html for /).
 */
export function serveStaticFiles(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    // In production with missing dist, return 503 until build is ready
    app.use((_req, res) => {
      res.status(503).send("Build not ready");
    });
    return false;
  }

  app.use(express.static(distPath, {
    maxAge: 0,
    index: "index.html",
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }));
  return true;
}

/**
 * SPA catch-all — serves index.html for any unmatched GET route.
 * Call this AFTER all API routes are registered (registerRoutes).
 */
export function serveSpaFallback(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) return;

  app.get("*", (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

/** Legacy combined export — kept for reference but not used in prod startup */
export function serveStatic(app: Express) {
  serveStaticFiles(app);
  serveSpaFallback(app);
}
