import express from "express";
import * as http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pendingCharge = {
  id: "cargo-1",
  entityType: "company",
  entityId: "entity-1",
  saldoPendiente: 100,
};
let mockedRole = "admin";

const mockStorage = {
  getCompany: vi.fn().mockResolvedValue({ id: "entity-1" }),
  getAgency: vi.fn().mockResolvedValue({ id: "entity-1" }),
  getGuest: vi.fn().mockResolvedValue({ id: "entity-1", firstName: "Ana", lastName: "Prueba" }),
  getPendingCharges: vi.fn().mockResolvedValue([pendingCharge]),
  createPaymentWithAllocations: vi.fn(),
  voidDirectAccountPayment: vi.fn(),
};

vi.mock("../db-storage", () => ({ storage: mockStorage }));
vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: (roles: string[]) => (req: any, res: any, next: () => void) => {
    req.user = { role: mockedRole, fullName: "Test Admin" };
    if (!roles.includes(mockedRole)) return res.status(403).json({ error: "forbidden" });
    next();
  },
}));
vi.mock("../db", () => ({
  db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
  pool: { query: vi.fn() },
}));

async function startApp() {
  const { registerGuestsRoutes } = await import("../routes/guests");
  const app = express();
  app.use(express.json());
  registerGuestsRoutes(app);

  return await new Promise<{ baseUrl: string; close: () => void }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({ baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

async function postPayment(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

describe("Cuenta Corriente payment routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRole = "admin";
    mockStorage.getCompany.mockResolvedValue({ id: "entity-1" });
    mockStorage.getAgency.mockResolvedValue({ id: "entity-1" });
    mockStorage.getGuest.mockResolvedValue({ id: "entity-1", firstName: "Ana", lastName: "Prueba" });
    mockStorage.getPendingCharges.mockResolvedValue([pendingCharge]);
    mockStorage.createPaymentWithAllocations.mockImplementation(async (_type: string, _id: string, data: any, allocations: any[]) => ({
      movement: { id: "payment-1", ...data },
      allocations: allocations.map((allocation) => ({ ...allocation, pagoId: "payment-1" })),
    }));
    mockStorage.voidDirectAccountPayment.mockResolvedValue({
      original: { id: "payment-1", voided: true },
      reversal: { id: "reversal-1", amount: "100.00" },
      releasedAllocations: 1,
    });
  });

  it.each([
    ["/api/companies/entity-1/account/payment"],
    ["/api/agencies/entity-1/account/payment"],
    ["/api/guests/entity-1/account/payment"],
  ])("records multiple payment methods and retentions as one consistent movement (%s)", async (path) => {
    const app = await startApp();
    try {
      const result = await postPayment(app.baseUrl, path, {
        amount: "90.00",
        payments: [
          { method: "transferencia", amount: "40.00" },
          { method: "efectivo", amount: "50.00" },
        ],
        retentions: [{ concepto: "IIBB", monto: "10.00" }],
        allocations: [{ cargoId: "cargo-1", amount: "100.00" }],
      });

      expect(result.status).toBe(200);
      expect(mockStorage.createPaymentWithAllocations).toHaveBeenCalledTimes(1);
      const [, ,data, allocations] = mockStorage.createPaymentWithAllocations.mock.calls[0];
      expect(data.amount).toBe("-100.00");
      expect(data.paymentMethod).toBe("varios");
      expect(data.description).toContain("Transferencia: $40.00");
      expect(data.description).toContain("Efectivo: $50.00");
      expect(allocations).toEqual([{ cargoId: "cargo-1", amount: "100.00" }]);
      expect(Math.abs(Number(data.amount))).toBe(Number(allocations[0].amount));
    } finally {
      app.close();
    }
  });

  it("rejects a forged allocation total that exceeds the persisted payment", async () => {
    const app = await startApp();
    try {
      const result = await postPayment(app.baseUrl, "/api/companies/entity-1/account/payment", {
        amount: "10.00",
        payments: [{ method: "transferencia", amount: "10.00" }],
        // A client-supplied totalApplied must not bypass the server invariant.
        totalApplied: "100.00",
        allocations: [{ cargoId: "cargo-1", amount: "100.00" }],
      });

      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(/total aplicado/i);
      expect(mockStorage.createPaymentWithAllocations).not.toHaveBeenCalled();
    } finally {
      app.close();
    }
  });

  it("requires a trimmed reason before invoking receipt voiding", async () => {
    const app = await startApp();
    try {
      const result = await postPayment(app.baseUrl, "/api/account-movements/payment-1/void", { reason: "   " });
      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(/motivo/i);
      expect(mockStorage.voidDirectAccountPayment).not.toHaveBeenCalled();
    } finally {
      app.close();
    }
  });

  it("uses the protected voiding route for an authorized manager/admin", async () => {
    const app = await startApp();
    try {
      const result = await postPayment(app.baseUrl, "/api/account-movements/payment-1/void", { reason: " Error de carga " });
      expect(result.status).toBe(200);
      expect(mockStorage.voidDirectAccountPayment).toHaveBeenCalledWith("payment-1", "Error de carga", "Test Admin");
    } finally {
      app.close();
    }
  });

  it("rejects a void request from a role outside administration", async () => {
    mockedRole = "reception";
    const app = await startApp();
    try {
      const result = await postPayment(app.baseUrl, "/api/account-movements/payment-1/void", { reason: "No autorizado" });
      expect(result.status).toBe(403);
      expect(mockStorage.voidDirectAccountPayment).not.toHaveBeenCalled();
    } finally {
      app.close();
    }
  });
});