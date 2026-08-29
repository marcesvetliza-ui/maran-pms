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
    const sourceChargeAmounts = data.sourceChargeAmounts ?? { "charge-1": 100 };
    const amount = Object.values(sourceChargeAmounts).reduce(
      (sum: number, value) => sum + Number(value),
      0,
    );
    return {
      id: 90,
      tipo_comprobante: data.tipoComprobante ?? "NCB",
      punto_venta: data.puntoVentaOverride ?? 1,
      numero: 15,
      estado: "emitida",
      monto_total: amount.toFixed(2),
      source_charge_amounts: JSON.stringify(sourceChargeAmounts),
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

const multiChargeInvoice = {
  ...originalInvoice,
  monto_total: "180.00",
  monto_acreditado: "0.00",
  cliente_razon_social: "Hotel Demo SA",
  cliente_cuit: "30-12345678-9",
  cliente_condicion_iva: "Responsable Inscripto",
  cliente_domicilio: "Av. Siempre Viva 123",
  cash_forma_pago: "transferencia",
  source_charge_ids: JSON.stringify(["accommodation", "restaurant", "parking"]),
  source_charge_amounts: JSON.stringify({
    accommodation: 100,
    restaurant: 50,
    parking: 30,
  }),
  items: JSON.stringify([
    { descripcion: "Alojamiento", subtotal: 100, alicuotaIva: "21" },
    { descripcion: "Cena", subtotal: 50, alicuotaIva: "21" },
    { descripcion: "Cochera", subtotal: 30, alicuotaIva: "21" },
  ]),
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

describe("reservation credit notes from Administración", () => {
  it("emits only the selected charge and preserves receiver, point of sale, and payment method", async () => {
    state.responses = [
      { rows: [multiChargeInvoice] },
      { rows: [multiChargeInvoice] }, // re-read after the reservation advisory lock
      { rows: [] }, // no unresolved NC
      { rows: [] }, // no previous NCs
    ];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices/12/nota-credito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motivo: "Corrección de cena",
          monto: 50,
          items: [{ sourceId: "restaurant", amount: 50 }],
        }),
      });

      expect(response.status).toBe(201);
    });

    expect(state.emittedCalls).toHaveLength(1);
    expect(state.emittedCalls[0]).toMatchObject({
      tipoComprobante: "NCB",
      facturaOriginalId: 12,
      puntoVentaOverride: 1,
      cashFormaPago: "transferencia",
      cliente: {
        razonSocial: "Hotel Demo SA",
        cuit: "30-12345678-9",
        condicionIva: "Responsable Inscripto",
        domicilio: "Av. Siempre Viva 123",
      },
      sourceChargeIds: ["restaurant"],
      sourceChargeAmounts: { restaurant: 50 },
    });
    expect(state.emittedCalls[0].items).toEqual([
      expect.objectContaining({ descripcion: "Cena", precioUnitario: 50, subtotal: 50 }),
    ]);
  });

  it("uses only the residual of a charge on a second partial NC", async () => {
    const partiallyCreditedInvoice = {
      ...multiChargeInvoice,
      monto_acreditado: "30.00",
    };
    state.responses = [
      { rows: [partiallyCreditedInvoice] },
      { rows: [partiallyCreditedInvoice] }, // re-read after the reservation advisory lock
      { rows: [] }, // no unresolved NC
      {
        rows: [{
          source_charge_amounts: JSON.stringify({ restaurant: 30 }),
          monto_total: "30.00",
        }],
      },
    ];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices/12/nota-credito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motivo: "Corrección restante de cena",
          monto: 20,
          items: [{ sourceId: "restaurant", amount: 20 }],
        }),
      });

      expect(response.status).toBe(201);
    });

    expect(state.emittedCalls).toHaveLength(1);
    expect(state.emittedCalls[0].sourceChargeAmounts).toEqual({ restaurant: 20 });
    expect(state.emittedCalls[0].sourceChargeIds).toEqual(["restaurant"]);
  });

  it("blocks a new NC when a previous NC has an invalid charge map", async () => {
    const partiallyCreditedInvoice = {
      ...multiChargeInvoice,
      monto_acreditado: "20.00",
    };
    state.responses = [
      { rows: [partiallyCreditedInvoice] },
      { rows: [partiallyCreditedInvoice] }, // re-read after the reservation advisory lock
      { rows: [] }, // no unresolved NC
      {
        rows: [{
          source_charge_amounts: "not-json",
          monto_total: "20.00",
        }],
      },
    ];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices/12/nota-credito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motivo: "No debería emitirse",
          items: [{ sourceId: "restaurant", amount: 20 }],
        }),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining("sin detalle por cargo"),
      });
    });

    expect(state.emittedCalls).toHaveLength(0);
  });

  it("blocks a new NC when the historical charge map disagrees with the credited total", async () => {
    const partiallyCreditedInvoice = {
      ...multiChargeInvoice,
      monto_acreditado: "20.00",
    };
    state.responses = [
      { rows: [partiallyCreditedInvoice] },
      { rows: [partiallyCreditedInvoice] }, // re-read after the reservation advisory lock
      { rows: [] }, // no unresolved NC
      {
        rows: [{
          source_charge_amounts: JSON.stringify({ restaurant: 15 }),
          monto_total: "15.00",
        }],
      },
    ];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices/12/nota-credito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motivo: "No debería emitirse",
          items: [{ sourceId: "restaurant", amount: 20 }],
        }),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining("no coincide con el total acreditado"),
      });
    });

    expect(state.emittedCalls).toHaveLength(0);
  });
});

describe("group-payment credit notes", () => {
  it("preserves the exact source map and immutable composition labels", async () => {
    const compositionSources = [
      {
        id: "reservation:r-1:accommodation",
        kind: "accommodation",
        concept: "Alojamiento",
        destination: "Habitación 101",
        reservationCode: "R-1",
        roomNumber: "101",
      },
      {
        id: "group-charge:g-1",
        kind: "group_charge",
        concept: "Salón",
        destination: "Grupo",
      },
    ];
    const groupPaymentInvoice = {
      ...multiChargeInvoice,
      reserva_id: null,
      group_id: "group-1",
      group_payment_id: "payment-1",
      monto_total: "80.00",
      source_charge_ids: JSON.stringify([
        "reservation:r-1:accommodation",
        "group-charge:g-1",
      ]),
      source_charge_amounts: JSON.stringify({
        "reservation:r-1:accommodation": 50,
        "group-charge:g-1": 30,
      }),
      items: JSON.stringify([{
        descripcion: "Servicios grupales",
        subtotal: 80,
        alicuotaIva: "21",
        groupCompositionSources: compositionSources,
      }]),
    };
    state.responses = [
      { rows: [groupPaymentInvoice] },
      { rows: [groupPaymentInvoice] },
      { rows: [] },
      { rows: [] },
    ];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices/12/nota-credito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motivo: "Corrección de salón",
          monto: 30,
          items: [{ sourceId: "group-charge:g-1", amount: 30 }],
        }),
      });
      expect(response.status).toBe(201);
    });

    expect(state.emittedCalls).toHaveLength(1);
    expect(state.emittedCalls[0]).toMatchObject({
      groupId: "group-1",
      sourceChargeIds: ["group-charge:g-1"],
      sourceChargeAmounts: { "group-charge:g-1": 30 },
    });
    expect(state.emittedCalls[0].items[0].groupCompositionSources).toEqual([
      expect.objectContaining(compositionSources[1]),
    ]);
  });

  it("keeps a legacy linked group invoice and its credit note in the same group history", async () => {
    const compositionSources = [{
      id: "group-charge:legacy-1",
      kind: "group_charge",
      concept: "Salón histórico",
      destination: "Grupo",
    }];
    const legacyInvoice = {
      ...multiChargeInvoice,
      reserva_id: null,
      group_id: null,
      group_payment_id: null,
      monto_total: "30.00",
      source_charge_ids: JSON.stringify(["group-charge:legacy-1"]),
      source_charge_amounts: JSON.stringify({ "group-charge:legacy-1": 30 }),
      items: JSON.stringify([{
        descripcion: "Salón histórico",
        subtotal: 30,
        alicuotaIva: "21",
        groupCompositionSources: compositionSources,
      }]),
    };
    state.responses = [
      { rows: [legacyInvoice] },
      { rows: [{ group_id: "legacy-group-1" }] },
      { rows: [legacyInvoice] },
      { rows: [] },
      { rows: [] },
    ];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices/12/nota-credito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motivo: "Corrección histórica",
          items: [{ sourceId: "group-charge:legacy-1", amount: 30 }],
        }),
      });
      expect(response.status).toBe(201);
    });

    expect(state.emittedCalls[0]).toMatchObject({
      groupId: "legacy-group-1",
      sourceChargeIds: ["group-charge:legacy-1"],
      sourceChargeAmounts: { "group-charge:legacy-1": 30 },
    });
    expect(state.emittedCalls[0].items[0].groupCompositionSources).toEqual([
      expect.objectContaining(compositionSources[0]),
    ]);
  });

  it("keeps a pre-map legacy credit note group-owned without inventing source details", async () => {
    const legacyInvoiceWithoutMap = {
      ...multiChargeInvoice,
      reserva_id: null,
      group_id: null,
      group_payment_id: null,
      source_charge_ids: null,
      source_charge_amounts: null,
      items: JSON.stringify([{ descripcion: "Servicios históricos", subtotal: 180, alicuotaIva: "21" }]),
    };
    state.responses = [
      { rows: [legacyInvoiceWithoutMap] },
      { rows: [{ group_id: "legacy-group-1" }] },
      { rows: [legacyInvoiceWithoutMap] },
    ];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices/12/nota-credito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: "Anulación histórica" }),
      });
      expect(response.status).toBe(201);
    });

    expect(state.emittedCalls[0]).toMatchObject({
      groupId: "legacy-group-1",
      sourceChargeIds: undefined,
      sourceChargeAmounts: undefined,
    });
  });
});

describe("group debit notes", () => {
  it("persists a group-charge composition for the added debit", async () => {
    const groupInvoice = {
      ...multiChargeInvoice,
      reserva_id: null,
      group_id: "group-1",
      group_payment_id: null,
      monto_total: "80.00",
    };
    state.responses = [
      { rows: [groupInvoice] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
    ];

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices/12/nota-debito`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motivo: "Diferencia de servicio",
          monto: 12.34,
        }),
      });
      expect(response.status).toBe(201);
    });

    expect(state.emittedCalls).toHaveLength(1);
    expect(state.emittedCalls[0]).toMatchObject({
      tipoComprobante: "NDB",
      groupId: "group-1",
      sourceChargeIds: ["group-debit:12"],
      sourceChargeAmounts: { "group-debit:12": 12.34 },
    });
    expect(state.emittedCalls[0].items[0].groupCompositionSources).toEqual([
      expect.objectContaining({
        id: "group-debit:12",
        kind: "group_charge",
        concept: "Diferencia de servicio",
        destination: "Grupo",
      }),
    ]);
  });
});
