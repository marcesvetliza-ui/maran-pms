import {it,expect,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import received from './recipe-error-65aa-received.json';
import {CodeSource} from '../source';
import {errorProposalCoverageIssues} from '../error-report-review';
import {recipeErrorContract,recipeMessageIdentityIssues} from '../recipe-error-contract';
import {prepareAudit} from '../semantic-audit';
import {diagnose} from '../diagnose';
import {checkErrorAttribution} from '../attribution';
import type {SupportDiagnosis,SupportTicket} from '../../../shared/programming-support';
const report=received.report as SupportDiagnosis;
const ticket={version:received.sourceRevision,module:'inventario',title:'Error al cargar una receta en Consumo Interno',actual:'En Consumo Interno intento cargar una receta que tiene un ingrediente expresado en cajas, pero ese ingrediente no tiene configurada la equivalencia con su unidad de stock. Aparece Error al cargar receta y no veo qué ingrediente o equivalencia está faltando.',expected:'Que la pantalla explique qué ingrediente no tiene equivalencia y qué configuración falta revisar. Determinar si el servidor ya devuelve ese detalle y la interfaz lo reemplaza por un mensaje genérico, o si el detalle falta desde el origen.',messages:[]} as SupportTicket;
async function setup(){const source=new CodeSource(process.cwd(),ticket.version);for(const ref of report.evidence)await source.read(ref.path,ref.start,ref.end);return source;}
const corrected=():SupportDiagnosis=>({...report,summary:'El catch de Inventario oculta el detalle de las unidades. El mensaje del servidor no incluye el nombre del ingrediente.',cause:'El endpoint propaga el mensaje; la pantalla usa un toast fijo. El helper recibe from/to y configuración, sin nombre/id.',proposal:'Usar parseApiError recupera las unidades. La identificación del ingrediente queda pendiente: requiere añadir su nombre o identificador al contexto del error después de seguir el llamador.',limitations:['Inspección estática, sin ejecución ni acceso a datos operativos.'],evidence:report.evidence.map((ref,i)=>i===0?{...ref,explanation:'El endpoint captura la excepción y propaga su mensaje con error:e.message y su statusCode.'}:ref)});

it('rejects the exact approved response despite its generic enrichment and disclaimers',async()=>{
 const source=await setup(),contract=await recipeErrorContract(source);
 expect(contract?.unitOnlyMessage).toBe(true);
 expect(errorProposalCoverageIssues(report,ticket)).toEqual(expect.arrayContaining([expect.objectContaining({code:'REQUESTED_ITEM_IDENTITY_UNADDRESSED'})]));
 expect(recipeMessageIdentityIssues(report,contract)).toEqual(expect.arrayContaining([expect.objectContaining({field:'summary',code:'MESSAGE_ITEM_IDENTITY_UNSUPPORTED'}),expect.objectContaining({field:'proposal',code:'MESSAGE_ITEM_IDENTITY_UNSUPPORTED'})]));
});
it.each(['summary','proposal'] as const)('does not let an identity disclaimer in another field excuse a false %s',async field=>{
 const contract=await recipeErrorContract(await setup());
 expect(recipeMessageIdentityIssues({...corrected(),[field]:report[field]},contract).some(issue=>issue.field===field)).toBe(true);
});
it('accepts a scoped partial proposal and a genuinely conditional enrichment',async()=>{
 const contract=await recipeErrorContract(await setup());
 expect(errorProposalCoverageIssues(corrected(),ticket)).toEqual([]);expect(recipeMessageIdentityIssues(corrected(),contract)).toEqual([]);
 const conditional={...corrected(),proposal:'Si se agrega el nombre del ingrediente al error, el mensaje permitirá explicar qué ingrediente falta. Usar parseApiError para mostrar ese mensaje.'};
 expect(recipeMessageIdentityIssues(conditional,contract)).toEqual([]);
});
it('does not let a negated premise excuse the opposite parser claim in the same sentence',async()=>{
 const contract=await recipeErrorContract(await setup());
 const mixed={...corrected(),proposal:'El servidor no incluye el nombre, pero parseApiError permitirá explicar qué ingrediente falta.'};
 expect(recipeMessageIdentityIssues(mixed,contract).some(issue=>issue.field==='proposal')).toBe(true);
 expect(recipeMessageIdentityIssues({...corrected(),proposal:'No se puede afirmar que parseApiError permitirá explicar qué ingrediente falta.'},contract)).toEqual([]);
});
it('gives the independent reviewer the real constructor and propagators even when the report omits them',async()=>{
 const prepared=await prepareAudit(ticket,corrected(),await setup());
 const packet=JSON.parse(prepared.payload).evidence.messageContract;
 expect(report.evidence.some(ref=>ref.path==='shared/inventoryUnits.ts')).toBe(false);
 expect(packet.readings.map((read:any)=>read.path)).toEqual(expect.arrayContaining(['shared/inventoryUnits.ts','server/inventoryStockEngine.ts','server/inventoryStage2Routes.ts']));
 expect(packet.message).toContain('${from} a ${to}');
});
it('blocks the received report before a simulated approving reviewer can publish it',async()=>{
 let audits=0;
 const create=vi.fn(async(req:any)=>{if(req.response_format.json_schema.name==='maran_diagnosis_audit')audits++;return {choices:[{message:{role:'assistant',content:JSON.stringify(report)}}]};});
 await expect(diagnose(ticket,await setup(),{apiKey:'unused',model:'offline'},{chat:{completions:{create}}} as any)).rejects.toMatchObject({code:'evidence_attribution'});
 expect(audits).toBe(0);
});
it('also rejects lanza/arroja as an origin claim when only the endpoint is cited',async()=>{
 expect(await checkErrorAttribution(report,await setup())).toEqual(expect.arrayContaining([expect.objectContaining({field:'evidence.0.explanation'})]));
 expect(await checkErrorAttribution(corrected(),await setup())).toEqual([]);
});
it('cannot publish the false identity claims by correcting only the origin citation',async()=>{
 const wrong={...report,evidence:corrected().evidence};let audits=0;
 const create=vi.fn(async(req:any)=>{if(req.response_format.json_schema.name==='maran_diagnosis_audit')audits++;return {choices:[{message:{role:'assistant',content:JSON.stringify(wrong)}}]};});
 await expect(diagnose(ticket,await setup(),{apiKey:'unused',model:'offline'},{chat:{completions:{create}}} as any)).rejects.toMatchObject({code:'evidence_inconsistent'});expect(audits).toBe(0);
});
it('can deliver a scoped correction only after a fresh independent audit sees the real message',async()=>{
 let authors=0,audits=0;
 const create=vi.fn(async(req:any)=>{
  if(req.response_format.json_schema.name==='maran_diagnosis_audit'){
   audits++;expect(JSON.parse(req.messages[1].content).evidence.messageContract.message).toContain('${from} a ${to}');
   return {choices:[{message:{role:'assistant',content:JSON.stringify({approved:true,issues:[]})}}]};
  }
  authors++;return {choices:[{message:{role:'assistant',content:JSON.stringify(authors===1?{...report,evidence:corrected().evidence}:corrected())}}]};
 });
 const result=await diagnose(ticket,await setup(),{apiKey:'unused',model:'offline'},{chat:{completions:{create}}} as any);
 expect(result.report.validationStatus).toBe('complete');expect(result.report.proposal).toContain('queda pendiente');expect(authors).toBe(2);expect(audits).toBe(1);
});
it('does not assume the old message contract after the source gains item context',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'recipe-message-contract-'));
 try{
  await mkdir(path.join(root,'server'));await mkdir(path.join(root,'shared'));
  await writeFile(path.join(root,'server/inventoryStage2Routes.ts'),"app.post('/api/inventory/recipe-stock-preview',async(req,res)=>{try{\nconst factor=await unitFactor(db,item.id,line.unit || item.unit,item.unit);\n}catch(e:any){res.status(e.statusCode||500).json({error:e.message});}});\n");
  await writeFile(path.join(root,'server/inventoryStockEngine.ts'),'export async function unitFactor(tx:any,itemId:string,from:string,to:string){\nreturn inventoryUnitFactor(from,to,itemId);\n}\n');
  await writeFile(path.join(root,'shared/inventoryUnits.ts'),'export function inventoryUnitFactor(from:string,to:string,itemId:string){\nthrow fail(`Falta equivalencia explícita de ${from} a ${to} para ${itemId}`);\n}\n');
  const source=new CodeSource(root,ticket.version);await source.read('server/inventoryStage2Routes.ts',1,3);
  const contract=await recipeErrorContract(source);expect(contract?.unitOnlyMessage).toBe(false);expect(recipeMessageIdentityIssues(report,contract)).toEqual([]);
 }finally{await rm(root,{recursive:true,force:true});}
});
