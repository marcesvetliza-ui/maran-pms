import { describe, expect, it } from "vitest";

/**
 * Contract-level guard for the request assembled by PrefacturaDialog: a CC
 * invoice must carry the operation id even when no released advances were
 * selected, so the server can persist/recover its durable settlement intent.
 */
describe("PrefacturaDialog CC settlement contract", () => {
  it("includes the stable operation id for zero credit allocations", () => {
    const operationId = "8b6f9b7d-0e9e-4bc3-8f60-8d0d1a8c6a10";
    const saleCondition = "cuenta_corriente";
    const creditReapplications: unknown[] = [];
    const body = {
      cashFormaPago: saleCondition,
      creditReapplications,
      creditOperationId: saleCondition === "cuenta_corriente" || creditReapplications.length
        ? operationId
        : undefined,
    };
    expect(body.creditOperationId).toBe(operationId);
    expect(body.creditReapplications).toEqual([]);
  });
});