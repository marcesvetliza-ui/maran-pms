import express from 'express';
import http from 'node:http';
import {it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({allowed:false,authenticated:false}));
vi.mock('../permissions',()=>({hasPermission:(_role:string,key:string)=>state.allowed&&key==='sidebar:/housekeeping-daily-report'}));
vi.mock('../db',()=>({db:{},pool:{}}));
it('requires authentication and the report permission before reading operational data',async()=>{
 const {registerHousekeepingDailyReport}=await import('../housekeepingDailyReport');
 const app=express();app.use((req,_res,next)=>{req.isAuthenticated=()=>state.authenticated;req.user={id:'test-hsk',role:'housekeeping'} as any;next();});
 registerHousekeepingDailyReport(app);
 const server=http.createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${(server.address() as any).port}/api/housekeeping/daily-report?date=2026-02-30`;
  expect((await fetch(url)).status).toBe(401);
  state.authenticated=true;expect((await fetch(url)).status).toBe(403);
  state.allowed=true;expect((await fetch(url)).status).toBe(400);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
