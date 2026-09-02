import { describe, expect, it } from "vitest";
import { buildManualCashMovement } from "../cash-manual-movement";

describe("manual cash movement receipts", () => {
  it("derives an income from Inicio de Caja and ignores client accounting fields", () => {
    const movement = buildManualCashMovement({
      shiftId: "shift-1", area: "reception", amount: "1500", description: "Fondo de apertura",
      receiptType: "inicio_caja", movementType: "expense", paymentMethod: "transfer", receiptNumber: "999",
    });

    expect(movement).toMatchObject({
      sourceLabel: "Inicio de Caja", paymentMethod: "cash", movementType: "income",
      receiptType: "inicio_caja", amount: "1500",
    });
    expect(movement).not.toHaveProperty("receiptNumber");
  });

  it("requires provider and category only for a Retiro de Efectivo", () => {
    expect(() => buildManualCashMovement({
      shiftId: "shift-1", area: "reception", amount: 500, description: "Pago",
      receiptType: "retiro_efectivo",
    })).toThrow("Proveedor/beneficiario y categoría");

    expect(buildManualCashMovement({
      shiftId: "shift-1", area: "reception", amount: 500, description: "Pago",
      receiptType: "retiro_efectivo", proveedor: "Proveedor SA", expenseCategory: "insumos",
    }).movementType).toBe("expense");
  });

  it("rejects a receipt type outside the mandatory cash receipt list", () => {
    expect(() => buildManualCashMovement({
      shiftId: "shift-1", area: "reception", amount: 1, description: "x", receiptType: "ticket",
    })).toThrow("Debe seleccionar");
  });
});