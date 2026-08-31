import { describe, expect, it } from "vitest";
import {
  allocateGroupInvoiceSources,
  availableGroupInvoiceTotal,
  buildGroupInvoiceItems,
  exceedsGroupInvoiceAvailable,
  groupInvoicePaymentMatchesConcepts,
  requiredGroupInvoiceCollection,
} from "./group-invoice-allocation";

const sources = [
  { id: "room:1:accommodation", destination: "Hab. 1", concept: "Alojamiento", available: 270000 },
  { id: "group-charge:extra", destination: "Grupo", concept: "Salón", available: 60000 },
  { id: "already-invoiced", destination: "Grupo", concept: "Cena", available: 0 },
];

describe("group invoice concepts from snapshot availability", () => {
  it.each(["none", "totalizados", "detallados"] as const)(
    "preloads exactly 330000 in %s mode",
    (distribution) => {
      const items = buildGroupInvoiceItems(sources, distribution, "Convención");
      expect(items.reduce((sum, item) => sum + item.precioUnitario, 0)).toBe(330000);
    },
  );

  it("keeps the exact source amount map for the generated total", () => {
    const total = availableGroupInvoiceTotal(sources);
    expect(allocateGroupInvoiceSources(sources, total)).toEqual({
      "group-charge:extra": 60000,
      "room:1:accommodation": 270000,
    });
  });

  it("accepts the exact available cents and rejects one cent more", () => {
    expect(exceedsGroupInvoiceAvailable(330000, 330000)).toBe(false);
    expect(exceedsGroupInvoiceAvailable(330000.01, 330000)).toBe(true);
  });

  it("applies the existing advance and requires only the operational collection", () => {
    expect(requiredGroupInvoiceCollection(330000, 60000)).toBe(270000);
    expect(groupInvoicePaymentMatchesConcepts(270000, 330000, 60000)).toBe(true);
    expect(groupInvoicePaymentMatchesConcepts(269999.99, 330000, 60000)).toBe(false);
    expect(groupInvoicePaymentMatchesConcepts(270000.01, 330000, 60000)).toBe(false);
    expect(groupInvoicePaymentMatchesConcepts(0, 330000, 60000)).toBe(false);
    expect(groupInvoicePaymentMatchesConcepts(0, 60000, 60000)).toBe(true);
  });

  it("allows a full close to collect a larger operational balance than the fiscal portion", () => {
    expect(groupInvoicePaymentMatchesConcepts(
      310000,
      330000,
      60000,
      { enabled: true, operationalBalance: 310000 },
    )).toBe(true);
    expect(groupInvoicePaymentMatchesConcepts(
      270000,
      330000,
      60000,
      { enabled: true, operationalBalance: 310000 },
    )).toBe(false);
  });
});