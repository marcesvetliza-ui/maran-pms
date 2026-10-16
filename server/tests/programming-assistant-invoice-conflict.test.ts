import {it,expect} from 'vitest';
import {CodeSource} from '../../services/programming-assistant/source';
import {orientInvestigation} from '../../services/programming-assistant/navigation';
import {buildCoverageReview} from '../../services/programming-assistant/review';
import type {SupportTicket,SupportDiagnosis} from '../../shared/programming-support';
const ticket={module:'facturacion',title:'Error al facturar una reserva',actual:'Estábamos dos personas intentando facturar la misma reserva. Una pudo emitir y a la otra le apareció que el cargo ya no tenía saldo suficiente para facturar.',expected:'Entender si es correcto, si se facturó o cobró dos veces y qué debe hacer la persona que recibió el mensaje.',messages:[]} as SupportTicket;
it('finds invoice validation, existing concurrency assertions, mock scope, client payment order and catch from a plain-language case',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 const orientation=await orientInvestigation(ticket,source);
 const reads=orientation.workflowReads;
 expect(orientation.investigationFocus).toContain('Separar factura de cobro');
 expect(reads.some(read=>read.path==='server/billing/routes.ts' && read.content.includes('saldo suficiente para facturar'))).toBe(true);
 expect(reads.some(read=>read.path==='server/tests/folio-invoice-concurrency.test.ts' && read.content.includes('vi.mock("../db"'))).toBe(true);
 expect(reads.some(read=>read.path==='server/tests/folio-invoice-concurrency.test.ts' && read.content.includes('toEqual([201, 409])') && read.content.includes('toHaveLength(1)'))).toBe(true);
 expect(reads.some(read=>read.path==='client/src/lib/prefactura-submission.ts' && read.content.includes('attempt.invoice = await post') && read.content.includes('for (const payment of attempt.payments)'))).toBe(true);
 expect(reads.some(read=>read.path==='client/src/components/PrefacturaDialog.tsx' && read.content.includes('setSubmitError(err.message'))).toBe(true);
 expect(reads.every(read=>source.validates(read))).toBe(true);
});
it('keeps the existing tests in the final review even if the draft cited only backend validation',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 const orientation=await orientInvestigation(ticket,source);
 const ref=orientation.workflowReads.find(read=>read.path==='server/billing/routes.ts' && read.content.includes('saldo suficiente'))!;
 const report:SupportDiagnosis={summary:'El mensaje evita facturar de más.',certainty:'sustentado_en_codigo',cause:'',proposal:'Crear una prueba concurrente',proposedTests:[],questions:[],dataRepair:'',limitations:[],evidence:[{path:ref.path,start:ref.start,end:ref.end,explanation:'Validación'}]};
 const review=await buildCoverageReview(report,source,orientation.coverageChecklist);
 expect(review.coverageChecklist.join(' ')).toContain('sin registros operativos');
 expect(review.operationalTestsConsulted.some(read=>read.content.includes('toEqual([201, 409])'))).toBe(true);
 expect(review.operationalTestsConsulted.some(read=>read.content.includes('vi.mock("../db"'))).toBe(true);
 expect(review.operationalTestsConsulted.every(read=>read.executed===false)).toBe(true);
 expect(review.operationalTestsConsulted.reduce((sum,read)=>sum+read.content.length,0)).toBeLessThanOrEqual(8000);
});
it('does not apply Reception financial conclusions to a SPA-specific case',async()=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 const orientation=await orientInvestigation({...ticket,module:'spa'},source);
 expect(orientation.coverageChecklist).toEqual([]);
 expect(orientation.workflowReads.some(read=>read.path==='server/tests/folio-invoice-concurrency.test.ts')).toBe(false);
});
