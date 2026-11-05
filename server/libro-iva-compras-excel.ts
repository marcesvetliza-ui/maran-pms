import ExcelJS from 'exceljs';
const arcaLabels:Record<string,string>={
 'FACT-A':'1 - Factura A','FACT-B':'6 - Factura B','FACT-C':'11 - Factura C',
 'NC-A':'3 - Nota de Crédito A','NC-B':'8 - Nota de Crédito B','NC-C':'13 - Nota de Crédito C',
 'ND-A':'2 - Nota de Débito A','ND-B':'7 - Nota de Débito B','ND-C':'12 - Nota de Débito C',
 'RECIBO-A':'4 - Recibo A','RECIBO-B':'9 - Recibo B','RECIBO-C':'15 - Recibo C',
 'FACT-M':'51 - Factura M','ND-M':'52 - Nota de Débito M','NC-M':'53 - Nota de Crédito M',
};
export function purchaseDocumentArcaLabel(type:string):string{return arcaLabels[type]||type;}

/** Column order supplied by Administración in MODELO COMPROBANTES COMPRAS.xlsx. */
export const purchaseIvaModelHeaders = [
 'Fecha','Tipo de comprobante','Punto de venta','Número de Comprobante','Número Hasta',
 'Cód. Autorización','Tipo Doc. Emisor','Nro. Doc. Emisor','Denominación Emisor',
 'Tipo Doc. Receptor','Nro. Doc. Receptor','Tipo Cambio','Moneda','Neto Grav. IVA 0%',
 'IVA 2,5%','Neto Grav. IVA 2,5%','IVA 5%','Neto Grav. IVA 5%','IVA 10,5%',
 'Neto Grav. IVA 10,5%','IVA 21%','Neto Grav. IVA 21%','IVA 27%','Neto Grav. IVA 27%',
 'Neto Gravado Total','Neto No Gravado','Op. Exentas','Otros Tributos','Total IVA',
 'Imp. Total','Percepciones IIBB','Percepciones IVA',
];
type Bases = {g21:number;g105:number;g27:number;g5:number;g25:number};
const number = (value:unknown) => Number(value)||0;
export function purchaseIvaModelRow(row:any, bases:Bases, zeroRateBase:number, recipientCuit:string) {
 const issuerCuit=String(row.proveedor_cuit||row.supplier_cuit||'').replace(/\D/g,'');
 const vat=['monto_iva25','monto_iva5','monto_iva105','monto_iva21','monto_iva27'].map(key=>number(row[key]));
 return [
  String(row.fecha_emision).slice(0,10).split('-').reverse().join('/'),
  purchaseDocumentArcaLabel(row.tipo_comprobante), row.punto_venta ?? null,
  String(row.numero_comprobante), null, null,
  issuerCuit?'CUIT':null,issuerCuit||null,row.supplier_nombre||row.proveedor_nombre||'',
  'CUIT',recipientCuit.replace(/\D/g,''),1,'$',zeroRateBase,
  vat[0],bases.g25,vat[1],bases.g5,vat[2],bases.g105,vat[3],bases.g21,vat[4],bases.g27,
  number(row.monto_neto),number(row.monto_no_gravado),number(row.monto_exento),
  // IIBB/IVA perceptions have their own columns; do not also add them here.
  number(row.impuestos_internos)+number(row.ley_25413)+number(row.percepcion_ganancias),
  Math.round(vat.reduce((sum,value)=>sum+value,0)*100)/100,number(row.monto_total),
  number(row.percepcion_iibb),number(row.percepcion_iva),
 ];
}
export function addPurchaseIvaModelSheet(wb:ExcelJS.Workbook, rows:any[], basesFor:(row:any)=>Bases, netByRate:Map<number,Record<string,number>>, recipientCuit:string) {
 const sheet=wb.addWorksheet('Libro IVA Compras',{views:[{state:'frozen',ySplit:1}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'}});
 sheet.addRow(purchaseIvaModelHeaders);
 for(const row of rows){
  const rates=netByRate.get(Number(row.id));
  const zeroRate=Object.entries(rates||{}).filter(([rate])=>Number(rate)===0).reduce((sum,[,value])=>sum+number(value),0);
  sheet.addRow(purchaseIvaModelRow(row,basesFor(row),zeroRate,recipientCuit));
 }
 sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:purchaseIvaModelHeaders.length}};
 sheet.columns.forEach((column,index)=>{column.width=index===8?38:index===1?30:index===3?24:19;});
 sheet.getRow(1).height=45;
 sheet.getRow(1).font={bold:true};sheet.getRow(1).alignment={wrapText:true,vertical:'middle'};
 sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9E1F2'}};
 for(const column of [5,6])sheet.getCell(1,column).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFF0000'}};
 for(let r=2;r<=sheet.rowCount;r++){
  for(const c of [3,4,5,6,8,11])sheet.getCell(r,c).numFmt='@';
  for(let c=14;c<=32;c++)sheet.getCell(r,c).numFmt='#,##0.00';
  sheet.getCell(r,12).numFmt='0.000000';
 }
 return sheet;
}
