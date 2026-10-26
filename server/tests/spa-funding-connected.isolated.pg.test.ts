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
   await pool.query("INSERT INTO funding_demo.inventory_items(id,name,is_active,unit,current_stock,cost_price) VALUES($1,'Insumo UI','true','ml',10,1)",[id]);
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
  await browserExpect(page.getByRole("tab",{name:"Cuenta",exact:true})).toHaveAttribute("aria-selected","true");
  await page.getByRole("tab",{name:"Facturación",exact:true}).click();
  await browserExpect(page.getByRole("button",{name:"Revisar factura",exact:true})).toBeVisible();
  for(const name of ["Preparar comprobante","Actualizar financiación","Actualizar cajas autorizadas","Previsualizar financiación"])
   await browserExpect(page.getByRole("button",{name,exact:true})).toHaveCount(0);
  if(index===0) {
   await page.getByRole("button",{name:"Revisar factura",exact:true}).click();
   await browserExpect(page.getByText("El turno no tiene un receptor fiscal identificado.",{exact:true})).toBeVisible();
   await page.getByLabel("Nombre / razón social",{exact:true}).fill("Cliente");
   await page.getByLabel("Apellido",{exact:true}).fill("Verificado");
   await page.getByLabel("Número de documento",{exact:true}).fill(String(10000000+parseInt(id.slice(-8),16)%90000000));
   await page.getByRole("combobox",{name:"Condición IVA",exact:true}).selectOption("consumidor_final");
   await page.getByRole("button",{name:"Guardar y vincular cliente",exact:true}).click();
   await browserExpect(page.getByText("El turno no tiene un receptor fiscal identificado.",{exact:true})).toHaveCount(0);
  }
  if(index===1) {
   await page.getByLabel("Monto del cobro 1",{exact:true}).fill("90000");
   if(await page.getByLabel("Caja SPA del cobro",{exact:true}).count())
    await page.getByLabel("Caja SPA del cobro",{exact:true}).selectOption(`${id}:shift`);
  }
  await page.getByRole("button",{name:"Revisar factura",exact:true}).click();
  if(index===0)await page.screenshot({path:"/workspace/entregables/spa-connected-desktop.png",fullPage:true});
  try {await browserExpect(page.getByText("Facturar a: Cliente Verificado · FB",{exact:true})).toBeVisible();}
  catch(error){process.stderr.write(await page.locator("body").innerText());throw error;}
  if(index===2)failAfterCae=true;
  await page.getByRole("button",{name:"Registrar y emitir",exact:true}).click();
  if(index===2){
   await browserExpect(page.getByText("Resultado fiscal pendiente de conciliación",{exact:true})).toBeVisible();
   await page.reload();await page.getByLabel("Escenario",{exact:true}).selectOption(id);
   await page.getByRole("tab",{name:"Facturación",exact:true}).click();
   await page.getByRole("button",{name:"Recuperar esta operación",exact:true}).click();
  }
  await browserExpect(page.getByText("Cuenta cerrada",{exact:true})).toBeVisible();
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
 const preparations=newRequests.filter(req=>req.url.endsWith("/prepare-document"));
 expect(preparations).toHaveLength(4);
 expect(preparations.every(req=>req.body.expectedVersion?.length===64&&req.body.settings.recipientKind==="client")).toBe(true);
 await page.close();
},60000);

it("account browser: charge, void, room transfer and history use the same account without a fiscal or cash duplicate",async()=>{
 const id=`spa-account-browser-${randomUUID()}`,scope=await seedSyntheticScope(service,id,"spa",{partial:true});
 await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[id]);
 await pool.query("DELETE FROM payment_funding.receipts WHERE scope_id=$1",[id]);
 await pool.query("DELETE FROM funding_demo.folio_movements WHERE folio_id=$1 AND type='payment'",[`${id}:folio`]);
 await pool.query("DELETE FROM funding_demo.cash_movements WHERE payment_id IN (SELECT id FROM funding_demo.spa_payments WHERE account_id=$1)",[id]);
 await pool.query("DELETE FROM funding_demo.spa_payments WHERE account_id=$1",[id]);
 await pool.query("UPDATE funding_demo.spa_accounts SET status='open',appointment_id=$1,total_paid=0 WHERE id=$1",[id]);
 await pool.query("UPDATE funding_demo.spa_account_items SET quantity=1,unit_price=95000,item_type='treatment' WHERE account_id=$1",[id]);
 await pool.query("UPDATE funding_demo.folios SET status='open',total_payments=0,balance=total_charges WHERE entity_id=$1",[id]);
 await pool.query("INSERT INTO funding_demo.guests(id,first_name,last_name,vat_condition,document_number) VALUES($1,'Cliente','Operativo','consumidor_final','30111222')",[id]);
 await pool.query("INSERT INTO funding_demo.spa_treatments VALUES($1)",[id]);
 await pool.query("INSERT INTO funding_demo.spa_appointments VALUES($1,$1,$1,'confirmed')",[id]);
 const target=randomUUID();
 await pool.query("INSERT INTO funding_demo.rooms VALUES($1,'806')",[target]);
 await pool.query("INSERT INTO funding_demo.guests(id,first_name,last_name) VALUES($1,'Destino','UI')",[target]);
 await pool.query("INSERT INTO funding_demo.reservations VALUES($1,'checked_in',$1,$1)",[target]);
 await pool.query("INSERT INTO funding_demo.folios(id,codigo,entity_type,entity_id,status,total_charges,total_payments,balance) VALUES($1,$1,'reservation',$2,'open',0,0,0)",[`${target}:folio`,target]);
 scenarios.push({id,title:"Cuenta operativa"});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),n=emissions;
 await page.goto(`${base}/connected-client.html`);await page.getByLabel("Escenario",{exact:true}).selectOption(id);
 await browserExpect(page.getByText("Tratamiento sintético",{exact:true})).toBeVisible();
 await browserExpect(page.getByRole("button",{name:"Revisar factura",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Agregar cargo",exact:true}).click();
 await page.getByLabel("Descripción",{exact:true}).fill("Extra de prueba UI");
 await page.getByLabel("Precio unitario",{exact:true}).fill("5000");
 await page.getByRole("button",{name:"Guardar cargo",exact:true}).click();
 await browserExpect(page.getByText("Extra de prueba UI",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Anular",exact:true}).click();
 await page.getByLabel("Motivo de anulación",{exact:true}).fill("Extra cargado por error");
 await page.getByRole("button",{name:"Confirmar anulación del cargo",exact:true}).click();
 await browserExpect(page.getByText("Extra de prueba UI",{exact:true})).toHaveCount(0);
 await page.screenshot({path:"/workspace/entregables/spa-account-desktop.png",fullPage:true});
 await page.getByRole('tab',{name:'Facturación',exact:true}).click();
 await page.getByRole('button',{name:'Agregar descuento',exact:true}).click();
 await page.getByLabel('Motivo del descuento',{exact:true}).fill('Beneficio habitación UI');
 await page.getByRole('button',{name:'Cargar a habitación',exact:true}).click();
 await page.getByLabel("Habitación de destino",{exact:true}).selectOption(target);
 await page.getByLabel("Motivo de transferencia",{exact:true}).fill("Solicitado por el cliente UI");
 await page.getByRole("button",{name:"Confirmar transferencia a habitación",exact:true}).click();
 await browserExpect(page.getByText("Cuenta trasladada a Hab. 806",{exact:true})).toBeVisible();
 await browserExpect(page.getByRole("button",{name:"Ir a facturación",exact:true})).toBeDisabled();
 await page.getByRole("tab",{name:"Historial",exact:true}).click();
 await browserExpect(page.getByText(/Transferencia SPA → Hab.806/)).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:"/workspace/entregables/spa-account-mobile.png",fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
 expect((await pool.query("SELECT 1 FROM funding_demo.charges WHERE reservation_id=$1",[target])).rowCount).toBe(1);
 expect(Number((await pool.query('SELECT amount FROM funding_demo.charges WHERE reservation_id=$1',[target])).rows[0].amount)).toBe(85500);
 expect((await pool.query("SELECT 1 FROM funding_demo.spa_payments WHERE account_id=$1",[id])).rowCount).toBe(0);
 expect((await pool.query("SELECT 1 FROM funding_demo.sales_invoices WHERE spa_account_id=$1",[id])).rowCount).toBe(0);
 expect(emissions).toBe(n);expect((await service.scope(scope,{id:"review",permissions:["funding:read"]})).operations).toHaveLength(0);
 await page.close();
},60000);

it("prefactura browser: company, discount, advance, split methods, printable summary and a single invoice",async()=>{
 const id=`spa-prefactura-browser-${randomUUID()}`,scope=await seedSyntheticScope(service,id,"spa",{partial:true}),companyId=randomUUID();
 await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[id]);
 await pool.query("UPDATE funding_demo.spa_accounts SET status='open',appointment_id=$1 WHERE id=$1",[id]);
 await pool.query("UPDATE funding_demo.spa_account_items SET quantity=1,unit_price=95000,item_type='treatment' WHERE account_id=$1",[id]);
 await pool.query("UPDATE funding_demo.cash_shifts SET opened_by='connected-reviewer' WHERE id=$1",[`${id}:shift`]);
 await pool.query("INSERT INTO funding_demo.guests(id,first_name,last_name,vat_condition,document_number) VALUES($1,'Cliente','SPA UI','consumidor_final','30111222')",[id]);
 await pool.query("INSERT INTO funding_demo.spa_treatments VALUES($1)",[id]);
 await pool.query("INSERT INTO funding_demo.spa_appointments VALUES($1,$1,$1,'confirmed')",[id]);
 await pool.query("INSERT INTO funding_demo.companies VALUES($1,'Empresa UI','20301234567','responsable_inscripto','Domicilio UI')",[companyId]);
 scenarios.push({id,title:'Prefactura empresa'});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),n=emissions;
 await page.goto(`${base}/connected-client.html`);await page.getByLabel('Escenario',{exact:true}).selectOption(id);
 await page.getByRole('tab',{name:'Facturación',exact:true}).click();
 await page.getByLabel('Facturar a',{exact:true}).selectOption('company');
 await page.getByLabel('Empresa a facturar',{exact:true}).selectOption(companyId);
 await browserExpect(page.getByLabel('Tipo de comprobante',{exact:true})).toHaveValue('FA');
 await page.getByRole('button',{name:'Agregar descuento',exact:true}).click();
 await page.getByLabel('Motivo del descuento',{exact:true}).fill('Beneficio efectivo');
 await browserExpect(page.getByLabel('Monto del cobro 1',{exact:true})).toHaveValue('80500.00');
 await page.getByLabel('Monto del cobro 1',{exact:true}).fill('50000');
 await page.getByRole('button',{name:'Agregar forma de pago',exact:true}).click();
 await page.getByLabel('Monto del cobro 2',{exact:true}).fill('30500');
 await page.getByLabel('Método del cobro 2',{exact:true}).selectOption('tarjeta_credito');
 await page.getByLabel('Caja SPA del cobro',{exact:true}).selectOption(`${id}:shift`);
 await page.getByLabel('Referencia / Observaciones del comprobante',{exact:true}).fill('Referencia recepción 201');
 const [printed]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:'Imprimir resumen',exact:true}).click()]);
 await browserExpect(printed.locator('body')).toContainText('Empresa UI');await browserExpect(printed.locator('body')).toContainText('Prefactura — no es un comprobante fiscal.');await printed.close();
 expect(emissions).toBe(n);
 await page.getByRole('button',{name:'Revisar factura',exact:true}).click();
 await browserExpect(page.getByText('Facturar a: Empresa UI · FA',{exact:true})).toBeVisible();
 await page.screenshot({path:'/workspace/entregables/spa-prefactura-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/workspace/entregables/spa-prefactura-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
 await page.getByRole('button',{name:'Registrar y emitir',exact:true}).click();
 await browserExpect(page.getByText('Cuenta cerrada',{exact:true})).toBeVisible();
 const invoice=(await pool.query("SELECT cliente_razon_social,observaciones,monto_total FROM funding_demo.sales_invoices WHERE spa_account_id=$1",[id])).rows;
 expect(invoice).toHaveLength(1);expect(invoice[0].cliente_razon_social).toBe('Empresa UI');expect(invoice[0].observaciones).toBe('Referencia recepción 201');expect(Number(invoice[0].monto_total)).toBe(85500);
 expect((await pool.query("SELECT 1 FROM funding_demo.spa_payments WHERE account_id=$1",[id])).rowCount).toBe(3);
 expect((await service.scope(scope,{id:'review',permissions:['funding:read']})).debtCents).toBe(0);expect(emissions-n).toBe(1);
 expect((await pool.query("SELECT guest_id FROM funding_demo.spa_appointments WHERE id=$1",[id])).rows[0].guest_id).toBe(id);
 await page.close();
},60000);

it("Reception browser explicitly restores NC coverage and recovers the same correction after a lost response",async()=>{
 const id=`reception-browser-${randomUUID()}`,folio=`${id}:folio`,shift=`${id}:shift`;
 await pool.query("INSERT INTO funding_demo.reservations(id,status) VALUES($1,'checked_in')",[id]);
 await pool.query("INSERT INTO funding_demo.folios(id,codigo,entity_type,entity_id,status,total_charges,total_payments,balance) VALUES($1,$1,'reservation',$2,'open',270000,270000,0)",[folio,id]);
 await pool.query("INSERT INTO funding_demo.cash_shifts(id,area,status,opened_by) VALUES($1,'reception','open','connected-reviewer')",[shift]);
 const invoice=(await pool.query("INSERT INTO funding_demo.sales_invoices(reserva_id,tipo_comprobante,estado,monto_total,monto_acreditado,items) VALUES($1,'FB','parcial',270000,90000,'[]') RETURNING id",[id])).rows[0];
 for(const [suffix,amount,method,released] of [['debit',180000,'tarjeta_debito',6000000],['card',90000,'tarjeta_credito',3000000]] as const){
  const p=`${id}:${suffix}`;
  await pool.query("INSERT INTO funding_demo.payments(id,reservation_id,amount,method,date,invoice_ref) VALUES($1,$2,$3,$4,CURRENT_DATE,$5)",[p,id,amount,method,JSON.stringify({id:invoice.id,fundingReleases:{[String(invoice.id)]:released}})]);
  await pool.query("INSERT INTO funding_demo.cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,payment_id) VALUES($1,$2,'reception','reservation',$3,$4,$5,'income',$6)",[`${p}:cash`,shift,id,method,amount,p]);
  await pool.query("INSERT INTO funding_demo.folio_movements(id,folio_id,type,amount,source_type,source_id,payment_method,cash_movement_id) VALUES($1,$2,'payment',$3,'payment',$4,$5,$6)",[`${p}:fm`,folio,amount,p,method,`${p}:cash`]);
 }
 const page=await browser.newPage({viewport:{width:1280,height:900}}),requests:any[]=[];let lose=true;
 await page.route('**/api/payment-funding/reservations/*/payment-corrections',async route=>{
  requests.push(route.request().postDataJSON());
  const response=await route.fetch();if(lose){lose=false;await route.abort('failed');}else await route.fulfill({response});
 });
 await page.goto(`${base}/connected-client.html?reservation=${encodeURIComponent(id)}`);
 await page.getByLabel('Tipo de corrección').selectOption('void_nonexistent');
 await page.getByLabel('Motivo',{exact:true}).fill('El cupón de tarjeta nunca existió');await page.getByLabel('Referencia de comprobación').fill('Control de Caja');
 await page.getByRole('button',{name:'Revisar corrección',exact:true}).click();
 await browserExpect(page.getByRole('checkbox')).toBeEnabled();await page.getByRole('checkbox').check();
 await browserExpect(page.getByRole('button',{name:'Confirmar corrección',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Revisar corrección',exact:true}).click();
 await browserExpect(page.getByRole('button',{name:'Confirmar corrección',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Confirmar corrección',exact:true}).click();
 await browserExpect(page.getByRole('button',{name:'Recuperar la misma corrección',exact:true})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Recuperar la misma corrección',exact:true}).click();await browserExpect(page.getByText('Corrección guardada',{exact:true})).toBeVisible();
 expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);expect(requests[0].request.restorations).toEqual([{paymentId:`${id}:debit`,invoiceId:invoice.id,amountCents:6000000}]);
 expect(Number((await pool.query('SELECT balance FROM funding_demo.folios WHERE id=$1',[folio])).rows[0].balance)).toBe(90000);
 expect((await pool.query("SELECT * FROM payment_funding.events WHERE event_key=$1",[`reservation-correction:${requests[0].operationId}`])).rows).toHaveLength(1);
 expect((await pool.query("SELECT * FROM funding_demo.cash_movements WHERE payment_id=$1 AND movement_type='expense'",[`${id}:card`])).rows).toHaveLength(0);
 await page.close();
},60000);

it('browser reviews without a cash shift, then issues and recovers one real local voucher without fiscal calls',async()=>{
 const id=`spa-voucher-browser-${randomUUID()}`,scope=await seedSyntheticScope(service,id,'spa',{partial:true});
 await pool.query('DELETE FROM payment_funding.documents WHERE scope_id=$1',[id]);
 await pool.query("UPDATE funding_demo.spa_accounts SET status='open',appointment_id=$1 WHERE id=$1",[id]);
 await pool.query("UPDATE funding_demo.spa_account_items SET quantity=1,unit_price=95000,item_type='treatment' WHERE account_id=$1",[id]);
 await pool.query("UPDATE funding_demo.cash_shifts SET opened_by='connected-reviewer' WHERE id=$1",[`${id}:shift`]);
 await pool.query("INSERT INTO funding_demo.guests(id,first_name,last_name,vat_condition,document_number) VALUES($1,'Cliente','Voucher UI','consumidor_final','30111222')",[id]);
 await pool.query('INSERT INTO funding_demo.spa_treatments VALUES($1)',[id]);await pool.query("INSERT INTO funding_demo.spa_appointments VALUES($1,$1,$1,'confirmed')",[id]);
 scenarios.push({id,title:'Voucher UI'});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),n=emissions,requests:any[]=[],errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')requests.push({url:r.url(),body:r.postDataJSON()});});
 await page.route('**/collection-shifts',r=>r.fulfill({json:{ok:true,data:[]}}));
 await page.goto(`${base}/connected-client.html`);await page.getByLabel('Escenario',{exact:true}).selectOption(id);await page.getByRole('tab',{name:'Facturación',exact:true}).click();
 await page.getByRole('button',{name:'Revisar factura',exact:true}).click();await browserExpect(page.getByRole('region',{name:'Revisión del comprobante SPA'})).toBeVisible();
 expect(requests).toHaveLength(0);await browserExpect(page.getByRole('button',{name:'Registrar y emitir',exact:true})).toHaveCount(0);
 await page.unroute('**/collection-shifts');await page.reload();await page.getByLabel('Escenario',{exact:true}).selectOption(id);await page.getByRole('tab',{name:'Facturación',exact:true}).click();
 await page.getByLabel('Tipo de comprobante',{exact:true}).selectOption('cierre_spa');await page.getByLabel('Caja SPA del cobro',{exact:true}).selectOption(`${id}:shift`);
 await page.getByRole('button',{name:'Revisar comprobante',exact:true}).click();await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/spa-voucher-review-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 let lose=true;await page.route('**/voucher',async route=>{const response=await route.fetch();if(lose){lose=false;await route.abort('failed');}else await route.fulfill({response});});
 await page.getByRole('button',{name:'Confirmar cobro y emitir voucher',exact:true}).click();await browserExpect(page.getByRole('button',{name:'Consultar el mismo voucher',exact:true})).toBeVisible();
 await page.reload();await page.getByLabel('Escenario',{exact:true}).selectOption(id);await page.getByRole('tab',{name:'Facturación',exact:true}).click();
 await page.getByRole('button',{name:'Consultar el mismo voucher',exact:true}).click();await browserExpect(page.getByRole('tab',{name:'Cuenta',exact:true})).toHaveAttribute('aria-selected','true');
 const posted=requests.filter(r=>r.url.endsWith('/voucher'));expect(posted).toHaveLength(2);expect(posted[0].body).toEqual(posted[1].body);
 expect(emissions).toBe(n);expect(errors).toEqual([]);
 expect((await pool.query("SELECT count(*)::int AS n FROM funding_demo.sales_invoices WHERE spa_account_id=$1 AND tipo_comprobante='cierre_spa'",[id])).rows[0].n).toBe(1);
 expect((await pool.query('SELECT count(*)::int AS n FROM funding_demo.spa_payments WHERE account_id=$1',[id])).rows[0].n).toBe(2);
 await page.close();
},60000);
