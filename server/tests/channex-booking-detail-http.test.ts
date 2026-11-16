import express from 'express';
import type {Server} from 'node:http';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../channex/access',()=>({requireChannex:(cap:string)=>(req:any,res:any,next:any)=>{if(!req.headers['x-role'])return res.sendStatus(401);if(cap!=='read'||req.headers['x-role']==='housekeeping')return res.sendStatus(403);req.user={id:'operator',username:'recepcion'};next();}}));
vi.mock('../auth',()=>({requireAuth:(_req:any,_res:any,next:any)=>next(),requirePermission:()=> (_req:any,_res:any,next:any)=>next()}));
vi.mock('../channex/bookingDetail',()=>({inboundBookingDetail:vi.fn(async()=>({notes:'Observación privada del huésped',notesStatus:'available',settlements:[]}))}));
import {inboundBookingDetail} from '../channex/bookingDetail';
import {registerChannexInboundRoutes} from '../channex/inboundRoutes';
let server:Server;
async function start(){const app=express();app.use(express.json());registerChannexInboundRoutes(app,{} as any);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return `http://127.0.0.1:${(server.address() as any).port}/api/channex/connections/conn/inbound/booking-detail/rev`;}
afterEach(async()=>{vi.clearAllMocks();if(server)await new Promise<void>(r=>server.close(()=>r()));});
it('requires authorized read access to the separately audited detail',async()=>{
 const url=await start();expect((await fetch(url)).status).toBe(401);expect((await fetch(url,{headers:{'x-role':'housekeeping'}})).status).toBe(403);expect(inboundBookingDetail).not.toHaveBeenCalled();
 const r=await fetch(url,{headers:{'x-role':'reception'}});expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(await r.json()).toMatchObject({notes:'Observación privada del huésped'});expect(inboundBookingDetail).toHaveBeenCalledWith({},'conn','rev',expect.objectContaining({id:'operator',name:'recepcion'}));
});
it('does not reveal details if the scope is wrong or audit fails',async()=>{
 const url=await start();vi.mocked(inboundBookingDetail).mockResolvedValueOnce(null as any);expect((await fetch(url,{headers:{'x-role':'reception'}})).status).toBe(404);
 vi.mocked(inboundBookingDetail).mockRejectedValueOnce(new Error('private audit failure'));const failed=await fetch(url,{headers:{'x-role':'reception'}});expect(failed.status).toBe(503);expect(await failed.text()).not.toMatch(/private audit|Observación privada/);
});
