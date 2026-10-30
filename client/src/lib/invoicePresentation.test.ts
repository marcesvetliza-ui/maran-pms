import { describe, expect, it } from "vitest";
import {
  formatInvoiceCreatedTime,
  isInvoiceReconciliationPending,
} from "./invoicePresentation";

describe("presentación de facturas en la zona horaria del hotel", () => {
  it("muestra la hora de Buenos Aires aunque el navegador esté en otra zona", () => {
    expect(formatInvoiceCreatedTime("2026-09-04T01:30:00.000Z")).toBe("22:30");
  });

  it.each([
    "2026-10-29 22:48:00.123456",
    "2026-10-29T22:48:00.000",
    "2026-10-29 22:48",
    "2026-10-29T22:48:00.000Z",
    "2026-10-29T19:48:00-03:00",
    new Date("2026-10-29T22:48:00Z"),
  ])("shows the same 19:48 for SQL, ISO and offset timestamps (%s)", timestamp => {
    expect(formatInvoiceCreatedTime(timestamp)).toBe("19:48");
  });

  it("handles the previous hotel day without changing the fiscal date", () => {
    expect(formatInvoiceCreatedTime("2026-10-30 01:10:00")).toBe("22:10");
  });

  it("tolera fechas vacías o inválidas", () => {
    expect(formatInvoiceCreatedTime(null)).toBe("—");
    expect(formatInvoiceCreatedTime("fecha inválida")).toBe("—");
  });

  it("sólo marca como pendiente el estado de conciliación vigente", () => {
    expect(isInvoiceReconciliationPending({ reconciliation_status: "pendiente" })).toBe(true);
    expect(isInvoiceReconciliationPending({ reconciliationStatus: "conciliada" })).toBe(false);
    expect(isInvoiceReconciliationPending({ reconciliation_status: null })).toBe(false);
  });
});