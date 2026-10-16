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
import { enrollAllSpaAccounts, enrollSpaAccount } from "../billing/funding/operational/rollout";
import { SqlFundingAdapter } from "../billing/funding/adapters";
import { mountPaymentFunding } from "../billing/funding/integration";

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
const recipientData={firstName:"Cliente",lastName:"Identificado",documentType:"DNI",documentNumber:String(10000000+parseInt(randomUUID().slice(0,8),16)%90000000),vatCondition:"consumidor_final",cuit:"",address:"Domicilio de prueba"};
it("completes a named appointment without a linked customer and prepares from the saved real profile",async()=>{
 const f=await fixture(true),id=f.scope.id;
 await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[id]);
 await pool.query("UPDATE funding_demo.spa_appointments SET guest_id=NULL WHERE id=$1",[id]);
 expect((await http(`/spa/${id}/prepare-document`,{})).body.error.message).toContain("receptor fiscal");
 const before=await financialCounts(f.scope),n=sends;
 const saved=await http(`/spa/${id}/recipient`,recipientData);
 expect(saved.status).toBe(200);expect(saved.body.data.guestId).toBeTruthy();
 expect((await http(`/spa/${id}/recipient`,recipientData)).body.data.guestId).toBe(saved.body.data.guestId);
 expect((await pool.query("SELECT guest_id FROM funding_demo.spa_appointments WHERE id=$1",[id])).rows[0].guest_id).toBe(saved.body.data.guestId);
 expect((await http(`/spa/${id}/prepare-document`,{})).status).toBe(200);
 const projection=await service.scope(f.scope,actor);
 expect(projection.documents[0].snapshot.recipient).toMatchObject({razonSocial:"Cliente Identificado",dni:recipientData.documentNumber});
 expect(await financialCounts(f.scope)).toEqual(before);expect(sends).toBe(n);
 const immutable=await http(`/spa/${id}/recipient`,{...recipientData,guestId:saved.body.data.guestId,firstName:"Otro"});
 expect(immutable.status).toBe(409);expect(immutable.body.error.code).toBe("FISCAL_OPERATION_PENDING");
});
it("recipient editing requires write permission, rejects missing fiscal data and respects explicit guest namespace",async()=>{
 const f=await fixture(true),id=f.scope.id;
 await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[id]);
 expect((await http(`/spa/${id}/recipient`,recipientData,{"x-role":"reader"})).status).toBe(403);
 expect((await http(`/spa/${id}/recipient`,{...recipientData,documentNumber:""})).status).toBe(422);
 expect((await http(`/spa/${id}/recipient`,{...recipientData,vatCondition:"responsable_inscripto"})).status).toBe(422);
 await pool.query("INSERT INTO funding_demo.spa_clients(id,first_name,last_name,vat_condition,document_number) VALUES($1,'Otro','Registro','consumidor_final','35111111')",[id]);
 expect((await http(`/spa/${id}/recipient`,{...recipientData,guestId:id,kind:"guest"})).status).toBe(200);
 expect((await http(`/spa/${id}/prepare-document`,{})).status).toBe(200);
 expect((await service.scope(f.scope,actor)).documents[0].snapshot.recipient.razonSocial).toBe("Cliente Identificado");
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
 await pool.query("INSERT INTO funding_demo.inventory_items(id,name,is_active,unit,current_stock,cost_price) VALUES($1,'Insumo sintético','true','ml',10,1)",[id]);
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
 await pool.query("INSERT INTO funding_demo.inventory_items(id,name,is_active,unit,current_stock,cost_price) VALUES($1,'Sin stock','true','ml',1,1)",[id]);
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

it("automatic module cutover enrolls pending accounts once, preserves old invoices and exposes read-only history",async()=>{
 const pending=await unadoptedFixture(),history=await unadoptedFixture();
 const invoice=(await pool.query("INSERT INTO funding_demo.sales_invoices(estado,spa_account_id,tipo_comprobante,monto_total,punto_venta,numero) VALUES('emitida',$1,'FB',95000,nextval('funding_demo.binding_pvs'),1) RETURNING id",[history.scope.id])).rows[0];
 // Old ownership may exist only on the account, not on the invoice row.
 await pool.query("UPDATE funding_demo.sales_invoices SET spa_account_id=NULL WHERE id=$1",[invoice.id]);
 await pool.query("UPDATE funding_demo.spa_accounts SET invoice_id=$2 WHERE id=$1",[history.scope.id,invoice.id]);
 const beforePending=await financialCounts(pending.scope),beforeHistory=await financialCounts(history.scope),n=sends;
 await Promise.all([enrollSpaAccount(service,pending.scope.id,"funding_demo"),enrollSpaAccount(service,pending.scope.id,"funding_demo")]);
 await enrollSpaAccount(service,history.scope.id,"funding_demo");
 const current=await service.scope(pending.scope,actor),old=await service.scope(history.scope,actor);
 expect(current.legacyHistory).toBeUndefined();expect(current.receipts).toHaveLength(1);
 expect(current.receipts[0].freeCents).toBe(500_000);
 expect(old.legacyHistory).toMatchObject({totalCents:9_500_000,paidCents:500_000});
 expect(old.legacyHistory.invoices).toEqual([expect.objectContaining({id:String(invoice.id),status:"emitida",amountCents:9_500_000})]);
 expect(old.receipts).toHaveLength(0);expect(old.documents).toHaveLength(0);
 await expect(prepareSpaDocument(service,history.scope.id,actor,"funding_demo")).rejects.toMatchObject({code:"HISTORICAL_ACCOUNT_READ_ONLY"});
 expect((await pool.query("SELECT estado FROM funding_demo.sales_invoices WHERE id=$1",[invoice.id])).rows[0].estado).toBe("emitida");
 expect(await financialCounts(pending.scope)).toEqual(beforePending);expect(await financialCounts(history.scope)).toEqual(beforeHistory);expect(sends).toBe(n);
 await enrollAllSpaAccounts(service,"funding_demo");
 expect((await pool.query("SELECT a.id FROM funding_demo.spa_accounts a LEFT JOIN payment_funding.scopes s ON s.kind='spa' AND s.id=a.id WHERE s.id IS NULL")).rowCount).toBe(0);
 expect((await pool.query("SELECT count(*)::int AS n FROM payment_funding.events WHERE event_key=$1",[`adopted:spa:${pending.scope.id}`])).rows[0].n).toBe(1);
});
it("creates an unpaid folio with the operational required unique codigo, idempotently",async()=>{
 const schema="funding_codigo_regression", id=randomUUID();
 await pool.query(`CREATE SCHEMA ${schema}`);
 try {
   await pool.query(`CREATE TABLE ${schema}.spa_accounts(id text PRIMARY KEY,status text,charged_to text,invoice_id integer,nc_id integer);
     CREATE TABLE ${schema}.spa_account_items(id text,account_id text,description text,quantity integer,subtotal numeric);
     CREATE TABLE ${schema}.spa_payments(id text,account_id text,amount numeric,method text,status text,invoice_ref text);
     CREATE TABLE ${schema}.sales_invoices(id integer,spa_account_id text,tipo_comprobante text,punto_venta integer,numero integer,estado text,monto_total numeric,nota_credito_id integer);
     CREATE TABLE ${schema}.folios(id text PRIMARY KEY,codigo text NOT NULL UNIQUE,entity_type text NOT NULL,entity_id text NOT NULL,status text,total_charges numeric,total_payments numeric,balance numeric)`);
   await pool.query(`INSERT INTO ${schema}.spa_accounts VALUES($1,'open',NULL,NULL,NULL)`,[id]);
   await pool.query(`INSERT INTO ${schema}.spa_account_items VALUES('item',$1,'Masaje',1,85000)`,[id]);
   const adapted=new PaymentFundingService(service.store,{...service.adapters,spa:new SqlFundingAdapter("spa",schema,async()=>{})},service.fiscal);
   await Promise.all([enrollSpaAccount(adapted,id,schema),enrollSpaAccount(adapted,id,schema)]);
   const rows=(await pool.query(`SELECT * FROM ${schema}.folios WHERE entity_id=$1`,[id])).rows;
   expect(rows).toHaveLength(1);
   expect(rows[0]).toMatchObject({codigo:`SP-${id}`,total_charges:"85000",total_payments:"0",balance:"85000"});
   expect((await pool.query("SELECT 1 FROM payment_funding.receipts WHERE scope_id=$1",[id])).rowCount).toBe(0);
 } finally { await pool.query(`DROP SCHEMA ${schema} CASCADE`); }
});
it("one failed historical account does not stop enrollment of other SPA accounts",async()=>{
 const broken=await unadoptedFixture(), healthy=await unadoptedFixture();
 const original=service.store.transaction.bind(service.store);
 const transaction=vi.spyOn(service.store,"transaction").mockImplementation((scope,...args:any[])=>{
   if(scope.id===broken.scope.id) return Promise.reject(Object.assign(new Error("synthetic SQL failure"),{code:"42703"}));
   return (original as any)(scope,...args);
 });
 const logged=vi.spyOn(console,"error").mockImplementation(()=>{});
 try {
   const result=await enrollAllSpaAccounts(service,"funding_demo");
   expect(result.failed).toBe(1);
   expect((await pool.query("SELECT 1 FROM payment_funding.scopes WHERE kind='spa' AND id=$1",[healthy.scope.id])).rowCount).toBe(1);
   expect((await pool.query("SELECT 1 FROM payment_funding.scopes WHERE kind='spa' AND id=$1",[broken.scope.id])).rowCount).toBe(0);
   expect(logged).toHaveBeenCalledWith(expect.any(String),{code:"42703"});
 } finally { transaction.mockRestore(); logged.mockRestore(); }
 await enrollSpaAccount(service,broken.scope.id,"funding_demo");
});
it("closed nonfiscal accounts remain invoiceable with the same receipts, no new collection or stock consumption",async()=>{
 const f=await fixture(false),id=f.scope.id;
 await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[id]);
 await pool.query("DELETE FROM payment_funding.receipts WHERE scope_id=$1",[id]);
 await pool.query("DELETE FROM payment_funding.scopes WHERE id=$1",[id]);
 // Distinct synthetic fiscal snapshot from fixture's discarded test preparation.
 await pool.query("UPDATE funding_demo.guests SET first_name='Cierre anterior' WHERE id=$1",[id]);
 const before=await financialCounts(f.scope);
 await enrollSpaAccount(service,id,"funding_demo");
 expect((await service.scope(f.scope,actor)).legacyHistory).toBeUndefined();
 const prepared=await prepareSpaDocument(service,id,actor,"funding_demo");
 const r=await reserve({...f,prepared,request:{...f.request,documentId:prepared.documentId}});
 expect((await http(`/operations/${r.id}/authorize`,{})).body.data.status).toBe("authorized_pending_link");
 expect((await http(`/operations/${r.id}/finalize`,{})).body.data.status).toBe("applied");
 expect(await financialCounts(f.scope)).toEqual(before);
 expect((await pool.query("SELECT 1 FROM funding_demo.inventory_consumption_jobs WHERE source_id=$1",[id])).rowCount).toBe(0);
});
it("full rollout routes new accounts automatically and blocks legacy financial writers before enrollment",async()=>{
 const f=await unadoptedFixture(),id=f.scope.id;
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.isAuthenticated=(()=>true) as any;req.user={id:actor.id,role:"spa"} as any;next();});
 const {requireAuth}=await import("../auth");
 mountOperationalSpaFunding(app,{enabled:true,pool,authenticate:requireAuth,hasPermission:(_role,key)=>["funding:read","funding:write"].includes(key),transport,schema:"funding_demo",reviewedExtensions:true,fullRollout:true});
 let writes=0;app.post("/api/spa/accounts/:id/close",(_req,res)=>{writes++;res.json({ok:true});});
 const srv=app.listen(0,"127.0.0.1");await new Promise<void>(r=>srv.once("listening",r));
 const host=`http://127.0.0.1:${(srv.address() as any).port}`;
 try {
  const blocked=await fetch(`${host}/api/spa/accounts/${id}/close`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
  expect(blocked.status).toBe(409);expect(writes).toBe(0);
  const result=await fetch(`${host}/api/payment-funding/scopes/spa/${id}`);
  expect(result.status).toBe(200);expect((await result.json()).data.receipts).toHaveLength(1);
 } finally {await new Promise<void>(r=>srv.close(()=>r()));}
});

async function emptyAccount() {
 const f=await unadoptedFixture(),id=f.scope.id;
 await pool.query("DELETE FROM funding_demo.folio_movements WHERE folio_id=$1 AND type='payment'",[`${id}:folio`]);
 await pool.query("DELETE FROM funding_demo.cash_movements WHERE payment_id IN (SELECT id FROM funding_demo.spa_payments WHERE account_id=$1)",[id]);
 await pool.query("DELETE FROM funding_demo.spa_payments WHERE account_id=$1",[id]);
 await pool.query("UPDATE funding_demo.folios SET total_payments=0,balance=total_charges,status='open' WHERE entity_id=$1",[id]);
 await pool.query("UPDATE funding_demo.spa_accounts SET total_paid=0 WHERE id=$1",[id]);
 await enrollSpaAccount(service,id,"funding_demo");
 return f;
}
async function accountCommand(id:string,request:any,commandId=randomUUID(),headers:Record<string,string>={}) {
 return http(`/spa/${id}/account`,{commandId,request},headers);
}
it("account charges invalidate an unused draft, preserve audit and retry without duplicating a charge",async()=>{
 const f=await emptyAccount(),id=f.scope.id;
 const old=await prepareSpaDocument(service,id,actor,"funding_demo"),commandId=randomUUID();
 const request={action:"add-charge",description:"Extra SPA",quantity:2,unitCents:100000};
 const results=await Promise.all([accountCommand(id,request,commandId),accountCommand(id,request,commandId)]);
 expect(results.map(r=>r.status)).toEqual([200,200]);
 const view=await http(`/spa/${id}/account`);
 expect(view.status).toBe(200);expect(view.body.data).toMatchObject({totalCents:9700000,paidCents:0,balanceCents:9700000,readOnly:false});
 expect(view.body.data.items.filter((i:any)=>i.description==="Extra SPA")).toHaveLength(1);
 expect((await pool.query("SELECT 1 FROM payment_funding.documents WHERE id=$1",[old.documentId])).rowCount).toBe(0);
 expect((await pool.query("SELECT payload FROM payment_funding.events WHERE event_key=$1",[`spa-drafts:${commandId}`])).rows[0].payload.documents[0].id).toBe(old.documentId);
 expect((await accountCommand(id,{...request,unitCents:200000},commandId)).body.error.code).toBe("IDEMPOTENCY_CONFLICT");
 const itemId=results[0].body.data.itemId;
 expect((await accountCommand(id,{action:"void-charge",itemId,reason:"Extra cargado por error"})).status).toBe(200);
 expect((await http(`/spa/${id}/account`)).body.data.totalCents).toBe(9500000);
 expect((await http(`/spa/${id}/account`)).body.data.movements.some((m:any)=>m.type==="void")).toBe(true);
});
it("account payment records one receipt/Caja entry and can later invoice without collecting it again",async()=>{
 const f=await emptyAccount(),id=f.scope.id,cmd=randomUUID(),before=await financialCounts(f.scope),n=sends;
 const request={action:"payment",amountCents:9500000,method:"efectivo",shiftId:`${id}:shift`,notes:"Abono antes de facturar"};
 const results=await Promise.all([accountCommand(id,request,cmd),accountCommand(id,request,cmd)]);
 expect(results.map(r=>r.status)).toEqual([200,200]);
 expect(await financialCounts(f.scope)).toEqual({payments:before.payments+1,cash:before.cash+1,folio:before.folio+1});
 const view=(await http(`/spa/${id}/account`)).body.data;expect(view.balanceCents).toBe(0);expect(view.paidCents).toBe(9500000);
 expect((await accountCommand(id,request)).body.error.code).toBe("COLLECTION_EXCEEDS_DEBT");
 const prepared=await prepareSpaDocument(service,id,actor,"funding_demo"),projection=await service.scope(f.scope,actor);
 const invoiceRequest={scope:f.scope,documentId:prepared.documentId,applications:projection.receipts.map(r=>({receiptId:r.id,amountCents:r.freeCents})),newCollections:[]};
 const preview=await http("/previews",invoiceRequest),operationId=randomUUID();
 expect(preview.status).toBe(200);
 expect((await http("/operations",{operationId,previewHash:preview.body.data.previewHash,request:invoiceRequest})).status).toBe(200);
 expect((await http(`/operations/${operationId}/authorize`,{})).status).toBe(202);
 expect((await http(`/operations/${operationId}/finalize`,{})).body.data.status).toBe("applied");
 expect(await financialCounts(f.scope)).toEqual({payments:before.payments+1,cash:before.cash+1,folio:before.folio+1});expect(sends-n).toBe(1);
 expect((await accountCommand(id,{action:"add-charge",description:"Luego de facturar",quantity:1,unitCents:100})).status).toBe(409);
});
it("account writes require role, own open SPA shift and reject bad amounts without mutations",async()=>{
 const f=await emptyAccount(),id=f.scope.id,before=await financialCounts(f.scope);
 const request={action:"payment",amountCents:100,method:"efectivo",shiftId:`${id}:shift`,notes:""};
 expect((await accountCommand(id,request,randomUUID(),{"x-role":"reader"})).status).toBe(403);
 expect((await accountCommand(id,{...request,shiftId:"another-cashier"})).body.error.code).toBe("SHIFT_CLOSED");
 expect((await accountCommand(id,{...request,amountCents:0})).status).toBe(422);
 expect(await financialCounts(f.scope)).toEqual(before);
});
async function destination() {
 const id=randomUUID();
 await pool.query("INSERT INTO funding_demo.rooms VALUES($1,'806')",[id]);
 await pool.query("INSERT INTO funding_demo.guests(id,first_name,last_name) VALUES($1,'Huésped','Destino')",[id]);
 await pool.query("INSERT INTO funding_demo.reservations VALUES($1,'checked_in',$1,$1)",[id]);
 await pool.query("INSERT INTO funding_demo.folios(id,codigo,entity_type,entity_id,status,total_charges,total_payments,balance) VALUES($1,$1,'reservation',$2,'open',100000,0,100000)",[`${id}:folio`,id]);
 return id;
}
it("room transfer is atomic and idempotent, creates one reservation charge and no new money or invoice",async()=>{
 const f=await emptyAccount(),id=f.scope.id,target=await destination(),before=await financialCounts(f.scope),n=sends;
 const request={action:"room-transfer",reservationId:target,expectedCents:9500000,reason:"Solicitado por el huésped"},cmd=randomUUID();
 const results=await Promise.all([accountCommand(id,request,cmd),accountCommand(id,request,cmd)]);
 expect(results.map(r=>r.status)).toEqual([200,200]);
 expect((await pool.query("SELECT * FROM funding_demo.charges WHERE reservation_id=$1",[target])).rows).toHaveLength(1);
 expect((await pool.query("SELECT amount FROM funding_demo.charges WHERE reservation_id=$1",[target])).rows[0].amount).toBe("95000");
 expect((await pool.query("SELECT type FROM funding_demo.folio_movements WHERE source_type='spa_room_transfer' AND source_id=$1",[results[0].body.data.chargeId])).rows.map(r=>r.type).sort()).toEqual(["transfer_in","transfer_out"]);
 const view=(await http(`/spa/${id}/account`)).body.data;
 expect(view).toMatchObject({balanceCents:0,paidCents:0,readOnly:true,canInvoice:false,transferred:{reservationId:target,roomNumber:"806",amountCents:9500000}});
 expect((await pool.query("SELECT balance FROM funding_demo.folios WHERE entity_id=$1",[target])).rows[0].balance).toBe("195000.00");
 expect(await financialCounts(f.scope)).toEqual(before);expect(sends).toBe(n);
 const legacy=await fetch(`${base}/api/charges/${results[0].body.data.chargeId}/anular`,{method:"PATCH",headers:{"x-session":"yes","content-type":"application/json"},body:JSON.stringify({motivoAnulacion:"No modificar transferencia aislada"})});
 expect(legacy.status).toBe(409);expect((await legacy.json()).error.code).toBe("MANAGED_SCOPE_USE_FUNDING");
 expect((await accountCommand(id,{...request,reservationId:await destination()})).status).toBe(409);
});
it("room transfer rejects stale amount, departed destination and paid account without partial writes",async()=>{
 const f=await emptyAccount(),id=f.scope.id,target=await destination();
 const request={action:"room-transfer",reservationId:target,expectedCents:9500000,reason:"Transferencia solicitada"};
 expect((await accountCommand(id,{...request,expectedCents:1})).body.error.code).toBe("PREVIEW_STALE");
 await pool.query("UPDATE funding_demo.reservations SET status='checked_out' WHERE id=$1",[target]);
 expect((await accountCommand(id,request)).body.error.code).toBe("ROOM_NOT_AVAILABLE");
 expect((await pool.query("SELECT 1 FROM funding_demo.charges WHERE reservation_id=$1",[target])).rowCount).toBe(0);
 expect((await pool.query("SELECT status FROM funding_demo.spa_accounts WHERE id=$1",[id])).rows[0].status).toBe("open");
 const paid=await fixture(true);
 expect((await accountCommand(paid.scope.id,request)).body.error.code).toBe("PAYMENTS_REQUIRE_REVIEW");
});
it("product added to SPA consumes once and the invoice finalizer does not consume it again",async()=>{
 const f=await emptyAccount(),id=f.scope.id,productId=randomUUID();
 await pool.query("INSERT INTO funding_demo.inventory_items(id,name,is_active,unit,current_stock,cost_price,item_kind) VALUES($1,'Producto venta','true','unidad',10,1,'venta_directa')",[productId]);
 await pool.query("INSERT INTO funding_demo.inventory_warehouses VALUES($1,'true')",[productId]);
 await pool.query("INSERT INTO funding_demo.warehouse_stock VALUES($1,$1,10,now())",[productId]);
 await pool.query("INSERT INTO funding_demo.stock_movements(item_id,movement_type,to_warehouse_id,created_at) VALUES($1,'transferencia',$1,now())",[productId]);
 const cmd=randomUUID(),request={action:"add-charge",description:"Producto venta",quantity:2,unitCents:10000,inventoryItemId:productId};
 const first=await accountCommand(id,request,cmd);expect(first.status).toBe(200);
 expect((await accountCommand(id,request,cmd)).status).toBe(200);
 expect(Number((await pool.query("SELECT current_stock FROM funding_demo.inventory_items WHERE id=$1",[productId])).rows[0].current_stock)).toBe(8);
 const job=(await pool.query("SELECT * FROM funding_demo.inventory_consumption_jobs WHERE source_type='spa_account_item' AND source_id=$1",[first.body.data.itemId])).rows[0];
 expect(job.status).toBe("completed");
 expect((await accountCommand(id,{action:"void-charge",itemId:first.body.data.itemId,reason:"Revisar consumo"})).body.error.code).toBe("STOCK_REVIEW_REQUIRED");
 const total=9520000;
 expect((await accountCommand(id,{action:"payment",amountCents:total,method:"efectivo",shiftId:`${id}:shift`,notes:""})).status).toBe(200);
 const prepared=await prepareSpaDocument(service,id,actor,"funding_demo"),projection=await service.scope(f.scope,actor);
 const req={scope:f.scope,documentId:prepared.documentId,applications:projection.receipts.map(r=>({receiptId:r.id,amountCents:r.freeCents})),newCollections:[]};
 const preview=await http("/previews",req),operationId=randomUUID();expect(preview.status).toBe(200);
 await http("/operations",{operationId,previewHash:preview.body.data.previewHash,request:req});await http(`/operations/${operationId}/authorize`,{});
 expect((await http(`/operations/${operationId}/finalize`,{})).body.data.status).toBe("applied");
 expect(Number((await pool.query("SELECT current_stock FROM funding_demo.inventory_items WHERE id=$1",[productId])).rows[0].current_stock)).toBe(8);
 expect((await pool.query("SELECT 1 FROM funding_demo.stock_movements WHERE source_type='spa_account_item' AND source_id=$1",[first.body.data.itemId])).rowCount).toBe(1);
});
it("out-of-stock product remains a saved charge with a pending consumption and no partial stock mutation",async()=>{
 const f=await emptyAccount(),id=f.scope.id,p=randomUUID();
 await pool.query("INSERT INTO funding_demo.inventory_items(id,name,is_active,unit,current_stock,cost_price,item_kind) VALUES($1,'Agotado','true','unidad',0,1,'venta_directa')",[p]);
 const result=await accountCommand(id,{action:"add-charge",description:"Producto agotado",quantity:1,unitCents:10000,inventoryItemId:p});
 expect(result.status).toBe(200);
 const job=(await pool.query("SELECT status,error FROM funding_demo.inventory_consumption_jobs WHERE source_id=$1",[result.body.data.itemId])).rows[0];
 expect(job.status).toBe("pending");expect(job.error).toBeTruthy();
 expect((await pool.query("SELECT 1 FROM funding_demo.stock_movements WHERE source_id=$1",[result.body.data.itemId])).rowCount).toBe(0);
 expect((await http(`/spa/${id}/account`)).body.data.totalCents).toBe(9510000);
});
it("SPA catalog rejects products from other areas or unsupported tax categories",async()=>{
 const f=await emptyAccount(),id=f.scope.id,p=randomUUID();
 await pool.query("INSERT INTO funding_demo.item_categories VALUES($1,'restaurant','true')",[p]);
 await pool.query("INSERT INTO funding_demo.inventory_items(id,name,is_active,unit,current_stock,cost_price,item_kind,category_id) VALUES($1,'Solo restaurant','true','unidad',5,1,'venta_directa',$1)",[p]);
 const request={action:"add-charge",description:"Producto inválido",quantity:1,unitCents:10000,inventoryItemId:p};
 expect((await accountCommand(id,request)).body.error.code).toBe("INVALID_PRODUCT");
 await pool.query("UPDATE funding_demo.inventory_items SET category_id='synthetic-spa',iva_rate='10.5' WHERE id=$1",[p]);
 expect((await accountCommand(id,request)).body.error.code).toBe("INVALID_PRODUCT");
 expect((await http(`/spa/${id}/product-catalog`)).body.data.some((r:any)=>r.id===p)).toBe(false);
 expect((await http(`/spa/${id}/account`)).body.data.totalCents).toBe(9500000);
});
it("stock failure rolls the entire room transfer back and preserves both folios and the original appointment",async()=>{
 const f=await emptyAccount(),id=f.scope.id,target=await destination(),p=randomUUID();
 await pool.query("INSERT INTO funding_demo.inventory_items(id,name,is_active,unit,current_stock,cost_price) VALUES($1,'Insumo faltante','true','ml',0,1)",[p]);
 await pool.query("INSERT INTO funding_demo.treatment_supplies VALUES($1,$2,$1,2,'ml')",[p,id]);
 const before=await financialCounts(f.scope);
 const r=await accountCommand(id,{action:"room-transfer",reservationId:target,expectedCents:9500000,reason:"Transferencia con stock pendiente"});
 expect(r.status).toBe(409);expect(r.body.error.code).toBe("STOCK_REVIEW_REQUIRED");
 expect((await pool.query("SELECT 1 FROM funding_demo.charges WHERE reservation_id=$1",[target])).rowCount).toBe(0);
 expect((await pool.query("SELECT status FROM funding_demo.spa_accounts WHERE id=$1",[id])).rows[0].status).toBe("open");
 expect((await pool.query("SELECT status FROM funding_demo.spa_appointments WHERE id=$1",[id])).rows[0].status).toBe("confirmed");
 expect(Number((await pool.query("SELECT balance FROM funding_demo.folios WHERE entity_id=$1",[target])).rows[0].balance)).toBe(100000);
 expect(await financialCounts(f.scope)).toEqual(before);
});
it("ordinary Reception charges do not retain extra connections while protecting transferred SPA charges",async()=>{
 const limited=new Pool({host:"/tmp/folio-funding-isolated/socket",port:55439,user:"runner",database:"folio_funding_synthetic",max:2,connectionTimeoutMillis:2000,options:"-c search_path=funding_demo,public"});
 const app=express();app.use(express.json());
 mountPaymentFunding(app,{enabled:true,pool:limited,fiscal:service.fiscal,firstSpaClose:createFirstSpaClose("funding_demo"),authenticate:(_req,_res,next)=>next(),actor:()=>actor,operationalSchema:"funding_demo"});
 let arrived=0,release!:()=>void;
 const barrier=new Promise<void>(resolve=>{release=resolve;});
 app.post("/api/charges",async(_req,res)=>{
  if(++arrived===2)release();
  await barrier;
  try {await limited.query("SELECT 1");res.json({ok:true});}
  catch(error){res.status(500).json({ok:false});}
 });
 const listener=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>listener.once("listening",resolve));
 const url=`http://127.0.0.1:${(listener.address() as any).port}/api/charges`;
 try {
  const responses=await Promise.all([1,2].map(()=>fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reservationId:randomUUID()}),signal:AbortSignal.timeout(5000)})));
  expect(responses.map(r=>r.status)).toEqual([200,200]);
 } finally {release();await new Promise<void>(resolve=>listener.close(()=>resolve()));await limited.end();}
});
