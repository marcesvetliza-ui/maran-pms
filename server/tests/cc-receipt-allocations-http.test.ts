import express from 'express';
import type { Server } from 'node:http';
import {afterEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({allowed:true,authenticated:true}));
vi.mock('../auth',()=>({requireAuth:(_req:any,res:any,next:any)=>state.authenticated?next():res.sendStatus(401),requirePermission:(key:string)=>(req:any,res:any,next:any)=>{if(!state.allowed||key!=='api:account-movements:reallocate')return res.sendStatus(403);req.user={id:'u',username:'recepcion'};next();}}));
vi.mock('../db',()=>({pool:{}}));vi.mock('../migrate',()=>({assertFinancialSchemaReady:()=>{}}));
vi.mock('../billing/ccReceiptAllocations',()=>({getCcAllocationPreview:vi.fn(async()=>({current:[],charges:[]})),correctCcAllocations:vi.fn(async()=>({ok:true}))}));
import {registerCcReceiptAllocationRoutes} from '../routes/cc-receipt-allocations';
import {getCcAllocationPreview,correctCcAllocations} from '../billing/ccReceiptAllocations';
let server:Server;
async function start(){const app=express();app.use(express.json());registerCcReceiptAllocationRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return `http://127.0.0.1:${(server.address() as any).port}/api/account-movements/receipt/allocation-correction`;}
afterEach(async()=>{state.allowed=true;state.authenticated=true;vi.clearAllMocks();if(server)await new Promise<void>(r=>server.close(()=>r()));});
it('requires authentication and the dedicated correction permission for both endpoints',async()=>{
 const url=await start();for(const method of ['GET','POST']){state.authenticated=false;expect((await fetch(url,{method})).status).toBe(401);state.authenticated=true;state.allowed=false;expect((await fetch(url,{method})).status).toBe(403);state.allowed=true;}
 expect(getCcAllocationPreview).not.toHaveBeenCalled();expect(correctCcAllocations).not.toHaveBeenCalled();
});
it('reads without caching and uses the authenticated actor for an explicit correction',async()=>{
 const url=await start(),read=await fetch(url);expect(read.status).toBe(200);expect(read.headers.get('cache-control')).toBe('private, no-store');
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:'123e4567-e89b-42d3-a456-426614174000',version:'a'.repeat(64),reason:'Facturas equivocadas',allocations:[{cargoId:'old',amount:'100.00'}]})});
 expect(response.status).toBe(200);expect(correctCcAllocations).toHaveBeenCalledWith({},'receipt',expect.anything(),expect.objectContaining({id:'u',name:'recepcion'}));
});
it('rejects missing reasons, duplicate or malformed request metadata, extra actor fields and negative amounts',async()=>{
 const url=await start();for(const body of [{},{reason:'  '},{requestId:'123e4567-e89b-42d3-a456-426614174000',version:'a'.repeat(64),reason:'Error',allocations:[{cargoId:'x',amount:'-1.00'}]},{actor:'admin'}])expect((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).status).toBe(400);
 expect(correctCcAllocations).not.toHaveBeenCalled();
});
