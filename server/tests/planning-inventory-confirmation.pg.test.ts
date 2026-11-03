import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
const allowed=process.env.DATABASE_URL==='postgresql://postgres:remito_test@127.0.0.1:55432/remito_test';
const suite=allowed?describe:describe.skip;
let pool:typeof import('../db').pool,storage:typeof import('../db-storage').storage;
const fixtures:{type:string,guest:string,group:string}[]=[];
async function fixture(hardGroup=false){
 const type=randomUUID(),guest=randomUUID(),group=randomUUID();fixtures.push({type,guest,group});
 await pool.query('INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,$1::text)',[type]);
 await pool.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Synthetic','Inventory')",[guest]);
 for(const suffix of ['occupied','free','virtual'])await pool.query("INSERT INTO rooms(id,room_number,room_type_id,is_active,is_virtual,status) VALUES($1::text,$1::text,$2,true,$3,'available')",[type+suffix,type,suffix==='virtual']);
 for(const suffix of ['occupied','virtual'])await pool.query("INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,status,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2031-01-01','2031-01-03',2,'confirmed',now())",[randomUUID(),guest,type+suffix,type]);
 if(hardGroup){await pool.query("INSERT INTO groups(id,group_code,name,status,check_in_date,check_out_date,created_at) VALUES($1::text,$1::text,'Synthetic','confirmed','2031-01-02','2031-01-03',now())",[group]);await pool.query('INSERT INTO group_room_blocks(id,group_id,room_type_id,quantity) VALUES($1,$1,$2,1)',[group,type]);}
 return {type,guest,data:{reservationCode:randomUUID(),guestId:guest,roomId:type+'free',roomTypeId:type,checkInDate:'2031-01-01',checkOutDate:'2031-01-03',nights:2,baseRatePerNight:'100',finalRatePerNight:'100',totalRoomAmount:'200',status:'confirmed',createdAt:new Date()} as any};
}
suite('Planning physical inventory confirmation on disposable PostgreSQL',()=>{
 beforeAll(async()=>{({pool}=await import('../db'));({storage}=await import('../db-storage'));});
 afterAll(async()=>{
  for(const f of fixtures){await pool.query('DELETE FROM group_reservation_links WHERE group_id=$1',[f.group]);await pool.query('DELETE FROM audit_logs WHERE entity_id IN(SELECT id FROM reservations WHERE room_type_id=$1)',[f.type]);await pool.query('DELETE FROM reservation_changelog WHERE reservation_id IN(SELECT id FROM reservations WHERE room_type_id=$1)',[f.type]);await pool.query('DELETE FROM reservations WHERE room_type_id=$1',[f.type]);await pool.query('DELETE FROM group_room_blocks WHERE group_id=$1',[f.group]);await pool.query('DELETE FROM groups WHERE id=$1',[f.group]);await pool.query('DELETE FROM rooms WHERE room_type_id=$1',[f.type]);await pool.query('DELETE FROM guests WHERE id=$1',[f.guest]);await pool.query('DELETE FROM room_types WHERE id=$1',[f.type]);}
  await pool?.end();
 });
 it('requires acknowledgment then saves once, while a physical overlap stays blocked',async()=>{
  const f=await fixture();
  await expect(storage.createReservation(f.data)).rejects.toMatchObject({response:{code:'GROUP_BLOCK_WARNING',canOverride:true}});
  const created=await storage.createReservation({...f.data,_inventoryOverrideTentativeGroupWarning:true});
  expect(created.roomId).toBe(f.type+'free');
  await expect(storage.createReservation({...f.data,_inventoryOverrideTentativeGroupWarning:true,reservationCode:randomUUID()})).rejects.toMatchObject({response:{code:'PHYSICAL_ROOM_OVERLAP',canOverride:false}});
  expect((await pool.query('SELECT id FROM reservations WHERE room_id=$1',[f.type+'free'])).rows).toHaveLength(1);
 });
 it('checks in an existing confirmed stay without consuming category capacity again',async()=>{
  const f=await fixture(true);
  const id=(await pool.query('SELECT id FROM reservations WHERE room_id=$1',[f.type+'occupied'])).rows[0].id;
  const checkedIn=await storage.updateReservation(id,{status:'checked_in'});
  expect(checkedIn?.status).toBe('checked_in');
  const current=await storage.getReservation(id);
  expect(current?.roomId).toBe(f.type+'occupied');
  // A new booking must still respect the unassigned hard group commitment.
  await expect(storage.createReservation({...f.data,_inventoryOverrideTentativeGroupWarning:true})).rejects.toMatchObject({response:{code:'GROUP_BLOCK_SHORTAGE',canOverride:false}});
 });
 it('checks in a grouped reservation without counting it outside its own block',async()=>{
  const f=await fixture(true);
  const id=(await pool.query('SELECT id FROM reservations WHERE room_id=$1',[f.type+'occupied'])).rows[0].id;
  const group=fixtures[fixtures.length-1].group;
  await pool.query('INSERT INTO group_reservation_links(group_id,reservation_id) VALUES($1,$2)',[group,id]);
  expect((await storage.updateReservation(id,{status:'checked_in'}))?.status).toBe('checked_in');
 });
 it('still validates category capacity when reactivating an inactive reservation',async()=>{
  const f=await fixture(true);
  const id=(await pool.query('SELECT id FROM reservations WHERE room_id=$1',[f.type+'occupied'])).rows[0].id;
  await storage.updateReservation(id,{status:'cancelled'});
  await expect(storage.updateReservation(id,{status:'confirmed'})).rejects.toMatchObject({response:{code:'GROUP_BLOCK_SHORTAGE',canOverride:false}});
  expect((await storage.getReservation(id))?.status).toBe('cancelled');
 });
 it('never bypasses a hard unassigned group commitment on a later night',async()=>{
  const f=await fixture(true);
  for(const override of [false,true])await expect(storage.createReservation({...f.data,_inventoryOverrideTentativeGroupWarning:override})).rejects.toMatchObject({response:{code:'GROUP_BLOCK_SHORTAGE',canOverride:false,warning:{date:'2031-01-02'}}});
  expect((await pool.query('SELECT id FROM reservations WHERE room_id=$1',[f.type+'free'])).rows).toHaveLength(0);
 });
});
