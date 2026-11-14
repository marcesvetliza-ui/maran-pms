vi.mock("../permissions", () => ({
  hasPermission: (role: string, key: string) =>
    role === "reviewer" &&
    ["api:support:view-all", "api:support:review"].includes(key),
}));
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
  requirePermission: (key: string) => (req: any, res: any, next: () => void) =>
    req.user.role === "admin" ||
    (key === "sidebar:/programming-support" &&
      ["support-user", "reviewer"].includes(req.user.role))
      ? next()
      : res.sendStatus(403),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  initAppEnv({ APP_ENV: "test", NODE_ENV: "test" });
});
describe("PMS support gateway", () => {
  it("does not expire the PMS session when the separate assistant rejects its service credential", async () => {
    const originalFetch = global.fetch;
    vi.stubEnv("SUPPORT_ENABLED", "true");
    vi.stubEnv("SUPPORT_CONVERSATIONAL_ENABLED", "true");
    vi.stubEnv("SUPPORT_SERVICE_URL", "http://assistant.invalid");
    vi.stubEnv("SUPPORT_SHARED_SECRET", "synthetic-gateway-secret");
    initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
    vi.spyOn(global, "fetch").mockImplementation(async (input, options) =>
      String(input).includes("assistant.invalid")
        ? new Response('{"error":"No autorizado"}', {
            status: 401,
            headers: { "Content-Type": "application/json" },
          })
        : originalFetch(input, options),
    );
    const app = express();
    app.use(express.json());
    registerProgrammingSupport(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${(server.address() as any).port}/api/programming-support`;
    try {
      for (const path of ["/usage", "/cases"]) {
        const response = await originalFetch(base + path, {
          headers: { "x-test-role": "admin" },
        });
        expect(response.status).toBe(503);
        expect((await response.json()).error).toContain(
          "El PMS sigue funcionando",
        );
      }
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
  it("protects chat, images, budget and notification routes and derives every capability on the server", async () => {
    const originalFetch = global.fetch,
      calls: any[] = [];
    vi.stubEnv("SUPPORT_ENABLED", "true");
    vi.stubEnv("SUPPORT_CONVERSATIONAL_ENABLED", "true");
    vi.stubEnv("SUPPORT_SERVICE_URL", "http://assistant.invalid");
    vi.stubEnv("SUPPORT_SHARED_SECRET", "synthetic-gateway-secret");
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "a".repeat(40));
    initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
    vi.spyOn(global, "fetch").mockImplementation(async (input, options) => {
      if (String(input).includes("assistant.invalid")) {
        calls.push({ url: String(input), ...options });
        return new Response("{}", {
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, options);
    });
    const app = express();
    app.use(express.json());
    registerProgrammingSupport(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${(server.address() as any).port}/api/programming-support`;
    const headers = {
      "x-test-role": "support-user",
      "Content-Type": "application/json",
      "X-Support-User": "forged",
      "X-Support-Reviewer": "true",
    };
    try {
      const payload = {
        requestId: "11111111-1111-4111-8111-111111111111",
        text: "Necesito ayuda con una reserva",
      };
      expect(
        (
          await originalFetch(base + "/chat", {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          })
        ).status,
      ).toBe(200);
      expect(calls[0].headers).toMatchObject({
        "X-Support-User": "user-one",
        "X-Support-Reviewer": "false",
        "X-Support-View-All": "false",
      });
      expect(
        (
          await originalFetch(base + "/chat", {
            method: "POST",
            headers,
            body: JSON.stringify({ ...payload, canReview: true }),
          })
        ).status,
      ).toBe(400);
      for (const path of ["/alerts", "/usage/pending"])
        expect((await originalFetch(base + path, { headers })).status).toBe(
          403,
        );
      for (const path of ["/budget", "/alerts/test", "/usage/reconcile"])
        expect(
          (
            await originalFetch(base + path, {
              method: "POST",
              headers,
              body: "{}",
            })
          ).status,
        ).toBe(403);
      expect(calls).toHaveLength(1);
      expect(
        (
          await originalFetch(
            base + "/images/22222222-2222-4222-8222-222222222222",
            { headers },
          )
        ).status,
      ).toBe(200);
      expect(calls[1].headers["X-Support-View-All"]).toBe("false");
      expect(calls[1].redirect).toBe("error");
      initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
      expect((await originalFetch(base + "/usage", { headers })).status).toBe(
        404,
      );
      expect(calls).toHaveLength(2);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
  it("uses a separate support permission and never forwards forged review capabilities", async () => {
    const originalFetch = global.fetch,
      calls: any[] = [];
    vi.stubEnv("SUPPORT_ENABLED", "true");
    vi.stubEnv("SUPPORT_SERVICE_URL", "http://assistant.invalid");
    vi.stubEnv("SUPPORT_SHARED_SECRET", "synthetic-secret-for-gateway");
    initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
    vi.spyOn(global, "fetch").mockImplementation(async (input, options) => {
      if (String(input).includes("assistant.invalid")) {
        calls.push(options);
        return new Response("[]", {
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, options);
    });
    const app = express();
    app.use(express.json());
    registerProgrammingSupport(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const url = `http://127.0.0.1:${(server.address() as any).port}/api/programming-support/cases`;
    try {
      expect(
        (
          await originalFetch(url, {
            headers: {
              "x-test-role": "support-user",
              "X-Support-Reviewer": "true",
              "X-Support-View-All": "true",
              "X-Support-Mode": "simulation",
            },
          })
        ).status,
      ).toBe(200);
      expect(calls[0].headers).toMatchObject({
        "X-Support-Reviewer": "false",
        "X-Support-View-All": "false",
        "X-Support-Mode": "legacy",
      });
      expect(
        (
          await originalFetch(
            url + "/11111111-1111-4111-8111-111111111111/decision",
            {
              method: "POST",
              headers: {
                "x-test-role": "support-user",
                "Content-Type": "application/json",
                "X-Support-Reviewer": "true",
              },
              body: "{}",
            },
          )
        ).status,
      ).toBe(403);
      expect(calls).toHaveLength(1);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

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
      const feedback = {
        requestId: "11111111-1111-4111-8111-111111111111",
        reportId: "a".repeat(40),
        outcome: "unresolved",
      };
      const endpoint = url + "/22222222-2222-4222-8222-222222222222/feedback";
      expect(
        (
          await originalFetch(endpoint, {
            method: "POST",
            headers: {
              "x-test-role": "admin",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(feedback),
          })
        ).status,
      ).toBe(200);
      expect(JSON.parse(calls[1].body)).toEqual(feedback);
      expect(
        (
          await originalFetch(endpoint, {
            method: "POST",
            headers: {
              "x-test-role": "admin",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ...feedback, createdBy: "forged" }),
          })
        ).status,
      ).toBe(400);
      expect(calls).toHaveLength(2);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
