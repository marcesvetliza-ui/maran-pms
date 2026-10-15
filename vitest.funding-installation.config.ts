import { defineConfig } from "vitest/config";
import path from "node:path";

// Run AFTER npm run build: exercises the actual packaged service command.
export default defineConfig({ test: { environment: "node", fileParallelism: false,
  include: ["server/tests/spa-funding-installation.isolated.pg.test.ts"] },
  resolve: { alias: { "@shared": path.resolve(import.meta.dirname, "shared") } },
});
