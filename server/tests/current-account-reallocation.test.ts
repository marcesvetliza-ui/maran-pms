import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://stub-unused@127.0.0.1:1/current-account-reallocation-tests";
const {
  AGENCY_OPENING_BALANCES_2026_09_18,
  COMPANY_OPENING_BALANCES_2026_09_18,
  CURRENT_ACCOUNT_REALLOCATION_2026_09_18_POSTCHECK_SQL,
  CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL,
} = await import("../migrate");

describe("current-account opening balance reallocation", () => {
  it("splits the original total between 25 companies and 5 agencies", () => {
    const agencyNames = new Set(
      AGENCY_OPENING_BALANCES_2026_09_18.map((row) => row.companyName),
    );
    const companyRows = COMPANY_OPENING_BALANCES_2026_09_18.filter(
      (row) => !agencyNames.has(row.name),
    );

    expect(companyRows).toHaveLength(25);
    expect(
      companyRows.reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0),
    ).toBe(4_087_017_764);
    expect(AGENCY_OPENING_BALANCES_2026_09_18).toHaveLength(5);
    expect(
      AGENCY_OPENING_BALANCES_2026_09_18.reduce(
        (total, row) => total + Math.round(Number(row.amount) * 100),
        0,
      ),
    ).toBe(659_013_260);
  });

  it("locks, clears and validates the complete fictitious current-account ledger", () => {
    expect(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL).toContain(
      "LOCK TABLE\n      companies,\n      agencies,",
    );
    expect(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL).toContain(
      "DELETE FROM account_movement_allocations",
    );
    expect(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL).toContain(
      "DELETE FROM account_movements",
    );
    expect(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL).toContain(
      "OPENING-CC-REALLOCATION-2026-09-18",
    );
    expect(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_SQL).toContain(
      "EXISTS (SELECT 1 FROM account_movements WHERE entity_type = 'guest')",
    );
    expect(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_POSTCHECK_SQL).toContain(
      "reference = 'OPENING-COMPANY-2026-09-18'",
    );
    expect(CURRENT_ACCOUNT_REALLOCATION_2026_09_18_POSTCHECK_SQL).toContain(
      "reference = 'OPENING-AGENCY-2026-09-18'",
    );
  });
});