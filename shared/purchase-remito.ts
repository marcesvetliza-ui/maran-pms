export const isPurchaseRemito = (type?: string | null) => type === "REMITO" || type === "REMITO-NF";
export const purchaseDocumentLabel = (type: string) => type === "REMITO-NF" ? "Compra no fiscal" : type;

/** Cash must cover the whole cancellation; mixed OPs must be separated. */
export function validateNonFiscalPayment(documents: Array<{ tipo_comprobante: string }>, input: {
  formaPago?: string | null; efectivo?: string | number | null; depBancario?: string | number | null;
  cheques?: string | number | null; retencionIibb?: string | number | null; retencionGanancias?: string | number | null;
  retencionIva?: string | number | null; retencionProfLibs?: string | number | null; compensacion?: string | number | null;
}, total: number): void {
  if (!documents.some(row => row.tipo_comprobante === "REMITO-NF")) return;
  const fail = () => { throw Object.assign(new Error("Las compras no fiscales se pagan únicamente en efectivo, sin retenciones ni compensaciones. Emití una orden de pago separada."), { statusCode: 400 }); };
  if (documents.some(row => row.tipo_comprobante !== "REMITO-NF")) fail();
  if (input.formaPago !== "efectivo" || !Number.isFinite(total) || total <= 0) fail();
  for (const field of ["depBancario", "cheques", "retencionIibb", "retencionGanancias", "retencionIva", "retencionProfLibs", "compensacion"] as const) {
    const amount = Number(input[field] ?? 0);
    if (!Number.isFinite(amount) || amount !== 0) fail();
  }
  const cash = Number(input.efectivo ?? 0);
  if (!Number.isFinite(cash) || Math.round(cash * 100) !== Math.round(total * 100)) fail();
}

export function remitoBalance(total: number, previous: { tipo_comprobante: string; monto_total: unknown; saldo_pendiente: unknown }, paidByOrders: number) {
  const paid = previous.tipo_comprobante === "REMITO-NF" ? Math.round((Number(previous.monto_total) - Number(previous.saldo_pendiente)) * 100) / 100 : 0;
  if (!Number.isFinite(paid) || paid < 0 || !Number.isFinite(paidByOrders) || Math.abs(paid - paidByOrders) > 0.005) {
    throw Object.assign(new Error("Los pagos del remito necesitan conciliación antes de cambiarlo."), { statusCode: 409 });
  }
  const balance = Math.round((total - paid) * 100) / 100;
  if (!Number.isFinite(total) || total <= 0 || balance < 0) {
    throw Object.assign(new Error("El total debe ser mayor a cero y no puede ser menor al importe ya pagado."), { statusCode: 409 });
  }
  return { saldo: balance, estado: balance === 0 ? "pagado" : paid > 0 ? "parcial" : "pendiente", paid };
}
