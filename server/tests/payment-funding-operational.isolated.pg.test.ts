import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import express from "express";
import { pool } from "./helpers/fundingIsolatedDatabase";
import { installSyntheticSchema, seedSyntheticScope } from "../../demo/funding/backend";
import { mountOperationalSpaFunding } from "../billing/funding/operational/mount";
import { prepareSpaDocument } from "../billing/funding/operational/preparation";
import { PersistentFiscalGateway, type FiscalTransport } from "../billing/funding/operational/fiscalGateway";
import { createFirstSpaClose } from "../billing/funding/operational/spaClosure";
import { adoptVerifiedHistory } from "../billing/funding/operational/history";
import { sessionFundingActor } from "../billing/funding/operational/access";
import { type Actor, type Scope, hash } from "../billing/funding/contracts";
import { createArcaTransport } from "../billing/funding/operational/arcaTransport";
import { consultationFixture } from "./helpers/wsfeConsultationFixture";
import { Pool } from "pg";
import { FundingStore } from "../billing/funding/store";
import { PaymentFundingService } from "../billing/funding/service";

// ONLY the connection is replaced. Real auth, roles, invoice builder,
// inventory engine, SQL adapter, gateway persistence and HTTP handlers execute.
vi.mock("../db",async()=>import("./helpers/fundingIsolatedDatabase"));
const actor:Actor={id:"binding-cashier",permissions:["funding:read","funding:write","funding:historical"]};
let service:NonNullable<ReturnType<typeof mountOperationalSpaFunding>>;
let server:ReturnType<ReturnType<typeof express>["listen"]>,base:string,sends=0,failAfterProvider=false;
const providerKey=(i:any)=>hash({issuer:i.issuer,environment:i.environment,tipo:i.tipo,pv:i.puntoVenta,numero:i.numero});
const transport:FiscalTransport={
 async prepareNumbering(i,client) {
  return async()=>{
   const r=await client.query(`SELECT COALESCE(max(numero),0)::int AS n FROM funding_demo.sales_invoices
     WHERE tipo_comprobante=$1 AND punto_venta=$2 AND estado='emitida'`,[i.tipo,i.puntoVenta]);
   return r.rows[0].n;
  };
 },
 async authorize(i) {
   sends++;
   // Persist on a DIFFERENT connection, as an external provider would.
   const result=(await pool.query(`INSERT INTO funding_demo.provider_authorizations VALUES($1,'12345678901234','2026-12-31')
     ON CONFLICT(identity_key) DO UPDATE SET identity_key=excluded.identity_key RETURNING *`,[providerKey(i)])).rows[0];
   if(failAfterProvider){failAfterProvider=false;throw new Error("synthetic socket loss AFTER CAE");}
   return {cae:result.cae,caeFechaVto:new Date(result.expiry)};
 },
 async lookup(i) {
   const r=(await pool.query("SELECT * FROM funding_demo.provider_authorizations WHERE identity_key=$1",[providerKey(i)])).rows[0];
   return r?{cae:r.cae,caeFechaVto:new Date(r.expiry)}:null;
 },
};
beforeAll(async()=>{
 await installSyntheticSchema(pool);
 await pool.query(await readFile(new URL("./helpers/fundingOperationalFixture.sql",import.meta.url),"utf8"));
 await pool.query(await readFile(new URL("../billing/funding/operational/schema.sql",import.meta.url),"utf8"));
 const {requireAuth}=await import("../auth");
 const permissions=await import("../permissions");
 permissions.setRolePermissionsCacheForTests([
   ...actor.permissions.map(resourceKey=>({role:"spa" as const,resourceKey})),
   {role:"manager",resourceKey:"funding:read"},
 ]);
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{
   req.isAuthenticated=(()=>req.headers["x-session"]==="yes") as any;
   if(req.isAuthenticated()) req.user={id:actor.id,role:req.headers["x-role"]==="reader"?"manager":"spa"} as any;
   next();
 });
 service=mountOperationalSpaFunding(app,{enabled:true,pool,authenticate:requireAuth,hasPermission:permissions.hasPermission,
   transport,schema:"funding_demo",reviewedExtensions:true})!;
 server=app.listen(0,"127.0.0.1");
 await new Promise<void>(resolve=>server.once("listening",resolve));
 base=`http://127.0.0.1:${(server.address() as any).port}`;
},30000);
afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));await pool.end();});
async function http(path:string,body?:any,extra:Record<string,string>={}) {
 const r=await fetch(`${base}/api/payment-funding${path}`,{method:body===undefined?"GET":"POST",
   headers:{"content-type":"application/json","x-session":"yes",...extra},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
}
async function fixture(partial=false,open=false) {
 const id=`binding-${randomUUID()}`,scope=await seedSyntheticScope(service,id,"spa",{partial});
 await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[id]);
 await pool.query("INSERT INTO funding_demo.guests(id,first_name,last_name,vat_condition,document_number) VALUES($1,'Cliente','Sintético','consumidor_final','30111222')",[id]);
 await pool.query("INSERT INTO funding_demo.spa_treatments VALUES($1)",[id]);
 await pool.query("INSERT INTO funding_demo.spa_appointments VALUES($1,$1,$1,'confirmed')",[id]);
 await pool.query("UPDATE funding_demo.spa_accounts SET appointment_id=$1,status=$2 WHERE id=$1",[id,partial||open?"open":"closed"]);
 await pool.query("UPDATE funding_demo.cash_shifts SET opened_by=$2 WHERE id=$1",[`${id}:shift`,actor.id]);
 await pool.query("UPDATE funding_demo.spa_account_items SET quantity=1,unit_price=95000,item_type='treatment' WHERE account_id=$1",[id]);
 await pool.query("UPDATE funding_demo.billing_config SET punto_venta_homolog=nextval('funding_demo.binding_pvs') WHERE id=1");
 const prepared=await prepareSpaDocument(service,id,actor,"funding_demo");
 return {scope,prepared,request:{scope,documentId:prepared.documentId,applications:[
   {receiptId:`spa:${id}:S1`,amountCents:500_000},
   ...(partial?[]:[{receiptId:`spa:${id}:S2`,amountCents:9_000_000}])],
   newCollections:partial?[{rowId:"missing",method:"efectivo",amountCents:9_000_000,shiftId:`${id}:shift`}]:[]}};
}
async function reserve(f:Awaited<ReturnType<typeof fixture>>) {
 const preview=await http("/previews",f.request);expect(preview.status).toBe(200);
 const id=randomUUID(),body={operationId:id,previewHash:preview.body.data.previewHash,request:f.request};
 expect((await http("/operations",body)).status).toBe(200);
 return {id,body};
}
async function financialCounts(s:Scope) {
 return (await pool.query(`SELECT
   (SELECT count(*)::int FROM funding_demo.spa_payments WHERE account_id=$1) AS payments,
   (SELECT count(*)::int FROM funding_demo.cash_movements c JOIN funding_demo.spa_payments p ON p.id=c.payment_id WHERE p.account_id=$1) AS cash,
   (SELECT count(*)::int FROM funding_demo.folio_movements m JOIN funding_demo.folios f ON f.id=m.folio_id WHERE f.entity_id=$1 AND m.type='payment') AS folio`,[s.id])).rows[0];
}
it("default-disabled mounting registers nothing and touches neither DB nor transport",()=>{
 const app=express(),before=app._router?.stack?.length??0;
 expect(mountOperationalSpaFunding(app,{pool:null as any,transport:null as any,authenticate:null as any,hasPermission:null as any})).toBeNull();
 expect(app._router?.stack?.length??0).toBe(before);
});
async function unadoptedFixture() {
 const f=await fixture(true);
 // Roll back only this fixture's synthetic adoption, leaving real-source IDs.
 await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[f.scope.id]);
 await pool.query("DELETE FROM payment_funding.receipts WHERE scope_id=$1",[f.scope.id]);
 await pool.query("DELETE FROM payment_funding.scopes WHERE id=$1",[f.scope.id]);
 return f;
}
it("explicit unbilled adoption imports exact source links once without creating cash or authorizing",async()=>{
 const f=await unadoptedFixture(),before=await financialCounts(f.scope),n=sends;
 const url=`/spa/${f.scope.id}/adopt-unbilled`;
 expect((await http(`/spa/${f.scope.id}/enrollment`)).body.data).toEqual({adopted:false});
 expect((await http(url,{})).status).toBe(200);
 expect((await http(`/spa/${f.scope.id}/enrollment`)).body.data).toEqual({adopted:true});
 expect((await http(url,{})).status).toBe(200);
 const projection=await service.scope(f.scope,actor);
 expect(projection.receipts).toHaveLength(1);
 expect(projection.receipts[0]).toMatchObject({sourcePaymentId:`${f.scope.id}:S1`,freeCents:500_000});
 expect(projection.documents).toHaveLength(0);expect(projection.operations).toHaveLength(0);
 expect(await financialCounts(f.scope)).toEqual(before);expect(sends).toBe(n);
 expect((await pool.query("SELECT count(*)::int AS n FROM payment_funding.events WHERE event_key=$1",[`adopted:spa:${f.scope.id}`])).rows[0].n).toBe(1);
});
it("adoption rejects fiscal history and ambiguous Caja links without partial scope or receipt writes",async()=>{
 for(const reason of ["history","cash"]) {
   const f=await unadoptedFixture(),id=f.scope.id,before=await financialCounts(f.scope);
   if(reason==="history") await pool.query("INSERT INTO funding_demo.sales_invoices(estado,spa_account_id) VALUES('emitida',$1)",[id]);
   else await pool.query("UPDATE funding_demo.folio_movements SET cash_movement_id=NULL WHERE source_id=$1",[`${id}:S1`]);
   const result=await http(`/spa/${id}/adopt-unbilled`,{});
   expect(result.status).toBe(409);
   expect(result.body.error.code).toBe(reason==="history"?"HISTORY_REVIEW_REQUIRED":"PAYMENT_LINK_AMBIGUOUS");
   expect((await pool.query("SELECT 1 FROM payment_funding.scopes WHERE id=$1",[id])).rowCount).toBe(0);
   expect((await pool.query("SELECT 1 FROM payment_funding.receipts WHERE scope_id=$1",[id])).rowCount).toBe(0);
   expect(await financialCounts(f.scope)).toEqual(before);
 }
});
it("adoption requires authenticated operator permissions and server homologation; body cannot import history",async()=>{
 const f=await unadoptedFixture(),url=`/spa/${f.scope.id}/adopt-unbilled`;
 expect((await http(url,{}, {"x-session":"no"})).status).toBe(401);
 expect((await http(url,{}, {"x-role":"reader"})).status).toBe(403);
 expect((await http(url,{importHistory:true})).status).toBe(422);
 await pool.query("UPDATE funding_demo.billing_config SET arca_ambiente='produccion' WHERE id=1");
 try {
   const r=await http(url,{});expect(r.status).toBe(503);expect(r.body.error.code).toBe("FISCAL_ENVIRONMENT_BLOCKED");
 } finally {await pool.query("UPDATE funding_demo.billing_config SET arca_ambiente='homologacion' WHERE id=1");}
 expect((await pool.query("SELECT 1 FROM payment_funding.scopes WHERE id=$1",[f.scope.id])).rowCount).toBe(0);
});
it("funding uses one lease per concurrent series and excludes legacy while both pool slots are occupied",async()=>{
 const fixtures=[await fixture(),await fixture()];
 const reservations=[await reserve(fixtures[0]),await reserve(fixtures[1])];
 const identities=await Promise.all(fixtures.map(async f=>(await service.scope(f.scope,actor)).documents[0].snapshot));
 const limited=new Pool({...pool.options,max:2,connectionTimeoutMillis:250});
 let arrived=0,entered!:()=>void,release!:()=>void;
 const ready=new Promise<void>(resolve=>{entered=resolve;});
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const boundedTransport:FiscalTransport={
   async prepareNumbering(_identity,client) {
    return async()=>{
     if(++arrived===2) entered();
     await gate;
     // Real SQL inside the allocation transaction, without another pool loan.
     return Number((await client.query("SELECT 0 AS n")).rows[0].n);
    };
   },
   async authorize(){return {cae:"12345678901234",caeFechaVto:new Date("2026-12-31")};},
   async lookup(){return null;},
 };
 const bounded=new PaymentFundingService(new FundingStore(limited),service.adapters,
   new PersistentFiscalGateway(limited,boundedTransport,"funding_demo"));
 const pending=Promise.all(reservations.map(r=>bounded.authorize(r.id,actor)));
 try {
   await ready;
   const configModule=await import("../billing/billingConfig");
   const {emitirFactura}=await import("../billing/invoiceService");
   const spy=vi.spyOn(configModule,"getBillingConfig");
   try {
     for(const identity of identities) {
       spy.mockResolvedValue({arcaAmbiente:"homologacion",arcaCuit:identity.issuer,puntoVentaHomolog:identity.puntoVenta} as any);
       await expect(emitirFactura({tipoComprobante:"FB",cliente:{razonSocial:"Otro cliente",condicionIva:"consumidor_final"},items:[]}))
         .rejects.toMatchObject({statusCode:409});
     }
   } finally {spy.mockRestore();}
 } finally {release();}
 try {
   const results=await pending;
   expect(results.every(r=>r.status==="authorized_pending_link")).toBe(true);
   expect(arrived).toBe(2);expect(limited.waitingCount).toBe(0);expect(limited.idleCount).toBe(2);
   for(const r of reservations) expect((await bounded.finalize(r.id,actor)).status).toBe("applied");
 } finally {await limited.end();}
},10000);
it("existing collections use validated builder and persistent gateway; no new cash, payment or folio entries",async()=>{
 const f=await fixture(),before=await financialCounts(f.scope),r=await reserve(f),n=sends;
 const snapshot=(await service.scope(f.scope,actor)).documents[0].snapshot;
 expect(snapshot.validatedPreparation).toBe(true);expect(snapshot.amounts.montoTotal).toBe(95000);
 expect((await http(`/operations/${r.id}/authorize`,{})).body.data.status).toBe("authorized_pending_link");
 const results=await Promise.all([http(`/operations/${r.id}/finalize`,{}),http(`/operations/${r.id}/resume`,{})]);
 expect(results.every(r=>r.body.data.status==="applied")).toBe(true);
 expect(await financialCounts(f.scope)).toEqual(before);expect(sends-n).toBe(1);
 expect((await http("/operations",r.body)).body.data.replayed).toBe(true);
 const claim=(await pool.query("SELECT * FROM payment_funding.fiscal_claims WHERE operation_id=$1",[r.id])).rows[0];
 expect(claim.status).toBe("authorized");expect(claim.identity.numero).toBeGreaterThan(0);
 expect((await pool.query("SELECT cash_forma_pago_detalle FROM funding_demo.sales_invoices WHERE id::text=$1",[claim.invoice_id])).rows[0].cash_forma_pago_detalle).toEqual([
   {method:"tarjeta_debito",amount:5000},{method:"efectivo",amount:90000}]);
});
it("mixed mode validates cashier shifts, collects only the missing amount and consumes actual stock atomically",async()=>{
 const f=await fixture(true),id=f.scope.id;
 await pool.query("INSERT INTO funding_demo.inventory_items VALUES($1,'Insumo sintético','true','ml',10,1)",[id]);
 await pool.query("INSERT INTO funding_demo.inventory_warehouses VALUES($1,'true')",[id]);
 await pool.query("INSERT INTO funding_demo.warehouse_stock VALUES($1,$1,10,now())",[id]);
 await pool.query(`INSERT INTO funding_demo.stock_movements(item_id,movement_type,to_warehouse_id,created_at) VALUES($1,'transferencia',$1,now())`,[id]);
 await pool.query("INSERT INTO funding_demo.treatment_supplies VALUES($1,$1,$1,2,'ml')",[id]);
 const before=await financialCounts(f.scope),r=await reserve(f);
 await http(`/operations/${r.id}/authorize`,{});
 const result=await http(`/operations/${r.id}/finalize`,{});
 expect(result.body.data.status).toBe("applied");expect(result.body.data.result.newCollectionCents).toBe(9_000_000);
 expect(await financialCounts(f.scope)).toEqual({payments:before.payments+1,cash:before.cash+1,folio:before.folio+1});
 expect(Number((await pool.query("SELECT current_stock FROM funding_demo.inventory_items WHERE id=$1",[id])).rows[0].current_stock)).toBe(8);
 await http(`/operations/${r.id}/resume`,{});
 expect(Number((await pool.query("SELECT current_stock FROM funding_demo.warehouse_stock WHERE item_id=$1",[id])).rows[0].current_stock)).toBe(8);
 expect((await http(`/spa/${id}/collection-shifts`)).body.data.some((s:any)=>s.id===`${id}:shift`)).toBe(true);
});
it("insufficient inventory rolls back new cash and all close writes; same CAE/operation finishes after repair",async()=>{
 const f=await fixture(true),id=f.scope.id;
 await pool.query("INSERT INTO funding_demo.inventory_items VALUES($1,'Sin stock','true','ml',1,1)",[id]);
 await pool.query("INSERT INTO funding_demo.inventory_warehouses VALUES($1,'true')",[id]);
 await pool.query("INSERT INTO funding_demo.warehouse_stock VALUES($1,$1,1,now())",[id]);
 await pool.query(`INSERT INTO funding_demo.stock_movements(item_id,movement_type,to_warehouse_id,created_at) VALUES($1,'transferencia',$1,now())`,[id]);
 await pool.query("INSERT INTO funding_demo.treatment_supplies VALUES($1,$1,$1,2,'ml')",[id]);
 const before=await financialCounts(f.scope),r=await reserve(f);
 await http(`/operations/${r.id}/authorize`,{});const n=sends;
 expect((await http(`/operations/${r.id}/finalize`,{})).status).toBe(500);
 expect(await financialCounts(f.scope)).toEqual(before);
 expect((await service.get(r.id,actor)).status).toBe("authorized_pending_link");
 expect((await pool.query("SELECT status FROM funding_demo.spa_accounts WHERE id=$1",[id])).rows[0].status).toBe("open");
 expect((await pool.query("SELECT status FROM funding_demo.spa_appointments WHERE id=$1",[id])).rows[0].status).toBe("confirmed");
 await pool.query("UPDATE funding_demo.inventory_items SET current_stock=4 WHERE id=$1",[id]);
 await pool.query("UPDATE funding_demo.warehouse_stock SET current_stock=4 WHERE item_id=$1",[id]);
 expect((await http(`/operations/${r.id}/resume`,{})).body.data.status).toBe("applied");expect(sends).toBe(n);
});
it("provider CAE survives timeout and gateway reconstruction; concurrent recovery never re-emits",async()=>{
 const f=await fixture(),r=await reserve(f),before=await financialCounts(f.scope),n=sends;
 failAfterProvider=true;
 expect((await http(`/operations/${r.id}/authorize`,{})).body.data.status).toBe("fiscal_unknown");
 expect((await service.scope(f.scope,actor)).receipts.reduce((n,r)=>n+r.heldCents,0)).toBe(9_500_000);
 const identity=(await pool.query("SELECT identity FROM payment_funding.fiscal_claims WHERE operation_id=$1",[r.id])).rows[0].identity;
 const originalFetch=global.fetch;
 global.fetch=vi.fn(async(_url,options)=>{
   expect(String((options?.headers as any)?.SOAPAction)).toContain("FECompConsultar");
   expect(String(options?.body)).toContain(`<ar:CbteNro>${identity.numero}</ar:CbteNro>`);
   return new Response(consultationFixture({PtoVta:String(identity.puntoVenta),CbteTipo:"6",
     CbteDesde:String(identity.numero),CbteHasta:String(identity.numero),ImpTotal:"95000.00",
     CbteFch:identity.fecha.replace(/-/g,"")},[],"ar"));
 }) as any;
 const recreated=new PersistentFiscalGateway(pool,createArcaTransport(async()=>({token:"synthetic",sign:"synthetic"})),"funding_demo");
 let result;
 try {result=await Promise.all([recreated.lookup(r.id),recreated.lookup(r.id)]);}
 finally {global.fetch=originalFetch;}
 expect(result.every(r=>r.outcome==="authorized")).toBe(true);
 expect((await http(`/operations/${r.id}/resume`,{})).body.data.status).toBe("applied");
 expect(sends-n).toBe(1);expect(await financialCounts(f.scope)).toEqual(before);
});
it("unknown/not-found retains identity and funds, including missing local claim before first send",async()=>{
 const f=await fixture(),r=await reserve(f),o=await service.store.operation(r.id);
 await pool.query("UPDATE payment_funding.operations SET status='authorizing' WHERE id=$1",[r.id]);
 const gateway=new PersistentFiscalGateway(pool,{...transport,authorize:async()=>{throw new Error("timeout before send");},lookup:async()=>null},"funding_demo");
 expect((await gateway.authorize(r.id,o.claim)).outcome).toBe("unknown");
 const before=(await pool.query("SELECT * FROM payment_funding.fiscal_claims WHERE operation_id=$1",[r.id])).rows[0];
 expect((await gateway.lookup(r.id)).outcome).toBe("unknown");
 expect((await pool.query("SELECT identity FROM payment_funding.fiscal_claims WHERE operation_id=$1",[r.id])).rows[0].identity).toEqual(before.identity);
 expect((await service.scope(f.scope,actor)).receipts.reduce((n,r)=>n+r.heldCents,0)).toBe(9_500_000);
 const configModule=await import("../billing/billingConfig");
 const configSpy=vi.spyOn(configModule,"getBillingConfig").mockResolvedValue({
   arcaAmbiente:"homologacion",arcaCuit:before.identity.issuer,puntoVentaHomolog:before.identity.puntoVenta,
 } as any);
 try {
   const {emitirFactura}=await import("../billing/invoiceService");
   await expect(emitirFactura({tipoComprobante:"FB",cliente:{razonSocial:"Otro cliente",condicionIva:"consumidor_final"},items:[]}))
     .rejects.toMatchObject({statusCode:409});
 } finally {configSpy.mockRestore();}
 await expect(pool.query("UPDATE payment_funding.fiscal_claims SET identity=identity||'{\"numero\":999999}'::jsonb WHERE operation_id=$1",[r.id]))
   .rejects.toMatchObject({code:"23514"});
 await expect(pool.query("DELETE FROM payment_funding.fiscal_claims WHERE operation_id=$1",[r.id])).rejects.toMatchObject({code:"23514"});
});
it("real session/role middleware denies unauthenticated, read-only writes, forged shifts and fiscal snapshots",async()=>{
 const f=await fixture(true);
 expect((await http(`/scopes/spa/${f.scope.id}`,undefined,{"x-session":"no"})).status).toBe(401);
 expect((await http("/previews",f.request,{"x-role":"reader"})).status).toBe(403);
 expect((await http(`/scopes/spa/${f.scope.id}`,undefined,{"x-role":"reader"})).status).toBe(200);
 expect((await http(`/spa/${f.scope.id}/prepare-document`,{snapshot:{total:1}})).status).toBe(422);
 await pool.query("UPDATE funding_demo.cash_shifts SET opened_by='somebody-else' WHERE id=$1",[`${f.scope.id}:shift`]);
 expect((await http("/previews",f.request)).body.error.code).toBe("SHIFT_CLOSED");
 expect(()=>sessionFundingActor({isAuthenticated:()=>true,user:{id:"u",role:"spa"},session:{pending2FA:true}} as any,()=>true)).toThrow();
 const response=await fetch(`${base}/api/spa/account-items/${f.scope.id}:item`,{method:"DELETE",headers:{"x-session":"yes"}});
 expect(response.status).toBe(409);expect((await response.json()).error.code).toBe("MANAGED_SCOPE_USE_FUNDING");
});
it("verified history imports exact invoice/payment/Caja/folio IDs; ambiguity or omitted document rolls everything back",async()=>{
 const f=await fixture(),id=f.scope.id;
 // Start from a non-adopted synthetic operational account, with one persisted
 // payment ID covering one invoice. No amount-based matching is used.
 await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[id]);
 await pool.query("DELETE FROM payment_funding.receipts WHERE scope_id=$1",[id]);
 await pool.query("DELETE FROM payment_funding.scopes WHERE id=$1",[id]);
 await pool.query("UPDATE funding_demo.spa_payments SET amount=95000 WHERE id=$1",[`${id}:S1`]);
 await pool.query("DELETE FROM funding_demo.cash_movements WHERE payment_id=$1",[`${id}:S2`]);
 await pool.query("DELETE FROM funding_demo.folio_movements WHERE source_id=$1",[`${id}:S2`]);
 await pool.query("DELETE FROM funding_demo.spa_payments WHERE id=$1",[`${id}:S2`]);
 await pool.query("UPDATE funding_demo.cash_movements SET amount=95000 WHERE payment_id=$1",[`${id}:S1`]);
 await pool.query("UPDATE funding_demo.folio_movements SET amount=95000 WHERE source_id=$1",[`${id}:S1`]);
 const invoice=(await pool.query(`INSERT INTO funding_demo.sales_invoices(estado,spa_account_id,payment_id,tipo_comprobante,
   monto_total,cae,cliente_razon_social,cliente_condicion_iva) VALUES('emitida',$1,$2,'FB',95000,'12345678901234','Histórico','consumidor_final') RETURNING id`,
   [id,`${id}:S1`])).rows[0];
 await pool.query("UPDATE funding_demo.spa_accounts SET invoice_id=$2 WHERE id=$1",[id,invoice.id]);
 const plan={scope:f.scope,evidenceRef:"verified-synthetic-review",documents:[{invoiceId:String(invoice.id),applications:[
   {paymentId:`${id}:S1`,cashMovementId:`${id}:S1:cash`,folioMovementId:`${id}:S1:fm`,amountCents:9_500_000}]}]};
 const bad=structuredClone(plan);bad.documents[0].applications[0].cashMovementId="wrong-id";
 await expect(adoptVerifiedHistory(pool,bad,actor,createFirstSpaClose("funding_demo"),"funding_demo")).rejects.toMatchObject({code:"PAYMENT_LINK_AMBIGUOUS"});
 expect((await pool.query("SELECT id FROM payment_funding.scopes WHERE id=$1",[id])).rowCount).toBe(0);
 await expect(adoptVerifiedHistory(pool,{...plan,documents:[]},actor,createFirstSpaClose("funding_demo"),"funding_demo")).rejects.toMatchObject({code:"HISTORY_REVIEW_REQUIRED"});
 await adoptVerifiedHistory(pool,plan,actor,createFirstSpaClose("funding_demo"),"funding_demo");
 const projection=await service.scope(f.scope,actor);
 expect(projection.receipts[0].appliedCents).toBe(9_500_000);expect(projection.receipts[0].freeCents).toBe(0);
 await expect(adoptVerifiedHistory(pool,plan,{id:"no-history-role",permissions:["funding:write"]},createFirstSpaClose(),"funding_demo")).rejects.toMatchObject({status:403});
});
