import {createHash} from "node:crypto";
import {describe,it,expect,vi} from "vitest";
import {CodeSource} from "../../services/programming-assistant/source";
import {buildDecisionBrief,operationalResponseInstruction} from "../../services/programming-assistant/decision-brief";
import {buildCoverageReview,buildResearchClosure} from "../../services/programming-assistant/review";
import {orientInvestigation} from "../../services/programming-assistant/navigation";
import {auditDiagnosis,prepareAudit,diagnosisStatements,auditInstruction} from "../../services/programming-assistant/semantic-audit";
import {diagnose} from "../../services/programming-assistant/diagnose";
import {invoiceConflictChecklist} from "../../services/programming-assistant/invoice-conflict";
import {reviewCases} from "./fixtures/assistant-review-cases";
import archived from "./fixtures/assistant-real-reports-7dd993b.json";

const source=()=>new CodeSource(process.cwd(),archived.sourceRevision);
const response=(verdict:unknown,tokens=500)=>({
  usage:{total_tokens:tokens,prompt_tokens:300},
  choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify(verdict)}}],
});
function expectedVerdict(item:typeof reviewCases[number]){
  if(item.expected.approved===null)throw new Error("Qualitative review has no mandatory verdict.");
  if(item.expected.approved)return {approved:true,issues:[]};
  const statement=diagnosisStatements(item.report).statements.find(s=>
    s.field===item.expected.field && s.text.includes(item.expected.quote!));
  if(!statement)throw new Error(`Regression finding lost its original text: ${item.id}`);
  return {approved:false,issues:[{statementId:statement.id,problem:item.expected.reason,correction:"Acotar la afirmación contra decisionBrief y responder con pasos operativos sustentados."}]};
}
it("keeps all three complete archived reports with provenance, without rewriting their wording",()=>{
  expect(archived.runs).toHaveLength(3);
  expect(archived.sourceRevision).toBe("7dd993bab98b4604d0656269b55ab6cbeccc0b11");
  expect(archived.originalSha256).toMatch(/^[a-f0-9]{64}$/);
  // Also pins the extraction result, independently of future fixture edits.
  expect(createHash("sha256").update(JSON.stringify(archived.runs.map(r=>r.report))).digest("hex"))
    .toBe("71e5e4e1419ac80d03ad41013ff81dc0efaec127d31e021decf5bfb7a42aa85d");
  expect(archived.runs.every(r=>r.originalProtocolPassed)).toBe(true);
  expect(reviewCases.slice(0,3).map(r=>r.expected.approved)).toEqual([null,false,false]);
});
it("keeps real-run-1 qualitative rather than silently turning it into a positive control",()=>{
  expect(reviewCases[0].id).toBe("real-run-1");
  expect(reviewCases[0].report).toEqual(archived.runs[0].report);
  expect(reviewCases[0].expected.approved).toBeNull();
  expect(()=>expectedVerdict(reviewCases[0])).toThrow("no mandatory verdict");
  expect(reviewCases.filter(item=>item.expected.approved===true)).toHaveLength(5);
  expect(reviewCases.filter(item=>item.expected.approved===false).map(item=>item.id)).toEqual(["real-run-2","real-run-3"]);
});
it("supplies source-backed decision paths even when the author omits the helper and screen",async()=>{
  const s=source(),draft=structuredClone(reviewCases[3].report);
  draft.evidence=draft.evidence.slice(0,1);
  const prepared=await prepareAudit(reviewCases[0].ticket,draft,s,invoiceConflictChecklist);
  const packet=JSON.parse(prepared.payload).evidence.decisionBrief;
  expect(packet.interfaceScope).toContain("Prefactura de Recepción");
  expect(packet.checks.map((c:any)=>c.id)).toEqual(["capacity","discard","identity","collection"]);
  expect(packet.checks.every((c:any)=>c.evidence && !c.missing)).toBe(true);
  const code=packet.readings.map((r:any)=>r.content).join("\n");
  for(const symbol of ["autorizacion_pendiente","Number(amount)","pending + 0.02","4(?:00|03|09)","attempt.invoice","creditOperationId","hasClaim(operationId)","if (discarded)","nextOperationId","preserve the original operation","attempt.payments"])
    expect(code,symbol).toContain(symbol);
  for(const read of packet.readings)expect(s.validates(read)).toBe(true);
  expect(packet.readings.every((r:any)=>!r.incomplete)).toBe(true);
});
it("uses the same decision questions in orientation, closure, correction context and audit",async()=>{
  const s=source(),item=reviewCases[3];
  const oriented=await orientInvestigation(item.ticket,s);
  const closure=await buildResearchClosure(s,invoiceConflictChecklist);
  const coverage=await buildCoverageReview(item.report,s,invoiceConflictChecklist);
  const prepared=await prepareAudit(item.ticket,item.report,s,invoiceConflictChecklist);
  const checks=coverage.decisionBrief!.checks;
  expect(oriented.decisionBrief!.checks).toEqual(checks);
  expect(closure.decisionBrief!.checks).toEqual(checks);
  expect(JSON.parse(prepared.payload).evidence.decisionBrief.checks).toEqual(checks);
  expect(operationalResponseInstruction).toContain("questions=[]");
  expect(auditInstruction).toContain("interpretación válida");
});
it("marks missing anchors explicitly instead of inventing a fiscal conclusion or screen",async()=>{
  const s=source();
  vi.spyOn(s,"files").mockResolvedValue([]);
  const brief=await buildDecisionBrief(s,invoiceConflictChecklist);
  expect(brief!.checks.every(c=>c.missing && c.evidence===null)).toBe(true);
  expect(brief!.readings).toEqual([]);
  expect(brief!.interfaceScope).toEqual([]);
  expect(await buildDecisionBrief(s,[])).toBeUndefined();
});
it("bounds oversized source lines and labels omitted decision evidence incomplete",async()=>{
  const s=source();
  vi.spyOn(s,"search").mockImplementation(async(_term,path)=>({
    matches:[{path,line:100,text:"synthetic anchor"}],truncated:false,
  }) as any);
  vi.spyOn(s,"read").mockImplementation(async(path,start=1,end=start)=>({
    path,start,end,content:`${start}: ${"x".repeat(9000)}`,
  }));
  const brief=await buildDecisionBrief(s,invoiceConflictChecklist);
  expect(brief!.readings.reduce((sum,read)=>sum+read.content.length,0)).toBeLessThanOrEqual(8000);
  expect(brief!.readings.every(read=>read.incomplete)).toBe(true);
});
it("shares the bounded evidence allowance without repeating core code in author citations",async()=>{
  const s=source(),review=await buildCoverageReview(reviewCases[3].report,s,invoiceConflictChecklist);
  const raw=[...review.decisionBrief!.readings,...review.citedCode];
  expect(raw.reduce((sum,r)=>sum+r.content.length+1,0)).toBeLessThanOrEqual(16000);
  const keys=raw.flatMap(r=>r.content.split("\n").filter(Boolean).map(line=>`${r.path}:${line.match(/^\d+/)?.[0]}`));
  expect(new Set(keys).size).toBe(keys.length);
  expect(review.citedCode.some(r=>r.duplicatesInDecisionBrief)).toBe(true);
});

describe("offline replay contracts — provider verdicts are simulated, NOT measured semantic accuracy",()=>{
  it.each(reviewCases.filter(item=>item.expected.approved!==null))("$id preserves the entire report and the expected approve/reject protocol",async item=>{
    const s=source();
    const verdict=expectedVerdict(item);
    const create=vi.fn(async(request:any)=>{
      const payload=JSON.parse(request.messages[1].content);
      const texts=payload.diagnosis.statements.map((part:any)=>part.text);
      for(const field of ["summary","cause","proposal"] as const)expect(texts).toContain(item.report[field]);
      for(const question of item.report.questions)expect(texts).toContain(question);
      expect(payload.evidence.decisionBrief.checks).toHaveLength(4);
      expect(payload.evidence.decisionBrief.interfaceScope).toContain("Prefactura de Recepción");
      expect(request.tools).toBeUndefined();
      return response(verdict);
    });
    const result=await auditDiagnosis(item.ticket,item.report,s,{chat:{completions:{create}}} as any,{
      model:"offline-mock",signal:AbortSignal.timeout(30000),remainingTokens:100000,coverageChecklist:invoiceConflictChecklist,
    });
    expect(result.approved).toBe(item.expected.approved);
    expect(result.issues).toHaveLength(item.expected.approved?0:1);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it.each([true,false])("real-run-1 preserves the independent verdict without a mandatory label (approved=%s)",async approved=>{
    const item=reviewCases[0],s=source();
    // These two verdicts test transport only, not the validity of this finding.
    const statement=diagnosisStatements(item.report).statements.find(part=>part.field==="proposal")!;
    const verdict=approved ? {approved:true,issues:[]} : {
      approved:false,issues:[{statementId:statement.id,problem:"Observación simulada para verificar el protocolo.",correction:"Revisar contra el código."}],
    };
    const client={chat:{completions:{create:async(request:any)=>{
      const payload=JSON.parse(request.messages[1].content);
      expect(payload.diagnosis.statements.find((part:any)=>part.field==="cause").text).toBe(item.report.cause);
      expect(payload.expected).toBeUndefined();
      return response(verdict);
    }}}};
    const result=await auditDiagnosis(item.ticket,item.report,s,client as any,{
      model:"offline-mock",signal:AbortSignal.timeout(30000),remainingTokens:100000,coverageChecklist:invoiceConflictChecklist,
    });
    expect(result.approved).toBe(approved);
    expect(result.issues).toHaveLength(approved?0:1);
    expect(item.expected.approved).toBeNull();
  });
  it("sends a complete concise replacement through the same evidence and an independent re-audit",async()=>{
    const bad=reviewCases[2],good=reviewCases[3],s=source();
    for(const ref of bad.report.evidence)await s.read(ref.path,ref.start,ref.end);
    let authors=0,audits=0;
    const client={chat:{completions:{create:async(request:any)=>{
      if(request.response_format.json_schema.name==="maran_diagnosis_audit"){
        audits++;
        return response(audits===1?expectedVerdict(bad):{approved:true,issues:[]});
      }
      authors++;
      if(authors===2){
        const payload=JSON.parse(request.messages[1].content);
        expect(payload.decisionBrief.checks).toHaveLength(4);
        expect(payload.decisionBrief.interfaceScope).toContain("Prefactura de Recepción");
        expect(payload.semanticIssues[0].statementId).toMatch(/^evidence_/);
        expect(request.messages[0].content).toContain(operationalResponseInstruction);
      }
      return response(authors===1?bad.report:good.report,1500);
    }}}};
    const result=await diagnose(bad.ticket,s,{apiKey:"unused",model:"offline-mock"},client as any);
    expect(result.report.validationStatus).toBe("complete");
    expect(result.report.proposal).toBe(good.report.proposal);
    expect(result.report.questions).toEqual([]);
    expect(result.semanticAudits).toBe(2);
    expect(authors).toBe(2);expect(audits).toBe(2);
    expect(result.tokens).toBe(4000);
  });
});
