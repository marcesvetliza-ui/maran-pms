import express from 'express';
import http from 'node:http';
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({config:vi.fn(),probe:vi.fn()}));
vi.mock('../auth',()=>({requireAuth:(req:any,res:any,next:any)=>{
  const role=req.headers['x-test-role'];if(!role)return res.status(401).json({error:'Unauthenticated'});
  req.user={role};next();
}}));
vi.mock('../billing/billingConfig',()=>({getBillingConfig:mocks.config}));
vi.mock('../billing/wsaaClient',()=>({getTokenAuth:vi.fn()}));
vi.mock('../billing/homologationProbe',async importOriginal=>({...await importOriginal<any>(),probeHomologation:mocks.probe}));
import {registerHomologationProbeRoutes} from '../billing/homologationProbeRoutes';
let server:http.Server,base:string;
beforeAll(async()=>{const app=express();app.use(express.json());registerHomologationProbeRoutes(app);server=http.createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as any).port}`;});
afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));});
beforeEach(()=>{mocks.config.mockReset().mockResolvedValue({arcaAmbiente:'homologacion',puntoVentaHomolog:5});mocks.probe.mockReset().mockResolvedValue({ok:true,ambiente:'homologacion'});});
describe('Homologation probe access',()=>{
 it.each([null,'receptionist','manager'])('denies %s before reading the fiscal configuration',async role=>{
  const response=await fetch(base+'/api/billing/homologation-check',{method:'POST',headers:role?{'x-test-role':role}:{}});
  expect(response.status).toBe(role?403:401);expect(mocks.config).not.toHaveBeenCalled();expect(mocks.probe).not.toHaveBeenCalled();
 });
 it('uses the server configuration and ignores caller-supplied environment or point',async()=>{
  const response=await fetch(base+'/api/billing/homologation-check',{method:'POST',headers:{'x-test-role':'admin','Content-Type':'application/json'},body:JSON.stringify({arcaAmbiente:'produccion',puntoVenta:99})});
  expect(response.status).toBe(200);expect(mocks.probe.mock.calls[0][0]).toEqual({arcaAmbiente:'homologacion',puntoVentaHomolog:5});
 });
 it('does not disclose configuration errors or credentials',async()=>{
  mocks.config.mockRejectedValue(new Error('private key secret'));
  const response=await fetch(base+'/api/billing/homologation-check',{method:'POST',headers:{'x-test-role':'admin'}});
  expect(response.status).toBe(503);const body=await response.json();expect(body.code).toBe('HOMOLOGATION_CHECK_FAILED');expect(JSON.stringify(body)).not.toContain('secret');
 });
});
