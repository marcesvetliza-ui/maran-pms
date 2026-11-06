import {it,expect,vi} from 'vitest';
import type {SupportDiagnosis,SupportTicket} from '../../../shared/programming-support';
import {cashReasoningIssues,cashReasoningInstruction} from '../cash-review';
import {orientInvestigation} from '../navigation';
import {CodeSource} from '../source';
import {diagnose} from '../diagnose';
import {auditInstruction} from '../semantic-audit';
import received from './spa-cash-received.json';
import {sourceRange} from '../../../server/tests/helpers/assistantSourceEvidence';
const wrong=received.report as SupportDiagnosis;
const ticket={version:received.sourceRevision,module:'spa',title:'Caja SPA: diferencia y comprobantes no fiscales',actual:'440.000 no fiscales, efectivo del sistema 440.000, conteo sin ingresar en cero y diferencia -440.000.',expected:'Sólo investigar sin cerrar turnos ni modificar datos.',messages:[]} as SupportTicket;
const good=(patch:Partial<SupportDiagnosis>={}):SupportDiagnosis=>({summary:'Con los importes aportados, 0 menos 440.000 da -440.000: es la diferencia del conteo, no un egreso.',cause:'El conteo todavía está en cero. Un cobro no fiscal con movimiento income y medio cash suma al efectivo; la clase del documento no implica informational.',proposal:'Contar el efectivo real y revisar su coincidencia sin confirmar el cierre. No registrar otro cobro ni inventar cantidades para cuadrar.',certainty:'sustentado_en_codigo',proposedTests:['Simular el cálculo con datos sintéticos en un entorno aislado, sin cerrar turnos reales.'],questions:[],dataRepair:'',limitations:['No se consultaron movimientos operativos: no se certifica la composición histórica de los 440.000.'],evidence:[],...patch});
it.each(['hipotesis','sustentado_en_codigo','falta_informacion'] as const)('rejects the actual received classification and unsafe tests even with certainty %s',certainty=>{
 const issues=cashReasoningIssues({...wrong,certainty});expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code:'NON_FISCAL_AS_MOVEMENT_TYPE',field:'summary'}),expect.objectContaining({code:'NON_FISCAL_NEVER_CASH',field:'proposal'}),expect.objectContaining({code:'LIVE_STATE_CHANGE_AS_TEST',field:'proposedTests.0'})]));
});
it.each([
 'Un comprobante no fiscal no implica que el movimiento sea informational.',
 'Los comprobantes no fiscales no son informational por su clase documental.',
 'No está demostrado que los comprobantes no fiscales sean informational.',
 'Los comprobantes no fiscales no siempre suman efectivo: revisar el movimiento y el medio.',
 'Los cobros no fiscales en efectivo con tipo income suman. Los movimientos informational no afectan el efectivo físico.',
 'Si un cobro no fiscal fue registrado como informational, revisar ese movimiento antes de atribuirle un signo.',
 'El comprobante por sí solo no suma dinero nuevamente sobre el cobro existente.',
])('keeps scoped, conditional and separate-axis explanations: %s',summary=>expect(cashReasoningIssues(good({summary}))).toEqual([]));
it.each(['Simular cerrar un turno con datos sintéticos en un entorno aislado.','Inspeccionar el código que calcula el importe al cerrar el turno.','Comprobar la expresión sin cerrar el turno.'])('allows isolated or read-only test proposals: %s',test=>expect(cashReasoningIssues(good({proposedTests:[test]}))).toEqual([]));
it('orients to the real SPA cash producer, client count/difference and server sign instead of only the exclusion branch',async()=>{
 const s=new CodeSource(process.cwd(),ticket.version),orientation=await orientInvestigation(ticket,s);const reads=orientation.workflowReads;
 expect(reads.some(r=>r.path==='server/routes/spa.ts'&&r.content.includes('movementType: "income"')&&r.content.includes('receiptType: "cierre_spa"'))).toBe(true);
 expect(reads.some(r=>r.path==='client/src/pages/cash-register.tsx'&&r.content.includes('efectivoContado - efectivoSistema'))).toBe(true);
 expect(reads.some(r=>r.path==='server/db-storage.ts'&&r.content.includes('m.movementType === "expense" ? -1 : 1'))).toBe(true);
 expect(reads.every(r=>s.validates(r))).toBe(true);expect(orientation.investigationFocus).toBe(cashReasoningInstruction);expect(auditInstruction).toContain(cashReasoningInstruction);
});
function evidence(){return [{...sourceRange('client/src/pages/cash-register.tsx','const efectivoSistema =',1,4),explanation:'Cálculo del efectivo neto y diferencia contra el conteo real.'}];}
it('blocks an insisting bad model before even a permissive auditor can publish it',async()=>{
 const s=new CodeSource(process.cwd(),ticket.version),bad={...wrong,evidence:evidence()};for(const ref of bad.evidence)await s.read(ref.path,ref.start,ref.end);
 let audits=0;const create=vi.fn(async(req:any)=>{if(req.response_format.json_schema.name==='maran_diagnosis_audit'){audits++;return {choices:[{message:{role:'assistant',content:JSON.stringify({approved:true,issues:[]})}}]};}return {choices:[{message:{role:'assistant',content:JSON.stringify(bad)}}]};});
 await expect(diagnose(ticket,s,{apiKey:'mock',model:'mock'},{chat:{completions:{create}}} as any)).rejects.toMatchObject({code:'evidence_inconsistent'});expect(audits).toBe(0);
});
it('requests correction and independently reviews the new explanation without paid calls',async()=>{
 const s=new CodeSource(process.cwd(),ticket.version),refs=evidence();for(const ref of refs)await s.read(ref.path,ref.start,ref.end);
 let authors=0,audits=0;const create=vi.fn(async(req:any)=>{
  if(req.response_format.json_schema.name==='maran_diagnosis_audit'){audits++;expect(req.messages[0].content).toContain(cashReasoningInstruction);return {choices:[{message:{role:'assistant',content:JSON.stringify({approved:true,issues:[]})}}]};}
  authors++;if(authors===2)expect(JSON.stringify(req.messages)).toContain('NON_FISCAL_AS_MOVEMENT_TYPE');return {choices:[{message:{role:'assistant',content:JSON.stringify(authors===1?{...wrong,evidence:refs}:good({evidence:refs}))}}]};
 });
 const result=await diagnose(ticket,s,{apiKey:'mock',model:'mock'},{chat:{completions:{create}}} as any);expect(authors).toBe(2);expect(audits).toBe(1);expect(result.report.summary).toContain('no un egreso');expect(cashReasoningIssues(result.report)).toEqual([]);
});

it('also rejects the inverse blanket claim that every non-fiscal document adds fresh cash',()=>{expect(cashReasoningIssues(good({summary:'Todos los comprobantes no fiscales siempre suman efectivo.'}))).toEqual(expect.arrayContaining([expect.objectContaining({code:'NON_FISCAL_ALWAYS_CASH'})]));});

it('does not substitute the SPA producer for a different cash module',async()=>{const s=new CodeSource(process.cwd(),ticket.version);const orientation=await orientInvestigation({...ticket,module:'restaurant',title:'Caja restaurante',actual:'El efectivo esperado y el conteo del cierre no coinciden.'},s);expect(orientation.workflowReads.some(r=>r.path==='server/routes/spa.ts')).toBe(false);});

it('keeps the received diagnosis and expected responses outside the live source catalog',async()=>{const files=await new CodeSource(process.cwd(),ticket.version).files();expect(files.some(path=>path.includes('evaluation/cash-reasoning')||path.endsWith('spa-cash-received.json'))).toBe(false);});
