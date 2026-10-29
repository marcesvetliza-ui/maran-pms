import {describe,it,expect,vi} from 'vitest';
import {diagnosticTargets,diagnosticRead,probeBillingIncident} from '../billing/incidentDiagnostic';
function reader(config:any, invoices:any[]=[]) {
  return {query:vi.fn(async(sql:string)=>({rows:sql.includes('FROM reservations')?[{invoices}]:sql.includes('FROM billing_config')?[config]:[]}))};
}
const config={arca_ambiente:'homologacion',punto_venta_homolog:5,arca_ta_token:'PRIVATE_TOKEN',arca_ta_sign:'PRIVATE_SIGN',arca_cuit:'20123456789',arca_ta_ambiente:'homologacion',arca_ta_expiry:new Date(Date.now()+3600000)};
describe('bounded read-only billing incident diagnosis',()=>{
 it('rejects unbounded targets',()=>{
  expect(()=>diagnosticTargets(['205','1005'],'2026-10-29')).not.toThrow();
  for(const rooms of [[],['205','205'],['205','1005','3'],['205;DELETE']]) expect(()=>diagnosticTargets(rooms,'2026-10-29')).toThrow();
  expect(()=>diagnosticTargets(['205'],'2026-02-30')).toThrow();
 });
 it('rolls back even when a read fails',async()=>{
  const c={query:vi.fn(async(sql:string)=>{if(sql==='SELECT broken')throw Error('db');return {rows:[]}})};
  await expect(diagnosticRead(c,'SELECT broken')).rejects.toThrow('db');
  expect(c.query.mock.calls.map(x=>x[0])).toEqual(['BEGIN READ ONLY',"SET LOCAL statement_timeout='5s'","SET LOCAL lock_timeout='1s'",'SELECT broken','ROLLBACK']);
 });
 it.each([null,'invalid',new Date(0)])('does not use an invalid or expired ticket: %s',async(expiry)=>{
  const fetcher=vi.fn();
  await probeBillingIncident(reader({...config,arca_ta_expiry:expiry}),['205'],'2026-10-29',fetcher);
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('does not call fiscal production',async()=>{
  const fetcher=vi.fn();
  await probeBillingIncident(reader({...config,arca_ambiente:'produccion'}),['205'],'2026-10-29',fetcher);
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('only queries last numbers and redacts provider faults',async()=>{
  const c=reader(config);
  const fetcher=vi.fn(async()=>new Response('<soap:Fault><faultstring>PRIVATE_TOKEN PRIVATE_SIGN 20123456789 authentication failed</faultstring></soap:Fault>',{status:500}));
  const result=await probeBillingIncident(c,['205','1005'],'2026-10-29',fetcher as typeof fetch);
  expect(fetcher).toHaveBeenCalledTimes(2);
  for(const call of fetcher.mock.calls as any[]) {
   expect(call[0]).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx');
   expect(call[1].body).toContain('<ar:FECompUltimoAutorizado>');
   expect(call[1].body).not.toContain('FECAESolicitar');
  }
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_TOKEN|PRIVATE_SIGN|20123456789/);
  expect(result.provider[0]).toMatchObject({ok:false,httpStatus:500,fault:'[hidden] [hidden] [hidden] authentication failed'});
  for(const [sql] of c.query.mock.calls) expect(sql).toMatch(/^(SELECT|BEGIN READ ONLY|SET LOCAL|ROLLBACK)/);
  const snapshot=c.query.mock.calls.find(([sql])=>sql.includes('FROM reservations'))!;
  expect((snapshot as any)[1]).toEqual([['205','1005'],'2026-10-29']);
 });
});
