import type {Express} from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {sql} from 'drizzle-orm';
import {db} from './db';
import {requireAuth} from './auth';
import {matchesPurchaseReport,validatePurchaseReportFilters,purchaseReportHeaders,purchaseReportRow,purchaseReportTotals,type PurchaseReportFilters} from '@shared/purchase-invoice-report';
const note='Reporte interno del PMS: solo comprobantes cargados. Código de autorización y bases por alícuota sin datos se dejan vacíos. Importes NC restan en el resumen; anulados se excluyen del resumen. Descuento y envío ya incluidos. Neto según carga PMS (B/C: importe final). No sustituye la consulta de ARCA.';
const money=(v:number)=>new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
export async function purchaseReportWorkbook(rows:any[],filters:PurchaseReportFilters){
 const wb=new ExcelJS.Workbook();wb.creator='Maran PMS';
 const sheet=wb.addWorksheet('Comprobantes',{views:[{state:'frozen',ySplit:4}],pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:4'}});
 sheet.addRow(['Comprobantes de compra — CUIT 33681100089']);sheet.addRow([`Fecha de emisión: ${filters.desde||'sin límite'} al ${filters.hasta||'sin límite'} · ${rows.length} comprobantes`]);sheet.addRow([note]);sheet.addRow(purchaseReportHeaders);
 for(let i=1;i<=3;i++)sheet.mergeCells(i,1,i,purchaseReportHeaders.length);
 sheet.getRow(3).height=32;sheet.getRow(3).alignment={wrapText:true};
 rows.forEach(r=>sheet.addRow(purchaseReportRow(r)));
 sheet.autoFilter={from:{row:4,column:1},to:{row:4,column:purchaseReportHeaders.length}};
 sheet.columns.forEach((c,i)=>{c.width=i===8?38:i===1?24:18;});
 sheet.getRow(4).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(4).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF174A77'}};sheet.getRow(4).height=45;sheet.getRow(4).alignment={wrapText:true};
 for(let i=5;i<=sheet.rowCount;i++){for(let c=14;c<=30;c++)sheet.getCell(i,c).numFmt='#,##0.00';for(let c=32;c<=34;c++)sheet.getCell(i,c).numFmt='#,##0.00';}
 const totals=purchaseReportTotals(rows);const summary=wb.addWorksheet('Resumen');summary.addRows([['Comprobantes de compra'],['Desde',filters.desde||''],['Hasta',filters.hasta||''],['Proveedor ID',filters.supplierId||'Todos'],['Estado',filters.estado||'todos'],['Período',filters.periodo||'Todos'],['Búsqueda',filters.search||''],['Cantidad',rows.length],['Neto gravado',totals.neto],['IVA',totals.iva],['Total neto de NC, sin anulados',totals.total],['Alcance',note]]);summary.getColumn(1).width=38;summary.getColumn(2).width=100;summary.getColumn(2).alignment={wrapText:true};[9,10,11].forEach(r=>summary.getCell(r,2).numFmt='#,##0.00');
 return wb.xlsx.writeBuffer();
}
export function purchaseReportPdf(rows:any[],filters:PurchaseReportFilters):Promise<Buffer>{
 return new Promise((resolve,reject)=>{
 const doc=new PDFDocument({size:'A4',layout:'landscape',margin:28,bufferPages:true});const chunks:Buffer[]=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
 const widths=[50,48,86,76,142,70,62,62,84];const heads=['Fecha','Tipo','Número','CUIT proveedor','Proveedor','Neto gravado','Otros (*)','IVA','Total'];let y=28;
 const line=(values:any[],header=false)=>{let x=28;values.forEach((v,i)=>{doc.font(header?'Helvetica-Bold':'Helvetica').fontSize(8).text(String(v??''),x,y,{width:widths[i]-6,height:16,ellipsis:true,align:i>=5?'right':'left'});x+=widths[i];});y+=19;};
 const header=()=>{doc.font('Helvetica-Bold').fontSize(14).text('Comprobantes de compra — Maran S.A.',28,28);doc.font('Helvetica').fontSize(9).text(`Emisión: ${filters.desde||'sin límite'} al ${filters.hasta||'sin límite'} | Proveedor: ${filters.supplierId||'Todos'} | Estado: ${filters.estado||'todos'} | Período: ${filters.periodo||'Todos'}`,28,49);doc.fontSize(8).text(`Búsqueda: ${filters.search||'—'} · ${rows.length} comprobantes`,28,64);y=84;line(heads,true);};header();
 for(const r of rows){if(y>485){doc.addPage();header();}const v=purchaseReportRow(r);line([v[0],r.tipo_comprobante,r.numero_comprobante_ext||r.numero_comprobante,v[7],v[8],money(Number(v[24])),money(Number(v[25])+Number(v[26])+Number(v[27])),money(Number(v[28])),money(Number(v[29]))]);doc.fontSize(6).fillColor('#555555').text(`Estado: ${r.estado} · Saldo: $${money(Number(r.saldo_pendiente))}${r.descuento?' · Descuento incluido: $'+money(Number(r.descuento.importe)):''}${r.envio?' · Envío incluido: $'+money(Number(r.envio.total)):''}`,28,y-1,{width:780,height:10});doc.fillColor('black');y+=8;}
 if(y>450){doc.addPage();header();}const totals=purchaseReportTotals(rows);doc.font('Helvetica-Bold').fontSize(10).text(`Resumen (NC restan, sin anulados): Neto $${money(totals.neto)} · IVA $${money(totals.iva)} · Total $${money(totals.total)}`,28,y+8,{width:780});doc.font('Helvetica').fontSize(7).text('(*) No gravado + exento + otros tributos. '+note,28,y+30,{width:780});
 const pages=doc.bufferedPageRange();for(let i=0;i<pages.count;i++){doc.switchToPage(i);doc.fontSize(7).text(`Página ${i+1} de ${pages.count}`,28,550,{width:780,align:'right',lineBreak:false});}doc.end();
 });
}
export function registerPurchaseReportRoutes(app:Express){
 app.get('/api/exports/purchase-invoices',requireAuth,async(req,res)=>{
 try{
 const keys=['desde','hasta','supplierId','estado','periodo','search'] as const;const filters:PurchaseReportFilters={};for(const key of keys){if(req.query[key]!==undefined){if(typeof req.query[key]!=='string')return res.status(400).json({error:'Filtros inválidos.'});filters[key]=String(req.query[key]);}}
 try{validatePurchaseReportFilters(filters);}catch(e:any){return res.status(400).json({error:e.message});}
 const format=req.query.format;if(!['xlsx','pdf'].includes(String(format)))return res.status(400).json({error:'Formato inválido.'});
 const result=await db.execute(sql`SELECT pi.*,s.razon_social AS supplier_nombre,s.cuit AS supplier_cuit FROM purchase_invoices pi LEFT JOIN accounting_suppliers s ON s.id=pi.supplier_id WHERE (${filters.desde?sql`pi.fecha_emision>=${filters.desde}::date`:sql`TRUE`}) AND (${filters.hasta?sql`pi.fecha_emision<=${filters.hasta}::date`:sql`TRUE`}) AND (${filters.supplierId?sql`pi.supplier_id=${Number(filters.supplierId)}`:sql`TRUE`}) ORDER BY pi.fecha_emision,pi.id`);
 const rows=result.rows.filter(r=>matchesPurchaseReport(r,filters));const buffer=format==='xlsx'?await purchaseReportWorkbook(rows,filters):await purchaseReportPdf(rows,filters);
 res.setHeader('Content-Type',format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf');res.setHeader('Content-Disposition',`attachment; filename="comprobantes-compra-${filters.desde||'inicio'}-${filters.hasta||'actual'}.${format}"`);res.send(Buffer.from(buffer));
 }catch(e:any){res.status(500).json({error:'No se pudo generar el reporte de compras.'});}
 });
}
