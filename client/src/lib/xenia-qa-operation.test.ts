import { describe, it, expect } from "vitest";
import { qaOperationId, confirmQaOperation } from "./xenia-qa-operation";

describe("QA operation recovery", () => {
  it("reuses the uncertain request after reload and separates hotel, actor and reservation", () => {
    const storage = new Map<string, string>();
    const tab = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); }, removeItem: (k: string) => { storage.delete(k); } };
    const id = qaOperationId(tab, "hotel-a:user-a:stay-a", { amount: "1000", description: "Agua" });
    expect(qaOperationId(tab, "hotel-a:user-a:stay-a", { description: "Agua", amount: "1000" })).toBe(id);
    for (const scope of ["hotel-b:user-a:stay-a", "hotel-a:user-b:stay-a", "hotel-a:user-a:stay-b"])
      expect(qaOperationId(tab, scope, { amount: "1000", description: "Agua" })).not.toBe(id);
    confirmQaOperation(tab, "hotel-a:user-a:stay-a");
    expect(qaOperationId(tab, "hotel-a:user-a:stay-a", { amount: "1000", description: "Agua" })).not.toBe(id);
  });
  it("stops when a damaged pending record cannot be recovered", () => {
    expect(() => qaOperationId({ getItem: () => "broken", setItem: () => {}, removeItem: () => {} }, "stay", {})).toThrow("recuperar");
  });
});
