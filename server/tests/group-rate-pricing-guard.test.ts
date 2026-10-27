import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../db", () => ({ db: { execute }, pool: {} }));
vi.mock("../billing/invoiceAdvisoryLock", () => ({ withInvoiceAdvisoryLock: vi.fn() }));
import { guardPricingUpdate, withNightlyWriter } from "../nightlyPricingGuard";

const reservation = { id: "synthetic-group-303", status: "confirmed", pricingScheme: "nightly_v1", pricingRevision: 0,
  finalRatePerNight: "0.00", totalRoomAmount: "0.00" };

describe("Group rate path versus canonical nightly pricing guard", () => {
  beforeEach(() => execute.mockReset());
  it("reproduces the old Group rate rejection for a zero-priced nightly reservation", async () => {
    await expect(guardPricingUpdate(reservation, { finalRatePerNight: "144000.00", totalRoomAmount: "432000.00" }))
      .rejects.toMatchObject({ statusCode: 409, message: "Esta reserva usa precios por noche. Usá Editar tarifas o Modificar estadía desde el Folio." });
    expect(execute).not.toHaveBeenCalled();
  });
  it("accepts a canonical revisioned write when there is no fiscal coverage", async () => {
    execute.mockResolvedValue({ rows: [] });
    await expect(withNightlyWriter(0, () => guardPricingUpdate(reservation, {
      finalRatePerNight: "144000.00", totalRoomAmount: "432000.00", pricingRevision: 1,
    }))).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("still blocks the canonical editor when the group has an invoice", async () => {
    execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "synthetic-invoice" }] });
    await expect(withNightlyWriter(0, () => guardPricingUpdate(reservation, { finalRatePerNight: "144000.00" })))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("grupo con facturación") });
  });
  it("allows operational schedule notices without changing prices", async () => {
    await expect(guardPricingUpdate(reservation, { lateCheckOut: true, lateCheckOutTime: "16:00" })).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });
});
