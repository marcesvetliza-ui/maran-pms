import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["server/tests/**/*.test.ts"],
    exclude: ["node_modules/**", ".cache/**", "dist/**"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});
