import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import express from 'express';
vi.mock('../billing/billingConfig',async original=>{const actual=await original<any>();return {...actual,getBillingConfig:async()=>({...await actual.getBillingConfig(),modoArca:false,arcaAmbiente:'ficticio'})};});
const allowed=process.env.CI==='true'&&/^postgres(?:ql)?:\/\/[^@]*@127\.0\.0\.1:5432\/maran_test$/.test(process.env.DATABASE_URL||'');
const suite=allowed?describe:describe.skip;
let pool:any,server:any,url:string,role='admin';const reservations:string[]=[];
async function request(path:string,body?:any){const r=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
async function fixture(dated=false){
 const source=dated?"accommodation:2026-11-01":"accommodation";
 const id='closed-correction-'+randomUUID();reservations.push(id);
 await pool.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,total_room_amount,base_rate_per_night,final_rate_per_night,status,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2026-11-01','2026-11-02',1,121,121,121,'checked_out',now())",[id,id+'guest',id+'type',id+'room']);
 const result=await request('/api/billing/invoices',{tipoComprobante:'FB',cliente:{razonSocial:'Synthetic Original',condicionIva:'Consumidor Final'},items:[{descripcion:'Alojamiento',cantidad:1,precioUnitario:121,subtotalNeto:100,subtotal:121,alicuotaIva:'21'}],reservaId:id,cashFormaPagoDetalle:[{method:'efectivo',amount:121}],sourceChargeIds:[source],sourceChargeAmounts:{[source]:121}});
 expect(result.status,JSON.stringify(result.body)).toBe(201);const invoice=Number(result.body.id),payment=id+'payment';
 await pool.query("INSERT INTO payments(id,reservation_id,amount,method,date,status,invoice_ref) VALUES($1,$2,121,'efectivo',now(),'active',$3)",[payment,id,JSON.stringify({id:invoice,tipo_comprobante:'FB',punto_venta:result.body.puntoVenta,numero:result.body.numero})]);return {id,invoice,payment,source};
}
suite('Closed reservation fiscal correction · real billing routes and disposable PostgreSQL',()=>{
 beforeAll(async()=>{
  ({pool}=await import('../db'));await(await import('../permissions')).loadRolePermissionsCache();
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:'closed-correction-test',username:'Synthetic Closed Correction',role} as any;req.isAuthenticated=()=>true;next();});
  (await import('../billing/routes')).registerBillingRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}`;
 });
 afterAll(async()=>{
  if(server)await new Promise<void>(r=>server.close(()=>r()));
  const stale=(await pool.query("SELECT id FROM reservations WHERE id LIKE 'closed-correction-%'")).rows.map((r:any)=>r.id);
  for(const id of new Set([...reservations,...stale])){
   await pool.query("DELETE FROM account_movements WHERE reservation_id=$1",[id]);
   await pool.query("DELETE FROM companies WHERE id LIKE $1",[id+'%']);
   await pool.query("DELETE FROM payments WHERE reservation_id=$1",[id]);await pool.query("DELETE FROM charges WHERE reservation_id=$1",[id]);
   await pool.query("DELETE FROM billing_operations WHERE owner_id=$1",[id]);
   await pool.query("DELETE FROM cash_movements WHERE source_id IN (SELECT id::text FROM sales_invoices WHERE reserva_id=$1)",[id]);
   await pool.query("DELETE FROM sales_invoices WHERE reserva_id=$1",[id]);await pool.query("DELETE FROM reservation_changelog WHERE reservation_id=$1",[id]);
   await pool.query("DELETE FROM folio_movements WHERE folio_id IN(SELECT id FROM folios WHERE entity_id=$1)",[id]);await pool.query("DELETE FROM folios WHERE entity_id=$1",[id]);await pool.query("DELETE FROM reservations WHERE id=$1",[id]);
  }await pool?.end();
 });
 it('credits in full, reuses the paid advance and replaces exactly once without reopening or collecting money',async()=>{
  const f=await fixture();const path=`/api/reservations/${f.id}/billing-corrections`;
  const reservation=(await pool.query('SELECT * FROM reservations WHERE id=$1',[f.id])).rows[0];
  const evidence=(await pool.query('SELECT amount,method,date,status FROM payments WHERE id=$1',[f.payment])).rows[0];
  expect((await request(`${path}/${f.invoice}/reissue`,{tipoComprobante:'FB',reason:'Correction',cliente:{razonSocial:'New',condicionIva:'Consumidor Final'}})).status).toBe(409);
  const nc=await request(`/api/billing/invoices/${f.invoice}/nota-credito`,{closedReservationCorrection:f.id,motivo:'Razón social incorrecta',items:[{sourceId:'accommodation',amount:121}]});
  expect(nc.status,JSON.stringify(nc.body)).toBeLessThan(300);
  expect((await request(path)).body.invoices.find((i:any)=>i.original.id===f.invoice).stage).toBe('reissue');
  const body={tipoComprobante:'FB',cliente:{razonSocial:'Synthetic Corrected',condicionIva:'Consumidor Final'},reason:'Corregir razón social',cashArea:'admin',cashFormaPago:'efectivo',items:[{subtotal:999999}]};
  const [first,second]=await Promise.all([request(`${path}/${f.invoice}/reissue`,body),request(`${path}/${f.invoice}/reissue`,body)]);
  expect(first.status,JSON.stringify(first.body)).toBeLessThan(300);expect(second.status,JSON.stringify(second.body)).toBeLessThan(300);expect(first.body.id).toBe(second.body.id);
  expect((await pool.query('SELECT * FROM reservations WHERE id=$1',[f.id])).rows[0]).toEqual(reservation);
  expect((await pool.query('SELECT amount,method,date,status FROM payments WHERE id=$1',[f.payment])).rows[0]).toEqual(evidence);
  expect((await pool.query("SELECT id FROM payments WHERE reservation_id=$1",[f.id])).rows).toHaveLength(1);
  expect((await pool.query("SELECT id FROM cash_movements WHERE source_id=$1 AND movement_type='income'",[String(first.body.id)])).rows).toHaveLength(0);
  const final=(await request(path)).body.invoices.find((i:any)=>i.original.id===f.invoice);expect(final.stage).toBe('completed');expect(final.nc.id).toBe(Number(nc.body.id));expect(final.replacement.id).toBe(first.body.id);
  const payment=(await pool.query('SELECT invoice_ref FROM payments WHERE id=$1',[f.payment])).rows[0];expect(JSON.parse(payment.invoice_ref).reapplications.some((a:any)=>a.invoiceId===first.body.id)).toBe(true);
  // A correction of the replacement follows the same paid advance, even though
  // its primary invoice_ref still names the first historical invoice.
  const secondNc=await request(`/api/billing/invoices/${first.body.id}/nota-credito`,{closedReservationCorrection:f.id,motivo:'Segunda corrección fiscal',items:[{sourceId:'accommodation',amount:121}]});expect(secondNc.status,JSON.stringify(secondNc.body)).toBeLessThan(300);
  const third=await request(`${path}/${first.body.id}/reissue`,{tipoComprobante:'FB',cliente:{razonSocial:'Synthetic Third Recipient',condicionIva:'Consumidor Final'},reason:'Corrección del reemplazo'});expect(third.status,JSON.stringify(third.body)).toBeLessThan(300);
  const finalRef=JSON.parse((await pool.query('SELECT invoice_ref FROM payments WHERE id=$1',[f.payment])).rows[0].invoice_ref);
  expect(finalRef.reapplications.find((a:any)=>a.invoiceId===third.body.id)?.amount).toBe(121);
  expect((await request(path)).body.invoices.find((i:any)=>i.original.id===f.invoice).stage).toBe('completed');
  expect((await pool.query('SELECT * FROM reservations WHERE id=$1',[f.id])).rows[0]).toEqual(reservation);

 });
 it('rejects partial correction and operators without the fiscal permission',async()=>{
  const f=await fixture();expect((await request('/api/billing/invoices',{correctionOriginalInvoiceId:f.invoice})).status).toBe(400);expect((await request(`/api/billing/invoices/${f.invoice}/nota-credito`,{closedReservationCorrection:f.id,motivo:'Partial invalid',items:[{sourceId:'accommodation',amount:20}]})).status).toBe(400);
  role='housekeeping';try{expect((await request(`/api/reservations/${f.id}/billing-corrections`)).status).toBe(403);expect((await request(`/api/reservations/${f.id}/billing-corrections/${f.invoice}/reissue`,{})).status).toBe(403);}finally{role='admin';}
 });
 it('supports dated nightly sources and rejects a different reservation owner',async()=>{
  const f=await fixture(true),other=await fixture();
  const path=`/api/reservations/${f.id}/billing-corrections`;
  expect((await request(`/api/reservations/${other.id}/billing-corrections/${f.invoice}/reissue`,{reason:'Wrong owner'})).status).toBe(409);
  const snapshot=await request(path);expect(snapshot.body.invoices[0].stage).toBe('credit');
  const nc=await request(`/api/billing/invoices/${f.invoice}/nota-credito`,{closedReservationCorrection:f.id,motivo:'Corregir receptor',items:[{sourceId:f.source,amount:121}]});expect(nc.status,JSON.stringify(nc.body)).toBeLessThan(300);
  const newInvoice=await request(`${path}/${f.invoice}/reissue`,{tipoComprobante:'FB',cliente:{razonSocial:'Synthetic Dated Corrected',condicionIva:'Consumidor Final'},reason:'Reemplazo nocturno'});
  expect(newInvoice.status,JSON.stringify(newInvoice.body)).toBeLessThan(300);
  expect((await pool.query('SELECT source_charge_ids,monto_total FROM sales_invoices WHERE id=$1',[newInvoice.body.id])).rows[0]).toEqual({source_charge_ids:[f.source],monto_total:'121.00'});
 });

 it.each([121,80])('credits a proven CC cargo of %s and refactures without new payments',async(debt)=>{
  const f=await fixture(),old=f.id+'company',target=f.id+'target';
  await pool.query("INSERT INTO companies(id,razon_social,cuil_cuit) VALUES($1,'Original CC','30700000001'),($2,'Nueva CC','30700000002')",[old,target]);
  await pool.query("UPDATE payments SET method='cuenta_corriente',amount=$2 WHERE id=$1",[f.payment,debt]);
  if(debt<121)await pool.query("INSERT INTO payments(id,reservation_id,amount,method,date,status,invoice_ref) SELECT id||'-cash',reservation_id,$2,'efectivo',date,status,invoice_ref FROM payments WHERE id=$1",[f.payment,121-debt]);
  await pool.query("UPDATE sales_invoices SET cash_forma_pago='cuenta_corriente',cash_forma_pago_detalle=$2 WHERE id=$1",[f.invoice,JSON.stringify([{method:'cuenta_corriente',amount:debt},...(debt<121?[{method:'efectivo',amount:121-debt}]:[])])]);
  const inv=(await pool.query('SELECT * FROM sales_invoices WHERE id=$1',[f.invoice])).rows[0];
  const missing=await request(`/api/billing/invoices/${f.invoice}/nota-credito`,{closedReservationCorrection:f.id,motivo:'Sin cargo probado',items:[{sourceId:f.source,amount:121}]});
  expect(missing.status).toBe(409);
  expect(Number((await pool.query('SELECT count(*) total FROM sales_invoices WHERE nota_credito_id=$1',[f.invoice])).rows[0].total)).toBe(0);
  await pool.query("INSERT INTO account_movements(entity_type,entity_id,date,type,description,amount,reservation_id,reference,area) VALUES('company',$1,CURRENT_DATE,'cargo','Original CC',$4,$2,$3,'recepcion')",[old,f.id,`${inv.tipo_comprobante}-${String(inv.numero).padStart(8,'0')}`,debt]);
  const payments=(await pool.query('SELECT * FROM payments WHERE reservation_id=$1',[f.id])).rows;
  const reservation=(await pool.query('SELECT * FROM reservations WHERE id=$1',[f.id])).rows[0];
  const path=`/api/reservations/${f.id}/billing-corrections`;
  expect((await request(path)).body.invoices[0].blocked).toBeNull();
  expect((await request(path)).body.invoices[0].account.entityId).toBe(old);
  const nc=await request(`/api/billing/invoices/${f.invoice}/nota-credito`,{closedReservationCorrection:f.id,motivo:'Cambiar empresa facturada',items:[{sourceId:f.source,amount:121}]});
  expect(nc.status,JSON.stringify(nc.body)).toBeLessThan(300);
  expect(Number((await pool.query('SELECT sum(amount) total FROM account_movements WHERE entity_id=$1',[old])).rows[0].total)).toBe(0);
  const input={tipoComprobante:'FB',cliente:{razonSocial:'Nueva CC',cuit:'30700000002',condicionIva:'Exento'},reason:'Refacturación CC',accountTarget:{entityType:'company',entityId:target},confirmAccountTarget:true};
  expect((await request(`${path}/${f.invoice}/reissue`,{...input,confirmAccountTarget:false})).status).toBe(400);
  expect((await request(`${path}/${f.invoice}/reissue`,{...input,cliente:{...input.cliente,cuit:'30700000001'}})).status).toBe(400);
  const first=await request(`${path}/${f.invoice}/reissue`,input);
  expect(first.status,JSON.stringify(first.body)).toBeLessThan(300);
  // Simulate a lost response after committing the debit but before marking settlement complete.
  await pool.query("UPDATE sales_invoices SET credit_reapplication_intent=jsonb_set(credit_reapplication_intent,'{settlement,status}','\"pending\"') WHERE id=$1",[first.body.id]);
  const retry=await request(`${path}/${f.invoice}/reissue`,input);expect(retry.body.id).toBe(first.body.id);
  const finalPayments=(await pool.query('SELECT * FROM payments WHERE reservation_id=$1',[f.id])).rows;
  const financial=(rows:any[])=>rows.map(({invoice_ref,...row})=>row).sort((a,b)=>a.id.localeCompare(b.id));
  expect(financial(finalPayments)).toEqual(financial(payments));
  expect(finalPayments.find((p:any)=>p.method==='cuenta_corriente').invoice_ref).toBe(payments.find((p:any)=>p.method==='cuenta_corriente').invoice_ref);
  if(debt<121)expect(JSON.parse(finalPayments.find((p:any)=>p.method==='efectivo').invoice_ref).reapplications).toContainEqual(expect.objectContaining({invoiceId:first.body.id,amount:121-debt}));
  expect((await pool.query('SELECT * FROM reservations WHERE id=$1',[f.id])).rows[0]).toEqual(reservation);
  expect((await pool.query("SELECT amount FROM account_movements WHERE entity_id=$1 AND type='cargo'",[target])).rows).toEqual([{amount:debt.toFixed(2)}]);
  expect((await pool.query("SELECT id FROM cash_movements WHERE source_id=$1 AND movement_type='income'",[String(first.body.id)])).rows).toHaveLength(0);
 });

});
