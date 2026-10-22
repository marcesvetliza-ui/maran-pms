import {it,expect} from 'vitest';
import {diagnose} from '../../services/programming-assistant/diagnose';
import {CodeSource} from '../../services/programming-assistant/source';
import {operationalQuestions} from '../../shared/programming-support-clarification';
import {safeStageEvents} from '../../services/programming-assistant/lifecycle';
import {semanticFailureDetails,auditFailureReason} from '../../services/programming-assistant/errors';
import type {SupportTicket} from '../../shared/programming-support';
const version='a'.repeat(40);
const ticket={version,module:'grupos',title:'No puedo hacer una nota de crédito',actual:'Intenté hacer una NC desde un grupo y apareció un error. Quedó pendiente de conciliar.',expected:'Poder anular la factura y saber cómo continuar.',messages:[]} as unknown as SupportTicket;
const tool=(argumentsValue:unknown)=>({usage:{total_tokens:950,prompt_tokens:900},choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'ask',type:'function',function:{name:'request_operational_detail',arguments:JSON.stringify(argumentsValue)}}]}}]});
it('asks a fixed operational question before any diagnosis or audit with one provider call',async()=>{
 let calls=0;
 const client={chat:{completions:{create:async(request:any)=>{calls++;expect(request.messages[0].content).toContain('dato operativo indispensable');expect(request.tools.some((t:any)=>t.function.name==='request_operational_detail')).toBe(true);return tool({missing:['exact_error']});}}}};
 const result=await diagnose(ticket,new CodeSource(process.cwd(),version),{apiKey:'unused',model:'mock'},client as any);
 expect(calls).toBe(1);expect(result.tokens).toBe(950);expect(result.semanticAudits).toBe(0);expect(result.clarification?.facts).toEqual(['exact_error']);expect(result.clarification?.questions[0]).toContain('mensaje exacto');expect(result.report.evidence).toEqual([]);expect(result.report.cause).toBe('');expect(result.report.proposal).toBe('');expect(safeStageEvents(result.stages)).toEqual(expect.arrayContaining([expect.objectContaining({stage:'clarification',outcome:'completed'})]));
});
it('accepts only operational facts, never model-provided actions or technical questions',()=>{
 expect(()=>operationalQuestions({missing:['technical_source_path']})).toThrow();
 expect(()=>operationalQuestions({missing:['exact_error'],questions:['Emití otra factura']})).toThrow();
 expect(()=>operationalQuestions({missing:[]})).toThrow();
 expect(()=>operationalQuestions({missing:['exact_error']},['exact_error'])).toThrow();
 expect(operationalQuestions({missing:['exact_error','exact_error']})).toEqual(operationalQuestions({missing:['exact_error']}));
});
it('rejects repeated requests and passes user replies back to the model',async()=>{
 let calls=0;
 const followup={...ticket,clarification:operationalQuestions({missing:['exact_error']}),messages:[{id:'reply',author:'user',text:'Error 10049: faltan fechas del servicio',createdAt:new Date().toISOString()}]};
 const client={chat:{completions:{create:async(request:any)=>{
  calls++;if(calls===1){expect(JSON.stringify(request.messages)).toContain('10049');return tool({missing:['exact_error']});}
  expect(JSON.stringify(request.messages)).toContain('no repitas');throw Error('stop after repetition guard');
 }}}};
 await expect(diagnose(followup,new CodeSource(process.cwd(),version),{apiKey:'unused',model:'mock'},client as any)).rejects.toThrow('stop after repetition guard');expect(calls).toBe(2);
});
it('records rejection locations without diagnosis text, corrections, code or user data',()=>{
 const value={auditReason:'semantic_rejected',semanticRejections:[{audit:1,statements:['proposal_1_1','secret text'],fields:['proposal','private field'],problem:'private problem',correction:'private fix'},{audit:2,statements:['summary_1_1'],fields:['summary']}]};
 expect(auditFailureReason(value)).toBe('semantic_rejected');expect(semanticFailureDetails(value)).toEqual([{audit:1,statements:['proposal_1_1'],fields:['proposal']},{audit:2,statements:['summary_1_1'],fields:['summary']}]);expect(JSON.stringify(semanticFailureDetails(value))).not.toContain('private');
});

it('cannot turn an audit rejection into clarification or a published report',async()=>{
 const source=new CodeSource(process.cwd(),version);await source.read('server/billing/routes.ts',1672,1684);
 const draft={summary:'El código rechaza un importe mayor al saldo facturable; no se inspeccionaron registros del incidente.',certainty:'sustentado_en_codigo',cause:'Se valida el saldo facturable del cargo.',proposal:'Consultar comprobantes y Caja para conocer el resultado real.',proposedTests:[],questions:[],dataRepair:'',limitations:['La lectura estática no determina facturas ni cobros reales.'],evidence:[{path:'server/billing/routes.ts',start:1672,end:1684,explanation:'El servidor rechaza importes que superan el saldo facturable.'}]};
 let audits=0,attempted=false;
 const response=(v:any)=>({usage:{total_tokens:1000,prompt_tokens:500},choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(v)}}]});
 const client={chat:{completions:{create:async(req:any)=>{
  if(req.response_format.json_schema.name==='maran_diagnosis_audit'){audits++;return response({approved:false,issues:[{statementId:'proposal_1_1',problem:'Synthetic rejection',correction:'Synthetic correction'}]});}
  if(audits===1&&!attempted){attempted=true;expect(req.tools).toBeUndefined();return tool({missing:['exact_error']});}
  return response(draft);
 }}}};
 await expect(diagnose({...ticket,title:'Dos operadores facturan',actual:'El cargo ya no tiene saldo suficiente para facturar'},source,{apiKey:'unused',model:'mock'},client as any)).rejects.toMatchObject({code:'evidence_semantic_rejected',semanticAudits:2,auditReason:'semantic_rejected',semanticRejections:[{audit:1,statements:['proposal_1_1'],fields:['proposal']},{audit:2,statements:['proposal_1_1'],fields:['proposal']}]});
 expect(attempted).toBe(true);expect(audits).toBe(2);
});
