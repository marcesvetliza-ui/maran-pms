import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureChannexInboundSchema } from "../channex/inboundSchema";
import { ensureChannexAriSchema } from "../channex/ariSchema";
import { STAGING_URL } from "../channex/ari";
import { getChannexReadiness } from "../channex/readiness";
const allowed = ["postgresql://postgres@127.0.0.1:55448/rate_calendar_boot_20261029", "postgresql://postgres@127.0.0.1:55448/channex_inbound_test"].includes(process.env.DATABASE_URL || "") ||
 (process.env.CI==="true"&&/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):5432\/maran_test$/.test(process.env.DATABASE_URL||""));
const suite=allowed?describe:describe.skip;
let pool:import("pg").Pool, service:typeof import("../channex/inbound"), storage:typeof import("../db-storage").storage;
const owners:string[]=[], types:string[]=[], guestIds=new Set<string>();
function revision(property:string, bookingId:string, id:string, status="new",stamp="2026-10-29T23:00:00Z",rooms=1){return {id,attributes:{property_id:property,booking_id:bookingId,inserted_at:stamp,status,
 arrival_date:"2026-11-10",departure_date:"2026-11-12",amount:String(rooms*250),currency:"ARS",customer:{name:"Channel",surname:"Test"},
 rooms:Array.from({length:rooms},(_,i)=>({id:`remote-${i}`,room_type_id:"remote-type",rate_plan_id:"remote-plan",occupancy:{adults:2},days:{"2026-11-10":"100.00","2026-11-11":"150.00"}}))}};}
async function fixture(rooms=2){
 const id=randomUUID(),type=randomUUID(),plan=randomUUID();owners.push(id);types.push(type);
 await pool.query("INSERT INTO room_types(id,code,name) VALUES($1,$2,$3)",[type,type,type]);
 await pool.query("INSERT INTO rate_plans(id,name,room_type_id,base_rate,currency) VALUES($1,'Test',$2,100,'ARS')",[plan,type]);
 for(let i=0;i<rooms;i++)await pool.query("INSERT INTO rooms(id,room_number,room_type_id,floor,status,is_active,is_virtual) VALUES($1,$2,$3,2,'available',true,false)",[`${id}-${i}`,`${id}-${i}`,type]);
 await pool.query("INSERT INTO channex_connections(id,label,environment,channex_property_id,base_url,is_active,created_at) VALUES($1,'Test','demo',$2,$3,true,now())",[id,id,STAGING_URL]);
 await pool.query("INSERT INTO channex_room_type_mappings(id,connection_id,channex_room_type_id,channex_room_type_title,room_type_id,created_at) VALUES($1,$2,'remote-type','Test',$3,now())",[id,id,type]);
 await pool.query("INSERT INTO channex_rate_plan_mappings(id,connection_id,channex_room_type_id,channex_rate_plan_id,channex_rate_plan_title,rate_plan_id,created_at) VALUES($1,$2,'remote-type','remote-plan','Test',$3,now())",[id,id,plan]);
 await pool.query("INSERT INTO channex_ari_settings(connection_id,floor,currency,enabled,capture_started_at) VALUES($1,2,'ARS',true,now())",[id]);
 await pool.query("INSERT INTO channex_inbound_settings(connection_id,enabled) VALUES($1,true)",[id]);
 return {id,type,plan};
}
async function apply(f:{id:string},r:any){await service.persistInboundRevision(pool,f.id,r);await service.applyInboundRevision(f.id,r.id);return (await pool.query("SELECT * FROM channex_inbound_revisions WHERE connection_id=$1 AND revision_id=$2",[f.id,r.id])).rows[0];}
async function linked(f:{id:string}){return (await pool.query("SELECT r.* FROM reservations r JOIN channex_inbound_rooms l ON l.reservation_id=r.id WHERE l.connection_id=$1 ORDER BY l.remote_room_id",[f.id])).rows;}
suite("real PMS Channex inbox on disposable PostgreSQL",()=>{
 beforeAll(async()=>{pool=(await import("../db")).pool;service=await import("../channex/inbound");storage=(await import("../db-storage")).storage;await ensureChannexAriSchema(pool);await ensureChannexInboundSchema(pool);await ensureChannexInboundSchema(pool);});
 afterAll(async()=>{
  for(const id of owners){
   const rows=await linked({id});rows.forEach(r=>guestIds.add(r.guest_id));
   await pool.query("DELETE FROM channex_inbound_rooms WHERE connection_id=$1",[id]);
   await pool.query("DELETE FROM channex_inbound_revisions WHERE connection_id=$1",[id]);
   await pool.query("UPDATE channex_ari_settings SET enabled=false WHERE connection_id=$1",[id]);
   await pool.query("DELETE FROM channex_connections WHERE id=$1",[id]);
   for(const r of rows){await pool.query("DELETE FROM payments WHERE reservation_id=$1",[r.id]);await pool.query("DELETE FROM audit_logs WHERE entity_id=$1",[r.id]);await pool.query("DELETE FROM reservations WHERE id=$1",[r.id]);}
  }
  for(const id of guestIds)await pool.query("DELETE FROM guests WHERE id=$1",[id]);
  for(const type of types){await pool.query("DELETE FROM rooms WHERE room_type_id=$1",[type]);await pool.query("DELETE FROM rate_plans WHERE room_type_id=$1",[type]);await pool.query("DELETE FROM room_types WHERE id=$1",[type]);}
  await pool?.end();
 });
 it("creates two rooms atomically with exact nightly prices and no cash or invoice",async()=>{
  const f=await fixture();expect((await apply(f,revision(f.id,"booking-multi","new-multi","new",undefined,2))).status).toBe("applied");
  const rows=await linked(f);expect(rows).toHaveLength(2);expect(new Set(rows.map(r=>r.room_id)).size).toBe(2);
  expect(rows[0].nightly_pricing).toEqual([{date:"2026-11-10",rateCents:10000,discountCents:0},{date:"2026-11-11",rateCents:15000,discountCents:0}]);
  expect((await pool.query("SELECT * FROM channex_ari_outbox WHERE connection_id=$1",[f.id])).rows.length).toBeGreaterThan(0);
  expect((await pool.query("SELECT id FROM payments WHERE reservation_id=ANY($1::varchar[])",[rows.map(r=>r.id)])).rows).toHaveLength(0);
  expect((await pool.query("SELECT id FROM sales_invoices WHERE reserva_id=ANY($1::varchar[])",[rows.map(r=>r.id)])).rows).toHaveLength(0);
 });
 it("replays a revision and concurrent application without duplicate reservations",async()=>{
  const f=await fixture(),r=revision(f.id,"booking-replay","replay");await service.persistInboundRevision(pool,f.id,r);
  await Promise.all([service.applyInboundRevision(f.id,r.id),service.applyInboundRevision(f.id,r.id)]);await apply(f,r);
  expect(await linked(f)).toHaveLength(1);expect((await pool.query("SELECT revision_id FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows).toHaveLength(1);
 });
 it("modifies nightly prices and ignores an older revision",async()=>{
  const f=await fixture();await apply(f,revision(f.id,"booking-mod","mod-original"));
  const change=revision(f.id,"booking-mod","mod-new","modified","2026-10-30T01:00:00Z");change.attributes.rooms[0].days["2026-11-11"]="200.00";change.attributes.amount="300";
  expect((await apply(f,change)).status).toBe("applied");expect(Number((await linked(f))[0].total_room_amount)).toBe(300);
  expect((await apply(f,revision(f.id,"booking-mod","mod-old","modified","2026-10-30T00:00:00Z"))).status).toBe("stale");expect(Number((await linked(f))[0].total_room_amount)).toBe(300);
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
  expect((await pool.query("SELECT (SELECT count(*) FROM guests)::int AS guests,(SELECT count(*) FROM channex_ari_outbox WHERE connection_id=$1)::int AS events",[f.id])).rows[0]).toEqual(before);
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
  expect((await apply(f,r)).review_code).toBe("UNSUPPORTED_CURRENCY");expect(await linked(f)).toHaveLength(0);
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
   checkInDate:"2026-11-10",checkOutDate:"2026-11-12",nights:2,totalRoomAmount:"250",baseRatePerNight:"125",finalRatePerNight:"125",createdAt:new Date(),status:"confirmed",source:"ota",externalReservationId:`manual-${f.id}`});
  try {
   expect((await apply(f,revision(f.id,`manual-${f.id}`,"external-duplicate"))).review_code).toBe("UNLINKED_EXTERNAL_RESERVATION");
   expect((await pool.query("SELECT id FROM reservations WHERE external_reservation_id=$1",[`manual-${f.id}`])).rows).toHaveLength(1);
  } finally {await pool.query("DELETE FROM audit_logs WHERE entity_id=$1",[r.id]);await pool.query("DELETE FROM reservations WHERE id=$1",[r.id]);}
 });
 it("rejects production connections before storing or applying a revision",async()=>{
  const f=await fixture();await pool.query("UPDATE channex_inbound_settings SET enabled=false WHERE connection_id=$1",[f.id]);await pool.query("UPDATE channex_ari_settings SET enabled=false WHERE connection_id=$1",[f.id]);
  await pool.query("UPDATE channex_connections SET environment='real' WHERE id=$1",[f.id]);
  await expect(service.persistInboundRevision(pool,f.id,revision(f.id,"production-blocked","production"))).rejects.toThrow("STAGING_ONLY");
  expect((await pool.query("SELECT revision_id FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows).toHaveLength(0);
 });
 it("retains immutable revisions and redacts card data before storing them",async()=>{
  const f=await fixture(),r:any=revision(f.id,"booking-hash","hash");r.attributes.guarantee={card_number:"sensitive"};await service.persistInboundRevision(pool,f.id,r);
  const changed=structuredClone(r);changed.attributes.amount="260";await service.persistInboundRevision(pool,f.id,changed);
  const row=(await pool.query("SELECT * FROM channex_inbound_revisions WHERE connection_id=$1",[f.id])).rows[0];
  expect(row.review_code).toBe("REVISION_ID_COLLISION");expect(JSON.stringify(row.payload)).not.toContain("sensitive");expect(row.payload.attributes.amount).toBe("250");
 });
});
