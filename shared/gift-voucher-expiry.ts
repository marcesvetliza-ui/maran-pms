/** Calendar dates are persisted without a timezone. Empty preserves no expiry. */
export function giftVoucherExpiryError(value: unknown): string | null {
 if(value === undefined || value === null || value === '') return null;
 if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0,4)) < 1) return 'Ingresá una fecha válida para el vencimiento del voucher.';
 const date=new Date(value+'T12:00:00Z');
 return Number.isNaN(date.getTime()) || date.toISOString().slice(0,10)!==value
  ? 'Ingresá una fecha válida para el vencimiento del voucher.' : null;
}
export function giftVoucherItemsExpiryError(items: unknown): string | null {
 if(!Array.isArray(items))return null;
 for(const [index,item] of items.entries()){
  const error=giftVoucherExpiryError(item?.giftExpiresAt);
  if(error)return `Ítem ${index+1}: ${error}`;
  if(item?.giftExpiresAt && (!item.spaTreatmentId || !String(item.giftBeneficiaryName||'').trim()))
   return `Ítem ${index+1}: la validez requiere un tratamiento marcado como regalo y su beneficiario.`;
 }
 return null;
}
