/** Real prepared-document/shift endpoints + SPA UI + SQL finalizer/stock.
 * Only session fixture and external fiscal transport are synthetic. No ARCA. */
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import express from "express";
import {chromium,expect as browserExpect,type Browser} from "@playwright/test";
import {createServer,type ViteDevServer} from "vite";
import {pool} from "./helpers/fundingIsolatedDatabase";
import {installSyntheticSchema,seedSyntheticScope} from "../../demo/funding/backend";
import {mountOperationalSpaFunding,mountConfiguredOperationalSpaFunding} from "../billing/funding/operational/mount";
import type {FiscalTransport,FiscalIdentity} from "../billing/funding/operational/fiscalGateway";
import {hash} from "../billing/funding/contracts";
vi.mock("../db",async()=>import("./helpers/fundingIsolatedDatabase"));
let server:ReturnType<ReturnType<typeof express>["listen"]>,vite:ViteDevServer,browser:Browser,base:string;
let service:NonNullable<ReturnType<typeof mountOperationalSpaFunding>>;
const scenarios:Array<{id:string;title:string}>=[];
let emissions=0,failAfterCae=false;
const authorizations=new Map<string,{cae:string;caeFechaVto:Date}>();
const identityKey=(i:FiscalIdentity)=>hash({environment:i.environment,issuer:i.issuer,tipo:i.tipo,pv:i.puntoVenta,numero:i.numero});
const transport:FiscalTransport={
 async prepareNumbering(i,c){
  // No WSAA in this browser fixture. R5 has its separate real-cache regression.
  return async()=>Number((await c.query("SELECT COALESCE(max(numero),0) AS n FROM funding_demo.sales_invoices WHERE tipo_comprobante=$1 AND punto_venta=$2 AND estado='emitida'",[i.tipo,i.puntoVenta])).rows[0].n);
 },
 async authorize(i){emissions++;const result={cae:String(12345678901234n+BigInt(emissions)),caeFechaVto:new Date("2099-12-31")};authorizations.set(identityKey(i),result);if(failAfterCae){failAfterCae=false;throw new Error("Synthetic post-CAE disconnect");}return result;},
 async lookup(i){return authorizations.get(identityKey(i))??null;},
};
beforeAll(async()=>{
 await installSyntheticSchema(pool);
 await pool.query(await readFile(new URL("./helpers/fundingOperationalFixture.sql",import.meta.url),"utf8"));
 await pool.query(await readFile(new URL("../billing/funding/operational/schema.sql",import.meta.url),"utf8"));
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.isAuthenticated=(()=>true) as any;req.user={id:"connected-reviewer",role:"spa"} as any;next();});
 const {requireAuth}=await import("../auth");
 service=mountOperationalSpaFunding(app,{enabled:true,reviewedExtensions:true,pool,authenticate:requireAuth,
  hasPermission:(_role,key)=>["funding:read","funding:write"].includes(key),schema:"funding_demo",transport,fullRollout:true})!;
 await pool.query("UPDATE funding_demo.billing_config SET punto_venta_homolog=nextval('funding_demo.binding_pvs') WHERE id=1");
 for(const [label,partial] of [["Cobros existentes",false],["Cobrar faltante",true],["Recuperar CAE",false]] as const){
  const id=`spa-connected-${randomUUID()}`;const scope=await seedSyntheticScope(service,id,"spa",{partial});
  await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[id]);
  if(label==="Cobros existentes") {
   await pool.query("DELETE FROM payment_funding.receipts WHERE scope_id=$1",[id]);
   await pool.query("DELETE FROM payment_funding.scopes WHERE id=$1",[id]);
   await pool.query("UPDATE funding_demo.spa_accounts SET status='open' WHERE id=$1",[id]);
   await pool.query("UPDATE funding_demo.folios SET status='open' WHERE entity_id=$1",[id]);
  }
  await pool.query("INSERT INTO funding_demo.guests(id,first_name,last_name,vat_condition,document_number) VALUES($1,'Cliente','Verificado','consumidor_final','30111222')",[id]);
  await pool.query("INSERT INTO funding_demo.spa_treatments VALUES($1)",[id]);
  await pool.query("INSERT INTO funding_demo.spa_appointments VALUES($1,$1,$1,'confirmed')",[id]);
  if(label==="Cobros existentes") await pool.query("UPDATE funding_demo.spa_appointments SET guest_id=NULL WHERE id=$1",[id]);
  await pool.query("UPDATE funding_demo.spa_accounts SET appointment_id=$1 WHERE id=$1",[id]);
  await pool.query("UPDATE funding_demo.spa_account_items SET quantity=1,unit_price=95000,item_type='treatment' WHERE account_id=$1",[id]);
  await pool.query("UPDATE funding_demo.cash_shifts SET opened_by='connected-reviewer' WHERE id=$1",[`${id}:shift`]);
  if(partial){
   await pool.query("INSERT INTO funding_demo.inventory_items VALUES($1,'Insumo UI','true','ml',10,1)",[id]);
   await pool.query("INSERT INTO funding_demo.inventory_warehouses VALUES($1,'true')",[id]);
   await pool.query("INSERT INTO funding_demo.warehouse_stock VALUES($1,$1,10,now())",[id]);
   await pool.query("INSERT INTO funding_demo.stock_movements(item_id,movement_type,to_warehouse_id,created_at) VALUES($1,'transferencia',$1,now())",[id]);
   await pool.query("INSERT INTO funding_demo.treatment_supplies VALUES($1,$1,$1,2,'ml')",[id]);
  }
  scenarios.push({id:scope.id,title:label});
 }
 app.get("/api/demo/health",(_req,res)=>res.json({ok:true,data:{synthetic:true,productionEnabled:false,emitter:"fake"}}));
 app.get("/api/demo/scenarios",(_req,res)=>res.json({ok:true,data:scenarios}));
 server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
 const api=`http://127.0.0.1:${(server.address() as any).port}`;
 vite=await createServer({configFile:path.resolve("vite.spa-funding-demo.config.ts"),server:{port:0,strictPort:false,host:"127.0.0.1",proxy:{"/api":api}}});
 await vite.listen();base=`http://127.0.0.1:${(vite.httpServer!.address() as any).port}`;
 browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
},30000);
afterAll(async()=>{await browser?.close();await vite?.close();if(server)await new Promise<void>(r=>server.close(()=>r()));await pool.end();});
it("reviewed extensions alone cannot activate the operational mount",async()=>{
 expect(await mountConfiguredOperationalSpaFunding(express(),false,true)).toBeNull();
});
it("connected browser: prepare from source, authorized shifts, existing/mixed payments and post-CAE reload without duplicates",async()=>{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors:string[]=[];
 page.on("pageerror",error=>errors.push(error.message));
 const newRequests:Array<{url:string;body:any}>=[];
 page.on("request",req=>{if(req.method()==="POST"&&req.url().includes("/api/payment-funding"))newRequests.push({url:req.url(),body:req.postDataJSON()});});
 for(let index=0;index<scenarios.length;index++){
  const {id}=scenarios[index];
  const before=(await pool.query("SELECT count(*)::int AS n FROM funding_demo.spa_payments WHERE account_id=$1",[id])).rows[0].n;
  const cashBefore=(await pool.query("SELECT count(*)::int AS n FROM funding_demo.cash_movements c JOIN funding_demo.spa_payments p ON p.id=c.payment_id WHERE p.account_id=$1",[id])).rows[0].n;
  await page.goto(`${base}/connected-client.html`);await page.getByLabel("Escenario",{exact:true}).selectOption(id);
  await browserExpect(page.getByRole("button",{name:"Revisar factura",exact:true})).toBeVisible();
  for(const name of ["Preparar comprobante","Actualizar financiación","Actualizar cajas autorizadas","Previsualizar financiación"])
   await browserExpect(page.getByRole("button",{name,exact:true})).toHaveCount(0);
  if(index===0) {
   await page.getByRole("button",{name:"Revisar factura",exact:true}).click();
   await browserExpect(page.getByText("El turno no tiene un receptor fiscal identificado.",{exact:true})).toBeVisible();
   await page.getByLabel("Nombre / razón social",{exact:true}).fill("Cliente");
   await page.getByLabel("Apellido",{exact:true}).fill("Verificado");
   await page.getByLabel("Número de documento",{exact:true}).fill(String(10000000+parseInt(id.slice(-8),16)%90000000));
   await page.getByLabel("Condición IVA",{exact:true}).selectOption("consumidor_final");
   await page.getByRole("button",{name:"Guardar y vincular cliente",exact:true}).click();
   await browserExpect(page.getByText("El turno no tiene un receptor fiscal identificado.",{exact:true})).toHaveCount(0);
  }
  await page.getByLabel(`Usar ${id}:S1`,{exact:true}).check();
  if(index!==1)await page.getByLabel(`Usar ${id}:S2`,{exact:true}).check();
  else {
   await page.getByLabel("Dinero nuevo",{exact:true}).fill("90000");
   if(await page.getByLabel("Turno del faltante",{exact:true}).count())
    await page.getByLabel("Turno del faltante",{exact:true}).selectOption(`${id}:shift`);
  }
  await page.getByRole("button",{name:"Revisar factura",exact:true}).click();
  if(index===0)await page.screenshot({path:"/workspace/entregables/spa-connected-desktop.png",fullPage:true});
  await browserExpect(page.getByText("Receptor: Cliente Verificado",{exact:true})).toBeVisible();
  if(index===2)failAfterCae=true;
  await page.getByRole("button",{name:"Confirmar y emitir factura",exact:true}).click();
  if(index===2){
   await browserExpect(page.getByText("Resultado fiscal pendiente de conciliación",{exact:true})).toBeVisible();
   await page.reload();await page.getByLabel("Escenario",{exact:true}).selectOption(id);
   await page.getByRole("button",{name:"Recuperar esta operación",exact:true}).click();
  }
  await browserExpect(page.getByText("Operación finalizada",{exact:true})).toBeVisible();
  const result=await service.scope({kind:"spa",id},{id:"connected-reviewer",permissions:["funding:read"]});
  expect(result.operations).toHaveLength(1);expect(result.debtCents).toBe(0);
  const after=(await pool.query("SELECT count(*)::int AS n FROM funding_demo.spa_payments WHERE account_id=$1",[id])).rows[0].n;
  expect(after-before).toBe(index===1?1:0);
  const cashAfter=(await pool.query("SELECT count(*)::int AS n FROM funding_demo.cash_movements c JOIN funding_demo.spa_payments p ON p.id=c.payment_id WHERE p.account_id=$1",[id])).rows[0].n;
  expect(cashAfter-cashBefore).toBe(index===1?1:0);
  expect(result.operations[0].result.newCollectionCents).toBe(index===1?9000000:0);
  if(index===1){
   expect(Number((await pool.query("SELECT current_stock FROM funding_demo.inventory_items WHERE id=$1",[id])).rows[0].current_stock)).toBe(8);
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:"/workspace/entregables/spa-connected-mobile.png",fullPage:true});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
   await page.setViewportSize({width:1280,height:900});
  }
 }
 expect(emissions).toBe(3);expect(errors).toEqual([]);
 expect(newRequests.filter(req=>req.url.endsWith("/prepare-document")).map(req=>req.body)).toEqual([{}, {}, {}, {}]);
 await page.close();
},60000);
