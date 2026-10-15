import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test:{
    environment:"node",fileParallelism:false,
    include:["server/tests/payment-funding-spa-routes.isolated.pg.test.ts", "server/tests/payment-funding-client.isolated.pg.test.ts"],
  },
  resolve:{alias:{"@shared":path.resolve(import.meta.dirname,"shared")}},
});
