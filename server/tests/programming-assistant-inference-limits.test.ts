import {simulatedFiscalAudit} from "./helpers/simulatedFiscalAudit";
import {it,expect} from "vitest";
import historicalWrong from "./fixtures/assistant-nc-speculative-persistence.json";
import {inferenceLimitIssues} from "../../services/programming-assistant/inference-limits";
import {CodeSource} from "../../services/programming-assistant/source";
import {diagnose} from "../../services/programming-assistant/diagnose";
import {orientInvestigation} from "../../services/programming-assistant/navigation";
import {sourceRange} from "./helpers/assistantSourceEvidence";
import type {SupportTicket,SupportDiagnosis} from "../../shared/programming-support";
// Keep the received report verbatim; bind only its citations to the same live
// instructions so unrelated source edits cannot hide the causal-limit check.
const wrong = { ...historicalWrong, evidence: historicalWrong.evidence.map(ref => ref.path === "server/billing/invoiceService.ts"
  ? { ...ref, ...sourceRange(ref.path, "const fecha = String(pendingInvoice", 0, 51) }
  : ref.path === "server/billing/routes.ts"
    ? { ...ref, ...sourceRange(ref.path, 'app.post("/api/billing/credit-notes/:id/reconcile"', 0, 58) } : ref) };
const version="a".repeat(40);
const ticket={version,module:"grupos",title:"Error 10049 en NC pendiente de grupo",actual:"Al conciliar la NC de un grupo se informó históricamente error 10049 sobre FchServDesde, FchServHasta y FchVtoPago.",expected:"Investigar la causa sin emitir otro comprobante.",messages:[]} as SupportTicket;
const source=()=>new CodeSource(process.cwd(),version);
const base=(patch:Partial<SupportDiagnosis>={}):SupportDiagnosis=>({summary:"Esta revisión construye las fechas en el XML.",cause:"No se determinó la causa histórica.",proposal:"Contrastar el envío y revisión del intento histórico con el código actual.",certainty:"hipotesis",proposedTests:[],questions:[],dataRepair:"",limitations:["No se consultaron registros operativos."],evidence:[],...patch});
const corrected=():SupportDiagnosis=>base({evidence:[...wrong.evidence,{...sourceRange("server/billing/groupCreditRecovery.ts","return db.transaction(async (tx) => {",0,61),explanation:"Aplicación local posterior a comprobar estado emitida y CAE; no demuestra el resultado histórico."}]});
const reply=(content:unknown,request?:any)=>({usage:{total_tokens:500,prompt_tokens:300},choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify(simulatedFiscalAudit(content,request))}}]});

it.each(["hipotesis","sustentado_en_codigo","falta_informacion"] as const)("rejects the received causal leap even with certainty %s",certainty=>{
 const errors=inferenceLimitIssues({...wrong,certainty} as SupportDiagnosis);
 expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({field:"summary",code:"CURRENT_CODE_AS_INCIDENT_PROOF"}),expect.objectContaining({field:"proposal",code:"UNINSPECTED_MECHANISM_REPAIR"})]));
});
it.each([
 "El código actual no descarta el error en el envío histórico.",
 "La lectura del XML actual no permite descartar un fallo en el intento anterior.",
 "Se genera el XML; sin poder descartar el error histórico, corresponde contrastar el envío.",
 "Si el XML capturado del intento incluye el campo, se podrá descartar el error de ausencia literal en ese documento.",
 "Esta revisión incorpora las fechas; eso no confirma qué se transmitió en el intento histórico.",
])("preserves scoped, negative and conditional statements: %s",summary=>expect(inferenceLimitIssues(base({summary}))).toEqual([]));
it.each([
 "Revisar la lectura y escritura antes de decidir si hay que cambiar persistencia.",
 "No implementar copias al persistir hasta inspeccionar ese mecanismo.",
 "Si una revisión del guardado demuestra pérdida del dato, implementar la corrección correspondiente al persistir.",
 "Contrastar el envío histórico; no se propone modificar la base de datos.",
])("does not block investigation or explicitly conditioned repairs: %s",proposal=>{
 expect(inferenceLimitIssues(base({proposal,limitations:["No se inspeccionó el mecanismo de persistencia."]}))).toEqual([]);
});
it("does not turn lack of operational records into a ban on a code-backed repair",()=>{
 expect(inferenceLimitIssues(base({proposal:"Implementar la corrección de persistencia identificada en la escritura leída.",limitations:["No se consultaron registros operativos."]}))).toEqual([]);
});
it("keeps this mechanism check useful outside fiscal dates",()=>{
 const report=base({summary:"El stock no se actualiza.",proposal:"Modificar el guardado del movimiento de stock.",limitations:["No se revisó el código de persistencia del stock."]});
 expect(inferenceLimitIssues(report)).toEqual(expect.arrayContaining([expect.objectContaining({code:"UNINSPECTED_MECHANISM_REPAIR"})]));
});
it("blocks the complete received report before a permissive mocked auditor can approve it",async()=>{
 const s=source();for(const ref of wrong.evidence)await s.read(ref.path,ref.start,ref.end);
 expect(wrong.evidence.every(ref=>s.validates(ref))).toBe(true);
 let writers=0,audits=0;
 const client={chat:{completions:{create:async(req:any)=>{if(req.response_format.json_schema.name==="maran_diagnosis_audit"){audits++;return reply({approved:true,issues:[]},req);}writers++;return reply(wrong);}}}};
 await expect(diagnose(ticket,s,{apiKey:"unused",model:"mock"},client as any)).rejects.toMatchObject({code:"evidence_inconsistent"});
 expect(writers).toBe(3);expect(audits).toBe(0);
});
it("allows an honest undetermined cause through independent review without inventing another mechanism",async()=>{
 const s=source();for(const ref of wrong.evidence)await s.read(ref.path,ref.start,ref.end);
 let writers=0,audits=0;
 const client={chat:{completions:{create:async(req:any)=>{
  if(req.response_format.json_schema.name==="maran_diagnosis_audit"){
   audits++;const payload=JSON.parse(req.messages[1].content);
   expect(req.messages[0].content).toContain("no exigir inventar una causa alternativa");
   expect(payload.evidence.decisionBrief.checks.map((c:any)=>c.id)).toContain("local_application");
   expect(payload.diagnosis.statements.find((s:any)=>s.field==="cause").text).toBe(corrected().cause);
   return reply({approved:true,issues:[]},req);
  }
  writers++;if(writers===1)return reply(wrong);
  expect(JSON.stringify(req.messages)).toContain("UNINSPECTED_MECHANISM_REPAIR");
  return reply(corrected());
 }}}};
 const result=await diagnose(ticket,s,{apiKey:"unused",model:"mock"},client as any);
 expect(writers).toBe(2);expect(audits).toBe(1);expect(result.report.validationStatus).toBe("complete");
 expect(result.report.cause).toBe("No se determinó la causa histórica.");
});
it("reads the actual local-application phase rather than assigning fiscal requirements to it",async()=>{
 const s=source(),orientation=await orientInvestigation(ticket,s);
 const local=orientation.workflowReads.find(read=>read.path==="server/billing/groupCreditRecovery.ts" && read.content.includes("return db.transaction") && read.content.includes("UPDATE sales_invoices"));
 expect(local?.content).toContain('nc?.estado !== "emitida"');
 expect(local?.content).toContain("nc.cae");
 expect(local?.content).toContain("UPDATE sales_invoices");
 expect(local?.content).not.toContain("await authorize(");
 expect(local && s.validates(local)).toBe(true);
});

it("does not confuse missing operational database inspection with missing persistence-code inspection",()=>{
 expect(inferenceLimitIssues(base({proposal:"Implementar la corrección de persistencia demostrada en el código.",limitations:["No se verificó la base de datos operativa."]}))).toEqual([]);
});

it.each(['hipotesis','sustentado_en_codigo','falta_informacion'] as const)('rejects the new received report claiming that the rejection proves an unobserved input, even with %s',async certainty=>{
 const {default:received}=await import('./fixtures/assistant-nc-unobserved-date.json');
 expect(inferenceLimitIssues({...received,certainty})).toEqual(expect.arrayContaining([expect.objectContaining({code:'PROVIDER_ERROR_AS_INPUT_PROOF',field:'cause'})]));
});
it('does not turn a possible input explanation into a code-backed cause when the input is explicitly unknown',()=>{
 const report=base({certainty:'sustentado_en_codigo',cause:'El rechazo puede deberse a que el importe no se asigna adecuadamente.',limitations:['No se conoce el valor enviado en el intento.']});
 expect(inferenceLimitIssues(report)).toEqual(expect.arrayContaining([expect.objectContaining({code:'UNOBSERVED_INPUT_AS_CODE_CAUSE'})]));
});
it.each([
 {cause:'No se determinó la causa histórica. El catch guarda el error; no registra el valor del envío rechazado.',certainty:'sustentado_en_codigo' as const},
 {cause:'Una posibilidad a verificar es una entrada distinta; si el envío histórico difiere de lo leído se podrá contrastar esa hipótesis. No se determinó la causa.',certainty:'hipotesis' as const},
 {cause:'El código usa una fecha constante en vez de la fecha recibida: la asignación defectuosa está localizada. No demuestra qué ocurrió en aquel intento.',certainty:'sustentado_en_codigo' as const},
])('preserves a scoped explanation or explicit conditional hypothesis: $cause',patch=>{
 expect(inferenceLimitIssues(base({...patch,limitations:['No se dispone de la fecha enviada en la solicitud del intento.']}))).toEqual([]);
});
it('blocks the fresh report before an auditor can rubber-stamp the unobserved input attribution',async()=>{
 const {default:received}=await import('./fixtures/assistant-nc-unobserved-date.json');
 const s=source();for(const ref of received.evidence)await s.read(ref.path,ref.start,ref.end);
 let audits=0,writes=0;
 const client={chat:{completions:{create:async(req:any)=>{
  if(req.response_format.json_schema.name==='maran_diagnosis_audit'){audits++;return reply({approved:true,issues:[]},req);}
  writes++;return reply(received);
 }}}};
 await expect(diagnose(ticket,s,{apiKey:'unused',model:'mock'},client as any)).rejects.toMatchObject({code:'evidence_inconsistent'});
 expect(writes).toBe(3);expect(audits).toBe(0);
});
it('requires a corrected conclusion and independent audit after the new report is rejected',async()=>{
 const {default:received}=await import('./fixtures/assistant-nc-unobserved-date.json');
 const s=source();for(const ref of [...received.evidence,...corrected().evidence])await s.read(ref.path,ref.start,ref.end);
 let writes=0,audits=0;
 const client={chat:{completions:{create:async(req:any)=>{
  if(req.response_format.json_schema.name==='maran_diagnosis_audit'){
   audits++;expect(req.messages[0].content).toContain('no identifica cuál de las entradas era incorrecta');
   return reply({approved:true,issues:[]},req);
  }
  writes++;
  if(writes===1)return reply(received);
  expect(JSON.stringify(req.messages)).toContain('PROVIDER_ERROR_AS_INPUT_PROOF');
  return reply(corrected());
 }}}};
 const result=await diagnose(ticket,s,{apiKey:'unused',model:'mock'},client as any);
 expect(result.report.validationStatus).toBe('complete');expect(result.report.cause).toBe('No se determinó la causa histórica.');
 expect(writes).toBe(2);expect(audits).toBe(1);
});
