import {type PurchaseInvoiceAmountInput} from './purchaseInvoiceTotals';
const bases=['montoNeto','montoExento','montoNoGravado'] as const;
const iva=['montoIva21','montoIva105','montoIva27','montoIva5','montoIva25'] as const;
export type PurchaseDiscount={descripcion:string;tipo:'importe'|'porcentaje';porcentaje:string|null;importe:string;base:string;originales:Record<string,string>};
const fail=(message:string)=>Object.assign(new Error(message),{statusCode:400});
const cents=(value:unknown)=>{const n=Number(value||0);if(!Number.isFinite(n)||n<0||n>999999999999.99||Math.abs(n*100-Math.round(n*100))>.00001)throw fail('Los importes del descuento y su base deben ser positivos o cero y tener hasta dos decimales');return Math.round(n*100);};
/** Input amounts are before the discount; persisted fiscal amounts are after it. */
export function applyPurchaseDiscount<T extends PurchaseInvoiceAmountInput & Record<string,any>>(input:T):T & {descuento:PurchaseDiscount|null}{
 const type=input.descuentoTipo==='porcentaje'?'porcentaje':'importe';const pct=Number(input.descuentoPorcentaje||0);
 if(!Number.isFinite(pct)||pct<0||pct>100)throw fail('El porcentaje de descuento debe estar entre 0 y 100');
 if((type==='importe'&&!cents(input.descuentoImporte))||(type==='porcentaje'&&!pct))return {...input,descuento:null};
 const original=Object.fromEntries([...bases,...iva].map(k=>[k,(cents(input[k])/100).toFixed(2)]));
 const amounts=bases.map(k=>cents(input[k]));const base=amounts.reduce((a,b)=>a+b,0);
 const discount=type==='porcentaje'?Math.round(base*pct/100):cents(input.descuentoImporte);
 if(!discount)return {...input,descuento:null};
 if(!['FACT-A','FACT-B','FACT-C'].includes(String(input.tipoComprobante)))throw fail('Este tipo de comprobante no admite descuento con esta base');
 if(input.tipoComprobante==='FACT-B'&&type!=='importe')throw fail('En Factura B cargá el descuento final informado por el proveedor');
 if(!base||discount>base)throw fail('El descuento no puede superar el subtotal antes de impuestos');
 if(!String(input.descuentoDescripcion||'').trim())throw fail('Indicá la descripción del descuento');
 // Largest remainders retain the exact discount across taxable/exempt/non-taxed bases.
 const shares=amounts.map(n=>Number(BigInt(discount)*BigInt(n)/BigInt(base)));let remaining=discount-shares.reduce((a,b)=>a+b,0);
 const order=amounts.map((n,i)=>({i,remainder:BigInt(discount)*BigInt(n)%BigInt(base)})).sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1);
 for(let i=0;remaining>0;i++,remaining--)shares[order[i%order.length].i]++;
 const adjusted:Record<string,string>={};bases.forEach((k,i)=>adjusted[k]=((amounts[i]-shares[i])/100).toFixed(2));
 if(input.tipoComprobante==='FACT-A')iva.forEach(k=>adjusted[k]=(Math.round(cents(input[k])*(1-discount/base))/100).toFixed(2));
 return {...input,...adjusted,descuento:{descripcion:String(input.descuentoDescripcion).trim(),tipo:type,porcentaje:type==='porcentaje'?String(pct):null,importe:(discount/100).toFixed(2),base:(base/100).toFixed(2),originales:original}};
}
export function restorePurchaseDiscount<T extends Record<string,any>>(invoice:T){const d=invoice.descuento as PurchaseDiscount|null;return {...invoice,...(d?.originales||{}),descuentoDescripcion:d?.descripcion||'',descuentoTipo:d?.tipo||'importe',descuentoPorcentaje:d?.porcentaje||'',descuentoImporte:d?.importe||''};}
