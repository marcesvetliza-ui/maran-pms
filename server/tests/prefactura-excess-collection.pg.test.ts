import {randomUUID} from 'node:crypto';
import express from 'express';
import type {Server} from 'node:http';
import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
vi.mock('../auth',()=>({requireAuth:(_r:any,_s:any,n:any)=>n(),requireRole:()=> (_r:any,_s:any,n:any)=>n(),requirePermission:()=> (_r:any,_s:any,n:any)=>n()}));
vi.mock('../audit',()=>({audit:vi.fn()}));
vi.mock('../billing/billingConfig',()=>({getBillingConfig:async()=>({puntoVenta:5,puntoVentaHomolog:99,arcaAmbiente:'homologacion',razonSocial:'Prueba',cuit:'30000000007'}),updateBillingConfig:vi.fn()}));
const {registerBillingRoutes}=await import('../billing/routes');
const {registerReservationsRoutes}=await import('../routes/reservations');
const suite=process.env.DATABASE_URL?describe:describe.skip;
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,max:4}):null;
suite('Cobros superiores a los conceptos seleccionados',()=>{
 let server:Server,base:string;
 const id=randomUUID(),guest=randomUUID(),room=randomUUID(),type=randomUUID(),shift=randomUUID();
 beforeAll(async()=>{
  if(!pool)return;
  await pool.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Daniel','Prueba')",[guest]);
  await pool.query("INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Prueba')",[type]);
  await pool.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$2,'occupied')",[room,type]);
  await pool.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,total_room_amount,final_rate_per_night,nights,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2026-11-17','2026-11-19','checked_in',471600,235800,2,NOW())",[id,guest,type,room]);
  await pool.query("INSERT INTO cash_shifts(id,area,shift_number,opened_at,status) VALUES($1,'reception',990917,NOW(),'open')",[shift]);
  const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as any).user={id:null,username:'excess-test',role:'admin'};next();});registerBillingRoutes(app);registerReservationsRoutes(app);
  server=await new Promise<Server>(resolve=>{const s=app.listen(0,()=>resolve(s));});base=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 afterAll(async()=>{
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(!pool)return;
  await pool.query('DELETE FROM account_movements WHERE reservation_id=$1',[id]);
  await pool.query('DELETE FROM folio_movements WHERE folio_id IN (SELECT id FROM folios WHERE entity_id=$1)',[id]);
  await pool.query('DELETE FROM folios WHERE entity_id=$1',[id]);
  await pool.query('DELETE FROM cash_movements WHERE payment_id IN (SELECT id FROM payments WHERE reservation_id=$1) OR source_id=$1',[id]);
  await pool.query('DELETE FROM payments WHERE reservation_id=$1',[id]);
  await pool.query('DELETE FROM sales_invoices WHERE reserva_id=$1',[id]);
  await pool.query("DELETE FROM audit_logs WHERE entity_id IN (SELECT operation_id FROM billing_operations WHERE owner_id=$1)",[id]);
  await pool.query('DELETE FROM billing_operations WHERE owner_id=$1',[id]);
  await pool.query('DELETE FROM charges WHERE reservation_id=$1',[id]);
  await pool.query('DELETE FROM reservation_changelog WHERE reservation_id=$1',[id]);
  await pool.query('DELETE FROM reservations WHERE id=$1',[id]);
  await pool.query('DELETE FROM housekeeping_tasks WHERE room_id=$1',[room]);
  await pool.query('DELETE FROM rooms WHERE id=$1',[room]);await pool.query('DELETE FROM room_types WHERE id=$1',[type]);await pool.query('DELETE FROM guests WHERE id=$1',[guest]);await pool.query('DELETE FROM cash_shifts WHERE id=$1',[shift]);await pool.end();
 });
 const post=async(path:string,data:any)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return{status:response.status,body:await response.json()};};
 const attempt=()=>{
  const payments=[{reservationId:id,amount:'471600.00',method:'efectivo',date:'2026-11-18',reference:null,notes:null,receiptType:'cierre_habitacion',billingTarget:'guest',companyId:null,agencyId:null,paymentRequestId:randomUUID()}];
  const invoiceRequest={tipoComprobante:'cierre_habitacion',cliente:{razonSocial:'Daniel Prueba',condicionIva:'Consumidor Final'},reservaId:id,creditOperationId:randomUUID(),puntoVentaOverride:5,
   items:[{descripcion:'Una noche',cantidad:1,precioUnitario:235800,subtotal:235800,subtotalNeto:194876.03,alicuotaIva:'21'}],sourceChargeIds:['accommodation:2026-11-17'],sourceChargeAmounts:{'accommodation:2026-11-17':235800},cashFormaPago:'efectivo',cashFormaPagoDetalle:[{method:'efectivo',amount:471600}],ordinaryAdvanceApplications:[],creditReapplications:[],prefacturaRecovery:{version:2,payments,checkoutRequested:false}};
  return{ownerReservationId:id,invoiceRequest,invoice:null,payments,checkoutRequested:false};
 };
 it('rechaza recuperar un intento cuyo cobro ya existe',async()=>{
  if(!pool)return;const original=attempt();
  await pool.query("INSERT INTO payments(reservation_id,amount,method,date,payment_request_id) VALUES($1,471600,'efectivo','2026-11-18',$2)",[id,original.payments[0].paymentRequestId]);
  try {const result=await post(`/api/billing/reservations/${id}/prepare-excess-collection`,{acknowledge:true,attempt:original});expect(result.status,JSON.stringify(result.body)).toBe(409);expect(result.body.error).toContain('cobros registrados');}
  finally{await pool.query('DELETE FROM payments WHERE payment_request_id=$1',[original.payments[0].paymentRequestId]);}
 });

 it('recupera también un intento fiscal rechazado antes de pedir autorización, sin cambiar sus conceptos',async()=>{
  if(!pool)return;const original=attempt();original.invoiceRequest.tipoComprobante='FB';
  expect((await post('/api/billing/invoices',original.invoiceRequest)).status).toBe(400);
  const result=await post(`/api/billing/reservations/${id}/prepare-excess-collection`,{acknowledge:true,attempt:original});
  expect(result.status,JSON.stringify(result.body)).toBe(200);expect(result.body.invoiceRequest.items).toEqual(original.invoiceRequest.items);
  expect((await pool.query('SELECT stage,invoice_id FROM billing_operations WHERE operation_id=$1',[original.invoiceRequest.creditOperationId])).rows[0]).toEqual({stage:'corrected',invoice_id:null});
  expect((await pool.query('SELECT count(*)::int n FROM sales_invoices WHERE reserva_id=$1',[id])).rows[0].n).toBe(0);
 });
 it('recupera la 506: un comprobante por una noche, cobro completo y anticipo disponible sin duplicar reintentos',async()=>{
  if(!pool)return;const original=attempt();
  expect((await post('/api/billing/invoices',original.invoiceRequest)).status).toBe(400);
  expect((await post(`/api/billing/reservations/${id}/prepare-excess-collection`,{attempt:original})).status).toBe(400);
  const path=`/api/billing/reservations/${id}/prepare-excess-collection`;
  const [first,retry]=await Promise.all([post(path,{acknowledge:true,attempt:original}),post(path,{acknowledge:true,attempt:original})]);
  expect(first.status,JSON.stringify(first.body)).toBe(200);expect(retry.body).toEqual(first.body);
  const replacement=first.body;expect(replacement.invoiceRequest.items).toEqual(original.invoiceRequest.items);expect(replacement.invoiceRequest.cashFormaPagoDetalle).toEqual([{method:'efectivo',amount:235800}]);
  expect(replacement.payments.map((p:any)=>p.amount)).toEqual(['235800.00','235800.00']);expect(replacement.payments[1].unlinkedAdvance).toBe(true);
  const issued=await post('/api/billing/invoices',replacement.invoiceRequest);expect(issued.status,JSON.stringify(issued.body)).toBe(201);
  const invoice=issued.body;expect(Number(invoice.montoTotal ?? invoice.monto_total)).toBe(235800);
  expect((await post('/api/billing/invoices',replacement.invoiceRequest)).body.id).toBe(invoice.id);
  for(const payment of replacement.payments){const {unlinkedAdvance,...body}=payment;if(!unlinkedAdvance)body.invoiceData={id:invoice.id,tipoComprobante:'cierre_habitacion',puntoVenta:invoice.puntoVenta,numero:invoice.numero,total:235800};
   const first=await post('/api/payments',body);expect(first.status,JSON.stringify(first.body)).toBe(201);expect((await post('/api/payments',body)).body.id).toBe(first.body.id);}
  const rows=(await pool.query('SELECT amount,invoice_ref FROM payments WHERE reservation_id=$1 ORDER BY invoice_ref NULLS LAST',[id])).rows;
  expect(rows).toHaveLength(2);expect(rows.map(r=>r.amount)).toEqual(['235800.00','235800.00']);expect(rows[1].invoice_ref).toBeNull();
  expect(Number((await pool.query("SELECT sum(amount) total FROM cash_movements WHERE payment_id IN (SELECT id FROM payments WHERE reservation_id=$1) AND movement_type='income'",[id])).rows[0].total)).toBe(471600);
  const folio=await(await fetch(base+`/api/reservations/${id}/folio`)).json();expect(Number(folio.financialSummary.operationalFolioBalance)).toBe(0);
  const status=await(await fetch(base+`/api/billing/reservations/${id}/operations/${replacement.invoiceRequest.creditOperationId}/reception-status`)).json();
  expect(status.financiallyComplete,JSON.stringify(status)).toBe(true);expect(status.acknowledgedPaymentIds).toHaveLength(2);
  expect((await pool.query('SELECT count(*)::int n FROM sales_invoices WHERE reserva_id=$1',[id])).rows[0].n).toBe(1);

  // The excess funds the second night later, without collecting the same money again.
  const advance=(await pool.query('SELECT id FROM payments WHERE reservation_id=$1 AND invoice_ref IS NULL',[id])).rows[0].id;
  const secondRequest={...replacement.invoiceRequest,creditOperationId:randomUUID(),sourceChargeIds:['accommodation:2026-11-18'],sourceChargeAmounts:{'accommodation:2026-11-18':235800},ordinaryAdvanceApplications:[{paymentId:advance,amount:235800}],prefacturaRecovery:{version:2,payments:[],checkoutRequested:false}};
  const second=await post('/api/billing/invoices',secondRequest);expect(second.status,JSON.stringify(second.body)).toBe(201);
  expect((await pool.query('SELECT count(*)::int n FROM payments WHERE reservation_id=$1',[id])).rows[0].n).toBe(2);
  const finalStatus=await(await fetch(base+`/api/billing/reservations/${id}/operations/${replacement.invoiceRequest.creditOperationId}/reception-status`)).json();
  expect(finalStatus.financiallyComplete,JSON.stringify(finalStatus)).toBe(true);expect(finalStatus.paymentConflicts).toEqual([]);
  expect(Number((await pool.query("SELECT sum(amount) total FROM cash_movements WHERE payment_id IN (SELECT id FROM payments WHERE reservation_id=$1) AND movement_type='income'",[id])).rows[0].total)).toBe(471600);
 });
});
