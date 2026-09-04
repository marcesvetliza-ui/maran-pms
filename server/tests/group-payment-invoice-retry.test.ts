import { describe, expect, it, vi } from "vitest";
import { groupPayments } from "@shared/schema";

const state = vi.hoisted(() => ({
  insertCalls: 0,
  reconciliationUpdates: 0,
}));

function query(rows: any[]) {
  return {
    then: (resolve: (value: any[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    limit: async () => rows,
  };
}

const existingPayment = {
  id: "group-payment-canonical",
  groupId: "group-canonical",
  invoiceId: 901,
  amount: "300000.00",
  distributionDetail: {
    "room-1": 100000,
    "room-2": 100000,
    "room-3": 100000,
  },
};

const existingRoomAllocations = [
  { id: "allocation-1", groupPaymentId: existingPayment.id, amount: "100000.00" },
  { id: "allocation-2", groupPaymentId: existingPayment.id, amount: "100000.00" },
  { id: "allocation-3", groupPaymentId: existingPayment.id, amount: "100000.00" },
];

const fakeTransaction = {
  execute: vi.fn()
    .mockResolvedValueOnce({ rows: [{ id: "group-canonical", name: "Grupo canónico" }] })
    .mockResolvedValueOnce({
      rows: [{
        id: 901,
        group_id: "group-canonical",
        group_payment_id: existingPayment.id,
        estado: "emitida",
        tipo_comprobante: "FB",
        monto_total: "360000.00",
        group_payment_intent: {
          body: {
            settlementBreakdown: {
              documentTotal: 360000,
              appliedAdvances: 60000,
              newCollection: 300000,
            },
          },
        },
        reconciliation_status: "pendiente",
        cliente_razon_social: "Empresa canónica",
        cliente_cuit: "30712345678",
        cliente_dni: null,
      }],
    }),
  select: vi.fn(() => ({
    from: (table: unknown) => ({
      where: () => query(table === groupPayments ? [existingPayment] : existingRoomAllocations),
    }),
  })),
  update: vi.fn(() => ({
    set: () => ({
      where: async () => { state.reconciliationUpdates += 1; },
    }),
  })),
  insert: vi.fn(() => {
    state.insertCalls += 1;
    throw new Error("A replay must not insert a second financial row");
  }),
};

vi.mock("../db", () => ({
  db: {
    transaction: async (callback: (tx: typeof fakeTransaction) => Promise<unknown>) => callback(fakeTransaction),
  },
  pool: { query: vi.fn() },
}));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: vi.fn() }));

const { DatabaseStorage } = await import("../db-storage");

describe("group fiscal collection retry", () => {
  it("reuses the already-linked 300000 parent and its three allocations after ARCA succeeded", async () => {
    const result = await new DatabaseStorage().recordGroupPayment({
      groupId: "group-canonical",
      destination: "group_distribution",
      paymentRows: [{ method: "cash", amount: "300000.00", reference: "CANON-300" }],
      date: "2026-08-31",
      distribution: "equal",
      distributionDetail: {
        "room-1": 100000,
        "room-2": 100000,
        "room-3": 100000,
      },
      receiptType: "factura_b",
      receiverDetails: { razonSocial: "Empresa canónica", cuit: "30712345678" },
      concepts: [{ description: "Alojamiento grupal", amount: 360000 }],
      invoiceData: { id: 901 },
      invoiceTotal: 360000,
      settlementBreakdown: {
        documentTotal: 360000,
        appliedAdvances: 60000,
        newCollection: 300000,
      },
    });

    expect(result.groupPayment).toBe(existingPayment);
    expect(result.reservationPayments).toEqual(existingRoomAllocations);
    expect(state.insertCalls).toBe(0);
    expect(state.reconciliationUpdates).toBe(1);
  });
});