import {defineConfig} from "vitest/config";
import server from "./vitest.server.config";

// Read-only source inspection and simulated providers. Never includes PG tests.
export default defineConfig({
  ...server,
  test:{
    ...server.test,
    // Do not merge include arrays: Vitest would also run every server test.
    include:["server/tests/programming-assistant-*.test.ts"],
    fileParallelism:false,
    testTimeout:30000,
    env:{DATABASE_URL:"",ASSISTANT_DATABASE_URL:""},
  },
});
