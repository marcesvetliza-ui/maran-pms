import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for the legacy `/api/groups/:groupId/payment/v2` entry
// point: it must register exactly one cash movement per distributed
// payment, the same way the unified Pago Grupal / Folio Maestro flows do.
// Before this fix, payments made through this dialog never called
// registerCashMovement at all, so they were invisible in Caja while still
// counted by the unified group-payments report — an inconsistent view.

const mockStorage = {
  distributeGroupPayment: vi.fn(),
  recordGroupPayment: vi.fn(),
  getGroup: vi.fn(),
  registerCashMovement: vi.fn(),
};

vi.mock("../db-storage", () => ({
  storage: mockStorage,
  getArgentinaToday: () => "2026-08-27",
}));
vi.mock("../migrate", () => ({
  assertFinancialSchemaReady: vi.fn(),
}));
vi.mock("../auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { username: "tester" };
    next();
  },
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../db", () => ({
  db: { execute: vi.fn(), select: vi.fn(), insert: vi.fn(), delete: vi.fn() },
}));
vi.mock("../billing/groupInvoiceScope", () => ({
  assertGroupPaymentInvoiceScope: vi.fn(),
  assertMasterFacturaTAllowed: vi.fn(),
  getGroupInvoiceSnapshot: vi.fn(),
}));

const { registerGroupsRoutes } = await import("../routes/groups");

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  registerGroupsRoutes(app);
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    return await run(baseUrl);
  } finally {
    server.close();
  }
}

describe("legacy /payment/v2 route registers a cash movement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.distributeGroupPayment.mockResolvedValue({ "room-1": 500 });
    mockStorage.recordGroupPayment.mockResolvedValue({
      groupPayment: { id: "group-payment-1" },
      reservationPayments: [{ id: "payment-1" }],
    });
    mockStorage.getGroup.mockResolvedValue({ id: "group-1", name: "Test Group" });
  });

  it("calls registerCashMovement exactly once for a distributed cash payment", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/group-1/payment/v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: "500",
          method: "efectivo",
          distribution: "equal",
        }),
      });
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockStorage.registerCashMovement).toHaveBeenCalledTimes(1);
      expect(mockStorage.registerCashMovement).toHaveBeenCalledWith(
        "reception",
        "group_payment",
        "group-1",
        expect.stringContaining("Test Group"),
        "efectivo",
        "500",
        "income",
        "tester",
        "sin_comprobante",
        "group-payment-1",
      );
    });
  });

  it("does not register a cash movement for a cuenta_corriente distributed payment", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/group-1/payment/v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: "300",
          method: "cuenta_corriente",
          distribution: "equal",
        }),
      });
      expect(response.status).toBe(200);
      expect(mockStorage.registerCashMovement).not.toHaveBeenCalled();
    });
  });
});
