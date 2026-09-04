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
    { reservationId: "room-a", roomNumber: "101", accommodationTotal: 100, extrasTotal: 0, paymentsTotal: 0, payments: [] },
    { reservationId: "room-b", roomNumber: "102", accommodationTotal: 200, extrasTotal: 0, paymentsTotal: 0, payments: [] },
    { reservationId: "room-c", roomNumber: "103", accommodationTotal: 300, extrasTotal: 0, paymentsTotal: 0, payments: [] },
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
        settlementBreakdown: {
          documentTotal: 330_000,
          appliedAdvances: 60_000,
          newCollection: 270_000,
        },
      }));
    });
  });

  it("keeps a directed advance on its room when allocating the final fiscal collection", async () => {
    mockStorage.getGroup.mockResolvedValue({
      id: groupId,
      name: "Grupo con anticipo dirigido",
      reservations: [
        { id: "room-a", roomId: "physical-a", status: "confirmed" },
        { id: "room-b", roomId: "physical-b", status: "confirmed" },
      ],
    });
    mockStorage.getGroupReservationLedger.mockResolvedValue([
      {
        reservationId: "room-a", reservationCode: "RES-A", roomNumber: "101",
        accommodationTotal: 180, extrasTotal: 0, paymentsTotal: 60,
        payments: [{ amount: "60.00", groupPaymentId: "advance-parent", status: "active" }],
      },
      {
        reservationId: "room-b", reservationCode: "RES-B", roomNumber: "102",
        accommodationTotal: 180, extrasTotal: 0, paymentsTotal: 0, payments: [],
      },
    ]);
    mockStorage.getGroupPayments.mockResolvedValue([{
      id: "advance-parent", amount: "60.00", destination: "group_distribution",
      distributionDetail: { "room-a": 60 },
    }]);
    mocks.invoiceSnapshot.mockResolvedValue({
      sources: [],
      totals: { eligible: 360, invoiced: 0, available: 360 },
      financial: {
        operationalTotal: 360, collected: 60, nonFiscalAdvances: 60,
        operationalBalance: 300, invoiced: 0, fiscalAvailable: 360,
      },
      paymentDestinations: [],
    });
    mocks.recordGroupPayment.mockResolvedValue({
      groupPayment: { id: "final-parent", amount: "300.00" },
      reservationPayments: [{ id: "final-a" }, { id: "final-b" }],
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptType: "factura_b",
          receiverDetails: {
            razonSocial: "Empresa de prueba", cuit: "30712345678",
            condicionIva: "Responsable Inscripto", domicilio: "Domicilio de prueba",
          },
          // The immutable fiscal document continues to cover all services.
          concepts: [{ description: "Servicios grupales", amount: 360 }],
          paymentRows: [{ method: "cash", amount: "300.00", reference: "FINAL-300" }],
          distribution: "equal",
          invoiceData: { id: 901, tipoComprobante: "FB", puntoVenta: 1, numero: 123 },
        }),
      });

      expect(response.status).toBe(200);
    });

    expect(mocks.recordGroupPayment).toHaveBeenCalledWith(expect.objectContaining({
      invoiceTotal: 360,
      distributionDetail: { "room-a": 120, "room-b": 180 },
      settlementBreakdown: {
        documentTotal: 360,
        appliedAdvances: 60,
        newCollection: 300,
      },
    }));
  });

  it("persists only the new 300000 collection for a 3 x 120000 invoice after a 60000 advance", async () => {
    const rooms = ["room-a", "room-b", "room-c"];
    mockStorage.getGroup.mockResolvedValue({
      id: groupId,
      name: "Grupo fiscal canónico",
      reservations: rooms.map((id, index) => ({
        id,
        roomId: `physical-${index + 1}`,
        status: "confirmed",
      })),
    });
    mockStorage.getGroupReservationLedger.mockResolvedValue(rooms.map((reservationId, index) => ({
      reservationId,
      reservationCode: `CANON-${index + 1}`,
      roomNumber: String(101 + index),
      accommodationTotal: 120_000,
      extrasTotal: 0,
      paymentsTotal: 20_000,
      payments: [{ amount: "20000.00", groupPaymentId: "advance-parent", status: "active" }],
    })));
    mockStorage.getGroupCharges.mockResolvedValue([]);
    mockStorage.getGroupPayments.mockResolvedValue([{
      id: "advance-parent",
      amount: "60000.00",
      destination: "group_distribution",
      distributionDetail: Object.fromEntries(rooms.map((id) => [id, 20_000])),
    }]);
    mocks.invoiceSnapshot.mockResolvedValue({
      sources: [],
      totals: { eligible: 360_000, invoiced: 360_000, available: 0 },
      financial: {
        operationalTotal: 360_000,
        collected: 60_000,
        nonFiscalAdvances: 60_000,
        operationalBalance: 300_000,
        invoiced: 360_000,
        fiscalAvailable: 0,
      },
      paymentDestinations: [],
    });
    mocks.recordGroupPayment.mockResolvedValue({
      groupPayment: { id: "canonical-final-parent", amount: "300000.00" },
      reservationPayments: rooms.map((id) => ({ id: `canonical-${id}` })),
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptType: "factura_b",
          receiverDetails: {
            razonSocial: "Empresa de prueba",
            cuit: "30712345678",
            condicionIva: "Responsable Inscripto",
          },
          // ARCA already confirmed this 360000 document. The follow-up
          // collection is its unpaid portion, not the document total.
          concepts: [{ description: "Alojamiento grupal", amount: 360_000 }],
          paymentRows: [{ method: "cash", amount: "300000.00", reference: "CANON-300" }],
          distribution: "equal",
          invoiceData: { id: 901, tipoComprobante: "FB", puntoVenta: 1, numero: 123 },
        }),
      });
      expect(response.status).toBe(200);
    });

    expect(mocks.recordGroupPayment).toHaveBeenCalledTimes(1);
    expect(mocks.recordGroupPayment).toHaveBeenCalledWith(expect.objectContaining({
      invoiceData: expect.objectContaining({ id: 901 }),
      invoiceTotal: 360_000,
      paymentRows: [expect.objectContaining({ amount: "300000.00" })],
      distributionDetail: { "room-a": 100_000, "room-b": 100_000, "room-c": 100_000 },
      settlementBreakdown: {
        documentTotal: 360_000,
        appliedAdvances: 60_000,
        newCollection: 300_000,
      },
    }));
  });

  it.each([
    ["equal", { "room-a": 10, "room-b": 25, "room-c": 25 }],
    ["proportional", { "room-a": 6.67, "room-b": 20, "room-c": 33.33 }],
  ] as const)("matches shared %s automatic allocation for unequal room balances", async (distribution, expectedAllocation) => {
    const rooms = [
      { id: "room-a", balance: 10 },
      { id: "room-b", balance: 30 },
      { id: "room-c", balance: 50 },
    ];
    mockStorage.getGroup.mockResolvedValue({
      id: groupId,
      name: "Grupo saldos desiguales",
      reservations: rooms.map((room) => ({ id: room.id, roomId: `physical-${room.id}`, status: "confirmed" })),
    });
    mockStorage.getGroupReservationLedger.mockResolvedValue(rooms.map((room) => ({
      reservationId: room.id,
      reservationCode: room.id,
      roomNumber: room.id,
      accommodationTotal: room.balance,
      extrasTotal: 0,
      paymentsTotal: 0,
      payments: [],
    })));
    mockStorage.getGroupCharges.mockResolvedValue([]);
    mockStorage.getGroupPayments.mockResolvedValue([]);
    mocks.invoiceSnapshot.mockResolvedValue({
      sources: [],
      totals: { eligible: 90, invoiced: 0, available: 90 },
      financial: { operationalTotal: 90, collected: 0, nonFiscalAdvances: 0, operationalBalance: 90, fiscalAvailable: 90 },
      paymentDestinations: [],
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptType: "none",
          receiverDetails: { razonSocial: "Empresa de prueba", cuit: "30712345678" },
          concepts: [{ description: "Cobro grupal", amount: 60 }],
          paymentRows: [{ method: "cash", amount: "60.00", reference: "UNEQUAL-60" }],
          distribution,
        }),
      });
      expect(response.status).toBe(200);
    });

    expect(mocks.recordGroupPayment).toHaveBeenCalledWith(expect.objectContaining({
      distributionDetail: expectedAllocation,
    }));
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
        settlementBreakdown: {
          documentTotal: 330_000,
          appliedAdvances: 60_000,
          newCollection: 310_000,
        },
      }));
    });
  });

  it("rejects a lower advance split on a valid fiscal close-out collection", async () => {
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
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...paymentBody("310000.00"),
          settlementBreakdown: {
            documentTotal: 330_000,
            appliedAdvances: 0,
            newCollection: 310_000,
          },
        }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: expect.stringContaining("no coincide con el ledger"),
      });
      expect(mocks.recordGroupPayment).not.toHaveBeenCalled();
    });
  });

  it("rebuilds manipulated concepts from the room allocation for a distributed payment", async () => {
    configureDirectedCloseFixture();

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptType: "sin_comprobante",
          receiverDetails: { razonSocial: "Grupo cierre dirigido", cuit: "30712345678" },
          concepts: [
            { description: "Concepto duplicado A", amount: 50 },
            { description: "Habitación ajena", amount: 250 },
          ],
          paymentRows: [{ method: "cash", amount: "300.00", reference: "DIST-MANIPULADO" }],
          distribution: "equal",
        }),
      });

      expect(response.status).toBe(200);
      expect(mocks.recordGroupPayment).toHaveBeenCalledWith(expect.objectContaining({
        destination: "group_distribution",
        concepts: [
          { description: "Habitación 101", amount: 100 },
          { description: "Habitación 102", amount: 100 },
          { description: "Habitación 103", amount: 100 },
        ],
      }));
    });
  });

  it("keeps a fiscal master payment global instead of persisting the invoice breakdown", async () => {
    configureDirectedCloseFixture();
    mocks.invoiceSnapshot.mockResolvedValueOnce({
      sources: [],
      totals: { eligible: 300, invoiced: 0, available: 300 },
      financial: { operationalBalance: 600, nonFiscalAdvances: 0, fiscalAvailable: 300 },
      paymentDestinations: [],
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/master-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptType: "factura_b",
          receiverDetails: {
            razonSocial: "Grupo cierre dirigido",
            cuit: "30712345678",
            condicionIva: "Responsable Inscripto",
            domicilio: "Domicilio de prueba",
          },
          concepts: [
            { description: "Habitación 101", amount: 100 },
            { description: "Habitación 102", amount: 200 },
          ],
          paymentRows: [{ method: "cash", amount: "300.00" }],
          invoiceData: { id: 902, tipoComprobante: "FB", puntoVenta: 1, numero: 124 },
        }),
      });

      expect(response.status).toBe(200);
      expect(mocks.recordGroupPayment).toHaveBeenCalledWith(expect.objectContaining({
        destination: "master_folio",
        concepts: [{ description: "Folio Maestro — Grupo cierre dirigido", amount: 300 }],
        invoiceData: expect.objectContaining({ id: 902 }),
      }));
    });
  });

  it("normalizes repeated manipulated master-folio requests to one global concept", async () => {
    configureDirectedCloseFixture();
    const requestBody = {
      receiptType: "sin_comprobante",
      receiverDetails: { razonSocial: "Grupo cierre dirigido", cuit: "30712345678" },
      concepts: [
        { description: "Habitación 101", amount: 100 },
        { description: "Habitación 102", amount: 200 },
      ],
      paymentRows: [{ method: "cash", amount: "300.00", reference: "MASTER-REPETIDO" }],
    };

    await withServer(async (baseUrl) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch(`${baseUrl}/api/groups/${groupId}/master-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        expect(response.status).toBe(200);
      }
    });

    expect(mocks.recordGroupPayment).toHaveBeenCalledTimes(2);
    for (const [input] of mocks.recordGroupPayment.mock.calls) {
      expect(input).toEqual(expect.objectContaining({
        destination: "master_folio",
        concepts: [{ description: "Folio Maestro — Grupo cierre dirigido", amount: 300 }],
      }));
    }
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

  it.each(["cancelled", "pending", "checked_out", "tentative", "reserved", "web_checkin", "no_show"])(
    "rejects a directed close for a %s reservation without recording the collection",
    async (status) => {
      configureDirectedCloseFixture();
      mockStorage.getGroup.mockResolvedValueOnce({
        id: groupId,
        name: "Grupo cierre dirigido",
        reservations: [
          { id: "room-a", roomId: "physical-a", status: "checked_in" },
          { id: `room-${status}`, roomId: `physical-${status}`, status },
        ],
      });

      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/groups/${groupId}/master-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiptType: "sin_comprobante",
            receiverDetails: { razonSocial: "Grupo cierre dirigido", cuit: "30712345678" },
            concepts: [{ description: "Cierre dirigido", amount: 100 }],
            paymentRows: [{ method: "cash", amount: "100.00", reference: `CIERRE-${status.toUpperCase()}` }],
            closeReservationIds: [`room-${status}`],
            distributionDetail: { [`room-${status}`]: 100 },
          }),
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: "Sólo se pueden cerrar habitaciones activas de este grupo.",
        });
        expect(mocks.recordGroupPayment).not.toHaveBeenCalled();
      });
    },
  );

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

  it("exposes the persisted fiscal intent needed to resume a group collection after its dialog closes", async () => {
    const pendingIntent = {
      endpoint: `/api/groups/${groupId}/payment`,
      body: {
        receiptType: "factura_b",
        paymentRows: [{ method: "cash", amount: "300000.00", reference: "CANON-300" }],
        distribution: "equal",
        distributionDetail: { "room-a": 100000, "room-b": 100000, "room-c": 100000 },
        settlementBreakdown: {
          documentTotal: 360000,
          appliedAdvances: 60000,
          newCollection: 300000,
        },
      },
    };
    const database = (await import("../db")).db;
    (database.execute as any).mockResolvedValueOnce({
      rows: [{
        id: 901,
        items: [{ descripcion: "Alojamiento grupal", subtotal: 360000 }],
        group_payment_intent: pendingIntent,
      }],
    });

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/groups/${groupId}/pending-fiscal-collections`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([{
        id: 901,
        items: [{ descripcion: "Alojamiento grupal", subtotal: 360000 }],
        intent: pendingIntent,
      }]);
    });

    expect(database.execute).toHaveBeenCalledTimes(1);
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