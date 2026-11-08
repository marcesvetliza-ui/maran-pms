import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe,it,expect,vi } from 'vitest';
vi.mock('../../services/programming-assistant/codex-investigator',()=>({investigateWithCodex:vi.fn(async()=>({report:{summary:'Informe simulado para probar la integración',certainty:'hipotesis',cause:'Fixture',proposal:'Revisar',questions:[],proposedTests:[],dataRepair:'',limitations:[],evidence:[]},tokens:100,calls:0,readFiles:[],searches:[],investigator:{engine:'codex',requestedModel:'synthetic-model',effectiveModel:null,providerTurns:1,inputTokens:50,cachedInputTokens:0,outputTokens:50}}))}));
import { investigateWithCodex } from '../../services/programming-assistant/codex-investigator';
import { createService } from '../../services/programming-assistant/service';
const suite=process.env.DATABASE_URL?describe:describe.skip;
suite('Codex explicit configuration before any paid invocation',()=>{
 it('blocks missing enablement or mode agreement and persists investigator metadata only after opt-in',async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!/test/.test(url.pathname))throw Error('Local test DB required');
  const root=new pg.Client({connectionString:url.toString()});await root.connect();const schema='codex_config_'+randomUUID().replaceAll('-','');await root.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema}`);
  const config={databaseUrl:url.toString(),secret:'synthetic-shared-secret-'.repeat(3),version:'a'.repeat(40),sourceRoot:process.cwd(),apiKey:'synthetic-key',model:'synthetic-model',engine:'codex' as const,codexPaidEnabled:false};
  let service=await createService(config),server=service.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));let base=`http://127.0.0.1:${(server.address() as any).port}`;
  const request=async(route:string,body?:unknown,mode?:string)=>{const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${config.secret}`,'X-Support-User':'synthetic','X-Support-Version':config.version,'Content-Type':'application/json',...(mode?{'X-Support-Mode':mode}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  try {
   const created=await request('/cases',{requestId:randomUUID(),title:'Consulta sintética',module:'otro',actual:'Error sintético de prueba',expected:'Ver una respuesta de prueba'});const id=created.data.id;
   expect((await request(`/cases/${id}/analyze`,{requestId:randomUUID()},'codex')).status).toBe(409);expect(investigateWithCodex).not.toHaveBeenCalled();
   await new Promise<void>(r=>server.close(()=>r()));await service.stop();service=await createService({...config,codexPaidEnabled:true});server=service.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}`;
   for(const mode of [undefined,'legacy','simulation'])expect((await request(`/cases/${id}/analyze`,{requestId:randomUUID()},mode)).status).toBe(409);
   expect(investigateWithCodex).not.toHaveBeenCalled();
   vi.mocked(investigateWithCodex).mockResolvedValueOnce({report:{summary:'Falta aclarar el pago',certainty:'falta_informacion',cause:'',proposal:'',questions:[],proposedTests:[],dataRepair:'',limitations:[],evidence:[]},clarification:{facts:[],questions:['¿El pago anterior correspondía a alojamiento?']},tokens:50,calls:0,readFiles:[],searches:[]});
   expect((await request(`/cases/${id}/analyze`,{requestId:randomUUID()},'codex')).status).toBe(200);await service.tick();
   expect((await request('/cases')).data[0].messages).toEqual(expect.arrayContaining([expect.objectContaining({author:'assistant',text:'¿El pago anterior correspondía a alojamiento?'})]));
   await request(`/cases/${id}/messages`,{requestId:randomUUID(),text:'Sí'});
   expect((await request(`/cases/${id}/analyze`,{requestId:randomUUID()},'codex')).status).toBe(200);await service.tick();
   expect(vi.mocked(investigateWithCodex).mock.calls[1][0].messages).toEqual(expect.arrayContaining([expect.objectContaining({author:'assistant',text:'¿El pago anterior correspondía a alojamiento?'}),expect.objectContaining({author:'user',text:'Sí'})]));
   const ticket=(await request('/cases')).data[0];expect(ticket.investigator).toMatchObject({engine:'codex',requestedModel:'synthetic-model',effectiveModel:null});expect(ticket.changeCandidate).toBeUndefined();expect(investigateWithCodex).toHaveBeenCalledTimes(2);
   await service.pool.query('UPDATE support_cases SET data=$2 WHERE id=$1',[id,{...ticket,status:'queued',queuedInvestigatorMode:'legacy'}]);
   await service.tick();expect(investigateWithCodex).toHaveBeenCalledTimes(2);expect((await request('/cases')).data[0].status).toBe('failed');
   await new Promise<void>(r=>server.close(()=>r()));await service.stop();
   await root.query(`UPDATE ${schema}.support_cases SET data=$2 WHERE id=$1`,[id,{...ticket,status:'queued',queuedInvestigatorMode:'codex',queuedRequestedModel:'synthetic-model'}]);
   service=await createService(config);server=service.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}`;
   await service.tick();expect(investigateWithCodex).toHaveBeenCalledTimes(2);expect((await request('/cases')).data[0].status).toBe('failed');
  } finally {await new Promise<void>(r=>server.close(()=>r()));await service.stop();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
 });
});
