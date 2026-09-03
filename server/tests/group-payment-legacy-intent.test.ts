import { describe, expect, it } from "vitest";
import { reconcileGroupPaymentIntentSettlement } from "../db-storage";

describe("legacy group fiscal intent recovery", () => {
  it("corrects only the legacy 360/60/360 collection to the received 300", () => {
    expect(reconcileGroupPaymentIntentSettlement(
      { documentTotal: 360, appliedAdvances: 60, newCollection: 360 },
      { documentTotal: 360, appliedAdvances: 60, newCollection: 300 },
      300,
    )).toEqual({
      documentTotal: 360,
      appliedAdvances: 60,
      newCollection: 300,
    });
  });

  it("accepts an already-correct immutable 360/60/300 intent", () => {
    expect(reconcileGroupPaymentIntentSettlement(
      { documentTotal: 360, appliedAdvances: 60, newCollection: 300 },
      { documentTotal: 360, appliedAdvances: 60, newCollection: 300 },
      300,
    )).toEqual({
      documentTotal: 360,
      appliedAdvances: 60,
      newCollection: 300,
    });
  });

  it("rejects a legacy-looking intent whose applied advance changed", () => {
    expect(() => reconcileGroupPaymentIntentSettlement(
      { documentTotal: 360, appliedAdvances: 50, newCollection: 360 },
      { documentTotal: 360, appliedAdvances: 60, newCollection: 300 },
      300,
    )).toThrow(/no coincide con la intención fiscal/i);
  });

  it("rejects an incoming collection of 299", () => {
    expect(() => reconcileGroupPaymentIntentSettlement(
      { documentTotal: 360, appliedAdvances: 60, newCollection: 360 },
      { documentTotal: 360, appliedAdvances: 60, newCollection: 299 },
      299,
    )).toThrow(/no coincide con la intención fiscal/i);
  });
});