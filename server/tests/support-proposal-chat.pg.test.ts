import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {describe,it,expect,vi} from 'vitest';
vi.mock('../../services/programming-assistant/codex-investigator',()=>({investigateWithCodex:vi.fn(async()=>({report:{summary:'Problema sintético',certainty:'sustentado_en_codigo',recommendedAction:'code_change',validationStatus:'complete',cause:'Validación sintética',proposal:'Presentar el mensaje',proposedTests:['Comprobar mensaje'],questions:[],limitations:['Proveedor simulado'],dataRepair:':null',evidence:[{path:'server/example.ts',start:1,end:1,explanation:'Fixture'}]},tokens:100,calls:1,readFiles:['server/example.ts'],searches:[],investigator:{engine:'codex',requestedModel:'synthetic-model',effectiveModel:'synthetic-model',providerTurns:3,inputTokens:70,cachedInputTokens:0,outputTokens:30}}))}));
import {investigateWithCodex} from '../../services/programming-assistant/codex-investigator';
import {investigationCase} from '../../services/programming-assistant/context';
import {createService} from '../../services/programming-assistant/service';
const suite=process.env.DATABASE_URL?describe:describe.skip;
suite('real proposal review through the assistant service with simulated inference',()=>{
 it('persists a bound proposal, enforces reviewer access and invalidates approval on new information',async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!/test/.test(url.pathname))throw Error('Local test DB required');
  const root=new pg.Client({connectionString:url.toString()});await root.connect();const schema='support_chat_'+randomUUID().replaceAll('-','');await root.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema}`);
  const config={databaseUrl:url.toString(),secret:'synthetic-support-secret-'.repeat(3),version:'a'.repeat(40),sourceRoot:process.cwd(),apiKey:'synthetic-key',model:'synthetic-model',engine:'codex' as const,codexTransport:'responses' as 'responses'|'sdk',codexPaidEnabled:true,proposalReview:true};
  const service=await createService(config),server=service.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const req=async(route:string,body?:unknown,reviewer=false)=>{const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${config.secret}`,'X-Support-User':reviewer?'reviewer':'owner','X-Support-Version':config.version,'X-Support-Mode':'codex','X-Support-Reviewer':String(reviewer),'X-Support-View-All':String(reviewer),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  try {
   const created=await req('/cases',{requestId:randomUUID(),title:'Consulta sintética',module:'otro',actual:'Error sintético',expected:'Ver detalle',page:'/example'}),id=created.data.id;
   await req(`/cases/${id}/analyze`,{requestId:randomUUID()});await service.tick();
   const ticket=(await req('/cases',undefined,true)).data[0];expect(ticket.changeCandidate.kind).toBe('proposal');expect(ticket.investigator.effectiveModel).toBe('synthetic-model');
   expect(vi.mocked(investigateWithCodex).mock.calls[0][2]).toMatchObject({transport:'responses',groundScreen:true,maxResearchTools:10});
   const decision={requestId:randomUUID(),candidateId:ticket.changeCandidate.id,digest:ticket.changeCandidate.digest,reportId:ticket.reportId,decision:'approve',comment:'Preparar para revisar'};
   expect((await req(`/cases/${id}/decision`,decision)).status).toBe(403);
   const approved=await req(`/cases/${id}/decision`,decision,true);expect(approved.status).toBe(200);expect(approved.data.changeCandidate.status).toBe('approved_for_preparation');expect(approved.data.status).toBe('proposal_ready');
   expect((await req(`/cases/${id}/decision`,decision,true)).status).toBe(200);
   await req(`/cases/${id}/messages`,{requestId:randomUUID(),text:'Dato nuevo del caso'});
   expect((await req('/cases')).data[0].changeCandidate.status).toBe('invalidated');
   expect((await req(`/cases/${id}/decision`,{...decision,requestId:randomUUID()},true)).status).toBe(409);
   await req(`/cases/${id}/analyze`,{requestId:randomUUID()});config.codexTransport='sdk';await service.tick();
   expect(investigateWithCodex).toHaveBeenCalledTimes(1);expect((await req('/cases')).data[0].status).toBe('failed');
  }finally{await new Promise<void>(r=>server.close(()=>r()));await service.stop();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
 });

 it.each(['no_change','verification'] as const)('carries human adjustments into the next persisted investigation and creates no code candidate for %s',async recommendedAction=>{
  vi.mocked(investigateWithCodex).mockClear();
  const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!/test/.test(url.pathname))throw Error('Local test DB required');
  const root=new pg.Client({connectionString:url.toString()});await root.connect();const schema='support_conclusion_'+randomUUID().replaceAll('-','');await root.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema}`);
  const config={databaseUrl:url.toString(),secret:'synthetic-support-secret-'.repeat(3),version:'a'.repeat(40),sourceRoot:process.cwd(),apiKey:'synthetic-key',model:'synthetic-model',engine:'codex' as const,codexTransport:'responses' as const,codexPaidEnabled:true,proposalReview:true};
  const service=await createService(config),server=service.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const req=async(route:string,body?:unknown)=>{const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${config.secret}`,'X-Support-User':'reviewer','X-Support-Version':config.version,'X-Support-Mode':'codex','X-Support-Reviewer':'true','X-Support-View-All':'true','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  try{
   const created=await req('/cases',{requestId:randomUUID(),title:'Corrección ya implementada',module:'inventario',actual:'Mensaje de receta',expected:'Conservar el detalle',page:'/inventory'}),id=created.data.id;
   await req(`/cases/${id}/analyze`,{requestId:randomUUID()});await service.tick();
   const first=(await req('/cases')).data[0];expect(first.changeCandidate.status).toBe('awaiting_review');
   const comment='La corrección ya está implementada. Retirá la reparación sin evidencia de una falla pendiente.';
   expect((await req(`/cases/${id}/decision`,{requestId:randomUUID(),candidateId:first.changeCandidate.id,digest:first.changeCandidate.digest,reportId:first.reportId,decision:'revise',comment})).status).toBe(200);
   vi.mocked(investigateWithCodex).mockImplementationOnce(async(ticket)=>{
    expect(investigationCase(ticket).reviewFeedback.at(-1)?.comment).toBe(comment);
    return {report:{...first.report,recommendedAction,proposal:'',summary:'La corrección ya está implementada.'},tokens:100,calls:1,readFiles:['server/example.ts'],searches:[]};
   });
   expect((await req(`/cases/${id}/analyze`,{requestId:randomUUID()})).status).toBe(200);await service.tick();
   const next=(await req('/cases')).data[0];expect(next.report.recommendedAction).toBe(recommendedAction);expect(next.reportId).not.toBe(first.reportId);
   expect(next.changeCandidate.id).toBe(first.changeCandidate.id);expect(next.changeCandidate.status).toBe('invalidated');
   expect(next.workflowEvents.filter((event:any)=>event.kind==='prepared')).toHaveLength(1);
   expect(vi.mocked(investigateWithCodex)).toHaveBeenCalledTimes(2);
   await req('/cases');await service.tick();expect(vi.mocked(investigateWithCodex)).toHaveBeenCalledTimes(2);
  }finally{await new Promise<void>(r=>server.close(()=>r()));await service.stop();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
 });

});
