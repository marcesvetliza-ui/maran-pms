import {it,expect} from "vitest";
import wrong from "./fixtures/assistant-nc-pending-wrong-workflow.json";
import {sourceRange} from "./helpers/assistantSourceEvidence";
import {CodeSource} from "../../services/programming-assistant/source";
import {orientInvestigation} from "../../services/programming-assistant/navigation";
import {validateReportClaims} from "../../services/programming-assistant/claim-validation";
import {creditNoteRecoveryChecklist} from "../../services/programming-assistant/credit-note-recovery";
import {diagnose} from "../../services/programming-assistant/diagnose";
import type {SupportTicket,SupportDiagnosis} from "../../shared/programming-support";
const version="a".repeat(40);
const ticket={version,module:"grupos",title:"No puedo hacer una nota de crédito",actual:"Intenté hacer una nota de crédito desde un grupo y apareció un error. Después fui a Facturación y quedó pendiente de conciliar.",expected:"Poder anular la factura y saber cómo continuar.",messages:[]} as SupportTicket;
const source=()=>new CodeSource(process.cwd(),version);
const reply=(content:unknown)=>({usage:{total_tokens:500,prompt_tokens:300},choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify(content)}}]});
const corrected=():SupportDiagnosis=>({summary:"Hay un circuito para revisar y recuperar la NC existente desde Facturación. El estado pendiente no identifica por sí solo la causa del fallo.",cause:"No se conoce el error exacto de esta operación; los guards de eliminación de pagos no permiten inferirlo.",certainty:"sustentado_en_codigo",proposal:"Consultar en Facturación el detalle de la NC pendiente y su error. Revisar la opción Reintentar y conciliar sobre esa misma NC; no crear otra mientras se verifica el estado. Si persiste el error, copiar el mensaje exacto para distinguir rechazo fiscal de conciliación local.",questions:[],dataRepair:"",proposedTests:[],limitations:["Inspección estática, sin registros del incidente ni pruebas ejecutadas."],evidence:[{...sourceRange("server/billing/routes.ts",'app.post("/api/billing/credit-notes/:id/reconcile"',0,56),explanation:"Handler de recuperación que deriva a la operación del grupo o reserva."},{...sourceRange("client/src/pages/billing.tsx","Reintentar y conciliar",8,2),explanation:"Botón sobre la NC pendiente."},{...sourceRange("server/billing/groupCreditRecovery.ts",'if (nc.estado === "autorizacion_pendiente")',2,30),explanation:"Recuperación con el identificador de la NC existente."}]});

it.each(["grupos","facturacion"])("orients the actual pending-NC report to recovery and its screen (%s)",async module=>{
 const s=source(),orientation=await orientInvestigation({...ticket,module} as SupportTicket,s);
 expect(orientation.coverageChecklist).toEqual(creditNoteRecoveryChecklist);
 expect(orientation.decisionBrief?.checks.map(c=>c.id)).toEqual(["recovery_route","group_identity","error_detail","recovery_screen"]);
 const code=orientation.workflowReads.map(read=>read.content).join("\n");
 for(const term of ["recoverGroupCreditNote", "recoveryInvoiceId: ncId", "reconciliation_error", "Reintentar y conciliar", "/reconcile", "lists the group pending NC outside date filters"])expect(code).toContain(term);
 expect(orientation.workflowReads.every(ref=>s.validates(ref))).toBe(true);
});
it("rejects the complete real wrong-workflow report even though its cited lines were read",async()=>{
 const s=source();for(const ref of wrong.evidence)await s.read(ref.path,ref.start,ref.end);
 expect(wrong.evidence.every(ref=>s.validates(ref))).toBe(true);
 expect(await validateReportClaims(wrong as SupportDiagnosis,s,creditNoteRecoveryChecklist)).toEqual(expect.arrayContaining([expect.objectContaining({code:"RECOVERY_WORKFLOW_NOT_SUPPORTED",missing:{backend:true,screen:true}})]));
 let audits=0,writes=0;
 const client={chat:{completions:{create:async(req:any)=>{if(req.response_format.json_schema.name==="maran_diagnosis_audit")audits++;else writes++;return reply(wrong);}}}};
 await expect(diagnose(ticket,s,{apiKey:"unused",model:"mock"},client as any)).rejects.toMatchObject({code:"evidence_claim_mismatch"});
 expect(writes).toBe(3);expect(audits).toBe(0);
});
it("requires the corrected workflow citations and still passes the full correction to independent audit",async()=>{
 const s=source();for(const ref of wrong.evidence)await s.read(ref.path,ref.start,ref.end);
 let writes=0,audits=0;
 const client={chat:{completions:{create:async(req:any)=>{
  if(req.response_format.json_schema.name==="maran_diagnosis_audit"){
   audits++;const payload=JSON.parse(req.messages[1].content);
   expect(payload.case.actual).toBe(ticket.actual);
   expect(payload.evidence.decisionBrief.checks.map((c:any)=>c.id)).toContain("recovery_route");
   expect(req.messages[0].content).toContain("NC pendiente informada");
   expect(payload.evidence.citedCode.map((r:any)=>r.path)).toContain("client/src/pages/billing.tsx");
   return reply({approved:true,issues:[]});
  }
  writes++;
  if(writes===1)return reply(wrong);
  expect(JSON.stringify(req.messages)).toContain("RECOVERY_WORKFLOW_NOT_SUPPORTED");
  return reply(corrected());
 }}}};
 const result=await diagnose(ticket,s,{apiKey:"unused",model:"mock"},client as any);
 expect(writes).toBe(2);expect(audits).toBe(1);expect(result.report.validationStatus).toBe("complete");
 expect(result.report.proposal).toBe(corrected().proposal);
});
it("does not impose this workflow on first-time issuance or ordinary payment deletion",async()=>{
 for(const actual of ["Quiero hacer mi primera nota de crédito sobre una factura.","Necesito eliminar un pago del grupo."]){
  const orientation=await orientInvestigation({...ticket,title:"Consulta",actual,expected:"Orientación"},source());
  expect(orientation.coverageChecklist).not.toEqual(creditNoteRecoveryChecklist);
 }
});

it.each(["spa","restaurant"])("does not transfer group/reservation recovery conclusions to %s",async module=>{
 const orientation=await orientInvestigation({...ticket,module} as SupportTicket,source());
 expect(orientation.coverageChecklist).not.toEqual(creditNoteRecoveryChecklist);
 expect(orientation.workflowReads.some(r=>r.path==="server/billing/groupCreditRecovery.ts")).toBe(false);
});
it("does not transfer the group flow to a SPA case filed under billing",async()=>{
 const orientation=await orientInvestigation({...ticket,module:"facturacion",actual:"Una NC de SPA quedó pendiente de conciliar."} as SupportTicket,source());
 expect(orientation.coverageChecklist).not.toEqual(creditNoteRecoveryChecklist);
});

it("does not infer a group/reservation when the source of the pending NC is absent",async()=>{
 const orientation=await orientInvestigation({...ticket,module:"facturacion",title:"Nota de crédito",actual:"La NC quedó pendiente de conciliar.",expected:"Cómo sigo"} as SupportTicket,source());
 expect(orientation.coverageChecklist).not.toEqual(creditNoteRecoveryChecklist);
});

it.each(["hipotesis","falta_informacion"] as const)("does not hide the wrong workflow by changing only certainty to %s",async certainty=>{
 const issues=await validateReportClaims({...wrong,certainty} as SupportDiagnosis,source(),creditNoteRecoveryChecklist);
 expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code:"RECOVERY_WORKFLOW_NOT_SUPPORTED"})]));
});
