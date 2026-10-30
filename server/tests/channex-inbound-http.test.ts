import express from "express";
import { createHash } from "node:crypto";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../auth",()=>({requireAuth:(req:any,res:any,next:any)=>req.headers["x-role"]?next():res.sendStatus(401),requirePermission:()=> (req:any,res:any,next:any)=>req.headers["x-role"]==="admin"?next():res.sendStatus(403)}));
import { registerChannexInboundRoutes, registerChannexInboundWebhook } from "../channex/inboundRoutes";
let server:Server;
afterEach(async()=>{vi.unstubAllEnvs();if(server)await new Promise<void>(r=>server.close(()=>r()));});
async function start(query:any){const app=express();app.use(express.json());registerChannexInboundWebhook(app,{query} as any);registerChannexInboundRoutes(app,{query} as any);server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));return `http://127.0.0.1:${(server.address() as any).port}`;}
describe("inbound authenticated notifications and configuration",()=>{
 it("leaves notifications unavailable without the staging flag",async()=>{
  vi.stubEnv("CHANNEX_INBOUND_STAGING_ENABLED","");const query=vi.fn(),base=await start(query);
  expect((await fetch(`${base}/api/channex/inbound/conn/notify`,{method:"POST"})).status).toBe(404);expect(query).not.toHaveBeenCalled();
 });
 it("accepts only the configured header token and persists a feed hint, not booking data",async()=>{
  vi.stubEnv("CHANNEX_INBOUND_STAGING_ENABLED","true");const secret="s".repeat(64),hash=createHash("sha256").update(secret).digest("hex");
  const query=vi.fn(async(q:string)=>({rows:q.startsWith("SELECT")?[{token_hash:hash}]:[],rowCount:1})),base=await start(query);
  expect((await fetch(`${base}/api/channex/inbound/conn/notify?token=${secret}`,{method:"POST"})).status).toBe(401);
  const sent=await fetch(`${base}/api/channex/inbound/conn/notify`,{method:"POST",headers:{"content-type":"application/json","X-Channex-Webhook-Token":secret},body:JSON.stringify({amount:999999,card:"not-used"})});
  expect(sent.status).toBe(202);expect(query.mock.calls.some(([q])=>q.startsWith("UPDATE")&&q.includes("notification_version"))).toBe(true);
  expect(JSON.stringify(query.mock.calls)).not.toContain("not-used");
 });
 it("rejects a bad token without scheduling work",async()=>{
  vi.stubEnv("CHANNEX_INBOUND_STAGING_ENABLED","true");const query=vi.fn(async()=>({rows:[{token_hash:"ab".repeat(32)}]})),base=await start(query);
  expect((await fetch(`${base}/api/channex/inbound/conn/notify`,{method:"POST",headers:{"X-Channex-Webhook-Token":"wrong"}})).status).toBe(401);expect(query).toHaveBeenCalledTimes(1);
 });
 it("requires the Channex configuration permission for enabling, retrying and secret generation",async()=>{
  const query=vi.fn(),base=await start(query);
  for(const [path,method] of [["","PATCH"],["/retry","POST"],["/webhook-token","POST"],["/readiness","GET"],["/settlement-rate","PATCH"]]){
   expect((await fetch(`${base}/api/channex/connections/conn/inbound${path}`,{method,headers:{"content-type":"application/json"},...(method==="GET"?{}:{body:"{}"})})).status).toBe(403);
  }expect(query).not.toHaveBeenCalled();
 });
 it("stores only a token hash and avoids res.json body logging for the one-time secret",async()=>{
  const query=vi.fn(async()=>({rows:[{connection_id:"conn"}],rowCount:1})),base=await start(query);
  const res=await fetch(`${base}/api/channex/connections/conn/inbound/webhook-token`,{method:"POST",headers:{"x-role":"admin"}});
  const body=await res.json();expect(body.token).toMatch(/^[a-f0-9]{64}$/);expect(query.mock.calls[0][1][1]).toBe(createHash("sha256").update(body.token).digest("hex"));expect(res.headers.get("cache-control")).toBe("private, no-store");
 });
 it("requires authentication to read the original channel amount",async()=>{
  const query=vi.fn(async()=>({rows:[{source_currency:"USD",source_total:"250.00",exchange_rate:"1250.000000",settlement_currency:"ARS",settlement_total:"312500.00"}]})),base=await start(query);
  expect((await fetch(`${base}/api/reservations/reservation/channex-settlement`)).status).toBe(401);expect(query).not.toHaveBeenCalled();
  const response=await fetch(`${base}/api/reservations/reservation/channex-settlement`,{headers:{"x-role":"reception"}});
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({source_currency:"USD",settlement_currency:"ARS"});expect(response.headers.get("cache-control")).toBe("private, no-store");
 });
 it("rejects implicit, zero or unaudited exchange rates before touching the database",async()=>{
  const query=vi.fn(),base=await start(query);
  for(const body of [{rate:"0",reason:"Invalid quote"},{rate:1250,reason:"Implicit numeric"},{rate:"1250",reason:""}]){
   expect((await fetch(`${base}/api/channex/connections/conn/inbound/settlement-rate`,{method:"PATCH",headers:{"x-role":"admin","content-type":"application/json"},body:JSON.stringify(body)})).status).toBe(400);
  }expect(query).not.toHaveBeenCalled();
 });
});
