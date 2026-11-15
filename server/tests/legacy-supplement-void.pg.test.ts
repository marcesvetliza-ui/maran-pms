import express from 'express';
import type {Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest';

vi.mock('../auth',()=>({
  requireAuth:(req:any,res:any,next:()=>void)=>{if(req.headers['x-test-auth']==='false')return res.status(401).json({error:'No autenticado'});req.user={id:'supplement-void-test',username:'Synthetic reception',role:req.headers['x-test-role']||'reception'};next();},
  requireRole:(roles:string[])=>(req:any,res:any,next:()=>void)=>roles.includes(req.user?.role)?next():res.status(403).json({error:'No autorizado'}),
  requirePermission:()=> (_req:any,_res:any,next:()=>void)=>next(),
}));
const url=process.env.DATABASE_URL;
const enabled=!!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS==='true';
if(enabled && (!['localhost','127.0.0.1'].includes(new URL(url!).hostname)||!/test/i.test(new URL(url!).pathname)))throw Error('Disposable local test database required');
const pool=enabled?new pg.Pool({connectionString:url}):null;
let server:Server,base:string;
type Fixture={id:string;charge:string;folio:string;movement:string;invoice:number;kind:'early_checkin'|'late_checkout';label:string;field:string};
async function fixture(kind:Fixture['kind']='early_checkin',mode:'none'|'room'|'linked'='none'):Promise<Fixture>{
  const id='supplement-'+randomUUID(),charge=id+'-extra',folio=id+'-folio',movement=id+'-movement';
  const field=kind==='early_checkin'?'early_check_in':'late_check_out',label=kind==='early_checkin'?'Early Check-in':'Late Check-out';
  await pool!.query("INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Synthetic suite')",[id]);
  await pool!.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1::text,$1::text,$1::text,'occupied')",[id]);
  await pool!.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Synthetic','Supplement')",[id]);
  await pool!.query(`INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,status,total_room_amount,base_rate_per_night,final_rate_per_night,${field},${field}_charge,created_at)
    VALUES($1::text,$1::text,$1::text,$1::text,$1::text,CURRENT_DATE-1,CURRENT_DATE,1,'checked_in',259000,259000,259000,true,118000,NOW())`,[id]);
  await pool!.query("INSERT INTO charges(id,reservation_id,description,amount,date,category) VALUES($1,$2,$3,118000,CURRENT_DATE-7,'otros')",[charge,id,label]);
  await pool!.query("INSERT INTO folios(id,codigo,entity_type,entity_id,status,total_charges,total_payments,balance) VALUES($1::text,$1::text,'reservation',$2,'open',377000,259000,118000)",[folio,id]);
  await pool!.query("INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id) VALUES($1,$2,'charge',259000,'Alojamiento','room',$3)",[id+'-lodging',folio,id]);
  if(mode!=='none')await pool!.query("INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id) VALUES($1,$2,'charge',118000,$3,$4,$5)",[movement,folio,label,mode==='room'?'room':kind,mode==='room'?id:charge]);
  const invoice=(await pool!.query(`INSERT INTO sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,cliente_condicion_iva,monto_neto,monto_total,estado,modo_ficticio,reserva_id,source_charge_ids,source_charge_amounts,items)
    VALUES('FB',9998,(SELECT coalesce(max(numero),0)+1 FROM sales_invoices WHERE tipo_comprobante='FB' AND punto_venta=9998),CURRENT_DATE,'Synthetic lodging','Consumidor Final',259000,259000,'emitida',true,$1,'["accommodation"]','{"accommodation":259000}','[]') RETURNING id`,[id])).rows[0].id;
  await pool!.query("INSERT INTO payments(id,reservation_id,amount,method,date,status,invoice_ref) VALUES($1::text,$1::text,259000,'transferencia',CURRENT_DATE,'active',$2)",[id,JSON.stringify({id:invoice})]);
  await pool!.query("INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id) VALUES($1,$2,'payment',259000,'Cobro conservado','payment',$3)",[id+'-paid',folio,id]);
  return {id,charge,folio,movement,invoice,kind,label,field};
}
async function facts(f:Fixture){
  return {
    charge:(await pool!.query('SELECT * FROM charges WHERE id=$1',[f.charge])).rows[0],
    reservation:(await pool!.query('SELECT * FROM reservations WHERE id=$1',[f.id])).rows[0],
    payments:(await pool!.query('SELECT * FROM payments WHERE reservation_id=$1 ORDER BY id',[f.id])).rows,
    invoices:(await pool!.query('SELECT * FROM sales_invoices WHERE reserva_id=$1 ORDER BY id',[f.id])).rows,
    cash:(await pool!.query('SELECT * FROM cash_movements WHERE source_id=$1 OR payment_id=$1',[f.id])).rows,
    folio:(await pool!.query('SELECT * FROM folios WHERE id=$1',[f.folio])).rows[0],
    movements:(await pool!.query('SELECT * FROM folio_movements WHERE folio_id=$1 ORDER BY id',[f.folio])).rows,
    audit:(await pool!.query('SELECT * FROM audit_logs WHERE entity_id=$1 ORDER BY id',[f.charge])).rows,
  };
}
async function cancel(f:Fixture,extra:Record<string,unknown>={},role='reception'){
  const r=await fetch(`${base}/api/charges/${f.charge}/anular`,{method:'PATCH',headers:{'Content-Type':'application/json','x-test-role':role},body:JSON.stringify({motivoAnulacion:'Cargo cargado por error',expectedDescription:f.label,expectedAmount:'118000.00',...extra})});
  return {status:r.status,body:await r.json()};
}
async function clean(f:Fixture){
  await pool!.query('DELETE FROM audit_logs WHERE entity_id=$1',[f.charge]);
  await pool!.query('DELETE FROM folio_movements WHERE folio_id=$1',[f.folio]);await pool!.query('DELETE FROM folios WHERE id=$1',[f.folio]);
  for(const [table,key]of [['sales_invoices','reserva_id'],['payments','reservation_id'],['charges','reservation_id'],['reservations','id'],['rooms','id'],['guests','id'],['room_types','id']])await pool!.query(`DELETE FROM ${table} WHERE ${key}=$1`,[f.id]);
}
describe.skipIf(!enabled)('anulación segura de recargos históricos desde el botón del folio',()=>{
  beforeAll(async()=>{const {registerReservationsRoutes}=await import('../routes/reservations');const app=express();app.use(express.json());registerReservationsRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${(server.address() as any).port}`;},60000);
  afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await pool?.end();const {pool:applicationPool}=await import('../db');await applicationPool.end();});
  it.each([['early_checkin','none'],['early_checkin','room'],['late_checkout','none'],['late_checkout','room']] as const)('anula %s con origen %s, conserva factura/cobro y registra una sola reversión',async(kind,mode)=>{
    const f=await fixture(kind,mode);try{
      const before=await facts(f);const response=await cancel(f);expect(response.status,JSON.stringify(response.body)).toBe(200);
      const after=await facts(f);expect(after.charge).toMatchObject({status:'anulado',motivo_anulacion:'Cargo cargado por error'});
      expect(after.payments).toEqual(before.payments);expect(after.invoices).toEqual(before.invoices);expect(after.cash).toEqual(before.cash);expect(after.reservation).toEqual(before.reservation);
      expect(after.folio.balance).toBe('0.00');expect(after.audit).toHaveLength(1);
      expect(after.movements.filter(m=>m.source_type==='manual_charge_void')).toEqual([expect.objectContaining({amount:'-118000.00',source_id:f.charge})]);
      expect(after.movements.filter(m=>m.source_type===kind)).toHaveLength(1);
      const again=await cancel(f);expect([400,409]).toContain(again.status);expect(await facts(f)).toEqual(after);
    }finally{await clean(f);}
  });
  it('rechaza un cargo que cambió desde la confirmación aunque tenga origen vinculado',async()=>{
    const f=await fixture('early_checkin','linked');try{
      await pool!.query('UPDATE charges SET amount=130000 WHERE id=$1',[f.charge]);await pool!.query('UPDATE folio_movements SET amount=130000 WHERE id=$1',[f.movement]);
      const before=await facts(f);const result=await cancel(f);expect(result.status).toBe(409);expect(result.body.error).toContain('cambió');expect(await facts(f)).toEqual(before);
    }finally{await clean(f);}
  });
  it.each(['billed','duplicate','unknown','closed','role'] as const)('conserva el bloqueo %s sin modificar datos',async kind=>{
    const f=await fixture();try{
      if(kind==='billed')await pool!.query('UPDATE sales_invoices SET source_charge_ids=$2,source_charge_amounts=$3 WHERE id=$1',[f.invoice,JSON.stringify(['accommodation',f.charge]),JSON.stringify({accommodation:259000,[f.charge]:118000})]);
      if(kind==='duplicate')await pool!.query('INSERT INTO charges(id,reservation_id,description,amount,date,category) SELECT $2,reservation_id,description,amount,date,category FROM charges WHERE id=$1',[f.charge,f.charge+'-duplicate']);
      if(kind==='unknown'){await pool!.query("UPDATE charges SET description='Cargo sin origen verificable' WHERE id=$1",[f.charge]);f.label='Cargo sin origen verificable';}
      if(kind==='closed')await pool!.query("UPDATE folios SET status='closed' WHERE id=$1",[f.folio]);
      const before=await facts(f);expect((await cancel(f,{},kind==='role'?'jefe_recepcion':'reception')).status).toBe(['closed','role'].includes(kind)?403:409);expect(await facts(f)).toEqual(before);
    }finally{await clean(f);}
  });
  it('revierte el enlace y la anulación si no puede guardar la auditoría',async()=>{
    const f=await fixture(),trigger='supplement_fail_'+randomUUID().replaceAll('-','');
    try{
      await pool!.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${f.charge}' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$`);
      await pool!.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
      const before=await facts(f);expect((await cancel(f)).status).toBe(500);expect(await facts(f)).toEqual(before);
    }finally{await pool!.query(`DROP TRIGGER IF EXISTS ${trigger} ON audit_logs`);await pool!.query(`DROP FUNCTION IF EXISTS ${trigger}()`);await clean(f);}
  });
});
