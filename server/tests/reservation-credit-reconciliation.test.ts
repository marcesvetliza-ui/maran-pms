import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));
import {
  equalCreditSnapshots,
  getUncoveredReservationSettlement,
  prepareReservationCreditIntent,
} from "../billing/reservationCreditReconciliation";

describe("reservation credit settlement", () => {
  it("does not create a new settlement amount when credit fully covers the invoice", () => {
    expect(getUncoveredReservationSettlement(100, [{ amount: 60 }, { amount: 40 }])).toBe(0);
  });

  it("charges only the portion not covered by credit", () => {
    expect(getUncoveredReservationSettlement("100.00", [{ amount: "35.25" }])).toBe(64.75);
  });

  it("compares canonical retry snapshots instead of raw object order and numeric representation", () => {
    expect(equalCreditSnapshots(
      {
        payments: [{ paymentId: "b", amount: "20.00" }, { paymentId: "a", amount: 10 }],
        sourceChargeIds: ["two", "one"],
        settlement: { destination: "none", amount: 0, status: "completed", error: null },
      },
      {
        sourceChargeIds: ["one", "two"],
        payments: [{ amount: "10.00", paymentId: "a" }, { amount: 20, paymentId: "b" }],
        settlement: { amount: "0.00", destination: "none" },
      },
    )).toBe(true);
  });

  it("rejects a generic uninvoiced advance as NC-released credit", async () => {
    const hook = prepareReservationCreditIntent("reservation-1", {
      operationId: "operation-12345678901234567890",
      invoiceTotal: 100,
      payments: [{ paymentId: "payment-1", amount: 100 }],
      status: "pending",
    });
    const tx = {
      execute: async () => ({
        rows: [{
          id: "payment-1",
          reservation_id: "reservation-1",
          method: "efectivo",
          status: "active",
          amount: "100.00",
          invoice_ref: null,
          invoice_link_failed: false,
        }],
      }),
    };
    await expect(hook(tx, { montoTotal: "100.00" })).rejects.toThrow(/factura original válida/i);
  });
});