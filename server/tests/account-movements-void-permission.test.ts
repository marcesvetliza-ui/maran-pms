import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 3 del ABM de usuarios: POST /api/account-movements/:id/void pasa de
 * requireRole(["admin", "manager"]) a requirePermission("api:account-movements:void")
 * — resourceKey propio, mismo array de roles de antes.
 */

vi.mock("../db-storage", () => ({
  storage: { voidDirectAccountPayment: () => Promise.resolve({ ok: true }) },
  getArgentinaToday: () => "2026-09-01",
}));
vi.mock("../db", () => ({
  db: { execute: () => Promise.resolve({ rows: [] }) },
  pool: { query: vi.fn(), connect: vi.fn() },
}));

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));

async function startApp(role: string) {
  const { registerGuestsRoutes } = await import("../routes/guests");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role, department: null, phone: null, isActive: "true" } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerGuestsRoutes(app);

  return await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((res, rej) => server.close((error) => error ? rej(error) : res())),
      });
    });
  });
}

describe("account-movements void route — migrada a requirePermission(api:account-movements:void)", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  beforeEach(() => {
    permissionsState.granted = new Set(["manager:api:account-movements:void"]);
  });

  afterEach(async () => {
    await app?.close();
  });

  it("permite a un rol con el permiso", async () => {
    app = await startApp("manager");
    const response = await fetch(`${app.baseUrl}/api/account-movements/mov-1/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Error de carga" }),
    });
    expect(response.status).toBe(200);
  });

  it("rechaza con 403 a un rol sin el permiso", async () => {
    app = await startApp("reception");
    const response = await fetch(`${app.baseUrl}/api/account-movements/mov-1/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Error de carga" }),
    });
    expect(response.status).toBe(403);
  });
});
