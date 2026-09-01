import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordGroupPayment: vi.fn(),
  invoiceSnapshot: vi.fn(),
}));

const groupId = "group-advance-exact";
const reservationId = "reservation-advance-exact";

const mockStorage = {
  getGroup: vi.fn(),
  getGroupReservationLedger: vi.fn(),
  getGroupCharges: vi.fn(),
  getGroupPayments: vi.fn(),
  recordGroupPayment: mocks.recordGroupPayment,
};

vi.mock("../db-storage", () => ({
  storage: mockStorage,
  getArgentinaToday: () => "2026-08-31",
}));
vi.mock("../billing/groupInvoiceScope", () => ({
  assertGroupPaymentInvoiceScope: vi.fn(),
  assertMasterFacturaTAllowed: vi.fn(),
  getGroupInvoiceSnapshot: mocks.invoiceSnapshot,
}));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: vi.fn() }));
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

const { registerGroupsRoutes } = await import("../routes/groups");

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  registerGroupsRoutes(app);
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
  } finally {
    server.close();
  }
}

function paymentBody(amount: string) {
  return {
    receiptType: "factura_b",
    receiverDetails: {
      razonSocial: "Empresa de prueba",
      cuit: "30712345678",
      condicionIva: "Responsable Inscripto",
      domicilio: "Domicilio de prueba",
    },
    concepts: [{ description: "Alojamiento grupal", amount: 330_000 }],
    paymentRows: [{ method: "cash", amount, reference: "CIERRE-EXACTO" }],
    distribution: "equal",
    closeAllRooms: true,
    invoiceData: {
      id: 901,
      tipoComprobante: "FB",
      puntoVenta: 1,
      numero: 123,
    },
  };
}

describe("POST group payment applies non-fiscal advances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getGroup.mockResolvedValue({
      id: groupId,
      name: "Grupo adelantos",
      reservations: [{ id: reservationId, roomId: "room-1", status: "confirmed" }],
    });
    mockStorage.getGroupReservationLedger.mockResolvedValue([{
      reservationId,
      reservationCode: "RES-1",
      guestName: "Huésped",
      roomNumber: "101",
      status: "confirmed",
      nights: 1,
      accommodationTotal: 360_000,
      charges: [],
      extrasTotal: 0,
      payments: [{ amount: "90000.00", groupPaymentId: "parent-existing", status: "active" }],
      paymentsTotal: 90_000,
    }]);
    mockStorage.getGroupCharges.mockResolvedValue([]);
    mockStorage.getGroupPayments.mockResolvedValue([
      { id: "parent-existing", amount: "90000.00", destination: "group_distribution" },
    ]);
    mocks.invoiceSnapshot.mockResolvedValue({
      sources: [{ id: `room:${reservationId}:accommodation`, eligible: 360_000, invoiced: 30_000, available: 330_000 }],
      totals: { eligible: 360_000, invoiced: 30_000, available: 330_000 },
      financial: {
        operationalTotal: 360_000,
        collected: 90_000,
        nonFiscalAdvances: 60_000,
        operationalBalance: 270_000,
        invoiced: 30_000,
        fiscalAvailable: 330_000,
      },
      paymentDestinations: [],
    });
    mocks.recordGroupPayment.mockResolvedValue({
      groupPayment: { id: "new-parent", amount: "270000.00" },
      reservationPayments: [{ id: "new-child" }],
    });
  });

  it("does not persist a fiscal collection before its invoice is confirmed", async () => {
    await withServer(async (baseUrl) => {
      const body = paymentBody("270000.00");
      delete (body as any).invoiceData;
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: expect.stringMatching(/confirmá la factura/i),
      });
      expect(mocks.recordGroupPayment).not.toHaveBeenCalled();
    });
  });

  it("rejects negative payment rows instead of dropping them during persistence", async () => {
    await withServer(async (baseUrl) => {
      const body = paymentBody("270000.00");
      body.paymentRows = [
        { method: "cash", amount: "-100.00" },
        { method: "transfer", amount: "270100.00", reference: "TR-NEG" },
      ];
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      expect(mocks.recordGroupPayment).not.toHaveBeenCalled();
    });
  });

  it("confirms the collection against the emitted invoice even when that invoice already consumed the fiscal availability", async () => {
    mocks.invoiceSnapshot.mockResolvedValueOnce({
      sources: [],
      totals: { eligible: 360_000, invoiced: 330_000, available: 0 },
      financial: {
        nonFiscalAdvances: 60_000,
        operationalBalance: 270_000,
        fiscalAvailable: 0,
      },
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(paymentBody("270000.00")),
      });

      expect(response.status).toBe(200);
      expect(mocks.recordGroupPayment).toHaveBeenCalledWith(expect.objectContaining({
        invoiceData: expect.objectContaining({ id: 901 }),
        invoiceTotal: 330_000,
      }));
    });
  });

  it("accepts invoice 330000 with advance 60000 and collects exactly 270000", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentBody("270000.00")),
      });
      expect(response.status).toBe(200);
      expect(mocks.recordGroupPayment).toHaveBeenCalledWith(expect.objectContaining({
        groupId,
        paymentRows: [expect.objectContaining({ amount: "270000.00" })],
      }));
    });
  });

  it.each(["269999.99", "270000.01"])("rejects a one-cent collection difference: %s", async (amount) => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentBody(amount)),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: expect.stringContaining("saldo operativo de $270000.00"),
      });
      expect(mocks.recordGroupPayment).not.toHaveBeenCalled();
    });
  });

  it("collects the full operational balance when non-fiscal charges make it exceed the fiscal portion", async () => {
    mockStorage.getGroupReservationLedger.mockResolvedValue([{
      reservationId,
      reservationCode: "RES-1",
      guestName: "Huésped",
      roomNumber: "101",
      status: "confirmed",
      nights: 1,
      accommodationTotal: 360_000,
      charges: [{ amount: "40000.00", category: "transfer_in", status: "active" }],
      extrasTotal: 40_000,
      payments: [{ amount: "90000.00", groupPaymentId: "parent-existing", status: "active" }],
      paymentsTotal: 90_000,
    }]);
    mocks.invoiceSnapshot.mockResolvedValue({
      sources: [{ id: `room:${reservationId}:accommodation`, eligible: 360_000, invoiced: 30_000, available: 330_000 }],
      totals: { eligible: 360_000, invoiced: 30_000, available: 330_000 },
      financial: {
        operationalTotal: 400_000,
        collected: 90_000,
        nonFiscalAdvances: 60_000,
        operationalBalance: 310_000,
        invoiced: 30_000,
        fiscalAvailable: 330_000,
      },
      paymentDestinations: [],
    });

    await withServer(async (baseUrl) => {
      const accepted = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentBody("310000.00")),
      });
      expect(accepted.status).toBe(200);
      expect(mocks.recordGroupPayment).toHaveBeenCalledWith(expect.objectContaining({
        paymentRows: [expect.objectContaining({ amount: "310000.00" })],
      }));
    });
  });
});