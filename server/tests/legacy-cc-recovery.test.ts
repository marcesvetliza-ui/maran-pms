import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  repaired: [] as any[],
  pendingIntents: [] as any[],
  pendingInvoice: null as any,
  reservation: null as any,
  chargeRows: [] as any[],
  paymentsTotal: 0,
  queries: [] as string[],
  createPayment: vi.fn(),
  registerCashMovement: vi.fn(),
  reconcileInvoice: vi.fn(),
}));

function sqlText(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(sqlText).join("");
  if (Array.isArray(value?.queryChunks)) return value.queryChunks.map(sqlText).join("");
  if (Array.isArray(value?.value)) return value.value.map(sqlText).join("");
  return "";
}

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async (query: any) => {
      const text = sqlText(query);
      state.queries.push(text);
      if (text.includes("JOIN payments p ON p.id = si.payment_id")) return { rows: state.repaired };
      if (text.includes("credit_reapplication_intent IS NOT NULL")) return { rows: state.pendingIntents };
      if (text.includes("SELECT id, reserva_id, tipo_comprobante")) {
        return { rows: state.pendingInvoice ? [state.pendingInvoice] : [] };
      }
      if (text.includes("SELECT credit_reapplication_intent FROM sales_invoices")) {
        return { rows: state.pendingInvoice ? [state.pendingInvoice] : [] };
      }
      if (text.includes("SELECT id, tipo_comprobante, punto_venta, numero, monto_total, payment_id")) {
        return { rows: state.pendingInvoice ? [state.pendingInvoice] : [] };
      }
      return { rows: [] };
    }),
  },
  pool: {
    connect: vi.fn(async () => ({
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    })),
  },
}));

vi.mock("@shared/schema", () => ({ salesInvoices: {}, invoiceCounters: {}, folioMovements: {} }));
vi.mock("../billing/invoiceService", () => ({
  calcularMontos: vi.fn(),
  emitirFactura: vi.fn(),
  buildComprobanteAsociado: vi.fn(),
}));
vi.mock("../billing/reservationCreditReconciliation", () => ({
  equalCreditSnapshots: vi.fn(),
  findUniqueWholeAdvanceAllocation: vi.fn(),
  getUncoveredReservationSettlement: vi.fn(),
  prepareReservationCreditIntent: vi.fn(),
  reconcileReservationCreditInvoice: state.reconcileInvoice,
}));
vi.mock("../db-storage", () => ({
  storage: {
    getReservation: vi.fn(async () => state.reservation),
    getCharges: vi.fn(async () => state.chargeRows),
    getPaymentsTotal: vi.fn(async () => state.paymentsTotal),
    createReservationPaymentWithLedger: state.createPayment,
    registerCashMovement: state.registerCashMovement,
  },
  getArgentinaToday: vi.fn(() => "2026-03-18"),
}));
vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({ getBillingConfig: vi.fn(), updateBillingConfig: vi.fn() }));
vi.mock("../billing/invoicePdf", () => ({
  generarFacturaPDF: vi.fn(),
  generarVoucherHabitacionPDF: vi.fn(),
}));
vi.mock("../utils/assetPath", () => ({ assetPath: (value: string) => value }));
vi.mock("pdfkit", () => ({ default: class PDFDocument {} }));

const { registerBillingRoutes } = await import("../billing/routes");

async function withServer(run: (url: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "admin", username: "admin", fullName: "Admin" };
    next();
  });
  registerBillingRoutes(app);
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    await run(url);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function recover(url: string) {
  const response = await fetch(`${url}/api/billing/reservations/res-1/legacy-cc/recover`, { method: "POST" });
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  state.repaired = [];
  state.pendingIntents = [];
  state.pendingInvoice = null;
  state.reservation = {
    id: "res-1",
    reservationCode: "R-1",
    companyId: "company-1",
    agencyId: null,
    guestId: "guest-1",
    totalRoomAmount: "129000",
    finalRatePerNight: "129000",
    nights: 1,
  };
  state.chargeRows = [];
  state.paymentsTotal = 0;
  state.queries = [];
  state.createPayment.mockReset().mockImplementation(async () => ({ id: "new-pending-payment" }));
  state.registerCashMovement.mockReset();
  state.reconcileInvoice.mockReset().mockResolvedValue(undefined);
});

describe("legacy Cuenta Corriente recovery route", () => {
  it("does not recover an old linked invoice while a new folio balance of 129000 remains", async () => {
    state.repaired = [{ invoice_id: 10, payment_id: "old-payment" }];
    state.reservation.totalRoomAmount = "258000";
    state.paymentsTotal = 129000;

    await withServer(async url => {
      const result = await recover(url);
      expect(result.status).toBe(404);
      expect(result.body).toMatchObject({ error: expect.stringMatching(/no existe/i) });
    });

    expect(state.createPayment).not.toHaveBeenCalled();
    expect(state.registerCashMovement).not.toHaveBeenCalled();
    expect(state.queries.filter(query => query.includes("JOIN payments p ON p.id = si.payment_id"))).toHaveLength(1);
  });

  it("uses operational services rather than a negative NC adjustment to decide recovery", async () => {
    state.repaired = [{ invoice_id: 10, payment_id: "old-payment" }];
    state.reservation.totalRoomAmount = "0";
    state.reservation.finalRatePerNight = "0";
    state.chargeRows = [
      {
        id: "nc-adjustment",
        amount: "-129000",
        category: "adjustment",
        description: "Ajuste NC [nc:3:charge-1]",
        status: "active",
      },
      { id: "new-service", amount: "129000", category: "otros", status: "active" },
    ];

    await withServer(async url => {
      const result = await recover(url);
      expect(result.status).toBe(404);
    });

    expect(state.createPayment).not.toHaveBeenCalled();
    expect(state.registerCashMovement).not.toHaveBeenCalled();
  });

  it("ignores multiple older linked invoices when a new folio balance remains", async () => {
    state.repaired = [
      { invoice_id: 11, payment_id: "old-payment-11" },
      { invoice_id: 10, payment_id: "old-payment-10" },
    ];
    state.reservation.totalRoomAmount = "258000";
    state.paymentsTotal = 129000;

    await withServer(async url => {
      const result = await recover(url);
      expect(result.status).toBe(404);
    });

    expect(state.createPayment).not.toHaveBeenCalled();
    expect(state.registerCashMovement).not.toHaveBeenCalled();
  });

  it("prioritizes a pending durable settlement over an already-linked historical invoice", async () => {
    state.repaired = [{ invoice_id: 10, payment_id: "old-payment" }];
    state.pendingInvoice = {
      id: 20,
      reserva_id: "res-1",
      tipo_comprobante: "FB",
      punto_venta: 1,
      numero: 20,
      monto_total: "129000",
      estado: "emitida",
      operador: "admin",
      payment_id: null,
      credit_reapplication_intent: {
        operationId: "settlement-1234567890",
        settlement: {
          destination: "cuenta_corriente",
          amount: 129000,
          status: "pending",
          ccEntityType: "company",
          ccEntityId: "company-1",
          label: "Liquidación CC",
        },
      },
    };
    state.pendingIntents = [{ id: 20 }];
    state.createPayment.mockImplementation(async () => {
      state.pendingInvoice.payment_id = "new-pending-payment";
      return { id: "new-pending-payment" };
    });

    await withServer(async url => {
      const result = await recover(url);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        recovered: true,
        invoiceId: 20,
        paymentId: "new-pending-payment",
        invoice: {
          id: 20,
          tipoComprobante: "FB",
          puntoVenta: 1,
          numero: 20,
          montoTotal: "129000",
          paymentId: "new-pending-payment",
        },
      });
    });

    expect(state.reconcileInvoice).toHaveBeenCalledWith(20);
    expect(state.createPayment).toHaveBeenCalledOnce();
    expect(state.queries.some(query => query.includes("JOIN payments p ON p.id = si.payment_id"))).toBe(false);
    expect(state.registerCashMovement).not.toHaveBeenCalled();
  });

  it("recovers a fully settled linked legacy repair idempotently", async () => {
    state.repaired = [{
      invoice_id: 10,
      payment_id: "settled-payment",
      tipo_comprobante: "FB",
      punto_venta: 1,
      numero: 10,
      monto_total: "129000",
    }];
    state.paymentsTotal = 129000;

    await withServer(async url => {
      const first = await recover(url);
      const second = await recover(url);
      expect(first).toEqual({
        status: 200,
        body: {
          recovered: true,
          invoiceId: 10,
          paymentId: "settled-payment",
          invoice: {
            id: 10,
            tipoComprobante: "FB",
            puntoVenta: 1,
            numero: 10,
            montoTotal: "129000",
            paymentId: "settled-payment",
          },
        },
      });
      expect(second).toEqual(first);
    });

    expect(state.createPayment).not.toHaveBeenCalled();
    expect(state.registerCashMovement).not.toHaveBeenCalled();
  });
});