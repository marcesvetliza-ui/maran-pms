import { beforeEach, describe, expect, it, vi } from "vitest";
import { fundingApi, projectionSchema, pesosToCents, persistFundingConfirmation, readFundingJournal, type FundingPreview } from "./paymentFunding";

const request = { scope: { kind: "spa" as const, id: "spa-1" }, documentId: "doc-1", applications: [{ receiptId: "pay-1", amountCents: 9500000 }], newCollections: [] };
const preview: FundingPreview = { request, scope: request.scope, documentId: "doc-1", totalCents: 9500000,
  previewHash: "a".repeat(64), fundingMode: "existing_only", paymentMethods: [{ method: "efectivo", amountCents: 9500000 }] };
describe("adaptador de financiación", () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
  it.each([["95000", 9500000], ["100,01", 10001], ["0.01", 1]])("convierte %s sin perder centavos", (input, expected) => expect(pesosToCents(input as string)).toBe(expected));
  it.each(["1.000,00", "10.001", "-1", "0", "1e3", "NaN"])("rechaza importe ambiguo o inválido: %s", input => expect(() => pesosToCents(input)).toThrow());
  it("persiste el UUID y la solicitud antes del POST, y los recupera intactos", () => {
    const entry = persistFundingConfirmation("key", preview);
    expect(readFundingJournal("key", "spa-1")).toEqual(entry);
    expect(() => readFundingJournal("key", "otro-folio")).toThrow();
  });
  it("no fabrica otra identidad si el registro de recuperación está dañado", () => {
    sessionStorage.setItem("key", "invalid");
    expect(() => readFundingJournal("key", "spa-1")).toThrow();
  });
  it("conserva los conflictos estructurados del servidor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { code: "PREVIEW_STALE", message: "El plan cambió." } }), { status: 409 })));
    await expect(fundingApi.preview(request)).rejects.toMatchObject({ code: "PREVIEW_STALE", status: 409, message: "El plan cambió." });
  });
  it("rechaza una proyección que no concilia aplicado, reservado y libre", () => {
    expect(projectionSchema.safeParse({ scope: request.scope, documents: [], operations: [], rectifications: [], debtCents: 0,
      receipts: [{ id: "r", sourcePaymentId: "s", method: "efectivo", amountCents: 100, appliedCents: 80, heldCents: 30, freeCents: 0, version: 1 }] }).success).toBe(false);
  });
  it("falla cerrado cuando la ruta no está montada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Not found</html>", { status: 404 })));
    await expect(fundingApi.scope("spa-1")).rejects.toMatchObject({ code: "FUNDING_UNAVAILABLE" });
  });
});
