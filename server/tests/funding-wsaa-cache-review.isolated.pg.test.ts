/** R5 regression derived from Codex d323b886. Synthetic Unix-socket DB only.
 * Real configured transport, WSAA signer/cache, gateway, store and finalizer.
 * No operational DATABASE_URL, certificate or remote service is used. */
import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getTableConfig } from "drizzle-orm/pg-core";
import forge from "node-forge";
import * as schema from "../../shared/schema";
import { installSyntheticSchema, seedSyntheticScope, demoActor } from "../../demo/funding/backend";
import { PaymentFundingService } from "../billing/funding/service";
import { FundingStore } from "../billing/funding/store";
import { SqlFundingAdapter } from "../billing/funding/adapters";
import { createFirstSpaClose } from "../billing/funding/operational/spaClosure";
import { PersistentFiscalGateway } from "../billing/funding/operational/fiscalGateway";
import { configuredArcaTransport } from "../billing/funding/operational/arcaTransport";
import { calcularMontos } from "../billing/invoiceService";
import { authorizationFixture, consultationFixture } from "./helpers/wsfeConsultationFixture";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const connection=vi.hoisted(()=>({current:null as any}));
vi.mock("../db",async()=>{
  const {default:pg}=await import("pg");
  const {drizzle}=await import("drizzle-orm/node-postgres");
  const tables=await import("../../shared/schema");
  const pool=new pg.Pool({host:"/tmp/folio-funding-isolated/socket",port:55439,user:"runner",
    password:"",database:"folio_funding_synthetic",max:2,connectionTimeoutMillis:250,
    options:"-c search_path=funding_wsaa_review,public"});
  connection.current={pool,db:drizzle(pool,{schema:tables})};
  return {get pool(){return connection.current.pool;},get db(){return connection.current.db;}};
});
let {pool,db}=await import("../db");
let certPem:string,keyPem:string;
let logins=0,emissions=0,lastNumber=0,failAfterCae=false;
let beforeLogin:(()=>Promise<void>)|undefined;
const nativeFetch=global.fetch;
const issuer="20111111112",pv=99;
const items=[{descripcion:"SPA sintético",cantidad:1,precioUnitario:95000,alicuotaIva:"21" as const,
  subtotal:95000,subtotalNeto:78512.4}];
const newService=()=>new PaymentFundingService(new FundingStore(pool),{
  reservation:new SqlFundingAdapter("reservation","funding_demo"),
  spa:new SqlFundingAdapter("spa","funding_demo",createFirstSpaClose("funding_demo")),
},new PersistentFiscalGateway(pool,configuredArcaTransport(),"funding_wsaa_review"));
async function restartConnectionsAndModules() {
  // No process-local token or transport survives this boundary. A new module
  // graph and all-new SQL sessions must recover from the persisted cache.
  await pool.end();
  vi.resetModules();
  // Vitest retains mock-factory exports across resetModules. Explicitly replace
  // the old, closed pool as well as resetting the real WSAA/transport modules.
  pool=new pg.Pool({...pool.options,max:2,connectionTimeoutMillis:250});
  db=drizzle(pool,{schema});connection.current={pool,db};
}
beforeAll(async()=>{
  await installSyntheticSchema(pool);
  await pool.query(await readFile(new URL("./helpers/fundingOperationalFixture.sql",import.meta.url),"utf8"));
  await pool.query(await readFile(new URL("../billing/funding/operational/schema.sql",import.meta.url),"utf8"));
  await pool.query("DROP SCHEMA IF EXISTS funding_wsaa_review CASCADE; CREATE SCHEMA funding_wsaa_review");
  for(const table of [schema.billingConfig,schema.salesInvoices]) {
    const config=getTableConfig(table);
    await pool.query(`CREATE TABLE funding_wsaa_review."${config.name}" (${
      config.columns.map(c=>`"${c.name}" ${c.getSQLType()}${c.primary?" PRIMARY KEY":""}`).join(",")})`);
  }
  await pool.query(`ALTER TABLE funding_wsaa_review.sales_invoices ALTER COLUMN id
    SET DEFAULT nextval('funding_demo.binding_invoice_ids');
    CREATE UNIQUE INDEX ON funding_wsaa_review.sales_invoices(tipo_comprobante,punto_venta,numero)`);
  const keys=forge.pki.rsa.generateKeyPair(1024),cert=forge.pki.createCertificate();
  cert.publicKey=keys.publicKey;cert.serialNumber="01";
  cert.validity.notBefore=new Date("2026-01-01");cert.validity.notAfter=new Date("2027-01-01");
  cert.setSubject([{name:"commonName",value:"Synthetic WSAA regression only"}]);cert.setIssuer(cert.subject.attributes);
  cert.sign(keys.privateKey,forge.md.sha256.create());
  certPem=forge.pki.certificateToPem(cert);keyPem=forge.pki.privateKeyToPem(keys.privateKey);
  await db.insert(schema.billingConfig).values({id:1,razonSocial:"Sintético",cuit:issuer,arcaCuit:issuer,
    arcaAmbiente:"homologacion",puntoVentaHomolog:pv,arcaCert:certPem,arcaKey:keyPem});
});
beforeEach(async()=>{
  logins=0;emissions=0;lastNumber=0;failAfterCae=false;beforeLogin=undefined;
  await pool.query(`UPDATE funding_wsaa_review.billing_config SET
    arca_ta_token=NULL,arca_ta_sign=NULL,arca_ta_expiry=NULL,arca_ta_ambiente=NULL;
    TRUNCATE funding_wsaa_review.sales_invoices`);
  global.fetch=vi.fn(async(url,options)=>{
    const body=String(options?.body);
    if(String(url).includes("wsaa")) {
      logins++;await beforeLogin?.();
      if(logins>1) return new Response("<Envelope><faultstring>coe.alreadyAuthenticated: valid ticket exists</faultstring></Envelope>");
      return new Response("<Envelope><loginCmsReturn>&lt;loginTicketResponse&gt;&lt;credentials&gt;"+
        "&lt;token&gt;synthetic-ticket&lt;/token&gt;&lt;sign&gt;synthetic-sign&lt;/sign&gt;"+
        "&lt;/credentials&gt;&lt;/loginTicketResponse&gt;</loginCmsReturn></Envelope>");
    }
    expect(body).toContain("<ar:Token>synthetic-ticket</ar:Token>");
    const action=String((options?.headers as any)?.SOAPAction);
    if(action.includes("FECompUltimoAutorizado"))
      return new Response(`<Envelope><CbteNro>${lastNumber}</CbteNro></Envelope>`);
    if(action.includes("FECompConsultar")) {
      const number=Number(body.match(/<ar:CbteNro>(\d+)/)?.[1]);
      expect(number).toBe(lastNumber);
      return new Response(consultationFixture({PtoVta:String(pv),CbteDesde:String(number),
        CbteHasta:String(number),ImpTotal:"95000.00",CbteFch:"20261015"}));
    }
    expect(action).toContain("FECAESolicitar");
    const number=Number(body.match(/<ar:CbteDesde>(\d+)/)?.[1]);
    expect(number).toBe(lastNumber+1);
    emissions++;lastNumber=number;
    if(failAfterCae) {failAfterCae=false;throw new Error("synthetic timeout after provider CAE");}
    return new Response(authorizationFixture(pv,number));
  }) as any;
});
afterEach(()=>{global.fetch=nativeFetch;vi.restoreAllMocks();});
afterAll(async()=>{
  await pool.query("DROP SCHEMA IF EXISTS funding_wsaa_review CASCADE");
  await pool.end();
});
async function reserve(service:PaymentFundingService) {
  const id=`wsaa-${randomUUID()}`,scope=await seedSyntheticScope(service,id,"spa");
  const snapshot={validatedPreparation:true,currency:"ARS",environment:"homologacion",issuer,tipo:"FB",
    puntoVenta:pv,fecha:"2026-10-15",folioId:`${id}:folio`,items,amounts:calcularMontos(items,"FB"),
    recipient:{razonSocial:"Sintético",condicionIva:"consumidor_final",dni:"30111222"}};
  // Replace only the unreserved synthetic draft; persisted document origins
  // are immutable, so never UPDATE a snapshot or disable its trigger.
  await pool.query("DELETE FROM payment_funding.documents WHERE id=$1",[`${id}:F1`]);
  await pool.query(`INSERT INTO payment_funding.documents
    (id,scope_kind,scope_id,original_cents,total_cents,status,snapshot)
    VALUES($1,'spa',$2,9500000,9500000,'draft',$3)`,[`${id}:F1`,id,JSON.stringify(snapshot)]);
  const request={scope,documentId:`${id}:F1`,newCollections:[],applications:[
    {receiptId:`spa:${id}:S1`,amountCents:500_000},{receiptId:`spa:${id}:S2`,amountCents:9_000_000}]};
  const preview=await service.preview(request,demoActor);
  const operation=await service.reserve(randomUUID(),preview.previewHash,request,demoActor);
  return {id:operation.id,scope};
}
async function blockNumbering() {
  return (await pool.query(`INSERT INTO funding_wsaa_review.sales_invoices
    (tipo_comprobante,punto_venta,numero,estado) VALUES('FB',$1,1,'autorizacion_pendiente') RETURNING id`,[pv])).rows[0].id;
}
async function expectRetained(service:PaymentFundingService,r:Awaited<ReturnType<typeof reserve>>) {
  const state=await service.scope(r.scope,demoActor);
  expect(state.receipts.reduce((n,row)=>n+row.heldCents,0)).toBe(9_500_000);
  expect((await service.get(r.id,demoActor)).status).toBe("fiscal_unknown");
  expect((await pool.query("SELECT 1 FROM payment_funding.fiscal_claims WHERE operation_id=$1",[r.id])).rowCount).toBe(0);
}
async function storedTicket() {
  return (await pool.query(`SELECT arca_ta_token,arca_ta_sign,arca_ta_expiry,arca_ta_ambiente
    FROM funding_wsaa_review.billing_config WHERE id=1`)).rows[0];
}
async function moneyCounts(id:string) {
  return (await pool.query(`SELECT (SELECT count(*)::int FROM funding_demo.spa_payments WHERE account_id=$1) AS payments,
    (SELECT count(*)::int FROM funding_demo.cash_movements WHERE source_id=$1) AS cash,
    (SELECT count(*)::int FROM funding_demo.folio_movements WHERE folio_id=$1||':folio') AS folio`,[id])).rows[0];
}

it.each(["empty","expired"])("R5: %s cache survives actual numbering rollback and a fresh instance without a second login",async(cache)=>{
  if(cache==="expired") await pool.query(`UPDATE funding_wsaa_review.billing_config SET
    arca_ta_token='expired-synthetic',arca_ta_sign='expired-sign',arca_ta_expiry='2020-01-01',arca_ta_ambiente='homologacion'`);
  let service=newService();
  const r=await reserve(service),blocker=await blockNumbering(),counts=await moneyCounts(r.scope.id);
  expect((await service.authorize(r.id,demoActor)).status).toBe("fiscal_unknown");
  expect((await service.get(r.id,demoActor)).lastError).toContain("borrador pendiente");
  await expectRetained(service,r);
  expect(logins).toBe(1);expect(emissions).toBe(0);
  const ticket=await storedTicket();
  expect(ticket.arca_ta_token).toBe("synthetic-ticket");expect(ticket.arca_ta_sign).toBe("synthetic-sign");
  expect(ticket.arca_ta_ambiente).toBe("homologacion");
  expect(new Date(ticket.arca_ta_expiry).getTime()).toBeGreaterThan(Date.now());
  await restartConnectionsAndModules();service=newService();
  // Repeating the exact blocked operation still authenticates from SQL, not memory.
  await expect(service.resume(r.id,demoActor)).rejects.toMatchObject({code:"FISCAL_OPERATION_PENDING"});
  expect(logins).toBe(1);await expectRetained(service,r);
  await pool.query("DELETE FROM funding_wsaa_review.sales_invoices WHERE id=$1",[blocker]);
  expect((await service.resume(r.id,demoActor)).status).toBe("applied");
  expect(logins).toBe(1);expect(emissions).toBe(1);
  expect(await moneyCounts(r.scope.id)).toEqual(counts);
});

it("R5: concurrent refresh with max=2 retains funds and the independently committed ticket; both retries complete",async()=>{
  let service=newService();
  const a=await reserve(service),b=await reserve(service),blocker=await blockNumbering();
  let entered!:()=>void,release!:()=>void;
  const reached=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});
  beforeLogin=async()=>{entered();await gate;};
  const first=service.authorize(a.id,demoActor);
  try {
    await reached;
    expect((await service.authorize(b.id,demoActor)).status).toBe("fiscal_unknown");
    expect(logins).toBe(1);expect(pool.waitingCount).toBe(0);
  } finally {release();}
  expect((await first).status).toBe("fiscal_unknown");
  await expectRetained(service,a);await expectRetained(service,b);
  expect((await storedTicket()).arca_ta_token).toBe("synthetic-ticket");
  await restartConnectionsAndModules();service=newService();
  await pool.query("DELETE FROM funding_wsaa_review.sales_invoices WHERE id=$1",[blocker]);
  for(const r of [a,b]) expect((await service.resume(r.id,demoActor)).status).toBe("applied");
  expect(logins).toBe(1);expect(emissions).toBe(2);
  expect(pool.totalCount).toBeLessThanOrEqual(2);expect(pool.waitingCount).toBe(0);
},10000);

it("R5/R3: post-CAE timeout recovers the same invoice using the committed ticket after new connections/modules",async()=>{
  let service=newService();
  const r=await reserve(service),counts=await moneyCounts(r.scope.id);
  failAfterCae=true;
  expect((await service.authorize(r.id,demoActor)).status).toBe("fiscal_unknown");
  const identity=(await pool.query("SELECT identity FROM payment_funding.fiscal_claims WHERE operation_id=$1",[r.id])).rows[0].identity;
  expect((await service.scope(r.scope,demoActor)).receipts.reduce((n,row)=>n+row.heldCents,0)).toBe(9_500_000);
  await restartConnectionsAndModules();service=newService();
  expect((await service.resume(r.id,demoActor)).status).toBe("applied");
  expect((await pool.query("SELECT identity FROM payment_funding.fiscal_claims WHERE operation_id=$1",[r.id])).rows[0].identity).toEqual(identity);
  expect(logins).toBe(1);expect(emissions).toBe(1);
  expect(await moneyCounts(r.scope.id)).toEqual(counts);
});
