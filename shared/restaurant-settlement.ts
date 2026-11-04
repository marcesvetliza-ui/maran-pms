/** Non-monetary restaurant settlements remain individually visible in the shift. */
export function restaurantCashPosting(method: string) {
  if (["consumo_interno", "pedidos_ya", "gift_voucher"].includes(method)) {
    return { paymentMethod: "voucher", movementType: "informational" };
  }
  if (["cuenta_habitacion", "room_charge"].includes(method)) {
    return { paymentMethod: "room_charge", movementType: "informational" };
  }
  return { paymentMethod: method, movementType: "income" };
}

export function restaurantNonFiscalMethods(receiptType: string): Record<string, string> {
  return {
    efectivo: "Efectivo", gift_voucher: "Voucher de Regalo", consumo_interno: "Consumo Interno",
    ...(receiptType === "voucher_room_service" ? { cuenta_habitacion: "Cargo a Habitación" } : {}),
    ...(receiptType === "voucher_pedidos_ya" ? { pedidos_ya: "Pedidos Ya" } : {}),
  };
}
