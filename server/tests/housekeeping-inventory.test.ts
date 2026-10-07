import express from 'express';
import {describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({read:true,cost:false,items:[{id:'hk',costPrice:'20',currentStock:'4',category:{area:'housekeeping'}},{id:'spa',costPrice:'90',category:{area:'spa'}}]}));
vi.mock('../db-storage',()=>({storage:{getInventoryItems:async()=>state.items}}));
vi.mock('../auth',()=>({requireAuth:(req:any,_res:any,next:any)=>{req.user={role:'housekeeping'};next();},requirePermission:()=>(_req:any,res:any,next:any)=>state.read?next():res.status(403).json({error:'denied'})}));
vi.mock('../permissions',()=>({hasPermission:()=>state.cost}));
import {registerHousekeepingRoutes} from '../routes/housekeeping';
async function query(){const app=express();registerHousekeepingRoutes(app);const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address() as any;try{const response=await fetch(`http://127.0.0.1:${address.port}/api/housekeeping/inventory?area=spa`);return {status:response.status,body:await response.json()};}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}}
describe('consulta de inventario desde Housekeeping',()=>{
 it('limita al área y oculta los costos sin permiso',async()=>{state.read=true;state.cost=false;const r=await query();expect(r.status).toBe(200);expect(r.body).toHaveLength(1);expect(r.body[0]).toMatchObject({id:'hk',costPrice:null,currentStock:'4'});});
 it('mantiene los costos para usuarios autorizados',async()=>{state.cost=true;const r=await query();expect(r.body[0].costPrice).toBe('20');});
 it('requiere permiso de acceso a Housekeeping',async()=>{state.read=false;expect((await query()).status).toBe(403);state.read=true;});
});
