import { describe, expect, it } from "vitest";
import { createReservationPaymentSubmission } from "./reservation-payment-submit";
import { readFileSync } from "node:fs";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";

describe("reservation payment submission", () => {
  it("the real multi-row handler reuses completed rows after a partial failure", async () => {
    const source = readFileSync("client/src/pages/reservations.tsx", "utf8");
    const start = source.indexOf("  const handleAddMultiPayment = async () => {");
    const end = source.indexOf("\n  const categoryLabels:", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const js = transpileModule(source.slice(start, end), {
      compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None },
    }).outputText;
    const guard = createReservationPaymentSubmission();
    const calls: Array<{ paymentRequestId: string; amount: string }> = [];
    const recorded = new Map<string, string>();
    let failSecondRow = true;
    const mutation = { mutateAsync: async (body: { paymentRequestId: string; amount: string }) => {
      calls.push(body);
      if (body.amount === "200" && failSecondRow) {
        failSecondRow = false;
        throw new Error("Synthetic connection failure");
      }
      if (!recorded.has(body.paymentRequestId)) recorded.set(body.paymentRequestId, body.amount);
      return { clone: () => ({ json: async () => ({ id: body.paymentRequestId }) }) };
    } };
    const noop = () => {};
    const names = ["paymentSubmission", "paymentSubmissionDate", "setIsConfirmingPayment",
      "paymentRows", "isGroupReservation", "reservation", "toast", "addPaymentMutation",
      "setShowAddPayment", "setPaymentRows", "setInvoicingPaymentId"];
    const handler = new Function(...names, js + "\nreturn handleAddMultiPayment;")(
      { current: guard }, { current: "2026-10-05" }, noop,
      [{ amount: "100", method: "efectivo", billingTarget: "guest" },
       { amount: "200", method: "efectivo", billingTarget: "guest" }],
      false, { id: "synthetic" }, noop, mutation, noop, noop, noop,
    );
    await handler();
    expect(recorded.size).toBe(1);
    expect(guard.isBusy()).toBe(false);
    await handler();
    expect(recorded.size).toBe(2);
    expect(calls[2].paymentRequestId).toBe(calls[0].paymentRequestId);
    expect(calls[3].paymentRequestId).toBe(calls[1].paymentRequestId);
  });
  it("blocks the second invocation synchronously, before React renders", () => {
    const guard = createReservationPaymentSubmission();
    expect(guard.acquire()).toBe(true);
    expect(guard.acquire()).toBe(false);
    expect(guard.isBusy()).toBe(true);
    guard.release();
    expect(guard.acquire()).toBe(true);
  });

  it("preserves the identity across a failed or partially completed retry", () => {
    const guard = createReservationPaymentSubmission();
    const payload = { reservationId: "r", amount: "100000", method: "efectivo" };
    const id = guard.requestId(0, payload);
    guard.acquire();
    guard.release();
    expect(guard.requestId(0, payload)).toBe(id);
    expect(guard.requestId(1, payload)).not.toBe(id);
  });

  it("does not suppress two legitimate identical payments in a new session", () => {
    const guard = createReservationPaymentSubmission();
    const payload = { amount: "100000" };
    const id = guard.requestId(0, payload);
    guard.beginSession();
    expect(guard.requestId(0, payload)).not.toBe(id);
  });

  it("does not reset identities while an operation is in flight", () => {
    const guard = createReservationPaymentSubmission();
    const id = guard.requestId(0, { amount: "100000" });
    guard.acquire();
    guard.beginSession();
    expect(guard.requestId(0, { amount: "100000" })).toBe(id);
  });

  it("a deliberate edit is a different operation", () => {
    const guard = createReservationPaymentSubmission();
    expect(guard.requestId(0, { amount: "500" })).not.toBe(guard.requestId(0, { amount: "600" }));
  });
});
