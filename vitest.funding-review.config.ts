import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node", fileParallelism: false,
    include: ["server/tests/funding-bindings-review.isolated.pg.test.ts"] },
  resolve: { alias: { "@shared": path.resolve(import.meta.dirname, "shared") } },
});
