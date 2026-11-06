import {it,expect} from 'vitest';
import {safeSupportExecution} from './programming-support-execution';
const base={revision:'a'.repeat(40),finishedAt:'2026-11-06T23:00:00.000Z',outcome:'incomplete',partialReason:'correction_reserve',tokens:65000,calls:4,semanticAudits:0,stages:[{stage:'audit',outcome:'blocked',tokens:0,totalTokens:65000,elapsedMs:0,reason:'budget',availableTokens:35000,reservedTokens:40000}]};
it('retains the distinction between a budget reservation block and a rejected audit',()=>{
  const blocked=safeSupportExecution(base)!;
  expect(blocked.partialReason).toBe('correction_reserve');expect(blocked.semanticAudits).toBe(0);expect(blocked.stages[0]).toMatchObject({outcome:'blocked',availableTokens:35000,reservedTokens:40000});
  const rejected=safeSupportExecution({...base,outcome:'failed',partialReason:undefined,failureCode:'diagnosis_coherence',stages:[{...base.stages[0],outcome:'rejected',reason:undefined,issueCount:2}]})!;
  expect(rejected.failureCode).toBe('diagnosis_coherence');expect(rejected.stages[0].outcome).toBe('rejected');
});
it('strips arbitrary text, raw provider errors, source and unrecognized reasons from persisted metadata',()=>{
  const run=safeSupportExecution({...base,message:'PRIVATE',prompt:'PRIVATE',failureCode:'PRIVATE',partialReason:'PRIVATE',tokens:Infinity,stages:[{...base.stages[0],prompt:'PRIVATE',issueStatements:['PRIVATE']},{stage:'PRIVATE',outcome:'completed',tokens:0,totalTokens:0,elapsedMs:0}]})!;
  expect(JSON.stringify(run)).not.toContain('PRIVATE');expect(run.tokens).toBeUndefined();expect(run.stages).toHaveLength(1);
  expect(safeSupportExecution({...base,revision:'PRIVATE'})).toBeUndefined();
});
it('keeps the exact safe audit failure category and schema paths, including checks',()=>{
 const run=safeSupportExecution({...base,outcome:'failed',partialReason:undefined,failureCode:'diagnosis_audit',semanticAudits:1,auditReason:'invalid_schema',auditSchemaIssues:[{path:'issues.item.problem',code:'too_big',message:'PRIVATE'},{path:'checks.item.codeQuote',code:'too_big'},{path:'PRIVATE',code:'too_big'},{path:'approved',code:'PRIVATE'}]})!;
 expect(run.auditReason).toBe('invalid_schema');expect(run.semanticAudits).toBe(1);expect(run.auditSchemaIssues).toEqual([{path:'issues.item.problem',code:'too_big'},{path:'checks.item.codeQuote',code:'too_big'}]);expect(JSON.stringify(run)).not.toContain('PRIVATE');
 expect(safeSupportExecution({...base,auditReason:'PRIVATE',auditSchemaIssues:'PRIVATE'})?.auditReason).toBeUndefined();
});
