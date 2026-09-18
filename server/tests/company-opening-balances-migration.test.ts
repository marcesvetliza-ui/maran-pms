import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://stub-unused@127.0.0.1:1/company-opening-balances-tests";
const {
  COMPANY_OPENING_BALANCES_2026_09_18,
  COMPANY_OPENING_BALANCES_2026_09_18_SQL,
} = await import("../migrate");

describe("company opening balances migration", () => {
  it("contains the 30 reconciled balances and exact PDF total", () => {
    expect(COMPANY_OPENING_BALANCES_2026_09_18).toHaveLength(30);
    expect(new Set(COMPANY_OPENING_BALANCES_2026_09_18.map((row) => row.code)).size).toBe(30);
    expect(
      COMPANY_OPENING_BALANCES_2026_09_18.reduce(
        (total, row) => total + Math.round(Number(row.amount) * 100),
        0,
      ),
    ).toBe(4_746_031_024);
  });

  it("is rerunnable and aborts before deletion on ambiguous company matches", () => {
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL).toContain("IMPORT_OPENING_BALANCES");
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL).toContain("matched_count > 1");
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL).toContain("matched_count <> 1");
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL.indexOf("matched_count > 1"))
      .toBeLessThan(COMPANY_OPENING_BALANCES_2026_09_18_SQL.indexOf("DELETE FROM account_movements"));
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL).toContain("imported_count <> 30");
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL).toContain("imported_total <> 47460310.24");
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL).toContain(
      "LOCK TABLE companies, account_movements, account_movement_allocations",
    );
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL).toContain("SET LOCAL lock_timeout");
  });

  it("only replaces the company current-account ledger", () => {
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL).toContain(
      "DELETE FROM account_movements WHERE entity_type = 'company'",
    );
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL).not.toMatch(
      /DELETE FROM (companies|payments|sales_invoices|reservations|audit_logs)/,
    );
  });

  it("does not invent fiscal or commercial defaults for newly created companies", () => {
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL).toMatch(
      /pais,\s+condicion_iva,\s+payment_term_days,\s+condicion_venta_predeterminada,\s+regimen_hospedaje/,
    );
    expect(COMPANY_OPENING_BALANCES_2026_09_18_SQL).toContain(
      "NULL,\n          NULL,\n          NULL,\n          NULL,\n          NULL,",
    );
  });
});