import { describe, expect, it } from "vitest";
import { buildGroupRoomFinancialSnapshot } from "./groupFinancial";

describe("buildGroupRoomFinancialSnapshot", () => {
  it("shows a settled room with its unused advance separated from the fiscal invoice", () => {
    expect(buildGroupRoomFinancialSnapshot({
      accommodation: 120_000,
      extras: 0,
      collected: 120_000,
      invoiced: 60_000,
      fiscalAvailable: 60_000,
    })).toEqual({
      operationalTotal: 120_000,
      collected: 120_000,
      nonFiscalAdvances: 60_000,
      operationalBalance: 0,
      invoiced: 60_000,
      fiscalAvailable: 60_000,
    });
  });

  it("keeps partial collection and partial invoicing as independent balances", () => {
    expect(buildGroupRoomFinancialSnapshot({
      accommodation: 120_000,
      extras: 20_000,
      collected: 40_000,
      invoiced: 25_000,
      fiscalAvailable: 115_000,
    })).toEqual({
      operationalTotal: 140_000,
      collected: 40_000,
      nonFiscalAdvances: 15_000,
      operationalBalance: 100_000,
      invoiced: 25_000,
      fiscalAvailable: 115_000,
    });
  });
});