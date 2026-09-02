export const MANUAL_CASH_RECEIPTS = {
  inicio_caja: { label: "Inicio de Caja", movementType: "income" },
  retiro_efectivo: { label: "Retiro de Efectivo", movementType: "expense" },
  ingreso_efectivo: { label: "Ingreso de Efectivo", movementType: "income" },
} as const;

export type ManualCashReceiptType = keyof typeof MANUAL_CASH_RECEIPTS;

function validationError(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function buildManualCashMovement(body: Record<string, unknown>) {
  const receiptType = body.receiptType as ManualCashReceiptType;
  const receipt = MANUAL_CASH_RECEIPTS[receiptType];
  if (!receipt) {
    throw validationError("Debe seleccionar Inicio de Caja, Retiro de Efectivo o Ingreso de Efectivo");
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw validationError("El monto debe ser mayor a cero");
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) throw validationError("La descripción es obligatoria");
  if (typeof body.shiftId !== "string" || !body.shiftId.trim() || typeof body.area !== "string" || !body.area.trim()) {
    throw validationError("El turno y el área de Caja son obligatorios");
  }

  const proveedor = typeof body.proveedor === "string" ? body.proveedor.trim() : "";
  const expenseCategory = typeof body.expenseCategory === "string" ? body.expenseCategory.trim() : "";
  if (receipt.movementType === "expense" && (!proveedor || !expenseCategory)) {
    throw validationError("Proveedor/beneficiario y categoría son obligatorios para un retiro de efectivo");
  }

  return {
    shiftId: body.shiftId.trim(),
    area: body.area.trim(),
    sourceType: "manual",
    sourceLabel: receipt.label,
    paymentMethod: "cash",
    amount: String(amount),
    movementType: receipt.movementType,
    receiptType,
    description,
    proveedor: proveedor || null,
    expenseCategory: expenseCategory || null,
  };
}