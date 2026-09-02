import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordGroupPayment: vi.fn(),
  invoiceSnapshot: vi.fn(),
  assertFinancialSchemaReady: vi.fn(),
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
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: mocks.assertFinancialSchemaReady }));
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

function configureDirectedCloseFixture() {
  mockStorage.getGroup.mockResolvedValue({
    id: groupId,
    name: "Grupo cierre dirigido",
    reservations: [
      { id: "room-a", roomId: "physical-a", status: "checked_in" },
      { id: "room-b", roomId: "physical-b", status: "confirmed" },
      { id: "room-c", roomId: "physical-c", status: "checked_in" },
    ],
  });
  mockStorage.getGroupReservationLedger.mockResolvedValue([
    { reservationId: "room-a", accommodationTotal: 100, extrasTotal: 0, paymentsTotal: 0, payments: [] },
    { reservationId: "room-b", accommodationTotal: 200, extrasTotal: 0, paymentsTotal: 0, payments: [] },
    { reservationId: "room-c", accommodationTotal: 300, extrasTotal: 0, paymentsTotal: 0, payments: [] },
  ]);
  mockStorage.getGroupCharges.mockResolvedValue([]);
  mockStorage.getGroupPayments.mockResolvedValue([]);
  mocks.invoiceSnapshot.mockResolvedValue({
    sources: [],
    totals: { eligible: 0, invoiced: 0, available: 0 },
    financial: { operationalBalance: 600, nonFiscalAdvances: 0, fiscalAvailable: 0 },
    paymentDestinations: [],
  });
  mocks.recordGroupPayment.mockResolvedValue({
    groupPayment: { id: "directed-parent", amount: "300.00" },
    reservationPayments: [{ id: "child-a" }, { id: "child-b" }],
    closedReservations: { processed: 2, checkedIn: 1, confirmed: 1 },
  });
}

describe("POST group payment applies non-fiscal advances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertFinancialSchemaReady.mockImplementation(() => undefined);
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

  it("rejects a non-fiscal receipt whose structured concepts differ by one cent", async () => {
    await withServer(async (baseUrl) => {
      const body = paymentBody("270000.00");
      body.receiptType = "none";
      body.invoiceData = undefined;
      body.concepts = [{ description: "Anticipo grupal", amount: 269999.99 }];
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: expect.stringMatching(/coincidir exactamente/i),
      });
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
        error: expect.stringContaining("saldo exacto de $270000.00"),
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

  it("allocates and closes only the selected rooms in a three-room group", async () => {
    configureDirectedCloseFixture();

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/master-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptType: "sin_comprobante",
          receiverDetails: { razonSocial: "Grupo cierre dirigido", cuit: "30712345678" },
          concepts: [{ description: "Cierre dirigido", amount: 300 }],
          paymentRows: [{ method: "cash", amount: "300.00", reference: "CIERRE-AB" }],
          closeReservationIds: ["room-a", "room-b"],
          distributionDetail: { "room-a": 100, "room-b": 200 },
        }),
      });
      expect(response.status).toBe(200);
      expect(mocks.recordGroupPayment).toHaveBeenCalledWith(expect.objectContaining({
        distributionDetail: { "room-a": 100, "room-b": 200 },
        closeReservationIds: ["room-a", "room-b"],
      }));
      expect(await response.json()).toMatchObject({
        checkoutCount: 2,
        closedReservationIds: ["room-a", "room-b"],
      });
    });
  });

  it("rejects a directed close for a reservation outside the group without recording the collection", async () => {
    configureDirectedCloseFixture();

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/master-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptType: "sin_comprobante",
          receiverDetails: { razonSocial: "Grupo cierre dirigido", cuit: "30712345678" },
          concepts: [{ description: "Cierre dirigido", amount: 100 }],
          paymentRows: [{ method: "cash", amount: "100.00", reference: "CIERRE-AJENO" }],
          closeReservationIds: ["room-a", "room-outside-group"],
          distributionDetail: { "room-a": 100, "room-outside-group": 0 },
        }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Sólo se pueden cerrar habitaciones activas de este grupo.",
      });
      expect(mocks.recordGroupPayment).not.toHaveBeenCalled();
    });
  });

  it("rejects an altered selected-room amount without recording the collection", async () => {
    configureDirectedCloseFixture();
    const persistedPayments: unknown[] = [];
    mocks.recordGroupPayment.mockImplementationOnce((input: {
      paymentRows: Array<{ amount: string }>;
      distributionDetail: Record<string, number>;
    }) => {
      const received = input.paymentRows.reduce((sum, row) => sum + Number(row.amount), 0);
      const allocated = Object.values(input.distributionDetail).reduce((sum, amount) => sum + Number(amount), 0);
      if (Math.round(received * 100) !== Math.round(allocated * 100)) {
        throw Object.assign(new Error("La distribución debe coincidir exactamente con el importe recibido."), { statusCode: 400 });
      }
      persistedPayments.push(input);
      return {
        groupPayment: { id: "directed-parent", amount: "300.00" },
        reservationPayments: [{ id: "child-a" }, { id: "child-b" }],
        closedReservations: { processed: 2, checkedIn: 1, confirmed: 1 },
      };
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/master-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptType: "sin_comprobante",
          receiverDetails: { razonSocial: "Grupo cierre dirigido", cuit: "30712345678" },
          concepts: [{ description: "Cierre dirigido", amount: 300 }],
          paymentRows: [{ method: "cash", amount: "300.00", reference: "CIERRE-ALTERADO" }],
          closeReservationIds: ["room-a", "room-b"],
          distributionDetail: { "room-a": 99, "room-b": 200 },
        }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "La distribución debe coincidir exactamente con el importe recibido.",
      });
      expect(persistedPayments).toHaveLength(0);
    });
  });

  it("returns a clear 503 and does not query pending fiscal collections when the schema is outdated", async () => {
    mocks.assertFinancialSchemaReady.mockImplementationOnce(() => {
      throw Object.assign(
        new Error("El esquema financiero no está actualizado."),
        { statusCode: 503, code: "FINANCIAL_SCHEMA_NOT_READY" },
      );
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/pending-fiscal-collections`);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "El esquema financiero no está actualizado.",
        code: "FINANCIAL_SCHEMA_NOT_READY",
      });
    });

    expect(mocks.assertFinancialSchemaReady).toHaveBeenCalledTimes(1);
    expect((await import("../db")).db.execute).not.toHaveBeenCalled();
  });

  it("does not expose a parent receipt that is absent from the requested group", async () => {
    mockStorage.getGroupPayments.mockResolvedValueOnce([
      { id: "parent-from-another-group", amount: "10.00" },
    ]);
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payments/requested-parent/receipt.pdf`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Recibo de pago grupal no encontrado" });
    });
  });

  it("renders the authenticated parent receipt as a PDF", async () => {
    mockStorage.getGroupPayments.mockResolvedValueOnce([{
      id: "parent-receipt", receiptNumber: 42, amount: "120.00", date: "2026-08-31",
      method: "transfer", receiverDetails: { razonSocial: "Empresa", cuit: "30712345678" },
      paymentMethodDetail: [{ method: "transfer", amount: "120.00", reference: "TR-42" }],
      concepts: [{ description: "Alojamiento", amount: 120 }],
      distributionDetail: { [reservationId]: 120 },
    }]);
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payments/parent-receipt/receipt.pdf`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/pdf");
      expect(response.headers.get("content-disposition")).toContain("recibo-grupal-42.pdf");
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100);
    });
  });
});