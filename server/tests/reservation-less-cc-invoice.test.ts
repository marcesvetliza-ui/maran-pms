import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A Cuenta Corriente settlement does not require a reservation: a company or
 * agency (or guest) billed directly from the Centro de Comprobantes, with no
 * reservation in play, must still be able to settle to Cuenta Corriente. This
 * used to unconditionally throw 409 "No se encontró la reserva para registrar
 * la liquidación CC" whenever reservaId was absent. The fix creates the debt
 * directly against the entity's cuenta corriente (via storage.createAccountMovement,
 * the same mechanism already used by reservation-less restaurant CC orders)
 * instead of going through the reservation-only payment/folio ledger.
 */

const state = vi.hoisted(() => ({
  emitted: [] as any[],
  existingCargos: [] as any[],
}));
const emitirFactura = vi.hoisted(() => vi.fn());
const createReservationPaymentWithLedger = vi.hoisted(() => vi.fn());
const createAccountMovement = vi.hoisted(() => vi.fn());
const getAccountMovements = vi.hoisted(() => vi.fn());
const registerCashMovement = vi.hoisted(() => vi.fn());
const getReservation = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({
  db: { execute: vi.fn(async () => ({ rows: [] })) },
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
  buildComprobanteAsociado: (doc: any) => ({
    tipo: String(doc?.tipo_comprobante ?? doc?.tipoComprobante ?? ""),
    puntoVenta: Number(doc?.punto_venta ?? doc?.puntoVenta ?? 0),
    numero: Number(doc?.numero ?? 0),
    fecha: String(doc?.fecha_emision ?? doc?.fechaEmision ?? "").replace(/-/g, ""),
  }),
}));
vi.mock("../db-storage", () => ({
  storage: {
    getReservation,
    getCharges: vi.fn(async () => []),
    getPayments: vi.fn(async () => []),
    createReservationPaymentWithLedger,
    createAccountMovement,
    getAccountMovements,
    registerCashMovement,
  },
}));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: vi.fn() }));
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
    cliente: { razonSocial: "Empresa Directa SA", condicionIva: "Consumidor Final" },
    items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 50000, subtotal: 50000, subtotalNeto: 41322.31, alicuotaIva: "21" }],
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
  state.emitted = [];
  state.existingCargos = [];
  emitirFactura.mockReset().mockImplementation(async (data: any) => {
    // Real invoice emission is itself idempotent (recoveryInvoiceId keyed on
    // the operation) — a retried request resolves to the *same* persisted
    // invoice/number rather than minting a new one. Mirror that here so the
    // cargo-dedup guard is exercised against a repeated reference.
    if (state.emitted.length > 0) return state.emitted[0];
    const invoice = { id: 1, tipoComprobante: data.tipoComprobante, puntoVenta: 1, numero: 1, montoTotal: "50000" };
    state.emitted.push(invoice);
    return invoice;
  });
  createReservationPaymentWithLedger.mockReset();
  registerCashMovement.mockReset();
  getReservation.mockReset();
  createAccountMovement.mockReset().mockImplementation(async (data: any) => {
    const cargo = { id: `cargo-${state.existingCargos.length + 1}`, ...data };
    state.existingCargos.push(cargo);
    return cargo;
  });
  getAccountMovements.mockReset().mockImplementation(async () => state.existingCargos);
});

describe("Cuenta Corriente invoice with no reservation", () => {
  it("rechaza el texto libre del Centro de Comprobantes sin ficha seleccionada", async () => {
    await withServer(async url => {
      const result = await post(url, body({ recipientMode: "centro_comprobantes" }));
      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(/ficha real/);
      expect(emitirFactura).not.toHaveBeenCalled();
    });
  });

  it("rechaza un receptor enlazado inexistente antes de emitir", async () => {
    await withServer(async url => {
      const result = await post(url, body({ recipientEntity: { type: "guest", id: "guest-inexistente" } }));
      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(/ficha del receptor/);
      expect(emitirFactura).not.toHaveBeenCalled();
    });
  });

  it("settles directly against the entity's cuenta corriente instead of requiring a reservation", async () => {
    await withServer(async url => {
      const result = await post(url, body());
      expect(result.status).toBe(201);
      expect(emitirFactura).toHaveBeenCalledOnce();
      expect(createReservationPaymentWithLedger).not.toHaveBeenCalled();
      expect(getReservation).not.toHaveBeenCalled();
      expect(createAccountMovement).toHaveBeenCalledOnce();
      expect(createAccountMovement).toHaveBeenCalledWith(expect.objectContaining({
        entityType: "company",
        entityId: "company-1",
        type: "cargo",
        amount: "50000.00",
        reference: "FB-00000001",
      }));
    });
  });

  it("does not duplicate the cargo on a retried request for the same invoice", async () => {
    await withServer(async url => {
      const first = await post(url, body());
      expect(first.status).toBe(201);
      expect(createAccountMovement).toHaveBeenCalledOnce();

      const second = await post(url, body());
      expect(second.status).toBe(201);
      // Same fiscal reference (FB-00000001) already has a cargo — no duplicate insert.
      expect(createAccountMovement).toHaveBeenCalledOnce();
    });
  });
});
