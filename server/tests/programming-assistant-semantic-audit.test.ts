import {it,expect} from 'vitest';
import {CodeSource} from '../../services/programming-assistant/source';
import {auditDiagnosis} from '../../services/programming-assistant/semantic-audit';
import {diagnose} from '../../services/programming-assistant/diagnose';
import {financialConsistencyIssues} from '../../services/programming-assistant/consistency';
import type {SupportDiagnosis,SupportTicket} from '../../shared/programming-support';
const version='a'.repeat(40);
const ticket={version,title:'Error al facturar',actual:'Dos personas intentaron facturar el mismo cargo.',expected:'Saber qué implica el rechazo y qué verificar.',module:'facturacion',messages:[]} as SupportTicket;
const unsafe='El cargo fue facturado por otra operación, por lo que no se ha duplicado la facturación ni el cobro.';
const report=(proposal=unsafe):SupportDiagnosis=>({summary:'El código valida el saldo antes de emitir. No se dispone de registros para confirmar los cobros reales.',certainty:'sustentado_en_codigo',cause:'El servidor rechaza un importe superior al saldo facturable.',proposal,proposedTests:[],questions:[],dataRepair:'',limitations:['No hay registro operativo real que pruebe ausencia de doble cobro.'],evidence:[{path:'server/billing/routes.ts',start:1672,end:1684,explanation:'El saldo se valida antes de permitir facturar.'}]});
const rejection={approved:false,issues:[{field:'proposal',quote:'no se ha duplicado la facturación ni el cobro',problem:'Afirma un resultado operativo que el resumen y las limitaciones declaran desconocido.',correction:'Separar protección implementada de hechos del incidente; consultar registros antes de concluir.'}]};
const response=(content:unknown,tokens=500)=>({usage:{total_tokens:tokens,prompt_tokens:100},choices:[{message:{role:'assistant',content:JSON.stringify(content)}}]});
async function setup(){const source=new CodeSource(process.cwd(),version);await source.read('server/billing/routes.ts',1672,1684);return source;}
it('sends the entire report to an isolated, read-only review context',async()=>{
 const source=await setup();let calls=0;
 const client={chat:{completions:{create:async(request:any)=>{
  calls++;expect(request.response_format.json_schema.name).toBe('maran_diagnosis_audit');
  expect(request.messages).toHaveLength(2);expect(request.messages.map((m:any)=>m.role)).toEqual(['system','user']);
  expect(request.tools).toBeUndefined();
  const payload=JSON.parse(request.messages[1].content);
  expect(payload.diagnosis).toEqual(report());
  expect(payload.capabilities).toMatchObject({testsExecuted:false,operationalDatabaseAccess:false});
  expect(payload.evidence.citedCode[0].content).toContain('saldo suficiente para facturar');
  return response(rejection);
 }}}};
 const result=await auditDiagnosis(ticket,report(),source,client as any,{model:'mock',signal:AbortSignal.timeout(10000),remainingTokens:90000});
 expect(result.approved).toBe(false);expect(result.issues[0].quote).toBe(rejection.issues[0].quote);expect(calls).toBe(1);
});
it('rejects reviewer observations that do not quote the actual report',async()=>{
 const source=await setup();
 const client={chat:{completions:{create:async()=>response({...rejection,issues:[{...rejection.issues[0],quote:'texto que no existe'}]})}}};
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
 expect(audits).toBe(2);expect(writer).toBe(3);
});
it('requires a corrected full report and a new passing audit, counting both calls in the token budget',async()=>{
 const source=await setup();const corrected=report('Consultar comprobantes y Caja para conocer el resultado real; recuperar la misma operación si sigue pendiente, sin crear otra.');
 let writer=0,audits=0;
 const client={chat:{completions:{create:async(request:any)=>{
  if(request.response_format.json_schema.name==='maran_diagnosis_audit'){audits++;return response(audits===1?rejection:{approved:true,issues:[]});}
  writer++;
  if(writer===3)expect(JSON.parse(request.messages.at(-1).content).semanticIssues[0].quote).toBe(rejection.issues[0].quote);
  return response(writer<3?report():corrected,1000);
 }}}};
 const result=await diagnose(ticket,source,{apiKey:'unused',model:'mock'},client as any);
 expect(result.report.proposal).toBe(corrected.proposal);expect(result.tokens).toBe(4000);expect(result.semanticAudits).toBe(2);
});
it('does not publish the unaudited recommendation when the audit response exceeds budget',async()=>{
 const source=await setup();
 const client={chat:{completions:{create:async(request:any)=>request.response_format.json_schema.name==='maran_diagnosis_audit'?response({approved:true,issues:[]},100001):response(report(),1000)}}};
 const result=await diagnose(ticket,source,{apiKey:'unused',model:'mock'},client as any);
 expect(result.report.certainty).toBe('falta_informacion');expect(result.report.summary).toContain('Revisión parcial');
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
