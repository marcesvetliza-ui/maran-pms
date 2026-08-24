import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as Array<{ rows: any[] }>,
  transactionExecutions: 0,
  emittedCalls: [] as any[],
}));

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () => state.responses.shift() ?? { rows: [] }),
    transaction: vi.fn(async (callback: any) => callback({
      execute: async () => {
        state.transactionExecutions++;
        return { rows: [] };
      },
    })),
  },
  pool: {
    connect: vi.fn(async () => ({
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    })),
  },
}));

vi.mock("@shared/schema", () => ({
  salesInvoices: {},
  invoiceCounters: {},
  folioMovements: {},
  charges: {},
}));

vi.mock("../billing/invoiceService", () => ({
  emitirFactura: vi.fn(async (data: any) => {
    state.emittedCalls.push(data);
    return {
      id: 90,
      tipo_comprobante: "NCB",
      punto_venta: 1,
      numero: 15,
      estado: "emitida",
      monto_total: "100.00",
      source_charge_amounts: JSON.stringify({ "charge-1": 100 }),
      reconciliation_status: "pendiente",
    };
  }),
}));

vi.mock("../db-storage", () => ({
  storage: {
    getReservation: vi.fn(),
    getCharges: vi.fn(),
    createAccountMovement: vi.fn(),
    registerCashMovement: vi.fn(),
  },
  getArgentinaToday: () => "2026-08-23",
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

const originalInvoice = {
  id: 12,
  reserva_id: "reservation-1",
  tipo_comprobante: "FB",
  punto_venta: 1,
  numero: 8,
  cliente_razon_social: "Consumidor Final",
  cliente_condicion_iva: "Consumidor Final",
  monto_total: "100.00",
  monto_acreditado: "0.00",
  estado: "emitida",
  source_charge_ids: JSON.stringify(["charge-1"]),
  source_charge_amounts: JSON.stringify({ "charge-1": 100 }),
  items: JSON.stringify([{ descripcion: "Alojamiento", subtotal: 100 }]),
};

function pendingCredit(stateName: "emitida" | "autorizacion_pendiente") {
  return {
    id: 90,
    nota_credito_id: 12,
    reserva_id: "reservation-1",
    tipo_comprobante: "NCB",
    punto_venta: 1,
    numero: 15,
    estado: stateName,
    monto_total: "100.00",
    source_charge_amounts: JSON.stringify({ "charge-1": 100 }),
    cash_forma_pago: "efectivo",
    reconciliation_status: "pendiente",
    items: JSON.stringify([{ descripcion: "Alojamiento", subtotal: 100 }]),
  };
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(express.json());
  app.use((_req, _res, next) => {
    (_req as any).user = { id: "admin-1", username: "admin", fullName: "Admin" };
    next();
  });
  registerBillingRoutes(app);
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

beforeEach(() => {
  state.responses = [];
  state.transactionExecutions = 0;
  state.emittedCalls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("reservation credit-note reconciliation recovery", () => {
  it("reconciles an already authorized pending NC instead of emitting another one", async () => {
    state.responses = [
      { rows: [originalInvoice] },
      { rows: [originalInvoice] }, // re-read after the reservation advisory lock
      { rows: [pendingCredit("emitida")] },
    ];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices/12/nota-credito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: "Corrección" }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        id: 90,
        reconciliationRecovered: true,
        reconciliation_status: "conciliada",
      });
    });

    expect(state.emittedCalls).toHaveLength(0);
    expect(state.transactionExecutions).toBe(3);
  });

  it("reuses the persisted NC id and number when authorization itself must be retried", async () => {
    state.responses = [
      { rows: [originalInvoice] },
      { rows: [originalInvoice] }, // re-read after the reservation advisory lock
      { rows: [pendingCredit("autorizacion_pendiente")] },
    ];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices/12/nota-credito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: "Corrección" }),
      });
      expect(response.status).toBe(200);
    });

    expect(state.emittedCalls).toHaveLength(1);
    expect(state.emittedCalls[0]).toMatchObject({
      recoveryInvoiceId: 90,
      recoverableCreditNote: true,
      puntoVentaOverride: 1,
    });
    expect(state.transactionExecutions).toBe(3);
  });

  it("lets finance staff resolve the same pending NC from the reconciliation queue", async () => {
    state.responses = [
      { rows: [{ id: 90, original_invoice_id: 12 }] },
      { rows: [pendingCredit("emitida")] },
      { rows: [originalInvoice] },
      { rows: [pendingCredit("emitida")] },
      { rows: [originalInvoice] },
    ];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/credit-notes/90/reconcile`, {
        method: "POST",
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        id: 90,
        reconciliationRecovered: true,
        reconciliation_status: "conciliada",
      });
    });

    expect(state.emittedCalls).toHaveLength(0);
    expect(state.transactionExecutions).toBe(3);
  });
});