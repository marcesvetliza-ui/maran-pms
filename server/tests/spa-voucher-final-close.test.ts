import { describe, expect, it, vi } from "vitest";
import { SqlFundingAdapter } from "../billing/funding/adapters";

function fixture(account: any, voucher: boolean) {
  return { query: vi.fn(async (query: string) => {
    if (query.includes("FROM payment_funding.events")) return { rows: [], rowCount: 0 };
    if (query.includes(".folios")) return { rows: [{ id: "folio-1" }], rowCount: 1 };
    if (query.includes(".spa_accounts")) return { rows: [account], rowCount: 1 };
    if (query.includes(".sales_invoices")) return { rows: voucher ? [{ exists: true }] : [], rowCount: voucher ? 1 : 0 };
    throw new Error("Unexpected query: " + query);
  }) } as any;
}

describe("SPA voucher final closure", () => {
  it.each(["voucher", "cierre_spa", null])("blocks a new fiscal operation after the voucher (%s)", async receipt_type => {
    const adapter = new SqlFundingAdapter("spa", "public", async () => {});
    await expect(adapter.assertScope(fixture({ status: "closed", invoice_id: null, receipt_type }, true), { kind: "spa", id: "spa-1" }))
      .rejects.toMatchObject({ code: "DOCUMENT_ALREADY_ISSUED" });
  });
  it("does not block an open account with payments but no issued document", async () => {
    const adapter = new SqlFundingAdapter("spa", "public", async () => {});
    await expect(adapter.assertScope(fixture({ status: "open", invoice_id: null }, false), { kind: "spa", id: "spa-1" })).resolves.toBeUndefined();
  });
  it("allows verified history adoption without reauthorizing another invoice", async () => {
    const adapter = new SqlFundingAdapter("spa", "public", async () => {});
    await expect(adapter.assertScope(fixture({ status: "closed", invoice_id: null, receipt_type: "voucher" }, true), { kind: "spa", id: "spa-1" }, undefined, true)).resolves.toBeUndefined();
  });
});
