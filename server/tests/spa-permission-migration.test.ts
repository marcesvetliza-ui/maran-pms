import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 3 del ABM de usuarios: dos resourceKeys propios en server/routes/spa.ts
 * — "api:spa:write" (antes SPA_ACCESS_ROLES, escritura de turnos/cuentas/pagos)
 * y "api:spa:fiscal-review" (antes SPA_FISCAL_REVIEW_ROLES, revisión de
 * borradores fiscales) — mismos arrays de roles de antes.
 */

vi.mock("../db", () => ({
  db: { execute: () => Promise.resolve({ rows: [] }) },
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock("../db-storage", () => ({
  storage: { deleteSpaPayment: () => Promise.resolve() },
  getArgentinaToday: () => "2026-09-01",
}));

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));

async function startApp(role: string) {
  const { registerSpaRoutes } = await import("../routes/spa");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role, department: null, phone: null, isActive: "true" } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerSpaRoutes(app);

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

describe("spa routes — migradas a requirePermission", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  afterEach(async () => {
    await app?.close();
  });

  describe("api:spa:write", () => {
    beforeEach(() => {
      permissionsState.granted = new Set(["spa:api:spa:write"]);
    });

    it("permite a un rol con el permiso", async () => {
      app = await startApp("spa");
      const response = await fetch(`${app.baseUrl}/api/spa/payments/pay-1`, { method: "DELETE" });
      expect(response.status).toBe(204);
    });

    it("rechaza con 403 a un rol sin el permiso", async () => {
      app = await startApp("housekeeping");
      const response = await fetch(`${app.baseUrl}/api/spa/payments/pay-1`, { method: "DELETE" });
      expect(response.status).toBe(403);
    });
  });

  describe("api:spa:fiscal-review", () => {
    beforeEach(() => {
      permissionsState.granted = new Set(["resp_administracion:api:spa:fiscal-review"]);
    });

    it("permite a un rol con el permiso", async () => {
      app = await startApp("resp_administracion");
      const response = await fetch(`${app.baseUrl}/api/admin/spa/fiscal-drafts`);
      expect(response.status).toBe(200);
    });

    it("rechaza con 403 a un rol sin el permiso", async () => {
      app = await startApp("reception");
      const response = await fetch(`${app.baseUrl}/api/admin/spa/fiscal-drafts`);
      expect(response.status).toBe(403);
    });
  });
});
