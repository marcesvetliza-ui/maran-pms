import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { CodeSource } from '../../services/programming-assistant/source';
import { investigateWithCodex } from '../../services/programming-assistant/codex-investigator';
import { investigationCase } from '../../services/programming-assistant/context';
import { prepareAudit } from '../../services/programming-assistant/semantic-audit';
import {feedbackReviewSchema,validFeedbackReview} from '../../services/programming-assistant/codex-protocol';
import { recommendationIssues } from '../../services/programming-assistant/conclusion';
import { prepareReviewedProposal } from '../../services/programming-assistant/change-workflow';
import type { SupportDiagnosis, SupportTicket } from '../../shared/programming-support';
import { sourceRange } from './helpers/assistantSourceEvidence';

const received=JSON.parse(readFileSync('services/programming-assistant/evaluation/already-implemented-received.json','utf8'));
const version='a'.repeat(40);
const ref=sourceRange('client/src/pages/inventory.tsx','const detail = parseApiErrorPayload(error)?.error',1,6);
const ticket={version,title:received.title,module:'inventario',actual:received.actual,expected:received.expected,messages:[],workflowEvents:[{kind:'revise',comment:received.reviewComment,at:'2026-11-12'}]} as unknown as SupportTicket;
const bad:SupportDiagnosis={...received.receivedReport,recommendedAction:'code_change',evidence:[{...ref,explanation:'El catch actual presenta el detalle recibido.'}]};
const corrected:SupportDiagnosis={...bad,summary:'La corrección original ya está implementada: el mensaje de equivalencia se conserva.',recommendedAction:'no_change',proposal:'',cause:'El catch muestra el error recibido. El fallback genérico conserva el comportamiento pedido para errores no interpretables.'};
const step=(action:string,extra:any={})=>({action,path:null,term:null,prefix:null,start:null,end:null,question:null,missing:null,report:null,...extra});

it('includes the actual review comment in both investigation and independent audit, with checkable repair reasoning',async()=>{
 const source=new CodeSource(process.cwd(),version);await source.read(ref.path,ref.start,ref.end);
 expect(investigationCase(ticket).reviewFeedback[0].comment).toBe(received.reviewComment);
 const prepared=await prepareAudit(ticket,bad,source);
 expect(JSON.parse(prepared.payload).case.reviewFeedback[0].comment).toBe(received.reviewComment);
 expect(prepared.requireChecks).toBe(true);
 expect(prepared.request.response_format.json_schema.schema.required).toContain('checks');
 expect(prepared.request.messages[0].content).toContain('fallback deliberado');
 expect(prepared.request.messages[0].content).toContain('repair_and_action');
});

it('retains adjustments through a read, a rejected speculative change, correction and independent re-review (simulated provider)',async()=>{
 const source=new CodeSource(process.cwd(),version);
 const checks=(supported:boolean)=>[{topic:'cause',field:'cause',supported:true},{topic:'repair',field:'proposal',supported},{topic:'tests',field:'cause',supported:true}].map(check=>({...check,reason:'El catch presenta el error recibido.',counterexample:'El error ya se presenta; no hace falta otra reparación.',evidenceIndex:0,codeQuote:'const detail = parseApiErrorPayload(error)?.error'}));
 const answers=[step('read_code',{path:ref.path,start:ref.start,end:ref.end}),step('report',{report:bad}),{approved:false,issues:['La corrección ya está implementada. El pedido de ajustes exige retirar esa mejora sin defecto demostrado.'],checks:checks(false)},step('report',{report:corrected}),{approved:true,issues:[],checks:checks(true)}];
 const run=vi.fn(async(prompt:string)=>{
  if(run.mock.calls.length===1)expect(prompt).toContain(received.reviewComment);
  if(run.mock.calls.length===3||run.mock.calls.length===5){
   const payload=JSON.parse(prompt.split('\n').find(line=>line.startsWith('{'))!);
   expect(payload.case.reviewFeedback[0].comment).toBe(received.reviewComment);
  }
  return {text:JSON.stringify(answers.shift()),usage:{input:100,output:50,cachedInput:0}};
 });
 const result=await investigateWithCodex(ticket,source,{apiKey:'synthetic',model:'simulated'},async()=>({session:()=>({run}),close:async()=>{}}));
 expect(result.report).toMatchObject({recommendedAction:'no_change',validationStatus:'complete',proposal:''});
 expect(result.semanticAudits).toBe(2);expect(run).toHaveBeenCalledTimes(5);
 expect(()=>prepareReviewedProposal({...ticket,status:'proposal_ready',reportId:'current',report:result.report})).toThrow();
});

it('requires code evidence and a demonstrated gap before describing a code change',()=>{
 expect(recommendationIssues({...bad,certainty:'hipotesis'})).toHaveLength(1);
 expect(recommendationIssues({...bad,evidence:[]})).toHaveLength(1);
 expect(recommendationIssues(corrected)).toEqual([]);
 expect(recommendationIssues({...bad,cause:'El catch descarta e.message.',proposal:'Mostrar el error del servidor.'})).toEqual([]);
});
it('keeps the received report outside the live investigator catalog',async()=>{
 expect((await new CodeSource(process.cwd(),version).files()).some(file=>file.includes('already-implemented-received'))).toBe(false);
});

it('rejects feedback reviews with an unproved check, fake quote, duplicate topic or absent evidence',()=>{
 const checks=[{topic:'cause',field:'cause'},{topic:'repair',field:'proposal'},{topic:'tests',field:'cause'}].map(check=>({...check,supported:true,reason:'Respaldado',counterexample:'Ya se muestra el mensaje',evidenceIndex:0,codeQuote:'presenta el error'}));
 const valid=feedbackReviewSchema.parse({approved:true,issues:[],checks});
 expect(validFeedbackReview(valid,[{content:'El catch presenta el error recibido'}])).toBe(true);
 for(const patch of [{supported:false},{codeQuote:'inventado'},{evidenceIndex:null},{topic:'cause'}]){
  const invalid=feedbackReviewSchema.parse({...valid,checks:valid.checks.map((check,i)=>i===1?{...check,...patch}:check)});
  expect(validFeedbackReview(invalid,[{content:'El catch presenta el error recibido'}])).toBe(false);
 }
});
