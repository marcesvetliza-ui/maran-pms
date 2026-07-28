import path from "path";
import fs from "fs";

/**
 * Resuelve la ruta de un asset del servidor correctamente en dev y producción.
 *
 * Intenta en orden:
 *  1. process.cwd()/dist/server/assets/<filename>  (prod: node dist/index.cjs desde raíz)
 *  2. process.cwd()/server/assets/<filename>        (dev: tsx server/index.ts desde raíz)
 *
 * El build script copia server/assets/ → dist/server/assets/ automáticamente.
 */
export function assetPath(filename: string): string {
  const candidates = [
    path.join(process.cwd(), "dist", "server", "assets", filename),
    path.join(process.cwd(), "server", "assets", filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Devolver el primero (el caller también hace existsSync, así que fallará graciosamente)
  return candidates[0];
}

/**
 * Retorna diagnóstico de paths para el endpoint /api/debug/assets
 */
export function assetPathDiagnostic(): Record<string, unknown> {
  const files = ["grupos-portada.jpg", "spa-cover.jpg", "eventos-cover.jpg", "restaurant-cover.jpg", "recep-cover.jpg"];
  const cwd = process.cwd();
  const results: Record<string, unknown> = { cwd, NODE_ENV: process.env.NODE_ENV };
  for (const f of files) {
    const p1 = path.join(cwd, "dist", "server", "assets", f);
    const p2 = path.join(cwd, "server", "assets", f);
    results[f] = { dist: fs.existsSync(p1), src: fs.existsSync(p2), resolvedTo: assetPath(f) };
  }
  return results;
}
