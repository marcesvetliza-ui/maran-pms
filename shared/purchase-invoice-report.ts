/** Report filters shared by the on-screen list and downloadable reports. */
export type PurchaseReportFilters = {desde?:string;hasta?:string;supplierId?:string;estado?:string;periodo?:string;search?:string};
const dateValid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function validatePurchaseReportFilters(filters:PurchaseReportFilters){
 if((filters.desde&&!dateValid(filters.desde))||(filters.hasta&&!dateValid(filters.hasta)))throw new Error('Ingresá fechas válidas.');
 if(filters.desde&&filters.hasta&&filters.desde>filters.hasta)throw new Error('La fecha desde no puede ser posterior a la fecha hasta.');
 if(filters.supplierId&&!/^[1-9]\d*$/.test(filters.supplierId))throw new Error('Proveedor inválido.');
 if(filters.estado&&!['todos','pendiente','parcial','pagado','anulado'].includes(filters.estado))throw new Error('Estado inválido.');
}
export function matchesPurchaseReport(row:any,f:PurchaseReportFilters){
 const date=String(row.fecha_emision??row.fechaEmision??'').slice(0,10);
 const name=row.supplier_nombre||row.supplierNombre||row.proveedor_nombre||row.proveedorNombre||'';
 const q=(f.search||'').toLocaleLowerCase('es');
 const previous=(row.special_details??row.specialDetails)?.remitoHistory||[];
 return (!f.desde||date>=f.desde)&&(!f.hasta||date<=f.hasta)&&(!f.supplierId||String(row.supplier_id??row.supplierId)===f.supplierId)&&(!f.estado||f.estado==='todos'||row.estado===f.estado)&&(!f.periodo||row.periodo===f.periodo)&&(!q||[name,row.proveedor_cuit??row.proveedorCuit,row.numero_comprobante_ext??row.numeroComprobanteExt??row.numero_comprobante??row.numeroComprobante,...previous.map((e:any)=>e.previous.numero_comprobante_ext||e.previous.numero_comprobante)].some(v=>String(v||'').toLocaleLowerCase('es').includes(q)));
}
export const purchaseReportHeaders=['Fecha','Tipo','Punto de Venta','Número Desde','Número Hasta','Cód. Autorización','Tipo Doc. Emisor','Nro. Doc. Emisor','Denominación Emisor','Tipo Doc. Receptor','Nro. Doc. Receptor','Tipo Cambio','Moneda','Neto Grav. IVA 0%','IVA 2,5%','Neto Grav. IVA 2,5%','IVA 5%','Neto Grav. IVA 5%','IVA 10,5%','Neto Grav. IVA 10,5%','IVA 21%','Neto Grav. IVA 21%','IVA 27%','Neto Grav. IVA 27%','Neto Gravado Total','Neto No Gravado','Op. Exentas','Otros Tributos','Total IVA','Imp. Total','Estado','Saldo pendiente','Descuento (incluido)','Envío (incluido)'];
const n=(v:any)=>Number(v)||0;
const typeLabels:Record<string,string>={'FACT-A':'1 - Factura A','FACT-B':'6 - Factura B','FACT-C':'11 - Factura C','NC-A':'3 - Nota de Crédito A','NC-B':'8 - Nota de Crédito B','NC-C':'13 - Nota de Crédito C','ND-A':'2 - Nota de Débito A','ND-B':'7 - Nota de Débito B','ND-C':'12 - Nota de Débito C','RECIBO-A':'4 - Recibo A','RECIBO-B':'9 - Recibo B','RECIBO-C':'15 - Recibo C'};
export function purchaseReportRow(row:any):Array<string|number|null>{
 const date=String(row.fecha_emision).slice(0,10).split('-').reverse().join('/');
 const iva=['monto_iva25','monto_iva5','monto_iva105','monto_iva21','monto_iva27'].map(k=>n(row[k]));
 // Per-rate taxable bases and authorization are not persisted: never manufacture them from rounded VAT or stock lines.
 return [date,typeLabels[row.tipo_comprobante]||row.tipo_comprobante,row.punto_venta||null,row.numero_comprobante,row.numero_comprobante,null,(row.proveedor_cuit||row.supplier_cuit)?'CUIT':null,(row.proveedor_cuit||row.supplier_cuit||'').replace(/\D/g,''),row.supplier_nombre||row.proveedor_nombre||'', 'CUIT','33681100089',1,'$',null,iva[0],null,iva[1],null,iva[2],null,iva[3],null,iva[4],null,n(row.monto_neto),n(row.monto_no_gravado),n(row.monto_exento),['impuestos_internos','ley_25413','percepcion_iibb','percepcion_iva','percepcion_ganancias'].reduce((sum,k)=>sum+n(row[k]),0),iva.reduce((sum,v)=>sum+v,0),n(row.monto_total),row.estado,n(row.saldo_pendiente),n(row.descuento?.importe),n(row.envio?.total)];
}
export function purchaseReportTotals(rows:any[]){
 const totals=rows.reduce((t,r)=>{if(r.estado==='anulado')return t;const sign=String(r.tipo_comprobante).startsWith('NC-')?-1:1;const values=purchaseReportRow(r);t.neto+=sign*n(values[24]);t.iva+=sign*n(values[28]);t.total+=sign*n(r.monto_total);return t;},{neto:0,iva:0,total:0});
 return {neto:Math.round(totals.neto*100)/100,iva:Math.round(totals.iva*100)/100,total:Math.round(totals.total*100)/100};
}
