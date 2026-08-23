import { describe, expect, it } from "vitest";
import { moneyInputValue, moneyPayload, parseMoneyInput } from "./money-input";

describe("money input helpers", () => {
  it.each([
    ["45657", 45657],
    ["45657,50", 45657.5],
    ["45657.50", 45657.5],
    ["45.657,50", 45657.5],
    ["45,657.50", 45657.5],
  ])("parses %s without changing its monetary value", (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it("serializes every accepted format as a database-safe decimal", () => {
    expect(moneyPayload("45.657,50")).toBe("45657.50");
    expect(moneyInputValue(45657.5)).toBe("45657.50");
  });
});