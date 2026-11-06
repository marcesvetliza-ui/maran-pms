import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
vi.mock('../db', () => ({ db: {} }));
vi.mock('../accounting', () => ({ generarAsientoOP: vi.fn(async () => 70) }));
import { createPaymentOrder } from '../paymentOrder';
import { sircarLine, sircarAlicuota } from '../sircar';
const dialect = new PgDialect();
it('saves the effective IIBB percentage in the OP and retention, excluding NC from its existing base', async () => {
 const invoices=[{id:9,monto_total:'1210',monto_neto:'1000',saldo_pendiente:'1210',tipo_comprobante:'FACT-A'}, {id:10,monto_total:'2420',monto_neto:'2000',saldo_pendiente:'2420',tipo_comprobante:'FACT-A'}, {id:11,monto_total:'121',monto_neto:'100',saldo_pendiente:'121',tipo_comprobante:'NC-A'}];
 const statements:ReturnType<PgDialect['sqlToQuery']>[]=[];
 const tx={execute:vi.fn(async(query:any)=>{
  const q=dialect.sqlToQuery(query);statements.push(q);
  if(q.sql.includes('FROM purchase_invoices')&&q.sql.includes('FOR UPDATE'))return {rows:invoices};
  if(q.sql.includes('AS next'))return {rows:[{next:901}]};
  if(q.sql.includes('INSERT INTO payment_orders'))return {rows:[{id:30,fecha:'2026-11-06',total_facturas:3509,retencion_iibb:60,total_abonado:3449}]};
  if(q.sql.includes('SELECT razon_social'))return {rows:[{razon_social:'Proveedor'}]};
  if(q.sql.includes('SELECT cuit'))return {rows:[{cuit:'30111111111'}]};
  return {rows:[]};
 })};
 await createPaymentOrder(tx as any,{supplierId:1,facturaIds:[9,10,11],retencionIibb:60,alicuotaIibb:0,depBancario:3449},()=> '2026-11-06');
 const op=statements.find(q=>q.sql.includes('INSERT INTO payment_orders'))!;
 expect(op.params.at(-1)).toBe(2);
 const retention=statements.find(q=>q.sql.includes('INSERT INTO iibb_retentions'))!;
 expect(retention.params.slice(-3)).toEqual([3000,2,60]);
 expect(sircarLine({nro_constancia:901,cuit_proveedor:'30-11111111-1',fecha_retencion:'2026-11-06',importe_base:3000,alicuota:retention.params.at(-2),importe_retenido:60},1)).toBe('00001,1,1,901,30111111111,6/11 /2026,3000.00,  2.00,60.00,004,908');
});
describe('SIRCAR rate',()=>{
 it('uses the saved rate and recovers an old zero from the saved base and amount without rewriting records',()=>{
  expect(sircarAlicuota({alicuota:'3.5',importe_base:'1000',importe_retenido:'20'})).toBe(3.5);
  expect(sircarAlicuota({alicuota:'0',importe_base:'2170931.82',importe_retenido:'65127.95'})).toBe(3);
  expect(sircarAlicuota({alicuota:null,importe_base:'0',importe_retenido:'20'})).toBe(0);
 });
});
