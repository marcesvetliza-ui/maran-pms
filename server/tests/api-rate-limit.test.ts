import express from 'express';
import type {Server} from 'node:http';
import {afterEach,it,expect} from 'vitest';
import {createApiLimiter} from '../apiRateLimit';
let server:Server;
afterEach(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));});
async function start(){
 const app=express();
 // Stand-in for trusted Passport middleware, not a production header identity.
 app.use((req,_res,next)=>{const id=req.get('x-test-user');req.user=id?{id} as any:undefined;req.isAuthenticated=(()=>!!id) as any;next();});
 app.use('/api',createApiLimiter(2));app.get('/api/*',(_req,res)=>res.json({ok:true}));
 server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 return async(user?:string,path='/api/billing/invoices')=>fetch(`http://127.0.0.1:${(server.address() as any).port}${path}`,{headers:user?{'x-test-user':user}:{}});
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
