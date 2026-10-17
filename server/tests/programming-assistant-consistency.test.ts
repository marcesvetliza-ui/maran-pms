// These protocol tests isolate the earlier stages. Semantic review has its own
// tests with explicit reject/approve responses and independent request checks.
vi.mock('../../services/programming-assistant/semantic-audit',()=>({auditDiagnosis:vi.fn(async()=>({approved:true,issues:[],tokens:0}))}));
import {it,expect,vi} from 'vitest';
import {financialConsistencyIssues} from '../../services/programming-assistant/consistency';
import {diagnose} from '../../services/programming-assistant/diagnose';
import {CodeSource} from '../../services/programming-assistant/source';
import type {SupportDiagnosis,SupportTicket} from '../../shared/programming-support';
const report=(patch:Partial<SupportDiagnosis>={}):SupportDiagnosis=>({summary:'El 409 corresponde a la validación de saldo del cargo.',certainty:'sustentado_en_codigo',cause:'',proposal:'Revisar comprobantes y Caja, sin repetir el cobro.',proposedTests:[],questions:[],dataRepair:'',limitations:['No se consultaron registros operativos.'],evidence:[],...patch});
it('rejects the actual recommendation despite the later disclaimer about unknown real payments',()=>{
 const r=report({proposal:'La persona debe interpretar que sólo una factura fue emitida y que no existe doble cobro. Debe consultar Caja para confirmar.',limitations:['No se dispone de registros operativos para verificar si hubo un doble cobro.']});
 expect(financialConsistencyIssues(r).some(issue=>issue.code==='UNVERIFIED_OPERATIONAL_OUTCOME')).toBe(true);
});
it('does not accept an unsupported operational assertion as a hypothesis either',()=>{
 expect(financialConsistencyIssues(report({summary:'No hubo doble cobro.',certainty:'hipotesis'}))[0].code).toBe('UNVERIFIED_OPERATIONAL_OUTCOME');
});
it('rejects describing a read simulated test as a real issuance',()=>{
 expect(financialConsistencyIssues(report({summary:'La prueba leída simula concurrencia con locks y confirma que sólo se produce una emisión real y un estado 409.'})).some(issue=>issue.code==='SIMULATED_TEST_AS_REAL_ISSUANCE')).toBe(true);
});
it.each([
 'En caso de duda o anomalías, reintentar la emisión o consultar soporte con detalles del operationId y estado guardado.',
 'Verifique Caja y reintente la emisión si es necesario.',
])('rejects a fresh issuance suggested merely because state is uncertain: %s',proposal=>{
 expect(financialConsistencyIssues(report({proposal})).some(issue=>issue.code==='REISSUE_WHILE_STATE_UNKNOWN')).toBe(true);
});
it.each([
 'El 409 no permite afirmar que no existe doble cobro; revisar comprobantes y Caja.',
 'El código intenta impedir doble facturación. No se sabe cuántos cobros quedaron en el caso real.',
 'La prueba con mocks no acredita una emisión real ni el resultado de Caja.',
 'Ante la duda, no reintentar la emisión. Consultar el estado antes de operar.',
 'Si hay una operación pendiente, recuperar esa misma operación sin crear otra.',
 'Antes de reintentar la emisión, verificar el estado y recuperar la misma operación pendiente.',
])('preserves a scoped explanation and recovery guidance: %s',proposal=>{
 expect(financialConsistencyIssues(report({proposal}))).toEqual([]);
});
it('leaves nonfinancial inventory retry advice outside this financial gate',()=>{
 expect(financialConsistencyIssues(report({summary:'Receta sin equivalencia.',proposal:'Ante la duda, reintentar la vista previa.',limitations:[]}))).toEqual([]);
});
it('does not publish a model that insists on the contradictory conclusion',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));await source.read('server/billing/routes.ts',1672,1684);
 const wrong=report({proposal:'No existe doble cobro.',evidence:[{path:'server/billing/routes.ts',start:1672,end:1684,explanation:'Validación de saldo para rechazar una facturación excesiva'}]});
 let requests=0;
 const client={chat:{completions:{create:async()=>{requests++;return {choices:[{message:{role:'assistant',content:JSON.stringify(wrong)}}]};}}}};
 await expect(diagnose({version:source.version} as SupportTicket,source,{apiKey:'unused',model:'mock'},client as any)).rejects.toMatchObject({code:'evidence_inconsistent'});
 expect(requests).toBe(3);
});
it('returns a corrected and reviewed report after showing the explicit consistency error',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));await source.read('server/billing/routes.ts',1672,1684);
 const evidence=[{path:'server/billing/routes.ts',start:1672,end:1684,explanation:'Validación de saldo para rechazar una facturación excesiva'}];
 const wrong=report({proposal:'No existe doble cobro.',evidence});
 const corrected=report({proposal:'No se puede confirmar cuántos cobros hubo. Revisar comprobantes y Caja; recuperar la misma operación si está pendiente.',evidence});
 let requests=0;
 const client={chat:{completions:{create:async(request:any)=>{
  const current=requests++;
  if(current===1)expect(JSON.parse(request.messages.at(-1).content).consistencyErrors[0].code).toBe('UNVERIFIED_OPERATIONAL_OUTCOME');
  return {choices:[{message:{role:'assistant',content:JSON.stringify(current===0?wrong:corrected)}}]};
 }}}};
 expect((await diagnose({version:source.version} as SupportTicket,source,{apiKey:'unused',model:'mock'},client as any)).report.proposal).toBe(corrected.proposal);
 expect(requests).toBe(3);
});
