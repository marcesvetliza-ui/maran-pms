import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
const target=process.env.DATABASE_URL||'';
const allowed=(process.env.CI==='true'&&/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):5432\/maran_test$/.test(target))||target==='postgresql://postgres:remito_test@127.0.0.1:55432/remito_test';
const suite=allowed?describe:describe.skip;
let pool:typeof import('../db').pool,storage:typeof import('../db-storage').storage;
const fixtures:{type:string;group:string;guest:string}[]=[];
async function fixture(genuinePending=false){
 const type=randomUUID(),group=randomUUID(),guest=randomUUID();fixtures.push({type,group,guest});
 await pool.query('INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,$1::text)',[type]);
 await pool.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Synthetic','Departure')",[guest]);
 await pool.query("INSERT INTO groups(id,group_code,name,status,check_in_date,check_out_date,created_at) VALUES($1::text,$1::text,'Synthetic','inhouse','2031-01-01','2031-01-03',now())",[group]);
 await pool.query('INSERT INTO group_room_blocks(id,group_id,room_type_id,quantity) VALUES($1,$1,$2,$3)',[group,type,genuinePending?16:15]);
 for(let i=0;i<17;i++)await pool.query("INSERT INTO rooms(id,room_number,room_type_id,is_active,is_virtual,status) VALUES($1::text,$1::text,$2,true,false,'available')",[type+'-'+i,type]);
 for(let i=0;i<17+(genuinePending?2:0);i++){
  const id=randomUUID(),completed=i<3,linked=i<15,room=i<17?i:i-16;
  await pool.query(`INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,check_in_date,check_out_date,nights,status,checked_out_at,created_at) VALUES($1::text,$1::text,$2,$3,$4,'2031-01-01',$5::date,2,$6,$7::timestamp,now())`,[id,guest,type+'-'+room,type,i<2?'2031-01-02':'2031-01-03',completed?'checked_out':'checked_in',completed?'2031-01-02T15:00:00':null]);
  if(linked)await pool.query('INSERT INTO group_reservation_links(group_id,reservation_id) VALUES($1,$2)',[group,id]);
 }
 return {type,group,guest,data:{reservationCode:randomUUID(),guestId:guest,roomId:type+'-0',roomTypeId:type,checkInDate:'2031-01-02',checkOutDate:'2031-01-03',nights:1,baseRatePerNight:'100',finalRatePerNight:'100',totalRoomAmount:'100',status:'confirmed',createdAt:new Date()} as any};
}
suite('group departures with actual storage on disposable PostgreSQL',()=>{
 beforeAll(async()=>{({pool}=await import('../db'));({storage}=await import('../db-storage'));});
 afterAll(async()=>{
  for(const f of fixtures){
   await pool.query('DELETE FROM group_reservation_links WHERE group_id=$1',[f.group]);
   await pool.query('DELETE FROM audit_logs WHERE entity_id IN(SELECT id FROM reservations WHERE room_type_id=$1)',[f.type]);
   await pool.query('DELETE FROM reservation_changelog WHERE reservation_id IN(SELECT id FROM reservations WHERE room_type_id=$1)',[f.type]);
   await pool.query('DELETE FROM reservations WHERE room_type_id=$1',[f.type]);
   await pool.query('DELETE FROM group_room_blocks WHERE group_id=$1',[f.group]);await pool.query('DELETE FROM groups WHERE id=$1',[f.group]);
   await pool.query('DELETE FROM rooms WHERE room_type_id=$1',[f.type]);await pool.query('DELETE FROM guests WHERE id=$1',[f.guest]);await pool.query('DELETE FROM room_types WHERE id=$1',[f.type]);
  }
  await pool?.end();
 });
 it('creates an independent stay in a vacated room without changing the group or its completed stays',async()=>{
  const f=await fixture();
  expect(await storage.evaluateReservationInventory({roomTypeId:f.type,checkInDate:'2031-01-02',checkOutDate:'2031-01-03'})).toBeNull();
  const created=await storage.createReservation(f.data);expect(created.roomId).toBe(f.data.roomId);
  const group=(await pool.query('SELECT quantity FROM group_room_blocks WHERE group_id=$1',[f.group])).rows[0];expect(group.quantity).toBe(15);
  const links=(await pool.query("SELECT r.status,count(*)::int AS n FROM group_reservation_links l JOIN reservations r ON r.id=l.reservation_id WHERE l.group_id=$1 GROUP BY r.status ORDER BY r.status",[f.group])).rows;
  expect(links).toEqual([{status:'checked_in',n:12},{status:'checked_out',n:3}]);
  await expect(storage.createReservation({...f.data,reservationCode:randomUUID()})).rejects.toMatchObject({response:{code:'PHYSICAL_ROOM_OVERLAP',canOverride:false}});
  expect((await pool.query("SELECT count(*)::int AS n FROM reservations WHERE room_id=$1 AND status='confirmed'",[f.data.roomId])).rows[0].n).toBe(1);
 });
 it('retains a genuinely unassigned group unit even for a free room and an explicit override',async()=>{
  const f=await fixture(true);
  await expect(storage.createReservation({...f.data,_inventoryOverrideTentativeGroupWarning:true})).rejects.toMatchObject({response:{code:'GROUP_BLOCK_SHORTAGE',canOverride:false,warning:{unassignedConfirmedGroupUnits:1}}});
  expect((await pool.query("SELECT count(*)::int AS n FROM reservations WHERE room_id=$1 AND status='confirmed'",[f.data.roomId])).rows[0].n).toBe(0);
 });
});
