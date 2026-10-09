import express from "express";
import { afterEach, describe, it, expect, vi } from "vitest";
import { initAppEnv } from "../app-env";
import { registerProgrammingSupport } from "../routes/programming-support";
vi.mock("../auth", () => ({
  requireAuth: (req: any, res: any, next: () => void) => {
    if (req.headers["x-test-role"]) {
      req.user = { id: "user-one", role: req.headers["x-test-role"] };
      next();
    } else res.sendStatus(401);
  },
  requirePermission: () => (req: any, res: any, next: () => void) =>
    req.user.role === "admin" ? next() : res.sendStatus(403),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  initAppEnv({ APP_ENV: "test", NODE_ENV: "test" });
});
describe("PMS support gateway", () => {
  it("requires administrator access, stays off outside pilot, and strips forged identity", async () => {
    const originalFetch = global.fetch;
    const calls: any[] = [];
    vi.stubEnv("SUPPORT_ENABLED", "true");
    vi.stubEnv("SUPPORT_SERVICE_URL", "http://assistant.invalid");
    vi.stubEnv("SUPPORT_SHARED_SECRET", "private-service-key-for-the-test");
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "a".repeat(40));
    vi.spyOn(global, "fetch").mockImplementation(async (input, options) => {
      if (String(input).includes("assistant.invalid")) {
        calls.push(options);
        return new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, options);
    });
    const app = express();
    app.use(express.json());
    registerProgrammingSupport(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.on("listening", r));
    const url = `http://127.0.0.1:${(server.address() as any).port}/api/programming-support/cases`;
    try {
      initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
      expect((await originalFetch(url)).status).toBe(401);
      expect(
        (await originalFetch(url, { headers: { "x-test-role": "reception" } }))
          .status,
      ).toBe(403);
      initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
      expect(
        (await originalFetch(url, { headers: { "x-test-role": "admin" } }))
          .status,
      ).toBe(404);
      expect(calls).toHaveLength(0);
      initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
      expect(
        (
          await originalFetch(url, {
            headers: {
              "x-test-role": "admin",
              "X-Support-User": "forged-user",
            },
          })
        ).status,
      ).toBe(200);
      expect(calls[0].headers["X-Support-User"]).toBe("user-one");
      expect(
        (
          await originalFetch(url, {
            method: "POST",
            headers: {
              "x-test-role": "admin",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestId: "not-a-uuid",
              createdBy: "forged",
            }),
          })
        ).status,
      ).toBe(400);
      expect(calls).toHaveLength(1);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
