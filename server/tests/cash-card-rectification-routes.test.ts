import {vi,it,expect,beforeAll,afterAll,beforeEach} from 'vitest';
import express from 'express';
const {edit}=vi.hoisted(()=>({edit:vi.fn()}));
vi.mock('../db',()=>({db:{},pool:{}}));
vi.mock('../auth',()=>({requireAuth:(req:any,res:any,next:any)=>req.user?next():res.sendStatus(401)}));
vi.mock('../billing/linkedReservationInvoicePaymentEdit',()=>({editLinkedReservationInvoicePayment:edit}));
import {registerCashCardRectificationRoutes} from '../billing/cashCardRectificationRoutes';
let server:any,base:string;
beforeAll(async()=>{const app=express();app.use(express.json());app.use((req:any,_res,next)=>{if(req.headers['x-role'])req.user={id:'operator-1',role:req.headers['x-role'],username:'Operator'};next();});registerCashCardRectificationRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;});
afterAll(()=>new Promise<void>(r=>server.close(()=>r())));
beforeEach(()=>edit.mockReset());
const body={method:'tarjeta_debito',reason:'Cupón verificado en POS',evidenceRef:'Control POS'};
const post=(suffix:string,role:string,payload:any=body)=>fetch(`${base}/api/billing/invoices/84/card-rectification${suffix}`,{method:'POST',headers:{'content-type':'application/json',...(role?{'x-role':role}:{})},body:JSON.stringify(payload)});
it.each(['/preview',''])('rejects reception and unauthenticated users before touching a receipt (%s)',async suffix=>{
 expect((await post(suffix,'reception')).status).toBe(403);expect((await post(suffix,'')).status).toBe(401);expect(edit).not.toHaveBeenCalled();
});
it('binds preview to the authenticated admin and rejects client-supplied actor identity',async()=>{
 edit.mockResolvedValue({previewHash:'a'.repeat(64)});
 expect((await post('/preview','admin')).status).toBe(200);
 expect(edit).toHaveBeenCalledWith(84,'tarjeta_debito','Operator',{mode:'preview',actorId:'operator-1',reason:body.reason,evidenceRef:body.evidenceRef});
 expect((await post('/preview','admin',{...body,actorId:'other'})).status).toBe(400);
});
it('requires the UUID and reviewed hash for application',async()=>{
 expect((await post('','admin')).status).toBe(400);expect(edit).not.toHaveBeenCalled();
 edit.mockResolvedValue({id:84});expect((await post('','admin',{...body,operationId:crypto.randomUUID(),previewHash:'a'.repeat(64)})).status).toBe(200);
});
