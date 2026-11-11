import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import express from 'express';
vi.mock('../billing/billingConfig',async original=>{const actual=await original<any>();return {...actual,getBillingConfig:async()=>({...await actual.getBillingConfig(),modoArca:false,arcaAmbiente:'ficticio'})};});
const suite=process.env.CI==='true'&&/127\.0\.0\.1:5432\/maran_test$/.test(process.env.DATABASE_URL||'')?describe:describe.skip;
let pool:any,server:any,url:string;const groups:string[]=[];
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
  ({pool}=await import('../db'));await(await import('../permissions')).loadRolePermissionsCache();
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:'individual-group-test',username:'Synthetic Individual Group',role:'admin'} as any;req.isAuthenticated=()=>true;next();});
  (await import('../billing/routes')).registerBillingRoutes(app);(await import('../routes/reservations')).registerReservationsRoutes(app);
  server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}`;
 });
 afterAll(async()=>{
  if(server)await new Promise<void>(r=>server.close(()=>r()));
  for(const group of groups){
   const ids=(await pool.query('SELECT reservation_id FROM group_reservation_links WHERE group_id=$1',[group])).rows.map((r:any)=>r.reservation_id);
   await pool.query("DELETE FROM cash_movements WHERE payment_id IN(SELECT id FROM payments WHERE reservation_id=ANY($1::text[]))",[ids]);
   await pool.query('DELETE FROM payments WHERE reservation_id=ANY($1::text[])',[ids]);
   await pool.query('DELETE FROM billing_operations WHERE owner_id=ANY($1::text[])',[ids]);
   await pool.query('DELETE FROM sales_invoices WHERE reserva_id=ANY($1::text[])',[ids]);
   await pool.query('DELETE FROM folio_movements WHERE folio_id IN(SELECT id FROM folios WHERE entity_id=ANY($1::text[]))',[ids]);
   await pool.query('DELETE FROM folios WHERE entity_id=ANY($1::text[])',[ids]);
   await pool.query('DELETE FROM group_reservation_links WHERE group_id=$1',[group]);
   await pool.query('DELETE FROM reservation_changelog WHERE reservation_id=ANY($1::text[])',[ids]);
   await pool.query('DELETE FROM reservations WHERE id=ANY($1::text[])',[ids]);await pool.query('DELETE FROM groups WHERE id=$1',[group]);
  }await pool?.end();
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
 it('blocks individual billing if the group already documents that room',async()=>{
  const f=await fixture();const issued=await request('/api/billing/invoices',f.invoice);expect(issued.status).toBe(201);
  await pool.query('UPDATE sales_invoices SET group_id=$2,reserva_id=NULL,source_charge_amounts=$3 WHERE id=$1',[issued.body.id,f.group,JSON.stringify({[`reservation:${f.ids[0]}:accommodation`]:121})]);
  const next={...f.invoice,creditOperationId:randomUUID(),prefacturaRecovery:{...f.invoice.prefacturaRecovery,payments:[{...f.payment,paymentRequestId:randomUUID()}]}};
  const blocked=await request('/api/billing/invoices',next);expect(blocked.status,JSON.stringify(blocked.body)).toBe(409);
  expect(blocked.body.error).toMatch(/facturados desde el grupo/);
  await pool.query('UPDATE sales_invoices SET group_id=NULL,reserva_id=$2 WHERE id=$1',[issued.body.id,f.ids[0]]);
 });

});
