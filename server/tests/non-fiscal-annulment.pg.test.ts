import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { annulNonFiscalInvoice, nonFiscalAnnulmentArea } from '../billing/nonFiscalAnnulment';
import { getAvailableReservationAdvancePayments, getNetReservationDocumentedTotal } from '../../shared/reservationFolio';
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const schema = `voucher_void_${randomUUID().replaceAll('-','')}`;
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
const tables=['sales_invoices','payments','cash_shifts','cash_movements','audit_logs','sales_control_archive','pos_configs','charges','folio_movements','folios'];
const actor={id:null,name:'Operador prueba'};
const owner={reserva_id:'reservation-test'};
const run=(reason:unknown='Duplicado',expectedOwner:any=owner)=>annulNonFiscalInvoice(pool,14,reason,actor,'recepcion','shift-test',expectedOwner);
async function snapshot() {
  return { invoice:(await pool.query('SELECT * FROM sales_invoices WHERE id=14')).rows[0],payments:(await pool.query('SELECT * FROM payments ORDER BY id')).rows,
    cash:(await pool.query('SELECT * FROM cash_movements ORDER BY id')).rows, audits:(await pool.query('SELECT * FROM audit_logs')).rows };
}
suite('Baja de vouchers sin devolver cobros — PostgreSQL aislado',()=>{
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const table of tables) await admin.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING DEFAULTS)`);
 });
 beforeEach(async()=>{
  for(const table of tables)await pool.query(`TRUNCATE ${table}`);
  await pool.query(`INSERT INTO sales_invoices(id,tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,reserva_id,estado,modo_ficticio,source_charge_amounts)
    VALUES(14,'cierre_habitacion',5,14,'2026-11-06','Prueba','Consumidor Final',0,100,'reservation-test','emitida',false,'{"accommodation:2026-11-05":100}')`);
  await pool.query(`INSERT INTO payments(id,reservation_id,amount,method,date,status,invoice_ref) VALUES('payment-test','reservation-test',80,'efectivo','2026-11-06','active','{"id":14,"tipoComprobante":"cierre_habitacion","puntoVenta":5,"numero":14}')`);
  await pool.query("INSERT INTO cash_shifts(id,area,shift_number,opened_at,status) VALUES('shift-test','recepcion',1,now(),'open')");
  await pool.query("INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,source_label,payment_method,amount,movement_type,payment_id) VALUES('cash-income','shift-test','recepcion','reservation','reservation-test','Cobro original','efectivo',80,'income','payment-test')");
  await pool.query("INSERT INTO charges(id,reservation_id,description,amount,date) VALUES('charge-test','reservation-test','Cochera',10,'2026-11-06')");
 });
 afterAll(async()=>{await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
 it('libera el cobro como anticipo, conserva cargos y efectivo, y registra motivo/operador sin NC',async()=>{
  const before=await snapshot();expect(getAvailableReservationAdvancePayments(before.payments,[before.invoice])).toHaveLength(0);
  expect(await run('  Error de carga  ')).toMatchObject({annulled:true,alreadyAnnulled:false,releasedPayments:1});
  const after=await snapshot();expect(after.invoice.estado).toBe('anulada');expect(after.invoice.numero).toBe(14);
  expect(after.invoice.source_charge_amounts).toEqual(before.invoice.source_charge_amounts);
  expect(after.payments[0]).toMatchObject({amount:'80.00',status:'active',method:'efectivo'});
  expect(getAvailableReservationAdvancePayments(after.payments,[after.invoice])[0].availableAdvanceAmount).toBe(80);
  expect(getNetReservationDocumentedTotal([after.invoice])).toBe(0);
  expect(after.cash.find(row=>row.id==='cash-income')).toEqual(before.cash[0]);
  const log=after.cash.find(row=>row.source_type==='non_fiscal_void');
  expect(log).toMatchObject({amount:'0.00',movement_type:'informational',payment_method:'sin_movimiento',source_id:'14',registered_by:actor.name});
  expect(log.source_label).toContain('Motivo: Error de carga');expect(log.source_label).toContain('0005-00000014');
  expect(JSON.parse(after.audits[0].details)).toMatchObject({reason:'Error de carga',preserveCollection:true,before:{estado:'emitida'}});
  expect((await pool.query('SELECT amount,status FROM charges')).rows[0]).toEqual({amount:'10.00',status:'active'});
  expect((await pool.query('SELECT * FROM folio_movements')).rows).toHaveLength(0);
  expect((await pool.query('SELECT id FROM sales_invoices')).rows).toHaveLength(1);
 });
 it('repeticiones y solicitudes simultáneas no duplican el registro ni liberan dos veces',async()=>{
  const results=await Promise.all([run(),run()]);expect(results.filter(r=>!r.alreadyAnnulled)).toHaveLength(1);
  expect((await snapshot()).cash.filter(row=>row.source_type==='non_fiscal_void')).toHaveLength(1);
  expect((await snapshot()).audits).toHaveLength(1);
 });
 it('mantiene la parte del anticipo ya aplicada a otra factura',async()=>{
  await pool.query(`UPDATE payments SET invoice_ref='{"id":14,"tipoComprobante":"cierre_habitacion","puntoVenta":5,"numero":14,"reapplications":[{"invoiceId":88,"amount":30}]}'`);
  await run();const after=await snapshot();expect(getAvailableReservationAdvancePayments(after.payments,[after.invoice])[0].availableAdvanceAmount).toBe(50);
 });
 it('libera una reaplicación a este voucher sin perder la referencia histórica del cobro',async()=>{
  await pool.query(`UPDATE payments SET invoice_ref='{"id":77,"fundingReleases":{"77":8000},"reapplications":[{"invoiceId":14,"amount":30}]}'`);
  await run();const after=await snapshot();const ref=JSON.parse(after.payments[0].invoice_ref);
  expect(ref.id).toBe(77);expect(ref.fundingReleases).toEqual({'77':8000,'14':3000});
  expect(getAvailableReservationAdvancePayments(after.payments,[after.invoice])[0].availableAdvanceAmount).toBe(80);
 });
 it.each(['cuenta_corriente','gift_voucher','retencion_iibb'])('no inventa un anticipo monetario desde %s',async method=>{
  await pool.query('UPDATE payments SET method=$1',[method]);const before=(await snapshot()).payments[0].invoice_ref;
  await run();expect((await snapshot()).payments[0].invoice_ref).toBe(before);
 });
 it.each(['','  ','ab','x'.repeat(501),null])('rechaza motivo inválido sin alterar datos',async reason=>{
  const before=await snapshot();await expect(run(reason)).rejects.toMatchObject({statusCode:400});expect(await snapshot()).toEqual(before);
 });
 it.each([
  "UPDATE sales_invoices SET tipo_comprobante='FB' WHERE id=14",
  "UPDATE sales_invoices SET tipo_comprobante='tipo_inventado' WHERE id=14",
  "UPDATE sales_invoices SET cae='12345678901234' WHERE id=14",
  "UPDATE sales_invoices SET estado='autorizacion_pendiente' WHERE id=14",
  "UPDATE sales_invoices SET center_settlement_status='pending' WHERE id=14",
  `UPDATE sales_invoices SET credit_reapplication_intent='{"status":"pending"}' WHERE id=14`,
  "UPDATE sales_invoices SET monto_acreditado=1 WHERE id=14",
  "UPDATE sales_invoices SET reserva_id='otra-reserva' WHERE id=14",
  "UPDATE cash_shifts SET status='closed'",
  "INSERT INTO sales_control_archive(kind,record_id,batch_id) VALUES('invoice','14','archive-test')",
 ])('bloquea un estado inseguro y conserva cobros: %s',async change=>{
  await pool.query(change);const before=await snapshot();await expect(run()).rejects.toThrow();expect(await snapshot()).toEqual(before);
 });
 it('bloquea la NC pendiente antigua sobre el voucher hasta que se resuelva',async()=>{
  await pool.query(`INSERT INTO sales_invoices(id,tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,nota_credito_id)
   VALUES(15,'NCB',5,3,'2026-11-06','Prueba','Consumidor Final',0,100,'autorizacion_pendiente',14)`);
  await expect(run()).rejects.toThrow('NC/ND');expect((await snapshot()).invoice.estado).toBe('emitida');
 });
 it('si falla la auditoría revierte también la baja, la liberación y el registro en Caja',async()=>{
  await pool.query("ALTER TABLE audit_logs ADD CONSTRAINT reject_void_test CHECK(description='imposible')");const before=await snapshot();
  try{await expect(run()).rejects.toThrow();expect(await snapshot()).toEqual(before);}finally{await pool.query('ALTER TABLE audit_logs DROP CONSTRAINT reject_void_test');}
 });
 it.each(['ticket','voucher_justo','voucher_pedidos_ya','voucher_room_service','voucher_consumo_interno','cierre_spa','cierre_spa_agustin','cierre_spa_cortesia'])('la baja local también cubre %s',async type=>{
  await pool.query('UPDATE sales_invoices SET tipo_comprobante=$1 WHERE id=14',[type]);await run();expect((await snapshot()).invoice.estado).toBe('anulada');
 });
 it('un cobro antiguo en Caja sin pago vinculado se bloquea sin inventar un anticipo',async()=>{
  await pool.query('DELETE FROM payments');
  await pool.query("INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type) VALUES('legacy-income','shift-test','recepcion','comprobante','14','efectivo',80,'income')");
  const before=await snapshot();await expect(run()).rejects.toThrow('sin pago de reserva');expect(await snapshot()).toEqual(before);
 });
 it('retira únicamente el descuento propio, libera la cobertura y conserva el cobro como anticipo',async()=>{
  const discount={amount:10,sourceAmounts:{'accommodation:2026-11-05':10},reason:'Promoción'};
  await pool.query(`UPDATE sales_invoices SET monto_total=90,folio_id='folio-test',credit_reapplication_intent=$1::jsonb WHERE id=14`,[JSON.stringify({status:'completed',settlement:{status:'completed'},checkoutDiscount:discount})]);
  await pool.query("INSERT INTO folios(id,codigo,entity_type,entity_id,total_charges,total_payments,balance) VALUES('folio-test','FOL-TEST','reservation','reservation-test',100,90,10)");
  await pool.query("INSERT INTO charges(id,reservation_id,description,amount,date,category,status) VALUES('checkout-discount:14','reservation-test','Descuento propio',-10,'2026-11-06','adjustment','active')");
  await pool.query(`INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id) VALUES
   ('base','folio-test','charge',100,'Alojamiento','charge','base'),('payment','folio-test','payment',80,'Cobro','payment','payment-test'),
   ('checkout-discount:14','folio-test','discount',10,'Descuento propio','checkout_discount','14')`);
  await run('Duplicado',{...owner,folio_id:'folio-test'});const after=await snapshot();
  expect(after.invoice.credit_reapplication_intent.checkoutDiscount).toBeUndefined();
  expect(after.invoice.credit_reapplication_intent.nonFiscalAnnulment.originalCheckoutDiscount).toEqual(discount);
  expect((await pool.query("SELECT status FROM charges WHERE id='checkout-discount:14'")).rows[0].status).toBe('anulado');
  expect((await pool.query("SELECT status FROM charges WHERE id='charge-test'")).rows[0].status).toBe('active');
  expect((await pool.query("SELECT balance,total_payments FROM folios WHERE id='folio-test'")).rows[0]).toMatchObject({balance:'20.00',total_payments:'80.00'});
  expect(getAvailableReservationAdvancePayments(after.payments,[after.invoice])[0].availableAdvanceAmount).toBe(80);
  expect((await pool.query("SELECT id FROM sales_invoices WHERE estado='anulada' AND credit_reapplication_intent->'checkoutDiscount' IS NOT NULL")).rows).toHaveLength(0);
 });
 it('elige la Caja de recepción por la reserva y SPA por su comprobante, sin usar el PV del usuario actual',async()=>{
  expect(await nonFiscalAnnulmentArea(pool,{id:14,reserva_id:'reservation-test',punto_venta:5,tipo_comprobante:'cierre_habitacion'})).toBe('recepcion');
  expect(await nonFiscalAnnulmentArea(pool,{id:15,punto_venta:5,tipo_comprobante:'cierre_spa'})).toBe('spa');
  await expect(nonFiscalAnnulmentArea(pool,{id:16,punto_venta:999,tipo_comprobante:'ticket'})).rejects.toThrow('Caja de origen');
 });
});
