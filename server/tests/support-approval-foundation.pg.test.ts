import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe,it,expect,vi } from 'vitest';
import { createService } from '../../services/programming-assistant/service';
const suite=process.env.DATABASE_URL?describe:describe.skip;
suite('support approval foundation with isolated assistant database',()=>{
 it('persists user conversation, admin inbox and approval without invoking providers',async()=>{
  const url=new URL(process.env.DATABASE_URL!);
  if(!['localhost','127.0.0.1'].includes(url.hostname)||!/test/.test(url.pathname))throw Error('Local test database required');
  const root=new pg.Client({connectionString:url.toString()});await root.connect();
  const schema='support_approval_'+randomUUID().replaceAll('-','');await root.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options',`-c search_path=${schema}`);
  const config={databaseUrl:url.toString(),secret:'synthetic-shared-secret-'.repeat(3),version:'a'.repeat(40),sourceRoot:process.cwd(),model:'unused',workflowSimulation:true};
  const provider=vi.fn(async()=>{throw Error('Provider must not be called');});
  let service=await createService(config,provider);
  let server=service.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  let base=`http://127.0.0.1:${(server.address() as any).port}`;
  const req=async(path:string,actor='alice',body?:unknown,reviewer=false,mode='simulation')=>{
   const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${config.secret}`,'X-Support-User':actor,'X-Support-Version':config.version,'X-Support-Mode':mode,'Content-Type':'application/json',...(reviewer?{'X-Support-Reviewer':'true','X-Support-View-All':'true'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
   return {status:response.status,data:await response.json()};
  };
  try {
   const created=await req('/cases','alice',{requestId:randomUUID(),title:'Consulta sintética',module:'otro',actual:'El filtro de prueba no muestra el resultado',expected:'Mostrar el resultado correcto'});expect(created.status).toBe(201);const id=created.data.id;
   expect((await req('/cases','bob')).data).toEqual([]);expect((await req('/cases','marcelo',undefined,true)).data).toHaveLength(1);
   expect((await req(`/cases/${id}/messages`,'bob',{requestId:randomUUID(),text:'No es mi caso'})).status).toBe(404);
   expect((await req(`/cases/${id}/analyze`,'alice',{requestId:randomUUID()},false,'legacy')).status).toBe(409);
   expect((await req(`/cases/${id}/analyze`,'alice',{requestId:randomUUID()})).status).toBe(200);await service.tick();
   expect((await req('/cases')).data[0].status).toBe('needs_info');
   expect((await req(`/cases/${id}/messages`,'alice',{requestId:randomUUID(),text:'Espero que muestre el filtro elegido'})).status).toBe(200);
   await req(`/cases/${id}/analyze`,'alice',{requestId:randomUUID()});await service.tick();
   const ticket=(await req('/cases')).data[0],candidate=ticket.changeCandidate;expect(candidate.kind).toBe('simulation');
   const body={requestId:randomUUID(),candidateId:candidate.id,digest:candidate.digest,reportId:ticket.reportId,decision:'approve',comment:'Prueba del circuito'};
   expect((await req(`/cases/${id}/decision`,'alice',body)).status).toBe(403);
   const approved=await req(`/cases/${id}/decision`,'marcelo',body,true);expect(approved.status).toBe(200);expect(approved.data.changeCandidate.status).toBe('approved_simulation');
   expect((await req(`/cases/${id}/decision`,'marcelo',body,true)).status).toBe(200);
   expect((await req(`/cases/${id}/decision`,'marcelo',{...body,decision:'reject'},true)).status).toBe(409);
   expect((await req('/cases')).data[0].workflowEvents.filter((event:any)=>event.kind==='approve')).toHaveLength(1);
   await new Promise<void>(r=>server.close(()=>r()));await service.stop();
   service=await createService(config,provider);server=service.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}`;
   expect((await req('/cases')).data[0].changeCandidate.status).toBe('approved_simulation');
   await req(`/cases/${id}/messages`,'alice',{requestId:randomUUID(),text:'Aporto información nueva'});
   expect((await req('/cases')).data[0].changeCandidate.status).toBe('invalidated');
   expect((await req(`/cases/${id}/decision`,'marcelo',{...body,requestId:randomUUID()},true)).status).toBe(409);
   await req(`/cases/${id}/analyze`,'alice',{requestId:randomUUID()});await service.tick();
   const refreshed=(await req('/cases')).data[0];
   const nextBody={...body,requestId:randomUUID(),candidateId:refreshed.changeCandidate.id,digest:refreshed.changeCandidate.digest,reportId:refreshed.reportId};
   const competing=await Promise.all([
    req(`/cases/${id}/decision`,'marcelo',nextBody,true),
    req(`/cases/${id}/messages`,'alice',{requestId:randomUUID(),text:'Nueva información durante la revisión'}),
   ]);
   expect([200,409]).toContain(competing[0].status);expect(competing[1].status).toBe(200);
   expect((await req('/cases')).data[0].changeCandidate.status).toBe('invalidated');
   expect(provider).not.toHaveBeenCalled();
  } finally {await new Promise<void>(r=>server.close(()=>r()));await service.stop();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
 });
});
