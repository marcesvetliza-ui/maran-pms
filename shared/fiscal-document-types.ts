export const FISCAL_DOCUMENT_CODES:Readonly<Record<string,number>>={
  FA:1,FB:6,FC:11,FT:195,FM:201,FMB:206,
  NCA:3,NCB:8,NCC:13,NCT:197,NCM:203,NCMB:208,
  NDA:2,NDB:7,NDC:12,NDT:196,NDM:202,NDMB:207,
};
const creditTypes:Readonly<Record<string,string>>={FA:'NCA',FB:'NCB',FC:'NCC',FT:'NCT',FM:'NCM',FMB:'NCMB'};
export function creditTypeForInvoice(type:unknown):string|undefined {
  return typeof type==='string'&&Object.hasOwn(creditTypes,type)?creditTypes[type]:undefined;
}
export function requireFiscalInvoiceForCredit(type:unknown):string {
  const credit=creditTypeForInvoice(type);
  if(!credit)throw Object.assign(new Error('La Nota de Crédito fiscal debe asociarse a la factura fiscal original. Ningún comprobante no fiscal admite una NC fiscal.'),{statusCode:400,code:'BILLING_INVALID_CREDIT_ORIGINAL'});
  return credit;
}
export function fiscalDocumentCode(type:string):number {
  const code=Object.hasOwn(FISCAL_DOCUMENT_CODES,type)?FISCAL_DOCUMENT_CODES[type]:undefined;
  if(!code)throw Object.assign(new Error('Tipo de comprobante fiscal no admitido por ARCA. Un voucher interno no puede enviarse como comprobante asociado de una NC o ND fiscal.'),{statusCode:400,code:'BILLING_INVALID_FISCAL_TYPE'});
  return code;
}
