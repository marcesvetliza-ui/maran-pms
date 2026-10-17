import {it,expect} from 'vitest';
import {CodeSource} from '../../services/programming-assistant/source';
import {buildCoverageReview,buildResearchClosure,coverageReviewInstruction} from '../../services/programming-assistant/review';
import {orientInvestigation} from '../../services/programming-assistant/navigation';
import type {SupportDiagnosis,SupportTicket} from '../../shared/programming-support';

it('supplies the cited code instead of treating the erroneous explanation as evidence',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 await source.read('server/inventoryUnits.ts',1,20);
 const draft:SupportDiagnosis={summary:'convertInventoryQuantity arroja Falta equivalencia explícita',certainty:'sustentado_en_codigo',cause:'',proposal:'',proposedTests:[],questions:['¿Existe alguna pantalla para configurar equivalencias?'],dataRepair:'',limitations:[],evidence:[{path:'server/inventoryUnits.ts',start:11,end:20,explanation:'convertInventoryQuantity detecta falta de configuración'}]};
 const review=await buildCoverageReview(draft,source);
 expect(review.citedCode[0].content).toContain('throw fail(`Falta equivalencia explícita');
 expect(review.citedCode[0].content).toContain('export function convertInventoryQuantity');
 expect(review.citedCode[0].content).toContain("throw fail('Cantidad o equivalencia inválida')");
 expect(review.citedCode[0].content).not.toContain('detecta falta de configuración');
 expect(review.citedCode[0].incomplete).toBe(false);
 expect(coverageReviewInstruction).toContain('instrucción exacta');
 expect(coverageReviewInstruction).toContain('No preguntes si existe una pantalla');
});

it('orients the reported error to the actual functions and existing configuration screen',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 const orientation=await orientInvestigation({module:'inventario',title:'Error al cargar receta',actual:'Consumo interno con ingrediente en cajas sin equivalencia',expected:'Seguir el mensaje del error del backend a la pantalla',messages:[]} as SupportTicket,source);
 const reads=orientation.workflowReads;
 expect(reads.some(read=>read.content.includes('export async function unitFactor'))).toBe(true);
 expect(reads.some(read=>read.content.includes('export function inventoryUnitFactor'))).toBe(true);
 expect(reads.some(read=>read.content.includes('export function InventoryUnitConversions'))).toBe(true);
 expect(reads.some(read=>read.path==='client/src/pages/inventory.tsx' && read.content.includes('<InventoryUnitConversions'))).toBe(true);
 expect(reads.every(read=>source.validates(read))).toBe(true);
});

it('does not expand a full history or claim that a capped citation was fully audited',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 const read=await source.read('client/src/pages/inventory.tsx',2500,2639);
 const draft:SupportDiagnosis={summary:'',certainty:'hipotesis',cause:'',proposal:'',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence:Array.from({length:12},()=>({...read,explanation:'Formulario'}))};
 const review=await buildCoverageReview(draft,source);
 expect(review.citedCode.reduce((sum,read)=>sum+read.content.length,0)).toBeLessThanOrEqual(16000);
 expect(review.omittedCitations>0 || review.citedCode.some(read=>read.incomplete)).toBe(true);
});

it('hands source-backed bounded evidence to drafting without replaying the research transcript',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 await source.read('server/billing/routes.ts',1660,1700);
 await source.read('client/src/lib/prefactura-submission.ts',1,80);
 await source.read('server/tests/folio-invoice-concurrency.test.ts',219,238);
 const closure=await buildResearchClosure(source,['Distinguir factura de cobro']);
 expect(closure.readings.reduce((sum,read)=>sum+read.content.length,0)).toBeLessThanOrEqual(24000);
 expect(closure.readings.some(read=>read.path.includes('prefactura-submission'))).toBe(true);
 expect(closure.readings.every(read=>source.validates(read))).toBe(true);
 expect(closure.coverageChecklist).toEqual(['Distinguir factura de cobro']);
 expect(closure.scope).toContain('No se ejecutaron pruebas');
});
