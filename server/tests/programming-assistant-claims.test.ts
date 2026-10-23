// These protocol tests isolate the earlier stages. Semantic review has its own
// tests with explicit reject/approve responses and independent request checks.
vi.mock('../../services/programming-assistant/semantic-audit',async(importOriginal)=>({...await importOriginal<typeof import("../../services/programming-assistant/semantic-audit")>(),auditDiagnosis:vi.fn(async()=>({approved:true,issues:[],tokens:0}))}));
import {it,expect,vi} from 'vitest';
import {CodeSource} from '../../services/programming-assistant/source';
import {validateReportClaims} from '../../services/programming-assistant/claim-validation';
import {diagnose} from '../../services/programming-assistant/diagnose';
import type {SupportDiagnosis,SupportTicket} from '../../shared/programming-support';
const source=()=>new CodeSource(process.cwd(),'a'.repeat(40));
const report=(patch:Partial<SupportDiagnosis>={}):SupportDiagnosis=>{
 const result:SupportDiagnosis={summary:'El endpoint PATCH /api/reservations/:id verifica disponibilidad.',certainty:'sustentado_en_codigo',cause:'',proposal:'',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence:[],...patch};
 result.evidence=result.evidence.map(({path,start,end,explanation})=>({path,start,end,explanation}));return result;
};
it('rejects the real wrong module citation even if every cited line was read',async()=>{
 const s=source();const read=await s.read('server/routes.ts',559,584);
 const r=report({evidence:[{...read,explanation:'El endpoint PATCH revisa cambios de habitación y fechas.'}]});
 expect(s.validates(r.evidence[0])).toBe(true);
 const issues=await validateReportClaims(r,s);
 expect(issues[0]).toMatchObject({code:'ENDPOINT_CITATION_MISMATCH',expected:{method:'PATCH',endpoint:'/api/reservations/:id'}});
});
it('accepts a citation inside the actual handler without demanding its header in the citation',async()=>{
 const s=source();const match=(await s.search('app.patch("/api/reservations/:id"','server/routes/reservations.ts')).matches[0];
 const read=await s.read(match.path,match.line+5,match.line+15);
 expect(await validateReportClaims(report({evidence:[{...read,explanation:'El endpoint PATCH valida la reserva.'}]}),s)).toEqual([]);
});
it.each([
 'Se confirmaron pruebas unitarias para checkOverbooking.',
 'La función checkOverbooking está documentada y probada en tests unitarios.',
])('requires real assertion evidence for %s',async(summary)=>{
 const s=source();const read=await s.read('server/tests/room-availability.test.ts',12,31);
 const issues=await validateReportClaims(report({summary,evidence:[{...read,explanation:'Pruebas de fechas contiguas'}]}),s);
 expect(issues.some(issue=>issue.code==='TESTED_SYMBOL_WITHOUT_ASSERTION' && issue.symbol==='checkOverbooking')).toBe(true);
});
it('does not confuse the pure availability function with storage or the PATCH',async()=>{
 const s=source();const read=await s.read('server/tests/room-availability.test.ts',12,31);
 expect(await validateReportClaims(report({summary:'Hay pruebas unitarias para isRoomAvailableForInterval. No demuestran el PATCH completo.',evidence:[{...read,explanation:'expect(isRoomAvailableForInterval(...)).toBe(true) para fechas contiguas'}]}),s)).toEqual([]);
});
it('does not demand proof of a positive test claim when the text explicitly says it was not verified',async()=>{
 expect(await validateReportClaims(report({summary:'No se encontraron pruebas unitarias para checkOverbooking en los fragmentos revisados.'}),source())).toEqual([]);
});
it('does not use investigator tests as proof of hotel operations',async()=>{
 const s=source();const read=await s.read('server/tests/programming-assistant-navigation.test.ts',1,60);
 const issues=await validateReportClaims(report({summary:'Hay pruebas unitarias para checkOverbooking.',evidence:[{...read,explanation:'Navegación del investigador'}]}),s);
 expect(issues.some(issue=>issue.code==='TESTED_SYMBOL_WITHOUT_ASSERTION')).toBe(true);
});
it('rejects a model that repeatedly presents the wrong route as verified',async()=>{
 const s=source();const read=await s.read('server/routes.ts',559,584);
 const wrong=report({evidence:[{...read,explanation:'El endpoint PATCH rechaza superposición.'}]});
 let requests=0;
 const client={chat:{completions:{create:async()=>{requests++;return {choices:[{message:{role:'assistant',content:JSON.stringify(wrong)}}]};}}}};
 await expect(diagnose({version:s.version} as SupportTicket,s,{apiKey:'unused',model:'mock'},client as any)).rejects.toMatchObject({code:'evidence_claim_mismatch'});
 expect(requests).toBe(3);
});
it('lets correction cite the right route and the actual tested pure function before final review',async()=>{
 const s=source();const wrongRead=await s.read('server/routes.ts',559,584);
 const match=(await s.search('app.patch("/api/reservations/:id"','server/routes/reservations.ts')).matches[0];
 const rightRead=await s.read(match.path,match.line,match.line+15);
 const testRead=await s.read('server/tests/room-availability.test.ts',12,31);
 const wrong=report({summary:'PATCH /api/reservations/:id. Se confirmaron pruebas unitarias para checkOverbooking.',evidence:[{...wrongRead,explanation:'El endpoint PATCH valida disponibilidad.'}]});
 const corrected=report({summary:'PATCH /api/reservations/:id valida disponibilidad; hay pruebas unitarias para isRoomAvailableForInterval, no para todo el guardado.',evidence:[{...rightRead,explanation:'El endpoint PATCH inicia las validaciones.'},{...testRead,explanation:'La prueba de función pura admite checkout coincidente con ingreso.'}]});
 let requests=0;
 const client={chat:{completions:{create:async(request:any)=>{
  const current=requests++;
  if(current===1)expect(JSON.parse(request.messages.at(-1).content).claimErrors.some((issue:any)=>issue.code==='ENDPOINT_CITATION_MISMATCH')).toBe(true);
  return {choices:[{message:{role:'assistant',content:JSON.stringify(current===0?wrong:corrected)}}]};
 }}}};
 const result=await diagnose({version:s.version} as SupportTicket,s,{apiKey:'unused',model:'mock'},client as any);
 expect(requests).toBe(2);expect(result.report.summary).toBe(corrected.summary);
 expect(result.semanticAudits).toBe(1);
});

it('does not treat descriptive nouns as code symbols or require assertions for proposed work',async()=>{
 expect(await validateReportClaims(report({summary:'Hay pruebas unitarias para reglas de fechas.',proposal:'Agregar pruebas unitarias para checkOverbooking.'}),source())).toEqual([]);
});
