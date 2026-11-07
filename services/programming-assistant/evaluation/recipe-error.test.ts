import {it,expect,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type {SupportDiagnosis,SupportTicket} from '../../../shared/programming-support';
import {CodeSource} from '../source';
import {checkErrorAttribution} from '../attribution';
import {errorProposalCoverageIssues,errorReportReviewInstruction} from '../error-report-review';
import {diagnose} from '../diagnose';
import received from './recipe-error-received.json';
import {sourceRange} from '../../../server/tests/helpers/assistantSourceEvidence';
const wrong=received.report as SupportDiagnosis;
const ticket={version:received.sourceRevision,module:'inventario',title:'Error al cargar receta',actual:'En Consumo Interno cargo una receta en cajas sin equivalencia y aparece Error al cargar receta. No veo qué ingrediente o equivalencia falta.',expected:'Que la pantalla explique qué ingrediente no tiene equivalencia y qué configuración falta revisar. Sólo inspección.',messages:[]} as SupportTicket;
const source=()=>new CodeSource(process.cwd(),ticket.version);
const complete=():SupportDiagnosis=>({...wrong,evidence:[...wrong.evidence.slice(0,3),{...sourceRange('shared/inventoryUnits.ts','export function inventoryUnitFactor',0,12),explanation:'inventoryUnitFactor construye Falta equivalencia explícita y lanza el error; el texto indica from/to pero no incluye el nombre del artículo.'}],proposal:'Reutilizar parseApiError muestra las unidades del error existente. No incluye el nombre del ingrediente: esa identificación queda pendiente y requiere seguir el contexto del artículo antes de ampliar el mensaje del servidor.',limitations:['Inspección estática; no se ejecutaron pruebas ni se consultaron movimientos.']});
it('rejects the actual received wrapper citation and does not let reading the true source elsewhere repair the wrong reference',async()=>{
 const s=source();await s.read('shared/inventoryUnits.ts',1,30);const errors=await checkErrorAttribution(wrong,s);
 expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({field:'evidence.3.explanation',origin:expect.objectContaining({path:'shared/inventoryUnits.ts',symbol:'inventoryUnitFactor'})})]));
 const direct=sourceRange('shared/inventoryUnits.ts','Falta equivalencia explícita',0,0);expect(errors.some(error=>error.origin.start===direct.start&&error.origin.end===direct.end)).toBe(true);
});
it.each(['hipotesis','sustentado_en_codigo','falta_informacion'] as const)('rejects missing requested identity coverage with certainty %s',certainty=>expect(errorProposalCoverageIssues({...wrong,certainty},ticket)).toEqual(expect.arrayContaining([expect.objectContaining({code:'REQUESTED_ITEM_IDENTITY_UNADDRESSED'})])));
it('accepts a correctly cited partial solution that explicitly preserves the pending item identity',async()=>{const report=complete();expect(await checkErrorAttribution(report,source())).toEqual([]);expect(errorProposalCoverageIssues(report,ticket)).toEqual([]);});
it('accepts an explicit proposal to include context rather than pretending the parser creates it',()=>{expect(errorProposalCoverageIssues({...complete(),proposal:'Usar parseApiError para mostrar el detalle y agregar el identificador del artículo al mensaje del servidor después de seguir su contexto.'},ticket)).toEqual([]);});
it('does not force an item-name change when the user only asks for unit details',()=>{expect(errorProposalCoverageIssues(wrong,{...ticket,actual:'Error al cargar receta por equivalencia de caja a unidad.',expected:'Mostrar el detalle de las unidades faltantes.'})).toEqual([]);});
it('preserves attribution to a re-export or propagator when that role is explicit',async()=>{const report=complete();report.evidence.push({path:'server/inventoryUnits.ts',start:1,end:9,explanation:'Reexporta inventoryUnitFactor; no es el origen del error Falta equivalencia explícita.'});expect(await checkErrorAttribution(report,source())).toEqual([]);});
it('derives the cited throw line from source after movement rather than pinning line 20',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'recipe-citation-'));try{await mkdir(path.join(root,'server'));await writeFile(path.join(root,'server/inventoryUnits.ts'),"// moved\n// context\nexport function lookup(){\n throw Error('Falta equivalencia explícita');\n}\n");const report={...complete(),evidence:[{path:'server/inventoryUnits.ts',start:1,end:2,explanation:'Origen del mensaje Falta equivalencia explícita.'}]};const errors=await checkErrorAttribution(report,new CodeSource(root,ticket.version));expect(errors[0].origin).toMatchObject({symbol:'lookup',start:4,end:4});}finally{await rm(root,{recursive:true,force:true});}
});
it('requires correction before even a permissive simulated auditor can approve',async()=>{
 const s=source();for(const ref of wrong.evidence)await s.read(ref.path,ref.start,ref.end);let authors=0,audits=0;
 const create=vi.fn(async(req:any)=>{if(req.response_format.json_schema.name==='maran_diagnosis_audit'){audits++;return {choices:[{message:{role:'assistant',content:JSON.stringify({approved:true,issues:[]})}}]};}authors++;return {choices:[{message:{role:'assistant',content:JSON.stringify(wrong)}}]};});
 await expect(diagnose(ticket,s,{apiKey:'unused',model:'offline'},{chat:{completions:{create}}} as any)).rejects.toMatchObject({code:'evidence_attribution'});expect(authors).toBe(3);expect(audits).toBe(0);
});
it('correcting only the citation is not enough: the remaining omission is blocked',async()=>{
 const s=source(),report={...wrong,evidence:complete().evidence};for(const ref of report.evidence)await s.read(ref.path,ref.start,ref.end);let audits=0;
 const create=vi.fn(async(req:any)=>{if(req.response_format.json_schema.name==='maran_diagnosis_audit')audits++;return {choices:[{message:{role:'assistant',content:JSON.stringify(report)}}]};});
 await expect(diagnose(ticket,s,{apiKey:'unused',model:'offline'},{chat:{completions:{create}}} as any)).rejects.toMatchObject({code:'evidence_inconsistent'});expect(audits).toBe(0);
});
it('accepts a corrected explanation only after independent audit',async()=>{
 const s=source();for(const ref of complete().evidence)await s.read(ref.path,ref.start,ref.end);let authors=0,audits=0;
 const create=vi.fn(async(req:any)=>{if(req.response_format.json_schema.name==='maran_diagnosis_audit'){audits++;expect(req.messages[0].content).toContain(errorReportReviewInstruction);return {choices:[{message:{role:'assistant',content:JSON.stringify({approved:true,issues:[]})}}]};}authors++;return {choices:[{message:{role:'assistant',content:JSON.stringify(authors===1?{...wrong,evidence:complete().evidence}:complete())}}]};});
 const result=await diagnose(ticket,s,{apiKey:'unused',model:'offline'},{chat:{completions:{create}}} as any);expect(authors).toBe(2);expect(audits).toBe(1);expect(result.report.proposal).toContain('queda pendiente');
});
it('keeps expected reports outside the investigator catalog',async()=>{expect((await source().files()).some(p=>p.includes('recipe-error-received')||p.includes('evaluation/recipe-error'))).toBe(false);});

it('accepts explicit partial scope expressed as pending identification',()=>{expect(errorProposalCoverageIssues({...complete(),proposal:'Usar parseApiError recupera las unidades; la identificación del ingrediente queda pendiente.'},ticket)).toEqual([]);});

it('does not mistake a relative que about the error for a request to name an ingredient',()=>{expect(errorProposalCoverageIssues(wrong,{...ticket,actual:'Error de equivalencia al cargar receta.',expected:'Que se muestre el error de equivalencia al cargar un ingrediente.'})).toEqual([]);});
