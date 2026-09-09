import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  executeCalls: 0,
  emitted: [] as any[],
  payment: null as any,
  reservation: null as any,
  existingInvoice: null as any,
}));
const emitirFactura = vi.hoisted(() => vi.fn());
const createReservationPaymentWithLedger = vi.hoisted(() => vi.fn());
const registerCashMovement = vi.hoisted(() => vi.fn());

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
      state.executeCalls++;
      // Mirror the SQL state transitions rather than relying on a fixed call
      // count: invoice validation performs additional reads as the route
      // evolves, while the payment lookup and claim queries are stable.
      const text = sqlText(query);
      if (text.includes("FROM payments")) return { rows: state.payment ? [state.payment] : [] };
      if (text.includes("UPDATE payments")) {
        if (state.payment) state.payment.invoice_ref = JSON.stringify(state.existingInvoice);
        return { rows: [] };
      }
      if (text.includes("FROM reservations")) return { rows: state.reservation ? [state.reservation] : [] };
      if (text.includes("FROM sales_invoices") && text.includes("payment_id")) {
        return { rows: state.existingInvoice ? [state.existingInvoice] : [] };
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
  calcularMontos: vi.fn((items: any[]) => ({
    montoTotal: items.reduce((sum, item) => sum + Number(item.subtotal ?? item.precioUnitario * item.cantidad), 0),
  })),
  emitirFactura,
}));
vi.mock("../db-storage", () => ({
  storage: {
    getReservation: vi.fn(async () => ({ id: "res-1", reservationCode: "R-1", totalRoomAmount: "144000", nights: 1 })),
    getCharges: vi.fn(async () => [{ id: "cargo-1", amount: "144000", category: "otros", status: "active" }]),
    getPayments: vi.fn(async () => []),
    createReservationPaymentWithLedger,
    registerCashMovement,
  },
}));
vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({ getBillingConfig: vi.fn(), updateBillingConfig: vi.fn() }));
vi.mock("../billing/invoicePdf", () => ({ generarFacturaPDF: vi.fn(), generarVoucherHabitacionPDF: vi.fn() }));
vi.mock("../utils/assetPath", () => ({ assetPath: (value: string) => value }));
vi.mock("pdfkit", () => ({ default: class PDFDocument {} }));

const { registerBillingRoutes } = await import("../billing/routes");

function body(overrides: Record<string, unknown> = {}) {
  return {
    tipoComprobante: "FB",
    cliente: { razonSocial: "ESCO", condicionIva: "Consumidor Final" },
    items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 144000, subtotal: 144000, subtotalNeto: 119008.26, alicuotaIva: "21" }],
    reservaId: "res-1",
    paymentId: "pay-cc",
    sourceChargeIds: ["cargo-1"],
    sourceChargeAmounts: { "cargo-1": 144000 },
    cashFormaPago: "cuenta_corriente",
    ccEntityType: "company",
    ccEntityId: "company-1",
    ...overrides,
  };
}

async function withServer(run: (url: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: "admin", username: "admin", fullName: "Admin" }; next(); });
  registerBillingRoutes(app);
  const server = await new Promise<Server>(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try { await run(url); } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function post(url: string, requestBody: unknown) {
  const response = await fetch(`${url}/api/billing/invoices`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody),
  });
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  state.executeCalls = 0;
  state.emitted = [];
  state.reservation = null;
  state.existingInvoice = null;
  state.payment = {
    id: "pay-cc", reservation_id: "res-1", amount: "144000", method: "cuenta_corriente",
    billing_target: "company", company_id: "company-1", agency_id: null,
  };
  emitirFactura.mockReset().mockImplementation(async (data: any) => {
    const invoice = { id: state.emitted.length + 1, tipoComprobante: data.tipoComprobante, puntoVenta: 1, numero: 1, montoTotal: "144000" };
    state.emitted.push(invoice);
    state.existingInvoice = { ...invoice, estado: "emitida" };
    return invoice;
  });
  createReservationPaymentWithLedger.mockReset();
  registerCashMovement.mockReset();
});

describe("advance Cuenta Corriente invoice route", () => {
  it("issues against the existing CC advance, links it server-side, and retry is idempotent", async () => {
    await withServer(async url => {
      const first = await post(url, body());
      expect(first.status).toBe(201);
      expect(emitirFactura).toHaveBeenCalledOnce();
      expect(createReservationPaymentWithLedger).not.toHaveBeenCalled();
      expect(registerCashMovement).not.toHaveBeenCalled();
      const retry = await post(url, body());
      expect(retry.status).toBe(201);
      expect(emitirFactura).toHaveBeenCalledOnce();
      expect(state.emitted).toHaveLength(1);
    });
  });

  it.each([
    ["method", { cashFormaPago: "efectivo" }, "La forma de pago no coincide con el pago existente"],
    ["target", { ccEntityType: "agency", ccEntityId: "agency-1" }, "La entidad de Cuenta Corriente no coincide con el anticipo"],
    ["total", { items: [{ descripcion: "Alojamiento", cantidad: 1, precioUnitario: 1, subtotal: 1, subtotalNeto: 1, alicuotaIva: "21" }], sourceChargeAmounts: { "cargo-1": 1 } }, "El total de la factura debe coincidir con el anticipo"],
  ])("rejects a %s mismatch", async (_name, override, error) => {
    await withServer(async url => {
      const result = await post(url, body(override));
      expect(result.status).toBe(409);
      expect(result.body).toEqual({ error });
      expect(emitirFactura).not.toHaveBeenCalled();
    });
  });

  it("falls back to the reservation company for legacy CC payments", async () => {
    state.payment = { ...state.payment, billing_target: null, company_id: null, agency_id: null };
    state.reservation = { company_id: "company-1", agency_id: null, guest_id: "guest-1" };
    await withServer(async url => {
      expect((await post(url, body({ ccEntityType: "company", ccEntityId: "company-1" }))).status).toBe(201);
      expect(emitirFactura).toHaveBeenCalledWith(expect.objectContaining({ cashFormaPago: "cuenta_corriente" }));
    });
  });

  it("rejects a legacy CC payment when a guest target tries to redirect a company debt", async () => {
    state.payment = { ...state.payment, billing_target: null, company_id: null, agency_id: null };
    state.reservation = { company_id: "company-1", agency_id: null, guest_id: "guest-1" };
    await withServer(async url => {
      const result = await post(url, body({ ccEntityType: "guest", ccEntityId: "guest-1" }));
      expect(result.status).toBe(409);
      expect(result.body).toEqual({ error: "La entidad de Cuenta Corriente no coincide con el anticipo" });
      expect(emitirFactura).not.toHaveBeenCalled();
    });
  });

  it("preserves an agency-owned advance on a reservation with both company and agency", async () => {
    state.payment = { ...state.payment, billing_target: "agency", company_id: "company-1", agency_id: "agency-1" };
    state.reservation = { company_id: "company-1", agency_id: "agency-1", guest_id: "guest-1" };
    await withServer(async url => {
      expect((await post(url, body({ ccEntityType: "agency", ccEntityId: "agency-1" }))).status).toBe(201);
      expect(emitirFactura).toHaveBeenCalledOnce();
    });
  });
});