import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
  hashPassword: vi.fn(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: vi.fn() }));
vi.mock("../db-storage", () => ({
  storage: new Proxy({}, { get: () => vi.fn() }),
  getArgentinaToday: () => "2026-09-11",
}));
vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () => ({ rows: [{ "?column?": 1 }] })),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const { registerRoutes } = await import("../routes");
  const app = express();
  app.use(express.json());
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  await registerRoutes(server, app);
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

describe("GET /api/health — indicador de ambiente piloto (Fase 5)", () => {
  afterEach(() => {
    resetAppEnvForTests();
  });

  it("expone appEnv=pilot e isPilot=true cuando APP_ENV=pilot", async () => {
    resetAppEnvForTests();
    initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.appEnv).toBe("pilot");
      expect(body.isPilot).toBe(true);
    });
  });

  it("expone appEnv=production e isPilot=false cuando APP_ENV=production", async () => {
    resetAppEnvForTests();
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.appEnv).toBe("production");
      expect(body.isPilot).toBe(false);
    });
  });

  it("/api/health sigue siendo público (sin autenticación)", async () => {
    resetAppEnvForTests();
    initAppEnv({ APP_ENV: "test", NODE_ENV: "test" });

    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
    });
  });
});
