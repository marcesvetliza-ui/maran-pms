import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    // QA must load without depending on an external font provider. In
    // particular a failed @import makes Vite's lazy CSS loader reject planning.
    ...(process.env.VITE_XENIA_PMS_QA === "true" ? [{
      name: "xenia-qa-local-fonts",
      enforce: "pre" as const,
      transform(source: string, id: string) {
        if (!id.endsWith(".css")) return;
        return source.replace(/@import\s+url\(["']https:\/\/fonts\.googleapis\.com\/[^)]+\);?/g, "");
      },
      transformIndexHtml(html: string) {
        return html.replace(/<link\b[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, "")
          .replace(/<title>[^<]*<\/title>/, "<title>Xenia · Pruebas de Alojamiento</title>")
          .replace(/name="description" content="[^"]*"/, 'name="description" content="Xenia: instalación de pruebas de Alojamiento con datos ficticios."');
      },
    }] : []),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
