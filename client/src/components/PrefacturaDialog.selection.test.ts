import { describe, expect, it } from "vitest";
import {
  getSelectedFolioBalance,
  getSelectedFolioItems,
  getSelectedFolioTotal,
  isArgentineNationality,
  suggestTipo,
} from "./PrefacturaDialog";

const folio = {
  roomTotal: 120,
  roomNumber: "203",
  nights: 2,
  charges: [
    { id: "restaurant", description: "Cena", amount: "35.50", category: "restaurant" },
    { id: "transfer-out", description: "Traslado enviado", amount: "-20.00", category: "transfer_out" },
    { id: "transfer-in", description: "Traslado recibido", amount: "20.00", category: "transfer_in" },
  ],
};

describe("PrefacturaDialog selected folio projection", () => {
  it("uses only selected billable items for invoice source IDs and total", () => {
    const items = getSelectedFolioItems(
      new Set(["accommodation", "restaurant", "transfer-out", "transfer-in"]),
      folio,
    );

    expect(items).toEqual([
      expect.objectContaining({ id: "accommodation", amount: 120 }),
      expect.objectContaining({ id: "restaurant", amount: 35.5 }),
    ]);
    expect(getSelectedFolioTotal(items)).toBe(155.5);
  });

  it("does not apply a payment for an earlier charge to a later selected charge", () => {
    const restaurantOnly = getSelectedFolioItems(new Set(["restaurant"]), folio);
    const allItems = getSelectedFolioItems(new Set(["accommodation", "restaurant"]), folio);

    expect(getSelectedFolioBalance(restaurantOnly, allItems, [{ amount: "120.00" }])).toBe(35.5);
  });

  it("applies a prior payment to the selected first charge only", () => {
    const accommodationOnly = getSelectedFolioItems(new Set(["accommodation"]), folio);
    const allItems = getSelectedFolioItems(new Set(["accommodation", "restaurant"]), folio);

    expect(getSelectedFolioBalance(accommodationOnly, allItems, [{ amount: "50" }])).toBe(70);
  });

  it("defaults to an electronic receipt for Consumidor Final", () => {
    expect(suggestTipo("", "Consumidor Final")).toBe("FB");
    expect(suggestTipo("30-12345678-9", "Responsable Inscripto")).toBe("FA");
  });

  it("recognizes Argentine nationality only from explicit Argentine data", () => {
    expect(isArgentineNationality("Argentina", null)).toBe(true);
    expect(isArgentineNationality(null, "ARG")).toBe(true);
    expect(isArgentineNationality("Uruguay", "URY")).toBe(false);
    expect(isArgentineNationality(undefined, undefined)).toBe(false);
  });
});