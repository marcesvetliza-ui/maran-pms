type Settlement = { cash_forma_pago?: unknown; cashFormaPago?: unknown; cash_forma_pago_detalle?: unknown; cashFormaPagoDetalle?: unknown; credit_reapplication_intent?: any; creditReapplicationIntent?: any };
const cc = (value: unknown) => ['cuenta_corriente','current_account'].includes(String(value));
const cash = (value: unknown) => ['efectivo','cash','tarjeta_credito','credit_card','tarjeta_debito','debit_card','transferencia','transfer','mercadopago'].includes(String(value));
const detail = (row: Settlement) => row.cash_forma_pago_detalle ?? row.cashFormaPagoDetalle;
export function hasCurrentAccountSettlement(row: Settlement): boolean {
  const rows = detail(row);
  return cc(row.cash_forma_pago ?? row.cashFormaPago) || (Array.isArray(rows) && rows.some(r=>cc(r?.method))) ||
    (row.credit_reapplication_intent ?? row.creditReapplicationIntent)?.settlement?.destination==='cuenta_corriente';
}
export function isCashOnlySettlement(row: Settlement): boolean {
  if (hasCurrentAccountSettlement(row)) return false;
  const rows = detail(row);
  if (Array.isArray(rows) && rows.length) return rows.every(r=>cash(r?.method));
  return cash(row.cash_forma_pago ?? row.cashFormaPago);
}
export function canReviewCreditNoteAccount(row: any): boolean {
  return row.original_account_charge_linked===true || hasCurrentAccountSettlement({
    cash_forma_pago:row.original_cash_forma_pago,
    cash_forma_pago_detalle:row.original_cash_forma_pago_detalle,
    credit_reapplication_intent:row.original_credit_reapplication_intent,
  });
}
