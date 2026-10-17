import {it,expect} from "vitest";
import {diagnose,diagnosisOutputSchema} from "../../services/programming-assistant/diagnose";
import {CodeSource} from "../../services/programming-assistant/source";
import {safeStageEvents,requestCost,correctionCycleCost,fits} from "../../services/programming-assistant/lifecycle";
import {diagnosisSchema,diagnosisState,type SupportDiagnosis,type SupportTicket} from "../../shared/programming-support";

const version="a".repeat(40);
const ticket={version,module:"facturacion",title:"Dos operadores facturan la misma reserva",
  actual:"Uno emite y otro recibe el cargo ya no tiene saldo suficiente para facturar.",
  expected:"Qué significa, si se duplicó y qué debe verificar el operador.",messages:[]} as SupportTicket;
const response=(content:unknown,tokens=1000)=>({
  usage:{total_tokens:tokens,prompt_tokens:500},choices:[{message:{role:"assistant",content:JSON.stringify(content)}}],
});
const unsafe="El cargo fue facturado por otra operación, por lo que no se ha duplicado la facturación ni el cobro.";
const draft=(proposal=unsafe):SupportDiagnosis=>({
  summary:"El código rechaza un importe mayor al saldo facturable; no se inspeccionaron registros del incidente.",
  certainty:"sustentado_en_codigo",cause:"Se valida el saldo facturable del cargo.",proposal,
  proposedTests:[],questions:[],dataRepair:"",limitations:["La lectura estática no determina facturas ni cobros reales."],
  evidence:[{path:"server/billing/routes.ts",start:1672,end:1684,explanation:"El servidor rechaza importes que superan el saldo facturable."}],
});
const rejection={approved:false,issues:[{statementId:"proposal_1_1",problem:"No hay evidencia operativa para descartar duplicaciones.",correction:"Separar la protección del código del resultado real; consultar comprobantes y Caja sin otra emisión."}]};

it.each([1680,26680])("reserves the complete reject/correct/re-audit cycle (first audit tokens=%s)",async(firstAuditTokens)=>{
  const source=new CodeSource(process.cwd(),version);
  await source.read("server/billing/routes.ts",1664,1684);
  let author=0,audits=0;
  const corrected=draft("Consultar comprobantes y Caja para conocer el resultado real. Recuperar la misma operación pendiente, sin crear otra.");
  const client={chat:{completions:{create:async(request:any)=>{
    if(request.response_format.json_schema.name==="maran_diagnosis_audit"){
      audits++;
      const payload=JSON.parse(request.messages[1].content);
      expect(payload.evidence.coverageChecklist.length).toBeGreaterThan(0);
      expect(request.tools).toBeUndefined();
      expect(payload.diagnosis.statements.find((s:any)=>s.id==="proposal_1_1").text).toBe(audits===1?unsafe:corrected.proposal);
      return response(audits===1?rejection:{approved:true,issues:[]},audits===1?firstAuditTokens:1680);
    }
    author++;
    if(author===1)return response(draft(),40000);
    expect(author).toBe(2);
    expect(request.tool_choice).toBe("none");
    expect(request.messages.some((m:any)=>m.role==="tool")).toBe(false);
    expect(JSON.parse(request.messages[1].content).semanticIssues[0].quote).toBe(unsafe);
    return response(corrected,6500);
  }}}};
  const result=await diagnose(ticket,source,{apiKey:"unused",model:"mock"},client as any);
  expect(result.tokens).toBe(40000+firstAuditTokens+6500+1680);
  expect(result.tokens).toBeLessThanOrEqual(100000);
  expect(result.semanticAudits).toBe(2);expect(author).toBe(2);
  expect(result.partialReason).toBeUndefined();
  expect(result.report.proposal).toBe(corrected.proposal);
  expect(result.report.validationStatus).toBe("complete");
  expect(result.stages?.filter(e=>["audit","correction","reaudit"].includes(e.stage)).map(e=>[e.stage,e.outcome]))
    .toEqual([["audit","rejected"],["correction","completed"],["reaudit","approved"]]);
  if(firstAuditTokens===26680)expect(result.stages?.find(e=>e.stage==="audit")?.totalTokens).toBe(66680);
});

it("fails closed on a second rejection rather than publishing the corrected author response",async()=>{
  const source=new CodeSource(process.cwd(),version);await source.read("server/billing/routes.ts",1672,1684);
  let audits=0;
  const client={chat:{completions:{create:async(r:any)=>{
    if(r.response_format.json_schema.name==="maran_diagnosis_audit"){audits++;return response(rejection);}
    return response(draft());
  }}}};
  await expect(diagnose(ticket,source,{apiKey:"unused",model:"mock"},client as any))
    .rejects.toMatchObject({code:"evidence_semantic_rejected",stages:expect.arrayContaining([expect.objectContaining({stage:"reaudit",outcome:"rejected"})])});
  expect(audits).toBe(2);
});

it("separates an internal incomplete validation from indispensable missing user facts",()=>{
  expect(diagnosisState({...draft(),certainty:"hipotesis",validationStatus:"incomplete"})).toBe("validation_incomplete");
  expect(diagnosisState({...draft(),certainty:"falta_informacion",validationStatus:"complete"})).toBe("needs_info");
  expect(diagnosisState({...draft(),certainty:"sustentado_en_codigo"})).toBe("proposal_ready");
});

it("aligns every provider length/count bound with the local validator",()=>{
  const properties=diagnosisOutputSchema.properties;
  for(const field of ["summary","cause","proposal","dataRepair"] as const){
    const limit=properties[field].maxLength;
    expect(diagnosisSchema.safeParse({...draft(),[field]:"x".repeat(limit)}).success).toBe(true);
    expect(diagnosisSchema.safeParse({...draft(),[field]:"x".repeat(limit+1)}).success).toBe(false);
  }
  for(const field of ["questions","proposedTests","limitations"] as const){
    expect(properties[field].items.maxLength).toBe(1000);
    expect(diagnosisSchema.safeParse({...draft(),[field]:Array(properties[field].maxItems).fill("x")}).success).toBe(true);
    expect(diagnosisSchema.safeParse({...draft(),[field]:Array(properties[field].maxItems+1).fill("x")}).success).toBe(false);
    expect(diagnosisSchema.safeParse({...draft(),[field]:["x".repeat(1001)]}).success).toBe(false);
  }
  expect(properties.evidence.maxItems).toBe(12);
  expect(properties.evidence.items.properties.explanation.maxLength).toBe(1200);
  expect(properties.evidence.items.properties.start.minimum).toBe(1);
  expect(properties.evidence.items.properties.end.minimum).toBe(1);
  expect(properties).not.toHaveProperty("validationStatus");
});

it("budgets the serialized schema as well as messages and both audits",()=>{
  const request={messages:[],response_format:{schema:"x".repeat(10000)}};
  expect(requestCost(request,4200)).toBeGreaterThan(9000);
  const cycle=correctionCycleCost(request,12000);
  expect(cycle).toBeGreaterThan(25000);
  expect(fits(40000,12000,cycle)).toBe(true);
  expect(fits(80000,12000,cycle)).toBe(false);
});

it("logs only bounded numeric stage metadata, never arbitrary provider text",()=>{
  const event={stage:"audit",outcome:"rejected",tokens:100,totalTokens:500,elapsedMs:10,issueCount:1,secret:"do not log",quote:"private"};
  expect(safeStageEvents([event,{...event,stage:"private"},{...event,tokens:Infinity}]))
    .toEqual([{stage:"audit",outcome:"rejected",tokens:100,totalTokens:500,elapsedMs:10,issueCount:1}]);
  expect(JSON.stringify(safeStageEvents([event]))).not.toContain("private");
  expect(safeStageEvents(Array(200).fill(event))).toHaveLength(100);
});
