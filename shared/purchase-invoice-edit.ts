/** The administration lead may correct historical documents without reopening
 * cancelled/informational records or silently discarding applied payments. */
export function canEditPurchaseInvoice(role: string | undefined, state: string): boolean {
  return state === "pendiente" || role === "resp_administracion";
}
export function purchaseInvoiceBalanceAfterEdit(
  invoice: { estado: string; monto_total: string | number; saldo_pendiente: string | number; condicion_pago?: string; tipo_comprobante?: string },
  newTotal: number,
  payable: boolean,
): { saldo: number; estado: string } {
  const oldBalance = Number(invoice.saldo_pendiente);
  if (!payable || invoice.estado === "anulado" || invoice.estado === "registrado") {
    return { saldo: oldBalance, estado: invoice.estado };
  }
  // An immediate-payment entry credits cash, and consumed credit notes have
  // separate compensation items. Changing their total requires adjusting that
  // settlement first; editing metadata/distribution remains available.
  if ((invoice.condicion_pago === "contado" || invoice.tipo_comprobante?.startsWith("NC-"))
      && invoice.estado !== "pendiente" && Math.round(newTotal * 100) !== Math.round(Number(invoice.monto_total) * 100)) {
    throw Object.assign(new Error("Para cambiar el total de este comprobante cancelado, ajustá primero su pago o compensación. Podés editar los demás datos conservando el total."), { statusCode: 409 });
  }
  const paid = Math.max(0, Math.round((Number(invoice.monto_total) - oldBalance) * 100));
  const balance = Math.round(newTotal * 100) - paid;
  if (balance < 0) {
    throw Object.assign(new Error("El nuevo total es menor al importe ya cancelado. Ajustá primero los pagos o la compensación correspondiente; no se modificó el comprobante."), { statusCode: 409 });
  }
  return { saldo: balance / 100, estado: balance === 0 ? "pagado" : paid > 0 ? "parcial" : "pendiente" };
}
