import { describe, expect, it } from "vitest";
import {
  formatInvoiceCreatedTime,
  isInvoiceReconciliationPending,
} from "./invoicePresentation";

describe("presentación de facturas en la zona horaria del hotel", () => {
  it("muestra la hora de Buenos Aires aunque el navegador esté en otra zona", () => {
    expect(formatInvoiceCreatedTime("2026-09-04T01:30:00.000Z")).toBe("22:30");
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