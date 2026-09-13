import { defineConfig } from "vitest/config";
import path from "path";

// Runs the real-PostgreSQL server integration suite: every
// `server/tests/**/*.pg.test.ts` file, discovered automatically instead of
// via a hand-maintained filename list in package.json. Each of these files
// self-skips (via `describe.skip`) when DATABASE_URL isn't set, so this
// config is also safe to run in environments without a database configured;
// `npm run test:postgres` additionally fails loudly up front when
// DATABASE_URL is missing rather than silently reporting green.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./server/tests/setup.ts"],
    include: ["server/tests/**/*.pg.test.ts"],
    exclude: ["node_modules/**", ".cache/**", "dist/**"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});
