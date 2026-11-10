import {setRolePermissionsCacheForTests,hasPermission} from '../permissions';
import {CHANNEX_ROLE_DEFAULTS} from '@shared/channexAccess';
import {randomUUID,createHash} from 'node:crypto';
import express from 'express';
import type {Server} from 'node:http';
import {beforeAll,afterAll,it,expect,describe,vi} from 'vitest';
import {pool} from '../db';
import {ensureChannexAccessSchema,channexAccess} from '../channex/access';
import {ensureChannexAriSchema} from '../channex/ariSchema';
import {ensureChannexInboundSchema} from '../channex/inboundSchema';
import {registerChannexRoutes} from '../routes/channex';
import {registerChannexInboundWebhook} from '../channex/inboundRoutes';
import {PRODUCTION_URL} from '../channex/connectionPolicy';
import {buildAriValues,addDays,inventoryPreview} from '../channex/ari';
const suite=process.env.DATABASE_URL?describe:describe.skip;
const admin=randomUUID(),reader=randomUUID(),operator=randomUUID(),type=randomUUID(),conn=randomUUID(),connections:string[]=[];
let server:Server,base:string;const originalFetch=globalThis.fetch,remoteCalls:string[]=[];
suite('Production preparation and actual per-user access',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!/test/.test(url.pathname))throw Error('Local test database required');
  vi.stubEnv('CHANNEX_PRODUCTION_ENABLED','');vi.stubEnv('CHANNEX_ARI_PRODUCTION_ENABLED','');vi.stubEnv('CHANNEX_INBOUND_PRODUCTION_ENABLED','');vi.stubEnv('CHANNEX_CREDENTIALS_ENCRYPTION_KEY','test-only-credential-encryption-0123456789');
  setRolePermissionsCacheForTests(Object.entries(CHANNEX_ROLE_DEFAULTS).flatMap(([key,roles])=>roles.map(role=>({role,resourceKey:`api:ota:${key}`}))));
  await ensureChannexAccessSchema();await ensureChannexAriSchema(pool);await ensureChannexInboundSchema(pool);
  for(const [id,role] of [[admin,'admin'],[reader,'reception'],[operator,'manager']])await pool.query("INSERT INTO system_users(id,username,email,full_name,role,is_active,created_at) VALUES($1::text,$1::text,$1::text||'@test.invalid',$1::text,$2,'true',now())",[id,role]);
  const app=express();app.use(express.json());app.use((req,_res,next)=>{const id=String(req.get('x-user')||'');req.isAuthenticated=(()=>!!id) as any;req.user={id,username:id,role:id===admin?'admin':'reception'} as any;next();});registerChannexInboundWebhook(app,pool);registerChannexRoutes(app);
  server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${(server.address() as any).port}`;
  vi.stubGlobal('fetch',async(input:any,init?:RequestInit)=>{const url=String(input);if(url.startsWith(PRODUCTION_URL)){remoteCalls.push(url);return new Response(JSON.stringify({data:[{id:conn,attributes:{title:'Test property'}}]}),{status:200});}return originalFetch(input,init);});
 });
 afterAll(async()=>{
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));vi.unstubAllGlobals();vi.unstubAllEnvs();
  const createdReservations=(await pool.query('SELECT r.id,r.guest_id FROM reservations r JOIN channex_inbound_rooms l ON l.reservation_id=r.id WHERE l.connection_id=ANY($1)',[connections])).rows;
  for(const id of connections){await pool.query('UPDATE channex_ari_settings SET enabled=false WHERE connection_id=$1',[id]);await pool.query('DELETE FROM channex_inbound_settlements WHERE connection_id=$1',[id]);await pool.query('DELETE FROM channex_inbound_rooms WHERE connection_id=$1',[id]);await pool.query('DELETE FROM channex_inbound_revisions WHERE connection_id=$1',[id]);await pool.query('DELETE FROM channex_connections WHERE id=$1',[id]);}
  for(const row of createdReservations){await pool.query('DELETE FROM reservation_changelog WHERE reservation_id=$1',[row.id]);await pool.query('DELETE FROM audit_logs WHERE entity_id=$1',[row.id]);await pool.query('DELETE FROM reservations WHERE id=$1',[row.id]);await pool.query('DELETE FROM guests WHERE id=$1',[row.guest_id]);}
  await pool.query('DELETE FROM reservations WHERE id=$1',[type]);await pool.query('DELETE FROM guests WHERE id=$1',[type]);await pool.query('DELETE FROM rooms WHERE room_type_id=$1',[type]);await pool.query('DELETE FROM rate_plans WHERE room_type_id=$1',[type]);await pool.query('DELETE FROM room_types WHERE id=$1',[type]);
  await pool.query('DELETE FROM user_permission_overrides WHERE user_id=ANY($1)',[[admin,reader,operator]]);await pool.query('DELETE FROM system_users WHERE id=ANY($1)',[[admin,reader,operator]]);
 });
 async function request(method:string,path:string,user=admin,body?:any){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{'x-user':user}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json().catch(()=>null)};}
 it('uses the role matrix, denies reception operations, and retires per-user edits',async()=>{
  expect(await channexAccess(admin)).toMatchObject({owner:true,entry:true,read:true,status:true,config:true,bookings:true,sync:true});
  expect(await channexAccess(operator)).toMatchObject({owner:false,entry:true,read:true,status:true,config:true,bookings:true,sync:true});
  expect(await channexAccess(reader)).toMatchObject({owner:false,entry:true,read:true,status:false,config:false,bookings:false,sync:false});
  expect((await request('GET','/api/channex/connections',reader)).status).toBe(200);
  expect((await request('GET','/api/channex/connections/unknown/ari',reader)).status).toBe(403);
  expect((await request('POST','/api/channex/connections',reader,{})).status).toBe(403);
  expect((await request('POST','/api/channex/connections/unknown/ari/full-sync',reader,{})).status).toBe(403);
  expect((await request('POST','/api/channex/connections/unknown/inbound/retry',reader,{})).status).toBe(403);
  expect((await request('GET','/api/channex/connections/unknown/usd',reader)).status).toBe(403);
  for(const action of ['preview','apply'])expect((await request('POST',`/api/channex/connections/unknown/usd/${action}`,reader,{})).status).toBe(403);
  expect((await request('GET','/api/channex/connections/unknown/usd',operator)).status).toBe(404);
  expect((await request('GET','/api/channex/access/users',operator)).status).toBe(403);
  expect((await request('PUT',`/api/channex/access/users/${reader}`,admin,{permissions:['config']})).status).toBe(410);
  // Legacy individual grants must not bypass a matrix revocation.
  await pool.query("INSERT INTO user_permission_overrides(user_id,resource_key,allowed) VALUES($1,'api:ota:config',true)",[reader]);
  expect((await channexAccess(reader)).config).toBe(false);
  for(const role of ['manager','jefe_recepcion','comercial','housekeeping']){
   await pool.query('UPDATE system_users SET role=$2 WHERE id=$1',[operator,role]);
   expect((await channexAccess(operator)).config).toBe(role!=='housekeeping');
  }
  await pool.query("UPDATE system_users SET role='manager' WHERE id=$1",[operator]);
  const entries=Object.entries(CHANNEX_ROLE_DEFAULTS).flatMap(([key,roles])=>roles.map(role=>({role,resourceKey:`api:ota:${key}`})));
  setRolePermissionsCacheForTests(entries.filter(e=>!(e.role==='manager'&&e.resourceKey==='api:ota:config')));
  expect((await channexAccess(operator)).config).toBe(false);
  expect((await channexAccess(operator)).sync).toBe(true);
  setRolePermissionsCacheForTests(entries);
  await pool.query("UPDATE system_users SET is_active='false' WHERE id=$1",[operator]);
  expect((await channexAccess(operator)).entry).toBe(false);
  await pool.query("UPDATE system_users SET is_active='true' WHERE id=$1",[operator]);
  expect((await request('GET','/api/channex/connections','')).status).toBe(401);
 });
 it('saves a production credential encrypted, forces inactive status, and blocks activation and webhooks by default',async()=>{
  const result=await request('POST','/api/channex/connections',admin,{label:'Production preparation',environment:'real',baseUrl:PRODUCTION_URL,channexPropertyId:conn,apiKey:'synthetic-test-provider-key',isActive:true});
  expect(result.status,JSON.stringify(result.data)).toBe(201);connections.push(result.data.id);
  expect(result.data.isActive).toBe(false);expect(result.data.apiKey).toBeUndefined();expect(result.data.apiKeyEncrypted).toBeUndefined();
  const saved=(await pool.query('SELECT api_key,api_key_encrypted FROM channex_connections WHERE id=$1',[result.data.id])).rows[0];expect(saved.api_key).toBeNull();expect(saved.api_key_encrypted).not.toContain('synthetic-test-provider-key');expect(saved.api_key_encrypted).toMatch(/^v1\./);
  expect((await request('PATCH',`/api/channex/connections/${result.data.id}`,admin,{isActive:true})).status).toBe(409);
  expect((await request('PATCH',`/api/channex/connections/${result.data.id}/inbound`,admin,{enabled:true})).status).toBe(409);
  expect((await request('POST',`/api/channex/inbound/${result.data.id}/notify`,'',{})).status).toBe(404);
  const calls=remoteCalls.length;
  expect((await request('POST','/api/channex/connections',admin,{label:'Mismatch',environment:'real',baseUrl:'https://staging.channex.io/api/v1',channexPropertyId:conn,apiKey:'synthetic'})).status).toBe(400);expect(remoteCalls).toHaveLength(calls);
 });
 it('prepares and rotates a webhook before activation, storing only its hash and preserving existing settings',async()=>{
  const id=connections[0], calls=remoteCalls.length;
  expect((await pool.query('SELECT 1 FROM channex_inbound_settings WHERE connection_id=$1',[id])).rowCount).toBe(0);
  const first=await request('POST',`/api/channex/connections/${id}/inbound/webhook-token`);
  expect(first.status).toBe(200);expect(first.data.token).toMatch(/^[a-f0-9]{64}$/);
  expect((await pool.query('SELECT enabled,notification_pending,token_hash FROM channex_inbound_settings WHERE connection_id=$1',[id])).rows[0]).toEqual({enabled:false,notification_pending:false,token_hash:createHash('sha256').update(first.data.token).digest('hex')});
  await pool.query('UPDATE channex_inbound_settings SET enabled=true,notification_pending=true,settlement_exchange_rate=1250 WHERE connection_id=$1',[id]);
  const second=await request('POST',`/api/channex/connections/${id}/inbound/webhook-token`);
  expect(second.status).toBe(200);expect(second.data.token).not.toBe(first.data.token);
  expect((await pool.query('SELECT enabled,notification_pending,settlement_exchange_rate::text,token_hash FROM channex_inbound_settings WHERE connection_id=$1',[id])).rows[0]).toEqual({enabled:true,notification_pending:true,settlement_exchange_rate:'1250.000000',token_hash:createHash('sha256').update(second.data.token).digest('hex')});
  expect((await pool.query('SELECT is_active FROM channex_connections WHERE id=$1',[id])).rows[0].is_active).toBe(false);
  expect(remoteCalls).toHaveLength(calls);
  await pool.query('DELETE FROM channex_inbound_settings WHERE connection_id=$1',[id]);
 });
 it('counts all physical production floors, excludes test and virtual rooms, without adding test or virtual rooms',async()=>{
  await pool.query("INSERT INTO guests(id,first_name,last_name) VALUES($1,'Synthetic','Guest')",[type]);
  await pool.query("INSERT INTO room_types(id,code,name) VALUES($1::text,$1::text,'Production inventory test')",[type]);
  for(const [index,floor,virtual] of [[1,1,false],[2,2,false],[3,99,false],[4,1,true]])await pool.query("INSERT INTO rooms(id,room_number,room_type_id,floor,status,is_active,is_virtual) VALUES($1::text,$1::text,$2,$3,'available',true,$4)",[`${type}-${index}`,type,floor,virtual]);
  const id=connections[0];await pool.query("INSERT INTO channex_room_type_mappings(connection_id,channex_room_type_id,channex_room_type_title,room_type_id,created_at) VALUES($1,'production-category','Category',$2,now())",[id,type]);
  const day=addDays(new Date().toISOString().slice(0,10),10);
  const client=await pool.connect();try{
   const preview=await inventoryPreview(client,id,null);expect(preview.filter((room:any)=>room.roomTypeId===type)).toHaveLength(2);
   const values=await buildAriValues(client,{id,channex_property_id:conn,floor:null,currency:'ARS'},[{id:'test',kind:'availability',date_from:day,date_to:day,room_type_id:type,rate_plan_id:null,attempts:0}],day);
   expect(values).toMatchObject([{room_type_id:'production-category',availability:2}]);
  }finally{client.release();}
 });
 it('applies a real-environment booking, its move and cancellation through the certified pipeline only after explicit enablement',async()=>{
  vi.stubEnv('CHANNEX_PRODUCTION_ENABLED','true');vi.stubEnv('CHANNEX_ARI_PRODUCTION_ENABLED','true');vi.stubEnv('CHANNEX_INBOUND_PRODUCTION_ENABLED','true');
  const id=connections[0],plan=randomUUID(),booking=randomUUID(),day=addDays(new Date().toISOString().slice(0,10),12);
  await pool.query("UPDATE channex_connections SET is_active=true WHERE id=$1",[id]);
  await pool.query("INSERT INTO rate_plans(id,name,room_type_id,base_rate,currency) VALUES($1,'Production test',$2,100,'ARS')",[plan,type]);
  await pool.query("INSERT INTO channex_rate_plan_mappings(connection_id,channex_room_type_id,channex_rate_plan_id,channex_rate_plan_title,rate_plan_id,created_at) VALUES($1,'production-category','production-plan','Plan',$2,now())",[id,plan]);
  await pool.query("INSERT INTO channex_ari_settings(connection_id,floor,currency,enabled,capture_started_at) VALUES($1,NULL,'ARS',true,now())",[id]);
  await pool.query("INSERT INTO channex_inbound_settings(connection_id,enabled) VALUES($1,true)",[id]);
  const service=await import('../channex/inbound');
  const revision=(date:string,status:string,minute:number)=>({id:randomUUID(),attributes:{property_id:conn,booking_id:booking,inserted_at:new Date(Date.now()+minute*60000).toISOString(),status,arrival_date:date,departure_date:addDays(date,1),amount:'100',currency:'ARS',customer:{name:'Synthetic',surname:'Channel'},rooms:[{id:'production-room',room_type_id:'production-category',rate_plan_id:'production-plan',occupancy:{adults:1},days:{[date]:'100'}}]}});
  const apply=async(payload:any)=>{await service.persistInboundRevision(pool,id,payload);await service.applyInboundRevision(id,payload.id);expect((await pool.query('SELECT status,review_code FROM channex_inbound_revisions WHERE connection_id=$1 AND revision_id=$2',[id,payload.id])).rows[0]).toMatchObject({status:'applied',review_code:null});};
  await apply(revision(day,'new',0));
  const local=async()=>(await pool.query('SELECT r.*,rm.floor FROM reservations r JOIN rooms rm ON rm.id=r.room_id JOIN channex_inbound_rooms l ON l.reservation_id=r.id WHERE l.connection_id=$1',[id])).rows[0];
  expect(await local()).toMatchObject({status:'confirmed',total_room_amount:'100.00',pricing_scheme:'nightly_v1'});expect([1,2]).toContain((await local()).floor);
  await apply(revision(addDays(day,7),'modified',1));expect(String((await local()).check_in_date)).toContain(addDays(day,7));
  await apply(revision(addDays(day,7),'cancelled',2));expect((await local()).status).toBe('cancelled');
  const inbox=await request('GET',`/api/channex/connections/${id}/inbound`);expect(inbox.status).toBe(200);expect(inbox.data.revisions[0].reservations[0]).toMatchObject({id:(await local()).id,guestName:'Synthetic Channel',status:'cancelled'});
  await pool.query('DELETE FROM channex_settlement_rate_edits WHERE connection_id=$1',[id]);
  // The plan remains referenced by the reservation until normal cleanup.
 });

});
