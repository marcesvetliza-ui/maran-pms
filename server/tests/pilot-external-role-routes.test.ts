import express from "express";
import type { Server } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { PILOT_EXTERNAL_ROLE } from "../pilot-external-role";

// A propósito NO se mockea "../auth": este test tiene que atravesar el
// middleware real de autorización (requireAuth, requireRole y el nuevo
// authorizePilotExternalRole), no una versión mockeada que siempre llame a
// next(). Lo único simulado es la capa de sesión/Passport (ver withServer),
// que en un test HTTP normal requeriría cookies + login real.
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: vi.fn() }));
vi.mock("../db-storage", () => ({
  storage: new Proxy({}, { get: () => vi.fn(async () => null) }),
  getArgentinaToday: () => "2026-09-12",
}));
vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () => ({ rows: [] })),
    select: vi.fn(() => ({ from: () => ({ where: async () => [] }) })),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

async function withServer<T>(role: string, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const { registerRoutes } = await import("../routes");
  const app = express();
  app.use(express.json());
  // Simula una sesión ya autenticada (Passport real no corre en este test:
  // requireAuth/authorizePilotExternalRole sí son reales y operan sobre
  // req.isAuthenticated()/req.user tal como lo haría con una sesión real).
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = {
      id: "test-user-id",
      username: "test-user",
      email: "test@example.com",
      fullName: "Usuario de Prueba",
      role,
      department: null,
      phone: null,
      isActive: "true",
    };
    next();
  });
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  await registerRoutes(server, app);
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

const BLOCKED_CASES: Array<[string, string]> = [
  ["POST", "/api/reservations/res-1/cancel"],
  ["DELETE", "/api/reservations/res-1"],
  ["PATCH", "/api/charges/charge-1/anular"],
  ["DELETE", "/api/charges/charge-1"],
  ["PATCH", "/api/payments/payment-1/anular"],
  ["DELETE", "/api/payments/payment-1"],
  ["POST", "/api/billing/invoices/inv-1/nota-credito"],
  ["POST", "/api/billing/invoices/inv-1/nota-debito"],
  ["POST", "/api/cash/movements"],
  ["PATCH", "/api/cash/movements/mov-1/anular"],
  ["POST", "/api/cash/shifts/shift-1/close"],
  ["POST", "/api/admin-cash/movimientos"],
  ["GET", "/api/guests/guest-1/account"],
  ["GET", "/api/companies"],
  ["GET", "/api/agencies/agency-1"],
  ["GET", "/api/account-summary"],
  ["POST", "/api/night-audit/run"],
  ["GET", "/api/admin/users"],
  ["GET", "/api/system-users"],
];

const ALLOWED_CASES: Array<[string, string]> = [
  ["GET", "/api/reservations"],
  ["GET", "/api/guests"],
  ["GET", "/api/cash/summary"],
  ["GET", "/api/cash/shifts/current?area=recepcion"],
  ["GET", "/api/folios/guest/guest-1"],
];

describe("Fase 6 — rol piloto_externo: middleware real de autorización", () => {
  it.each(BLOCKED_CASES)(
    "%s %s → 403 para piloto_externo",
    async (method, path) => {
      await withServer(PILOT_EXTERNAL_ROLE, async (baseUrl) => {
        const res = await fetch(`${baseUrl}${path}`, { method });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.message).toMatch(/no autorizado/i);
      });
    },
  );

  it.each(ALLOWED_CASES)(
    "%s %s → 200 para piloto_externo",
    async (method, path) => {
      await withServer(PILOT_EXTERNAL_ROLE, async (baseUrl) => {
        const res = await fetch(`${baseUrl}${path}`, { method });
        expect(res.status).toBe(200);
      });
    },
  );

  it("otros roles no se ven afectados: reception puede llegar al handler real de cancel (404, no 403)", async () => {
    await withServer("reception", async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/reservations/res-1/cancel`, { method: "POST" });
      // La reserva no existe en el mock (storage devuelve null) — 404 real
      // del handler, no 403 de autorización. Confirma que la restricción de
      // Fase 6 es específica del rol piloto_externo.
      expect(res.status).toBe(404);
    });
  });

  it("otros roles no se ven afectados: reception puede ver /api/companies (200)", async () => {
    await withServer("reception", async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/companies`);
      expect(res.status).toBe(200);
    });
  });

  it("admin sigue bloqueado por el requireRole existente en /api/system-users (sin relación con Fase 6)", async () => {
    await withServer("reception", async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/system-users`);
      expect(res.status).toBe(403);
    });
  });
});
