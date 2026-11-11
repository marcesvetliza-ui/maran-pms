/** Informational metadata only; never an input to payment orders or balances. */
export const PURCHASE_CREDIT_NOTE_PAYMENT_METHODS = [
  {value:'cuenta_corriente',label:'Cuenta Corriente'},
  {value:'efectivo',label:'Efectivo'},
  {value:'transferencia',label:'Transferencia'},
  {value:'cheque',label:'Cheque'},
  {value:'dep_bancario',label:'Depósito bancario'},
] as const;
export function normalizePurchaseCreditNotePayment(type:string,value:unknown):string|null {
  if(value===undefined||value===null||value==='')return null;
  if(!/^NC-[ABCM]$/.test(type)||typeof value!=='string'||!PURCHASE_CREDIT_NOTE_PAYMENT_METHODS.some(item=>item.value===value))
    throw Object.assign(new Error('Forma de pago informativa inválida para la Nota de Crédito de compras.'),{statusCode:400});
  return value;
}
