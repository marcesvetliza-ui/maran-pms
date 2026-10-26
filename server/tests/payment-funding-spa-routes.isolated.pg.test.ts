import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { randomUUID } from "node:crypto";
import { pool } from "./helpers/fundingIsolatedDatabase";
import { createDemoService, demoActor, installSyntheticSchema, seedSyntheticScope } from "../../demo/funding/backend";
import { mountPaymentFunding } from "../billing/funding/integration";
import { SqlFundingAdapter } from "../billing/funding/adapters";
import { legacyFundingScopes } from "../billing/funding/legacyFence";

// Replace ONLY the connection/transaction context with Unix-socket PostgreSQL.
// The real SPA route handlers, storage, auth and permission middleware execute.
vi.mock("../db",async()=>import("./helpers/fundingIsolatedDatabase"));
const {service,gateway}=createDemoService(pool);
let server:ReturnType<ReturnType<typeof express>["listen"]>,base:string;
const headers={"content-type":"application/json","x-test-session":"present"};
const id=()=>`route-${randomUUID()}`;
async function waitForAdvisoryWaiter() {
  for(let i=0;i<200;i++) {
    if((await pool.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted LIMIT 1")).rowCount) return;
    await new Promise<void>(r=>setImmediate(r));
  }
  throw new Error("Expected a PostgreSQL advisory lock waiter");
}
async function scope() {
  const s=await seedSyntheticScope(service,id(),"spa",{partial:true});
  const req={scope:s,documentId:`${s.id}:F1`,applications:[{receiptId:`spa:${s.id}:S1`,amountCents:500_000}],
    newCollections:[{rowId:"rest",method:"efectivo",amountCents:9_000_000,shiftId:`${s.id}:shift`}]};
  const preview=await service.preview(req,demoActor),operationId=randomUUID();
  await service.reserve(operationId,preview.previewHash,req,demoActor);
  return {s,operationId};
}
async function snapshot(accountId:string) {
  return {
    items:(await pool.query("SELECT * FROM funding_demo.spa_account_items WHERE account_id=$1 ORDER BY id",[accountId])).rows,
    accounts:(await pool.query("SELECT * FROM funding_demo.spa_accounts WHERE id=$1",[accountId])).rows,
    receipts:(await pool.query("SELECT * FROM payment_funding.balances WHERE scope_id=$1 ORDER BY id",[accountId])).rows,
    payments:(await pool.query("SELECT * FROM funding_demo.spa_payments WHERE account_id=$1 ORDER BY id",[accountId])).rows,
    operations:(await pool.query("SELECT * FROM payment_funding.operations WHERE scope_id=$1 ORDER BY id",[accountId])).rows,
  };
}
beforeAll(async()=>{
  await installSyntheticSchema(pool);
  await pool.query(`CREATE TABLE IF NOT EXISTS funding_demo.spa_appointments(id text PRIMARY KEY,guest_id text,treatment_id text,status text);
  ALTER TABLE funding_demo.spa_appointments
   ADD COLUMN IF NOT EXISTS cabin_id text, ADD COLUMN IF NOT EXISTS professional_id text,
   ADD COLUMN IF NOT EXISTS guest_name text, ADD COLUMN IF NOT EXISTS guest_last_name text,
   ADD COLUMN IF NOT EXISTS guest_phone text, ADD COLUMN IF NOT EXISTS guest_email text,
   ADD COLUMN IF NOT EXISTS reservation_id text, ADD COLUMN IF NOT EXISTS appointment_date date,
   ADD COLUMN IF NOT EXISTS start_time text, ADD COLUMN IF NOT EXISTS end_time text,
   ADD COLUMN IF NOT EXISTS notes text, ADD COLUMN IF NOT EXISTS created_at timestamp,
   ADD COLUMN IF NOT EXISTS sold_treatment_sale_id text`);
  await pool.query(`
    ALTER TABLE funding_demo.spa_account_items ADD COLUMN IF NOT EXISTS quantity int NOT NULL DEFAULT 1;
    ALTER TABLE funding_demo.spa_account_items ADD COLUMN IF NOT EXISTS unit_price numeric(10,2) NOT NULL DEFAULT 95000;
    ALTER TABLE funding_demo.spa_account_items ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'treatment';
    ALTER TABLE funding_demo.spa_account_items ADD COLUMN IF NOT EXISTS inventory_item_id text;
    ALTER TABLE funding_demo.spa_account_items ADD COLUMN IF NOT EXISTS notes text;
    ALTER TABLE funding_demo.spa_account_items ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();
    ALTER TABLE funding_demo.folio_movements ADD COLUMN IF NOT EXISTS notes text;
    ALTER TABLE funding_demo.folio_movements ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
    ALTER TABLE funding_demo.folio_movements ADD COLUMN IF NOT EXISTS related_folio_id text;
    ALTER TABLE funding_demo.folio_movements ADD COLUMN IF NOT EXISTS void_reason text;
    ALTER TABLE funding_demo.folio_movements ADD COLUMN IF NOT EXISTS receipt_type text;
    CREATE TABLE IF NOT EXISTS funding_demo.audit_logs(
      id text DEFAULT gen_random_uuid()::text,user_id text,action text,module text,entity_type text,
      entity_id text,description text,details text,timestamp timestamp);
    CREATE TABLE IF NOT EXISTS funding_demo.role_permissions(
      id text DEFAULT gen_random_uuid()::text,role text,resource_key text,created_at timestamp DEFAULT now(),
      UNIQUE(role,resource_key));
    INSERT INTO funding_demo.role_permissions(role,resource_key) VALUES('admin','api:spa:write') ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS funding_demo.inventory_consumption_jobs(source_type text,source_id text,status text);
    CREATE TABLE IF NOT EXISTS funding_demo.stock_movements(id text,source_type text,source_id text);
    CREATE TABLE IF NOT EXISTS funding_demo.inventory_source_reversals(id text,source_type text,source_id text,completed_at timestamp);
  `);
  await (await import("../permissions")).loadRolePermissionsCache();
  const { registerSpaRoutes }=await import("../routes/spa");
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{
    if(req.headers["x-test-session"]==="present") {
      req.user={id:"isolated-supervisor",username:"isolated-supervisor",role:"admin"} as any;
      req.isAuthenticated=()=>true;
    } else req.isAuthenticated=(()=>false) as any;
    next();
  });
  const {requireAuth}=await import("../auth");
  mountPaymentFunding(app,{enabled:true,pool,fiscal:gateway,operationalSchema:"funding_demo",
    firstSpaClose:async()=>{throw new Error("This suite must never finalize/consume inventory");},
    authenticate:requireAuth,actor:()=>demoActor});
  registerSpaRoutes(app);
  (await import("../routes/folios")).registerFolioRoutes(app);
  (await import("../billing/routes")).registerBillingRoutes(app);
  server=app.listen(0,"127.0.0.1");
  await new Promise<void>(r=>server.once("listening",r));
  base=`http://127.0.0.1:${(server.address() as any).port}`;
},30000);
afterAll(async()=>{
  if(server) await new Promise<void>(r=>server.close(()=>r()));
  await pool.end();
});
describe("real SPA routes behind the opt-in funding fence",()=>{
  it("PATCH/DELETE resolve persisted item owner, reject before storage, and preserve charges and holds",async()=>{
    const {s,operationId}=await scope(),before=await snapshot(s.id);
    expect((await service.get(operationId,demoActor)).status).toBe("reserved");
    for(const method of ["PATCH","DELETE"]) {
      const res=await fetch(`${base}/api/spa/account-items/${encodeURIComponent(`${s.id}:item`)}`,{
        method,headers,body:JSON.stringify({unitPrice:"1.00",spaAccountId:"forged-unmanaged",accountId:"forged-unmanaged"}),
      });
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("MANAGED_SCOPE_USE_FUNDING");
      expect(await snapshot(s.id)).toEqual(before);
    }
    expect(before.receipts.reduce((n,r)=>n+Number(r.held_cents),0)).toBe(500_000);
  });
  it("non-adopted open account keeps real legacy PATCH behavior and persists the change",async()=>{
    const accountId=id(),itemId=`${accountId}:item`;
    await pool.query("INSERT INTO funding_demo.spa_accounts(id,status) VALUES($1,'open')",[accountId]);
    await pool.query(`INSERT INTO funding_demo.spa_account_items(id,account_id,description,subtotal,quantity,unit_price)
      VALUES($1,$2,'Non adopted treatment',100,1,100)`,[itemId,accountId]);
    const res=await fetch(`${base}/api/spa/account-items/${encodeURIComponent(itemId)}`,{
      method:"PATCH",headers,body:JSON.stringify({unitPrice:"125.00"}),
    });
    expect(res.status,await res.clone().text()).toBe(200);
    expect((await res.json()).subtotal).toBe("125.00");
    expect((await pool.query("SELECT subtotal FROM funding_demo.spa_account_items WHERE id=$1",[itemId])).rows[0].subtotal).toBe("125.00");
    expect((await pool.query("SELECT 1 FROM payment_funding.scopes WHERE kind='spa' AND id=$1",[accountId])).rowCount).toBe(0);
    const deleted=await fetch(`${base}/api/spa/account-items/${encodeURIComponent(itemId)}`,{method:"DELETE",headers});
    expect(deleted.status,await deleted.clone().text()).toBe(204);
    expect((await pool.query("SELECT 1 FROM funding_demo.spa_account_items WHERE id=$1",[itemId])).rowCount).toBe(0);
  });
  it("requires a session before resolving ownership",async()=>{
    const {s}=await scope(),before=await snapshot(s.id);
    const res=await fetch(`${base}/api/spa/account-items/${encodeURIComponent(`${s.id}:item`)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:'{"unitPrice":"1"}'});
    expect(res.status).toBe(401);expect(await snapshot(s.id)).toEqual(before);
  });
  it("fences account, item creation, payment, close, appointment and admin fiscal writers by their real IDs",async()=>{
    const {s}=await scope(),before=await snapshot(s.id);
    const invoiceId=(await pool.query("SELECT nextval('funding_demo.invoice_number_seq') AS id")).rows[0].id;
    await pool.query("INSERT INTO funding_demo.sales_invoices(id,estado,spa_account_id) VALUES($1,'borrador',$2)",[invoiceId,s.id]);
    await pool.query("UPDATE funding_demo.spa_accounts SET appointment_id=$2 WHERE id=$1",[s.id,`${s.id}:appointment`]);
    for(const [method,path,body] of [
      ["PATCH",`spa/accounts/${s.id}`,{status:"closed"}],
      ["POST",`spa/accounts/${s.id}/items`,{description:"Changed",unitPrice:1}],
      ["POST",`spa/accounts/${s.id}/payments`,{amount:1,method:"cash"}],
      ["POST",`spa/accounts/${s.id}/close`,{}],
      ["POST",`spa/accounts/${s.id}/resume-invoice`,{}],
      ["POST",`spa/accounts/${s.id}/nc`,{}],
      ["PATCH",`spa/accounts/${s.id}/reset-nc`,{}],
      ["PATCH",`spa/payments/${s.id}:S1/anular`,{reason:"Synthetic"}],
      ["PATCH",`spa/appointments/${s.id}:appointment`,{status:"completed",reservationId:"must-not-pass"}],
      ["POST","spa/accounts",{appointmentId:`${s.id}:appointment`,guestName:"Duplicate"}],
      ["POST",`admin/spa/fiscal-drafts/${invoiceId}/resolve`,{action:"discard"}],
      ["POST",`folios/${s.id}:folio/movements`,{type:"charge",amount:"1",description:"Legacy charge"}],
      ["POST",`folios/${s.id}:folio/close`,{}],
      ["POST",`folios/${s.id}:folio/reopen`,{}],
      ["POST",`folios/spa_account/${s.id}/ensure`,{}],
      ["POST","billing/invoices",{spaAccountId:s.id}],
      ["PATCH",`billing/invoices/${invoiceId}`,{}],
      ["POST",`billing/invoices/${invoiceId}/nota-credito`,{}],
      ["DELETE","billing/invoices/non-fiscal?startDate=2000-01-01&endDate=2100-01-01",{}],
    ] as const) {
      const res=await fetch(`${base}/api/${path}`,{method,headers,body:JSON.stringify(body)});
      expect(res.status,`${method} ${path}`).toBe(409);
      expect((await res.json()).error.code).toBe("MANAGED_SCOPE_USE_FUNDING");
    }
    const after=await snapshot(s.id);
    expect(after.items).toEqual(before.items);expect(after.receipts).toEqual(before.receipts);
    expect(after.payments).toEqual(before.payments);expect(after.operations).toEqual(before.operations);
  });
  it("holds the adoption lock through the actual legacy storage write, not only through its precheck",async()=>{
    const s=await seedSyntheticScope(service,id(),"spa",{partial:true});
    await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[s.id]);
    await pool.query("DELETE FROM payment_funding.receipts WHERE scope_id=$1",[s.id]);
    await pool.query("DELETE FROM payment_funding.scopes WHERE kind='spa' AND id=$1",[s.id]);
    const {storage}=await import("../db-storage"),original=storage.updateSpaAccountItem.bind(storage);
    let entered!:()=>void,proceed!:()=>void;
    const entry=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>proceed=r);
    const spy=vi.spyOn(storage,"updateSpaAccountItem").mockImplementation(async(...args)=>{
      entered();await gate;return original(...args);
    });
    let response:Promise<Response>|undefined,adoption:Promise<void>|undefined;
    try {
      response=fetch(`${base}/api/spa/account-items/${encodeURIComponent(`${s.id}:item`)}`,{
        method:"PATCH",headers,body:JSON.stringify({unitPrice:"94000.00"}),
      });
      await entry;
      const c=await pool.connect();
      try {
        await c.query("BEGIN");
        const probe=await c.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",[`funding-scope:spa:${s.id}`]);
        expect(probe.rows[0].acquired).toBe(false);
      } finally {await c.query("ROLLBACK");c.release();}
      adoption=service.store.transaction(s,null,c=>(service.adapter(s) as SqlFundingAdapter).adoptScope(c,s));
      proceed();
      const res=await response;
      expect(res.status,await res.clone().text()).toBe(200);
      await adoption;
      expect((await pool.query("SELECT subtotal FROM funding_demo.spa_account_items WHERE account_id=$1",[s.id])).rows[0].subtotal).toBe("94000.00");
      expect((await pool.query("SELECT 1 FROM payment_funding.scopes WHERE kind='spa' AND id=$1",[s.id])).rowCount).toBe(1);
      const blocked=await fetch(`${base}/api/spa/account-items/${encodeURIComponent(`${s.id}:item`)}`,{method:"PATCH",headers,body:'{"unitPrice":"1"}'});
      expect(blocked.status).toBe(409);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {proceed();await response;await adoption;spy.mockRestore();}
  });
  it("waits for an uncommitted adoption, then rejects the real PATCH without entering storage",async()=>{
    const s=await seedSyntheticScope(service,id(),"spa",{partial:true});
    await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[s.id]);
    await pool.query("DELETE FROM payment_funding.receipts WHERE scope_id=$1",[s.id]);
    await pool.query("DELETE FROM payment_funding.scopes WHERE kind='spa' AND id=$1",[s.id]);
    let entered!:()=>void,commit!:()=>void;
    const entry=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>commit=r);
    const adoption=service.store.transaction(s,null,async c=>{
      await (service.adapter(s) as SqlFundingAdapter).adoptScope(c,s);entered();await gate;
    });
    const {storage}=await import("../db-storage"),spy=vi.spyOn(storage,"updateSpaAccountItem");
    let response:Promise<Response>|undefined;
    try {
      await entry;
      const before=await snapshot(s.id);
      response=fetch(`${base}/api/spa/account-items/${encodeURIComponent(`${s.id}:item`)}`,{method:"PATCH",headers,body:'{"unitPrice":"1"}'});
      await waitForAdvisoryWaiter();
      commit();await adoption;
      const res=await response;
      expect(res.status).toBe(409);expect((await res.json()).error.code).toBe("MANAGED_SCOPE_USE_FUNDING");
      expect(spy).not.toHaveBeenCalled();
      expect((await snapshot(s.id)).items).toEqual(before.items);
    } finally {commit();await adoption;await response;spy.mockRestore();}
  });
  it("resolves cash sources by account ID, independent of a forged body accountId",async()=>{
    const {s}=await scope(),c=await pool.connect();
    try {
      const scopes=await legacyFundingScopes(c,{
        path:"/cash/movements",body:{sourceType:"spa_account",sourceId:s.id,accountId:"forged"},
        method:"POST",
      } as any,"funding_demo");
      expect(scopes).toContainEqual({kind:"spa",id:s.id});
    } finally {c.release();}
  });
  it("does not unlock a running legacy write just because the HTTP client disconnects",async()=>{
    const accountId=id(),itemId=`${accountId}:item`;
    await pool.query("INSERT INTO funding_demo.spa_accounts(id,status) VALUES($1,'open')",[accountId]);
    await pool.query("INSERT INTO funding_demo.spa_account_items(id,account_id,description,subtotal,unit_price) VALUES($1,$2,'Disconnect case',100,100)",[itemId,accountId]);
    const {storage}=await import("../db-storage"),original=storage.updateSpaAccountItem.bind(storage);
    let entered!:()=>void,proceed!:()=>void,completed!:()=>void;
    const entry=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>proceed=r),written=new Promise<void>(r=>completed=r);
    const spy=vi.spyOn(storage,"updateSpaAccountItem").mockImplementation(async(...args)=>{
      entered();await gate;
      try {return await original(...args);} finally {completed();}
    });
    const controller=new AbortController();
    const response=fetch(`${base}/api/spa/account-items/${encodeURIComponent(itemId)}`,{
      method:"PATCH",headers,body:'{"unitPrice":"120"}',signal:controller.signal,
    }).catch(e=>e);
    try {
      await entry;controller.abort();
      expect((await response).name).toBe("AbortError");
      const c=await pool.connect();
      try {
        await c.query("BEGIN");
        expect((await c.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",[`funding-scope:spa:${accountId}`])).rows[0].acquired).toBe(false);
      } finally {await c.query("ROLLBACK");c.release();}
      proceed();await written;
      // A subsequent funding transaction waits until the real handler ends.
      await service.store.transaction({kind:"spa",id:accountId},null,async()=>{
        expect((await pool.query("SELECT subtotal FROM funding_demo.spa_account_items WHERE id=$1",[itemId])).rows[0].subtotal).toBe("120.00");
      });
    } finally {proceed();await written;await response;spy.mockRestore();}
  });
});

it('operational appointment actions reach their own validators while adopted financial scope stays unchanged',async()=>{
 const {s}=await scope(),before=await snapshot(s.id),appointmentId=`${s.id}:missing-appointment`;
 await pool.query('UPDATE funding_demo.spa_accounts SET appointment_id=$2 WHERE id=$1',[s.id,appointmentId]);
 const status=await fetch(`${base}/api/spa/appointments/${appointmentId}`,{method:'PATCH',headers,body:JSON.stringify({status:'in_progress'})});
 expect(status.status,await status.clone().text()).toBe(404);
 const move=await fetch(`${base}/api/spa/appointments/${appointmentId}/move`,{method:'POST',headers,body:'{}'});
 expect(move.status).toBe(400);
 const after=await snapshot(s.id);expect(after.receipts).toEqual(before.receipts);expect(after.payments).toEqual(before.payments);expect(after.operations).toEqual(before.operations);
});
