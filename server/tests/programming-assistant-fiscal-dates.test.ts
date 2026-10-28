import {it,expect} from "vitest";
import wrong from "./fixtures/assistant-nc-date-unsupported-report.json";
import {sourceRange} from "./helpers/assistantSourceEvidence";
import {CodeSource} from "../../services/programming-assistant/source";
import {orientInvestigation} from "../../services/programming-assistant/navigation";
import {validateReportClaims} from "../../services/programming-assistant/claim-validation";
import {creditNoteRecoveryChecklist,fiscalDatesRecoveryRequirement} from "../../services/programming-assistant/credit-note-recovery";
import {diagnose} from "../../services/programming-assistant/diagnose";
import type {SupportTicket,SupportDiagnosis} from "../../shared/programming-support";
const version="a".repeat(40);
const ticket={version,module:"grupos",title:"Error al conciliar una NC pendiente de grupo",actual:"Al intentar conciliar aparece 10049: Los campos FchServDesde, FchServHasta y FchVtoPago contienen errores o no fueron ingresados. Son obligatorios cuando Concepto es 2 o 3.",expected:"Investigar cómo se completan las fechas durante la recuperación; no emitir otro comprobante.",messages:[]} as SupportTicket;
const coverage=[...creditNoteRecoveryChecklist,fiscalDatesRecoveryRequirement];
const source=()=>new CodeSource(process.cwd(),version);
const reply=(content:unknown)=>({usage:{total_tokens:500,prompt_tokens:300},choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify(content)}}]});
const corrected=():SupportDiagnosis=>({summary:"El código de esta revisión sí construye e incorpora las tres fechas al XML para Concepto 2, incluidas NC. No alcanza para demostrar la causa del rechazo histórico.",cause:"La ausencia de campos en el wrapper no demuestra que falten en el envío: authorize usa emitirFactura y feCAESolicitar llama a buildServiceDates. La causa del incidente no está confirmada.",certainty:"sustentado_en_codigo",proposal:"Contrastar la revisión y el envío del intento histórico con el constructor actual antes de proponer cambios. Conservar la identidad de la NC pendiente. La lectura del código y de tests simulados no prueba autorización fiscal real ni resolución del incidente.",proposedTests:[],questions:[],dataRepair:"",limitations:["Sin acceso al envío histórico ni al resultado fiscal real; no se ejecutaron pruebas."],evidence:[
 {...sourceRange("server/billing/routes.ts",'app.post("/api/billing/credit-notes/:id/reconcile"',0,56),explanation:"Recuperación de la NC existente."},
 {...sourceRange("client/src/pages/billing.tsx","Reintentar y conciliar",8,2),explanation:"Acción de Facturación."},
 {...sourceRange("server/billing/groupCreditRecovery.ts","export async function recoverGroupCreditNote(",0,64),explanation:"Alias authorize y recuperación con el identificador existente."},
 {...sourceRange("server/billing/invoiceService.ts","const fecha = String(pendingInvoice?.fechaEmision",0,51),explanation:"Fecha persistida enviada al cliente fiscal después de consultar la identidad."},
 {...sourceRange("server/billing/wsfevClient.ts","function buildServiceDates(fecha:",0,18),explanation:"Construcción y validación de las tres fechas."},
 {...sourceRange("server/billing/wsfevClient.ts","<ar:Concepto>2</ar:Concepto>",16,22),explanation:"Se incorpora serviceDates en el XML de Concepto 2."},
 {...sourceRange("server/tests/wsfev-cbtes-asoc.test.ts",'describe("WSFEv1 — fechas de prestación',0,31),explanation:"El test leído contiene aserciones de fechas en el XML para NC; proveedor simulado, sin ejecutarlo."},
]});
async function readWrong(s:CodeSource){for(const ref of wrong.evidence)await s.read(ref.path,ref.start,ref.end);}
it("follows the alias, emission date, builder, serialized XML and existing tests without running them",async()=>{
 const s=source(),orientation=await orientInvestigation(ticket,s),code=orientation.workflowReads.map(r=>r.content).join("\n");
 expect(orientation.coverageChecklist).toEqual(coverage);
 for(const term of ["authorize: typeof emitirFactura = emitirFactura", "const fecha = String(pendingInvoice?.fechaEmision", "feCAESolicitar(", "function buildServiceDates", "FchServDesde", "FchServHasta", "FchVtoPago", "serviceDates +", "<ar:Concepto>2", "expect(request.body).toContain", '"NCA", "NCB"'])expect(code).toContain(term);
 expect(orientation.workflowReads.every(ref=>s.validates(ref))).toBe(true);
 expect(orientation.decisionBrief?.checks.slice(0,3).map(c=>c.id)).toEqual(["date_builder","date_serialization","fiscal_call"]);
});
it("rejects the received report even though its recovery/UI citations are real and already read",async()=>{
 const s=source();await readWrong(s);
 expect(wrong.evidence.every(ref=>s.validates(ref))).toBe(true);
 const issues=await validateReportClaims(wrong as SupportDiagnosis,s,coverage);
 expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code:"FISCAL_PAYLOAD_CHAIN_NOT_SUPPORTED",missing:{caller:true,builder:true,serialization:true}})]));
 expect(issues.some(i=>i.code==="RECOVERY_WORKFLOW_NOT_SUPPORTED")).toBe(false);
 let audits=0,writes=0;
 const client={chat:{completions:{create:async(req:any)=>{if(req.response_format.json_schema.name==="maran_diagnosis_audit")audits++;else writes++;return reply(wrong);}}}};
 await expect(diagnose(ticket,s,{apiKey:"unused",model:"mock"},client as any)).rejects.toMatchObject({code:"evidence_claim_mismatch"});
 expect(writes).toBe(3);expect(audits).toBe(0);
});
it("audits a corrected explanation against the full fiscal chain rather than approving it from citation presence",async()=>{
 const s=source();await readWrong(s);let writes=0,audits=0;
 const client={chat:{completions:{create:async(req:any)=>{
  if(req.response_format.json_schema.name==="maran_diagnosis_audit"){
   audits++;const payload=JSON.parse(req.messages[1].content);
   expect(req.messages[0].content).toContain("wrapper");
   expect(payload.evidence.decisionBrief.checks.map((c:any)=>c.id)).toContain("date_serialization");
   const code=[...payload.evidence.decisionBrief.readings,...payload.evidence.citedCode].map((r:any)=>r.content).join("\n");
   expect(code).toContain("serviceDates +");expect(code).toContain("function buildServiceDates");
   expect(payload.capabilities.operationalDatabaseAccess).toBe(false);
   return reply({approved:true,issues:[]});
  }
  writes++;if(writes===1)return reply(wrong);
  expect(JSON.stringify(req.messages)).toContain("FISCAL_PAYLOAD_CHAIN_NOT_SUPPORTED");
  return reply(corrected());
 }}}};
 const result=await diagnose(ticket,s,{apiKey:"unused",model:"mock"},client as any);
 expect(writes).toBe(2);expect(audits).toBe(1);expect(result.report.validationStatus).toBe("complete");
});
it("cannot bypass an independent rejection by appending the correct citations to the same false cause",async()=>{
 const s=source();await orientInvestigation(ticket,s);const r={...wrong,evidence:corrected().evidence};let audits=0;
 const client={chat:{completions:{create:async(req:any)=>{
  if(req.response_format.json_schema.name==="maran_diagnosis_audit"){
   audits++;return reply({approved:false,issues:[{statementId:"cause_1_1",problem:"Afirma que no se completan fechas pero el constructor y el XML leídos sí las incorporan.",correction:"Separar el código actual de la causa histórica no verificada; no afirmar ausencia."}]});
  }
  return reply(r);
 }}}};
 await expect(diagnose(ticket,s,{apiKey:"unused",model:"mock"},client as any)).rejects.toMatchObject({code:"evidence_semantic_rejected"});
 expect(audits).toBe(2);
});
it("does not impose XML-date coverage on an ordinary pending-NC recovery case",async()=>{
 const orientation=await orientInvestigation({...ticket,actual:"Quedó pendiente de conciliar desde el grupo.",expected:"Cómo continuar."},source());
 expect(orientation.coverageChecklist).toEqual(creditNoteRecoveryChecklist);
});
