import express from 'express';
import type {Server} from 'node:http';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../channex/access',()=>({requireChannex:()=>(req:any,res:any,next:any)=>req.headers['x-role']==='admin'?next():res.sendStatus(403)}));
vi.mock('../auth',()=>({requireAuth:vi.fn(),requirePermission:()=>vi.fn()}));
vi.mock('../channex/ari',()=>({inventoryPreview:async()=>[],STAGING_URL:'https://staging.channex.io/api/v1',addDays:vi.fn(),buildAriValues:vi.fn()}));
const preview=vi.hoisted(()=>vi.fn());
vi.mock('../channex/ariPreview',()=>({previewChannexAri:preview}));
import {registerChannexAriRoutes} from '../channex/ariRoutes';
let server:Server;
afterEach(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));});
async function setup(){
 const rows=Array.from({length:39},(_,i)=>({id:String(i+1),status:i<4?'blocked':'pending',last_error:i<4?'Plan sin mapear':null}));
 const query=vi.fn(async(sql:string,args:any[])=>{
  if(sql.startsWith('SELECT id,environment'))return {rows:[{id:'c',environment:'real'}]};
  if(sql.startsWith('SELECT floor'))return {rows:[{floor:3,currency:'USD',enabled:false}]};
  if(sql.includes('GROUP BY status'))return {rows:[{status:'blocked',count:4},{status:'pending',count:35}]};
  if(sql.includes('FROM channex_ari_outbox o'))return {rows:rows.filter(row=>args[1]===null||row.status===args[1]).reverse().slice(0,30)};
  throw Error('Unexpected query');
 });
 const release=vi.fn(),connect=vi.fn(async()=>({query,release}));
 const app=express();registerChannexAriRoutes(app,{connect} as any);
 server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 return {base:`http://127.0.0.1:${(server.address() as any).port}`,query,connect,release};
}
it('finds older blocked events through a parameterized read-only filter, preserving the paused settings',async()=>{
 const {base,query,release}=await setup();
 const recent=await fetch(base+'/api/channex/connections/c/ari',{headers:{'x-role':'admin'}});
 expect((await recent.json()).events).toHaveLength(30);
 const response=await fetch(base+'/api/channex/connections/c/ari?eventStatus=blocked',{headers:{'x-role':'admin'}});
 const body=await response.json();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
 expect(body.events).toHaveLength(4);expect(body.events.every((row:any)=>row.status==='blocked'&&row.last_error==='Plan sin mapear')).toBe(true);
 expect(body.settings.enabled).toBe(false);
 const filtered=query.mock.calls.find(([sql,args])=>sql.includes('FROM channex_ari_outbox o')&&args[1]==='blocked');
 expect(filtered?.[0]).toContain('status=$2');expect(query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);expect(release).toHaveBeenCalledTimes(2);
});
it('rejects invalid filters and unauthorized access before connecting to the database',async()=>{
 const {base,connect}=await setup();
 expect((await fetch(base+'/api/channex/connections/c/ari?eventStatus=invalid',{headers:{'x-role':'admin'}})).status).toBe(400);
 expect((await fetch(base+'/api/channex/connections/c/ari?eventStatus=blocked')).status).toBe(403);
 expect(connect).not.toHaveBeenCalled();
});

it('protects the preview and returns a local snapshot without executing queue queries',async()=>{
 const {base,query}=await setup();preview.mockReset().mockResolvedValue({currency:'USD',rooms:[{number:'307'}],availability:[],restrictions:[],remoteVerified:false});
 expect((await fetch(base+'/api/channex/connections/c/ari/preview')).status).toBe(403);expect(preview).not.toHaveBeenCalled();
 const response=await fetch(base+'/api/channex/connections/c/ari/preview',{headers:{'x-role':'admin'}});
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({currency:'USD',remoteVerified:false});
 expect(response.headers.get('cache-control')).toContain('no-store');expect(query).not.toHaveBeenCalled();
 preview.mockResolvedValueOnce(null);
 expect((await fetch(base+'/api/channex/connections/unknown/ari/preview',{headers:{'x-role':'admin'}})).status).toBe(404);
});
