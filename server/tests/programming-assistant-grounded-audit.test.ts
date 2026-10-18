import {it,expect} from "vitest";
import fixture from "./fixtures/assistant-real-failures.json";
import {CodeSource} from "../../services/programming-assistant/source";
import {diagnose} from "../../services/programming-assistant/diagnose";
import {auditDiagnosis,auditReport,diagnosisStatements,auditInstruction} from "../../services/programming-assistant/semantic-audit";
import {RequestBudget,requestCost,correctionCycleCost,fits} from "../../services/programming-assistant/lifecycle";
import {financialConsistencyIssues} from "../../services/programming-assistant/consistency";
import type {SupportDiagnosis,SupportTicket} from "../../shared/programming-support";

const version="a".repeat(40);
const ticket={version,title:"Dos operadores facturan",actual:"El cargo ya no tiene saldo suficiente para facturar.",expected:"Qué significa y qué comprobar.",module:"facturacion",messages:[]} as SupportTicket;
const report=():SupportDiagnosis=>({summary:fixture.safeSummary,cause:"La capacidad fiscal puede estar consumida por un comprobante o reservada por autorización pendiente; no demuestra cobro ni emisión finalizada.",proposal:fixture.safeProposal,certainty:"sustentado_en_codigo",dataRepair:"",proposedTests:[],questions:[],limitations:["Sólo inspección estática, sin consulta a datos operativos ni tests ejecutados."],evidence:[{path:"server/billing/routes.ts",start:1639,end:1684,explanation:"Los estados emitida, parcial y autorizacion_pendiente consumen capacidad; la validación rechaza importes por encima del saldo facturable."}]});
const response=(content:unknown,tokens=1000,prompt=500)=>({usage:{total_tokens:tokens,prompt_tokens:prompt},choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify(content)}}]});

it("calibrates prompt cost rather than completion usage, keeping a floor and adapting upward",()=>{
 const budget=new RequestBudget(),request={messages:[{content:"x".repeat(30000)}]};
 expect(budget.estimate(request,4200)).toBe(requestCost(request,4200));
 budget.observe(request,6500);
 expect(budget.estimate(request,4200)).toBeLessThan(requestCost(request,4200));
 expect(budget.estimate(request,4200)).toBeGreaterThanOrEqual(30000/3+4200+512);
 budget.observe(request,30000);
 expect(budget.estimate(request,4200)).toBeGreaterThan(30000+4200);
 const before=budget.estimate(request,4200);
 for(const invalid of [undefined,NaN,Infinity,-1,0])budget.observe(request,invalid);
 expect(budget.estimate(request,4200)).toBe(before);
});

it.each(fixture.blockedRuns)("budgets the concrete remaining 3 calls at $spent real spent tokens without dropping re-audit",({spent})=>{
 const correction={messages:[{content:"code ".repeat(5000)}]};
 const audit={messages:[{content:"evidence ".repeat(2500)}]};
 const budget=new RequestBudget();budget.observe(correction,6000);
 const estimate=(r:unknown,o:number)=>budget.estimate(r,o);
 const old=requestCost(audit,3200)+correctionCycleCost(correction,requestCost(audit,3200));
 const reserved=estimate(audit,3200)+correctionCycleCost(correction,estimate(audit,3200),estimate);
 expect(fits(spent,old)).toBe(false);
 expect(fits(spent,reserved)).toBe(true);
 expect(fits(95000,reserved)).toBe(false);
});

it.each(fixture.blockedRuns)("reaches mandatory audit from the real $spent usage, rather than returning correction_reserve",async({spent,promptTokens})=>{
 const source=new CodeSource(process.cwd(),version);await source.read("server/billing/routes.ts",1615,1684);
 let audits=0;
 const client={chat:{completions:{create:async(req:any)=>{
  if(req.response_format.json_schema.name==="maran_diagnosis_audit"){audits++;return response({approved:true,issues:[]});}
  return response(report(),spent,promptTokens);
 }}}};
 const result=await diagnose(ticket,source,{apiKey:"unused",model:"mock"},client as any);
 expect(result.partialReason).toBeUndefined();expect(audits).toBe(1);
 expect(result.report.validationStatus).toBe("complete");expect(result.tokens).toBe(spent+1000);
});

it("transmits complete logical fields without losing any existing statementId at the real cut boundary",()=>{
 const r=report(),prefix="x".repeat(800-Array.from(fixture.cutBoundary).length);
 r.cause=prefix+fixture.cutBoundary+fixture.continuation;
 const view=auditReport(r),field=view.statements.find(item=>item.field==="cause")!;
 expect(field.text).toBe(r.cause);
 expect(field.text).toContain("simulan y verifican");
 expect(field.statementIds).toEqual(["cause_1_1","cause_1_2"]);
 expect(view.statements.filter(item=>item.field==="cause")).toHaveLength(1);
 expect(view.statements.flatMap(item=>item.statementIds)).toEqual(diagnosisStatements(r).statements.map(item=>item.id));
});

it.each([true,false])("preserves the positive/negative controls as independent reviews (safe=%s)",async(safe)=>{
 const r=report();r.proposal=safe?fixture.safeProposal:fixture.unsafeProposal;
 const source=new CodeSource(process.cwd(),version);await source.read("server/billing/routes.ts",1639,1684);
 const client={chat:{completions:{create:async(req:any)=>{
  const payload=JSON.parse(req.messages[1].content);
  const texts=payload.diagnosis.statements.map((s:any)=>s.text);
  expect(texts).toContain(r.proposal);
  expect(texts).not.toContain(fixture.falseSafeFinding);
  expect(auditInstruction).toContain("No atribuyas una conclusión inexistente");
  expect(auditInstruction).toContain("UN campo/elemento COMPLETO");
  return response(safe?{approved:true,issues:[]}:{approved:false,issues:[{statementId:"proposal_1_1",problem:"Afirma ausencia de duplicación sin registros.",correction:"Separar protección de resultado y consultar comprobantes y Caja."}]});
 }}}};
 const result=await auditDiagnosis(ticket,r,source,client as any,{model:"mock",signal:AbortSignal.timeout(10000),remainingTokens:100000});
 expect(result.approved).toBe(safe);
});

it("never silently converts a reviewer rejection to approval, even if the finding looks like the old false positive",async()=>{
 const r=report(),source=new CodeSource(process.cwd(),version);await source.read("server/billing/routes.ts",1639,1684);
 const client={chat:{completions:{create:async()=>response({approved:false,issues:[{statementId:"summary_1_1",problem:fixture.falseSafeFinding,correction:"Verificar la afirmación contra el texto completo."}]})}}};
 expect((await auditDiagnosis(ticket,r,source,client as any,{model:"mock",signal:AbortSignal.timeout(10000),remainingTokens:100000})).approved).toBe(false);
});

it("rejects the real unsupported completed-emission inference while permitting its negation and conditional explanations",()=>{
 const r=report();r.proposal=fixture.completedOtherClaim;
 expect(financialConsistencyIssues(r)).toEqual(expect.arrayContaining([expect.objectContaining({code:"RESERVED_CAPACITY_AS_COMPLETED_INVOICE"})]));
 r.proposal="El mensaje no permite concluir que otro proceso completó la factura; puede haber capacidad reservada por una autorización pendiente.";
 expect(financialConsistencyIssues(r)).toEqual([]);
 r.proposal="El mensaje puede deberse a que otro proceso completó la factura, o a una autorización pendiente. Consultar estados y pagos.";
 expect(financialConsistencyIssues(r)).toEqual([]);
});
