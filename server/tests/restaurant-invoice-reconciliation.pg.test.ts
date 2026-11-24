import { randomUUID } from 'node:crypto';
import http from 'node:http';
import express from 'express';
import pg from 'pg';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { payloadHash } from '../billing/operationJournal';
import { reconcileRestaurantInvoice, reconcileRestaurantInvoiceBatch, requestRestaurantInvoiceReconciliation, startRestaurantInvoiceReconciliation } from '../billing/restaurantInvoiceReconciliation';
const suite = process.env.DATABASE_URL ? describe : describe.skip;
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
const prefix = 'restaurant-reconcile-'+randomUUID();
const fixtures: Array<{id:string;invoice:number;folio:string;payment:string;cash:string;operation:string}> = [];
let nextNumber=70_000_000+Math.floor(Math.random()*1_000_000), server:http.Server, base:string;
let stopWorker:(()=>void)|undefined;
async function fixture(amount=121, method='efectivo') {
  const id=randomUUID(),operation=randomUUID(),folio=randomUUID(),payment=randomUUID(),cash=randomUUID();
  const items=[{descripcion:'Cena prueba',cantidad:1,precioUnitario:Number((amount/1.21).toFixed(4)),alicuotaIva:'21',subtotalNeto:Number((amount/1.21).toFixed(4)),subtotal:amount}];
  const identity={environment:'homologacion',issuer:'20123456786',pointOfSale:5,type:'FB'};
  const request={tipoComprobante:'FB',cliente:{razonSocial:'CONSUMIDOR FINAL',condicionIva:'consumidor_final'},items,restaurantOrderId:id,puntoVentaOverride:5};
  const number=nextNumber++;
  await pool.query("INSERT INTO restaurant_orders(id,order_number,status,total,opened_at,closed_at,payment_method,receipt_type,charged_to_room) VALUES($1,$2,'closed',$3,now(),now(),$4,'factura_b','false')",[id,prefix+'-'+id,amount,method]);
  const invoice=(await pool.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,cae,modo_ficticio,estado,restaurant_order_id,items,fiscal_identity,reconciliation_status,reconciliation_updated_at)
    VALUES('FB',5,$1,'2026-11-24','CONSUMIDOR FINAL','consumidor_final',$2,$3,'86471093000001',false,'emitida',$4,$5::jsonb,$6::jsonb,'pendiente',now()) RETURNING id`,[number,amount/1.21,amount,id,JSON.stringify(items),JSON.stringify({...identity,operationId:operation})])).rows[0].id;
  await pool.query(`INSERT INTO billing_operations(operation_id,owner_type,owner_id,payload_hash,request_snapshot,fiscal_identity,stage,invoice_id)
    VALUES($1,'direct',$2,$3,$4::jsonb,$5::jsonb,'authorized',$6)`,[operation,id,payloadHash(request),JSON.stringify({...request,_numberAttempt:number}),JSON.stringify(identity),invoice]);
  await pool.query("INSERT INTO folios(id,codigo,entity_type,entity_id,status,total_charges,total_payments,balance) VALUES($1,$2,'restaurant_order',$3,'open',$4,$4,0)",[folio,prefix+'-'+folio,id,amount]);
  await pool.query(`INSERT INTO folio_movements(folio_id,type,amount,description,source_type,source_id) VALUES($1,'charge',$2,'Pedido prueba','restaurant_order',$3)`,[folio,amount,id]);
  await pool.query(`INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id,payment_method,receipt_type) VALUES($1,$2,'payment',$3,'Cobro prueba','restaurant_payment',$4,$5,'factura_b')`,[payment,folio,amount,id,method]);
  await pool.query(`INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,source_label,payment_method,amount,movement_type,receipt_type) VALUES($1,$2,'restaurant','restaurant_order',$3,'Pedido prueba',$4,$5,'income','factura_b')`,[cash,prefix,id,method,amount]);
  const f={id,invoice:Number(invoice),folio,payment,cash,operation};fixtures.push(f);return f;
}
async function state(f:typeof fixtures[number]) {return (await pool.query('SELECT * FROM sales_invoices WHERE id=$1',[f.invoice])).rows[0];}
async function money(f:typeof fixtures[number]) {
  const queries=[['order','SELECT * FROM restaurant_orders WHERE id=$1',f.id],['folio','SELECT * FROM folios WHERE id=$1',f.folio],['ledger','SELECT * FROM folio_movements WHERE folio_id=$1 ORDER BY id',f.folio],['cash',"SELECT * FROM cash_movements WHERE source_id=$1 ORDER BY id",f.id],['journal','SELECT * FROM billing_operations WHERE operation_id=$1',f.operation]];
  const result:Record<string,unknown>={};for(const [key,query,id] of queries)result[key]=(await pool.query(query,[id])).rows;
  const {reconciliation_status,reconciliation_error,reconciliation_updated_at,...invoice}=await state(f);result.invoice=invoice;return result;
}
async function audit(f:typeof fixtures[number]) {return (await pool.query("SELECT * FROM audit_logs WHERE entity_type='sales_invoice' AND entity_id=$1",[String(f.invoice)])).rows;}
suite('Conciliación automática administrativa de Restaurant',()=>{
 beforeAll(async()=>{
  await pool.query("INSERT INTO cash_shifts(id,area,shift_number,opened_at,status) VALUES($1,'restaurant',1,now(),'closed')",[prefix]);
  const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.user={id:prefix,username:'reconciliation-test',role:'admin'};req.isAuthenticated=()=>true;next();});
  (await import('../billing/routes')).registerBillingRoutes(app);
  (await import('../routes/reservations')).registerReservationsRoutes(app);
  server=http.createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+(server.address() as any).port;
 });
 afterAll(async()=>{
  stopWorker?.();if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  const invoices=fixtures.map(f=>f.invoice),ids=fixtures.map(f=>f.id);
  await pool.query("DELETE FROM sales_control_archive WHERE record_id=ANY($1::text[])",[fixtures.map(f=>f.cash)]);
  await pool.query("DELETE FROM audit_logs WHERE entity_type='sales_invoice' AND entity_id=ANY($1::varchar[])",[invoices.map(String)]);
  await pool.query('DELETE FROM sales_invoices WHERE nota_credito_id=ANY($1::integer[])',[invoices]);
  await pool.query('DELETE FROM billing_operations WHERE operation_id=ANY($1::text[])',[fixtures.map(f=>f.operation)]);
  await pool.query('DELETE FROM sales_invoices WHERE id=ANY($1::integer[])',[invoices]);
  await pool.query('DELETE FROM cash_movements WHERE shift_id=$1',[prefix]);
  await pool.query('DELETE FROM folio_movements WHERE folio_id=ANY($1::varchar[])',[fixtures.map(f=>f.folio)]);
  await pool.query('DELETE FROM folios WHERE id=ANY($1::varchar[])',[fixtures.map(f=>f.folio)]);
  await pool.query('DELETE FROM restaurant_orders WHERE id=ANY($1::varchar[])',[ids]);
  await pool.query('DELETE FROM cash_shifts WHERE id=$1',[prefix]);await pool.end();
  await (await import('../db')).pool.end();
 });
 it.each([{amount:152500,method:'efectivo'},{amount:23500,method:'efectivo'},{amount:75500,method:'mercadopago'}])('completa un cierre histórico probado conservando factura y movimientos ($amount, $method)',async({amount,method})=>{
  const f=await fixture(amount,method),before=await money(f);expect((await reconcileRestaurantInvoice(f.invoice)).status).toBe('completed');
  expect(await money(f)).toEqual(before);expect((await state(f)).reconciliation_status).toBe('conciliada');
  const history=await audit(f);expect(history).toHaveLength(1);expect(JSON.parse(history[0].details)).toMatchObject({orderId:f.id,amountCents:amount*100,paymentIds:[f.payment],cashMovementIds:[f.cash]});
 });
 it('dos verificaciones concurrentes actualizan y auditan una sola vez',async()=>{
  const f=await fixture(),before=await money(f);const r=await Promise.all([reconcileRestaurantInvoice(f.invoice),reconcileRestaurantInvoice(f.invoice)]);
  expect(r.map(i=>i.status).sort()).toEqual(['already_completed','completed']);expect(await audit(f)).toHaveLength(1);expect(await money(f)).toEqual(before);
 });
 const cases:Array<[string,(f:typeof fixtures[number])=>Promise<unknown>]>=[
  ['falta Caja',f=>pool.query('DELETE FROM cash_movements WHERE id=$1',[f.cash])],
  ['importe de Caja distinto',f=>pool.query('UPDATE cash_movements SET amount=120 WHERE id=$1',[f.cash])],
  ['medio de Caja distinto',f=>pool.query("UPDATE cash_movements SET payment_method='mercadopago' WHERE id=$1",[f.cash])],
  ['cobro anulado',f=>pool.query('UPDATE cash_movements SET anulado=true WHERE id=$1',[f.cash])],
  ['cobro de otra área',f=>pool.query("UPDATE cash_movements SET area='recepcion' WHERE id=$1",[f.cash])],
  ['reintegro en lugar de cobro',f=>pool.query("UPDATE cash_movements SET movement_type='expense' WHERE id=$1",[f.cash])],
  ['folio con otro medio',f=>pool.query("UPDATE folio_movements SET payment_method='tarjeta_credito' WHERE id=$1",[f.payment])],
  ['vínculo de Caja a otro pago',f=>pool.query("UPDATE cash_movements SET payment_id='another-payment' WHERE id=$1",[f.cash])],
  ['vínculo del folio a otro cobro',f=>pool.query("UPDATE folio_movements SET cash_movement_id='another-cash' WHERE id=$1",[f.payment])],
  ['saldo de folio diferente',f=>pool.query('UPDATE folios SET balance=1 WHERE id=$1',[f.folio])],
  ['folio incompleto',f=>pool.query('DELETE FROM folio_movements WHERE id=$1',[f.payment])],
  ['pedido abierto',f=>pool.query("UPDATE restaurant_orders SET status='open' WHERE id=$1",[f.id])],
  ['cuenta habitación',f=>pool.query("UPDATE restaurant_orders SET charged_to_room='true' WHERE id=$1",[f.id])],
  ['diario sin autorización confirmada',f=>pool.query("UPDATE billing_operations SET stage='uncertain' WHERE operation_id=$1",[f.operation])],
  ['diario de otro pedido',f=>pool.query("UPDATE billing_operations SET owner_id='other-order' WHERE operation_id=$1",[f.operation])],
  ['ambiente fiscal diferente',f=>pool.query("UPDATE billing_operations SET fiscal_identity=jsonb_set(fiscal_identity,'{environment}','\"produccion\"') WHERE operation_id=$1",[f.operation])],
  ['pedido fiscal alterado',f=>pool.query("UPDATE billing_operations SET payload_hash='changed' WHERE operation_id=$1",[f.operation])],
  ['autorización pendiente',f=>pool.query("UPDATE sales_invoices SET estado='autorizacion_pendiente' WHERE id=$1",[f.invoice])],
  ['error original para revisión',f=>pool.query("UPDATE sales_invoices SET reconciliation_error='Verificar comprobante' WHERE id=$1",[f.invoice])],
  ['CAE no verificable',f=>pool.query("UPDATE sales_invoices SET cae=NULL WHERE id=$1",[f.invoice])],
  ['modo ficticio',f=>pool.query('UPDATE sales_invoices SET modo_ficticio=true WHERE id=$1',[f.invoice])],
  ['Caja archivada',f=>pool.query("INSERT INTO sales_control_archive(kind,record_id,batch_id) VALUES('cash_movement',$1,$2)",[f.cash,prefix])],
 ];
 it.each(cases)('conserva el pendiente para Administración: %s',async(_name,mutate)=>{
  const f=await fixture();await mutate(f);const before=await money(f),original=await state(f);expect((await reconcileRestaurantInvoice(f.invoice)).status).toBe('review');
  expect(await state(f)).toEqual(original);expect(await money(f)).toEqual(before);expect(await audit(f)).toHaveLength(0);
 });
 it('un mismo total en otro pedido nunca sirve como evidencia',async()=>{
  const f=await fixture();await pool.query("UPDATE cash_movements SET source_id='another-order' WHERE id=$1",[f.cash]);expect((await reconcileRestaurantInvoice(f.invoice)).status).toBe('review');
 });
 it('detecta un cobro extra contra la factura aunque el cobro del pedido coincida',async()=>{
  const f=await fixture();await pool.query(`INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type) VALUES($1,$2,'restaurant','comprobante',$3,'efectivo',121,'income')`,[randomUUID(),prefix,String(f.invoice)]);
  expect((await reconcileRestaurantInvoice(f.invoice)).status).toBe('review');
 });
 it('una NC u otro documento del pedido mantiene la revisión',async()=>{
  const f=await fixture();await pool.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,nota_credito_id) VALUES('NCB',5,$1,'2026-11-24','Prueba','consumidor_final',10,12.1,'emitida',$2)`,[nextNumber++,f.invoice]);
  expect((await reconcileRestaurantInvoice(f.invoice)).status).toBe('review');
 });
 it('completa un pago dividido real cuando sus importes y medios coinciden uno a uno',async()=>{
  const f=await fixture();await pool.query('UPDATE cash_movements SET amount=60 WHERE id=$1',[f.cash]);await pool.query('UPDATE folio_movements SET amount=60 WHERE id=$1',[f.payment]);
  await pool.query(`INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,receipt_type) VALUES($1,$2,'restaurant','restaurant_order',$3,'tarjeta_credito',61,'income','FB')`,[randomUUID(),prefix,f.id]);
  await pool.query(`INSERT INTO folio_movements(folio_id,type,amount,description,source_type,source_id,payment_method,receipt_type) VALUES($1,'payment',61,'Segundo cobro','restaurant_payment',$2,'tarjeta_credito','factura_b')`,[f.folio,f.id]);
  const before=await money(f);expect((await reconcileRestaurantInvoice(f.invoice)).status).toBe('completed');expect(await money(f)).toEqual(before);
 });
 it('acepta una corrección de medio probada por su contraasiento exacto',async()=>{
  const f=await fixture();await pool.query(`INSERT INTO folio_movements(folio_id,type,amount,description,voided_movement_id) VALUES($1,'void',-121,'Corrección de medio',$2)`,[f.folio,f.payment]);
  await pool.query(`INSERT INTO folio_movements(folio_id,type,amount,description,source_type,source_id,payment_method) VALUES($1,'payment',121,'Cobro corregido','restaurant_payment',$2,'mercadopago')`,[f.folio,f.id]);
  await pool.query("UPDATE cash_movements SET payment_method='mercadopago' WHERE id=$1",[f.cash]);await pool.query("UPDATE restaurant_orders SET payment_method='mercadopago' WHERE id=$1",[f.id]);
  expect((await reconcileRestaurantInvoice(f.invoice)).status).toBe('completed');
 });
 it('si falla la auditoría también revierte el indicador, conservando el cobro',async()=>{
  const f=await fixture(),before=await money(f);const name='reconciliation_fault_'+randomUUID().replaceAll('-','');
  await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${f.invoice}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  try {await expect(reconcileRestaurantInvoice(f.invoice)).rejects.toThrow('synthetic audit failure');}finally{await pool.query(`DROP TRIGGER ${name} ON audit_logs`);await pool.query(`DROP FUNCTION ${name}()`);}
  expect((await state(f)).reconciliation_status).toBe('pendiente');expect(await money(f)).toEqual(before);expect(await audit(f)).toHaveLength(0);
 });
 it('un caso con diferencias no impide que el siguiente lote complete otro pedido',async()=>{
  const bad=await fixture(),good=await fixture();await pool.query('UPDATE cash_movements SET amount=120 WHERE id=$1',[bad.cash]);
  const a=await reconcileRestaurantInvoiceBatch(bad.invoice-1,1);expect(a.results[0].status).toBe('review');expect(a.nextId).toBe(bad.invoice);
  const b=await reconcileRestaurantInvoiceBatch(a.nextId,1);expect(b.results[0].status).toBe('completed');expect((await state(bad)).reconciliation_status).toBe('pendiente');expect((await state(good)).reconciliation_status).toBe('conciliada');
 });
 it('el verificador de fondo recupera un pendiente sin depender de abrir Facturación',async()=>{
  const f=await fixture();stopWorker=startRestaurantInvoiceReconciliation();requestRestaurantInvoiceReconciliation(f.invoice);
  await expect.poll(async()=>(await state(f)).reconciliation_status,{timeout:5000}).toBe('conciliada');stopWorker();stopWorker=undefined;
 });
 it('un pendiente de Restaurant no traba una salida de Recepción con saldo cancelado',async()=>{
  const bad=await fixture();await pool.query('UPDATE cash_movements SET amount=120 WHERE id=$1',[bad.cash]);expect((await reconcileRestaurantInvoice(bad.invoice)).status).toBe('review');
  const id=randomUUID(),today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
  await pool.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Checkout','Prueba')",[id]);await pool.query("INSERT INTO room_types(id,code,name) VALUES($1,$2,'Checkout prueba')",[id,id]);
  await pool.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1,$2,$3,'occupied')",[id,id,id]);
  await pool.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,status,number_of_guests,created_at,final_rate_per_night,total_room_amount) VALUES($1,$2,$3,$4,$5,$6,$7,0,'checked_in',1,now(),0,0)",[id,id,id,id,id,today,today]);
  try {const r=await fetch(base+`/api/reservations/${id}/check-out`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requireSettled:true})});expect(r.status,await r.text()).toBe(200);expect((await pool.query('SELECT status FROM reservations WHERE id=$1',[id])).rows[0].status).toBe('checked_out');expect((await state(bad)).reconciliation_status).toBe('pendiente');}
  finally {await pool.query('DELETE FROM cash_movements WHERE source_id=$1',[id]);await pool.query('DELETE FROM reservation_changelog WHERE reservation_id=$1',[id]);await pool.query('DELETE FROM audit_logs WHERE entity_id=$1',[id]);await pool.query('DELETE FROM reservations WHERE id=$1',[id]);await pool.query('DELETE FROM rooms WHERE id=$1',[id]);await pool.query('DELETE FROM room_types WHERE id=$1',[id]);await pool.query('DELETE FROM guests WHERE id=$1',[id]);}
 });
 it('Facturación identifica el área desde el pedido y conserva pendiente una diferencia real',async()=>{
  const f=await fixture();await pool.query('UPDATE cash_movements SET amount=120 WHERE id=$1',[f.cash]);await reconcileRestaurantInvoice(f.invoice);
  const r=await fetch(base+'/api/billing/invoices?desde=2026-11-24&hasta=2026-11-24');expect(r.status).toBe(200);const i=(await r.json()).find((i:any)=>Number(i.id)===f.invoice);expect(i.area_name).toBe('restaurant');expect(i.reconciliation_status).toBe('pendiente');
 });
});
