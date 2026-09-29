import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 3 del ABM de usuarios: conciliación de Notas de Crédito pendientes
 * pasa de requireRole(FINANCE_RECONCILIATION_ROLES) a
 * requirePermission("api:billing:nc-reconciliation") — resourceKey propio
 * (no ligado al sidebar), mismo array de roles de antes.
 */

vi.mock("../db", () => ({
  db: { execute: () => Promise.resolve({ rows: [] }) },
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(),
  updateBillingConfig: vi.fn(),
}));
vi.mock("../billing/invoicePdf", () => ({
  generarFacturaPDF: vi.fn(),
  generarVoucherHabitacionPDF: vi.fn(),
}));

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));

async function startApp(role: string) {
  const { registerBillingRoutes } = await import("../billing/routes");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role, department: null, phone: null, isActive: "true" } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerBillingRoutes(app);

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

describe("billing NC reconciliation route — migrada a requirePermission(api:billing:nc-reconciliation)", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  beforeEach(() => {
    permissionsState.granted = new Set(["jefe_recepcion:api:billing:nc-reconciliation"]);
  });

  afterEach(async () => {
    await app?.close();
  });

  it("permite a un rol con el permiso", async () => {
    app = await startApp("jefe_recepcion");
    const response = await fetch(`${app.baseUrl}/api/billing/credit-note-reconciliations/pending`);
    expect(response.status).toBe(200);
  });

  it("rechaza con 403 a un rol sin el permiso", async () => {
    app = await startApp("reception");
    const response = await fetch(`${app.baseUrl}/api/billing/credit-note-reconciliations/pending`);
    expect(response.status).toBe(403);
  });
});
