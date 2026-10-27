import {sourceRange} from "./helpers/assistantSourceEvidence";
// These protocol tests isolate the earlier stages. Semantic review has its own
// tests with explicit reject/approve responses and independent request checks.
vi.mock('../../services/programming-assistant/semantic-audit',async(importOriginal)=>({...await importOriginal<typeof import("../../services/programming-assistant/semantic-audit")>(),auditDiagnosis:vi.fn(async()=>({approved:true,issues:[],tokens:0}))}));
import {it,expect,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CodeSource} from '../../services/programming-assistant/source';
import {checkErrorAttribution} from '../../services/programming-assistant/attribution';
import {diagnose} from '../../services/programming-assistant/diagnose';
import type {SupportDiagnosis,SupportTicket} from '../../shared/programming-support';
const source=()=>new CodeSource(process.cwd(),'a'.repeat(40));
const conversion=sourceRange('server/inventoryUnits.ts','export function convertInventoryQuantity',1,5);
const equivalence=sourceRange('shared/inventoryUnits.ts','export function inventoryUnitFactor',0,10);
async function readEvidence(s:CodeSource){for(const ref of [conversion,equivalence])await s.read(ref.path,ref.start,ref.end);}
const report=(cause:string):SupportDiagnosis=>({summary:'El catch muestra un error genérico.',certainty:'sustentado_en_codigo',cause,proposal:'Usar el parser existente',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence:[{...conversion,explanation:'Conversión numérica'},{...equivalence,explanation:'Validación de equivalencias'}]});

it.each([
 'La función convertInventoryQuantity usa equivalencias. Esta función lanza un error específico cuando no encuentra equivalencia explícita.',
 'convertInventoryQuantity arroja un error con mensaje Falta equivalencia explícita de from a to para este artículo.',
 'El endpoint mediante convertInventoryQuantity arroja un error 409 si falta una equivalencia necesaria.',
])('rejects the actual repeated misattribution: %s',async(cause)=>{
 const s=source();const errors=await checkErrorAttribution(report(cause),s);
 expect(errors).toHaveLength(1);
 expect(errors[0]).toMatchObject({field:'cause',attributedSymbol:'convertInventoryQuantity',origin:{symbol:'inventoryUnitFactor',path:'shared/inventoryUnits.ts'}});
 expect(errors[0].origin.statement).toContain('throw fail(`Falta equivalencia explícita');
 expect(s.validates(errors[0].origin)).toBe(true);
});
it('checks explanation fields too, and does not accept a wrong hypothesis as a workaround',async()=>{
 const r=report('');r.certainty='hipotesis';r.evidence[0].explanation='convertInventoryQuantity lanza Falta equivalencia explícita.';
 expect((await checkErrorAttribution(r,source()))[0].field).toBe('evidence.0.explanation');
});
it.each([
 'inventoryUnitFactor lanza Falta equivalencia explícita, invocada por unitFactor. convertInventoryQuantity multiplica cantidades.',
 'convertInventoryQuantity no busca la equivalencia ni lanza Falta equivalencia explícita. El origen está en inventoryUnitFactor.',
 'El mensaje Falta equivalencia explícita no proviene de convertInventoryQuantity.',
 'convertInventoryQuantity lanza Cantidad o equivalencia inválida cuando recibe valores numéricos inválidos.',
])('preserves correct distinctions: %s',async(cause)=>{
 expect(await checkErrorAttribution(report(cause),source())).toEqual([]);
});
it('derives the origin from source rather than a hardcoded function name',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'attribution-'));
 try{
  await mkdir(path.join(root,'server'));
  await writeFile(path.join(root,'server/inventoryUnits.ts'),"export function lookup(){\n throw fail('Falta equivalencia explícita');\n}\nexport function multiply(){return 1;}");
  const errors=await checkErrorAttribution(report('multiply lanza Falta equivalencia explícita.'),new CodeSource(root,'a'.repeat(40)));
  expect(errors[0].origin.symbol).toBe('lookup');
 }finally{await rm(root,{recursive:true,force:true});}
});
it('does not publish a stubborn model answer after repeated attribution failures',async()=>{
 const s=source();await readEvidence(s);
 const wrong=report('convertInventoryQuantity lanza un error si falta equivalencia explícita.');
 let requests=0;
 const client={chat:{completions:{create:async()=>{requests++;return {choices:[{message:{role:'assistant',content:JSON.stringify(wrong)}}]};}}}};
 await expect(diagnose({version:s.version} as SupportTicket,s,{apiKey:'unused',model:'mock'},client as any)).rejects.toMatchObject({code:'evidence_attribution'});
 expect(requests).toBe(3);
});
it('feeds the direct throw to correction and then accepts a corrected, reviewed report',async()=>{
 const s=source();await readEvidence(s);
 const wrong=report('convertInventoryQuantity lanza un error si falta equivalencia explícita.');
 const corrected=report('inventoryUnitFactor lanza Falta equivalencia explícita; convertInventoryQuantity multiplica cantidades.');
 corrected.evidence=[{...conversion,explanation:'Conversión numérica'},{...equivalence,explanation:'Origen del mensaje'}];
 let requests=0;
 const client={chat:{completions:{create:async(request:any)=>{
  const current=requests++;
  if(current===1){const feedback=JSON.parse(request.messages.at(-1).content);expect(feedback.attributionErrors[0].origin.symbol).toBe('inventoryUnitFactor');}
  return {choices:[{message:{role:'assistant',content:JSON.stringify(current===0?wrong:corrected)}}]};
 }}}};
 const result=await diagnose({version:s.version} as SupportTicket,s,{apiKey:'unused',model:'mock'},client as any);
 expect(requests).toBe(2);expect(result.report.cause).toBe(corrected.cause);
 expect(result.semanticAudits).toBe(1);
 expect(result.report.certainty).toBe('sustentado_en_codigo');
});
