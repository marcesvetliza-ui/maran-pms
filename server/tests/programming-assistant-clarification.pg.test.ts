import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {it,expect,describe} from 'vitest';
import {createService} from '../../services/programming-assistant/service';
import {operationalQuestions} from '../../shared/programming-support-clarification';
const enabled=!!process.env.DATABASE_URL&&process.env.ALLOW_DESTRUCTIVE_PG_TESTS==='true';
if(enabled){const u=new URL(process.env.DATABASE_URL!);if(!['127.0.0.1','localhost'].includes(u.hostname)||!/test/i.test(u.pathname))throw Error('Disposable local test DB required');}
describe.skipIf(!enabled)('Assistant clarification in dedicated disposable schema',()=>{
 it('stores questions without publishing an unaudited report and resumes after the saved reply',async()=>{
  const url=new URL(process.env.DATABASE_URL!),schema='assistant_clarify_'+randomUUID().replaceAll('-','');
  const admin=new pg.Client({connectionString:url.toString()});await admin.connect();await admin.query(`CREATE SCHEMA "${schema}"`);url.searchParams.set('options',`-c search_path=${schema}`);
  const secret='synthetic-only-secret-'.repeat(3),version='a'.repeat(40);let runs=0;
  const report={summary:'Mock completed diagnosis',certainty:'hipotesis' as const,cause:'',proposal:'',questions:[],proposedTests:[],dataRepair:'',limitations:[],evidence:[]};
  const service=await createService({databaseUrl:url.toString(),secret,version,sourceRoot:process.cwd(),apiKey:'mock',model:'mock',dailyLimit:10},async ticket=>{runs++;if(runs===2)expect(ticket.messages?.some(m=>m.text.includes('10049'))).toBe(true);return {report,...(runs===1?{clarification:operationalQuestions({missing:['exact_error']})}:{}),tokens:100,calls:0,readFiles:[],searches:[]};});
  const server=service.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  async function request(path:string,body?:any){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json','X-Support-User':'synthetic','X-Support-Version':version},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
  try{
   const created=await request('/cases',{requestId:randomUUID(),title:'NC pendiente',module:'grupos',actual:'Apareció un error al emitir una NC',expected:'Anular factura'});const id=created.body.id;
   expect((await request(`/cases/${id}/analyze`,{requestId:randomUUID()})).status).toBe(200);await service.tick();let ticket=(await request('/cases')).body[0];expect(ticket.status).toBe('needs_info');expect(ticket.report).toBeNull();expect(ticket.reportId).toBeUndefined();expect(ticket.clarification.questions[0]).toContain('mensaje exacto');expect(runs).toBe(1);
   expect((await request(`/cases/${id}/analyze`,{requestId:randomUUID()})).status).toBe(409);expect(runs).toBe(1);
   const reply={requestId:randomUUID(),text:'Error 10049: fechas del servicio'};
   expect((await request(`/cases/${id}/messages`,reply)).status).toBe(200);expect((await request(`/cases/${id}/messages`,reply)).status).toBe(200);expect(runs).toBe(1);
   expect((await request(`/cases/${id}/analyze`,{requestId:randomUUID()})).status).toBe(200);await service.tick();ticket=(await request('/cases')).body[0];expect(ticket.status).toBe('proposal_ready');expect(ticket.clarification).toBeUndefined();expect(ticket.report.summary).toBe(report.summary);expect(runs).toBe(2);expect(ticket.messages.filter((m:any)=>m.author==='user')).toHaveLength(1);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await service.stop();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
 });
});
