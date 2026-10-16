import {it,expect} from 'vitest';
import {CodeSource} from '../../services/programming-assistant/source';
import {pilotEvaluationCases} from '../../services/programming-assistant/evaluation-cases';
// Checks discoverability only. It does not prove the operations or model answers.
it.each(pilotEvaluationCases)('pilot case $id locates a real endpoint with citable source',async(testCase)=>{
 const source=new CodeSource(process.cwd(),'a'.repeat(40));
 const result=await source.traceEndpoint(testCase.endpoint,{method:testCase.method,includeTests:false});
 expect(result.handlers.length).toBeGreaterThan(0);
 expect(result.handlers.every(read=>source.validates(read))).toBe(true);
 expect(testCase.checks.length).toBeGreaterThan(0);
});
