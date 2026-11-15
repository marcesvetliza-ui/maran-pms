import {randomUUID} from 'node:crypto';
import express from 'express';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
vi.mock('../billing/billingConfig',async original=>({...await original<any>(),getBillingConfig:async()=>({arcaAmbiente:'ficticio',puntoVenta:5})}));
const suite=process.env.CI==='true'&&/(127\.0\.0\.1|localhost):5432\/maran_test$/.test(process.env.DATABASE_URL||'')?describe:describe.skip;
let pool:any,server:any,url:string;const ids:number[]=[];const point=70000+Math.floor(Math.random()*20000),shift=randomUUID();
const items=[{descripcion:'Synthetic SPA treatment',cantidad:1,precioUnitario:65000,alicuotaIva:'21',subtotalNeto:65000/1.21,subtotal:65000}];
async function draft(){
 const invoice=await(await import('../billing/invoiceService')).emitirFactura({tipoComprobante:'ticket',puntoVentaOverride:point,cliente:{razonSocial:'Synthetic SPA buyer',condicionIva:'Consumidor Final'},items:items as any,cashFormaPago:'efectivo'});
 ids.push(Number(invoice.id));
 // Match historical homologation receipts, whose draft retains pendiente.
 await pool.query("UPDATE sales_invoices SET reconciliation_status='pendiente' WHERE id=$1",[invoice.id]);
 return Number(invoice.id);
}
async function settle(id:number){return(await import('../billing/spaReceiptSettlement')).settleStandaloneSpaCashReceipt(id,'Synthetic SPA operator','spa-settlement-test');}
async function cash(id:number,change:Record<string,any>={}){
 const body={id:randomUUID(),area:'spa',method:'efectivo',amount:65000,type:'income',annulled:false,...change};
 await pool.query("INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,source_label,payment_method,amount,movement_type,anulado) VALUES($1,$2,$3,'comprobante',$4,'Synthetic preexisting receipt',$5,$6,$7,$8)",[body.id,shift,body.area,String(id),body.method,body.amount,body.type,body.annulled]);
}
suite('SPA cash receipt reconciliation',()=>{
 beforeAll(async()=>{
  ({pool}=await import('../db'));
  await pool.query("INSERT INTO cash_shifts(id,area,status,shift_number,opened_at) VALUES($1,'spa','open',999990,now())",[shift]);
  await(await import('../permissions')).loadRolePermissionsCache();
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:'spa-settlement-test',username:'Synthetic SPA operator',role:'admin'} as any;req.isAuthenticated=()=>true;next();});
  (await import('../billing/routes')).registerBillingRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));url=`http://127.0.0.1:${server.address().port}`;
 });
 afterAll(async()=>{
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  await pool.query("DELETE FROM audit_logs WHERE entity_type='sales_invoice' AND entity_id=ANY($1::text[])",[ids.map(String)]);
  await pool.query("DELETE FROM cash_movements WHERE source_type='comprobante' AND source_id=ANY($1::text[])",[ids.map(String)]);
  await pool.query('DELETE FROM sales_invoices WHERE id=ANY($1::integer[])',[ids]);await pool.query('DELETE FROM invoice_counters WHERE punto_venta=$1',[point]);
  await pool.query('DELETE FROM cash_shifts WHERE id=$1',[shift]);await pool.end();
 });
 it.each(['ticket','cierre_spa'])('finishes %s through the actual billing route with exactly one receipt and no pending warning',async type=>{
  const response=await fetch(url+'/api/billing/invoices',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tipoComprobante:type,puntoVentaOverride:point,cliente:{razonSocial:'Synthetic SPA buyer',condicionIva:'Consumidor Final'},items,cashArea:'spa',cashFormaPago:'efectivo'})});
  const body=await response.json();if(body.id)ids.push(Number(body.id));expect(response.status,JSON.stringify(body)).toBe(201);expect(body.reconciliationStatus).toBe('conciliada');
  const invoice=(await pool.query('SELECT * FROM sales_invoices WHERE id=$1',[body.id])).rows[0];expect(invoice).toMatchObject({reconciliation_status:'conciliada',reconciliation_error:null,estado:'emitida',monto_total:'65000.00'});
  const money=(await pool.query("SELECT area,payment_method,amount,movement_type FROM cash_movements WHERE source_type='comprobante' AND source_id=$1",[String(body.id)])).rows;expect(money).toEqual([{area:'spa',payment_method:'efectivo',amount:'65000.00',movement_type:'income'}]);
  const listing=await(await fetch(url+'/api/billing/invoices?tipo='+type)).json();expect(listing.find((invoice:any)=>invoice.id===body.id).reconciliation_status).toBe('conciliada');
 });
 it('reconciles a historical cash receipt without changing cash or fiscal fields and supports concurrent retries',async()=>{
  const id=await draft();await cash(id);
  const beforeInvoice=(await pool.query('SELECT * FROM sales_invoices WHERE id=$1',[id])).rows[0];
  const before=(await pool.query("SELECT * FROM cash_movements WHERE source_id=$1",[String(id)])).rows;
  await Promise.all([settle(id),settle(id)]);
  expect((await pool.query("SELECT * FROM cash_movements WHERE source_id=$1",[String(id)])).rows).toEqual(before);
  const after=(await pool.query('SELECT * FROM sales_invoices WHERE id=$1',[id])).rows[0];
  for(const key of Object.keys(beforeInvoice).filter(key=>!['reconciliation_status','reconciliation_error','reconciliation_updated_at'].includes(key)))expect(after[key],key).toEqual(beforeInvoice[key]);
  expect(after.reconciliation_status).toBe('conciliada');
  expect((await pool.query("SELECT id FROM audit_logs WHERE entity_id=$1 AND description='Comprobante SPA conciliado con ingreso de Caja verificado'",[String(id)])).rows).toHaveLength(1);
 });
 it('serializes concurrent first settlements so they create one cash movement',async()=>{
  const id=await draft();await Promise.all([settle(id),settle(id)]);
  expect((await pool.query("SELECT id FROM cash_movements WHERE source_type='comprobante' AND source_id=$1",[String(id)])).rows).toHaveLength(1);
 });
 it.each([{area:'reception'},{amount:64999},{method:'transferencia'},{type:'informational'},{annulled:true}])('retains pending state and adds no money when a previous receipt is not valid: %o',async change=>{
  const id=await draft();await cash(id,change);
  await expect(settle(id)).rejects.toThrow(/revisión|coinciden/);
  expect((await pool.query("SELECT id FROM cash_movements WHERE source_type='comprobante' AND source_id=$1",[String(id)])).rows).toHaveLength(1);
  expect((await pool.query('SELECT reconciliation_status FROM sales_invoices WHERE id=$1',[id])).rows[0].reconciliation_status).toBe('pendiente');
 });
 it('does not reconcile duplicated receipts',async()=>{const id=await draft();await cash(id);await cash(id);await expect(settle(id)).rejects.toThrow(/no coinciden/);});
 it('rolls back the cash and status when the final audit insert fails',async()=>{
  const id=await draft(),trigger='test_spa_receipt_'+randomUUID().replace(/-/g,'');
  try{
   await pool.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${id}' AND NEW.description='Comprobante SPA conciliado con ingreso de Caja verificado' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END; $$`);
   await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
   await expect(settle(id)).rejects.toThrow();
   expect((await pool.query("SELECT id FROM cash_movements WHERE source_type='comprobante' AND source_id=$1",[String(id)])).rows).toHaveLength(0);
   expect((await pool.query('SELECT reconciliation_status FROM sales_invoices WHERE id=$1',[id])).rows[0].reconciliation_status).toBe('pendiente');
  }finally{await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON audit_logs`);await pool.query(`DROP FUNCTION IF EXISTS ${trigger}()`);}
 });
});
