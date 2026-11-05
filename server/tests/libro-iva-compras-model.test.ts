import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { addPurchaseIvaModelSheet, purchaseDocumentArcaLabel } from '../libro-iva-compras-excel';
const base={id:1,fecha_emision:'2026-11-05',tipo_comprobante:'FACT-A',punto_venta:'00001',numero_comprobante:'000000000000000123',proveedor_cuit:'30-00000000-7',proveedor_nombre:'Proveedor Prueba',monto_neto:'400.00',monto_iva21:'21.00',monto_iva105:'31.50',percepcion_iibb:'5',percepcion_iva:'2',percepcion_ganancias:'3',impuestos_internos:'4',ley_25413:'1',monto_total:'467.50'};
const bases={g21:100,g105:300,g27:0,g25:0,g5:0};
describe('Excel Libro IVA Compras según modelo de Administración',()=>{
 it('coincide con las 32 columnas y los cinco ejemplos del archivo aportado',async()=>{
  const template=new ExcelJS.Workbook();await template.xlsx.readFile(new URL('./fixtures/modelo-comprobantes-compras.xlsx',import.meta.url).pathname);
  const expected=(template.worksheets[0].getRow(1).values as any[]).slice(1).map(v=>String(v).trim());
  const wb=new ExcelJS.Workbook(); const sheet=addPurchaseIvaModelSheet(wb,[base],()=>bases,new Map(),'33681100089');
  expect((sheet.getRow(1).values as any[]).slice(1)).toEqual(expected);
  const examples=['FACT-C','FACT-A','NC-A','RECIBO-C','RECIBO-A'];
  examples.forEach((type,i)=>expect(purchaseDocumentArcaLabel(type)).toBe(template.worksheets[0].getCell(i+2,2).value));
  expect(sheet.columnCount).toBe(32);
 });
 it('preserva identificadores, IVA y percepciones por separado al descargar',async()=>{
  const wb=new ExcelJS.Workbook();addPurchaseIvaModelSheet(wb,[base],()=>bases,new Map(),'33-68110008-9');
  const saved=new ExcelJS.Workbook();await saved.xlsx.load(await wb.xlsx.writeBuffer());
  const s=saved.worksheets[0];
  expect(s.getCell('B2').value).toBe('1 - Factura A');
  expect(s.getCell('C2').value).toBe('00001');expect(s.getCell('D2').value).toBe(base.numero_comprobante);
  expect(s.getCell('E2').value).toBeNull();expect(s.getCell('F2').value).toBeNull();
  expect(s.getCell('K2').value).toBe('33681100089');
  expect(s.getCell('S2').value).toBe(31.5);expect(s.getCell('T2').value).toBe(300);
  expect(s.getCell('U2').value).toBe(21);expect(s.getCell('V2').value).toBe(100);
  expect(s.getCell('AB2').value).toBe(8);expect(s.getCell('AC2').value).toBe(52.5);
  expect(s.getCell('AD2').value).toBe(467.5);expect(s.getCell('AE2').value).toBe(5);expect(s.getCell('AF2').value).toBe(2);
  expect([25,26,27,28,29,31,32].reduce((sum,c)=>sum+Number(s.getCell(2,c).value),0)).toBe(467.5);
  expect(s.rowCount).toBe(2); // No totals row masquerading as a document.
 });
 it('incluye las columnas opcionales rojas aun sin comprobantes',()=>{
  const wb=new ExcelJS.Workbook();const s=addPurchaseIvaModelSheet(wb,[],()=>bases,new Map(),'33681100089');
  expect(s.columnCount).toBe(32);expect(s.rowCount).toBe(1);
  for(const c of ['E1','F1'])expect(s.getCell(c).fill).toMatchObject({fgColor:{argb:'FFFF0000'}});
 });
 it('usa bases 0% almacenadas y CUIT del proveedor vinculado cuando falta en la copia',()=>{
  const wb=new ExcelJS.Workbook();const s=addPurchaseIvaModelSheet(wb,[{...base,proveedor_cuit:null,supplier_cuit:'30-00000000-7'}],()=>bases,new Map([[1,{'0':50}]]),'33681100089');
  expect(s.getCell('N2').value).toBe(50);expect(s.getCell('H2').value).toBe('30000000007');
 });
 it('no inventa un código ARCA para documentos internos desconocidos',()=>{
  expect(purchaseDocumentArcaLabel('DOCUMENTO-INTERNO')).toBe('DOCUMENTO-INTERNO');
 });
});
