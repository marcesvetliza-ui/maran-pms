import { describe, expect, it } from "vitest";
import { buildInventorySupplierUpdate } from "./inventory-supplier-association";

describe("buildInventorySupplierUpdate", () => {
  it("adds the invoice supplier and makes it preferred when none exists", () => {
    expect(buildInventorySupplierUpdate([{ id: 7 }], 12, "25.50")).toEqual({
      costPrice: "25.50",
      accountingSupplierIds: [7, 12],
      preferredAccountingSupplierId: 12,
    });
  });

  it("preserves the existing preferred supplier", () => {
    expect(buildInventorySupplierUpdate([
      { id: 7, isPreferred: true },
      { id: 12 },
    ], 18, "0")).toEqual({
      accountingSupplierIds: [7, 12, 18],
      preferredAccountingSupplierId: 7,
    });
  });

  it("does not replace supplier associations when the invoice has no supplier", () => {
    expect(buildInventorySupplierUpdate([{ id: 7, isPreferred: true }], null, "10")).toEqual({
      costPrice: "10",
    });
  });
});