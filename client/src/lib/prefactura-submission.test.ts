import { beforeEach, describe, expect, it } from "vitest";
import { createPrefacturaSubmission } from "./prefactura-submission";

describe("Prefactura persisted payment intent", () => {
  beforeEach(() => sessionStorage.clear());
  it("locks synchronously and never resets a pending operation on reopen", () => {
    const submission = createPrefacturaSubmission(sessionStorage);
    expect(submission.acquire()).toBe(true);
    expect(submission.acquire()).toBe(false);
    submission.release();
    expect(submission.acquire()).toBe(true);
  });
  it.each(["invoice", "net", "retention"])("retries a lost %s response without changing keys or payloads", async lost => {
    const submission = createPrefacturaSubmission(sessionStorage);
    const rows = [
      { amount: "98.00", method: "efectivo", date: "2026-10-05" },
      { amount: "2.00", method: "retencion_iibb", date: "2026-10-05", notes: '{"retencion":{"tipo":"iibb","monto":2,"neto":98}}' },
    ];
    const initial = submission.prepare("r", { creditOperationId: crypto.randomUUID() }, rows);
    const payments = new Map<string, unknown>();
    const invoices = new Map<string, unknown>();
    let lose = true;
    const post = async (url: string, body: Record<string, any>) => {
      const invoice = url.endsWith("invoices");
      const ledger = invoice ? invoices : payments;
      const id = invoice ? body.creditOperationId : body.paymentRequestId;
      if (ledger.has(id)) expect(ledger.get(id)).toEqual(body);
      ledger.set(id, structuredClone(body));
      if (lose && (invoice ? "invoice" : body.method === "efectivo" ? "net" : "retention") === lost) {
        lose = false;
        throw new Error("Response lost after commit");
      }
      return { id: invoice ? 77 : id, montoTotal: "100.00" };
    };
    await expect(submission.run("r", post)).rejects.toThrow("Response lost");
    const reopened = createPrefacturaSubmission(sessionStorage);
    // Current folio and date may have changed. Ignore all reconstructed inputs.
    expect(reopened.prepare("r", { creditOperationId: "different" }, [{ amount: "1", date: "2026-10-06" }]).payments.map(p => p.paymentRequestId))
      .toEqual(initial.payments.map(p => p.paymentRequestId));
    expect(await reopened.run("r", post)).toMatchObject({ paymentCount: 2, invoice: { id: 77 } });
    expect(invoices.size).toBe(1);
    expect(payments.size).toBe(2);
    for (const row of payments.values()) expect(row).toMatchObject({ date: "2026-10-05", invoiceData: { id: 77 } });
    reopened.complete("r");
    const next = reopened.prepare("r", null, rows);
    expect(next.payments[0].paymentRequestId).not.toBe(initial.payments[0].paymentRequestId);
  });
  it("fails before any financial write when persistence fails", () => {
    const submission = createPrefacturaSubmission({
      getItem: () => null, removeItem() {}, setItem() { throw new Error("Storage unavailable"); },
    });
    expect(() => submission.prepare("r", { creditOperationId: "operation" }, [])).toThrow("Storage unavailable");
  });
  it("allows correcting a rejected invoice only after read-only proof of no fiscal claim", async () => {
    const submission = createPrefacturaSubmission(sessionStorage);
    submission.prepare("r", { creditOperationId: crypto.randomUUID() }, []);
    expect(await submission.discardRejectedInvoice("r", new Error("Response lost"), async () => false)).toBe(false);
    expect(await submission.discardRejectedInvoice("r", new Error("500: Error"), async () => false)).toBe(false);
    expect(await submission.discardRejectedInvoice("r", new Error("409: Error"), async () => true)).toBe(false);
    expect(submission.pending("r")).not.toBeNull();
    expect(await submission.discardRejectedInvoice("r", new Error("400: Invalid recipient"), async () => false)).toBe(true);
    expect(submission.pending("r")).toBeNull();
  });
});
