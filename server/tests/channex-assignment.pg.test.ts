import express from 'express';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureChannexAriSchema } from '../channex/ariSchema';
import { ensureChannexInboundSchema } from '../channex/inboundSchema';
import { STAGING_URL, addDays } from '../channex/ari';
import type { InboundAssignmentOptions } from '@shared/channexAssignment';
const enabled=!!process.env.DATABASE_URL;
if(enabled){const url=new URL(process.env.DATABASE_URL!);if(!['127.0.0.1','localhost'].includes(url.hostname)||!/test/.test(url.pathname))throw Error('Assignment tests require a local disposable database.');}
let identity='';
vi.mock('../auth',()=>({requireAuth:(req:any,res:any,next:any)=>{if(!identity)return res.sendStatus(401);req.user={id:identity,username:'Synthetic Operator'};next();},requirePermission:()=>{}}));
let pool:typeof import('../db').pool, service:typeof import('../channex/inbound'), manual:typeof import('../channex/manualAssignment');
let arrival:string,departure:string,server:any,base:string,actor:string,reader:string;
const fixtures:any[]=[];
async function fixture(count=1){
 const id=randomUUID(),type=randomUUID(),other=randomUUID(),plan=randomUUID();const f={id,type,other,plan,rev:randomUUID(),booking:randomUUID()};fixtures.push(f);
 for(const [t,name] of [[type,'Synthetic Premium'],[other,'Synthetic Suite']])await pool.query('INSERT INTO room_types(id,code,name,max_occupancy) VALUES($1::text,$1,$2,3)',[t,name]);
 await pool.query("INSERT INTO rate_plans(id,name,room_type_id,base_rate,currency) VALUES($1,'Synthetic USD',$2,999,'USD')",[plan,type]);
 for(let i=0;i<count;i++)for(const t of [type,other])await pool.query("INSERT INTO rooms(id,room_number,room_type_id,floor,status,is_active,is_virtual,max_occupancy) VALUES($1,$2,$3,3,'available',true,false,3)",[`${t}-${i}`,`${t}-${i}`,t]);
 await pool.query("INSERT INTO channex_connections(id,label,environment,channex_property_id,base_url,is_active,created_at) VALUES($1::text,'Synthetic assignment','demo',$1,$2,true,now())",[id,STAGING_URL]);
 await pool.query("INSERT INTO channex_room_type_mappings(id,connection_id,channex_room_type_id,channex_room_type_title,room_type_id,created_at) VALUES($1::text,$1,'remote-type','Original Premium',$2,now())",[id,type]);
 await pool.query("INSERT INTO channex_rate_plan_mappings(id,connection_id,channex_room_type_id,channex_rate_plan_id,channex_rate_plan_title,rate_plan_id,created_at) VALUES($1::text,$1,'remote-type','remote-plan','USD',$2,now())",[id,plan]);
 await pool.query("INSERT INTO channex_ari_settings(connection_id,floor,room_ids,currency,enabled,capture_started_at) VALUES($1,3,$2,'USD',true,now())",[id,[`${type}-0`]]);
 await pool.query('INSERT INTO channex_inbound_settings(connection_id,enabled,settlement_exchange_rate) VALUES($1,true,1500)',[id]);
 await service.persistInboundRevision(pool,id,payload(f));return f;
}
function payload(f:any,status='new',id=f.rev,stamp='2026-11-16T20:46:00Z',count=1){return {id,attributes:{property_id:f.id,booking_id:f.booking,inserted_at:stamp,status,arrival_date:arrival,departure_date:departure,amount:String(142.04*count),currency:'USD',customer:{name:'Synthetic',surname:'Assignment'},rooms:Array.from({length:count},(_,i)=>({id:`remote-${i}`,room_type_id:'remote-type',rate_plan_id:'remote-plan',occupancy:{adults:2},days:{[arrival]:'142.04'}}))}};}
function request(options:InboundAssignmentOptions,roomId:string,overrides:any={}){return {...{expectedPayloadHash:options.payloadHash,expectedConfigurationHash:options.configurationHash,assignments:{'remote-0':roomId},reason:'Requested room assignment',confirmCategoryChange:false,confirmScopeChange:false,actor:{id:actor,name:'Synthetic Operator'},canOverrideScope:true},...overrides};}
async function state(f:any){return (await pool.query('SELECT r.* FROM reservations r JOIN channex_inbound_rooms l ON l.reservation_id=r.id WHERE l.connection_id=$1 ORDER BY l.remote_room_id',[f.id])).rows;}
async function post(f:any,body:any){const response=await fetch(`${base}/api/channex/connections/${f.id}/inbound/assign/${f.rev}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
describe.skipIf(!enabled)('manual OTA inbox assignment with category warning and audit',()=>{
 beforeAll(async()=>{
  ({pool}=await import('../db'));await ensureChannexAriSchema(pool);await ensureChannexInboundSchema(pool);
  await (await import('../permissions')).loadRolePermissionsCache();
  service=await import('../channex/inbound');manual=await import('../channex/manualAssignment');
  const day=(await pool.query("SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS day")).rows[0].day;arrival=addDays(day,25);departure=addDays(arrival,1);
  actor=randomUUID();reader=randomUUID();for(const [id,role] of [[actor,'admin'],[reader,'receptionist']])await pool.query("INSERT INTO system_users(id,username,password,email,full_name,role,is_active,created_at) VALUES($1::text,$1,'synthetic',$1||'@example.invalid','Synthetic',$2,'true',now())",[id,role]);
  const app=express();app.use(express.json());(await import('../channex/inboundRoutes')).registerChannexInboundRoutes(app,pool);server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
 },30000);
 afterAll(async()=>{
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(!pool)return;
  for(const f of fixtures){const rows=await state(f);await pool.query('DELETE FROM channex_inbound_settlements WHERE connection_id=$1',[f.id]);await pool.query('DELETE FROM channex_inbound_rooms WHERE connection_id=$1',[f.id]);await pool.query('DELETE FROM channex_inbound_revisions WHERE connection_id=$1',[f.id]);await pool.query('UPDATE channex_ari_settings SET enabled=false WHERE connection_id=$1',[f.id]);await pool.query('DELETE FROM channex_connections WHERE id=$1',[f.id]);
   for(const r of rows){await pool.query('DELETE FROM reservation_changelog WHERE reservation_id=$1',[r.id]);await pool.query('DELETE FROM audit_logs WHERE entity_id=$1',[r.id]);await pool.query('DELETE FROM reservations WHERE id=$1',[r.id]);await pool.query('DELETE FROM guests WHERE id=$1',[r.guest_id]);}
   await pool.query('DELETE FROM audit_logs WHERE details::jsonb->>\'connectionId\'=$1 AND entity_type=\'channex_manual_assignment\'',[f.id]);
   await pool.query('DELETE FROM rooms WHERE room_type_id=ANY($1::text[])',[[f.type,f.other]]);await pool.query('DELETE FROM rate_plans WHERE id=$1',[f.plan]);await pool.query('DELETE FROM room_types WHERE id=ANY($1::text[])',[[f.type,f.other]]);
  }await pool.query('DELETE FROM system_users WHERE id=ANY($1::text[])',[[actor,reader]]);
 },30000);
 it('previews without creating a reservation and limits ordinary managers to the configured scope',async()=>{
  const f=await fixture();const preview=await manual.getInboundAssignmentOptions(f.id,f.rev,false);
  expect(preview.rooms[0].choices.map(r=>r.id)).toEqual([`${f.type}-0`]);expect(preview).toMatchObject({currency:'USD',amount:'142.04',settlementTotal:'213060.00'});expect(await state(f)).toHaveLength(0);
  expect(JSON.stringify(preview)).not.toMatch(/payload"|token|customer|mail/);
 });
 it('requires advance category and scope confirmations, then preserves channel price, conversion and immutable source',async()=>{
  const f=await fixture();const before=(await pool.query('SELECT payload,payload_hash FROM channex_inbound_revisions WHERE connection_id=$1',[f.id])).rows[0];
  const options=await manual.getInboundAssignmentOptions(f.id,f.rev,true),body=request(options,`${f.other}-0`);
  await expect(service.applyInboundRevision(f.id,f.rev,body)).rejects.toMatchObject({code:'CATEGORY_CHANGE_CONFIRMATION_REQUIRED'});
  await expect(service.applyInboundRevision(f.id,f.rev,{...body,confirmCategoryChange:true})).rejects.toMatchObject({code:'MANUAL_SCOPE_CONFIRMATION_REQUIRED'});expect(await state(f)).toHaveLength(0);
  const result=await service.applyInboundRevision(f.id,f.rev,{...body,confirmCategoryChange:true,confirmScopeChange:true});expect(result?.applied).toBe(true);
  const [stay]=await state(f);expect(stay).toMatchObject({room_id:`${f.other}-0`,room_type_id:f.other,total_room_amount:'213060.00',rate_plan_id:null,number_of_guests:2});
  expect((await pool.query('SELECT payload,payload_hash FROM channex_inbound_revisions WHERE connection_id=$1',[f.id])).rows[0]).toEqual(before);
  const audit=(await pool.query("SELECT user_id,details FROM audit_logs WHERE entity_type='channex_manual_assignment' AND entity_id=$1",[f.rev])).rows[0];expect(audit.user_id).toBe(actor);expect(JSON.parse(audit.details)).toMatchObject({reason:body.reason,currency:'USD',sourceTotal:'142.04',changes:[{selected:{categoryId:f.other,categoryChanged:true}}]});
  expect((await pool.query('SELECT room_ids FROM channex_ari_settings WHERE connection_id=$1',[f.id])).rows[0].room_ids).toEqual([`${f.type}-0`]);
  expect((await pool.query('SELECT source_total,exchange_rate,settlement_total FROM channex_inbound_settlements WHERE connection_id=$1',[f.id])).rows).toEqual([{source_total:'142.04',exchange_rate:'1500.000000',settlement_total:'213060.00'}]);
  expect((await pool.query('SELECT id FROM payments WHERE reservation_id=$1',[stay.id])).rows).toHaveLength(0);
 });
 it('rejects stale quotations and rooms that became occupied, without partial application',async()=>{
  const f=await fixture();const options=await manual.getInboundAssignmentOptions(f.id,f.rev,true),body=request(options,`${f.type}-0`);
  await pool.query('UPDATE channex_inbound_settings SET settlement_exchange_rate=1600 WHERE connection_id=$1',[f.id]);await expect(service.applyInboundRevision(f.id,f.rev,body)).rejects.toMatchObject({code:'ASSIGNMENT_PREVIEW_CHANGED'});expect(await state(f)).toHaveLength(0);
  const fresh=await manual.getInboundAssignmentOptions(f.id,f.rev,true);await pool.query("UPDATE rooms SET status='maintenance' WHERE id=$1",[`${f.type}-0`]);await expect(service.applyInboundRevision(f.id,f.rev,request(fresh,`${f.type}-0`))).rejects.toMatchObject({code:'ASSIGNMENT_ROOM_UNAVAILABLE'});expect(await state(f)).toHaveLength(0);
 });
 it('rejects a pending older revision when a cancellation arrived after the preview',async()=>{
  const f=await fixture();const options=await manual.getInboundAssignmentOptions(f.id,f.rev,true);await service.persistInboundRevision(pool,f.id,payload(f,'cancelled',randomUUID(),'2026-11-16T21:00:00Z'));
  await expect(service.applyInboundRevision(f.id,f.rev,request(options,`${f.type}-0`))).rejects.toMatchObject({code:'ASSIGNMENT_REVISION_CHANGED'});expect(await state(f)).toHaveLength(0);
 });
 it('serializes repeated confirmation and records only one reservation and one manual audit',async()=>{
  const f=await fixture();const options=await manual.getInboundAssignmentOptions(f.id,f.rev,true),body=request(options,`${f.type}-0`);
  const results=await Promise.all([service.applyInboundRevision(f.id,f.rev,body),service.applyInboundRevision(f.id,f.rev,body)]);expect(results.map(r=>r?.replayed).sort()).toEqual([false,true]);expect(await state(f)).toHaveLength(1);expect((await pool.query("SELECT id FROM audit_logs WHERE entity_type='channex_manual_assignment' AND entity_id=$1",[f.rev])).rows).toHaveLength(1);
 });
 it('requires review for later changes to an exceptional category but can apply a cancellation safely',async()=>{
  const f=await fixture();const options=await manual.getInboundAssignmentOptions(f.id,f.rev,true);await service.applyInboundRevision(f.id,f.rev,request(options,`${f.other}-0`,{confirmCategoryChange:true,confirmScopeChange:true}));
  const edit=payload(f,'modified',randomUUID(),'2026-11-16T21:00:00Z');await service.persistInboundRevision(pool,f.id,edit);await service.applyInboundRevision(f.id,edit.id);expect((await pool.query('SELECT review_code FROM channex_inbound_revisions WHERE connection_id=$1 AND revision_id=$2',[f.id,edit.id])).rows[0].review_code).toBe('MANUAL_ASSIGNMENT_REQUIRES_REVIEW');expect((await state(f))[0].room_id).toBe(`${f.other}-0`);
  const cancel=payload(f,'cancelled',randomUUID(),'2026-11-16T22:00:00Z');await service.persistInboundRevision(pool,f.id,cancel);await service.applyInboundRevision(f.id,cancel.id);expect((await state(f))[0].status).toBe('cancelled');
 });
 it('uses role permissions at the API and rejects forged operator or permission fields',async()=>{
  const f=await fixture();const options=await manual.getInboundAssignmentOptions(f.id,f.rev,true),body=request(options,`${f.type}-0`);const {actor:ignored,canOverrideScope:ignored2,...clean}=body;
  identity=reader;expect((await post(f,clean)).status).toBe(403);
  identity=actor;expect((await post(f,body)).status).toBe(400);expect((await post(f,{...clean,reason:' '})).status).toBe(400);
  expect(await post(f,clean)).toMatchObject({status:200,body:{applied:true}});expect((await state(f))).toHaveLength(1);
 });
 it('honors the selected physical-room scope in automatic application',async()=>{
  const f=await fixture(2);await pool.query("UPDATE rooms SET status='maintenance' WHERE id=$1",[`${f.type}-0`]);await service.applyInboundRevision(f.id,f.rev);expect(await state(f)).toHaveLength(0);expect((await pool.query('SELECT review_code FROM channex_inbound_revisions WHERE connection_id=$1',[f.id])).rows[0].review_code).toBe('NO_PILOT_ROOM_AVAILABLE');
 });
 it('rolls back every unit, guest, link and settlement when mandatory manual audit fails',async()=>{
  const f=await fixture(2);const revision=payload(f,'new',f.rev,'2026-11-16T20:46:00Z',2);
  // Replace the not-yet-applied fixture with a genuine multi-room source.
  await pool.query('DELETE FROM channex_inbound_revisions WHERE connection_id=$1',[f.id]);await service.persistInboundRevision(pool,f.id,revision);
  const options=await manual.getInboundAssignmentOptions(f.id,f.rev,true),body=request(options,`${f.type}-0`,{assignments:{'remote-0':`${f.type}-0`,'remote-1':`${f.type}-1`},confirmScopeChange:true});
  const count=(await pool.query("SELECT count(*)::int AS n FROM guests WHERE first_name='Synthetic' AND last_name='Assignment'")).rows[0].n;
  const trigger='fail_ota_assignment_'+f.id.replaceAll('-','');
  await pool.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='channex_manual_assignment' AND NEW.entity_id='${f.rev}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
  try{await expect(service.applyInboundRevision(f.id,f.rev,body)).rejects.toThrow();}finally{await pool.query(`DROP TRIGGER ${trigger} ON audit_logs; DROP FUNCTION ${trigger}()`);}
  expect(await state(f)).toHaveLength(0);expect((await pool.query('SELECT reservation_id FROM channex_inbound_settlements WHERE connection_id=$1',[f.id])).rows).toHaveLength(0);
  expect((await pool.query("SELECT count(*)::int AS n FROM guests WHERE first_name='Synthetic' AND last_name='Assignment'")).rows[0].n).toBe(count);
  expect((await pool.query('SELECT status FROM channex_inbound_revisions WHERE connection_id=$1',[f.id])).rows[0].status).toBe('pending');
  expect((await service.applyInboundRevision(f.id,f.rev,body))?.applied).toBe(true);expect(await state(f)).toHaveLength(2);
 });
 it('does not bypass an overlapping physical reservation even after accepting a group warning',async()=>{
  const f=await fixture();const options=await manual.getInboundAssignmentOptions(f.id,f.rev,true);
  const otherBooking={...f,booking:randomUUID(),rev:randomUUID()};await service.persistInboundRevision(pool,f.id,payload(otherBooking));await service.applyInboundRevision(f.id,otherBooking.rev);
  await expect(service.applyInboundRevision(f.id,f.rev,request(options,`${f.type}-0`,{overrideTentativeGroupWarning:true}))).rejects.toMatchObject({code:'ASSIGNMENT_ROOM_UNAVAILABLE'});expect(await state(f)).toHaveLength(1);
 });

 it.each(['blocked','confirmed'])('confirms an unassigned %s group commitment once through the inbox API',async status=>{
  const f=await fixture();const options=await manual.getInboundAssignmentOptions(f.id,f.rev,true),body=request(options,`${f.type}-0`);const {actor:ignored,canOverrideScope:ignored2,...clean}=body;
  const group=randomUUID();await pool.query("INSERT INTO groups(id,group_code,name,status,check_in_date,check_out_date,created_at) VALUES($1::text,$1,'Synthetic unassigned commitment',$4,$2,$3,now())",[group,arrival,departure,status]);
  await pool.query('INSERT INTO group_room_blocks(id,group_id,room_type_id,quantity) VALUES($1,$2,$3,1)',[randomUUID(),group,f.type]);
  identity=actor;
  try{
   await service.applyInboundRevision(f.id,f.rev);expect(await state(f)).toHaveLength(0);
   expect((await pool.query('SELECT status FROM channex_inbound_revisions WHERE connection_id=$1 AND revision_id=$2',[f.id,f.rev])).rows[0].status).toBe('review');
   const warning=await post(f,clean);expect(warning).toMatchObject({status:409,body:{code:'GROUP_BLOCK_WARNING',canOverride:true}});expect(await state(f)).toHaveLength(0);
   expect(warning.body.warning.warnings).toEqual(expect.arrayContaining([expect.objectContaining({groupId:group,groupStatus:status})]));
   expect(await post(f,{...clean,overrideTentativeGroupWarning:true})).toMatchObject({status:200,body:{applied:true}});expect(await state(f)).toHaveLength(1);
   expect((await pool.query('SELECT quantity FROM group_room_blocks WHERE group_id=$1',[group])).rows).toEqual([{quantity:1}]);
  }finally{await pool.query('DELETE FROM group_room_blocks WHERE group_id=$1',[group]);await pool.query('DELETE FROM groups WHERE id=$1',[group]);}
 });

});
