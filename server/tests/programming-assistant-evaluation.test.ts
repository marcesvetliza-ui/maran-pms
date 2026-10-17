import {it,expect} from 'vitest';
import {CodeSource} from '../../services/programming-assistant/source';
import {pilotEvaluationCases} from '../../services/programming-assistant/evaluation-cases';
import {evaluationTicket,evaluationProtocolPassed,evaluationRubric} from '../../services/programming-assistant/evaluation';
it("keeps the real-model case synthetic and does not equate a partial or an unaudited result with success",()=>{
 const ticket=evaluationTicket("a".repeat(40));
 expect(ticket.actual).toContain("saldo suficiente");
 expect(ticket.environment).toBe("synthetic-evaluation");
 expect(evaluationRubric.length).toBeGreaterThan(5);
 const result:any={tokens:2000,report:{validationStatus:"complete",cause:"Code",proposal:"Review"},stages:[{stage:"audit",outcome:"approved"}]};
 expect(evaluationProtocolPassed(result)).toBe(true);
 expect(evaluationProtocolPassed({...result,partialReason:"correction_budget"})).toBe(false);
 expect(evaluationProtocolPassed({...result,stages:[{stage:"audit",outcome:"rejected"}]})).toBe(false);
 expect(evaluationProtocolPassed({...result,report:{...result.report,validationStatus:"incomplete"}})).toBe(false);
});
// Checks discoverability only. It does not prove the operations or model answers.
it.each(pilotEvaluationCases)('pilot case $id locates a real endpoint with citable source',async(testCase)=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 const result=await source.traceEndpoint(testCase.endpoint,{method:testCase.method,includeTests:false});
 expect(result.handlers.length).toBeGreaterThan(0);
 expect(result.handlers.every(read=>source.validates(read))).toBe(true);
 expect(testCase.checks.length).toBeGreaterThan(0);
});
