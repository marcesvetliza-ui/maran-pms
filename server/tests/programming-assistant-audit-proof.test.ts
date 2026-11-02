import {expect,it} from 'vitest';
import historicalReceived from './fixtures/assistant-nc-cae-as-missing-dates.json';
import { bindFiscalRecoveryEvidence } from './helpers/assistantSourceEvidence';
const received = bindFiscalRecoveryEvidence(historicalReceived);
import {CodeSource} from '../../services/programming-assistant/source';
import {auditDiagnosis,prepareAudit} from '../../services/programming-assistant/semantic-audit';
import {diagnose} from '../../services/programming-assistant/diagnose';
import {creditNoteRecoveryChecklist,fiscalDatesRecoveryRequirement} from '../../services/programming-assistant/credit-note-recovery';
import type {SupportDiagnosis,SupportTicket} from '../../shared/programming-support';
import {auditFailureReason} from '../../services/programming-assistant/errors';
const version='a'.repeat(40),coverage=[...creditNoteRecoveryChecklist,fiscalDatesRecoveryRequirement];
const ticket={version,module:'grupos',title:'NC pendiente de grupo',actual:'Se informó error 10049 en los campos de fechas fiscales.',expected:'Entender cómo continuar sin otra NC.',messages:[]} as SupportTicket;
const corrected:SupportDiagnosis={...received,summary:'Esta revisión construye las fechas antes de autorizar. No se determinó la causa del rechazo histórico.',cause:'La aplicación local exige estado emitida, CAE de 14 dígitos y conciliación pendiente. Esas condiciones no prueban qué fechas fueron enviadas ni si faltaron en el incidente.',proposal:'Conservar la identidad de la NC. No se identificó un defecto que justifique modificar su persistencia. Contrastar el intento histórico antes de decidir una reparación.',certainty:'hipotesis',proposedTests:[],limitations:['Sólo inspección de código, sin pruebas ejecutadas ni registros del incidente.'],evidence:received.evidence.map(ref=>({...ref,explanation:ref.path.includes('groupCreditRecovery')?'El guard local leído comprueba estado, CAE y conciliación; no demuestra ausencia de fechas en el envío.':ref.path.includes('wsfevClient')?'Construcción o serialización de fechas en esta revisión, sin acreditar el envío histórico.':'Parte del circuito leído, sin acreditar el resultado del incidente.'}))};
const response=(content:unknown)=>({usage:{total_tokens:500,prompt_tokens:300},choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(content)}}]});
async function setup(){const source=new CodeSource(process.cwd(),version);for(const ref of received.evidence)await source.read(ref.path,ref.start,ref.end);return source;}
function checks(payload:any){
 const evidenceIndex=payload.evidence.proofReferences.findIndex((ref:any)=>{
  const collection=ref.collection==='decisionBriefReadings'?payload.evidence.decisionBrief.readings:payload.evidence[ref.collection];
  return collection[ref.index]?.content.includes('nc?.estado !== "emitida"');
 });
 expect(evidenceIndex).toBeGreaterThanOrEqual(0);
 return [
  {topic:'causal_inference',statementId:'cause_1_1',reason:'Estado pendiente y falta de CAE no permiten inferir ausencia de fechas XML.',counterexample:'Un envío con fechas válidas puede quedar sin CAE por una falla de red. No afirmamos que haya ocurrido.',supported:true},
  {topic:'repair_and_action',statementId:'proposal_1_1',reason:'Revisar la condición y la identidad no exige reparar datos no inspeccionados.',counterexample:'Si la consulta confirma autorización, se aplica la identidad existente, no una NC nueva.',supported:true},
  {topic:'test_preconditions',statementId:'proposal_1_1',reason:'No impone reproducir 10049 sólo por dejar el CAE vacío.',counterexample:'El guard local y la respuesta fiscal son etapas distintas.',supported:true},
 ].map(check=>({...check,evidenceIndex,codeQuote:'nc?.estado !== "emitida"'}));
}
async function run(verdict:(p:any)=>unknown){const source=await setup();const client={chat:{completions:{create:async(req:any)=>response(verdict(JSON.parse(req.messages[1].content)))}}};return auditDiagnosis(ticket,received,source,client as any,{model:'mock',signal:AbortSignal.timeout(10000),remainingTokens:100000,coverageChecklist:coverage});}
it('requires three explicit proof checks in the fiscal review schema, within the existing output and budget',async()=>{
 const source=await setup(),prepared=await prepareAudit(ticket,received,source,coverage);
 expect(prepared.request.max_completion_tokens).toBe(3200);
 expect(prepared.request.response_format.json_schema.schema.required).toContain('checks');
 expect(prepared.request.messages[0].content).toContain('condición necesaria con una suficiente');
});
it('rejects the old blanket approval without independent checks',async()=>{
 await expect(run(()=>({approved:true,issues:[]}))).rejects.toMatchObject({code:'evidence_audit_invalid',auditReason:'incomplete_checks'});
});
it.each(['duplicate','wrong_statement','false_quote','null_quote','missing_basis','ignored_rejection','unrelated_issue'] as const)('fails closed on malformed or inconsistent proof: %s',async mode=>{
 await expect(run(payload=>{
  const proof=checks(payload);let approved=true;let issues:any[]=[];
  if(mode==='duplicate')proof[2].topic=proof[1].topic;
  if(mode==='wrong_statement')proof[0].statementId='cause_999_1';
  if(mode==='false_quote')proof[0].codeQuote='invented date validation';
  if(mode==='null_quote')(proof[0] as any).evidenceIndex=null;
  if(mode==='missing_basis'){(proof[0] as any).evidenceIndex=null;proof[0].codeQuote='';}
  if(mode==='ignored_rejection')proof[0].supported=false;
  if(mode==='unrelated_issue'){approved=false;proof[0].supported=false;issues=[{statementId:'proposal_1_1',problem:'Otro problema.',correction:'Revisar.'}];}
  return {approved,issues,checks:proof};
 })).rejects.toMatchObject({code:'evidence_audit_invalid'});
});
it('uses the new real report as a rejected audit followed by full correction and an independent re-audit',async()=>{
 const source=await setup();let writes=0,audits=0;
 const client={chat:{completions:{create:async(req:any)=>{
  if(req.response_format.json_schema.name==='maran_diagnosis_audit'){
   audits++;const payload=JSON.parse(req.messages[1].content),proof=checks(payload);
   if(audits===1){
    expect(payload.diagnosis.statements.find((s:any)=>s.field==='cause').text).toContain('por lo tanto falta el CAE y las fechas');
    proof[0].supported=false;
    return response({approved:false,checks:proof,issues:[{statementId:'cause_1_1',problem:'Sin CAE no implica sin fechas XML: el guard local sólo comprueba autorización y estado.',correction:'No atribuir fechas ausentes o guardado corrupto sin evidencia; revisar también la preparación de las pruebas propuestas.'}]});
   }
   expect(payload.diagnosis.statements.find((s:any)=>s.field==='cause').text).toBe(corrected.cause);
   return response({approved:true,checks:proof,issues:[]});
  }
  writes++;
  if(writes>1)expect(JSON.stringify(req.messages)).toContain('Sin CAE no implica sin fechas XML');
  return response(writes===1?received:corrected);
 }}}};
 const result=await diagnose(ticket,source,{apiKey:'unused',model:'mock'},client as any);
 expect(writes).toBe(2);expect(audits).toBe(2);
 expect(result.report.validationStatus).toBe('complete');expect(result.report.cause).toBe(corrected.cause);
});

it('requires the same proof review for the original consultation without any fiscal code or date keyword',async()=>{
 const source=await setup();
 const original={...ticket,title:'No puedo hacer una nota de crédito',actual:'Intenté hacer una nota de crédito desde un grupo y apareció un error. Después fui a Facturación y quedó pendiente de conciliar.',expected:'Poder anular la factura y saber cómo continuar.'};
 const prepared=await prepareAudit(original,received,source,creditNoteRecoveryChecklist);
 expect(prepared.request.response_format.json_schema.schema.required).toContain('checks');
 expect(prepared.request.messages[0].content).toContain('condición necesaria con una suficiente');
 expect(prepared.request.messages[0].content).not.toContain('date_builder');
});
it.each(['incomplete_checks','invalid_check_reference','inconsistent_checks'])('keeps only bounded audit failure categories in diagnostics: %s',auditReason=>{
 expect(auditFailureReason({auditReason})).toBe(auditReason);
 expect(auditFailureReason({auditReason:'private reviewer reasoning'})).toBeUndefined();
});
