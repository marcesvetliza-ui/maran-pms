import {it,expect} from 'vitest';
import {safeRejectedReviews,supportCreateSchema} from './programming-support';
const draft={summary:'Borrador no aprobado',cause:'Causa propuesta',proposal:'Propuesta cuestionada',certainty:'hipotesis',questions:[],proposedTests:[],dataRepair:'',limitations:[],evidence:[{path:'shared/example.ts',start:1,end:2,explanation:'Referencia consultada',assertionFragments:[{start:1,end:2,code:'SOURCE_CODE_NOT_TO_STORE',partial:false}]}]};
const entry={audit:1,draft,issues:[{statementId:'proposal_1_1',problem:'La afirmación no está respaldada.',correction:'Acotar la conclusión.'}]};
it('keeps a bounded rejected draft separate from an approved report, without source excerpts',()=>{
 const result=safeRejectedReviews([entry,{...entry,audit:2},entry]);
 expect(result).toHaveLength(2);expect(result[0].draft.validationStatus).toBe('incomplete');expect(result[0].issues[0].problem).toBe(entry.issues[0].problem);expect(JSON.stringify(result)).not.toContain('SOURCE_CODE_NOT_TO_STORE');
});
it('refuses forged statement references and oversized or raw provider material',()=>{
 expect(safeRejectedReviews([{...entry,issues:[{...entry.issues[0],statementId:'proposal_99_1'}]}])).toEqual([]);
 expect(safeRejectedReviews([{...entry,issues:[{...entry.issues[0],statementId:'proposal_1_2'}]}])).toEqual([]);
 expect(safeRejectedReviews([{...entry,issues:[{...entry.issues[0],problem:'x'.repeat(601)}]}])).toEqual([]);
 expect(safeRejectedReviews([{...entry,rawProviderResponse:'PRIVATE'}])).toEqual([]);
 expect(supportCreateSchema.safeParse({requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'Consulta de prueba',module:'inventario',actual:'Caso de prueba',expected:'Revisar',rejectedReviews:[entry]}).success).toBe(false);
});
