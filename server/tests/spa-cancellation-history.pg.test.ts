import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
const enabled = !!process.env.DATABASE_URL;
const suite = enabled ? describe : describe.skip;
const pool = enabled ? new pg.Pool({connectionString:process.env.DATABASE_URL}) : null;
const prefix = `spa-history-${randomUUID()}`;
let base = '', server: http.Server;
let role = 'admin';
const ids: string[] = [];
async function request(method: string, path: string, body?: object) {
 return fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body ? JSON.stringify(body):undefined});
}
async function fixture(legacy = false) {
 const id = `${prefix}-${ids.length}`; ids.push(id);
 await pool!.query("INSERT INTO spa_appointments(id,cabin_id,treatment_id,guest_name,appointment_date,start_time,end_time,status,created_at) VALUES($1,'test','test','PRUEBA','2026-10-05','10:00','11:00','confirmed',now())",[id]);
 await pool!.query("INSERT INTO spa_accounts(id,appointment_id,guest_name,status,opened_at) VALUES($1,$1,'PRUEBA','open',now())",[id]);
 await pool!.query("INSERT INTO spa_payments(id,account_id,amount,method,created_at) VALUES($1,$1,100,'cash',now())",[id]);
 await pool!.query("INSERT INTO cash_shifts(id,area,shift_number,status,opened_at) VALUES($1,'spa',1,'open',now()-interval '1 hour')",[id]);
 await pool!.query("INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,payment_id) VALUES($1,$1,'spa','spa_account',$1,'cash',100,'income',$2)",[id,legacy?null:id]);
 await pool!.query("INSERT INTO folios(id,codigo,entity_type,entity_id,status) VALUES($1,$2,'spa_account',$1,'open')",[id,id]);
 await pool!.query("INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id) VALUES($1,$1,'payment',100,'Pago de prueba','spa_payment',$1)",[id]);
 return id;
}
suite('SPA: conservación de turnos, pagos y anulaciones en caja',()=>{
 beforeAll(async()=>{
  if(process.env.NODE_ENV==='production') throw new Error('Solo pruebas');
  const {registerRoutes}=await import('../routes');
  const {loadRolePermissionsCache}=await import('../permissions'); await loadRolePermissionsCache();
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:prefix,username:prefix,role} as any;req.isAuthenticated=()=>true;next();});
  server=http.createServer(app);await registerRoutes(server,app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 afterAll(async()=>{
  if(server) await new Promise<void>(r=>server.close(()=>r()));
  await pool!.query('DROP TRIGGER IF EXISTS spa_history_fail_audit ON audit_logs');
  await pool!.query('DROP FUNCTION IF EXISTS spa_history_fail_audit()');
  for(const id of ids){
   await pool!.query('DELETE FROM folio_movements WHERE folio_id=$1',[id]);await pool!.query('DELETE FROM folios WHERE id=$1',[id]);
   await pool!.query('DELETE FROM cash_movements WHERE shift_id=$1',[id]);await pool!.query('DELETE FROM cash_shifts WHERE id=$1',[id]);
   await pool!.query('DELETE FROM spa_payments WHERE account_id=$1',[id]);await pool!.query('DELETE FROM spa_accounts WHERE id=$1',[id]);await pool!.query('DELETE FROM spa_appointments WHERE id=$1',[id]);
  }
  await pool!.query('DELETE FROM audit_logs WHERE user_id=$1',[prefix]);await pool!.end();const {pool:appPool}=await import('../db');await appPool.end();
 });
 it('bloquea borrado definitivo de turnos y pagos',async()=>{
  const id=await fixture();
  expect((await request('DELETE',`/api/spa/appointments/${id}`)).status).toBe(409);
  expect((await request('DELETE',`/api/spa/payments/${id}`)).status).toBe(409);
  expect((await pool!.query('SELECT id FROM spa_appointments WHERE id=$1',[id])).rows).toHaveLength(1);
  expect((await pool!.query('SELECT id FROM spa_payments WHERE id=$1',[id])).rows).toHaveLength(1);
 });
 it('exige motivo y conserva turno, cobro y auditoría visible en su caja',async()=>{
  const id=await fixture();
  expect((await request('PATCH',`/api/spa/appointments/${id}`,{status:'cancelled'})).status).toBe(400);
  expect((await request('PATCH',`/api/spa/appointments/${id}`,{status:'cancelled',motivoAnulacion:'El huésped canceló'})).status).toBe(200);
  expect((await pool!.query('SELECT status FROM spa_appointments WHERE id=$1',[id])).rows[0].status).toBe('cancelled');
  expect((await pool!.query('SELECT status FROM spa_payments WHERE id=$1',[id])).rows[0].status).toBe('active');
  expect((await pool!.query('SELECT anulado FROM cash_movements WHERE id=$1',[id])).rows[0].anulado).toBe(false);
  const history=await (await request('GET',`/api/spa/appointments/cancellations/in-shift?shiftId=${id}`)).json();
  expect(history.some((r:any)=>r.entity_id===id && JSON.parse(r.details).reason==='El huésped canceló')).toBe(true);
 });
 it.each([false,true])('anula pago y caja, conserva filas y revierte folio (histórico=%s)',async legacy=>{
  const id=await fixture(legacy);
  expect((await request('PATCH',`/api/spa/payments/${id}/anular`,{motivoAnulacion:'Cobro duplicado'})).status).toBe(200);
  expect((await pool!.query('SELECT status FROM spa_payments WHERE id=$1',[id])).rows[0].status).toBe('anulado');
  expect((await pool!.query('SELECT anulado,motivo_anulacion,payment_id FROM cash_movements WHERE id=$1',[id])).rows[0]).toMatchObject({anulado:true,motivo_anulacion:'Cobro duplicado',payment_id:id});
  expect((await pool!.query("SELECT amount::text FROM folio_movements WHERE folio_id=$1 AND type='void'",[id])).rows[0].amount).toBe('-100.00');
  expect((await pool!.query('SELECT total_payments::text FROM folios WHERE id=$1',[id])).rows[0].total_payments).toBe('0.00');
  expect((await request('PATCH',`/api/spa/payments/${id}/anular`,{motivoAnulacion:'Reintento'})).status).toBe(400);
 });
 it('rechaza una caja cerrada sin modificar el pago',async()=>{
  const id=await fixture();await pool!.query("UPDATE cash_shifts SET status='closed',closed_at=now() WHERE id=$1",[id]);
  expect((await request('PATCH',`/api/spa/payments/${id}/anular`,{motivoAnulacion:'Prueba'})).status).toBe(403);
  expect((await pool!.query('SELECT status FROM spa_payments WHERE id=$1',[id])).rows[0].status).toBe('active');
 });
 it('deshace pago, caja y folio si falla la auditoría',async()=>{
  const id=await fixture();
  await pool!.query(`CREATE FUNCTION spa_history_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id = '${id}' THEN RAISE EXCEPTION 'Falla simulada de auditoría'; END IF; RETURN NEW; END $$`);
  await pool!.query('CREATE TRIGGER spa_history_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION spa_history_fail_audit()');
  expect((await request('PATCH',`/api/spa/appointments/${id}`,{status:'cancelled',motivoAnulacion:'Prueba rollback'})).status).toBe(500);
  expect((await pool!.query('SELECT status FROM spa_appointments WHERE id=$1',[id])).rows[0].status).toBe('confirmed');
  expect((await request('PATCH',`/api/spa/payments/${id}/anular`,{motivoAnulacion:'Prueba rollback'})).status).toBe(500);
  expect((await pool!.query('SELECT status FROM spa_payments WHERE id=$1',[id])).rows[0].status).toBe('active');
  expect((await pool!.query('SELECT anulado FROM cash_movements WHERE id=$1',[id])).rows[0].anulado).toBe(false);
  expect((await pool!.query("SELECT id FROM folio_movements WHERE folio_id=$1 AND type='void'",[id])).rows).toHaveLength(0);
  await pool!.query('DROP TRIGGER spa_history_fail_audit ON audit_logs');await pool!.query('DROP FUNCTION spa_history_fail_audit()');
 });
 it('vincula un cobro nuevo a su caja y su folio antes de responder',async()=>{
  const id=await fixture();
  const response=await request('POST',`/api/spa/accounts/${id}/payments`,{amount:'50.00',method:'cash'});
  expect(response.status).toBe(201);const payment=await response.json();
  expect((await pool!.query("SELECT id FROM cash_movements WHERE payment_id=$1 AND area='spa'",[payment.id])).rows).toHaveLength(1);
  expect((await pool!.query("SELECT id FROM folio_movements WHERE source_type='spa_payment' AND source_id=$1",[payment.id])).rows).toHaveLength(1);
 });
 it('deshace un cobro nuevo si falla el registro en caja',async()=>{
  const id=await fixture();const {storage}=await import('../db-storage');
  const fault=vi.spyOn(storage,'registerCashMovement').mockRejectedValueOnce(new Error('Caja no disponible'));
  try {expect((await request('POST',`/api/spa/accounts/${id}/payments`,{amount:'50.00',method:'cash'})).status).toBe(500);}finally{fault.mockRestore();}
  expect((await pool!.query('SELECT id FROM spa_payments WHERE account_id=$1',[id])).rows).toHaveLength(1);
 });
 it('anular desde caja también anula el pago SPA y revierte el folio',async()=>{
  const id=await fixture();
  expect((await request('PATCH',`/api/cash/movements/${id}/anular`,{motivoAnulacion:'Anulación desde caja'})).status).toBe(200);
  expect((await pool!.query('SELECT status FROM spa_payments WHERE id=$1',[id])).rows[0].status).toBe('anulado');
  expect((await pool!.query('SELECT anulado FROM cash_movements WHERE id=$1',[id])).rows[0].anulado).toBe(true);
 });
 it('no adivina cuál es un cobro histórico ambiguo',async()=>{
  const id=await fixture(true);
  await pool!.query("INSERT INTO spa_payments(id,account_id,amount,method,created_at) VALUES($1,$2,100,'cash',now())",[id+'-duplicate',id]);
  expect((await request('PATCH',`/api/spa/payments/${id}/anular`,{motivoAnulacion:'Prueba'})).status).toBe(409);
  expect((await pool!.query('SELECT anulado FROM cash_movements WHERE id=$1',[id])).rows[0].anulado).toBe(false);
 });
 it('bloquea la limpieza masiva antes de borrar cualquier dato y muestra cancelaciones de hoy',async()=>{
  const id=await fixture();
  expect((await request('POST','/api/admin/clean-data',{})).status).toBe(409);
  expect((await pool!.query('SELECT id FROM spa_appointments WHERE id=$1',[id])).rows).toHaveLength(1);
  expect((await request('PATCH',`/api/spa/appointments/${id}`,{status:'cancelled',motivoAnulacion:'Prueba registro de hoy'})).status).toBe(200);
  const history=await (await request('GET','/api/spa/appointments/cancellations/in-shift?today=true')).json();
  expect(history.some((r:any)=>r.entity_id===id)).toBe(true);
 });
 it('excluye los cobros anulados del ingreso diario de SPA',async()=>{
  const id=await fixture();
  const now=new Date();const period=`${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
  const path=`/api/reports/ingresos?periodo=${encodeURIComponent(period)}`;
  const beforeResponse=await request('GET',path);expect(beforeResponse.status).toBe(200);
  const before=await beforeResponse.json();const beforeTotal=before.porDia.reduce((sum:number,r:any)=>sum+r.spa,0);
  expect((await request('PATCH',`/api/spa/payments/${id}/anular`,{motivoAnulacion:'Prueba reporte'})).status).toBe(200);
  const after=await (await request('GET',path)).json();
  expect(after.porDia.reduce((sum:number,r:any)=>sum+r.spa,0)).toBe(beforeTotal-100);
 });
 it('rechaza usuarios sin permiso de escritura',async()=>{
  const id=await fixture();role='mozo';
  try {expect((await request('DELETE',`/api/spa/appointments/${id}`)).status).toBe(403);expect((await request('PATCH',`/api/spa/appointments/${id}`,{status:'cancelled',motivoAnulacion:'Prueba'})).status).toBe(403);}finally{role='admin';}
 });
});
