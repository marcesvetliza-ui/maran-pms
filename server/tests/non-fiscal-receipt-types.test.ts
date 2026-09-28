import { describe, expect, it } from "vitest";
import { isNonFiscalTipo } from "../billing/invoiceService";
import { getInvoiceTypePresentation } from "../billing/invoicePdf";
import { getRestaurantReceiptTypeLabel } from "../restaurantPdfs";

describe("Restaurant non-fiscal receipt types", () => {
  it.each([
    ["voucher_justo", "Voucher Justo"],
    ["voucher_pedidos_ya", "Voucher Pedidos Ya"],
    ["voucher_room_service", "Room Service"],
    ["voucher_consumo_interno", "Consumo Interno"],
  ])("classifies %s as non-fiscal and prints its dedicated label", (receiptType, label) => {
    expect(isNonFiscalTipo(receiptType)).toBe(true);
    expect(getRestaurantReceiptTypeLabel(receiptType)).toBe(label);
  });

  it("does not classify a fiscal receipt as non-fiscal", () => {
    expect(isNonFiscalTipo("factura_b")).toBe(false);
  });

  it.each([
    ["voucher_justo", "Voucher Justo"],
    ["voucher_pedidos_ya", "Voucher Pedidos Ya"],
    ["voucher_room_service", "Room Service"],
    ["voucher_consumo_interno", "Consumo Interno"],
  ])("uses the friendly invoice-PDF presentation for %s", (receiptType, label) => {
    expect(getInvoiceTypePresentation(receiptType)).toEqual({
      nombre: label,
      letra: "—",
      codigo: "000",
    });
  });
});