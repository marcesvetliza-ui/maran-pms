import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  root: path.resolve("scripts/keyboard-browser"),
  plugins: [react()],
  resolve: { alias: {
    "@": path.resolve("client/src"), "@shared": path.resolve("shared"), "@assets": path.resolve("attached_assets"),
  } },
  server: { host: "0.0.0.0", port: 5011, strictPort: true, allowedHosts: true, fs: { allow: [process.cwd()] } },
});
