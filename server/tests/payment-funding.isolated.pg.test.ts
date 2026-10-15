import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { createDemoService, demoActor, installSyntheticSchema, seedSyntheticScope, stageSyntheticDocument } from "../../demo/funding/backend";
import { PaymentCorrectionService } from "../billing/funding/corrections";
import { registerPaymentFundingRoutes } from "../billing/funding/routes";
import { reconcileVerifiedCreditNote } from "../billing/funding/creditNotes";
import type { Scope } from "../billing/funding/contracts";
import { mountPaymentFunding } from "../billing/funding/integration";
import { SqlFundingAdapter } from "../billing/funding/adapters";

// Deliberately independent of DATABASE_URL and of server/db.ts.
const pool=new pg.Pool({host:"/tmp/folio-funding-isolated/socket",port:55439,user:"runner",password:"",database:"folio_funding_synthetic",ssl:false,max:20});
const {service,gateway,faults}=createDemoService(pool),corrections=new PaymentCorrectionService(service);
const second=createDemoService(pool).service;
let server:ReturnType<ReturnType<typeof express>["listen"]>,url:string;
before(async()=>{
  await installSyntheticSchema(pool);
  const app=express();app.use(express.json());
  registerPaymentFundingRoutes(app,service,{
    // A real HTTP middleware boundary, injected server-side policies.
    authenticate:(req,res,next)=>{if(req.headers["x-test-session"]!=="present") return void res.status(401).json({ok:false,error:{code:"UNAUTHENTICATED"}});next();},
    actor:req=>req.headers["x-test-role"]==="reader"?{id:"reader",permissions:["funding:read"]}:demoActor,
  });
  server=app.listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  url=`http://127.0.0.1:${(server.address() as any).port}`;
});
after(async()=>{if(server) await new Promise<void>(r=>server.close(()=>r()));await pool.end();});
async function fixture(kind:"spa"|"reservation",options:any={}) {
  const id=`test-${randomUUID()}`;return seedSyntheticScope(service,id,kind,options);
}
function request(scope:Scope,partial=false) {
  return scope.kind==="spa"?{
    scope,documentId:`${scope.id}:F1`,applications:[{receiptId:`spa:${scope.id}:S1`,amountCents:500_000},
      ...(partial?[]:[{receiptId:`spa:${scope.id}:S2`,amountCents:9_000_000}])],
    newCollections:partial?[{rowId:"remainder",method:"efectivo",amountCents:9_000_000,shiftId:`${scope.id}:shift`}]:[],
  }:{scope,documentId:`${scope.id}:F2`,applications:[{receiptId:`reservation:${scope.id}:P-D`,amountCents:6_000_000},
    {receiptId:`reservation:${scope.id}:P-C`,amountCents:3_000_000}],newCollections:[]};
}
function correction(scope:Scope,restore=true) {
  return {scope,receiptId:`reservation:${scope.id}:P-C`,action:"void_nonexistent",reason:"El cobro no existió: evidencia sintética",
    evidenceRef:"synthetic-proof",historical:true,restorations:restore?[{receiptId:`reservation:${scope.id}:P-D`,documentId:`${scope.id}:F1`,amountCents:6_000_000}]:[]};
}
async function reserve(req:any) {
  const p=await service.preview(req,demoActor),id=randomUUID();
  return {id,preview:p,operation:await service.reserve(id,p.previewHash,req,demoActor)};
}
async function counts(scope:Scope) {
  const table=scope.kind==="spa"?"spa_payments":"payments",owner=scope.kind==="spa"?"account_id":"reservation_id";
  const p=(await pool.query(`SELECT count(*)::int AS n,COALESCE(sum(amount) FILTER(WHERE status='active'),0)::text AS active FROM funding_demo.${table} WHERE ${owner}=$1`,[scope.id])).rows[0];
  const cash=(await pool.query(`SELECT count(*)::int AS n,COALESCE(sum(c.amount) FILTER(WHERE NOT c.anulado),0)::text AS active
    FROM funding_demo.cash_movements c JOIN funding_demo.${table} p ON p.id=c.payment_id WHERE p.${owner}=$1`,[scope.id])).rows[0];
  const fm=(await pool.query(`SELECT count(*) FILTER(WHERE m.type='payment')::int AS payments,count(*) FILTER(WHERE m.type='void')::int AS voids
    FROM funding_demo.folio_movements m JOIN funding_demo.folios f ON f.id=m.folio_id WHERE f.entity_id=$1`,[scope.id])).rows[0];
  const inventory=(await pool.query("SELECT count(*)::int AS n FROM funding_demo.inventory_closures WHERE account_id=$1",[scope.id])).rows[0].n;
  return {p,cash,fm,inventory};
}
async function invariant(scope:Scope) {
  const data=await service.scope(scope,demoActor);
  for(const r of data.receipts) {
    assert.equal(r.amountCents,r.appliedCents+r.heldCents+r.freeCents);
    assert.ok(r.freeCents>=0);assert.ok(r.appliedCents>=0);assert.ok(r.heldCents>=0);
  }
  return data;
}

test("SPA existing_only reuses exact payments, Caja, folio and stock; retry returns same result",async()=>{
  const s=await fixture("spa"),before=await counts(s),r=await reserve(request(s));
  assert.equal((await invariant(s)).receipts.reduce((n,r)=>n+r.heldCents,0),9_500_000);
  const auth=await service.authorize(r.id,demoActor);assert.equal(auth.status,"authorized_pending_link");
  const done=await service.finalize(r.id,demoActor);assert.equal(done.status,"applied");
  assert.equal((await service.finalize(r.id,demoActor)).replayed,true);
  assert.deepEqual(await counts(s),before);
  assert.equal((await invariant(s)).receipts.reduce((n,r)=>n+r.freeCents,0),0);
  assert.deepEqual(done.result.paymentMethods,[{method:"tarjeta_debito",amountCents:500_000},{method:"efectivo",amountCents:9_000_000}]);
  const a=(await pool.query("SELECT receipt_type FROM funding_demo.spa_accounts WHERE id=$1",[s.id])).rows[0];
  assert.equal(a.receipt_type,"voucher");
});
test("CAE committed before local failure: retain holds, prohibit abort, recover without emission or new money",async()=>{
  const s=await fixture("spa"),before=await counts(s),r=await reserve(request(s));
  faults.add("after_cae");
  const failed=await service.authorize(r.id,demoActor);
  assert.equal(failed.status,"fiscal_unknown");
  assert.equal((await invariant(s)).receipts.reduce((n,r)=>n+r.heldCents,0),9_500_000);
  await assert.rejects(service.abort(r.id,demoActor),(e:any)=>e.code==="FUNDS_MUST_REMAIN_RESERVED");
  const done=await second.resume(r.id,demoActor);assert.equal(done.status,"applied");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM funding_demo.fiscal_authorizations WHERE operation_id=$1",[r.id])).rows[0].n,1);
  assert.deepEqual(await counts(s),before);
});
test("post-CAE link failure rolls back mixed collection and resumes exactly once, across two service instances",async()=>{
  const s=await fixture("spa",{partial:true}),before=await counts(s),r=await reserve(request(s,true));
  await service.authorize(r.id,demoActor);faults.add("finalize_after_cash");
  await assert.rejects(service.finalize(r.id,demoActor),/SYNTHETIC_FAILURE/);
  assert.deepEqual(await counts(s),before);
  const pending=await service.get(r.id,demoActor);assert.equal(pending.status,"authorized_pending_link");assert.ok(pending.invoice.cae);
  assert.equal((await invariant(s)).receipts[0].heldCents,500_000);
  const done=await Promise.all([service.resume(r.id,demoActor),second.resume(r.id,demoActor)]);
  assert.equal(done.filter(x=>x.replayed).length,1);
  const after=await counts(s);
  assert.equal(after.p.n,before.p.n+1);assert.equal(Number(after.cash.active)-Number(before.cash.active),90000);
  assert.equal(after.fm.payments,before.fm.payments+1);assert.equal(after.inventory,1);
  assert.equal((await invariant(s)).debtCents,0);
});
test("unknown fiscal outcome survives age/timeout and never automatically releases funds",async()=>{
  const s=await fixture("spa"),r=await reserve(request(s));gateway.nextOutcome="unknown";
  await service.authorize(r.id,demoActor);
  await pool.query("UPDATE payment_funding.operations SET updated_at=now()-interval '45 days' WHERE id=$1",[r.id]);
  const recovered=await service.resume(r.id,demoActor);
  assert.equal(recovered.status,"fiscal_unknown");assert.equal(recovered.fundsRetained,true);
  await assert.rejects(service.abort(r.id,demoActor),(e:any)=>e.code==="FUNDS_MUST_REMAIN_RESERVED");
  assert.equal((await invariant(s)).receipts.reduce((n,r)=>n+r.heldCents,0),9_500_000);
});
test("explicit abort releases once only before authorization, or after proven terminal rejection",async()=>{
  const s=await fixture("spa"),r=await reserve(request(s));
  assert.equal((await service.abort(r.id,demoActor)).status,"aborted");
  assert.equal((await service.abort(r.id,demoActor)).replayed,true);
  assert.equal((await invariant(s)).receipts.reduce((n,r)=>n+r.freeCents,0),9_500_000);
  const other=await reserve(request(s));gateway.nextOutcome="rejected";
  await service.authorize(other.id,demoActor);
  assert.equal((await service.abort(other.id,demoActor)).status,"aborted");
  await invariant(s);
});
test("two concurrent invoices cannot reserve the same receipts (database locks, not process mutex)",async()=>{
  const s=await fixture("reservation",{withNC:true}),req=request(s);
  await stageSyntheticDocument(pool,s,`${s.id}:F3`,9_000_000);
  const other={...req,documentId:`${s.id}:F3`};
  const [p1,p2]=await Promise.all([service.preview(req,demoActor),second.preview(other,demoActor)]);
  const results=await Promise.allSettled([
    service.reserve(randomUUID(),p1.previewHash,req,demoActor),
    second.reserve(randomUUID(),p2.previewHash,other,demoActor),
  ]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  const data=await invariant(s);assert.equal(data.receipts.reduce((n,r)=>n+r.heldCents,0),9_000_000);
});
test("two concurrent SPA issuers have one durable fiscal owner",async()=>{
  const s=await fixture("spa"),req=request(s),p=await service.preview(req,demoActor);
  const result=await Promise.allSettled([service.reserve(randomUUID(),p.previewHash,req,demoActor),second.reserve(randomUUID(),p.previewHash,req,demoActor)]);
  assert.equal(result.filter(r=>r.status==="fulfilled").length,1);await invariant(s);
});
test("same UUID/same body is replay; same UUID/different body conflicts without effects",async()=>{
  const s=await fixture("spa"),req=request(s),r=await reserve(req);
  assert.equal((await second.reserve(r.id,r.preview.previewHash,req,demoActor)).replayed,true);
  await assert.rejects(service.reserve(r.id,r.preview.previewHash,{...req,documentId:"another"},demoActor),(e:any)=>e.code==="IDEMPOTENCY_CONFLICT");
  await invariant(s);
});
test("void nonexistent + restoration is atomic, leaves reservation debt 90.000, never SPA-attributed debt",async()=>{
  const s=await fixture("reservation",{withNC:true,closedShift:true}),req=correction(s);
  const original=(await pool.query("SELECT * FROM funding_demo.cash_closing_summaries WHERE shift_id=$1",[`${s.id}:shift`])).rows;
  const p=await corrections.preview(req,demoActor),id=randomUUID();
  const op=await corrections.confirm(id,p.previewHash,req,demoActor);
  assert.equal(op.result.debtCents,9_000_000);
  const data=await invariant(s),d=data.receipts.find(r=>r.sourcePaymentId.endsWith("P-D"))!;
  assert.equal(d.appliedCents,18_000_000);assert.equal(d.freeCents,0);
  assert.equal(data.rectifications.length,1);assert.equal(data.rectifications[0].physicalCountCents,null);
  assert.deepEqual((await pool.query("SELECT * FROM funding_demo.cash_closing_summaries WHERE shift_id=$1",[`${s.id}:shift`])).rows,original);
  assert.equal((await counts(s)).fm.voids,1);
  assert.equal((await corrections.confirm(id,p.previewHash,req,demoActor)).replayed,true);
  assert.equal((await invariant(s)).rectifications.length,1);
});
test("restoration racing another fiscal reservation cannot double-use 60.000",async()=>{
  const s=await fixture("reservation",{withNC:true,closedShift:true});
  await stageSyntheticDocument(pool,s,`${s.id}:F3`,6_000_000);
  const cr=correction(s),req={scope:s,documentId:`${s.id}:F3`,applications:[{receiptId:`reservation:${s.id}:P-D`,amountCents:6_000_000}],newCollections:[]};
  const [cp,fp]=await Promise.all([corrections.preview(cr,demoActor),service.preview(req,demoActor)]);
  const outcomes=await Promise.allSettled([corrections.confirm(randomUUID(),cp.previewHash,cr,demoActor),second.reserve(randomUUID(),fp.previewHash,req,demoActor)]);
  assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);await invariant(s);
});
test("already reused credit: withdrawing P-C exposes F1 60.000/F2 30.000 without a third invoice",async()=>{
  const s=await fixture("reservation",{withNC:true,reused:true}),req=correction(s,false);
  const p=await corrections.preview(req,demoActor),op=await corrections.confirm(randomUUID(),p.previewHash,req,demoActor);
  assert.deepEqual(op.result.obligations.map((r:any)=>r.uncoveredCents).sort((a:number,b:number)=>a-b),[3_000_000,6_000_000]);
  assert.equal((await invariant(s)).debtCents,9_000_000);
  assert.equal((await service.scope(s,demoActor)).documents.length,2);
  assert.equal((await counts(s)).cash.n,2);
});
test("closed shift method correction changes classification, not physical count, total or invoice snapshot",async()=>{
  const s=await fixture("reservation",{closedShift:true});
  const req={...correction(s,false),action:"change_method",newMethod:"efectivo"};
  const original=(await pool.query("SELECT snapshot FROM payment_funding.documents WHERE id=$1",[`${s.id}:F1`])).rows[0].snapshot;
  const p=await corrections.preview(req,demoActor);
  await corrections.confirm(randomUUID(),p.previewHash,req,demoActor);
  const data=await invariant(s),r=data.rectifications[0];
  assert.equal(r.delta.tarjeta_credito,-9_000_000);assert.equal(r.delta.efectivo,9_000_000);
  assert.equal(data.debtCents,0);assert.equal((await counts(s)).fm.payments,2);
  assert.equal(Number((await counts(s)).cash.active),270000);
  assert.deepEqual((await pool.query("SELECT snapshot FROM payment_funding.documents WHERE id=$1",[`${s.id}:F1`])).rows[0].snapshot,original);
  // The canonical link must still be usable after correction.
  const r2={...request(s),documentId:`${s.id}:F2`};
  await assert.rejects(service.preview(r2,demoActor),(e:any)=>e.code==="FUNDS_UNAVAILABLE");
});
test("correction failure before commit rolls back payments, applications, folio, Caja and revision",async()=>{
  const s=await fixture("reservation",{withNC:true,closedShift:true}),req=correction(s);
  const before=await counts(s),snapshot=await invariant(s),p=await corrections.preview(req,demoActor);
  faults.add("correction_before_commit");
  await assert.rejects(corrections.confirm(randomUUID(),p.previewHash,req,demoActor),/SYNTHETIC_FAILURE/);
  assert.deepEqual(await counts(s),before);
  const after=await invariant(s);assert.deepEqual(after.receipts,snapshot.receipts);assert.equal(after.rectifications.length,0);
});
test("closing between preview and confirmation rejects normal correction; no silent historical repair",async()=>{
  const s=await fixture("reservation"),req={...correction(s,false),historical:false,action:"change_method",newMethod:"efectivo"};
  const p=await corrections.preview(req,demoActor);
  await pool.query("UPDATE funding_demo.cash_shifts SET status='closed',closed_at=now() WHERE id=$1",[`${s.id}:shift`]);
  await assert.rejects(corrections.confirm(randomUUID(),p.previewHash,req,demoActor),(e:any)=>e.code==="HISTORICAL_CONFIRMATION_REQUIRED");
  assert.equal((await counts(s)).cash.n,2);
});
test("NC replay never releases the prior funds again; restoration is not self-reapplication JSON",async()=>{
  const s=await fixture("reservation",{withNC:true}),before=await invariant(s);
  await reconcileVerifiedCreditNote(service,s,{creditNoteId:`${s.id}:NC1`,documentId:`${s.id}:F1`,amountCents:9_000_000},demoActor);
  assert.deepEqual((await invariant(s)).receipts,before.receipts);
  const req=correction(s),p=await corrections.preview(req,demoActor);
  await corrections.confirm(randomUUID(),p.previewHash,req,demoActor);
  await reconcileVerifiedCreditNote(service,s,{creditNoteId:`${s.id}:NC1`,documentId:`${s.id}:F1`,amountCents:9_000_000},demoActor);
  const after=await invariant(s);assert.equal(after.receipts.find(r=>r.sourcePaymentId.endsWith("P-D"))!.freeCents,0);
  const ref=(await pool.query("SELECT invoice_ref FROM funding_demo.payments WHERE id=$1",[`${s.id}:P-D`])).rows[0].invoice_ref;
  assert.equal(JSON.parse(ref).reapplications,undefined);
});

// Minimal ledgers from Codex's review/folio-funding reproduction. No source DB.
async function creditNoteFixture(capacities:number[],total=capacities.reduce((n,a)=>n+a,0)) {
  const scope:Scope={kind:"reservation",id:`nc-${randomUUID()}`},documentId=`${scope.id}:F`;
  await service.store.transaction(scope,null,async c=>{
    await c.query("INSERT INTO payment_funding.scopes(kind,id) VALUES($1,$2)",[scope.kind,scope.id]);
    await c.query(`INSERT INTO payment_funding.documents(id,scope_kind,scope_id,original_cents,total_cents,status,snapshot)
      VALUES($1,$2,$3,$4,$4,'issued','{}')`,[documentId,scope.kind,scope.id,total]);
    for(const [i,capacity] of capacities.entries()) {
      const receiptId=`${scope.id}:P${i}`;
      await c.query(`INSERT INTO payment_funding.receipts(id,scope_kind,scope_id,source_payment_id,original_cents,effective_cents,method,cash_movement_id,folio_movement_id)
        VALUES($1,$2,$3,$1,$4,$4,'efectivo',$5,$6)`,[receiptId,scope.kind,scope.id,capacity,`${receiptId}:cash`,`${receiptId}:folio`]);
      await c.query(`INSERT INTO payment_funding.applications(id,receipt_id,document_id,application_key,amount_cents,original_cents,status,origin)
        VALUES($1,$2,$3,$2,$4,$4,'applied','legacy_verified')`,[randomUUID(),receiptId,documentId,capacity]);
    }
  });
  return {scope,documentId};
}
async function creditNoteState(scope:Scope,documentId:string) {
  return {
    applications:(await pool.query("SELECT * FROM payment_funding.applications WHERE document_id=$1 ORDER BY receipt_id,id",[documentId])).rows,
    document:(await pool.query("SELECT * FROM payment_funding.documents WHERE id=$1",[documentId])).rows[0],
    events:(await pool.query("SELECT event_key,kind,payload FROM payment_funding.events WHERE payload->>'scopeKey'=$1 ORDER BY seq",[`reservation:${scope.id}`])).rows,
    balances:(await pool.query("SELECT * FROM payment_funding.balances WHERE scope_id=$1 ORDER BY id",[scope.id])).rows,
  };
}
for(const [count,nc,expected] of [[3,10_000,[3334,3333,3333]],[2,10_001,[5001,5000]]] as const) {
  test(`NC conserves exactly ${nc} cents across ${count} payments, with deterministic replay`,async()=>{
    const {scope,documentId}=await creditNoteFixture(Array(count).fill(10_000_000));
    const proof={creditNoteId:`${scope.id}:NC`,documentId,amountCents:nc};
    await reconcileVerifiedCreditNote(service,scope,proof,demoActor);
    const state=await creditNoteState(scope,documentId);
    const releases=state.events.filter(e=>e.kind==="nc_release");
    assert.deepEqual(releases.map(e=>e.payload.amountCents),expected);
    assert.equal(releases.reduce((n,e)=>n+e.payload.amountCents,0),nc);
    assert.equal(Number(state.document.total_cents),count*10_000_000-nc);
    assert.equal(state.balances.reduce((n,r)=>n+Number(r.free_cents),0),nc);
    await Promise.all([reconcileVerifiedCreditNote(service,scope,proof,demoActor),reconcileVerifiedCreditNote(second,scope,proof,demoActor)]);
    assert.deepEqual(await creditNoteState(scope,documentId),state);
    await assert.rejects(reconcileVerifiedCreditNote(service,scope,{...proof,amountCents:nc+1},demoActor),(e:any)=>e.code==="IDEMPOTENCY_CONFLICT");
  });
}
test("successive NCs include restored live coverage, exclude reversals, and respect exhausted capacity",async()=>{
  const {scope,documentId}=await creditNoteFixture([1,2,3]);
  const reconcile=(id:string,n:number)=>reconcileVerifiedCreditNote(service,scope,{creditNoteId:`${scope.id}:${id}`,documentId,amountCents:n},demoActor);
  await reconcile("NC1",4);
  let state=await creditNoteState(scope,documentId);
  assert.equal(state.applications.filter(a=>a.status==="applied").reduce((n,a)=>n+Number(a.amount_cents),0),2);
  // Replace one remaining application with explicit restored coverage. The
  // reversed original must not be released again by the following NC.
  const live=state.applications.find(a=>a.status==="applied");
  await service.store.transaction(scope,null,async c=>{
    await c.query("UPDATE payment_funding.applications SET status='reversed' WHERE id=$1",[live.id]);
    await c.query(`INSERT INTO payment_funding.applications(id,receipt_id,document_id,application_key,amount_cents,original_cents,status,origin)
      VALUES($1,$2,$3,'restore',1,1,'applied','restore_coverage')`,[randomUUID(),live.receipt_id,documentId]);
  });
  await reconcile("NC2",2);
  const final=await creditNoteState(scope,documentId);
  assert.equal(Number(final.document.total_cents),0);
  assert.ok(final.applications.every(a=>a.status==="reversed"));
  assert.equal(final.events.filter(e=>e.kind==="nc_release").reduce((n,e)=>n+e.payload.amountCents,0),6);
});
test("partially uncovered NC fails explicitly when coverage is insufficient, without partial releases",async()=>{
  const {scope,documentId}=await creditNoteFixture([2,3],10);
  const before=await creditNoteState(scope,documentId);
  await assert.rejects(reconcileVerifiedCreditNote(service,scope,{creditNoteId:`${scope.id}:too-large`,documentId,amountCents:6},demoActor),
    (e:any)=>e.code==="NC_RECONCILIATION_REQUIRED");
  assert.deepEqual(await creditNoteState(scope,documentId),before);
  await reconcileVerifiedCreditNote(service,scope,{creditNoteId:`${scope.id}:fits`,documentId,amountCents:3},demoActor);
  const after=await creditNoteState(scope,documentId);
  assert.equal(after.events.filter(e=>e.kind==="nc_release").reduce((n,e)=>n+e.payload.amountCents,0),3);
  assert.equal(Number(after.document.total_cents),7);
});
test("SQL aggregate trigger rejects direct over-allocation, even outside the service",async()=>{
  const s=await fixture("spa");
  await stageSyntheticDocument(pool,s,`${s.id}:X`,9_500_000);
  await pool.query(`INSERT INTO payment_funding.applications(id,receipt_id,document_id,application_key,amount_cents,original_cents,status,origin)
    VALUES($1,$2,$3,'one',500000,500000,'held','test')`,[randomUUID(),`spa:${s.id}:S1`,`${s.id}:F1`]);
  await assert.rejects(pool.query(`INSERT INTO payment_funding.applications(id,receipt_id,document_id,application_key,amount_cents,original_cents,status,origin)
    VALUES($1,$2,$3,'two',1,1,'held','test')`,[randomUUID(),`spa:${s.id}:S1`,`${s.id}:X`]),(e:any)=>e.code==="23514");
  await invariant(s);
});
test("source ambiguity / cross-scope receipts fail closed; no amount-matching adoption",async()=>{
  const a=await fixture("spa"),b=await fixture("spa");
  const req=request(a);req.applications[0].receiptId=`spa:${b.id}:S1`;
  await assert.rejects(service.preview(req,demoActor),(e:any)=>e.code==="SCOPE_MISMATCH");
  await pool.query("UPDATE funding_demo.folio_movements SET cash_movement_id=NULL WHERE id=$1",[`${a.id}:S1:fm`]);
  await assert.rejects(service.preview(request(a),demoActor),(e:any)=>e.code==="PAYMENT_LINK_AMBIGUOUS");
});
test("HTTP boundary rejects missing session, read-only write, actor spoof and malformed body; successful response contract",async()=>{
  const s=await fixture("spa"),body=request(s),headers={"content-type":"application/json","x-test-session":"present"};
  assert.equal((await fetch(`${url}/api/payment-funding/previews`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})).status,401);
  assert.equal((await fetch(`${url}/api/payment-funding/previews`,{method:"POST",headers:{...headers,"x-test-role":"reader"},body:JSON.stringify(body)})).status,403);
  const spoof=await fetch(`${url}/api/payment-funding/previews`,{method:"POST",headers,body:JSON.stringify({...body,actorId:"admin"})});
  assert.equal(spoof.status,422);
  const response=await fetch(`${url}/api/payment-funding/previews`,{method:"POST",headers,body:JSON.stringify(body)});
  const json:any=await response.json();assert.equal(response.status,200);assert.equal(json.ok,true);assert.equal(json.data.fundingMode,"existing_only");
  assert.match(json.data.previewHash,/^[a-f0-9]{64}$/);
});
test("raw concurrent SQL writers cannot over-allocate one receipt across different documents",async()=>{
  const s=await fixture("spa");
  await stageSyntheticDocument(pool,s,`${s.id}:raw-other`,500_000);
  const insert=(documentId:string)=>pool.query(`INSERT INTO payment_funding.applications(id,receipt_id,document_id,application_key,amount_cents,original_cents,status,origin)
    VALUES($1,$2,$3,$4,500000,500000,'held','raw-concurrent-test')`,
    [randomUUID(),`spa:${s.id}:S1`,documentId,randomUUID()]);
  const results=await Promise.allSettled([insert(`${s.id}:F1`),insert(`${s.id}:raw-other`)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((results.find(r=>r.status==="rejected") as PromiseRejectedResult).reason.code,"23514");
  await invariant(s);
});
test("two concurrent authorizers invoke the fiscal gateway once; one CAE and unchanged cash",async()=>{
  const s=await fixture("spa"),r=await reserve(request(s)),before=await counts(s);
  await Promise.all([service.authorize(r.id,demoActor),second.authorize(r.id,demoActor)]);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM funding_demo.fiscal_authorizations WHERE operation_id=$1",[r.id])).rows[0].n,1);
  await service.resume(r.id,demoActor);assert.deepEqual(await counts(s),before);await invariant(s);
});
test("new money cannot exceed actual debt, and a closed shift is rejected before CAE",async()=>{
  const s=await fixture("spa",{partial:true}),req=request(s,true);
  const over={...req,applications:[],newCollections:[{...req.newCollections[0],amountCents:9_500_000}]};
  await assert.rejects(service.preview(over,demoActor),(e:any)=>e.code==="COLLECTION_EXCEEDS_DEBT");
  await pool.query("UPDATE funding_demo.cash_shifts SET status='closed' WHERE id=$1",[`${s.id}:shift`]);
  await assert.rejects(service.preview(req,demoActor),(e:any)=>e.code==="SHIFT_CLOSED");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM payment_funding.operations WHERE scope_id=$1",[s.id])).rows[0].n,0);
});
test("actual PG row lock: close racing post-CAE mixed settlement leaves retained funds and zero cash writes",async()=>{
  const s=await fixture("spa",{partial:true}),r=await reserve(request(s,true));
  await service.authorize(r.id,demoActor);const before=await counts(s);
  const closer=await pool.connect();
  try {
    await closer.query("BEGIN");
    await closer.query("SELECT 1 FROM funding_demo.cash_shifts WHERE id=$1 FOR UPDATE",[`${s.id}:shift`]);
    const result=service.finalize(r.id,demoActor).then(()=>null,e=>e);
    await closer.query("UPDATE funding_demo.cash_shifts SET status='closed',closed_at=now() WHERE id=$1",[`${s.id}:shift`]);
    await closer.query("COMMIT");
    assert.equal((await result).code,"SHIFT_CLOSED");
    assert.deepEqual(await counts(s),before);
    assert.equal((await service.get(r.id,demoActor)).status,"authorized_pending_link");
    assert.equal((await invariant(s)).receipts[0].heldCents,500_000);
  } finally {await closer.query("ROLLBACK");closer.release();}
});
test("mounted legacy SPA link delegates to the sole finalizer; legacy payment writers cannot bypass it",async()=>{
  const s=await fixture("spa"),r=await reserve(request(s)),before=await counts(s);
  await service.authorize(r.id,demoActor);
  let legacyWrites=0;
  const app=express();app.use(express.json());
  mountPaymentFunding(app,{enabled:true,pool,fiscal:gateway,operationalSchema:"funding_demo",
    firstSpaClose:async()=>{throw new Error("closed account must not consume stock again");},
    authenticate:(_req,_res,next)=>next(),actor:()=>demoActor});
  app.post("/api/spa/accounts/:id/payments",(_req,res)=>{legacyWrites++;res.json({legacy:true});});
  app.post("/api/spa/accounts/:id/link-invoice",(_req,res)=>{legacyWrites++;res.json({legacy:true});});
  const http=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>http.once("listening",resolve));
  const base=`http://127.0.0.1:${(http.address() as any).port}`;
  try {
    const refused=await fetch(`${base}/api/spa/accounts/${s.id}/payments`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({amount:95000,method:"cash"})});
    assert.equal(refused.status,409);assert.equal((await refused.json() as any).error.code,"MANAGED_SCOPE_USE_FUNDING");
    const op=await service.get(r.id,demoActor);
    const linked=await fetch(`${base}/api/spa/accounts/${s.id}/link-invoice`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({invoiceId:op.invoice.invoiceId})});
    assert.equal(linked.status,200);assert.equal((await linked.json() as any).data.status,"applied");
    assert.equal(legacyWrites,0);assert.deepEqual(await counts(s),before);
  } finally {await new Promise<void>(resolve=>http.close(()=>resolve()));}
});
test("adoption with fiscal history requires an atomic verified import, never mints a free second balance",async()=>{
  const s=await fixture("spa"),before=await counts(s);
  // Dismantle only this unused synthetic ledger, leaving its real-shaped source evidence.
  await pool.query("DELETE FROM payment_funding.documents WHERE scope_id=$1",[s.id]);
  await pool.query("DELETE FROM payment_funding.receipts WHERE scope_id=$1",[s.id]);
  await pool.query("DELETE FROM payment_funding.scopes WHERE id=$1",[s.id]);
  await pool.query("INSERT INTO funding_demo.sales_invoices(id,estado,spa_account_id) VALUES(nextval('funding_demo.invoice_number_seq'),'emitida',$1)",[s.id]);
  const adapter=service.adapter(s) as SqlFundingAdapter;
  await assert.rejects(service.store.transaction(s,null,c=>adapter.adoptScope(c,s)),(e:any)=>e.code==="HISTORY_REVIEW_REQUIRED");
  await assert.rejects(service.store.transaction(s,null,c=>adapter.adoptScope(c,s,async()=>{})),(e:any)=>e.code==="HISTORY_REVIEW_REQUIRED");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM payment_funding.scopes WHERE id=$1",[s.id])).rows[0].n,0);
  assert.deepEqual(await counts(s),before);
});
