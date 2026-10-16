import {it,expect} from 'vitest';
import {CodeSource} from '../../services/programming-assistant/source';
import {attachAssertionFragments} from '../../services/programming-assistant/assertion-fragments';
import {citedScreens} from '../../shared/programming-support-scope';
import {diagnosisSchema,type SupportDiagnosis} from '../../shared/programming-support';
const source=()=>new CodeSource(process.cwd(),'a'.repeat(40));
const report=(evidence:SupportDiagnosis['evidence']):SupportDiagnosis=>({summary:'Inspección',certainty:'hipotesis',cause:'',proposal:'',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence});
it('attaches exact source assertions with ranges rather than model-generated examples',async()=>{
 const s=source();await s.read('server/tests/room-availability.test.ts',12,31);
 const r=report([{path:'server/tests/room-availability.test.ts',start:12,end:31,explanation:'Función pura de disponibilidad',assertionFragments:[{start:1,end:1,code:'forged',partial:false}]}]);
 await attachAssertionFragments(r,s);
 const excerpts=r.evidence[0].assertionFragments!;
 expect(excerpts).toHaveLength(3);
 expect(excerpts[2].code).toContain('id: "checkout"');
 expect(excerpts[2].code).toContain('.toBe(true)');
 expect(excerpts[0].code).toContain('expect(isRoomAvailableForInterval');
 expect(excerpts[0].code).toContain('.toBe(true)');
 expect(excerpts[1].code).toContain('.toBe(false)');
 expect(excerpts.every(fragment=>fragment.start>=12 && fragment.end<=31 && !fragment.partial)).toBe(true);
 expect(excerpts.some(fragment=>fragment.code.includes('forged'))).toBe(false);
 expect(()=>diagnosisSchema.parse(r)).not.toThrow();
});
it('does not read or enrich an uncited range and removes untrusted excerpts',async()=>{
 const r=report([{path:'server/tests/room-availability.test.ts',start:12,end:31,explanation:'Sin lectura',assertionFragments:[{start:1,end:1,code:'forged',partial:false}]}]);
 await attachAssertionFragments(r,source());
 expect(r.evidence[0].assertionFragments).toBeUndefined();
});
it('does not label investigator tests as operational assertion evidence',async()=>{
 const s=source();await s.read('server/tests/programming-assistant-navigation.test.ts',1,60);
 const r=report([{path:'server/tests/programming-assistant-navigation.test.ts',start:1,end:60,explanation:'Navegación'}]);
 await attachAssertionFragments(r,s);expect(r.evidence[0].assertionFragments).toBeUndefined();
});
it('bounds total assertion output and distinguishes cited Planning from Reservations and helpers',async()=>{
 const s=source();await s.read('server/tests/room-availability.test.ts',12,31);
 const r=report(Array.from({length:12},()=>({path:'server/tests/room-availability.test.ts',start:12,end:31,explanation:'Aserciones'})));
 await attachAssertionFragments(r,s);
 expect(r.evidence.flatMap(ref=>ref.assertionFragments || []).reduce((sum,fragment)=>sum+fragment.code.length,0)).toBeLessThanOrEqual(10000);
 expect(citedScreens(report([{path:'client/src/components/planning-reservation-detail.tsx',start:99,end:115,explanation:'Catch'},{path:'client/src/lib/queryClient.ts',start:1,end:40,explanation:'Transporte'}]))).toEqual(['Planning']);
});
