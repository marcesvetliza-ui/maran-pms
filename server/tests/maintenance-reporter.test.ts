import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import express from 'express';
const {storage}=vi.hoisted(()=>({storage:{generateWorkOrderCode:vi.fn(()=> 'OT-test'),createWorkOrder:vi.fn(async(data:any)=>({id:'order',...data})),updateWorkOrder:vi.fn(async(id:string,data:any)=>({id,...data}))}}));
vi.mock('../db-storage',()=>({storage}));
vi.mock('../db',()=>({db:{execute:vi.fn()},pool:{}}));
vi.mock('../maintenance/roomPreventiveRoutes',()=>({registerRoomPreventiveRoutes:()=>{}}));
vi.mock('../auth',()=>({requireAuth:(req:any,res:any,next:any)=>req.user?next():res.status(401).json({error:'Unauthorized'})}));
import {registerMaintenanceRoutes} from '../routes/maintenance';
let server:any,url:string,actor:any;
beforeAll(async()=>{const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user=actor;next();});registerMaintenanceRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));url=`http://127.0.0.1:${server.address().port}`;});
afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));});
beforeEach(()=>{vi.clearAllMocks();actor={id:'reporter',fullName:'Luciana Lisman',username:'luciana'};});
async function request(method:string,path:string,body:any){return fetch(url+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
it('records the authenticated creator instead of a forged or missing form value',async()=>{
 const result=await request('POST','/api/maintenance/work-orders',{title:'Piso del balcón',reportedBy:'Someone else'});
 expect(result.status).toBe(201);expect((await result.json()).reportedBy).toBe('Luciana Lisman');expect(storage.createWorkOrder).toHaveBeenCalledWith(expect.objectContaining({reportedBy:'Luciana Lisman',reportedAt:expect.any(Date)}));
});
it('uses the username when no display name is available',async()=>{actor.fullName=' ';const result=await request('POST','/api/maintenance/work-orders',{title:'Revisar piso'});expect((await result.json()).reportedBy).toBe('luciana');});
it('keeps creator and creation time immutable when editing or assigning a task',async()=>{
 const result=await request('PATCH','/api/maintenance/work-orders/order',{reportedBy:'Technician',reportedAt:'2000-01-01',assignedToId:'staff'});expect(result.status).toBe(200);expect(storage.updateWorkOrder).toHaveBeenCalledWith('order',{assignedToId:'staff'});
});
it('requires a logged-in creator',async()=>{actor=undefined;expect((await request('POST','/api/maintenance/work-orders',{title:'Anonymous'})).status).toBe(401);expect(storage.createWorkOrder).not.toHaveBeenCalled();});
