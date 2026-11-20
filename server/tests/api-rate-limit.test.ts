import express from 'express';
import type {Server} from 'node:http';
import {afterEach,it,expect,vi} from 'vitest';
import {createApiLimiter} from '../apiRateLimit';
import {logger} from '../logger';
let server:Server;
afterEach(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));vi.restoreAllMocks();});
async function start(sessionMax=60){
 const app=express();
 // Stand-in for trusted Passport middleware, not a production header identity.
 app.use((req,_res,next)=>{const id=req.get('x-test-user');req.user=id?{id} as any:undefined;req.isAuthenticated=(()=>!!id) as any;next();});
 app.use('/api',createApiLimiter(2,sessionMax,2));app.all('/api/*',(_req,res)=>res.json({ok:true}));
 server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 return async(user?:string,path='/api/billing/invoices',method='GET')=>fetch(`http://127.0.0.1:${(server.address() as any).port}${path}`,{method,headers:user?{'x-test-user':user}:{}});
}
it('isolates authenticated users on the same IP while enforcing each quota',async()=>{
 const get=await start();expect((await get('reception-a')).status).toBe(200);expect((await get('reception-a')).status).toBe(200);
 const denied=await get('reception-a');expect(denied.status).toBe(429);expect(denied.headers.get('retry-after')).toBeTruthy();
 expect((await get('reception-b')).status).toBe(200);expect((await get('reception-b')).status).toBe(200);expect((await get('reception-b')).status).toBe(429);
});
it('limits anonymous traffic by IP independently of logged-in staff',async()=>{
 const get=await start();await get();await get();expect((await get()).status).toBe(429);expect((await get('reception-a')).status).toBe(200);
});
it('keeps intended public API exemptions when mounted at /api',async()=>{
 const get=await start();for(let i=0;i<4;i++)expect((await get(undefined,'/api/public/booking/hotel-info')).status).toBe(200);
 expect((await get()).status).toBe(200);
});
it('allows session verification and logout after the business quota is exhausted',async()=>{
 const get=await start();await get('staff','/api/reservations','POST');await get('staff','/api/reservations','POST');expect((await get('staff','/api/reservations','POST')).status).toBe(429);
 expect((await get('staff','/api/auth/me?check=1')).status).toBe(200);
 expect((await get('staff','/api/auth/logout','POST')).status).toBe(200);
 expect((await get('staff','/api/reservations','POST')).status).toBe(429);
});
it('limits session probes separately without locking out other users, operations or logout',async()=>{
 const get=await start(2);await get('staff','/api/auth/me');await get('staff','/api/auth/me');
 const denied=await get('staff','/api/auth/me');expect(denied.status).toBe(429);
 expect(Number(denied.headers.get('retry-after'))).toBeLessThanOrEqual(60);
 expect((await get('staff','/api/auth/logout','POST')).status).toBe(200);
 expect((await get('staff','/api/reservations','POST')).status).toBe(200);
 expect((await get('other','/api/auth/me')).status).toBe(200);
});
it('retains IP limits for anonymous probes and does not exempt other auth routes or methods',async()=>{
 const get=await start(2);await get(undefined,'/api/auth/me');await get(undefined,'/api/auth/me');
 expect((await get(undefined,'/api/auth/me')).status).toBe(429);
 expect((await get('staff','/api/auth/me')).status).toBe(200);
 await get('staff','/api/auth/me','POST');await get('staff','/api/auth/logout');
 expect((await get('staff','/api/auth/login','POST')).status).toBe(200);
 expect((await get('staff','/api/auth/login','POST')).status).toBe(429);
 expect((await get('staff','/api/auth/me/')).status).toBe(200);
});
it('logs the first rejection once without query strings, credentials or request bodies',async()=>{
 const warn=vi.spyOn(logger,'warn').mockImplementation(()=>{});const get=await start();
 await get('staff');await get('staff');await get('staff','/api/guests/search?token=synthetic-secret');await get('staff');
 expect(warn).toHaveBeenCalledTimes(1);
 expect(warn).toHaveBeenCalledWith('API request limit reached',expect.objectContaining({scope:'read',path:'/guests/search',userId:'staff'}));
 expect(JSON.stringify(warn.mock.calls)).not.toContain('synthetic-secret');
});

it('keeps permissions available after read and write quotas are both exhausted',async()=>{
 const get=await start();
 for(let i=0;i<2;i++){await get('staff');await get('staff','/api/reservations','POST');}
 expect((await get('staff')).status).toBe(429);
 expect((await get('staff','/api/reservations','POST')).status).toBe(429);
 expect((await get('staff','/api/permissions/mine?refresh=1')).status).toBe(200);
 expect((await get('staff','/api/permissions/mine/','HEAD')).status).toBe(200);
 expect((await get('staff','/api/auth/me')).status).toBe(200);
 expect((await get('staff','/api/auth/logout','POST')).status).toBe(200);
});
it('limits permission probes without affecting identity checks, logout or other staff',async()=>{
 const get=await start(2);
 await get('staff','/api/permissions/mine');await get('staff','/api/permissions/mine');
 const response=await get('staff','/api/permissions/mine');
 expect(response.status).toBe(429);expect(Number(response.headers.get('retry-after'))).toBeLessThanOrEqual(60);
 expect((await get('staff','/api/auth/me')).status).toBe(200);
 expect((await get('staff','/api/auth/logout','POST')).status).toBe(200);
 expect((await get('other','/api/permissions/mine')).status).toBe(200);
 expect((await get('staff','/api/permissions/mine','POST')).status).toBe(200);
});
it('bounds authenticated read lockouts to one minute and preserves the independent write quota',async()=>{
 const get=await start();await get('staff');await get('staff');
 const response=await get('staff');expect(response.status).toBe(429);
 expect(Number(response.headers.get('retry-after'))).toBeLessThanOrEqual(60);
 expect((await get('staff','/api/reservations','POST')).status).toBe(200);
 expect((await get('staff','/api/reservations','POST')).status).toBe(200);
 expect((await get('staff','/api/reservations','POST')).status).toBe(429);
});
