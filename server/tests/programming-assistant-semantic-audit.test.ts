import {sourceRange} from "./helpers/assistantSourceEvidence";
import {it,expect} from 'vitest';
import {CodeSource} from '../../services/programming-assistant/source';
import {auditDiagnosis,diagnosisStatements,auditReport} from '../../services/programming-assistant/semantic-audit';
import {diagnose} from '../../services/programming-assistant/diagnose';
import {financialConsistencyIssues} from '../../services/programming-assistant/consistency';
import type {SupportDiagnosis,SupportTicket} from '../../shared/programming-support';
const version='a'.repeat(40);
const capacity=sourceRange('server/billing/routes.ts','saldo suficiente para facturar',2,3);
const ticket={version,title:'Error al facturar',actual:'Dos personas intentaron facturar el mismo cargo.',expected:'Saber qué implica el rechazo y qué verificar.',module:'facturacion',messages:[]} as SupportTicket;
const unsafe='El cargo fue facturado por otra operación, por lo que no se ha duplicado la facturación ni el cobro.';
const report=(proposal=unsafe):SupportDiagnosis=>({summary:'El código valida el saldo antes de emitir. No se dispone de registros para confirmar los cobros reales.',certainty:'sustentado_en_codigo',cause:'El servidor rechaza un importe superior al saldo facturable.',proposal,proposedTests:[],questions:[],dataRepair:'',limitations:['No hay registro operativo real que pruebe ausencia de doble cobro.'],evidence:[{...capacity,explanation:'El saldo se valida antes de permitir facturar.'}]});
const rejection={approved:false,issues:[{statementId:'proposal_1_1',problem:'Afirma un resultado operativo que el resumen y las limitaciones declaran desconocido.',correction:'Separar protección implementada de hechos del incidente; consultar registros antes de concluir.'}]};
const response=(content:unknown,tokens=500)=>({usage:{total_tokens:tokens,prompt_tokens:100},choices:[{message:{role:'assistant',content:JSON.stringify(content)}}]});
async function setup(){const source=new CodeSource(process.cwd(),version);await source.read(capacity.path,capacity.start,capacity.end);return source;}
it('sends the entire report to an isolated, read-only review context',async()=>{
 const source=await setup();let calls=0;
 const client={chat:{completions:{create:async(request:any)=>{
  calls++;expect(request.response_format.json_schema.name).toBe('maran_diagnosis_audit');
  expect(request.messages).toHaveLength(2);expect(request.messages.map((m:any)=>m.role)).toEqual(['system','user']);
  expect(request.tools).toBeUndefined();
  const payload=JSON.parse(request.messages[1].content);
  expect(payload.diagnosis).toEqual(auditReport(report()));
  expect(payload.capabilities).toMatchObject({testsExecuted:false,operationalDatabaseAccess:false});
  expect(payload.evidence.citedCode[0].content).toContain('saldo suficiente para facturar');
  return response(rejection);
 }}}};
 const result=await auditDiagnosis(ticket,report(),source,client as any,{model:'mock',signal:AbortSignal.timeout(10000),remainingTokens:90000});
 expect(result.approved).toBe(false);expect(result.issues[0].quote).toBe(unsafe);expect(calls).toBe(1);
});
it('rejects reviewer references that do not belong to the actual report',async()=>{
 const source=await setup();
 const client={chat:{completions:{create:async()=>response({...rejection,issues:[{...rejection.issues[0],statementId:'proposal_999_1'}]})}}};
 await expect(auditDiagnosis(ticket,report(),source,client as any,{model:'mock',signal:AbortSignal.timeout(10000),remainingTokens:90000})).rejects.toMatchObject({code:'evidence_audit_invalid',auditTokens:500});
});
it.each([{approved:true,issues:rejection.issues},{approved:false,issues:[]}])('does not accept an internally contradictory verdict',async verdict=>{
 const source=await setup();const client={chat:{completions:{create:async()=>response(verdict)}}};
 await expect(auditDiagnosis(ticket,report(),source,client as any,{model:'mock',signal:AbortSignal.timeout(10000),remainingTokens:90000})).rejects.toMatchObject({code:'evidence_audit_invalid'});
});
it('reserves cost before requesting an audit, rather than exceeding the case budget blindly',async()=>{
 const source=await setup();let calls=0;const client={chat:{completions:{create:async()=>{calls++;return response({approved:true,issues:[]});}}}};
 await expect(auditDiagnosis(ticket,report(),source,client as any,{model:'mock',signal:AbortSignal.timeout(10000),remainingTokens:100})).rejects.toMatchObject({code:'audit_budget'});
 expect(calls).toBe(0);
});
it('does not bypass an independent rejection even when the old phrase rules miss the actual paraphrase',async()=>{
 const source=await setup();expect(financialConsistencyIssues(report())).toEqual([]);
 let writer=0,audits=0;
 const client={chat:{completions:{create:async(request:any)=>{
  if(request.response_format.json_schema.name==='maran_diagnosis_audit'){audits++;return response(rejection);}
  writer++;return response(report(),1000);
 }}}};
 await expect(diagnose(ticket,source,{apiKey:'unused',model:'mock'},client as any)).rejects.toMatchObject({code:'evidence_semantic_rejected'});
 expect(audits).toBe(2);expect(writer).toBe(2);
});
it('requires a corrected full report and a new passing audit, counting both calls in the token budget',async()=>{
 const source=await setup();const corrected=report('Consultar comprobantes y Caja para conocer el resultado real; recuperar la misma operación si sigue pendiente, sin crear otra.');
 let writer=0,audits=0;
 const client={chat:{completions:{create:async(request:any)=>{
  if(request.response_format.json_schema.name==='maran_diagnosis_audit'){audits++;return response(audits===1?rejection:{approved:true,issues:[]});}
  writer++;
  if(writer===2){
   const payload=JSON.parse(request.messages.find((m:any)=>m.role==='user').content);
   expect(payload.semanticIssues[0].statementId).toBe("proposal_1_1");
   expect(payload.diagnosis.statements.find((s:any)=>s.id==="proposal_1_1").text).toBe(unsafe);
  }
  return response(writer<2?report():corrected,1000);
 }}}};
 const result=await diagnose(ticket,source,{apiKey:'unused',model:'mock'},client as any);
 expect(result.report.proposal).toBe(corrected.proposal);expect(result.tokens).toBe(3000);expect(result.semanticAudits).toBe(2);
});
it('does not publish the unaudited recommendation when the audit response exceeds budget',async()=>{
 const source=await setup();
 const client={chat:{completions:{create:async(request:any)=>request.response_format.json_schema.name==='maran_diagnosis_audit'?response({approved:true,issues:[]},100001):response(report(),1000)}}};
 const result=await diagnose(ticket,source,{apiKey:'unused',model:'mock'},client as any);
 expect(result.report.validationStatus).toBe('incomplete');expect(result.report.summary).toContain('Revisión parcial');
 expect(JSON.stringify(result.report)).not.toContain(unsafe);expect(result.report.cause).toBe('');
 expect(result.report.evidence[0].explanation).toContain('no constituye una conclusión validada');
});
it('never converts an audit authentication failure into an approved or partial diagnostic',async()=>{
 const source=await setup();const client={chat:{completions:{create:async(request:any)=>{
  if(request.response_format.json_schema.name==='maran_diagnosis_audit')throw Object.assign(new Error('auth'),{status:401});
  return response(report());
 }}}};
 await expect(diagnose(ticket,source,{apiKey:'unused',model:'mock'},client as any)).rejects.toMatchObject({status:401});
});
it.each([
 ['output_limit',{choices:[{finish_reason:'length',message:{content:'incomplete private text'}}]}],
 ['refusal',{choices:[{message:{refusal:'private refusal'}}]}],
 ['invalid_json',{choices:[{message:{content:'not json private text'}}]}],
 ['invalid_schema',{choices:[{message:{content:'{}'}}]}],
 ['inconsistent_verdict',response({approved:false,issues:[]})],
 ['invalid_reference',response({...rejection,issues:[{...rejection.issues[0],statementId:'proposal_999_1'}]})],
])('records the bounded audit failure reason %s without reviewer content',async(reason,result)=>{
 const source=await setup();
 const client={chat:{completions:{create:async(request:any)=>{
  expect(request.max_completion_tokens).toBe(3200);
  return {...result,usage:{total_tokens:500}};
 }}}};
 await expect(auditDiagnosis(ticket,report(),source,client as any,{model:'mock',signal:AbortSignal.timeout(10000),remainingTokens:90000})).rejects.toMatchObject({code:'evidence_audit_invalid',auditReason:reason,auditTokens:500,message:'No se pudo verificar la evidencia en la auditoría de coherencia.'});
});
it('completes coverage in the mandatory audit without another expensive author pass',async()=>{
 const source=await setup();const safe=report('Consultar comprobantes y Caja para conocer los cobros reales.');
 let writer=0,audits=0;
 const client={chat:{completions:{create:async(request:any)=>{
  if(request.response_format.json_schema.name==='maran_diagnosis_audit'){audits++;return response({approved:true,issues:[]});}
  writer++;
  if(writer===1)return {...response(safe,40000),usage:{total_tokens:40000,prompt_tokens:22000}};
  expect(request.messages.filter((m:any)=>m.role==='tool')).toHaveLength(0);
  expect(request.messages.filter((m:any)=>m.role==='user')).toHaveLength(1);
  const payload=JSON.parse(request.messages[1].content);
  expect(payload.case.title).toBe(ticket.title);
  expect(payload.draft).toEqual(safe);
  expect(payload.citedCode[0].content).toContain('saldo suficiente para facturar');
  expect(payload.allowedReadRanges.length).toBeGreaterThan(0);
  expect(payload.interfaceScope).toBeDefined();
  expect(JSON.stringify(request.messages).length).toBeLessThan(32000);
  return response(safe,5000);
 }}}};
 const result=await diagnose(ticket,source,{apiKey:'unused',model:'mock'},client as any);
 expect(result.report.proposal,JSON.stringify(result.stages)).toBe(safe.proposal);
 expect(result.partialReason).toBeUndefined();
 expect(result.tokens).toBe(40500);expect(writer).toBe(1);expect(audits).toBe(1);
});
it('sends the same string limits to OpenAI that the local validator enforces',async()=>{
 const source=await setup();const draft=report();draft.summary='x'.repeat(800);
 const client={chat:{completions:{create:async(request:any)=>{
  const properties=request.response_format.json_schema.schema.properties.issues.items.properties;
  expect(properties.quote).toBeUndefined();
  expect(properties.statementId.enum).toContain('summary_1_1');
  expect(properties.problem).toMatchObject({minLength:1,maxLength:600});
  expect(properties.correction).toMatchObject({minLength:1,maxLength:600});
  return response({approved:false,issues:[{statementId:'summary_1_1',problem:'p'.repeat(600),correction:'c'.repeat(600)}]});
 }}}};
 const result=await auditDiagnosis(ticket,draft,source,client as any,{model:'mock',signal:AbortSignal.timeout(10000),remainingTokens:90000});
 expect(result.approved).toBe(false);expect(result.issues).toHaveLength(1);
});
it.each(['problem','correction'] as const)('rejects oversized %s without silently shortening or approving it',async field=>{
 const source=await setup();const issue={...rejection.issues[0],[field]:'private text '.repeat(100)};
 const client={chat:{completions:{create:async()=>response({approved:false,issues:[issue]})}}};
 await expect(auditDiagnosis(ticket,report(),source,client as any,{model:'mock',signal:AbortSignal.timeout(10000),remainingTokens:90000})).rejects.toMatchObject({
  code:'evidence_audit_invalid',auditReason:'invalid_schema',auditSchemaIssues:[{path:`issues.item.${field}`,code:'too_big'}],
 });
});
it.each([true,false])('does not start an audit without a reserve for correction and re-audit (would approve=%s)',async approved=>{
 const source=await setup();
 const refs=[
  ['server/billing/routes.ts',1664,1684],
  ['server/billing/invoiceAdvisoryLock.ts',9,21],
  ['server/tests/folio-invoice-concurrency.test.ts',219,238],
  ['client/src/lib/prefactura-submission.ts',61,69],
  ['client/src/components/PrefacturaDialog.tsx',1673,1698],
 ] as const;
 for(const [path,start,end] of refs)await source.read(path,start,end);
 const draft=report('Consultar comprobantes y Caja para conocer los cobros reales.');
 // A verbose but schema-valid report plus the actual five cited ranges makes
 // the old writer+review reservation exceed 100k at the reported 67,097 tokens.
 draft.summary='Descripción del código inspeccionado. '.repeat(75);
 draft.cause='El servidor valida el saldo facturable. '.repeat(120);
 draft.proposal='Consultar el estado persistido antes de operar. '.repeat(100);
 draft.evidence=refs.map(([path,start,end])=>({path,start,end,explanation:'Fragmento de código consultado para este diagnóstico. '.repeat(20)}));
 let writer=0,audits=0;
 const client={chat:{completions:{create:async(request:any)=>{
  if(request.response_format.json_schema.name==='maran_diagnosis_audit'){
   audits++;
   const payload=JSON.parse(request.messages[1].content);
    expect(payload.diagnosis).toEqual(auditReport(draft));
   expect(payload.evidence.coverageChecklist.length).toBeGreaterThan(0);
   expect(payload.evidence.citedCode).toHaveLength(5);
   expect(request.tools).toBeUndefined();
   return response(approved?{approved:true,issues:[]}:{approved:false,issues:[{statementId:'proposal_1_1',problem:'Falta acotar la conclusión.',correction:'Explicar lo desconocido.'}]},1500);
  }
  writer++;expect(writer).toBe(1);
  return {...response(draft,67097),usage:{total_tokens:67097,prompt_tokens:22000}};
 }}}};
 const result=await diagnose(ticket,source,{apiKey:'unused',model:'mock'},client as any);
 expect(writer).toBe(1);expect(audits).toBe(0);expect(result.tokens).toBe(67097);
 expect(result.partialReason).toBe('correction_reserve');
 expect(result.report.validationStatus).toBe('incomplete');
 expect(result.report.proposal).not.toBe(draft.proposal);
 expect(result.report.summary).toContain('Revisión parcial');
});
it('preserves all report text and array boundaries when numbering Unicode fragments',()=>{
 const draft=report();draft.summary='  Texto con tildes, comillas “exactas” y emoji 🧾.\n'.repeat(50);
 draft.questions=['Primera consulta','Segunda consulta'];draft.dataRepair='Revisar sin modificar';
 draft.evidence.push({...draft.evidence[0],explanation:'Otra explicación independiente.'});
 const result=diagnosisStatements(draft);
 expect(new Set(result.statements.map(item=>item.id)).size).toBe(result.statements.length);
 expect(result.statements.filter(item=>item.field==='summary').map(item=>item.text).join('')).toBe(draft.summary);
 expect(result.statements.filter(item=>item.field==='questions').map(item=>item.text)).toEqual(draft.questions);
 expect(result.statements.find(item=>item.field==='dataRepair')?.text).toBe(draft.dataRepair);
 for(const [index,reference] of result.evidenceReferences.entries()){
  expect(result.statements.filter(item=>reference.statementIds.includes(item.id)).map(item=>item.text).join('')).toBe(draft.evidence[index].explanation);
 }
 expect(result.statements.every(item=>Array.from(item.text).length<=800)).toBe(true);
});
it('reconstructs the original citation from a selected ID and rejects model-supplied quote replacements',async()=>{
 const source=await setup();
 const client={chat:{completions:{create:async(request:any)=>{
  const payload=JSON.parse(request.messages[1].content);
  expect(request.response_format.json_schema.schema.properties.issues.items.properties.statementId.enum)
   .toEqual(payload.diagnosis.statements.map((item:any)=>item.id));
  return response(rejection);
 }}}};
 const result=await auditDiagnosis(ticket,report(),source,client as any,{model:'mock',signal:AbortSignal.timeout(10000),remainingTokens:90000});
 expect(result.issues[0]).toMatchObject({field:'proposal',quote:unsafe});
 const forged={chat:{completions:{create:async()=>response({approved:false,issues:[{...rejection.issues[0],quote:'model paraphrase'}]})}}};
 await expect(auditDiagnosis(ticket,report(),source,forged as any,{model:'mock',signal:AbortSignal.timeout(10000),remainingTokens:90000})).rejects.toMatchObject({code:'evidence_audit_invalid',auditReason:'invalid_schema'});
});
