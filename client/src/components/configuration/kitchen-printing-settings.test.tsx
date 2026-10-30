import { describe, it, expect } from "vitest";
import { kitchenPrintingSchema, readKitchenPrinting } from "@shared/kitchen-printing";

describe("Kitchen printing safety defaults", () => {
  it("disables both destinations when configuration is missing or damaged", () => {
    for (const value of [undefined, null, "", "broken", '{"restaurant":true}', '{"restaurant":"false","spaJusto":true}']) {
      expect(readKitchenPrinting(value)).toEqual({ restaurant: false, spaJusto: false });
    }
  });
  it("preserves independent switches and refuses coercion or extra destinations", () => {
    expect(readKitchenPrinting('{"restaurant":false,"spaJusto":true}')).toEqual({ restaurant: false, spaJusto: true });
    expect(kitchenPrintingSchema.safeParse({ restaurant: "false", spaJusto: false }).success).toBe(false);
    expect(kitchenPrintingSchema.safeParse({ restaurant: true, spaJusto: true, beverages: true }).success).toBe(false);
  });
});
