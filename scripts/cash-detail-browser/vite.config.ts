import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Expose the actual private History component only in this isolated harness.
// The baseline is read from Git, never copied over the current working page.
export default defineConfig({
  root: path.resolve("scripts/cash-detail-browser"),
  plugins: [{
    name: "cash-detail-fixture-export",
    enforce: "pre",
    resolveId(id) {
      if (id === "cash-review-current") return path.resolve("client/src/pages/cash-register.tsx");
      if (id === "cash-review-baseline") return path.resolve("client/src/pages/cash-register.tsx") + "?baseline";
    },
    load(id) {
      if (id.endsWith("/client/src/pages/cash-register.tsx?baseline")) {
        return execFileSync("git", ["show", `${process.env.CASH_REVIEW_BASELINE || "b3e3eb9e111376ee0a86af366153ebcb4774f4f7"}:client/src/pages/cash-register.tsx`], { encoding: "utf8" });
      }
    },
    transform(code, id) {
      if (id.includes("/client/src/pages/cash-register.tsx")) {
        return code.replace('from "@/App"', 'from "/auth-stub.ts"') + "\nexport { HistorialTab };\n";
      }
    },
  }, react()],
  resolve: { alias: {
    "@": path.resolve("client/src"), "@shared": path.resolve("shared"),
  } },
  server: { host: "127.0.0.1", port: 5012, strictPort: true, fs: { allow: [process.cwd()] } },
});
