import express from 'express';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
const suite=process.env.DATABASE_URL ? describe : describe.skip;
const pool=process.env.DATABASE_URL ? new pg.Pool({connectionString:process.env.DATABASE_URL}):null;
const prefix=`reservation-history-${randomUUID()}`;
const ids:string[]=[];let base='',server:http.Server,role='reception';
let storage: typeof import('../db-storage').storage;
async function request(method:string,path:string,body?:object){return fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
function data(index:number){return {reservationCode:`${prefix}-${index}`,guestId:prefix,roomTypeId:prefix,roomId:prefix,checkInDate:`2027-01-${String(index*3+1).padStart(2,'0')}`,checkOutDate:`2027-01-${String(index*3+3).padStart(2,'0')}`,nights:2,status:'pending',numberOfGuests:1,finalRatePerNight:'100.00',totalRoomAmount:'200.00'};}
async function created(index:number){const response=await request('POST','/api/reservations',data(index));expect(response.status).toBe(201);const r=await response.json();ids.push(r.id);return r;}
suite('Reservas: historial durable y visibilidad en planning',()=>{
 beforeAll(async()=>{
  if(process.env.NODE_ENV==='production')throw new Error('Solo pruebas');
  await pool!.query("INSERT INTO room_types(id,code,name) VALUES($1,$2,'Habitación de prueba')",[prefix,prefix]);
  await pool!.query("INSERT INTO rooms(id,room_number,room_type_id,status) VALUES($1,$2,$1,'available')",[prefix,prefix]);
  await pool!.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Huésped','Prueba')",[prefix]);
  ({storage}=await import('../db-storage'));const {registerRoutes}=await import('../routes');const {loadRolePermissionsCache}=await import('../permissions');await loadRolePermissionsCache();
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:prefix,username:'Operador prueba',role} as any;req.isAuthenticated=()=>true;next();});
  server=http.createServer(app);await registerRoutes(server,app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 afterAll(async()=>{
  if(server)await new Promise<void>(r=>server.close(()=>r()));
  await pool!.query('DROP TRIGGER IF EXISTS reservation_history_audit_fail ON audit_logs');await pool!.query('DROP FUNCTION IF EXISTS reservation_history_audit_fail()');
  const all=await pool!.query('SELECT id FROM reservations WHERE reservation_code LIKE $1',[prefix+'%']);
  for(const row of all.rows){await pool!.query('DELETE FROM reservation_changelog WHERE reservation_id=$1',[row.id]);await pool!.query('DELETE FROM cancelled_reservation_logs WHERE reservation_id=$1',[row.id]);await pool!.query('DELETE FROM charges WHERE reservation_id=$1',[row.id]);await pool!.query('DELETE FROM payments WHERE reservation_id=$1',[row.id]);await pool!.query('DELETE FROM audit_logs WHERE entity_id=$1',[row.id]);await pool!.query('DELETE FROM reservations WHERE id=$1',[row.id]);}
  await pool!.query('DELETE FROM maintenance_blocks WHERE room_id=$1',[prefix]);await pool!.query('DELETE FROM rooms WHERE id=$1',[prefix]);await pool!.query('DELETE FROM room_types WHERE id=$1',[prefix]);await pool!.query('DELETE FROM guests WHERE id=$1',[prefix]);
  await pool!.end();const {pool:appPool}=await import('../db');await appPool.end();
 });
 it('guarda la reserva y su auditoría antes de confirmar',async()=>{
  const r=await created(0);
  const logs=await pool!.query("SELECT details FROM audit_logs WHERE entity_id=$1 AND action='create'",[r.id]);expect(logs.rows).toHaveLength(1);expect(JSON.parse(logs.rows[0].details).after.reservationCode).toBe(r.reservationCode);
  const planning=await storage.getPlanningData(r.checkInDate,r.checkOutDate);expect(planning.cellReservations[prefix][r.checkInDate]).toBe(r.id);
 });
 it('bloquea borrado definitivo por API y por storage',async()=>{
  const r=await created(1);expect((await request('DELETE',`/api/reservations/${r.id}`)).status).toBe(405);await expect(storage.deleteReservation(r.id)).rejects.toThrow('no se borran');expect((await pool!.query('SELECT id FROM reservations WHERE id=$1',[r.id])).rows).toHaveLength(1);
 });
 it('anular requiere motivo, identidad real y conserva reserva e historial',async()=>{
  const r=await created(2);expect((await request('POST',`/api/reservations/${r.id}/cancel`,{})).status).toBe(400);
  expect((await request('POST',`/api/reservations/${r.id}/cancel`,{reason:'El huésped cambió de fecha',cancelledBy:'Identidad inventada'})).status).toBe(200);
  expect((await pool!.query('SELECT status FROM reservations WHERE id=$1',[r.id])).rows[0].status).toBe('cancelled');
  const log=await pool!.query('SELECT cancelled_by,reason FROM cancelled_reservation_logs WHERE reservation_id=$1',[r.id]);expect(log.rows[0]).toMatchObject({cancelled_by:'Operador prueba',reason:'El huésped cambió de fecha'});
  const planning=await storage.getPlanningData(r.checkInDate,r.checkOutDate);expect(planning.cellReservations[prefix][r.checkInDate]).toBeUndefined();
  expect((await request('POST',`/api/reservations/${r.id}/cancel`,{reason:'Reintento'})).status).toBe(409);expect((await pool!.query('SELECT id FROM cancelled_reservation_logs WHERE reservation_id=$1',[r.id])).rows).toHaveLength(1);
 });
 it('anula después de check-in con motivo, libera planning y conserva cobros y cargos',async()=>{
  const r=await created(8);
  await pool!.query("UPDATE reservations SET status='checked_in' WHERE id=$1",[r.id]);
  await pool!.query("UPDATE rooms SET status='occupied' WHERE id=$1",[prefix]);
  await pool!.query("INSERT INTO charges(id,reservation_id,description,amount,date,category) VALUES($1,$2,'Cochera',75,$3,'otros')",[r.id+'-charge',r.id,r.checkInDate]);
  await pool!.query("INSERT INTO payments(id,reservation_id,amount,method,date) VALUES($1,$2,100,'efectivo',$3)",[r.id+'-payment',r.id,r.checkInDate]);
  const beforeCharge=(await pool!.query('SELECT * FROM charges WHERE reservation_id=$1',[r.id])).rows;
  const beforePayment=(await pool!.query('SELECT * FROM payments WHERE reservation_id=$1',[r.id])).rows;
  expect((await request('POST',`/api/reservations/${r.id}/cancel`,{reason:'   '})).status).toBe(400);
  expect((await request('POST',`/api/reservations/${r.id}/cancel`,{reason:'Check-in registrado por error'})).status).toBe(200);
  expect((await pool!.query('SELECT status FROM reservations WHERE id=$1',[r.id])).rows[0].status).toBe('cancelled');
  expect((await pool!.query('SELECT status FROM rooms WHERE id=$1',[prefix])).rows[0].status).toBe('dirty');
  expect((await storage.getPlanningData(r.checkInDate,r.checkOutDate)).cellReservations[prefix][r.checkInDate]).toBeUndefined();
  expect((await pool!.query('SELECT * FROM charges WHERE reservation_id=$1',[r.id])).rows).toEqual(beforeCharge);
  expect((await pool!.query('SELECT * FROM payments WHERE reservation_id=$1',[r.id])).rows).toEqual(beforePayment);
  const historyResponse=await request('GET','/api/reservations/cancellations/in-shift?today=true');
  expect(historyResponse.status).toBe(200);
  expect(await historyResponse.json()).toContainEqual(expect.objectContaining({reservation_id:r.id,reason:'Check-in registrado por error',cancelled_by:'Operador prueba'}));
  const shift=prefix+'-shift';
  await pool!.query("INSERT INTO cash_shifts(id,area,shift_number,opened_at,closed_at,status) VALUES($1,'reception',99,now()-interval '1 minute',now()+interval '1 minute','closed')",[shift]);
  try {
   expect(await (await request('GET',`/api/reservations/cancellations/in-shift?shiftId=${shift}`)).json()).toContainEqual(expect.objectContaining({reservation_id:r.id}));
   await pool!.query("UPDATE cash_shifts SET opened_at=now()+interval '1 hour',closed_at=now()+interval '2 hours' WHERE id=$1",[shift]);
   expect(await (await request('GET',`/api/reservations/cancellations/in-shift?shiftId=${shift}`)).json()).toEqual([]);
   role='spa';try{expect((await request('POST',`/api/reservations/${r.id}/cancel`,{reason:'Sin permiso'})).status).toBe(403);}finally{role='reception';}
  } finally {await pool!.query('DELETE FROM cash_shifts WHERE id=$1',[shift]);}
 });
 it('una falla de auditoría revierte estado y todos los registros de anulación',async()=>{
  const r=await created(3);await pool!.query(`CREATE FUNCTION reservation_history_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${r.id}' THEN RAISE EXCEPTION 'Falla simulada'; END IF; RETURN NEW; END $$`);await pool!.query('CREATE TRIGGER reservation_history_audit_fail BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reservation_history_audit_fail()');
  expect((await request('POST',`/api/reservations/${r.id}/cancel`,{reason:'Prueba rollback'})).status).toBe(500);
  expect((await pool!.query('SELECT status FROM reservations WHERE id=$1',[r.id])).rows[0].status).toBe('pending');expect((await pool!.query('SELECT id FROM cancelled_reservation_logs WHERE reservation_id=$1',[r.id])).rows).toHaveLength(0);
  await pool!.query('DROP TRIGGER reservation_history_audit_fail ON audit_logs');await pool!.query('DROP FUNCTION reservation_history_audit_fail()');
 });
 it('un fallo en cargos adicionales no deja una reserva parcialmente guardada',async()=>{
  const fault=vi.spyOn(storage,'createCharge').mockRejectedValueOnce(new Error('Cargo no disponible'));
  try{expect((await request('POST','/api/reservations',{...data(4),earlyCheckIn:true,earlyCheckInCharge:'50.00',earlyCheckInTime:'08:00'})).status).toBe(500);}finally{fault.mockRestore();}
  expect((await pool!.query('SELECT id FROM reservations WHERE reservation_code=$1',[data(4).reservationCode])).rows).toHaveLength(0);
 });
 it('un bloqueo de mantenimiento posterior no tapa una reserva guardada',async()=>{
  const r=await created(5);await pool!.query("INSERT INTO maintenance_blocks(id,room_id,block_from,block_to,blocked_by,notes) VALUES($1,$2,$3,$4,'Prueba','Prueba')",[prefix,prefix,r.checkInDate,r.checkOutDate]);
  const planning=await storage.getPlanningData(r.checkInDate,r.checkOutDate);expect(planning.cellReservations[prefix][r.checkInDate]).toBe(r.id);await pool!.query('DELETE FROM maintenance_blocks WHERE id=$1',[prefix]);
 });
 it('una estadía finalizada no tapa una nueva reserva en el mismo rango',async()=>{
  const old=await created(6);await pool!.query("UPDATE reservations SET status='checked_out' WHERE id=$1",[old.id]);
  const response=await request('POST','/api/reservations',{...data(6),reservationCode:prefix+'-reused'});expect(response.status).toBe(201);const current=await response.json();ids.push(current.id);
  const planning=await storage.getPlanningData(old.checkInDate,old.checkOutDate);expect(planning.cellReservations[prefix][old.checkInDate]).toBe(current.id);
 });
 it('rechaza habitaciones inexistentes y avisa si una habitación guardada queda inactiva',async()=>{
  expect((await request('POST','/api/reservations',{...data(7),roomId:'inexistente'})).status).toBe(400);
  const r=await created(7);await pool!.query('UPDATE rooms SET is_active=false WHERE id=$1',[prefix]);
  try { const planning=await storage.getPlanningData(r.checkInDate,r.checkOutDate);expect(planning.visibilityWarnings).toContainEqual({reservationId:r.id,reservationCode:r.reservationCode,reason:'inactive_room'}); }
  finally {await pool!.query('UPDATE rooms SET is_active=true WHERE id=$1',[prefix]);}
 });
 it('el reinicio no elimina habitaciones ajenas al catálogo ni sus reservas',async()=>{
  const {refreshRealData}=await import('../seed');
  await refreshRealData();
  expect((await pool!.query("SELECT id FROM rooms WHERE id='r201'")).rows).toHaveLength(1);
  expect((await pool!.query('SELECT id FROM rooms WHERE id=$1',[prefix])).rows).toHaveLength(1);
  expect((await pool!.query('SELECT id FROM reservations WHERE reservation_code LIKE $1',[prefix+'%'])).rows.length).toBeGreaterThan(0);
 });
 it('dos anulaciones simultáneas conservan un único registro',async()=>{
  const id=(await pool!.query('SELECT id FROM reservations WHERE reservation_code=$1',[prefix+'-3'])).rows[0].id;
  const responses=await Promise.all([request('POST',`/api/reservations/${id}/cancel`,{reason:'Prueba concurrente'}),request('POST',`/api/reservations/${id}/cancel`,{reason:'Prueba concurrente'})]);
  expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
  expect((await pool!.query('SELECT id FROM cancelled_reservation_logs WHERE reservation_id=$1',[id])).rows).toHaveLength(1);
 });
 it('un usuario de SPA no puede crear ni anular reservas de recepción',async()=>{
  role='spa';try{expect((await request('POST','/api/reservations',data(7))).status).toBe(403);expect((await request('POST',`/api/reservations/${ids[0]}/cancel`,{reason:'Sin permiso'})).status).toBe(403);}finally{role='reception';}
 });
});
