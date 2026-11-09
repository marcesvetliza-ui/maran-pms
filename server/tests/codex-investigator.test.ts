import { supportInvestigatorMode } from '../../shared/support-investigator-mode';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { CodeSource } from '../../services/programming-assistant/source';
import { investigateWithCodex,shouldCloseInvestigation } from '../../services/programming-assistant/codex-investigator';
import { readTurn } from '../../services/programming-assistant/codex-transport';
import type { SupportTicket } from '../../shared/programming-support';
const version='a'.repeat(40),options={apiKey:'synthetic-not-a-key',model:'synthetic-test-model'};
const ticket={version,title:'Error de equivalencia',actual:'La pantalla muestra un mensaje genérico',expected:'Ver la equivalencia faltante',module:'inventario',messages:[]} as unknown as SupportTicket;
let root:string,source:CodeSource;
beforeEach(async()=>{root=await mkdtemp(path.join(tmpdir(),'codex-investigator-test-'));await mkdir(path.join(root,'server'));await writeFile(path.join(root,'server/example.ts'),'throw new Error("Falta equivalencia");\n// fixture, never executed\n');source=new CodeSource(root,version);});
afterEach(async()=>{await rm(root,{recursive:true,force:true});});
const step=(action:string,fields:Record<string,unknown>={})=>({action,path:null,term:null,prefix:null,start:null,end:null,missing:null,report:null,...fields});
const report={summary:'El código lanza un mensaje de equivalencia.',certainty:'sustentado_en_codigo',cause:'La validación construye el error.',proposal:'Revisar la presentación del error sin modificar datos.',proposedTests:['Comprobar en un entorno de pruebas'],questions:[],dataRepair:'',limitations:['No se verificó la pantalla real'],evidence:[{path:'server/example.ts',start:1,end:1,explanation:'Construye el error.'}]};
function fake(replies:unknown[]){
 const run=vi.fn(async()=>{if(!replies.length)throw Error('Unexpected provider turn');const value=replies.shift();return {text:typeof value==='string'?value:JSON.stringify(value),usage:{input:100,cachedInput:20,output:50}};});
 const close=vi.fn(async()=>{}),session=vi.fn(()=>({run}));
 return {run,close,session,factory:vi.fn(async()=>({session,close}))};
}
const read=step('read_code',{path:'server/example.ts',start:1,end:2});
it('uses real source reads and a separate review session without native tools or writes',async()=>{
 const agent=fake([read,step('report',{report}),{approved:true,issues:[]}]);
 const result=await investigateWithCodex(ticket,source,options,agent.factory);
 expect(result.report.validationStatus).toBe('complete');expect(result.calls).toBe(1);expect(result.semanticAudits).toBe(1);expect(result.tokens).toBe(450);
 expect(result.investigator).toMatchObject({engine:'codex',requestedModel:options.model,effectiveModel:null,providerTurns:3,cachedInputTokens:60});
 expect(agent.session).toHaveBeenCalledTimes(2);expect(agent.close).toHaveBeenCalledOnce();
});
it('returns an operational question instead of publishing a diagnosis',async()=>{
 const agent=fake([step('clarify',{missing:['exact_error']})]);
 const result=await investigateWithCodex(ticket,source,options,agent.factory);
 expect(result.clarification!.questions[0]).toContain('mensaje exacto');expect(result.report.certainty).toBe('falta_informacion');expect(result.semanticAudits).toBe(0);
});
it('never treats a search snippet as a read citation',async()=>{
 const agent=fake([step('search_code',{term:'equivalencia'}),step('report',{report}),step('report',{report})]);
 await expect(investigateWithCodex(ticket,source,options,agent.factory)).rejects.toMatchObject({code:'codex_provenance'});
 expect(agent.session).toHaveBeenCalledTimes(1);expect(agent.close).toHaveBeenCalledOnce();
});
it('allows one material correction and requires a fresh independent review',async()=>{
 const agent=fake([read,step('report',{report}),{approved:false,issues:['No se leyó el cliente: no atribuirle comportamiento']},step('report',{report}),{approved:true,issues:[]}]);
 const result=await investigateWithCodex(ticket,source,options,agent.factory);
 expect(result.semanticAudits).toBe(2);expect(agent.session).toHaveBeenCalledTimes(3);
});
it('stops after a second rejection instead of recursive auditing',async()=>{
 const agent=fake([read,step('report',{report}),{approved:false,issues:['Causa no demostrada']},step('report',{report}),{approved:false,issues:['Persiste el error']}]);
 await expect(investigateWithCodex(ticket,source,options,agent.factory)).rejects.toMatchObject({code:'evidence_semantic_rejected',investigation:{rounds:5,calls:1,tokens:750}});
 expect(agent.run).toHaveBeenCalledTimes(5);
});
it('rejects an inconsistent audit without interpreting rejection as approval',async()=>{
 const agent=fake([read,step('report',{report}),{approved:true,issues:['Hay una causa inventada']}]);
 await expect(investigateWithCodex(ticket,source,options,agent.factory)).rejects.toMatchObject({code:'codex_review_protocol'});
});
it('reserves the final turns and stops at a token limit before calling the provider',async()=>{
 const agent=fake([read]);
 await expect(investigateWithCodex(ticket,source,{...options,maxTokens:1000},agent.factory)).rejects.toMatchObject({code:'codex_budget'});
 expect(agent.run).not.toHaveBeenCalled();expect(agent.close).toHaveBeenCalledOnce();
});
it('rejects version mismatch before starting a Codex process',async()=>{
 const agent=fake([]);await expect(investigateWithCodex({...ticket,version:'b'.repeat(40)},source,options,agent.factory)).rejects.toThrow('revisión');expect(agent.factory).not.toHaveBeenCalled();
});
it('rejects a request to read a secret outside the source catalog',async()=>{
 const agent=fake([step('read_code',{path:'.env',start:1,end:2}),step('clarify',{missing:['where_it_happened']})]);
 const result=await investigateWithCodex(ticket,source,options,agent.factory);
 expect(result.clarification).toBeDefined();expect(source.readRanges.size).toBe(0);expect(agent.run.mock.calls[1][0]).not.toContain('SECRET_VALUE');
});
it.each(['command_execution','file_change','mcp_tool_call','web_search'])('aborts native events: %s',async type=>{
 let signal:AbortSignal|undefined;
 const thread={runStreamed:async(_prompt:string,opts:any)=>{signal=opts.signal;return {events:(async function*(){yield {type:'item.started',item:{type,id:'unexpected'}};})()};}};
 await expect(readTurn(thread as any,'synthetic request',{},new AbortController().signal)).rejects.toMatchObject({code:'codex_native_tool'});
 expect(signal!.aborted).toBe(true);
});
it('requires final usage and a completed turn rather than accepting a truncated stream',async()=>{
 const thread={runStreamed:async()=>({events:(async function*(){yield {type:'item.completed',item:{type:'agent_message',text:'{}'}};})()})};
 await expect(readTurn(thread as any,'synthetic request',{},new AbortController().signal)).rejects.toMatchObject({code:'codex_protocol'});
});

it('marks usage as incomplete when a provider turn fails before reporting consumption',async()=>{
 const session={run:vi.fn(async()=>{throw Object.assign(Error('synthetic transport failure'),{code:'codex_turn_failed'});})};
 const factory=vi.fn(async()=>({session:()=>session,close:vi.fn(async()=>{})}));
 await expect(investigateWithCodex(ticket,source,options,factory)).rejects.toMatchObject({code:'codex_turn_failed',usageIncomplete:true,knownUsage:{input:0,cachedInput:0,output:0}});
});

it('requires an explicit engine selection while simulation takes priority',()=>{
 expect(supportInvestigatorMode({})).toBe('legacy');
 expect(supportInvestigatorMode({SUPPORT_INVESTIGATOR:'codex'})).toBe('codex');
 expect(supportInvestigatorMode({SUPPORT_INVESTIGATOR:'codex',SUPPORT_WORKFLOW_SIMULATION_ENABLED:'true'})).toBe('simulation');
 expect(()=>supportInvestigatorMode({SUPPORT_INVESTIGATOR:'unknown'})).toThrow();
});

it('can ask a specific operational question rather than a fixed generic template',async()=>{
 const agent=fake([step('clarify',{question:'¿El pago anterior correspondía a alojamiento o a consumos personales?'})]);
 const result=await investigateWithCodex(ticket,source,options,agent.factory);
 expect(result.clarification).toEqual({facts:[],questions:['¿El pago anterior correspondía a alojamiento o a consumos personales?']});
});
it('provides the prior question along with a short user reply',async()=>{
 const agent=fake([step('clarify',{question:'¿Cuál es el importe del consumo que se quiere cobrar?'})]);
 await investigateWithCodex({...ticket,clarification:{facts:[],questions:['¿El pago anterior correspondía a alojamiento?']},messages:[{id:'reply',author:'user',text:'Sí',createdAt:new Date().toISOString()}]},source,options,agent.factory);
 expect(agent.run.mock.calls[0][0]).toContain('¿El pago anterior correspondía a alojamiento?');
});
it('supports the larger evaluation context and identifies the old context limit',async()=>{
 await writeFile(path.join(root,'server/example.ts'),Array.from({length:20},()=> 'x'.repeat(1000)).join('\n'));
 const reading=step('read_code',{path:'server/example.ts',start:1,end:20});
 const replies=()=>[...Array.from({length:5},()=>reading),step('clarify',{question:'¿En qué pantalla se produjo el cierre de caja?'})];
 await expect(investigateWithCodex(ticket,source,{...options,maxTokens:60000},fake(replies()).factory)).rejects.toMatchObject({code:'codex_budget',budgetReason:'author_context_limit',usageIncomplete:false});
 const result=await investigateWithCodex(ticket,source,{...options,maxTokens:60000,maxContextChars:120000},fake(replies()).factory);
 expect(result.clarification).toBeDefined();expect(result.investigator?.providerTurns).toBe(6);
});
it('reserves a closing turn and review before another tool result grows the history',()=>{
 expect(shouldCloseInvestigation(25000,30000,10000,60000)).toBe(true);
 expect(shouldCloseInvestigation(0,0,2000,60000)).toBe(false);
});
it('enforces a final report schema after the research allowance and still audits it',async()=>{
 const agent=fake([read,step('report',{report}),{approved:true,issues:[]}]);
 const result=await investigateWithCodex(ticket,source,{...options,maxTokens:60000,maxResearchTools:1},agent.factory);
 expect(result.report.validationStatus).toBe('complete');expect(result.semanticAudits).toBe(1);
 const calls=agent.run.mock.calls as unknown as Array<[string,{properties:{action:{enum:string[]}}}]>;
 expect(calls[1][1].properties.action.enum).toEqual(['clarify','report']);
});
it('does not execute a tool requested after the forced closing phase',async()=>{
 const agent=fake([read,read]);
 await expect(investigateWithCodex(ticket,source,{...options,maxTokens:60000,maxResearchTools:1},agent.factory)).rejects.toMatchObject({code:'codex_closing_protocol',usageIncomplete:false});
 expect(agent.run).toHaveBeenCalledTimes(2);
});
it('gives the exact invalid citation and verified ranges to the single repair',async()=>{
 const invalid={...report,evidence:[{...report.evidence[0],end:3}]};
 const agent=fake([read,step('report',{report:invalid}),step('report',{report}),{approved:true,issues:[]}]);
 const result=await investigateWithCodex(ticket,source,options,agent.factory);
 expect(result.report.validationStatus).toBe('complete');
 expect(agent.run.mock.calls[2][0]).toContain('unread_citation_0');
 expect(agent.run.mock.calls[2][0]).toContain('"ranges":[[1,2]]');
});
it('preserves rejected evidence diagnostics without publishing it as an approved report',async()=>{
 const invalid={...report,evidence:[{...report.evidence[0],end:3}]};
 const agent=fake([read,step('report',{report:invalid}),step('report',{report:invalid})]);
 await expect(investigateWithCodex(ticket,source,options,agent.factory)).rejects.toMatchObject({code:'codex_provenance',provenanceIssues:['unread_citation_0'],rejectedDraft:invalid,allowedReads:[{path:'server/example.ts',ranges:[[1,2]]}]});
});
it('explains when missing information requires the clarify action',async()=>{
 const agent=fake([step('report',{report:{...report,certainty:'falta_informacion',evidence:[]}}),step('clarify',{question:'¿Qué mensaje exacto apareció al cerrar la caja?'})]);
 const result=await investigateWithCodex(ticket,source,options,agent.factory);
 expect(result.clarification).toBeDefined();expect(agent.run.mock.calls[1][0]).toContain('requires_clarify_action');
});
it('passes router grounding to the author and independent reviewer without spending a provider turn on navigation',async()=>{
 await mkdir(path.join(root,'client/src/pages'),{recursive:true});
 await writeFile(path.join(root,'client/src/App.tsx'),'const Example = lazy(() => import("@/pages/example"));\n<Route path="/example" component={Example} />');
 await writeFile(path.join(root,'client/src/pages/example.tsx'),'const difference = counted - expected;');
 const agent=fake([read,step('report',{report}),{approved:true,issues:[]}]);
 const result=await investigateWithCodex({...ticket,page:'/example',actual:'El valor difference usa counted y expected'},source,{...options,groundScreen:true},agent.factory);
 expect(result.calls).toBe(1);expect(result.investigator?.providerTurns).toBe(3);
 expect(agent.run.mock.calls[0][0]).toContain('client/src/pages/example.tsx');
 expect(agent.run.mock.calls[0][0]).toContain('counted - expected');
 expect(agent.run.mock.calls[2][0]).toContain('"screen":{"page":"/example","file":"client/src/pages/example.tsx"}');
});
it('records the effective model when Responses reports it',async()=>{
 const agent=fake([read,step('report',{report}),{approved:true,issues:[]}]);const run=agent.run;
 const result=await investigateWithCodex(ticket,source,options,async()=>({session:()=>({run:async(...args:any[])=>({...await (run as any)(...args),model:'reported-model'})}),close:agent.close}));
 expect(result.investigator?.effectiveModel).toBe('reported-model');
});
