import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {sql} from 'drizzle-orm';
const enabled=!!process.env.DATABASE_URL;
if(enabled){const u=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(u.hostname)||!/test/.test(u.pathname))throw Error('Disposable local test database required');}
let pool:typeof import('../db').pool,storage:typeof import('../db-storage').storage,sync:typeof import('../hospitalityNotifications').syncHospitalityNotifications;
const prefix='hosp-test-'+randomUUID(),id=(name:string)=>prefix+'-'+name,now=new Date('2034-01-15T15:00:00Z');
async function rows(){return(await pool.query("SELECT * FROM system_notifications WHERE guest_name='Synthetic Bell' ORDER BY related_entity_type,target_area")).rows;}
async function pref(name:string,category='habitacion',area=['all']){await pool.query("INSERT INTO guest_preferences(id,guest_id,category,title,description,priority,visible_to)VALUES($1,$2,$3,$4,'Synthetic request','normal',$5)",[id(name),id('guest'),category,name,area]);}
describe.skipIf(!enabled)('Hospitality bell · real PostgreSQL, no messaging providers',()=>{
 beforeAll(async()=>{
  ({pool}=await import('../db'));({storage}=await import('../db-storage'));({syncHospitalityNotifications:sync}=await import('../hospitalityNotifications'));
  await pool.query("INSERT INTO room_types(id,code,name)VALUES($1::text,$1,'Synthetic hospitality type')",[id('type')]);
  await pool.query("INSERT INTO rooms(id,room_number,room_type_id,floor,status,is_active,is_virtual)VALUES($1,'H802',$2,8,'available',true,false)",[id('room'),id('type')]);
  await pool.query("INSERT INTO guests(id,first_name,last_name)VALUES($1,'Bell','Synthetic')",[id('guest')]);
  for(const [key,arrival,status] of [['stay','2034-01-16','confirmed'],['far','2034-02-10','confirmed'],['cancel','2034-01-16','cancelled']])await pool.query("INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,nights,status,total_room_amount,final_rate_per_night,created_at)VALUES($1::text,$1,$2,$3,$4,$5,'2034-02-12',2,$6,0,0,now())",[id(key),id('guest'),id('type'),id('room'),arrival,status]);
 },30000);
 afterAll(async()=>{
  if(!pool)return;await pool.query("DELETE FROM system_notifications WHERE related_entity_id IN(SELECT id FROM hospitality_alerts WHERE reservation_id LIKE $1) OR related_entity_id IN(SELECT id FROM stay_notes WHERE reservation_id LIKE $1) OR guest_name='Synthetic Bell'",[prefix+'%']);
  await pool.query('DELETE FROM hospitality_alerts WHERE reservation_id LIKE $1',[prefix+'%']);await pool.query('DELETE FROM stay_notes WHERE reservation_id LIKE $1',[prefix+'%']);await pool.query('DELETE FROM guest_preferences WHERE guest_id=$1',[id('guest')]);await pool.query('DELETE FROM reservations WHERE id LIKE $1',[prefix+'%']);await pool.query('DELETE FROM guests WHERE id=ANY($1::text[])',[[id('guest'),id('replacement')]]);await pool.query('DELETE FROM rooms WHERE id=$1',[id('room')]);await pool.query('DELETE FROM room_types WHERE id=$1',[id('type')]);await pool.end();
 });
 it('creates one preparation task and bell item before arrival, including a normal-priority request',async()=>{
  await pref('Cuna');await Promise.all([sync(now),sync(now)]);
  expect((await pool.query('SELECT * FROM hospitality_alerts WHERE reservation_id=$1',[id('stay')])).rows).toHaveLength(1);
  const notes=await rows();expect(notes).toHaveLength(1);expect(notes[0]).toMatchObject({title:'Hospitalidad · Synthetic Bell · Hab. H802',target_area:'housekeeping',is_read:false,status:'pendiente'});expect(notes[0].message).toContain('Ingresa mañana · Ingreso 16/01/2034 · Cuna');
  expect((await pool.query('SELECT * FROM hospitality_alerts WHERE reservation_id=ANY($1::text[])',[[id('far'),id('cancel')]])).rows).toHaveLength(0);
 });
 it('keeps read separate from completed, routes by area, and does not repeat an unchanged request',async()=>{
  const n=(await rows())[0];await storage.markNotificationRead(n.id,['housekeeping','all']);await sync(now);
  expect((await rows())[0]).toMatchObject({id:n.id,is_read:true,status:'pendiente'});
  expect((await pool.query('SELECT status FROM hospitality_alerts WHERE id=$1',[n.related_entity_id])).rows[0].status).toBe('pending');
  expect((await storage.getNotifications(undefined,500,['restaurant','all'])).some(x=>x.id===n.id)).toBe(false);
  expect(await storage.markNotificationRead(n.id,['restaurant','all'])).toBeUndefined();
  expect((await storage.getNotifications(undefined,500,null)).some(x=>x.id===n.id)).toBe(true);
  expect((await storage.getNotifications(undefined,500,[])).some(x=>x.id===n.id)).toBe(false);
 });
 it('resurfaces a real modification once and then the arrival-day reminder, respecting Argentina midnight',async()=>{
  await pool.query('UPDATE guest_preferences SET description=$2 WHERE id=$1',[id('Cuna'),'Synthetic updated request']);await sync(now);
  let n=(await rows())[0];expect(n.is_read).toBe(false);expect(n.message).toContain('Synthetic updated request');await storage.markNotificationRead(n.id);
  await sync(new Date('2034-01-16T02:30:00Z'));expect((await rows())[0].is_read).toBe(true);
  await sync(new Date('2034-01-16T03:01:00Z'));n=(await rows())[0];expect(n.is_read).toBe(false);expect(n.message).toContain('Ingresa hoy');
  const housekeepingUnread=(await storage.getNotifications(undefined,undefined,['housekeeping','all'])).filter(n=>!n.isRead).length;
  expect(housekeepingUnread).toBeGreaterThanOrEqual(1);expect(await storage.getUnreadNotificationCount(undefined,['housekeeping','all'])).toBe(housekeepingUnread);
  const restaurantUnread=await storage.getUnreadNotificationCount(undefined,['restaurant','all']);
  expect(await storage.markAllNotificationsRead(undefined,['restaurant','all'])).toBe(restaurantUnread);expect((await rows())[0].is_read).toBe(false);
 });
 it('keeps a completed task closed through check-in and later reconciliation',async()=>{
  let n=(await rows())[0];await storage.updateNotificationStatus(n.id,'completado',undefined,'Synthetic operator',['housekeeping','all']);
  expect((await pool.query('SELECT status FROM hospitality_alerts WHERE id=$1',[n.related_entity_id])).rows[0].status).toBe('completed');
  await pool.query("UPDATE hospitality_alerts SET alert_message='[Llegada mañana — Hab. H802] '||alert_message WHERE id=$1",[n.related_entity_id]);
  await pool.query("UPDATE reservations SET status='checked_in' WHERE id=$1",[id('stay')]);await sync(now);await sync(now);
  expect(await rows()).toHaveLength(1);expect((await rows())[0]).toMatchObject({id:n.id,status:'completado',is_read:true});
  expect((await storage.getNotifications(undefined,500,null)).some(x=>x.id===n.id)).toBe(false);
 });
 it('projects stay notes, excludes automatic preference copies, and clears a resolved note without recreating it',async()=>{
  for(const [name,by] of [['note','Synthetic operator'],['copy','sistema (check-in automático)']])await pool.query("INSERT INTO stay_notes(id,reservation_id,guest_id,category,title,visible_to,recorded_by)VALUES($1,$2,$3,'alimentacion','Preparar desayuno especial',ARRAY['restaurant'],$4)",[id(name),id('stay'),id('guest'),by]);
  await sync(now);let n=(await rows()).find(x=>x.related_entity_type==='hospitality_stay_note');expect(n).toMatchObject({related_entity_id:id('note'),target_area:'restaurant',status:'pendiente'});
  expect((await rows()).filter(x=>x.related_entity_type==='hospitality_stay_note')).toHaveLength(1);
  await storage.updateNotificationStatus(n.id,'en_proceso',undefined,'Synthetic operator',['restaurant','all']);await sync(now);expect((await rows()).find(x=>x.id===n.id)).toMatchObject({status:'en_proceso',is_read:true});
  await storage.resolveStayNote(id('note'),'Synthetic operator');expect((await rows()).find(x=>x.id===n.id)).toMatchObject({status:'completado',is_read:true});await sync(now);await sync(now);expect((await rows()).find(x=>x.id===n.id)).toMatchObject({status:'completado',is_read:true});
 });
 it('removes notices when a stay is cancelled or a preference is deactivated, and safely handles rescheduling',async()=>{
  await pref('Dieta','alimentacion');await sync(now);let n=(await rows()).find(x=>x.status==='pendiente');expect(n).toBeTruthy();
  await pool.query('UPDATE guest_preferences SET is_active=false WHERE id=$1',[id('Dieta')]);await sync(now);expect((await rows()).find(x=>x.id===n.id)).toMatchObject({status:'completado',is_read:true});
  await pool.query("UPDATE guest_preferences SET is_active=true WHERE id=$1",[id('Dieta')]);await pool.query("UPDATE reservations SET status='confirmed',check_in_date='2034-02-10' WHERE id=$1",[id('stay')]);await sync(now);expect((await rows()).filter(x=>x.status==='pendiente')).toHaveLength(0);
  await pool.query("UPDATE reservations SET check_in_date='2034-01-16' WHERE id=$1",[id('stay')]);await sync(now);expect((await rows()).find(x=>x.id===n.id)).toMatchObject({status:'pendiente',is_read:false});
  await pool.query("UPDATE reservations SET status='cancelled' WHERE id=$1",[id('stay')]);await sync(now);expect((await rows()).filter(x=>x.status==='pendiente')).toHaveLength(0);
 });
 it('rolls back a failed delivery without leaving half-created tasks, and can retry once',async()=>{
  await pool.query("UPDATE reservations SET status='confirmed',check_in_date='2034-01-16' WHERE id=$1",[id('stay')]);await pref('Retry');
  const fn='reject_hosp_'+randomUUID().replaceAll('-','');
  await pool.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.guest_name='Synthetic Bell' THEN RAISE EXCEPTION 'synthetic notification failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${fn} BEFORE INSERT ON system_notifications FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
  try{await expect(sync(now)).rejects.toThrow();}finally{await pool.query(`DROP TRIGGER ${fn} ON system_notifications; DROP FUNCTION ${fn}()`);}
  expect((await pool.query('SELECT id FROM hospitality_alerts WHERE preference_id=$1',[id('Retry')])).rows).toHaveLength(0);
  await sync(now);await sync(now);expect((await pool.query('SELECT id FROM hospitality_alerts WHERE preference_id=$1',[id('Retry')])).rows).toHaveLength(1);
 });

 it('retires a previous guest request when the reservation guest changes, even if that guest has another upcoming stay',async()=>{
  await pool.query("INSERT INTO guests(id,first_name,last_name)VALUES($1,'New','Synthetic')",[id('replacement')]);
  await pool.query('UPDATE reservations SET guest_id=$2 WHERE id=$1',[id('stay'),id('replacement')]);
  await pool.query("UPDATE reservations SET check_in_date='2034-01-16' WHERE id=$1",[id('far')]);
  await sync(now);
  expect((await pool.query("SELECT n.id FROM system_notifications n JOIN hospitality_alerts a ON a.id=n.related_entity_id WHERE a.reservation_id=$1 AND n.related_entity_type='hospitality_alert' AND n.status NOT IN ('completado','rechazado')",[id('stay')])).rows).toHaveLength(0);
  expect((await pool.query("SELECT n.id FROM system_notifications n JOIN hospitality_alerts a ON a.id=n.related_entity_id WHERE a.reservation_id=$1 AND n.status='pendiente'",[id('far')])).rows.length).toBeGreaterThan(0);
 });

});
