import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for the legacy `/api/groups/:groupId/payment/v2` entry
// point: it must pass the Caja metadata into the atomic storage operation.

const mockStorage = {
  distributeGroupPayment: vi.fn(),
  recordGroupPayment: vi.fn(),
  getGroup: vi.fn(),
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

describe("legacy /payment/v2 route supplies atomic cash metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.distributeGroupPayment.mockResolvedValue({ "room-1": 500 });
    mockStorage.recordGroupPayment.mockResolvedValue({
      groupPayment: { id: "group-payment-1" },
      reservationPayments: [{ id: "payment-1" }],
    });
    mockStorage.getGroup.mockResolvedValue({ id: "group-1", name: "Test Group" });
  });

  it("delegates the cash movement to recordGroupPayment's transaction", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/group-1/payment/v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: "500",
          method: "efectivo",
          reference: "REC-V2-001",
          receiptType: "none",
          receiverDetails: { razonSocial: "Empresa Receptora SA", cuit: "30712345678" },
          concepts: [{ description: "Anticipo grupal", amount: 500 }],
          distribution: "equal",
        }),
      });
      const body = await response.json() as any;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockStorage.recordGroupPayment).toHaveBeenCalledWith(expect.objectContaining({
        groupId: "group-1",
        cashLabel: expect.stringContaining("group-1"),
      }));
    });
  });

  it("still delegates cuenta corriente without creating cash in the route", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/group-1/payment/v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: "300",
          method: "cuenta_corriente",
          reference: "REC-V2-002",
          receiptType: "none",
          receiverDetails: { razonSocial: "Empresa Receptora SA", cuit: "30712345678" },
          concepts: [{ description: "Anticipo grupal", amount: 300 }],
          distribution: "equal",
        }),
      });
      expect(response.status).toBe(200);
      expect(mockStorage.recordGroupPayment).toHaveBeenCalledWith(expect.objectContaining({
        groupId: "group-1",
        paymentRows: [expect.objectContaining({ method: "cuenta_corriente" })],
      }));
    });
  });
});
