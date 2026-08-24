import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  events: [] as string[],
  insertValues: [] as any[],
  executeCount: 0,
}));

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () => {
      state.events.push("execute");
      state.executeCount++;
      // First execution advances the fictitious invoice counter. The second
      // one is the final update from authorization_pending to emitted.
      return state.executeCount === 1
        ? { rows: [{ ultimo_numero: 7 }] }
        : { rows: [{ id: 44, estado: "emitida", reconciliation_status: "pendiente" }] };
    }),
    insert: vi.fn(() => ({
      values: (values: any) => {
        state.events.push("insert-draft");
        state.insertValues.push(values);
        return {
          returning: async () => [{
            id: 44,
            ...values,
            estado: "autorizacion_pendiente",
            reconciliationStatus: "pendiente",
          }],
        };
      },
    })),
  },
}));

vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(async () => ({ arcaAmbiente: "ficticio", puntoVenta: 1 })),
}));

const { emitirFactura } = await import("../billing/invoiceService");

describe("recoverable reservation credit-note emission", () => {
  beforeEach(() => {
    state.events = [];
    state.insertValues = [];
    state.executeCount = 0;
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

    expect(state.events).toEqual(["execute", "insert-draft", "execute"]);
    expect(state.insertValues[0]).toMatchObject({
      estado: "autorizacion_pendiente",
      reconciliationStatus: "pendiente",
      notaCreditoId: 12,
      sourceChargeAmounts: JSON.stringify({ "charge-1": 100 }),
    });
    expect(invoice).toMatchObject({ id: 44, estado: "emitida" });
  });
});