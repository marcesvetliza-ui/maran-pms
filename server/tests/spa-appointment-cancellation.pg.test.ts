import express from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { mountPaymentFunding } from '../billing/funding/integration';

const enabled = !!process.env.DATABASE_URL && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === 'true';
if (enabled) {
  const target = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || !/test/i.test(target.pathname)) throw Error('Disposable local test database required');
}
const prefix = 'spa-cancel-' + randomUUID();
const fixtures: string[] = [], servers: Server[] = [], bases: string[] = [];
let pool: pg.Pool, role = 'admin', authenticated = true;
const financialTables = ['spa_accounts', 'spa_account_items', 'spa_payments', 'cash_movements', 'folios', 'folio_movements', 'sales_invoices', 'stock_movements', 'inventory_consumption_jobs', 'spa_treatment_sales', 'gift_vouchers', 'payment_funding.scopes', 'payment_funding.receipts', 'payment_funding.documents', 'payment_funding.operations', 'payment_funding.applications', 'payment_funding.events'];
async function finances() {
  const result: Record<string, unknown> = {};
  for (const table of financialTables) result[table] = (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
  return result;
}
async function fixture(closed = false) {
  const id = prefix + '-' + fixtures.length; fixtures.push(id);
  await pool.query("INSERT INTO spa_cabins(id,name,is_active) VALUES($1::text,'Synthetic cabin','true'),($2,'Synthetic resource','true')", [id+'-c',id+'-r']);
  await pool.query("INSERT INTO spa_treatments(id,name,duration_minutes,price,is_active,is_circuit) VALUES($1::text,'Synthetic treatment',60,100,'true',true)", [id+'-t']);
  await pool.query("INSERT INTO spa_appointments(id,cabin_id,treatment_id,guest_name,appointment_date,start_time,end_time,status,created_at) VALUES($1::text,$2,$3,'Synthetic guest','2095-01-10','10:00','11:00','confirmed',now())", [id,id+'-c',id+'-t']);
  await pool.query("INSERT INTO spa_appointment_resources(id,appointment_id,cabin_id,start_time,end_time,duration_minutes) VALUES($1::text,$2,$3,'10:00','11:00',60)",[id+'-resource',id,id+'-r']);
  await pool.query("INSERT INTO spa_accounts(id,appointment_id,guest_name,status,total,total_paid,opened_at,invoice_id) VALUES($1::text,$1::text,'Synthetic guest',$2,100,100,now(),$3)", [id,closed?'closed':'open',closed?987654321:null]);
  await pool.query("INSERT INTO spa_account_items(id,account_id,description,quantity,unit_price,subtotal,created_at) VALUES($1::text,$1::text,'Synthetic treatment',1,100,100,now())",[id]);
  await pool.query("INSERT INTO spa_payments(id,account_id,amount,method,created_at) VALUES($1::text,$1::text,100,'cash',now())", [id]);
  await pool.query("INSERT INTO cash_shifts(id,area,shift_number,status,opened_at) VALUES($1::text,'spa',1,'open',now())",[id]);
  await pool.query("INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,payment_id) VALUES($1::text,$1::text,'spa','spa_account',$1::text,'cash',100,'income',$1::text)",[id]);
  await pool.query("INSERT INTO folios(id,codigo,entity_type,entity_id,status,total_charges,total_payments,balance) VALUES($1::text,$1::text,'spa_account',$1::text,$2,100,100,0)",[id,closed?'closed':'open']);
  await pool.query("INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id) VALUES($1::text,$1::text,'payment',100,'Synthetic payment','spa_payment',$1::text)",[id]);
  await pool.query("INSERT INTO payment_funding.scopes(kind,id) VALUES('spa',$1::text)",[id]);
  await pool.query("INSERT INTO payment_funding.receipts(id,scope_kind,scope_id,source_payment_id,original_cents,effective_cents,method,cash_movement_id,folio_movement_id) VALUES($1::text,'spa',$1::text,$1::text,10000,10000,'cash',$1::text,$1::text)",[id]);
  await pool.query("INSERT INTO payment_funding.documents(id,scope_kind,scope_id,original_cents,total_cents,snapshot,status) VALUES($1::text,'spa',$1::text,10000,10000,'{}','draft')",[id]);
  return id;
}
const cancel = (id: string, extra: object = {}, base = bases[0]) => fetch(base+'/api/spa/appointments/'+id, { method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'cancelled',motivoAnulacion:'  Cambio de planes  ',...extra}) });
const appointment = async (id: string) => (await pool.query('SELECT * FROM spa_appointments WHERE id=$1',[id])).rows[0];
const audit = async (id: string) => (await pool.query("SELECT * FROM audit_logs WHERE entity_id=$1 AND entity_type='spa_appointment_cancelled'",[id])).rows;

describe.skipIf(!enabled)('SPA cancellation through the real financial fence and schedule routes', () => {
  beforeAll(async () => {
    pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
    await pool.query(await readFile(new URL('../billing/funding/schema.sql',import.meta.url),'utf8'));
    await (await import('../permissions')).loadRolePermissionsCache();
    const {requireAuth} = await import('../auth');
    const {registerSpaRoutes} = await import('../routes/spa');
    for (const allSpaAccounts of [true,false]) {
      const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:prefix,username:'Synthetic operator',role} as any;req.isAuthenticated=()=>authenticated;next();});
      const forbidden=vi.fn(async()=>{throw Error('Cancellation must never call fiscal transport or financial settlement');});
      mountPaymentFunding(app,{enabled:true,pool,allSpaAccounts,authenticate:requireAuth,actor:()=>({id:prefix,permissions:[]}),fiscal:{authorize:forbidden,lookup:forbidden},firstSpaClose:forbidden});
      registerSpaRoutes(app);
      const server=app.listen(0,'127.0.0.1');servers.push(server);await new Promise<void>(resolve=>server.once('listening',resolve));bases.push('http://127.0.0.1:'+(server.address() as any).port);
    }
  });
  beforeEach(()=>{role='admin';authenticated=true;});
  afterAll(async()=>{
    for(const server of servers)await new Promise<void>(resolve=>server.close(()=>resolve()));
    if(!pool)return;
    await pool.query('DROP TRIGGER IF EXISTS spa_cancel_test_audit ON audit_logs; DROP FUNCTION IF EXISTS spa_cancel_test_audit()');
    for(const id of fixtures){
      await pool.query('DELETE FROM payment_funding.applications WHERE receipt_id=$1',[id]);
      await pool.query('DELETE FROM payment_funding.operations WHERE scope_id=$1',[id]);
      await pool.query('DELETE FROM payment_funding.documents WHERE scope_id=$1',[id]);
      await pool.query('DELETE FROM payment_funding.receipts WHERE scope_id=$1',[id]);
      await pool.query('DELETE FROM payment_funding.scopes WHERE id=$1',[id]);
      for(const [table,column] of [['folio_movements','folio_id'],['folios','id'],['cash_movements','shift_id'],['cash_shifts','id'],['spa_payments','account_id'],['spa_account_items','account_id'],['spa_accounts','id'],['spa_appointment_resources','appointment_id'],['spa_appointments','id']] as const)await pool.query(`DELETE FROM ${table} WHERE ${column}=$1`,[id]);
      await pool.query('DELETE FROM spa_treatments WHERE id=$1',[id+'-t']);await pool.query('DELETE FROM spa_cabins WHERE id IN ($1,$2)',[id+'-c',id+'-r']);
    }
    await pool.query('DELETE FROM audit_logs WHERE user_id=$1',[prefix]);await pool.end();await (await import('../db')).pool.end();
  });
  it.each([0,1])('cancels an adopted paid appointment and preserves all financial records (fence %s)',async index=>{
    const id=await fixture(),before=await finances();
    const resources=(await pool.query('SELECT * FROM spa_appointment_resources WHERE appointment_id=$1',[id])).rows;
    const response=await cancel(id,{},bases[index]);expect(response.status,await response.clone().text()).toBe(200);
    expect((await appointment(id)).status).toBe('cancelled');expect(await finances()).toEqual(before);
    expect((await pool.query('SELECT * FROM spa_appointment_resources WHERE appointment_id=$1',[id])).rows).toEqual(resources);
    const occupied=await pool.query("SELECT a.id FROM spa_appointments a LEFT JOIN spa_appointment_resources r ON r.appointment_id=a.id WHERE a.id=$1 AND a.status IN ('pending','confirmed','in_progress') AND (a.cabin_id=$2 OR r.cabin_id=$3)",[id,id+'-c',id+'-r']);expect(occupied.rows).toHaveLength(0);
    const rows=await audit(id);expect(rows).toHaveLength(1);expect(JSON.parse(rows[0].details).reason).toBe('Cambio de planes');expect(rows[0].user_id).toBe(prefix);
  });
  it('preserves the closed account, invoice reference and payment when cancelling its schedule',async()=>{
    const id=await fixture(true),before=await finances();expect((await cancel(id)).status).toBe(200);expect(await finances()).toEqual(before);
  });
  it.each(['reserved','authorizing','fiscal_unknown','authorized_pending_link'])('retains an unresolved %s operation and its held funding',async status=>{
    const id=await fixture(),operation=randomUUID();
    await pool.query("INSERT INTO payment_funding.operations(id,scope_kind,scope_id,kind,fingerprint,request,claim,status,actor_id)VALUES($1,'spa',$2,'invoice','synthetic',$3,'{}',$4,$2)",[operation,id,JSON.stringify({documentId:id}),status]);
    await pool.query("INSERT INTO payment_funding.applications(id,receipt_id,document_id,operation_id,application_key,amount_cents,original_cents,status,origin)VALUES($1,$2,$2,$3,'synthetic',10000,10000,'held','synthetic')",[randomUUID(),id,operation]);
    const before=await finances();const response=await cancel(id);expect(response.status).toBe(409);expect((await response.json()).message).toContain('operación financiera pendiente');expect((await appointment(id)).status).toBe('confirmed');expect(await audit(id)).toHaveLength(0);expect(await finances()).toEqual(before);
  });
  it('refuses mixed financial, identity and schedule changes',async()=>{
    const id=await fixture(),before=await finances();for(const extra of [{reservationId:'forged'},{payment:1},{treatmentId:'forged'},{motivoAnulacion:''}])expect((await cancel(id,extra)).status).toBe(409);expect((await appointment(id)).status).toBe('confirmed');expect(await finances()).toEqual(before);
  });
  it('requires the existing SPA write permission and session',async()=>{
    const id=await fixture();role='mozo';expect((await cancel(id)).status).toBe(403);authenticated=false;expect((await cancel(id)).status).toBe(401);expect((await appointment(id)).status).toBe('confirmed');
  });
  it.each(['spa','reception'])('allows the existing %s operator to cancel without granting financial permissions',async operatorRole=>{
    const id=await fixture(),before=await finances();role=operatorRole;
    expect((await cancel(id)).status).toBe(200);expect(await finances()).toEqual(before);
  });
  it('returns a retryable conflict if the financial owner still holds the account lock',async()=>{
    const id=await fixture(),before=await finances(),client=await pool.connect();
    try {
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['funding-scope:spa:'+id]);
      const response=await cancel(id);expect(response.status).toBe(409);expect((await response.json()).error).toContain('otra operación en curso');
      expect((await appointment(id)).status).toBe('confirmed');expect(await audit(id)).toHaveLength(0);expect(await finances()).toEqual(before);
    } finally {await client.query('ROLLBACK');client.release();}
  },10000);
  it('serializes concurrent retries and preserves the first cancellation reason',async()=>{
    const id=await fixture(),before=await finances();const responses=await Promise.all([cancel(id),cancel(id)]);expect(responses.map(r=>r.status)).toEqual([200,200]);expect((await cancel(id,{motivoAnulacion:'Do not replace the original reason'})).status).toBe(200);const rows=await audit(id);expect(rows).toHaveLength(1);expect(JSON.parse(rows[0].details).reason).toBe('Cambio de planes');expect(await finances()).toEqual(before);
  });
  it('rolls back the schedule when saving cancellation audit fails',async()=>{
    const id=await fixture(),before=await finances();
    await pool.query(`CREATE FUNCTION spa_cancel_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${id}' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER spa_cancel_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION spa_cancel_test_audit()`);
    try{expect((await cancel(id)).status).toBe(500);expect((await appointment(id)).status).toBe('confirmed');expect(await audit(id)).toHaveLength(0);expect(await finances()).toEqual(before);}finally{await pool.query('DROP TRIGGER spa_cancel_test_audit ON audit_logs; DROP FUNCTION spa_cancel_test_audit()');}
  });
});
