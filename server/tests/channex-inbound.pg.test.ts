import { inboundBookingDetail } from '../channex/bookingDetail';
import { listInboundBookings, inboundBookingHistory } from '../channex/inbox';
import {previewChannexAri} from '../channex/ariPreview';
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureChannexInboundSchema } from "../channex/inboundSchema";
import { ensureChannexAriSchema } from "../channex/ariSchema";
import { addDays, buildAriValues, STAGING_URL } from "../channex/ari";
import { getChannexReadiness } from "../channex/readiness";
import { saveSettlementRate } from "../channex/settlementConfig";
const allowed = ["postgresql://postgres@127.0.0.1:55449/ota_assignment_test", "postgresql://postgres@127.0.0.1:55448/rate_calendar_boot_20261029", "postgresql://postgres@127.0.0.1:55448/channex_inbound_test"].includes(process.env.DATABASE_URL || "") ||
 (process.env.CI==="true"&&/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):5432\/maran_test$/.test(process.env.DATABASE_URL||""));
const suite=allowed?describe:describe.skip;
let pool:import("pg").Pool, service:typeof import("../channex/inbound"), storage:typeof import("../db-storage").storage;
const owners:string[]=[], types:string[]=[], guestIds=new Set<string>(),intakeActor=randomUUID();
let databaseToday:string,arrival:string,secondNight:string,departure:string,extendedDeparture:string;
function revision(property:string, bookingId:string, id:string, status="new",stamp="2026-10-29T23:00:00Z",rooms=1){return {id,attributes:{property_id:property,booking_id:bookingId,inserted_at:stamp,status,
 arrival_date:arrival,departure_date:departure,amount:String(rooms*250),currency:"ARS",customer:{name:"Channel",surname:"Test"},
 rooms:Array.from({length:rooms},(_,i)=>({id:`remote-${i}`,room_type_id:"remote-type",rate_plan_id:"remote-plan",occupancy:{adults:2},days:{[arrival]:"100.00",[secondNight]:"150.00"}}))}};}
async function fixture(rooms=2,extraPlan=false){
 const id=randomUUID(),type=randomUUID(),plan=randomUUID();owners.push(id);types.push(type);
 await pool.query("INSERT INTO room_types(id,code,name) VALUES($1,$2,$3)",[type,type,type]);
 await pool.query("INSERT INTO rate_plans(id,name,room_type_id,base_rate,currency) VALUES($1,'Test',$2,100,'ARS')",[plan,type]);
 for(let i=0;i<rooms;i++)await pool.query("INSERT INTO rooms(id,room_number,room_type_id,floor,status,is_active,is_virtual) VALUES($1,$2,$3,2,'available',true,false)",[`${id}-${i}`,`${id}-${i}`,type]);
 await pool.query("INSERT INTO channex_connections(id,label,environment,channex_property_id,base_url,is_active,created_at) VALUES($1,'Test','demo',$2,$3,true,now())",[id,id,STAGING_URL]);
 await pool.query("INSERT INTO channex_room_type_mappings(id,connection_id,channex_room_type_id,channex_room_type_title,room_type_id,created_at) VALUES($1,$2,'remote-type','Test',$3,now())",[id,id,type]);
 await pool.query("INSERT INTO channex_rate_plan_mappings(id,connection_id,channex_room_type_id,channex_rate_plan_id,channex_rate_plan_title,rate_plan_id,created_at) VALUES($1,$2,'remote-type','remote-plan','Test',$3,now())",[id,id,plan]);
 if(extraPlan) await pool.query("INSERT INTO channex_rate_plan_mappings(id,connection_id,channex_room_type_id,channex_rate_plan_id,channex_rate_plan_title,rate_plan_id,created_at) VALUES($1,$2,'remote-type','other-plan','Other',$3,now())",[randomUUID(),id,plan]);
 await pool.query("INSERT INTO channex_ari_settings(connection_id,floor,currency,enabled,capture_started_at) VALUES($1,2,'ARS',true,now())",[id]);
 await pool.query("INSERT INTO channex_inbound_settings(connection_id,enabled) VALUES($1,true)",[id]);
 return {id,type,plan};
}
// First assignment is an explicit operator choice. Later modifications and
// cancellations still exercise the unattended receiver.
async function apply(f:{id:string},r:any){
 await service.persistInboundRevision(pool,f.id,r);await service.applyInboundRevision(f.id,r.id);
 const source=()=>pool.query("SELECT * FROM channex_inbound_revisions WHERE connection_id=$1 AND revision_id=$2",[f.id,r.id]);
 if((await source()).rows[0].review_code==='MANUAL_ASSIGNMENT_REQUIRED'){
  const {getInboundAssignmentOptions}=await import('../channex/manualAssignment');const options=await getInboundAssignmentOptions(f.id,r.id,false),assignments:Record<string,string>={};
  for(const room of options.rooms){const choice=room.choices.find(choice=>!Object.values(assignments).includes(choice.id));if(!choice)return (await source()).rows[0];assignments[room.key]=choice.id;}
  await service.applyInboundRevision(f.id,r.id,{expectedPayloadHash:options.payloadHash,expectedConfigurationHash:options.configurationHash,assignments,reason:'Synthetic reception assignment',confirmCategoryChange:false,confirmScopeChange:false,actor:{id:intakeActor,name:'Synthetic Reception'},canOverrideScope:false});
 }
 return (await source()).rows[0];
}
async function linked(f:{id:string}){return (await pool.query("SELECT r.* FROM reservations r JOIN channex_inbound_rooms l ON l.reservation_id=r.id WHERE l.connection_id=$1 ORDER BY l.remote_room_id",[f.id])).rows;}
suite("real PMS Channex inbox on disposable PostgreSQL",()=>{
 beforeAll(async()=>{pool=(await import("../db")).pool;
  // PostgreSQL's real Argentine date drives the ARI triggers. A JS fake clock
  // cannot keep a fixed stay inside their current/future availability window.
  databaseToday=(await pool.query("SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS day")).rows[0].day;
  arrival=addDays(databaseToday,7);secondNight=addDays(arrival,1);departure=addDays(arrival,2);extendedDeparture=addDays(arrival,3);
  service=await import("../channex/inbound");storage=(await import("../db-storage")).storage;await ensureChannexAriSchema(pool);await ensureChannexInboundSchema(pool);await ensureChannexInboundSchema(pool);
  await pool.query("INSERT INTO system_users(id,username,password,email,full_name,role,created_at)VALUES($1::text,$1,'unused',$2,'Synthetic Reception','admin',now())",[intakeActor,`${intakeActor}@test.invalid`]);});
 afterAll(async()=>{
  for(const id of owners){
   await pool.query("DELETE FROM audit_logs WHERE entity_type='channex_manual_assignment' AND details::jsonb->>'connectionId'=$1",[id]);
   const rows=await linked({id});rows.forEach(r=>guestIds.add(r.guest_id));
   await pool.query("DELETE FROM channex_inbound_settlements WHERE connection_id=$1",[id]);
   await pool.query("DELETE FROM channex_inbound_rooms WHERE connection_id=$1",[id]);
   await pool.query("DELETE FROM channex_inbound_revisions WHERE connection_id=$1",[id]);
   await pool.query("UPDATE channex_ari_settings SET enabled=false WHERE connection_id=$1",[id]);
   await pool.query("DELETE FROM channex_connections WHERE id=$1",[id]);
   for(const r of rows){await pool.query("DELETE FROM payments WHERE reservation_id=$1",[r.id]);await pool.query("DELETE FROM audit_logs WHERE entity_id=$1",[r.id]);await pool.query("DELETE FROM reservation_changelog WHERE reservation_id=$1",[r.id]);await pool.query("DELETE FROM reservations WHERE id=$1",[r.id]);}
  }
  for(const id of guestIds)await pool.query("DELETE FROM guests WHERE id=$1",[id]);
  for(const type of types){await pool.query("DELETE FROM rooms WHERE room_type_id=$1",[type]);await pool.query("DELETE FROM rate_plans WHERE room_type_id=$1",[type]);await pool.query("DELETE FROM room_types WHERE id=$1",[type]);}
  await pool.query('DELETE FROM system_users WHERE id=$1',[intakeActor]);await pool?.end();
 });
 it('groups the inbox by booking, respects channel order, filters before pagination and exposes only safe summaries',async()=>{
  const f=await fixture(1);
  const insert=async(id:string,booking:string|null,status:string,remoteStatus:string,stamp:string)=>{
   const payload={...revision(f.id,booking || 'invalid',id,remoteStatus,stamp),secret:'NEVER_RETURN',attributes:{...revision(f.id,booking || 'invalid',id,remoteStatus,stamp).attributes,ota_name:'Booking.com',ota_reservation_code:'OTA123',customer:{name:'Ana',surname:'Test',mail:'private@example.com'},notes:'NEVER_RETURN',card:'NEVER_RETURN'}};
   await pool.query(`INSERT INTO channex_inbound_revisions(connection_id,revision_id,booking_id,payload,payload_hash,status,inserted_at,created_at)
    VALUES($1,$2,$3,$4,'hash',$5,$6,now())`,[f.id,id,booking,payload,status,stamp]);
  };
  await insert('a1','a','applied','new','2026-11-01T00:00:00Z');
  await insert('a2','a','applied','modified','2026-11-02T00:00:00Z');
  await insert('a3','a','review','cancelled','2026-11-03T00:00:00Z');
  await insert('a-late','a','stale','new','2026-11-01T01:00:00Z');
  await insert('b1','b','applied','cancelled','2026-11-02T00:00:00Z');
  await insert('bad1',null,'review','new','2026-11-02T00:00:00Z');
  await insert('bad2',null,'pending','new','2026-11-02T00:00:00Z');
  for(let i=0;i<26;i++) await insert(`n${i}`,`booking${i}`,'applied','new','2026-11-01T00:00:00Z');
  const before=(await pool.query('SELECT revision_id,status,acked_at FROM channex_inbound_revisions WHERE connection_id=$1 ORDER BY revision_id',[f.id])).rows;
  const all=await listInboundBookings(pool,f.id,'all',1);
  expect(all.counts).toEqual({all:30,attention:3,new:28,modified:0,cancelled:2});expect(all.bookings).toHaveLength(25);
  expect((await listInboundBookings(pool,f.id,'all',2)).bookings).toHaveLength(5);
  const attention=await listInboundBookings(pool,f.id,'attention',1);
  expect(attention.bookings).toHaveLength(3);expect(attention.bookings.find((b:any)=>b.booking_id==='a')).toMatchObject({revision_id:'a3',booking_status:'cancelled',status:'review',revision_count:4,channel:'Booking.com',reference:'OTA123'});
  expect((await listInboundBookings(pool,f.id,'cancelled',1)).bookings.map((b:any)=>b.booking_id).sort()).toEqual(['a','b']);
  expect((await inboundBookingHistory(pool,f.id,'a3',1)).total).toBe(4);
  expect((await inboundBookingHistory(pool,'other','a3',1)).total).toBe(0);
  expect((await inboundBookingHistory(pool,f.id,'bad1',1)).total).toBe(1);
  expect(JSON.stringify(attention)).not.toMatch(/NEVER_RETURN|private@example|payload|encrypted/);
  expect((await pool.query('SELECT revision_id,status,acked_at FROM channex_inbound_revisions WHERE connection_id=$1 ORDER BY revision_id',[f.id])).rows).toEqual(before);
 });
 it('filters the OTA table across all pages and keeps minimal cancellations identifiable',async()=>{
  const f=await fixture(1);
  for(let i=0;i<27;i++){
   const id=`filter-${f.id}-${i}`,raw=revision(f.id,`booking-${i}`,id,'new','2026-11-15T14:00:00Z') as any;
   raw.attributes.customer={name:i===26?'Target %_ Guest':'Another',surname:'Person'};raw.attributes.ota_name=i===26?'Expedia':'Booking.com';raw.attributes.ota_reservation_code=`OTA-${i}`;
   raw.attributes.arrival_date='2026-12-10';raw.attributes.departure_date='2026-12-13';
   await pool.query(`INSERT INTO channex_inbound_revisions(connection_id,revision_id,booking_id,payload,payload_hash,status,inserted_at,created_at)
    VALUES($1,$2,$3,$4,'hash','applied','2026-11-15T14:00:00Z','2026-11-16T02:30:00Z')`,[f.id,id,raw.attributes.booking_id,raw]);
  }
  const cancelled={id:`cancel-${f.id}`,attributes:{booking_id:'booking-26',property_id:f.id,status:'cancelled',inserted_at:'2026-11-15T15:00:00Z'}};
  await pool.query(`INSERT INTO channex_inbound_revisions(connection_id,revision_id,booking_id,payload,payload_hash,status,inserted_at,created_at)
   VALUES($1,$2,'booking-26',$3,'hash','applied','2026-11-15T15:00:00Z','2026-11-16T02:30:00Z')`,[f.id,cancelled.id,cancelled]);
  const filtered=await listInboundBookings(pool,f.id,'all',1,{search:'target %_',channel:'Expedia'});
  expect(filtered.counts.all).toBe(1);expect(filtered.counts.cancelled).toBe(1);expect(filtered.bookings[0]).toMatchObject({booking_status:'cancelled',guest_name:'Target %_ Guest Person',reference:'OTA-26',channel:'Expedia',amount:'250',arrival:'2026-12-10'});
  expect(filtered.channels).toEqual(['Booking.com','Expedia']);
  expect((await listInboundBookings(pool,f.id,'all',1,{dateType:'received',from:'2026-11-15',to:'2026-11-15'})).counts.all).toBe(27);
  expect((await listInboundBookings(pool,f.id,'all',1,{dateType:'received',from:'2026-11-16',to:'2026-11-16'})).counts.all).toBe(0);
  expect((await listInboundBookings(pool,f.id,'all',1,{dateType:'stay',from:'2026-12-12',to:'2026-12-12'})).counts.all).toBe(27);
  expect((await listInboundBookings(pool,f.id,'all',1,{dateType:'stay',from:'2026-12-13',to:'2026-12-15'})).counts.all).toBe(0);
 });
 it('opens audited OTA details with frozen ARS conversion and isolated operational notes',async()=>{
  vi.stubEnv('CHANNEX_CREDENTIALS_ENCRYPTION_KEY','table-detail-test-key-'.repeat(3));
  const f=await fixture(1),r=revision(f.id,`detail-${f.id}`,`detail-new-${f.id}`) as any;
  r.attributes.currency='USD';r.attributes.notes='Llegada después de las 22 hs';
  await pool.query("UPDATE rate_plans SET currency='USD' WHERE id=$1",[f.plan]);await pool.query("UPDATE channex_ari_settings SET currency='USD' WHERE connection_id=$1",[f.id]);
  await saveSettlementRate(pool,f.id,{rate:'1545.000000',reason:'Cotización del hotel'},'Test');
  expect((await apply(f,r)).status).toBe('applied');
  const before=(await pool.query('SELECT revision_id,status,acked_at FROM channex_inbound_revisions WHERE connection_id=$1',[f.id])).rows;
  const detail=await inboundBookingDetail(pool,f.id,r.id,{name:'Recepción prueba'});
  expect(detail).toMatchObject({notes:'Llegada después de las 22 hs',notesStatus:'available',settlements:[{source_currency:'USD',source_total:'250.00',exchange_rate:'1545.000000',settlement_total:'386250.00'}]});
  expect(JSON.stringify(await listInboundBookings(pool,f.id,'all',1))).not.toContain('Llegada después');
  expect(JSON.stringify(await inboundBookingHistory(pool,f.id,r.id,1))).not.toContain('Llegada después');
  expect(await inboundBookingDetail(pool,'other-property',r.id,{name:'Test'})).toBeNull();
  const audit=(await pool.query("SELECT details FROM audit_logs WHERE entity_type='channex_booking_detail' AND entity_id=$1",[r.id])).rows;
  expect(audit).toHaveLength(1);expect(audit[0].details).not.toContain('Llegada después');
  const broken={connect:async()=>{const c=await pool.connect();return {release:()=>c.release(),query:(sql:string,args?:unknown[])=>{if(sql.includes('INSERT INTO audit_logs'))throw Error('Synthetic audit failure');return c.query(sql,args);}};}} as any;
  await expect(inboundBookingDetail(broken,f.id,r.id,{name:'Test'})).rejects.toThrow('Synthetic audit failure');
  expect((await pool.query('SELECT revision_id,status,acked_at FROM channex_inbound_revisions WHERE connection_id=$1',[f.id])).rows).toEqual(before);
  const omitted=revision(f.id,`notes-omitted-${f.id}`,`notes-omitted-rev-${f.id}`) as any;omitted.attributes.notes='Tarjeta de crédito para garantizar';
  await service.persistInboundRevision(pool,f.id,omitted);
  const omittedDetail=await inboundBookingDetail(pool,f.id,omitted.id,{name:'Recepción prueba'});expect(omittedDetail).toMatchObject({notes:null,notesStatus:'payment_omitted'});
  await pool.query("DELETE FROM audit_logs WHERE entity_type='channex_booking_detail' AND entity_id=ANY($1::varchar[])",[[r.id,omitted.id]]);vi.unstubAllEnvs();
 });
 it('assigns a split category only to its selected physical room and reviews when it is unavailable',async()=>{
  const f=await fixture(2);
  await pool.query('UPDATE channex_ari_settings SET enabled=false WHERE connection_id=$1',[f.id]);
  await pool.query('UPDATE channex_inbound_settings SET enabled=false WHERE connection_id=$1',[f.id]);
  await pool.query('UPDATE channex_room_type_mappings SET room_ids=$2::text[] WHERE connection_id=$1',[f.id,[`${f.id}-1`]]);
  await pool.query('UPDATE channex_ari_settings SET enabled=true WHERE connection_id=$1',[f.id]);
  await pool.query('UPDATE channex_inbound_settings SET enabled=true WHERE connection_id=$1',[f.id]);
  expect((await apply(f,revision(f.id,`split-${f.id}`,`first-${f.id}`))).status).toBe('applied');
  expect((await linked(f))[0].room_id).toBe(`${f.id}-1`);
  expect((await apply(f,revision(f.id,`other-${f.id}`,`second-${f.id}`))).review_code).toBe('MANUAL_ASSIGNMENT_REQUIRED');
  expect(await linked(f)).toHaveLength(1);
 });
 it("creates two rooms atomically with exact nightly prices and no cash or invoice",async()=>{
  const f=await fixture();expect((await apply(f,revision(f.id,"booking-multi","new-multi","new",undefined,2))).status).toBe("applied");
  const rows=await linked(f);expect(rows).toHaveLength(2);expect(new Set(rows.map(r=>r.room_id)).size).toBe(2);
  expect(rows[0].nightly_pricing).toEqual([{date:arrival,rateCents:10000,discountCents:0},{date:secondNight,rateCents:15000,discountCents:0}]);
  const events=(await pool.query("SELECT kind,date_from::text,date_to::text,reason FROM channex_ari_outbox WHERE connection_id=$1",[f.id])).rows;
  expect(events.length).toBeGreaterThan(0);
  expect(events.every(event=>event.kind==='availability'&&event.date_from===arrival&&event.date_to===secondNight&&['reservations:insert','channex_inbound:inventory','channex_inbound:assignment'].includes(event.reason))).toBe(true);
  expect((await pool.query("SELECT id FROM payments WHERE reservation_id=ANY($1::varchar[])",[rows.map(r=>r.id)])).rows).toHaveLength(0);
  expect((await pool.query("SELECT id FROM sales_invoices WHERE reserva_id=ANY($1::varchar[])",[rows.map(r=>r.id)])).rows).toHaveLength(0);
 });
 it("imports a past stay without queuing expired availability",async()=>{
  const f=await fixture(),pastArrival=addDays(databaseToday,-3),pastSecondNight=addDays(databaseToday,-2),pastDeparture=addDays(databaseToday,-1);
  const past=revision(f.id,"booking-past","new-past","new",undefined,2);
  past.attributes.arrival_date=pastArrival;past.attributes.departure_date=pastDeparture;
  for(const room of past.attributes.rooms)room.days={[pastArrival]:"100.00",[pastSecondNight]:"150.00"};
  expect((await apply(f,past)).status).toBe('applied');
  const rows=await linked(f);expect(rows).toHaveLength(2);
  expect(rows[0].nightly_pricing).toEqual([{date:pastArrival,rateCents:10000,discountCents:0},{date:pastSecondNight,rateCents:15000,discountCents:0}]);
  expect((await pool.query('SELECT id FROM channex_ari_outbox WHERE connection_id=$1',[f.id])).rows).toHaveLength(0);
 });
 it("replays a revision and concurrent application without duplicate reservations",async()=>{
  const f=await fixture(),r=revision(f.id,"booking-replay","replay");await service.persistInboundRevision(pool,f.id,r);
  await Promise.all([service.applyInboundRevision(f.id,r.id),service.applyInboundRevision(f.id,r.id)]);await apply(f,r);
  expect(await linked(f)).toHaveLength(1);expect((await pool.query("SELECT revision_id FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows).toHaveLength(1);
 });
 it("recovers the identical unacknowledged revision rejected by the old timestamp parser",async()=>{
  const f=await fixture(),r:any=revision(f.id,"booking-utc-recovery","utc-recovery","new","2026-10-30T21:04:48.787899");
  r.attributes.rooms[0].booking_room_id="channex-room";delete r.attributes.rooms[0].id;
  await service.persistInboundRevision(pool,f.id,r);
  const before=(await pool.query("SELECT payload,payload_hash FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows[0];
  // State left by the previous release: durable payload, no trusted head, no ACK.
  await pool.query("UPDATE channex_inbound_revisions SET status='review',review_code='INVALID_REVISION',booking_id=NULL,inserted_at=NULL WHERE connection_id=$1",[f.id]);
  await service.recoverStoredInboundRevisions(pool);
  const recovered=(await pool.query("SELECT * FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows[0];
  expect(recovered).toMatchObject({status:"pending",review_code:null,booking_id:"booking-utc-recovery",payload:before.payload,payload_hash:before.payload_hash});
  await service.applyInboundRevision(f.id,r.id);await apply(f,r);
  expect(await linked(f)).toHaveLength(1);
  expect((await pool.query("SELECT remote_room_id FROM channex_inbound_rooms WHERE connection_id=$1",[f.id])).rows[0].remote_room_id).toBe("channex-room");
 });
 it("modifies nightly prices and ignores an older revision",async()=>{
  const f=await fixture();await apply(f,revision(f.id,"booking-mod","mod-original"));
  const change=revision(f.id,"booking-mod","mod-new","modified","2026-10-30T01:00:00Z");change.attributes.rooms[0].days[secondNight]="200.00";change.attributes.amount="300";
  expect((await apply(f,change)).status).toBe("applied");expect(Number((await linked(f))[0].total_room_amount)).toBe(300);
  expect((await apply(f,revision(f.id,"booking-mod","mod-old","modified","2026-10-30T00:00:00Z"))).status).toBe("stale");expect(Number((await linked(f))[0].total_room_amount)).toBe(300);
 });
 it("preserves one local reservation when a modified single room regenerates its UUID",async()=>{
  const f=await fixture();await apply(f,revision(f.id,"booking-identity","identity-original"));const [original]=await linked(f);
  const change=revision(f.id,"booking-identity","identity-change","modified","2026-10-30T01:00:00Z");
  change.attributes.rooms[0].id="regenerated-room";change.attributes.departure_date=extendedDeparture;
  (change.attributes.rooms[0].days as any)[departure]="120.00";change.attributes.amount="370";
  expect((await apply(f,change)).status).toBe("applied");await apply(f,change);
  const rows=await linked(f);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id:original.id,reservation_code:original.reservation_code,status:"confirmed",check_out_date:extendedDeparture,total_room_amount:"370.00"});
  expect((await pool.query("SELECT remote_room_id FROM channex_inbound_rooms WHERE connection_id=$1",[f.id])).rows[0].remote_room_id).toBe("regenerated-room");
  expect((await pool.query("SELECT remote_room_id FROM channex_inbound_settlements WHERE connection_id=$1 AND revision_id='identity-original'",[f.id])).rows[0].remote_room_id).toBe("remote-0");
  expect((await pool.query("SELECT * FROM reservation_changelog WHERE reservation_id=$1",[original.id])).rows).toHaveLength(2);
  expect((await apply(f,revision(f.id,"booking-identity","identity-cancel","cancelled","2026-10-30T02:00:00Z"))).status).toBe("applied");
  expect((await linked(f))[0]).toMatchObject({id:original.id,status:"cancelled"});
  expect((await pool.query("SELECT * FROM reservation_changelog WHERE reservation_id=$1",[original.id])).rows).toHaveLength(3);
 });
 it("rolls back a remapped identity and history when the modified stay fails validation",async()=>{
  const f=await fixture();await apply(f,revision(f.id,"booking-remap-rollback","remap-original"));const [original]=await linked(f);
  const change=revision(f.id,"booking-remap-rollback","remap-invalid","modified","2026-10-30T01:00:00Z");
  change.attributes.rooms[0].id="invalid-regenerated-room";change.attributes.rooms[0].occupancy.adults=20;
  expect((await apply(f,change)).review_code).toBe("OCCUPANCY_EXCEEDS_CAPACITY");
  expect((await linked(f))[0]).toEqual(original);
  expect((await pool.query("SELECT remote_room_id FROM channex_inbound_rooms WHERE connection_id=$1",[f.id])).rows[0].remote_room_id).toBe("remote-0");
  expect((await pool.query("SELECT * FROM reservation_changelog WHERE reservation_id=$1",[original.id])).rows).toHaveLength(1);
 });
 it("does not guess regenerated identities in a multi-room modification",async()=>{
  const f=await fixture();await apply(f,revision(f.id,"booking-ambiguous","ambiguous-original","new",undefined,2));const before=await linked(f);
  const change=revision(f.id,"booking-ambiguous","ambiguous-change","modified","2026-10-30T01:00:00Z",2);
  change.attributes.rooms.forEach((room,i)=>room.id=`changed-${i}`);
  expect((await apply(f,change)).review_code).toBe("ROOM_IDENTITY_REQUIRES_REVIEW");
  expect(await linked(f)).toEqual(before);
 });
 it("preserves both stays when an arrival-hour edit regenerates and reorders distinct room identities",async()=>{
  const f=await fixture(2,true);
  const first:any=revision(f.id,"booking-multi-hour","multi-hour-original","new",undefined,2);
  first.attributes.arrival_hour="15:00";first.attributes.rooms[1].rate_plan_id="other-plan";
  expect((await apply(f,first)).status).toBe("applied");const before=await linked(f);
  const change:any=structuredClone(first);change.id="multi-hour-change";
  Object.assign(change.attributes,{status:"modified",inserted_at:"2026-10-30T01:00:00Z",arrival_hour:"18:00"});
  change.attributes.rooms.forEach((room:any,i:number)=>room.id=`new-hour-${i}`);change.attributes.rooms.reverse();
  expect((await apply(f,change)).status).toBe("applied");await apply(f,change);
  const after=await linked(f);expect(after).toHaveLength(2);
  for(let i=0;i<2;i++)expect(after[i]).toMatchObject({id:before[i].id,room_id:before[i].room_id,reservation_code:before[i].reservation_code,total_room_amount:before[i].total_room_amount,status:"confirmed"});
  expect((await pool.query("SELECT payload->'attributes'->>'arrival_hour' AS hour FROM channex_inbound_revisions WHERE connection_id=$1 AND revision_id=$2",[f.id,change.id])).rows[0].hour).toBe("18:00");
  expect((await apply(f,revision(f.id,"booking-multi-hour","multi-hour-cancel","cancelled","2026-10-30T02:00:00Z"))).status).toBe("applied");
  expect((await linked(f)).every(r=>r.status==="cancelled")).toBe(true);
 });
 it("keeps stable room links while remapping the one regenerated room in a multi-room revision",async()=>{
  const f=await fixture();await apply(f,revision(f.id,"booking-partial-id","partial-original","new",undefined,2));const before=await linked(f);
  const change=revision(f.id,"booking-partial-id","partial-change","modified","2026-10-30T01:00:00Z",2);
  change.attributes.rooms[1].id="new-partial-room";
  expect((await apply(f,change)).status).toBe("applied");
  expect(new Set((await linked(f)).map(r=>r.id))).toEqual(new Set(before.map(r=>r.id)));
 });
 it("rolls back all multi-room identity remaps if a later room fails capacity validation",async()=>{
  const f=await fixture(2,true);
  const first=revision(f.id,"booking-multi-rollback","multi-rollback-original","new",undefined,2);first.attributes.rooms[1].rate_plan_id="other-plan";
  expect((await apply(f,first)).status).toBe("applied");const before=await linked(f);
  const change=structuredClone(first);change.id="multi-rollback-change";change.attributes.status="modified";change.attributes.inserted_at="2026-10-30T01:00:00Z";
  change.attributes.rooms.forEach((room,i)=>room.id=`new-rollback-${i}`);change.attributes.rooms[1].occupancy.adults=20;
  expect((await apply(f,change)).review_code).toBe("OCCUPANCY_EXCEEDS_CAPACITY");expect(await linked(f)).toEqual(before);
  expect((await pool.query("SELECT remote_room_id FROM channex_inbound_rooms WHERE connection_id=$1 ORDER BY remote_room_id",[f.id])).rows.map(r=>r.remote_room_id)).toEqual(["remote-0","remote-1"]);
 });
 it("cancels all owned rooms once and releases availability without payments",async()=>{
  const f=await fixture();await apply(f,revision(f.id,"booking-cancel","cancel-original","new",undefined,2));
  const r=revision(f.id,"booking-cancel","cancel-final","cancelled","2026-10-30T01:00:00Z");expect((await apply(f,r)).status).toBe("applied");
  expect((await linked(f)).every(r=>r.status==="cancelled")).toBe(true);await apply(f,r);expect(await linked(f)).toHaveLength(2);
 });
 it("rolls back a whole multi-room booking if the pilot has only one free room",async()=>{
  const f=await fixture(1);
  const before=(await pool.query("SELECT (SELECT count(*) FROM guests)::int AS guests,(SELECT count(*) FROM channex_ari_outbox WHERE connection_id=$1)::int AS events",[f.id])).rows[0];
  expect((await apply(f,revision(f.id,"booking-conflict","conflict","new",undefined,2))).status).toBe("review");
  expect((await pool.query("SELECT revision_id FROM channex_inbound_settlements WHERE connection_id=$1",[f.id])).rows).toHaveLength(0);
  expect((await pool.query("SELECT (SELECT count(*) FROM guests)::int AS guests,(SELECT count(*) FROM channex_ari_outbox WHERE connection_id=$1)::int AS events",[f.id])).rows[0]).toEqual({...before,events:before.events+1});
  expect(await linked(f)).toHaveLength(0);expect((await pool.query("SELECT id FROM reservations WHERE external_reservation_id='booking-conflict'")).rows).toHaveLength(0);
 });
 it("does not overwrite a reservation changed by reception",async()=>{
  const f=await fixture();await apply(f,revision(f.id,"booking-local","local-original"));const [r]=await linked(f);
  await storage.updateReservation(r.id,{numberOfGuests:1});expect((await apply(f,revision(f.id,"booking-local","local-mod","modified","2026-10-30T01:00:00Z"))).review_code).toBe("LOCAL_RESERVATION_CHANGED");
  expect((await linked(f))[0].number_of_guests).toBe(1);
 });
 it("keeps paid reservations for review and never reverses money on cancellation",async()=>{
  const f=await fixture();await apply(f,revision(f.id,"booking-paid","paid-original"));const [r]=await linked(f);
  await pool.query("INSERT INTO payments(id,reservation_id,amount,method,date,status) VALUES($1,$2,100,'efectivo',CURRENT_DATE,'active')",[randomUUID(),r.id]);
  expect((await apply(f,revision(f.id,"booking-paid","paid-cancel","cancelled","2026-10-30T01:00:00Z"))).review_code).toBe("LOCAL_FINANCIAL_HISTORY");
  expect((await linked(f))[0].status).toBe("confirmed");
 });
 it("does not create a peso reservation from a USD booking",async()=>{
  const f=await fixture(),r=revision(f.id,"booking-usd","usd");r.attributes.currency="USD";
  await expect(apply(f,r)).rejects.toMatchObject({code:'ASSIGNMENT_REQUIRES_REVIEW'});expect(await linked(f)).toHaveLength(0);
 });
 it("imports USD with a frozen audited quote, preserves originals and cancels without cash",async()=>{
  const f=await fixture();
  await pool.query("UPDATE rate_plans SET currency='USD' WHERE id=$1",[f.plan]);
  await pool.query("UPDATE channex_ari_settings SET currency='USD' WHERE connection_id=$1",[f.id]);
  await saveSettlementRate(pool,f.id,{rate:"1250.123456",reason:"Cotización manual de pruebas"},"Test operator");
  const original=revision(f.id,"booking-fx","fx-new");original.attributes.currency="USD";
  expect((await apply(f,original)).status).toBe("applied");
  const [r]=await linked(f);expect(r.total_room_amount).toBe("312530.86");expect(r.rate_plan_id).toBeNull();
  expect(r.nightly_pricing.map((night:any)=>night.rateCents)).toEqual([12501234,18751852]);
  const snapshot=(await pool.query("SELECT * FROM channex_inbound_settlements WHERE connection_id=$1",[f.id])).rows[0];
  expect(snapshot).toMatchObject({source_currency:"USD",source_total:"250.00",exchange_rate:"1250.123456",settlement_currency:"ARS",settlement_total:"312530.86"});
  expect(snapshot.source_nights.map((night:any)=>night.rateCents)).toEqual([10000,15000]);
  await saveSettlementRate(pool,f.id,{rate:"2000",reason:"Nueva cotización solo futuras reservas"},"Test operator");
  const future=revision(f.id,"booking-fx-future","fx-future");future.attributes.currency="USD";
  expect((await apply(f,future)).status).toBe("applied");
  expect((await pool.query("SELECT total_room_amount FROM reservations WHERE external_reservation_id='booking-fx-future' AND id=ANY($1::varchar[])",[(await linked(f)).map(r=>r.id)])).rows[0].total_room_amount).toBe("500000.00");
  await saveSettlementRate(pool,f.id,{rate:null,reason:"Pausar cotización para futuras reservas"},"Test operator");
  const modified=revision(f.id,"booking-fx","fx-mod","modified","2026-10-30T01:00:00Z");modified.attributes.currency="USD";
  modified.attributes.rooms[0].id="fx-regenerated-room";
  modified.attributes.amount="270";modified.attributes.rooms[0].days[secondNight]="170.00";
  expect((await apply(f,modified)).status).toBe("applied");
  expect((await pool.query("SELECT total_room_amount FROM reservations WHERE id=$1",[r.id])).rows[0].total_room_amount).toBe("337533.33");
  expect((await pool.query("SELECT exchange_rate FROM channex_inbound_settlements WHERE connection_id=$1 AND revision_id='fx-mod'",[f.id])).rows[0].exchange_rate).toBe("1250.123456");
  expect((await apply(f,revision(f.id,"booking-fx","fx-cancel","cancelled","2026-10-30T02:00:00Z"))).status).toBe("applied");
  expect((await pool.query("SELECT status FROM reservations WHERE id=$1",[r.id])).rows[0].status).toBe("cancelled");
  expect((await pool.query("SELECT id FROM payments WHERE reservation_id=$1",[r.id])).rows).toHaveLength(0);
  expect((await pool.query("SELECT id FROM sales_invoices WHERE reserva_id=$1",[r.id])).rows).toHaveLength(0);
  expect((await pool.query("SELECT * FROM channex_settlement_rate_edits WHERE connection_id=$1",[f.id])).rows).toHaveLength(3);
  const today=(await pool.query("SELECT CURRENT_DATE::text AS day")).rows[0].day;
  const outgoing=await buildAriValues(pool,{id:f.id,channex_property_id:f.id,floor:2,currency:"USD"},[{id:"test",kind:"restrictions",date_from:today,date_to:today,room_type_id:null,rate_plan_id:null,attempts:0}],today);
  expect(outgoing[0].rate).toBe("100.00");
 });
 it("allows configuring a quote while reception remains paused",async()=>{
  const f=await fixture();await pool.query("DELETE FROM channex_inbound_settings WHERE connection_id=$1",[f.id]);
  await saveSettlementRate(pool,f.id,{rate:"1250",reason:"Preparar antes de activar recepción"},"Test operator");
  expect((await pool.query("SELECT enabled,notification_pending,settlement_exchange_rate FROM channex_inbound_settings WHERE connection_id=$1",[f.id])).rows[0]).toMatchObject({enabled:false,notification_pending:false,settlement_exchange_rate:"1250.000000"});
 });
 it("requires review when the source changes currency on an existing booking",async()=>{
  const f=await fixture();expect((await apply(f,revision(f.id,"booking-currency","currency-original"))).status).toBe("applied");
  await pool.query("UPDATE channex_ari_settings SET currency='USD' WHERE connection_id=$1",[f.id]);await pool.query("UPDATE rate_plans SET currency='USD' WHERE id=$1",[f.plan]);
  await saveSettlementRate(pool,f.id,{rate:"1250",reason:"Prueba de cambio de moneda"},"Test operator");
  const changed=revision(f.id,"booking-currency","currency-changed","modified","2026-10-30T01:00:00Z");changed.attributes.currency="USD";
  expect((await apply(f,changed)).review_code).toBe("SOURCE_CURRENCY_CHANGED");expect((await linked(f))[0].total_room_amount).toBe("250.00");
 });
 it("does not create a USD booking without a quote or when conversion overflows",async()=>{
  const f=await fixture();await pool.query("UPDATE rate_plans SET currency='USD' WHERE id=$1",[f.plan]);await pool.query("UPDATE channex_ari_settings SET currency='USD' WHERE connection_id=$1",[f.id]);
  const pending=revision(f.id,"booking-no-rate","no-rate");pending.attributes.currency="USD";
  await expect(apply(f,pending)).rejects.toMatchObject({code:'SETTLEMENT_RATE_REQUIRED'});
  await saveSettlementRate(pool,f.id,{rate:"999999",reason:"Prueba de límite de importes"},"Test operator");
  const overflow=revision(f.id,"booking-overflow","overflow");overflow.attributes.currency="USD";
  await expect(apply(f,overflow)).rejects.toMatchObject({code:'SETTLEMENT_AMOUNT_EXCEEDS_LIMIT'});expect(await linked(f)).toHaveLength(0);
  expect((await pool.query("SELECT * FROM channex_inbound_settlements WHERE connection_id=$1",[f.id])).rows).toHaveLength(0);
 });
 it("rolls back a quote and its audit together if saving fails",async()=>{
  const f=await fixture();
  const failingPool={connect:async()=>{
   const client=await pool.connect();return {release:()=>client.release(),query:async(q:string,args:any[])=>{const result=await client.query(q,args);if(q.startsWith("UPDATE channex_inbound_settings SET settlement_exchange_rate"))throw Error("Synthetic save failure");return result;}};
  }};
  await expect(saveSettlementRate(failingPool as any,f.id,{rate:"1250",reason:"Rollback de prueba"},"Test operator")).rejects.toThrow("Synthetic save failure");
  expect((await pool.query("SELECT settlement_exchange_rate FROM channex_inbound_settings WHERE connection_id=$1",[f.id])).rows[0].settlement_exchange_rate).toBeNull();
  expect((await pool.query("SELECT id FROM channex_settlement_rate_edits WHERE connection_id=$1",[f.id])).rows).toHaveLength(0);
 });
 it("previews selected USD occupancy prices and Stop Sell without changing paused dispatch or the queue",async()=>{
  const f=await fixture(2),selected=`${f.id}-1`;
  await pool.query("UPDATE channex_ari_settings SET enabled=false,currency='USD',room_ids=$2::text[] WHERE connection_id=$1",[f.id,[selected]]);
  await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id=$1",[f.id]);
  await pool.query("UPDATE rate_plans SET currency='USD',base_rate=145,rate_1pax=120,rate_2pax=145 WHERE id=$1",[f.plan]);
  await pool.query("UPDATE channex_rate_plan_mappings SET sell_mode='per_person',rate_mode='manual',occupancies=ARRAY[1,2] WHERE connection_id=$1",[f.id]);
  await pool.query("INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,stop_sell) VALUES($1,$2::date,true)",[f.plan,databaseToday]);
  const before=(await pool.query("SELECT count(*) AS n FROM channex_ari_outbox WHERE connection_id=$1",[f.id])).rows[0].n;
  const preview=await previewChannexAri(pool,f.id);
  expect(preview).toMatchObject({currency:'USD',from:databaseToday,through:addDays(databaseToday,499),rooms:[{number:selected}],remoteVerified:false});
  expect(preview!.availability.every(value=>value.availability===1)).toBe(true);
  expect(preview!.restrictions[0]).toMatchObject({date_from:databaseToday,date_to:databaseToday,stop_sell:true,rates:[{occupancy:1,rate:'120.00'},{occupancy:2,rate:'145.00'}]});
  expect(preview!.restrictions.some(value=>value.stop_sell===false)).toBe(true);
  expect((await pool.query("SELECT count(*) AS n FROM channex_ari_outbox WHERE connection_id=$1",[f.id])).rows[0].n).toBe(before);
  expect((await pool.query("SELECT enabled FROM channex_ari_settings WHERE connection_id=$1",[f.id])).rows[0].enabled).toBe(false);
  expect(await linked(f)).toHaveLength(0);
  expect(JSON.stringify(preview)).not.toContain('api_key');
  expect(await previewChannexAri(pool,randomUUID())).toBeNull();
 });
 it("readiness respects a single selected room without requiring unrelated tariffs",async()=>{
  const f=await fixture(2),selected=`${f.id}-1`,outside=`${f.id}-0`;
  await pool.query("UPDATE channex_ari_settings SET enabled=false,room_ids=$2::text[] WHERE connection_id=$1",[f.id,[selected]]);
  await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id=$1",[f.id]);
  await pool.query("UPDATE channex_room_type_mappings SET room_ids=$2::text[] WHERE connection_id=$1",[f.id,[selected]]);
  await pool.query("INSERT INTO channex_room_type_mappings(id,connection_id,channex_room_type_id,channex_room_type_title,room_type_id,room_ids) VALUES($1,$2,'outside-type','Outside pilot',$3,$4::text[])",[randomUUID(),f.id,f.type,[outside]]);
  await pool.query("INSERT INTO channex_rate_plan_mappings(id,connection_id,channex_room_type_id,channex_rate_plan_id,channex_rate_plan_title) VALUES($1,$2,'outside-type','outside-plan','Unmapped outside pilot')",[randomUUID(),f.id]);
  const count=async()=>Number((await pool.query("SELECT count(*) AS n FROM channex_ari_outbox WHERE connection_id=$1",[f.id])).rows[0].n);
  const check=async()=>{
   const before=await count();
   const report=await getChannexReadiness(pool,f.id);
   expect(await count()).toBe(before);
   return report;
  };
  const scoped=await check();
  expect(scoped!.roomCount).toBe(1);
  expect(scoped!.checks.find(c=>c.id==='inventory')?.ok).toBe(true);
  expect(scoped!.checks.find(c=>c.id==='ari_values')?.ok).toBe(true);
  await pool.query("UPDATE channex_rate_plan_mappings SET rate_plan_id=NULL WHERE connection_id=$1 AND channex_rate_plan_id='remote-plan'",[f.id]);
  expect((await check())!.checks.find(c=>c.id==='ari_values')?.ok).toBe(false);
  await pool.query("UPDATE channex_rate_plan_mappings SET rate_plan_id=$2 WHERE connection_id=$1 AND channex_rate_plan_id='remote-plan'",[f.id,f.plan]);
  await pool.query("UPDATE channex_ari_settings SET room_ids=NULL WHERE connection_id=$1",[f.id]);
  const whole=await check();
  expect(whole!.roomCount).toBeGreaterThanOrEqual(2);
  expect(whole!.checks.find(c=>c.id==='ari_values')?.ok).toBe(false);
  expect(await linked(f)).toHaveLength(0);
 });
 it("checks the actual 500-day transformation without writing or declaring certification",async()=>{
  const f=await fixture();
  const before=(await pool.query("SELECT count(*)::int AS n FROM channex_ari_outbox WHERE connection_id=$1",[f.id])).rows[0].n;
  const report=await getChannexReadiness(pool,f.id);
  expect(report).toMatchObject({currency:"ARS",floor:2,configurationReady:false,certificationReady:false,remoteVerified:false});
  expect(report!.roomCount).toBeGreaterThanOrEqual(2);
  expect(report!.checks.find(c=>c.id==="ari_values")?.ok).toBe(true);
  expect(report!.checks.find(c=>c.id==="credential")?.ok).toBe(false);
  expect(report!.checks.find(c=>c.id==="certification_currency")?.ok).toBe(false);
  expect((await pool.query("SELECT count(*)::int AS n FROM channex_ari_outbox WHERE connection_id=$1",[f.id])).rows[0].n).toBe(before);
  expect(await linked(f)).toHaveLength(0);
  expect(JSON.stringify(report)).not.toContain("api_key_encrypted");
 });
 it("detects expired rates and separates USD publication from unsupported USD reception",async()=>{
  const f=await fixture();
  await pool.query("UPDATE rate_plans SET valid_to=CURRENT_DATE+10 WHERE id=$1",[f.plan]);
  const expired=await getChannexReadiness(pool,f.id);
  expect(expired!.checks.find(c=>c.id==="ari_values")).toMatchObject({ok:false,message:expect.stringContaining("vigente")});
  await pool.query("UPDATE rate_plans SET valid_to=NULL,currency='USD' WHERE id=$1",[f.plan]);
  await pool.query("UPDATE channex_ari_settings SET currency='USD' WHERE connection_id=$1",[f.id]);
  const usd=await getChannexReadiness(pool,f.id);
  expect(usd!.checks.find(c=>c.id==="ari_values")?.ok).toBe(true);
  expect(usd!.checks.find(c=>c.id==="reservation_currency")?.ok).toBe(false);
  expect(usd!.checks.find(c=>c.id==="certification_currency")?.ok).toBe(true);
  expect(usd!.configurationReady).toBe(false);expect(usd!.certificationReady).toBe(false);
  expect(await getChannexReadiness(pool,randomUUID())).toBeNull();
 });
 it("distinguishes complete local configuration from activation and remote certification",async()=>{
  const f=await fixture();
  vi.stubEnv("CHANNEX_CREDENTIALS_ENCRYPTION_KEY","isolated-readiness-test-key-not-a-real-credential");
  vi.stubEnv("CHANNEX_ARI_STAGING_ENABLED","");vi.stubEnv("CHANNEX_INBOUND_STAGING_ENABLED","");
  try {
   const {encryptChannexApiKey}=await import("../channex/credentials");
   await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id=$1",[f.id]);
   await pool.query("UPDATE channex_ari_settings SET enabled=false,floor=81 WHERE connection_id=$1",[f.id]);
   await pool.query("UPDATE rooms SET floor=81 WHERE room_type_id=$1",[f.type]);
   await pool.query("UPDATE channex_connections SET api_key_encrypted=$2 WHERE id=$1",[f.id,encryptChannexApiKey("synthetic-not-a-provider-key")]);
   const report=await getChannexReadiness(pool,f.id);
   expect(report).toMatchObject({configurationReady:true,activationReady:false,certificationReady:false,roomCount:2});
   expect(JSON.stringify(report)).not.toContain("synthetic-not-a-provider-key");
   await pool.query("UPDATE channex_ari_settings SET enabled=true WHERE connection_id=$1",[f.id]);
   await pool.query("UPDATE channex_inbound_settings SET enabled=true,token_hash=$2 WHERE connection_id=$1",[f.id,"ab".repeat(32)]);
   vi.stubEnv("CHANNEX_ARI_STAGING_ENABLED","true");vi.stubEnv("CHANNEX_INBOUND_STAGING_ENABLED","true");
   expect(await getChannexReadiness(pool,f.id)).toMatchObject({configurationReady:true,activationReady:true,certificationReady:false,remoteVerified:false});
  } finally {vi.unstubAllEnvs();}
 });
 it("updates its own guest contact but preserves manual profile edits",async()=>{
  const f=await fixture();await apply(f,revision(f.id,"booking-guest","guest-new"));
  const r=revision(f.id,"booking-guest","guest-mod","modified","2026-10-30T01:00:00Z");r.attributes.customer.surname="Updated";
  expect((await apply(f,r)).status).toBe("applied");const [row]=await linked(f);
  expect((await storage.getGuest(row.guest_id))?.lastName).toBe("Updated");
  await storage.updateGuest(row.guest_id,{lastName:"Reception edit"});
  expect((await apply(f,revision(f.id,"booking-guest","guest-conflict","modified","2026-10-30T02:00:00Z"))).review_code).toBe("LOCAL_GUEST_CHANGED");
  expect((await storage.getGuest(row.guest_id))?.lastName).toBe("Reception edit");
 });
 it("ACKs only a committed revision and retains failed ACKs with Retry-After",async()=>{
  const f=await fixture();await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id<>$1",[f.id]);
  await pool.query("UPDATE channex_inbound_settings SET notification_pending=true WHERE connection_id=$1",[f.id]);
  const {runInboundOnce}=await import("../channex/inboundWorker"),{ChannexApiError}=await import("../channex/client");let acknowledgments=0;
  const remote={feed:async()=>[revision(f.id,"booking-ack","ack-revision")],ack:async(_c:any,id:string)=>{
   expect((await pool.query("SELECT revision_id FROM channex_inbound_revisions WHERE connection_id=$1 AND revision_id=$2",[f.id,id])).rows).toHaveLength(1);
   acknowledgments++;if(acknowledgments===1)throw new ChannexApiError("rate limited",429,null,"120");
  }};
  const options={enabled:true,transport:remote,apply:async()=>{}};
  await pool.query("UPDATE channex_inbound_dispatch SET next_request_at=now()");await runInboundOnce(pool,options);expect(acknowledgments).toBe(0);
  await pool.query("UPDATE channex_inbound_dispatch SET next_request_at=now()");await runInboundOnce(pool,options);
  const held=(await pool.query("SELECT acked_at,ack_attempts,next_ack_at>now()+interval '100 seconds' AS delayed FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows[0];
  expect(held).toMatchObject({acked_at:null,ack_attempts:1,delayed:true});
  await pool.query("UPDATE channex_inbound_dispatch SET next_request_at=now()");await pool.query("UPDATE channex_inbound_revisions SET next_ack_at=now() WHERE connection_id=$1",[f.id]);await runInboundOnce(pool,options);
  expect((await pool.query("SELECT acked_at FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows[0].acked_at).not.toBeNull();expect(acknowledgments).toBe(2);expect(await linked(f)).toHaveLength(0);
 });
 it("does not lose a webhook notification received during an empty feed fetch",async()=>{
  const f=await fixture();await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id<>$1",[f.id]);await pool.query("UPDATE channex_inbound_settings SET notification_pending=true WHERE connection_id=$1",[f.id]);
  const {runInboundOnce}=await import("../channex/inboundWorker");await pool.query("UPDATE channex_inbound_dispatch SET next_request_at=now()");
  await runInboundOnce(pool,{enabled:true,apply:async()=>{},transport:{feed:async()=>{await pool.query("UPDATE channex_inbound_settings SET notification_version=notification_version+1 WHERE connection_id=$1",[f.id]);return [];},ack:async()=>{throw Error("unexpected ACK");}}});
  expect((await pool.query("SELECT notification_pending FROM channex_inbound_settings WHERE connection_id=$1",[f.id])).rows[0].notification_pending).toBe(true);
 });
 it("protects durable received history against deleting its connection",async()=>{
  const f=await fixture();await service.persistInboundRevision(pool,f.id,revision(f.id,"booking-history","history"));
  await pool.query("UPDATE channex_ari_settings SET enabled=false WHERE connection_id=$1",[f.id]);
  await expect(pool.query("DELETE FROM channex_connections WHERE id=$1",[f.id])).rejects.toThrow("CHANNEX_INBOUND_HISTORY_REQUIRES_REVIEW");
  expect((await pool.query("SELECT revision_id FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows).toHaveLength(1);
 });
 it("does not duplicate an external reference already entered in the PMS",async()=>{
  const f=await fixture(),guest=await storage.createGuest({firstName:"Manual",lastName:"External"});guestIds.add(guest.id);
  const r=await storage.createReservation({reservationCode:randomUUID(),guestId:guest.id,roomTypeId:f.type,roomId:`${f.id}-0`,
   checkInDate:arrival,checkOutDate:departure,nights:2,totalRoomAmount:"250",baseRatePerNight:"125",finalRatePerNight:"125",createdAt:new Date(),status:"confirmed",source:"ota",externalReservationId:`manual-${f.id}`});
  try {
   expect((await apply(f,revision(f.id,`manual-${f.id}`,"external-duplicate"))).review_code).toBe("UNLINKED_EXTERNAL_RESERVATION");
   expect((await pool.query("SELECT id FROM reservations WHERE external_reservation_id=$1",[`manual-${f.id}`])).rows).toHaveLength(1);
  } finally {await pool.query("DELETE FROM audit_logs WHERE entity_id=$1",[r.id]);await pool.query("DELETE FROM reservation_changelog WHERE reservation_id=$1",[r.id]);await pool.query("DELETE FROM reservations WHERE id=$1",[r.id]);}
 });
 it("rejects production connections before storing or applying a revision",async()=>{
  const f=await fixture();await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id=$1",[f.id]);await pool.query("UPDATE channex_ari_settings SET enabled=false WHERE connection_id=$1",[f.id]);
  await expect(pool.query("UPDATE channex_connections SET environment='real' WHERE id=$1",[f.id])).rejects.toThrow("otra conexión");
  const real=randomUUID();owners.push(real);
  await pool.query("INSERT INTO channex_connections(id,label,environment,channex_property_id,base_url,is_active,created_at) VALUES($1::text,'Production disabled','real',$1::text,'https://app.channex.io/api/v1',true,now())",[real]);
  await expect(service.persistInboundRevision(pool,real,revision(real,"production-blocked","production"))).rejects.toThrow("STAGING_ONLY");
  expect((await pool.query("SELECT revision_id FROM channex_inbound_revisions WHERE connection_id=$1",[real])).rows).toHaveLength(0);
 });
 it("retains immutable revisions and redacts card data before storing them",async()=>{
  const f=await fixture(),r:any=revision(f.id,"booking-hash","hash");r.attributes.guarantee={card_number:"sensitive"};await service.persistInboundRevision(pool,f.id,r);
  const changed=structuredClone(r);changed.attributes.amount="260";await service.persistInboundRevision(pool,f.id,changed);
  const row=(await pool.query("SELECT * FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows[0];
  expect(row.review_code).toBe("REVISION_ID_COLLISION");expect(JSON.stringify(row.payload)).not.toContain("sensitive");expect(row.payload.attributes.amount).toBe("250");
 });
 it("preserves committed contact data on masked replay and does not ACK an unknown masked revision",async()=>{
  const f=await fixture(),r:any=revision(f.id,"booking-masked","masked-replay");
  r.attributes.customer.mail="synthetic@example.invalid";r.attributes.customer.phone="555123";
  await service.persistInboundRevision(pool,f.id,r);
  await pool.query("UPDATE channex_inbound_revisions SET acked_at=now() WHERE connection_id=$1",[f.id]);
  const masked=structuredClone(r);masked.attributes.customer.mail="***";masked.attributes.customer.phone="***";
  await service.persistInboundRevision(pool,f.id,masked);
  let row=(await pool.query("SELECT * FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows[0];
  expect(row.status).toBe("pending");expect(row.review_code).toBeNull();expect(row.payload.attributes.customer.mail).toBe("synthetic@example.invalid");
  masked.attributes.amount="999";await service.persistInboundRevision(pool,f.id,masked);
  row=(await pool.query("SELECT * FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows[0];expect(row.review_code).toBe("REVISION_ID_COLLISION");
  masked.id="masked-new";await service.persistInboundRevision(pool,f.id,masked);
  row=(await pool.query("SELECT * FROM channex_inbound_revisions WHERE connection_id=$1 AND revision_id=$2",[f.id,masked.id])).rows[0];expect(row.review_code).toBe("MASKED_GUEST_DATA");
  await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id<>$1",[f.id]);
  await pool.query("UPDATE channex_inbound_dispatch SET next_request_at=now()");
  const {runInboundOnce}=await import("../channex/inboundWorker");const ack=vi.fn();
  await runInboundOnce(pool,{enabled:true,transport:{feed:async()=>[],ack},apply:async()=>{}});
  expect(ack).not.toHaveBeenCalled();
 });
 it("commits encrypted operational notes before the remote ACK",async()=>{
  vi.stubEnv("CHANNEX_CREDENTIALS_ENCRYPTION_KEY","synthetic-archive-test-secret-at-least-32-chars");
  try {
   const f=await fixture(),r:any=revision(f.id,"booking-notes","notes-before-ack");r.attributes.notes="Llegada tarde";
   await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id<>$1",[f.id]);
   await service.persistInboundRevision(pool,f.id,r);
   const {runInboundOnce}=await import("../channex/inboundWorker"),{readBookingNotes}=await import("../channex/bookingPrivate");
   const ack=vi.fn(async()=>{
    const row=(await pool.query("SELECT payload,private_notes_encrypted FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows[0];
    expect(row.payload.attributes.notes).toBe("[redacted]");
    expect(readBookingNotes(row.private_notes_encrypted,f.id,r.id)).toEqual({notes:"Llegada tarde"});
   });
   await pool.query("UPDATE channex_inbound_dispatch SET next_request_at=now()");
   await runInboundOnce(pool,{enabled:true,transport:{feed:async()=>[],ack},apply:async()=>{}});expect(ack).toHaveBeenCalledOnce();
  } finally {vi.unstubAllEnvs();}
 });

 it("routes one account feed across its hotels without touching another account or unknown hotels",async()=>{
  vi.stubEnv("CHANNEX_CREDENTIALS_ENCRYPTION_KEY","synthetic-account-test-secret-at-least-32-chars");
  try {
   const first=await fixture(),second=await fixture(),other=await fixture();
   await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id<>ALL($1::varchar[])",[[first.id,second.id,other.id]]);
   await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id=ANY($1::varchar[])",[[first.id,second.id,other.id]]);
   const {encryptChannexApiKey}=await import("../channex/credentials");
   for(const f of [first,second,other]) await pool.query("UPDATE channex_connections SET api_key_encrypted=$2 WHERE id=$1",[f.id,encryptChannexApiKey(f.id===other.id?"other-account":"shared-account")]);
   await pool.query("UPDATE channex_inbound_settings SET enabled=true,notification_pending=false WHERE connection_id=ANY($1::varchar[])",[[first.id,second.id,other.id]]);
   await pool.query("UPDATE channex_inbound_settings SET notification_pending=true WHERE connection_id=$1",[first.id]);
   const {runInboundOnce}=await import("../channex/inboundWorker");
   const feed=vi.fn(async()=>{
    await pool.query("UPDATE channex_inbound_settings SET notification_pending=true,notification_version=notification_version+1 WHERE connection_id=$1",[second.id]);
    return [revision(first.id,"account-a","account-a"),revision(second.id,"account-b","account-b"),revision(other.id,"other","other"),revision("unknown","unknown","unknown")];
   });
   await pool.query("UPDATE channex_inbound_dispatch SET next_request_at=now()");
   await runInboundOnce(pool,{enabled:true,transport:{feed,ack:async()=>{}},apply:async()=>{}});
   expect(feed).toHaveBeenCalledOnce();
   const rows=(await pool.query("SELECT connection_id,revision_id FROM channex_inbound_revisions WHERE connection_id=ANY($1::varchar[]) ORDER BY revision_id",[[first.id,second.id,other.id]])).rows;
   expect(rows).toEqual([{connection_id:first.id,revision_id:"account-a"},{connection_id:second.id,revision_id:"account-b"}]);
   expect((await pool.query("SELECT notification_pending FROM channex_inbound_settings WHERE connection_id=$1",[second.id])).rows[0].notification_pending).toBe(true);
  } finally {vi.unstubAllEnvs();}
 });

 it("does not ACK historical rows until a fresh source has captured their notes",async()=>{
  vi.stubEnv("CHANNEX_CREDENTIALS_ENCRYPTION_KEY","synthetic-historical-secret-at-least-32-chars");
  try {
   const f=await fixture(),r:any=revision(f.id,"historical-notes","historical-notes");r.attributes.notes="Llegada nocturna";
   await service.persistInboundRevision(pool,f.id,r);
   await pool.query("UPDATE channex_inbound_revisions SET source_captured=false,private_notes_encrypted=NULL WHERE connection_id=$1",[f.id]);
   // A local parser retry cannot stand in for re-fetching the original notes.
   const {redactBooking}=await import("../channex/bookingRevision");
   await service.persistInboundRevision(pool,f.id,redactBooking(r),false);
   await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id<>$1",[f.id]);
   const {runInboundOnce}=await import("../channex/inboundWorker");const ack=vi.fn();
   await pool.query("UPDATE channex_inbound_dispatch SET next_request_at=now()");
   await runInboundOnce(pool,{enabled:true,transport:{feed:async()=>[],ack},apply:async()=>{}});expect(ack).not.toHaveBeenCalled();
   await service.persistInboundRevision(pool,f.id,r);
   const {readBookingNotes}=await import("../channex/bookingPrivate");
   const row=(await pool.query("SELECT source_captured,private_notes_encrypted FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows[0];
   expect(row.source_captured).toBe(true);expect(readBookingNotes(row.private_notes_encrypted,f.id,r.id)).toEqual({notes:"Llegada nocturna"});
  } finally {vi.unstubAllEnvs();}
 });

 async function namedPayload(f:any,booking:string,id:string,status='new',stamp='2026-11-01T00:00:00Z'){
  const raw:any=revision(f.id,booking,id,status,stamp,2);
  raw.attributes.customer={name:'Booker',surname:'Alpha',mail:'booker@example.invalid'};
  raw.attributes.rooms.forEach((r:any,i:number)=>{r.guests=[{name:i?'Guest':'Booker',surname:i?'Beta':'Alpha'}];r.meta={room_remarks:['BED PREFERENCE: 2 singoli - 1 matrimoniale alla francese']};});
  return raw;
 }
 async function guestState(f:any){return(await pool.query(`SELECT r.id,r.guest_id,g.first_name,g.last_name,g.email,r.bed_type_notes,r.ota_room_details,l.guest_hash
  FROM channex_inbound_rooms l JOIN reservations r ON r.id=l.reservation_id JOIN guests g ON g.id=r.guest_id WHERE l.connection_id=$1 ORDER BY l.remote_room_id`,[f.id])).rows;}
 async function financialState(f:any){return(await pool.query(`SELECT r.id,r.room_id,r.room_type_id,r.rate_plan_id,r.status,r.check_in_date,r.check_out_date,r.number_of_guests,r.nights,r.total_room_amount,r.base_rate_per_night,r.final_rate_per_night,r.nightly_pricing,r.pricing_revision FROM channex_inbound_rooms l JOIN reservations r ON r.id=l.reservation_id WHERE l.connection_id=$1 ORDER BY l.remote_room_id`,[f.id])).rows;}
 async function legacyFixture(){
  const f=await fixture(2),raw=await namedPayload(f,randomUUID(),randomUUID());
  const original=structuredClone(raw);original.attributes.rooms.forEach((r:any)=>{delete r.guests;delete r.meta;});
  expect((await apply(f,original)).status).toBe('applied');
  // Simulate the previous importer: the complete immutable source existed,
  // while its per-room guests and remarks had not been used by the PMS.
  const {redactBooking,revisionHash}=await import('../channex/bookingRevision');const stored=redactBooking(raw);
  await pool.query('UPDATE channex_inbound_revisions SET payload=$2,payload_hash=$3 WHERE connection_id=$1 AND revision_id=$4',[f.id,stored,revisionHash(stored),raw.id]);
  await pool.query('UPDATE reservations SET ota_room_details=NULL WHERE id IN(SELECT reservation_id FROM channex_inbound_rooms WHERE connection_id=$1)',[f.id]);
  await pool.query('UPDATE channex_inbound_rooms SET guest_hash=NULL WHERE connection_id=$1',[f.id]);
  return {f,raw};
 }
 it('imports each named room guest with exact USD totals and an explicitly shared bed request',async()=>{
  const f=await fixture(2),raw=await namedPayload(f,'named-usd',randomUUID());
  await pool.query("UPDATE channex_ari_settings SET currency='USD' WHERE connection_id=$1",[f.id]);await pool.query("UPDATE rate_plans SET currency='USD' WHERE id=$1",[f.plan]);
  await saveSettlementRate(pool,f.id,{rate:'1545',reason:'Synthetic reception quote'},'Synthetic');
  raw.attributes.currency='USD';raw.attributes.amount='195.20';raw.attributes.rooms.forEach((r:any)=>{r.amount='97.60';r.days={[arrival]:'48.80',[secondNight]:'48.80'};});
  expect((await apply(f,raw)).status).toBe('applied');
  const guests=await guestState(f);expect(guests.map(g=>g.first_name)).toEqual(['Booker','Guest']);expect(guests[1].email).toBeNull();expect(guests[0].guest_id).not.toBe(guests[1].guest_id);
  for(const g of guests){expect(g.ota_room_details.bedRequest.scope).toBe('booking');expect(g.bed_type_notes).toContain('confirmar distribución');expect(g.guest_hash).toBeTruthy();}
  expect((await linked(f)).map(r=>r.total_room_amount)).toEqual(['150792.00','150792.00']);
  expect((await pool.query('SELECT source_total FROM channex_inbound_settlements WHERE connection_id=$1 ORDER BY remote_room_id',[f.id])).rows).toEqual([{source_total:'97.60'},{source_total:'97.60'}]);
 });
 it('splits a legacy shared booker when a later revision names the second guest and preserves reception edits',async()=>{
  const f=await fixture(2),raw=await namedPayload(f,'split-guest',randomUUID());const initial=structuredClone(raw);initial.attributes.rooms.forEach((r:any)=>delete r.guests);
  await apply(f,initial);const before=await guestState(f);expect(before[0].guest_id).toBe(before[1].guest_id);
  raw.id=randomUUID();raw.attributes.status='modified';raw.attributes.inserted_at='2026-11-02T00:00:00Z';expect((await apply(f,raw)).status).toBe('applied');
  const after=await guestState(f);expect(after[0].guest_id).toBe(before[0].guest_id);expect(after[1].first_name).toBe('Guest');expect(after[1].guest_id).not.toBe(after[0].guest_id);
  await pool.query("UPDATE guests SET last_name='Reception correction' WHERE id=$1",[after[1].guest_id]);
  const next=structuredClone(raw);next.id=randomUUID();next.attributes.inserted_at='2026-11-03T00:00:00Z';
  expect((await apply(f,next)).review_code).toBe('LOCAL_GUEST_CHANGED');expect((await guestState(f))[1].last_name).toBe('Reception correction');
 });
 it('recovers old guest and bed information once without repricing, moving rooms or dispatching inventory',async()=>{
  vi.stubEnv('CHANNEX_INBOUND_STAGING_ENABLED','true');
  try{const {f}=await legacyFixture();const before=await financialState(f);
   const events=(await pool.query('SELECT count(*)::int n FROM channex_ari_outbox WHERE connection_id=$1',[f.id])).rows[0].n;
   await service.recoverStoredRoomDetails(pool);const after=await guestState(f);expect(after.map(r=>r.first_name)).toEqual(['Booker','Guest']);expect(after.every(r=>r.ota_room_details.guestStatus==='imported')).toBe(true);
   const planning=await storage.getPlanningData(arrival,departure);expect(planning.reservations[after[1].id]).toMatchObject({guestName:'Beta Guest',bedTypeName:'Pedido de camas del canal: confirmar preparación'});
   expect(await financialState(f)).toEqual(before);expect((await pool.query('SELECT count(*)::int n FROM channex_ari_outbox WHERE connection_id=$1',[f.id])).rows[0].n).toBe(events);
   await service.recoverStoredRoomDetails(pool);expect(await guestState(f)).toEqual(after);
  }finally{vi.unstubAllEnvs();}
 });
 it('keeps a locally corrected guest and bed choice during metadata recovery',async()=>{
  vi.stubEnv('CHANNEX_INBOUND_STAGING_ENABLED','true');
  try{const {f}=await legacyFixture(),rows=await guestState(f);await pool.query("UPDATE guests SET first_name='Reception guest' WHERE id=$1",[rows[0].guest_id]);
   await pool.query("UPDATE reservations SET bed_type_notes='Matrimonial confirmed by reception' WHERE id=$1",[rows[1].id]);
   await service.recoverStoredRoomDetails(pool);const after=await guestState(f);expect(after.every(r=>r.first_name==='Reception guest')).toBe(true);expect(after.every(r=>r.ota_room_details.guestStatus==='preserved_local')).toBe(true);expect(after[1].bed_type_notes).toBe('Matrimonial confirmed by reception');
  }finally{vi.unstubAllEnvs();}
 });
 it('keeps reception stay details during legacy metadata recovery',async()=>{
  vi.stubEnv('CHANNEX_INBOUND_STAGING_ENABLED','true');
  try{const {f}=await legacyFixture(),rows=await guestState(f);await pool.query("UPDATE reservations SET stay_details='{\"source\":\"reception\"}'::jsonb WHERE id=$1",[rows[1].id]);
   const before=await financialState(f);await service.recoverStoredRoomDetails(pool);const after=await guestState(f);expect(after[1].first_name).toBe('Booker');expect(after[1].ota_room_details.guestStatus).toBe('preserved_local');expect(await financialState(f)).toEqual(before);
   expect((await pool.query('SELECT stay_details FROM reservations WHERE id=$1',[rows[1].id])).rows[0].stay_details).toEqual({source:'reception'});
  }finally{vi.unstubAllEnvs();}
 });
 it('rolls the entire metadata recovery back if writing the second room fails',async()=>{
  vi.stubEnv('CHANNEX_INBOUND_STAGING_ENABLED','true');
  const {f}=await legacyFixture(),rows=await guestState(f),before=await financialState(f);
  await pool.query(`CREATE FUNCTION test_reject_metadata() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id='${rows[1].id}' AND NEW.ota_room_details IS NOT NULL THEN RAISE EXCEPTION 'synthetic metadata failure'; END IF; RETURN NEW; END$$; CREATE TRIGGER test_reject_metadata BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION test_reject_metadata()`);
  try{await service.recoverStoredRoomDetails(pool);expect((await guestState(f)).every(r=>r.ota_room_details===null)).toBe(true);expect(await financialState(f)).toEqual(before);}
  finally{await pool.query('DROP TRIGGER test_reject_metadata ON reservations; DROP FUNCTION test_reject_metadata()');vi.unstubAllEnvs();}
 });

 it('does not change the guest or existing payments when a legacy stay already has financial movements',async()=>{
  vi.stubEnv('CHANNEX_INBOUND_STAGING_ENABLED','true');let payment:string|undefined;
  try{const {f}=await legacyFixture(),rows=await guestState(f);payment=randomUUID();
   await pool.query("INSERT INTO payments(id,reservation_id,amount,method,date,status) VALUES($1,$2,100,'efectivo',CURRENT_DATE,'active')",[payment,rows[1].id]);
   const money=(await pool.query('SELECT * FROM payments WHERE id=$1',[payment])).rows,before=await financialState(f);
   await service.recoverStoredRoomDetails(pool);const after=await guestState(f);
   expect(after[1].first_name).toBe('Booker');expect(after[1].ota_room_details.guestStatus).toBe('preserved_local');expect(after[1].ota_room_details.guestNames).toEqual(['Guest Beta']);
   expect((await pool.query('SELECT * FROM payments WHERE id=$1',[payment])).rows).toEqual(money);expect(await financialState(f)).toEqual(before);
  }finally{if(payment)await pool.query('DELETE FROM payments WHERE id=$1',[payment]);vi.unstubAllEnvs();}
 });
 it('does not rewrite a checked-out legacy room or silently clear a registered bed preparation',async()=>{
  vi.stubEnv('CHANNEX_INBOUND_STAGING_ENABLED','true');
  try{const {f}=await legacyFixture(),rows=await guestState(f);
   await pool.query("UPDATE reservations SET status='checked_out' WHERE id=$1",[rows[0].id]);
   const prep={roomId:'synthetic',bedConfig:'MAT',bedRevision:1,bedTypeId:null,bedTypeNotes:null,confirmedAt:'2026-11-26T12:00:00Z',confirmedBy:'Reception'};
   await pool.query('UPDATE reservations SET housekeeping_bed_preparation=$2 WHERE id=$1',[rows[1].id,prep]);
   await service.recoverStoredRoomDetails(pool);
   expect((await pool.query('SELECT status,ota_room_details FROM reservations WHERE id=$1',[rows[0].id])).rows[0]).toEqual({status:'checked_out',ota_room_details:null});
   expect((await pool.query('SELECT housekeeping_bed_preparation FROM reservations WHERE id=$1',[rows[1].id])).rows[0].housekeeping_bed_preparation).toEqual(prep);
  }finally{vi.unstubAllEnvs();}
 });

});
