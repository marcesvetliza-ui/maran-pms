import express from 'express';
import http from 'node:http';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({invoice:{id:14,tipo_comprobante:'cierre_habitacion',reserva_id:'reservation-test'},execute:vi.fn(),annul:vi.fn(),shift:vi.fn()}));
vi.mock('../db',()=>({db:{execute:state.execute},pool:{}}));
vi.mock('../db-storage',()=>({storage:{getOrCreateActiveTurno:state.shift},getArgentinaToday:()=> '2026-11-07'}));
vi.mock('../migrate',()=>({assertFinancialSchemaReady:()=>{}}));
vi.mock('../nightlyPricingGuard',()=>({withReservationFinancialLock:(_id:string,fn:()=>unknown)=>fn(),withFinancialScopeLock:(_id:string,fn:()=>unknown)=>fn()}));
vi.mock('../auth',async importOriginal=>{
 const actual=await importOriginal<typeof import('../auth')>();
 return {...actual,requireAuth:(req:any,res:any,next:any)=>{
  const role=req.headers['x-test-role'];req.isAuthenticated=()=>!!role;
  if(!role)return res.status(401).json({error:'No autenticado'});
  req.user={id:'test-user',role,username:'Operador prueba'};next();
 }};
});
vi.mock('../billing/nonFiscalAnnulment',async importOriginal=>{
 const actual=await importOriginal<typeof import('../billing/nonFiscalAnnulment')>();
 return {...actual,annulNonFiscalInvoice:state.annul,nonFiscalAnnulmentArea:async()=> 'recepcion'};
});
const {registerBillingRoutes}=await import('../billing/routes');
const {setRolePermissionsCacheForTests}=await import('../permissions');
let server:http.Server;let base:string;
async function request(role:string|null,body:unknown,path='/api/billing/invoices/14/annul-non-fiscal',method='POST'){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(role?{'x-test-role':role}:{})},body:JSON.stringify(body)});
 return {status:response.status,body:await response.json() as any};
}
describe('API baja no fiscal: permiso independiente, validación y sin borrado masivo',()=>{
 beforeAll(async()=>{
  const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.isAuthenticated=()=>!!req.headers['x-test-role'];req.user={role:req.headers['x-test-role']};next();});registerBillingRoutes(app);server=http.createServer(app);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 beforeEach(()=>{
  state.invoice={id:14,tipo_comprobante:'cierre_habitacion',reserva_id:'reservation-test'};
  state.execute.mockReset().mockImplementation(async()=>({rows:[state.invoice]}));
  state.annul.mockReset().mockResolvedValue({annulled:true});state.shift.mockReset().mockResolvedValue({id:'shift-test'});
  setRolePermissionsCacheForTests([{role:'admin',resourceKey:'api:billing:non-fiscal-void'},{role:'reception',resourceKey:'sidebar:/billing'}]);
 });
 afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));});
 it('sin sesión no consulta ni modifica',async()=>{
  expect((await request(null,{reason:'Duplicado'})).status).toBe(401);expect(state.execute).not.toHaveBeenCalled();expect(state.annul).not.toHaveBeenCalled();
 });
 it('poder ver Facturación no otorga permiso para borrar',async()=>{
  expect((await request('reception',{reason:'Duplicado'})).status).toBe(403);expect(state.execute).not.toHaveBeenCalled();expect(state.annul).not.toHaveBeenCalled();
 });
 it('solo después de habilitar el permiso entrega motivo y operador al servicio atómico',async()=>{
  setRolePermissionsCacheForTests([{role:'reception',resourceKey:'api:billing:non-fiscal-void'}]);
  expect((await request('reception',{reason:'  Duplicado  '})).status).toBe(200);
  expect(state.annul).toHaveBeenCalledWith(expect.anything(),14,'Duplicado',{id:'test-user',name:'Operador prueba'},'recepcion','shift-test',state.invoice);
 });
 it.each([{}, {reason:'  '}, {reason:42}])('rechaza motivo ausente o inválido antes de consultar datos (%j)',async body=>{
  expect((await request('admin',body)).status).toBe(400);expect(state.execute).not.toHaveBeenCalled();expect(state.annul).not.toHaveBeenCalled();
 });
 it('rechaza una factura fiscal aunque se fuerce la URL',async()=>{
  state.invoice.tipo_comprobante='FB';expect((await request('admin',{reason:'Duplicado'})).status).toBe(400);expect(state.annul).not.toHaveBeenCalled();
 });
 it('deshabilita el borrado masivo antiguo que omitía motivo y Caja',async()=>{
  expect((await request('admin',{},'/api/billing/invoices/non-fiscal?startDate=2026-11-01&endDate=2026-11-07','DELETE')).status).toBe(409);
  expect(state.execute).not.toHaveBeenCalled();expect(state.annul).not.toHaveBeenCalled();
 });
});
