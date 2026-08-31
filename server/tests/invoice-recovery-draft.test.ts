import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;

const state = vi.hoisted(() => ({
  events: [] as string[],
  insertValues: [] as any[],
  executeCount: 0,
  savedDraft: null as any,
  authorizationError: null as string | null,
  reconciliationUpdateCount: 0,
  billingConfig: { arcaAmbiente: "ficticio", puntoVenta: 1 } as any,
}));

vi.mock("../db", () => ({
  db: {
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
  beforeEach(() => {
    state.events = [];
    state.insertValues = [];
    state.executeCount = 0;
    state.savedDraft = null;
    state.authorizationError = null;
    state.reconciliationUpdateCount = 0;
    state.billingConfig = { arcaAmbiente: "ficticio", puntoVenta: 1 };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
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
});
