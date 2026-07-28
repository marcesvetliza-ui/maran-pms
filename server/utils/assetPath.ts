import path from "path";

/**
 * Resuelve la ruta de un asset del servidor correctamente en dev y producción.
 *
 * Dev  (tsx):        process.cwd()/server/assets/<filename>
 * Prod (dist/index.cjs): __dirname = dist/  →  dist/server/assets/<filename>
 *
 * El build script copia server/assets/ → dist/server/assets/ automáticamente.
 */
export function assetPath(filename: string): string {
  if (process.env.NODE_ENV === "production") {
    return path.join(__dirname, "server", "assets", filename);
  }
  return path.join(process.cwd(), "server", "assets", filename);
}
