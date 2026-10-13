import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db,pool,withDatabaseTransaction} from '../db';
import {afterAll} from 'vitest';
vi.mock('../auth',()=>({requireAuth:vi.fn(),requirePermission:vi.fn(()=>vi.fn())}));
import {loadHousekeepingDailyReport} from '../housekeepingDailyReport';
afterAll(()=>pool.end());
it('keeps room operations and visible hospitality while excluding finances, private notes and unrelated stays',async()=>{
 const prefix=randomUUID(),room=prefix+'-room',virtual=prefix+'-virtual',type=prefix+'-type',guest=prefix+'-guest',companion=prefix+'-companion',departure=prefix+'-departure',arrival=prefix+'-arrival',date='2003-05-12';
 const rollback=new Error('rollback hsk fixture');
 await expect(withDatabaseTransaction(async()=>{
  await db.execute(sql`INSERT INTO room_types(id,code,name)VALUES(${type},${prefix},'Prueba')`);
  await db.execute(sql`INSERT INTO rooms(id,room_number,room_type_id,is_virtual,status)VALUES(${room},${prefix+'-201'},${type},false,'dirty'),(${virtual},${prefix+'-virtual'},${type},true,'available')`);
  await db.execute(sql`INSERT INTO guests(id,first_name,last_name,phone)VALUES(${guest},'Ana','Prueba','PRIVATE_PHONE'),(${companion},'Otra','Persona',NULL)`);
  for(const [id,start,end,status,r] of [[departure,'2003-05-10',date,'checked_out',room],[arrival,date,'2003-05-15','confirmed',room],[prefix+'-cancelled',date,'2003-05-15','cancelled',room],[prefix+'-virtual',date,'2003-05-15','confirmed',virtual],[prefix+'-future','2003-05-13','2003-05-15','confirmed',room]]){
   await db.execute(sql`INSERT INTO reservations(id,reservation_code,guest_id,room_type_id,room_id,check_in_date,check_out_date,status,number_of_guests,notes,total_room_amount,final_rate_per_night,created_at)VALUES(${id},${id},${guest},${type},${r},${start},${end},${status},2,'PRIVATE_RESERVATION_NOTE',1234567,123456,now())`);
  }
  await db.execute(sql`UPDATE reservations SET early_check_in=true,early_check_in_time='09:00',bed_type_notes='MATRIMONIAL',housekeeping_preparation=${JSON.stringify({roomId:room,state:'prepared',note:'Cama extra preparada',markedAt:'2003-05-11',markedBy:'test'})}::jsonb WHERE id=${arrival}`);
  await db.execute(sql`UPDATE reservations SET late_check_out=true,late_check_out_time='15:00' WHERE id=${departure}`);
  await db.execute(sql`INSERT INTO reservation_companions(reservation_id,guest_id,first_name,last_name)VALUES(${arrival},${companion},'Otra','Persona')`);
  for(const [g,category,title,areas,active] of [[guest,'habitacion','Almohada extra',['housekeeping'],true],[guest,'nota_interna','PRIVATE_INTERNAL',['all'],true],[guest,'amenities','PRIVATE_RECEPTION',['reception'],true],[guest,'servicio','INACTIVE',['all'],false],[companion,'amenities','Toalla adicional',['housekeeping'],true]]){
   await db.execute(sql`INSERT INTO guest_preferences(guest_id,category,title,visible_to,is_active)VALUES(${g},${category},${title},ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(areas)}::jsonb)),${active})`);
  }
  for(const [id,title,resolved] of [[arrival,'Preparar cuna',false],[arrival,'RESOLVED',true],[departure,'Solo salida',false],[prefix+'-future','OTHER_STAY',false]]){
   await db.execute(sql`INSERT INTO stay_notes(reservation_id,category,title,visible_to,is_resolved)VALUES(${id},'habitacion',${title},ARRAY['housekeeping'],${resolved})`);
  }
  const report=await loadHousekeepingDailyReport(date);
  const outs=report.checkOuts.filter(r=>r.reservationId.startsWith(prefix)),ins=report.checkIns.filter(r=>r.reservationId.startsWith(prefix));
  expect(outs.map(r=>r.reservationId)).toEqual([departure]);expect(ins.map(r=>r.reservationId)).toEqual([arrival]);
  expect(ins[0]).toMatchObject({turnover:true,earlyCheckIn:true,earlyCheckInTime:'09:00',numberOfGuests:2,bedTypeNotes:'MATRIMONIAL',roomStatus:'dirty'});
  expect(outs[0]).toMatchObject({turnover:true,lateCheckOut:true,lateCheckOutTime:'15:00'});
  expect(ins[0].observations.map(n=>n.text)).toEqual(expect.arrayContaining(['Almohada extra','Toalla adicional','Preparar cuna','Preparada — No mover — Cama extra preparada']));
  const output=JSON.stringify(report);
  for(const forbidden of ['PRIVATE_','RESOLVED','OTHER_STAY','INACTIVE','finalRatePerNight','totalRoomAmount','folioBalance','1234567'])expect(output).not.toContain(forbidden);
  expect(ins[0].observations.map(n=>n.text)).not.toContain('Solo salida');
  await db.execute(sql`UPDATE reservations SET housekeeping_preparation=${JSON.stringify({roomId:virtual,state:'prepared',note:'WRONG_ROOM',markedAt:'2003-05-11',markedBy:'test'})}::jsonb WHERE id=${arrival}`);
  expect(JSON.stringify(await loadHousekeepingDailyReport(date))).not.toContain('WRONG_ROOM');
  throw rollback;
 })).rejects.toBe(rollback);
});
it('rejects an impossible calendar date',async()=>{
 await expect(loadHousekeepingDailyReport('2026-02-30')).rejects.toThrow('Fecha inválida');
});
