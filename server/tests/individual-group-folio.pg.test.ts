import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import express from 'express';
vi.mock('../billing/billingConfig',async original=>{const actual=await original<any>();return {...actual,getBillingConfig:async()=>({...await actual.getBillingConfig(),modoArca:false,arcaAmbiente:'ficticio'})};});
const suite=process.env.CI==='true'&&/(127\.0\.0\.1|localhost):5432\/maran_test$/.test(process.env.DATABASE_URL||'')?describe:describe.skip;
let pool:any,server:any,url:string;const groups:string[]=[];const shift='group-flex-shift-'+randomUUID();
async function request(path:string,body:any){const r=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
async function fixture(){
 const group='individual-group-'+randomUUID();groups.push(group);const ids=[group+'a',group+'b'];
 await pool.query("INSERT INTO groups(id,group_code,name,check_in_date,check_out_date,status,master_folio_config,created_at) VALUES($1::text,$1::text,'Synthetic Individual Group','2026-11-10','2026-11-11','confirmed','accommodation',now())",[group]);
 for(const id of ids){
  await pool.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,total_room_amount,base_rate_per_night,final_rate_per_night,status,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2026-11-10','2026-11-11',1,121,121,121,'confirmed',now())",[id,id+'guest',id+'type',id+'room']);
  await pool.query('INSERT INTO group_reservation_links(id,group_id,reservation_id) VALUES($1,$2,$3)',[id+'link',group,id]);
 }
 const payment={reservationId:ids[0],amount:'121.00',method:'transferencia',date:'2026-11-11',reference:null,notes:null,receiptType:'factura_b',billingTarget:'guest',paymentRequestId:randomUUID()};
 const invoice={tipoComprobante:'FB',cliente:{razonSocial:'Synthetic AIMETTA',condicionIva:'Consumidor Final'},items:[{descripcion:'Alojamiento',cantidad:1,precioUnitario:121,subtotalNeto:100,subtotal:121,alicuotaIva:'21'}],reservaId:ids[0],sourceChargeIds:['accommodation'],sourceChargeAmounts:{accommodation:121},cashFormaPagoDetalle:[{method:'transferencia',amount:121}],creditOperationId:randomUUID(),prefacturaRecovery:{version:2,payments:[payment],checkoutRequested:true}};
 return {group,ids,payment,invoice};
}
suite('individual group room from its own prefactura',()=>{
 beforeAll(async()=>{
  ({pool}=await import('../db'));await pool.query((await import('../groupPaymentRequest')).GROUP_PAYMENT_REQUEST_SCHEMA_SQL);await pool.query("INSERT INTO cash_shifts(id,area,opened_by,status,shift_number,opened_at) VALUES($1,'reception','group-flex-test','open',999997,now())",[shift]);await(await import('../permissions')).loadRolePermissionsCache();
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:'individual-group-test',username:'Synthetic Individual Group',role:'admin'} as any;req.isAuthenticated=()=>true;next();});
  (await import('../routes/groups')).registerGroupsRoutes(app);(await import('../billing/routes')).registerBillingRoutes(app);(await import('../routes/reservations')).registerReservationsRoutes(app);
  server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}`;
 });
 afterAll(async()=>{
  if(server)await new Promise<void>(r=>server.close(()=>r()));
  for(const group of groups){
   const ids=(await pool.query('SELECT reservation_id FROM group_reservation_links WHERE group_id=$1',[group])).rows.map((r:any)=>r.reservation_id);
   await pool.query("DELETE FROM cash_movements WHERE payment_id IN(SELECT id FROM payments WHERE reservation_id=ANY($1::text[])) OR payment_id IN(SELECT id FROM group_payments WHERE group_id=$2)",[ids,group]);
   await pool.query('DELETE FROM payments WHERE reservation_id=ANY($1::text[])',[ids]);
   await pool.query('DELETE FROM billing_operations WHERE owner_id=ANY($1::text[])',[ids]);
   await pool.query('DELETE FROM sales_invoices WHERE reserva_id=ANY($1::text[]) OR group_id=$2',[ids,group]);await pool.query('DELETE FROM group_payments WHERE group_id=$1',[group]);await pool.query('DELETE FROM group_account_operations WHERE group_id=$1',[group]);
   await pool.query('DELETE FROM folio_movements WHERE folio_id IN(SELECT id FROM folios WHERE entity_id=ANY($1::text[]))',[ids]);
   await pool.query('DELETE FROM folios WHERE entity_id=ANY($1::text[])',[ids]);
   await pool.query('DELETE FROM group_reservation_links WHERE group_id=$1',[group]);
   await pool.query('DELETE FROM reservation_changelog WHERE reservation_id=ANY($1::text[])',[ids]);
   await pool.query('DELETE FROM reservations WHERE id=ANY($1::text[])',[ids]);await pool.query('DELETE FROM groups WHERE id=$1',[group]);
  }await pool.query('DELETE FROM cash_shifts WHERE id=$1',[shift]);await pool?.end();
 });
 it('issues, collects and retries from the room, with fiscal coverage reflected in its group',async()=>{
  const f=await fixture();
  const invoice=await request('/api/billing/invoices',f.invoice);expect(invoice.status,JSON.stringify(invoice.body)).toBe(201);
  const retry=await request('/api/billing/invoices',f.invoice);expect(retry.body.id).toBe(invoice.body.id);
  const body={...f.payment,invoiceData:{id:invoice.body.id,tipoComprobante:'FB',puntoVenta:invoice.body.puntoVenta,numero:invoice.body.numero,total:121}};
  const altered=await request('/api/payments',{...body,method:'efectivo'});expect(altered.status).toBe(409);
  const paid=await request('/api/payments',body);expect(paid.status,JSON.stringify(paid.body)).toBeLessThan(300);
  const replay=await request('/api/payments',body);expect(replay.body.id).toBe(paid.body.id);
  expect((await pool.query('SELECT reservation_id,amount,method FROM payments WHERE reservation_id=ANY($1::text[])',[f.ids])).rows).toEqual([{reservation_id:f.ids[0],amount:'121.00',method:'transferencia'}]);
  const snapshot=await (await import('../billing/groupInvoiceScope')).getGroupInvoiceSnapshot(f.group);
  expect(snapshot.sources.find(s=>s.id===`reservation:${f.ids[0]}:accommodation`)).toMatchObject({invoiced:121,available:0});
  expect(snapshot.sources.find(s=>s.id===`reservation:${f.ids[1]}:accommodation`)).toMatchObject({invoiced:0,available:121});
  expect(snapshot.financial.operationalBalance).toBe(121);
  const cash=(await pool.query("SELECT amount,payment_method FROM cash_movements WHERE payment_id=$1 AND movement_type='income'",[paid.body.id])).rows;
  expect(cash).toHaveLength(1);expect(Number(cash[0].amount)).toBe(121);expect(['transfer','transferencia']).toContain(cash[0].payment_method);
  const checkout=await request(`/api/reservations/${f.ids[0]}/check-out`,{requireSettled:true});expect(checkout.status,JSON.stringify(checkout.body)).toBeLessThan(300);
  expect((await pool.query('SELECT status FROM reservations WHERE id=$1',[f.ids[0]])).rows[0].status).toBe('checked_out');
  expect((await pool.query('SELECT status FROM reservations WHERE id=$1',[f.ids[1]])).rows[0].status).toBe('confirmed');

 });
 it('rejects an unfrozen direct group invoice before issuing',async()=>{
  const f=await fixture();const {prefacturaRecovery,...body}=f.invoice;
  const r=await request('/api/billing/invoices',body);expect(r.status).toBe(409);
  expect((await pool.query('SELECT id FROM sales_invoices WHERE reserva_id=$1',[f.ids[0]])).rows).toHaveLength(0);
 });
 it.each([true,false])('blocks individual billing when group coverage is known or historically ambiguous (%s)',async(mapped)=>{
  const f=await fixture();const issued=await request('/api/billing/invoices',f.invoice);expect(issued.status).toBe(201);
  await pool.query('UPDATE sales_invoices SET group_id=$2,reserva_id=NULL,source_charge_amounts=$3 WHERE id=$1',[issued.body.id,f.group,mapped?JSON.stringify({[`reservation:${f.ids[0]}:accommodation`]:121}):null]);
  const next={...f.invoice,creditOperationId:randomUUID(),prefacturaRecovery:{...f.invoice.prefacturaRecovery,payments:[{...f.payment,paymentRequestId:randomUUID()}]}};
  const blocked=await request('/api/billing/invoices',next);expect(blocked.status,JSON.stringify(blocked.body)).toBe(409);
  expect(blocked.body.error).toMatch(/facturados desde el grupo|facturación histórica/);
  await pool.query('UPDATE sales_invoices SET group_id=NULL,reserva_id=$2 WHERE id=$1',[issued.body.id,f.ids[0]]);
 });

 it.each([false,true])('documents pending room sources without collecting money or transferring debt, already paid=%s',async paid=>{
  const f=await fixture();await pool.query("UPDATE groups SET master_folio_config='none' WHERE id=$1",[f.group]);
  if(paid){const payment=await request('/api/payments',{...f.payment,paymentPurpose:'group_room_collection',receiptType:'none'});expect(payment.status,JSON.stringify(payment.body)).toBe(201);}
  const before=await pool.query('SELECT count(*) FROM cash_movements WHERE shift_id=$1',[shift]);
  const invoice={...f.invoice,groupDocumentationOnly:true,cashFormaPagoDetalle:undefined,prefacturaRecovery:{version:2,payments:[],checkoutRequested:false}};
  const issued=await request('/api/billing/invoices',invoice);expect(issued.status,JSON.stringify(issued.body)).toBe(201);
  const replay=await request('/api/billing/invoices',invoice);expect(replay.body.id).toBe(issued.body.id);
  const repeated=await request('/api/billing/invoices',{...invoice,creditOperationId:randomUUID()});expect(repeated.status).toBe(409);
  expect((await pool.query('SELECT count(*) FROM cash_movements WHERE shift_id=$1',[shift])).rows).toEqual(before.rows);
  expect((await pool.query('SELECT id FROM account_movements WHERE reservation_id=$1',[f.ids[0]])).rows).toHaveLength(0);
  const snapshot=await(await import('../billing/groupInvoiceScope')).getGroupInvoiceSnapshot(f.group);
  expect(snapshot.sources.find(s=>s.id===`reservation:${f.ids[0]}:accommodation`)).toMatchObject({invoiced:121,available:0});
  expect(snapshot.financial.operationalBalance).toBe(paid?121:242);
 });
 it('collects an already group-invoiced room without another invoice and safely settles a closed room',async()=>{
  const f=await fixture();const issued=await request('/api/billing/invoices',f.invoice);expect(issued.status).toBe(201);
  await pool.query('UPDATE sales_invoices SET group_id=$2,reserva_id=NULL,source_charge_amounts=$3 WHERE id=$1',[issued.body.id,f.group,JSON.stringify({[`reservation:${f.ids[0]}:accommodation`]:121})]);
  await pool.query("UPDATE reservations SET status='checked_out' WHERE id=$1",[f.ids[0]]);
  const body={...f.payment,paymentPurpose:'group_room_collection',receiptType:'none'};
  const [first,retry]=await Promise.all([request('/api/payments',body),request('/api/payments',body)]);expect(first.status,JSON.stringify(first.body)).toBeLessThan(300);expect(first.body.id).toBe(retry.body.id);
  expect((await pool.query('SELECT id FROM payments WHERE reservation_id=$1',[f.ids[0]])).rows).toHaveLength(1);
  expect((await pool.query('SELECT id FROM cash_movements WHERE payment_id=$1',[first.body.id])).rows).toHaveLength(1);
  expect((await pool.query('SELECT status FROM reservations WHERE id=$1',[f.ids[0]])).rows[0].status).toBe('checked_out');
  const account=await(await fetch(url+`/api/reservations/${f.ids[0]}/group-account`)).json();expect(account).toMatchObject({balance:0,pendingInvoice:0,groupCoverage:{accommodation:121}});
  const bad=await request('/api/payments',{...body,paymentRequestId:randomUUID()});expect(bad.status).toBe(409);
 });
 it('blocks a paid-room legacy request from bypassing group fiscal coverage',async()=>{
  const f=await fixture();const issued=await request('/api/billing/invoices',f.invoice);expect(issued.status).toBe(201);
  await pool.query('UPDATE sales_invoices SET group_id=$2,reserva_id=NULL,source_charge_amounts=$3 WHERE id=$1',[issued.body.id,f.group,JSON.stringify({[`reservation:${f.ids[0]}:accommodation`]:121})]);
  const payment=await request('/api/payments',{...f.payment,paymentPurpose:'group_room_collection'});expect(payment.status).toBe(201);
  const bypass={...f.invoice,creditOperationId:randomUUID(),ordinaryAdvanceApplications:[{paymentId:payment.body.id,amount:121}],prefacturaRecovery:{version:2,payments:[],checkoutRequested:false}};
  const rejected=await request('/api/billing/invoices',bypass);expect(rejected.status,JSON.stringify(rejected.body)).toBe(409);
  expect((await pool.query('SELECT id FROM sales_invoices WHERE reserva_id=$1',[f.ids[0]])).rows).toHaveLength(0);
 });
 it('does not attribute an old fiscal payment source to room charges automatically',async()=>{
  const f=await fixture();const issued=await request('/api/billing/invoices',f.invoice);expect(issued.status).toBe(201);
  await pool.query('UPDATE sales_invoices SET source_charge_amounts=$2,source_charge_ids=$3 WHERE id=$1',[issued.body.id,JSON.stringify({'payment:legacy':121}),JSON.stringify(['payment:legacy'])]);
  const account=await(await import('../billing/groupAccount')).groupAccountSnapshot(f.ids[0]);expect(account).toMatchObject({fiscalRequiresReview:true,pendingInvoice:null});
  const rejected=await request('/api/billing/invoices',{...f.invoice,groupDocumentationOnly:true,cashFormaPagoDetalle:undefined,creditOperationId:randomUUID(),prefacturaRecovery:{version:2,payments:[],checkoutRequested:false}});expect(rejected.status).toBe(409);
  const paid=await request('/api/payments',{...f.payment,paymentPurpose:'group_room_collection'});expect(paid.status,JSON.stringify(paid.body)).toBe(201);
 });
 it('leaves an advance unassigned, then applies mixed instruments to selected rooms without another Caja event',async()=>{
  const f=await fixture();
  const body={paymentRequestId:randomUUID(),paymentRows:[{method:'cash',amount:'40.00',reference:'advance'},{method:'transfer',amount:'60.00',reference:'bank'}],receiptType:'none',receiverDetails:{razonSocial:'Synthetic Group',dni:'30123456'},concepts:[{description:'Anticipo',amount:100}],leaveUnassigned:true};
  const parent=await request(`/api/groups/${f.group}/master-payment`,body);expect(parent.status,JSON.stringify(parent.body)).toBe(200);
  const repeated=await request(`/api/groups/${f.group}/master-payment`,body);expect(repeated.body.groupPaymentId).toBe(parent.body.groupPaymentId);
  const conflict=await request(`/api/groups/${f.group}/master-payment`,{...body,paymentRows:[{method:'cash',amount:'99.00',reference:'changed'}]});expect(conflict.status).toBe(409);
  const read=()=>fetch(url+`/api/reservations/${f.ids[0]}/group-account`).then(r=>r.json());expect(await read()).toMatchObject({balance:121,unassigned:100});
  const blocked=await request('/api/payments',{...f.payment,paymentPurpose:'group_room_collection'});expect(blocked.status).toBe(409);
  const allocation={operationId:randomUUID(),receiptId:parent.body.groupPaymentId,allocations:{[f.ids[0]]:'35.00',[f.ids[1]]:'25.00'}};
  const [apply,replay]=await Promise.all([request(`/api/groups/${f.group}/allocate-advance`,allocation),request(`/api/groups/${f.group}/allocate-advance`,allocation)]);expect(apply.status,JSON.stringify(apply.body)).toBe(200);expect(replay.status).toBe(200);
  expect(await read()).toMatchObject({balance:86,paid:35,unassigned:40});
  const cash=(await pool.query('SELECT amount,payment_method FROM cash_movements WHERE payment_id=$1 ORDER BY amount',[parent.body.groupPaymentId])).rows;expect(cash).toHaveLength(2);expect(cash.reduce((n:any,p:any)=>n+Number(p.amount),0)).toBe(100);
  const snapshot=await(await import('../billing/groupInvoiceScope')).getGroupInvoiceSnapshot(f.group);expect(snapshot.financial.collected).toBe(100);expect(snapshot.financial.operationalBalance).toBe(142);
  const children=(await pool.query('SELECT method,sum(amount::numeric)::text amount FROM payments WHERE group_payment_id=$1 GROUP BY method ORDER BY method',[parent.body.groupPaymentId])).rows;expect(children).toEqual([{method:'efectivo',amount:'40.00'},{method:'transferencia',amount:'20.00'}]);
  const altered=await request(`/api/groups/${f.group}/allocate-advance`,{...allocation,allocations:{[f.ids[0]]:36,[f.ids[1]]:24}});expect(altered.status).toBe(409);
  const over=await request(`/api/groups/${f.group}/allocate-advance`,{...allocation,operationId:randomUUID(),allocations:{[f.ids[0]]:41}});expect(over.status).toBe(409);
  const foreign=await request(`/api/groups/${f.group}/allocate-advance`,{...allocation,operationId:randomUUID(),allocations:{'foreign-reservation':1}});expect(foreign.status).toBe(409);
  expect(await read()).toMatchObject({unassigned:40});
  for(const amount of ['0.10','0.20'])expect((await request(`/api/groups/${f.group}/allocate-advance`,{operationId:randomUUID(),receiptId:parent.body.groupPaymentId,allocations:{[f.ids[0]]:amount}})).status).toBe(200);
  expect(await read()).toMatchObject({paid:35.3,unassigned:39.7,reviewReceipts:[]});
  await pool.query("UPDATE payments SET notes='Nota editada después de aplicar' WHERE group_payment_id=$1",[parent.body.groupPaymentId]);
  expect((await request(`/api/groups/${f.group}/allocate-advance`,allocation)).status).toBe(200);
  const reversed=await fetch(url+`/api/groups/${f.group}/master-payments/${parent.body.groupPaymentId}`,{method:'DELETE'});expect(reversed.status,await reversed.text()).toBe(200);
  const lateRetry=await request(`/api/groups/${f.group}/master-payment`,body);expect(lateRetry.status).toBe(409);expect(lateRetry.body.error).toMatch(/anulado/);
  expect((await request(`/api/groups/${f.group}/allocate-advance`,allocation)).status).toBe(409);
  expect((await pool.query('SELECT id FROM group_payments WHERE group_id=$1',[f.group])).rows).toHaveLength(0);

 });
 it('allows a frozen individual settlement when a master receipt already has proven room allocations',async()=>{
  const f=await fixture();
  const master=await request(`/api/groups/${f.group}/master-payment`,{paymentRequestId:randomUUID(),paymentRows:[{method:'transfer',amount:'100.00',reference:'allocated master'}],receiptType:'none',receiverDetails:{razonSocial:'Synthetic Group',dni:'30123456'},concepts:[{description:'Anticipo',amount:100}]});expect(master.status,JSON.stringify(master.body)).toBe(200);
  const prior=(await pool.query('SELECT id,amount FROM payments WHERE reservation_id=$1',[f.ids[0]])).rows[0];expect(prior.amount).toBe('50.00');
  const payment={...f.payment,amount:'71.00'};
  const invoice={...f.invoice,ordinaryAdvanceApplications:[{paymentId:prior.id,amount:50}],prefacturaRecovery:{version:2,payments:[payment],checkoutRequested:false}};
  const issued=await request('/api/billing/invoices',invoice);expect(issued.status,JSON.stringify(issued.body)).toBe(201);
  await pool.query("UPDATE reservations SET status='checked_out' WHERE id=$1",[f.ids[0]]);
  const paid=await request('/api/payments',{...payment,invoiceData:{id:issued.body.id}});expect(paid.status,JSON.stringify(paid.body)).toBe(201);
  const snapshot=await(await import('../billing/groupAccount')).groupAccountSnapshot(f.ids[0]);expect(snapshot).toMatchObject({balance:0,paid:121,unassigned:0,reviewReceipts:[]});
 });
 it('records a manual group distribution exactly once and leaves both reservations open',async()=>{
  const f=await fixture();const body={paymentRequestId:randomUUID(),distribution:'manual',distributionDetail:{[f.ids[0]]:31,[f.ids[1]]:69},paymentRows:[{method:'transfer',amount:'100.00',reference:'manual'}],receiptType:'none',receiverDetails:{razonSocial:'Synthetic Group',dni:'30123456'},concepts:[{description:'Anticipo',amount:100}]};
  const result=await request(`/api/groups/${f.group}/payment`,body);expect(result.status,JSON.stringify(result.body)).toBe(200);
  const again=await request(`/api/groups/${f.group}/payment`,body);expect(again.body.groupPaymentId).toBe(result.body.groupPaymentId);
  expect((await pool.query('SELECT reservation_id,amount FROM payments WHERE group_payment_id=$1 ORDER BY reservation_id',[result.body.groupPaymentId])).rows).toEqual([{reservation_id:f.ids[0],amount:'31.00'},{reservation_id:f.ids[1],amount:'69.00'}]);
  expect((await pool.query('SELECT status FROM reservations WHERE id=ANY($1::text[])',[f.ids])).rows.every((r:any)=>r.status==='confirmed')).toBe(true);
 });

});
