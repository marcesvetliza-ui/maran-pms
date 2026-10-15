import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
// Dedicated synthetic client only. Never used by the application build/deploy.
export default defineConfig({
  root: path.resolve(import.meta.dirname, "demo/funding"),
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "client/src"), "@shared": path.resolve(import.meta.dirname, "shared") } },
  css: { postcss: path.resolve(import.meta.dirname) },
  server: { host: "127.0.0.1", port: 8100, strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8099" },
    fs: { allow: [path.resolve(import.meta.dirname)], deny: ["**/.*"] },
  },
});
