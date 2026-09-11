import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

const originalFetch = global.fetch;

const state = vi.hoisted(() => ({
  events: [] as string[],
  insertValues: [] as any[],
  executeCount: 0,
  savedDraft: null as any,
  authorizationError: null as string | null,
  reconciliationUpdateCount: 0,
  billingConfig: { arcaAmbiente: "ficticio", puntoVenta: 1 } as any,
  schemaError: null as Error | null,
  schemaChecks: 0,
}));

vi.mock("../db", () => ({
  db: {
    transaction: vi.fn(async (action: (tx: any) => Promise<any>) => action({
      execute: vi.fn(async () => ({ rows: [] })),
      insert: vi.fn(() => ({
        values: (values: any) => {
          state.events.push("insert-draft");
          state.insertValues.push(values);
          state.savedDraft = {
            id: 44,
            ...values,
            estado: "autorizacion_pendiente",
            reconciliationStatus: "pendiente",
            reconciliationError: null,
          };
          return { returning: async () => [{ ...state.savedDraft }] };
        },
      })),
    })),
    execute: vi.fn(async () => {
      state.events.push("execute");
      state.executeCount++;
      if (state.savedDraft && state.authorizationError) {
        state.reconciliationUpdateCount++;
        state.savedDraft.reconciliationError = state.authorizationError;
        return { rows: [] };
      }
      // The execution advances the fictitious invoice counter. Finalization
      // uses the Drizzle update builder mocked below.
      return { rows: [{ ultimo_numero: 7 }] };
    }),
    insert: vi.fn(() => ({
      values: (values: any) => {
        state.events.push("insert-draft");
        state.insertValues.push(values);
        state.savedDraft = {
          id: 44,
          ...values,
          estado: "autorizacion_pendiente",
          reconciliationStatus: "pendiente",
          reconciliationError: null,
        };
        return {
          returning: async () => [{
            ...state.savedDraft,
          }],
        };
      },
    })),
    update: vi.fn(() => ({
      set: (values: any) => {
        state.events.push("update");
        return {
          where: (_condition: unknown) => ({
            returning: async () => [{
              id: 44,
              ...values,
              reconciliationStatus: "pendiente",
            }],
          }),
        };
      },
    })),
  },
}));

vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(async () => state.billingConfig),
}));

vi.mock("../migrate", () => ({
  assertFinancialSchemaReady: vi.fn(() => {
    state.schemaChecks++;
    if (state.schemaError) throw state.schemaError;
  }),
}));

vi.mock("../billing/wsaaClient", () => ({
  getTokenAuth: vi.fn(async () => ({ token: "token", sign: "sign" })),
}));

vi.mock("../billing/wsfevClient", () => ({
  feCAESolicitar: vi.fn(async () => {
    throw new Error("ARCA no responde");
  }),
  feCompConsultar: vi.fn(),
}));

const { emitirFactura } = await import("../billing/invoiceService");

describe("recoverable reservation credit-note emission", () => {
  // Este archivo mockea wsaaClient/wsfevClient por completo pero ejercita el
  // camino real de invoiceService.ts (incluida su llamada directa a AFIP en
  // getNextInvoiceNumberFromAfip cuando arcaAmbiente="homologacion"/
  // "produccion"). El default global de test es APP_ENV=test (fail-closed),
  // así que acá se simula production explícitamente para llegar al fetch
  // mockeado — ver server/tests/setup.ts.
  beforeEach(() => {
    resetAppEnvForTests();
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    state.events = [];
    state.insertValues = [];
    state.executeCount = 0;
    state.savedDraft = null;
    state.authorizationError = null;
    state.reconciliationUpdateCount = 0;
    state.billingConfig = { arcaAmbiente: "ficticio", puntoVenta: 1 };
    state.schemaError = null;
    state.schemaChecks = 0;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    resetAppEnvForTests();
  });

  it("persists an authorization-pending NC with its charge map before finalizing it", async () => {
    const invoice = await emitirFactura({
      tipoComprobante: "NCB",
      cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
      items: [{
        descripcion: "Alojamiento",
        cantidad: 1,
        precioUnitario: 100,
        alicuotaIva: "no_gravado",
        subtotalNeto: 0,
        subtotal: 100,
      }],
      reservaId: "reservation-1",
      facturaOriginalId: 12,
      sourceChargeIds: ["charge-1"],
      sourceChargeAmounts: { "charge-1": 100 },
      recoverableCreditNote: true,
    });

    expect(state.events).toEqual(["execute", "insert-draft", "update"]);
    expect(state.insertValues[0]).toMatchObject({
      estado: "autorizacion_pendiente",
      reconciliationStatus: "pendiente",
      notaCreditoId: 12,
      // jsonb columns must receive the raw object — drizzle-orm serializes it
      // itself. Pre-stringifying here previously stored a double-encoded
      // jsonb scalar string, which silently broke jsonb_agg() rollups (e.g.
      // the group invoice snapshot's credit computation).
      sourceChargeAmounts: { "charge-1": 100 },
    });
    expect(invoice).toMatchObject({ id: 44, estado: "emitida" });
  });

  it("runs the draft hook in the insert transaction and aborts before authorization on failure", async () => {
    const input = {
      tipoComprobante: "FB" as const,
      cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
      items: [{
        descripcion: "Alojamiento",
        cantidad: 1,
        precioUnitario: 100,
        alicuotaIva: "no_gravado" as const,
        subtotalNeto: 0,
        subtotal: 100,
      }],
      reservaId: "reservation-1",
      creditReapplicationIntent: { operationId: "operation-12345678901234567890" },
    };
    const hook = vi.fn(async (_tx: any, draft: any) => {
      state.events.push("draft-hook");
      draft.creditReapplicationIntent = { operationId: "durable" };
    });
    await emitirFactura({ ...input, beforeDraftInsert: hook });
    expect(state.events).toEqual(["execute", "draft-hook", "insert-draft", "update"]);
    expect(state.insertValues[0].creditReapplicationIntent).toEqual({ operationId: "durable" });

    state.events = [];
    state.insertValues = [];
    state.savedDraft = null;
    await expect(emitirFactura({
      ...input,
      beforeDraftInsert: async () => {
        state.events.push("draft-hook-failed");
        throw new Error("credit changed");
      },
    })).rejects.toThrow("credit changed");
    expect(state.events).toEqual(["execute", "draft-hook-failed"]);
    expect(state.insertValues).toHaveLength(0);
  });

  it("persists a group-payment recovery instruction before ARCA authorization", async () => {
    const groupPaymentIntent = {
      endpoint: "/api/groups/group-canonical/payment",
      body: {
        paymentRows: [{ method: "cash", amount: "300000.00", reference: "CANON-300" }],
        distributionDetail: { "room-1": 100000, "room-2": 100000, "room-3": 100000 },
        settlementBreakdown: {
          documentTotal: 360000,
          appliedAdvances: 60000,
          newCollection: 300000,
        },
      },
    };

    const invoice = await emitirFactura({
      tipoComprobante: "FB",
      cliente: { razonSocial: "Empresa canónica", cuit: "30712345678", condicionIva: "Responsable Inscripto" },
      items: [{
        descripcion: "Alojamiento grupal",
        cantidad: 1,
        precioUnitario: 360000,
        alicuotaIva: "no_gravado",
        subtotalNeto: 0,
        subtotal: 360000,
      }],
      groupId: "group-canonical",
      groupPaymentIntent,
    });

    expect(state.events).toEqual(["execute", "insert-draft", "update"]);
    expect(state.insertValues[0]).toMatchObject({
      groupId: "group-canonical",
      groupPaymentIntent,
      estado: "autorizacion_pendiente",
      reconciliationStatus: "pendiente",
    });
    expect(invoice).toMatchObject({ id: 44, estado: "emitida" });
  });

  it("keeps the pending draft and stores the ARCA error when authorization fails after saving it", async () => {
    state.billingConfig = {
      arcaAmbiente: "homologacion",
      puntoVenta: 1,
      arcaCuit: "30-12345678-9",
    };
    state.authorizationError = "ARCA no responde";
    global.fetch = vi.fn(async () => new Response(
      "<soap:Envelope><CbteNro>6</CbteNro></soap:Envelope>",
      { status: 200 },
    )) as any;

    await expect(emitirFactura({
      tipoComprobante: "NCB",
      cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
      items: [{
        descripcion: "Alojamiento",
        cantidad: 1,
        precioUnitario: 100,
        alicuotaIva: "no_gravado",
        subtotalNeto: 0,
        subtotal: 100,
      }],
      reservaId: "reservation-1",
      facturaOriginalId: 12,
      sourceChargeIds: ["charge-1"],
      sourceChargeAmounts: { "charge-1": 100 },
      recoverableCreditNote: true,
    })).rejects.toThrow("ARCA no responde");

    expect(state.events).toEqual(["execute", "insert-draft", "execute"]);
    expect(state.reconciliationUpdateCount).toBe(1);
    expect(state.savedDraft).toMatchObject({
      estado: "autorizacion_pendiente",
      reconciliationStatus: "pendiente",
      reconciliationError: "ARCA no responde",
      notaCreditoId: 12,
      sourceChargeAmounts: { "charge-1": 100 },
    });
  });

  it("rejects a recoverable invoice before numbering or persistence when the financial schema is outdated", async () => {
    state.schemaError = Object.assign(
      new Error("El esquema financiero no está actualizado."),
      { statusCode: 503, code: "FINANCIAL_SCHEMA_NOT_READY" },
    );

    await expect(emitirFactura({
      tipoComprobante: "FB",
      cliente: { razonSocial: "Empresa", condicionIva: "Consumidor Final" },
      items: [{
        descripcion: "Alojamiento grupal",
        cantidad: 1,
        precioUnitario: 100,
        alicuotaIva: "no_gravado",
        subtotalNeto: 0,
        subtotal: 100,
      }],
      groupId: "group-1",
      groupPaymentIntent: {
        endpoint: "/api/groups/group-1/payment",
        body: { paymentRows: [{ method: "cash", amount: "100.00" }] },
      },
    })).rejects.toMatchObject({
      statusCode: 503,
      code: "FINANCIAL_SCHEMA_NOT_READY",
    });

    expect(state.schemaChecks).toBe(1);
    expect(state.events).toEqual([]);
    expect(state.insertValues).toEqual([]);
  });
});
