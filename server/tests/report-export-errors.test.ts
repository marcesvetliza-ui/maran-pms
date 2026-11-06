import {afterEach,it,expect,vi} from 'vitest';
import express from 'express';
vi.mock('../db',()=>({db:{execute:vi.fn()}}));
vi.mock('../auth',()=>({requirePermission:()=> (_q:any,_s:any,n:any)=>n(),requireAuth:(_q:any,_s:any,n:any)=>n()}));
import {registerReportsRoutes} from '../reports/routes';
afterEach(()=>vi.unstubAllGlobals());
it.each(['pdf','excel'])('does not generate a %s file from failed or invalid report data',async format=>{
 const app=express();registerReportsRoutes(app);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const originalFetch=global.fetch;
 try{for(const [status,data,expected] of [[503,{error:'unavailable'},503],[403,{error:'denied'},403],[200,{error:'failed'},502]] as const){
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(data),{status})));const response=await originalFetch(`http://127.0.0.1:${(server.address() as any).port}/api/reports/export-${format}/proveedores`);expect(response.status).toBe(expected);expect(response.headers.get('content-type')).toContain('application/json');expect(response.headers.get('content-disposition')).toBeNull();
 }}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
