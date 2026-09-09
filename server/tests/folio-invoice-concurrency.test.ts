import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  invoices: [] as any[],
  charges: [] as any[],
  emitted: [] as any[],
  locked: false,
  waiters: [] as Array<() => void>,
  releaseCalls: 0,
}));

async function acquireLock() {
  if (!state.locked) {
    state.locked = true;
    return;
  }
  await new Promise<void>((resolve) => state.waiters.push(resolve));
}

function releaseLock() {
  const next = state.waiters.shift();
  if (next) {
    next();
    return;
  }
  state.locked = false;
}

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () => ({ rows: state.invoices })),
  },
  pool: {
    connect: vi.fn(async () => ({
      query: async (query: string) => {
        if (query.includes("pg_advisory_lock")) {
          await acquireLock();
        } else if (query.includes("pg_advisory_unlock")) {
          state.releaseCalls++;
          releaseLock();
        }
        return { rows: [] };
      },
      release: vi.fn(),
    })),
  },
}));

vi.mock("@shared/schema", () => ({
  salesInvoices: {},
  invoiceCounters: {},
  folioMovements: {},
}));

vi.mock("../billing/invoiceService", () => ({
  calcularMontos: vi.fn((items: any[]) => ({
    montoTotal: items.reduce((sum, item) => sum + Number(item.subtotal ?? item.precioUnitario * item.cantidad), 0),
  })),
  emitirFactura: vi.fn(async (data: any) => {
    // Keep the first request inside the reservation lock long enough for the
    // second request to reach and wait on the same lock.
    await new Promise((resolve) => setTimeout(resolve, 15));
    const invoice = {
      id: state.emitted.length + 1,
      tipoComprobante: data.tipoComprobante,
      puntoVenta: 1,
      numero: state.emitted.length + 1,
      montoTotal: "100.00",
      sourceChargeAmounts: data.sourceChargeAmounts,
    };
    state.emitted.push(invoice);
    state.invoices.push({
      source_charge_amounts: data.sourceChargeAmounts,
      monto_total: "100.00",
      monto_acreditado: "0.00",
    });
    return invoice;
  }),
}));

vi.mock("../db-storage", () => ({
  storage: {
    getReservation: vi.fn(async () => ({
      id: "reservation-1",
      totalRoomAmount: "0",
      finalRatePerNight: "0",
      nights: 1,
    })),
    getCharges: vi.fn(async () => state.charges),
    getPayments: vi.fn(async () => []),
    createAccountMovement: vi.fn(),
    registerCashMovement: vi.fn(),
  },
}));

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(),
  updateBillingConfig: vi.fn(),
}));
vi.mock("../billing/invoicePdf", () => ({
  generarFacturaPDF: vi.fn(),
  generarVoucherHabitacionPDF: vi.fn(),
}));
vi.mock("../utils/assetPath", () => ({ assetPath: (value: string) => value }));
vi.mock("pdfkit", () => ({
  default: class PDFDocument {},
}));

const { registerBillingRoutes } = await import("../billing/routes");

function invoiceBody(overrides: Record<string, unknown> = {}) {
  return {
    tipoComprobante: "FB",
    cliente: {
      razonSocial: "Consumidor Final",
      condicionIva: "Consumidor Final",
    },
    items: [{
      descripcion: "Cargo de prueba",
      cantidad: 1,
      precioUnitario: 100,
      alicuotaIva: "21",
      subtotalNeto: 82.64,
      subtotal: 100,
    }],
    reservaId: "reservation-1",
    sourceChargeIds: ["charge-1"],
    sourceChargeAmounts: { "charge-1": 100 },
    ...overrides,
  };
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "admin-1", username: "admin", fullName: "Admin" };
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
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

beforeEach(() => {
  state.invoices = [];
  state.charges = [
    { id: "charge-1", amount: "100.00", category: "otros", status: "active" },
  ];
  state.emitted = [];
  state.locked = false;
  state.waiters = [];
  state.releaseCalls = 0;
});


afterEach(() => {
  if (state.locked) {
    state.locked = false;
    while (state.waiters.length) state.waiters.shift()?.();
  }
});

describe("folio invoice source guard", () => {
  it("returns the recovery no-op contract for a brand-new operation under the reservation lock", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/billing/reservations/reservation-1/operations/operation-12345678901234567890/recover`,
        { method: "POST" },
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "No existe una operación persistida para recuperar",
      });
      expect(state.releaseCalls).toBe(1);
    });
  });

  it("allows only one of two simultaneous invoices to consume the same charge", async () => {
    await withServer(async (baseUrl) => {
      const [first, second] = await Promise.all([
        fetch(`${baseUrl}/api/billing/invoices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invoiceBody()),
        }),
        fetch(`${baseUrl}/api/billing/invoices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invoiceBody()),
        }),
      ]);

      expect([first.status, second.status].sort()).toEqual([201, 409]);
      expect(state.emitted).toHaveLength(1);
      expect(state.releaseCalls).toBe(2);
    });
  });

  it("rejects a reservation invoice that omits the per-charge amount mapping", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceBody({ sourceChargeAmounts: undefined })),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/importe de cada cargo/i),
      });
      expect(state.emitted).toHaveLength(0);
    });
  });

  it("reserves source capacity while an authorization-pending draft is recoverable", async () => {
    state.invoices = [{
      id: 77,
      estado: "autorizacion_pendiente",
      tipo_comprobante: "FB",
      source_charge_ids: ["charge-1"],
      source_charge_amounts: { "charge-1": 100 },
      monto_total: "100.00",
      monto_acreditado: "0.00",
      credit_reapplication_intent: {
        operationId: "pending-operation-1234567890",
        status: "pending",
      },
    }];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceBody()),
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/saldo suficiente/i),
      });
    });
    expect(state.emitted).toHaveLength(0);
  });

  it("replays an operation whose invoice was fully credited without issuing again", async () => {
    const operationId = "12345678-1234-1234-1234-123456789012";
    state.invoices = [{
      id: 88,
      estado: "anulada",
      tipo_comprobante: "FB",
      punto_venta: 1,
      numero: 8,
      monto_total: "100.00",
      credit_reapplication_intent: {
        operationId,
        tipoComprobante: "FB",
        recipient: {
          razonSocial: "Consumidor Final",
          cuit: "",
          dni: "",
          condicionIva: "Consumidor Final",
        },
        items: invoiceBody().items,
        sourceChargeIds: ["charge-1"],
        sourceChargeAmounts: { "charge-1": 100 },
        invoiceTotal: 100,
        payments: [{ paymentId: "payment-credit", amount: 100 }],
        settlement: {
          destination: "none",
          amount: 0,
          method: null,
          cashArea: null,
          ccEntityType: null,
          ccEntityId: null,
          label: `FB reaplicación ${operationId}`,
          status: "completed",
        },
        status: "completed",
      },
    }];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceBody({
          creditOperationId: operationId,
          creditReapplications: [{ paymentId: "payment-credit", amount: 100 }],
        })),
      });
      const body = await response.json();
      expect(response.status, JSON.stringify(body)).toBe(201);
      expect(body).toMatchObject({ id: 88, estado: "anulada" });
    });
    expect(state.emitted).toHaveLength(0);
  });

  it("allows the full charge to be invoiced again after its invoice was fully credited", async () => {
    state.charges.push({
      id: "nc-adjustment",
      amount: "-100.00",
      category: "adjustment",
      status: "active",
      description: "Ajuste por NC NCB 0001-00000002 [nc:2:charge-1]",
    });
    // A fully credited original is estado=anulada and is intentionally absent
    // from the active prior-invoice query.
    state.invoices = [];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceBody()),
      });

      expect(response.status).toBe(201);
    });

    expect(state.emitted).toHaveLength(1);
    expect(state.emitted[0].sourceChargeAmounts).toEqual({ "charge-1": 100 });
  });

  it("allows only the amount restored by a partial credit note to be invoiced again", async () => {
    state.charges.push({
      id: "nc-adjustment",
      amount: "-40.00",
      category: "adjustment",
      status: "active",
      description: "Ajuste por NC NCB 0001-00000002 [nc:2:charge-1]",
    });
    state.invoices = [{
      source_charge_amounts: { "charge-1": 100 },
      credit_source_charge_amounts: [{ "charge-1": 40 }],
      monto_total: "100.00",
      monto_acreditado: "40.00",
    }];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceBody({
          items: [{
            descripcion: "Cargo de prueba",
            cantidad: 1,
            precioUnitario: 40,
            alicuotaIva: "21",
            subtotalNeto: 33.06,
            subtotal: 40,
          }],
          sourceChargeAmounts: { "charge-1": 40 },
        })),
      });

      expect(response.status).toBe(201);
    });

    expect(state.emitted).toHaveLength(1);
    expect(state.emitted[0].sourceChargeAmounts).toEqual({ "charge-1": 40 });
  });
});