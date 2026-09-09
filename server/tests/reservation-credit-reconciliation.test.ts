import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));
import {
  equalCreditSnapshots,
  findUniqueWholeAdvanceAllocation,
  getUncoveredReservationSettlement,
  prepareReservationCreditIntent,
} from "../billing/reservationCreditReconciliation";

describe("reservation credit settlement", () => {
  it("finds the single exact 44000 legacy advance allocation in cents", () => {
    const fortyFour = { id: "44", amount: "44000.00" };
    expect(findUniqueWholeAdvanceAllocation([
      fortyFour, { id: "10", amount: "10000.00" },
    ], 44000)).toEqual([fortyFour]);
  });

  it("refuses ambiguous whole-advance combinations", () => {
    expect(() => findUniqueWholeAdvanceAllocation([
      { amount: 44000 }, { amount: 44000 },
    ], 44000)).toThrow(/ambigua/i);
  });
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

  it("treats a missing ordinary-advance field as legacy zero", () => {
    expect(equalCreditSnapshots(
      { payments: [], settlement: { amount: 100 }, ordinaryAdvanceAmount: 0 },
      { payments: [], settlement: { amount: 100 } },
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

  it("persists a specific whole uninvoiced ordinary advance in the durable draft", async () => {
    const hook = prepareReservationCreditIntent("reservation-1", {
      operationId: "ordinary-12345678901234567890",
      invoiceTotal: 144000,
      payments: [],
      ordinaryAdvances: [{ paymentId: "advance-44", amount: 44000 }],
      status: "pending",
    });
    let call = 0;
    const tx = {
      execute: async () => {
        call++;
        if (call === 1) return { rows: [{
          id: "advance-44", reservation_id: "reservation-1", method: "efectivo",
          status: "active", amount: "44000.00", invoice_ref: null,
        }] };
        return { rows: [] };
      },
    };
    const draft: any = { montoTotal: "144000.00" };
    await hook(tx, draft);
    expect(draft.creditReapplicationIntent.ordinaryAdvances).toEqual([
      { paymentId: "advance-44", amount: 44000 },
    ]);
  });

  it("rejects an ordinary advance reserved by another unresolved operation", async () => {
    const hook = prepareReservationCreditIntent("reservation-1", {
      operationId: "ordinary-22345678901234567890",
      invoiceTotal: 44000,
      payments: [],
      ordinaryAdvances: [{ paymentId: "advance-44", amount: 44000 }],
      status: "pending",
    });
    let call = 0;
    const tx = {
      execute: async () => {
        call++;
        return call === 1
          ? { rows: [{ id: "advance-44", reservation_id: "reservation-1", method: "efectivo", status: "active", amount: "44000.00", invoice_ref: null }] }
          : { rows: [{}] };
      },
    };
    await expect(hook(tx, { montoTotal: "44000.00" })).rejects.toThrow(/reservado por otra factura/i);
  });
});