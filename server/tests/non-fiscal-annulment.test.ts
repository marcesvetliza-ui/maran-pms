import { inflateSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { releaseNonFiscalApplication, validateNonFiscalAnnulmentReason, canAnnulNonFiscalInvoice, NON_FISCAL_VOID_PERMISSION } from '../billing/nonFiscalAnnulment';
import { generarFacturaPDF, generarVoucherHabitacionPDF } from '../billing/invoicePdf';
import { API_RESOURCE_PERMISSIONS, RESOURCE_KEY_LABELS } from '../permissions';
const invoice={id:14,tipo_comprobante:'cierre_habitacion',punto_venta:5,numero:14};
function pdfText(pdf:Buffer) {
 const texts:string[]=[];
 for(const stream of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)){
  let content:string;try{content=inflateSync(Buffer.from(stream[1],'latin1')).toString('latin1');}catch{continue;}
  for(const operation of content.matchAll(/\[([\s\S]*?)\]\s*TJ/g))texts.push([...operation[1].matchAll(/<([0-9a-f]+)>/gi)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join(''));
 }
 return texts.join('\n');
}
describe('Baja no fiscal: aplicaciones y documentos',()=>{
 it('reconoce la referencia histórica por tipo/PV/número, nunca por monto',()=>{
  const payment={id:'p',amount:80,method:'efectivo',invoice_ref:JSON.stringify({tipoComprobante:'cierre_habitacion',puntoVenta:5,numero:14})};
  expect(releaseNonFiscalApplication(payment,invoice)).toMatchObject({id:14,fundingReleases:{'14':8000}});
  expect(releaseNonFiscalApplication({...payment,invoice_ref:JSON.stringify({id:99})},invoice)).toBeNull();
  expect(releaseNonFiscalApplication({...payment,invoice_ref:JSON.stringify({tipoComprobante:'cierre_habitacion',puntoVenta:6,numero:14})},invoice)).toBeNull();
 });
 it('no modifica otros créditos liberados ni otras reaplicaciones',()=>{
  const ref={id:99,fundingReleases:{'99':5000},reapplications:[{invoiceId:14,amount:20},{invoiceId:15,amount:30}]};
  expect(releaseNonFiscalApplication({amount:50,method:'efectivo',invoice_ref:JSON.stringify(ref)},invoice)).toEqual({...ref,fundingReleases:{'99':5000,'14':2000}});
 });
 it.each([
  {id:14,reapplications:[{invoiceId:14,amount:1}]},
  {id:99,reapplications:[{invoiceId:14,amount:1},{invoiceId:14,amount:2}]},
  {id:99,reapplications:[{invoiceId:14,amount:90}]},
 ])('bloquea aplicaciones ambiguas o mayores al cobro: %j',ref=>{
  expect(()=>releaseNonFiscalApplication({amount:80,method:'efectivo',invoice_ref:JSON.stringify(ref)},invoice)).toThrow();
 });
 it('no convierte documentos fiscales, borradores o comprobantes con CAE en vouchers eliminables',()=>{
  expect(canAnnulNonFiscalInvoice({...invoice,estado:'emitida',cae:null})).toBe(true);
  for(const extra of [{tipo_comprobante:'FB'},{estado:'autorizacion_pendiente'},{cae:'12345678901234'},{tipo_comprobante:'otro'}])expect(canAnnulNonFiscalInvoice({...invoice,estado:'emitida',...extra})).toBe(false);
  expect(validateNonFiscalAnnulmentReason('  Duplicado  ')).toBe('Duplicado');
 });
 it('publica un permiso propio y configurable por rol',()=>{
  expect(API_RESOURCE_PERMISSIONS[NON_FISCAL_VOID_PERMISSION]).toEqual(expect.arrayContaining(['admin','reception']));
  expect(RESOURCE_KEY_LABELS[NON_FISCAL_VOID_PERMISSION].label).toContain('no fiscales');
 });
 it('marca el PDF del voucher de habitación eliminado y conserva los datos históricos',async()=>{
  const data={eliminated:true,numero:14,puntoVenta:5,fechaEmision:'2026-11-06',reservationCode:'PRUEBA',guestName:'Prueba',roomNumber:'403',checkInDate:'2026-11-04',checkOutDate:'2026-11-06',nights:2,roomRate:50,roomTotal:100,charges:[],payments:[],grandTotal:100,totalPayments:0,balance:100};
  expect(pdfText(await generarVoucherHabitacionPDF(data,{}))).toContain('COMPROBANTE ELIMINADO');
  expect(pdfText(await generarVoucherHabitacionPDF({...data,eliminated:false},{}))).not.toContain('COMPROBANTE ELIMINADO');
 });
 it('marca también los PDF no fiscales genéricos, sin etiquetar una factura fiscal como baja local',async()=>{
  const data={...invoice,estado:'anulada',monto_total:100,monto_neto:100,fecha_emision:'2026-11-06',cliente_razon_social:'Prueba',items:[{descripcion:'Servicio',cantidad:1,precioUnitario:100,subtotal:100}]};
  expect(pdfText(await generarFacturaPDF(data,{}))).toContain('COMPROBANTE ELIMINADO');
  expect(pdfText(await generarFacturaPDF({...data,tipo_comprobante:'FB'},{}))).not.toContain('COMPROBANTE ELIMINADO');
 });
});
