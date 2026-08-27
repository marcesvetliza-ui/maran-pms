import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Every server test file matches automatically — no per-file allowlist
    // to maintain. Files ending in `.pg.test.ts` need a real PostgreSQL
    // database and run separately (see vitest.server.pg.config.ts /
    // `npm run test:postgres`), so they're excluded from this glob.
    include: ["server/tests/**/*.test.ts"],
    exclude: ["node_modules/**", ".cache/**", "dist/**", "server/tests/**/*.pg.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});
