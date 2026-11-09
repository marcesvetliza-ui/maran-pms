import { expect,it,vi } from 'vitest';
import { responsesTransport, type ResponsesClient } from '../../services/programming-assistant/responses-transport';
import { safeFailure } from '../../services/programming-assistant/evaluation-models';
import { evaluationProfile,evaluationRevisionAllowed } from '../../services/programming-assistant/evaluation-profile';
const completed=()=>({status:'completed',model:'reported-model',output_text:'{"action":"clarify"}',output:[{type:'message'}],usage:{input_tokens:120,output_tokens:30,input_tokens_details:{cached_tokens:20}}});
function setup(response:unknown=completed()) {
  const create=vi.fn(async()=>response),onModel=vi.fn();
  return {create,onModel,transport:responsesTransport({responses:{create}} as unknown as ResponsesClient,'requested-model',onModel)};
}
it('uses Responses without tools, storage, implicit credentials or server threads',async()=>{
  const {create,onModel,transport}=setup();const session=transport.session(),signal=new AbortController().signal;
  const result=await session.run('synthetic case',{type:'object'},signal);
  expect(result.usage).toEqual({input:120,output:30,cachedInput:20});expect(onModel).toHaveBeenCalledWith('reported-model');
  expect(create.mock.calls[0]).toEqual([expect.objectContaining({model:'requested-model',tools:[],tool_choice:'none',store:false,stream:false,max_output_tokens:2500}),{signal}]);
  await session.run('read result',{type:'object'},signal);
  expect((create.mock.calls[1] as unknown as [{input:unknown[]}])[0].input).toEqual([{role:'user',content:'synthetic case'},{role:'assistant',content:completed().output_text},{role:'user',content:'read result'}]);
  await transport.session().run('independent review',{},signal);
  expect((create.mock.calls[2] as unknown as [{input:unknown[]}])[0].input).toHaveLength(1);
});
it('rejects incomplete answers and unexpected native tool output',async()=>{
  for(const response of [{...completed(),status:'incomplete'},{...completed(),output:[{type:'function_call'}]},{...completed(),usage:null},{...completed(),usage:{input_tokens:1,output_tokens:2,input_tokens_details:{cached_tokens:3}}}]) {
    await expect(setup(response).transport.session().run('case',{},new AbortController().signal)).rejects.toMatchObject({code:expect.stringMatching(/^codex_/)});
  }
});
it('rejects oversized history before a provider call and does not retry failures',async()=>{
  const {create,transport}=setup();await expect(transport.session().run('x'.repeat(65001),{},new AbortController().signal)).rejects.toMatchObject({code:'codex_budget'});expect(create).not.toHaveBeenCalled();
  create.mockRejectedValueOnce(Error('synthetic transport failure'));
  await expect(transport.session().run('case',{},new AbortController().signal)).rejects.toThrow('synthetic transport failure');expect(create).toHaveBeenCalledTimes(1);
});
it('logs only allowlisted failure codes',()=>{
  expect(safeFailure({status:401,message:'private provider payload'})).toBe('api_authentication_failed');
  expect(safeFailure({evaluationCode:'private key',message:'private provider payload'})).toBe('model_catalog_check_failed');
  expect(safeFailure({evaluationCode:'api_key_reference_missing'})).toBe('api_key_reference_missing');
});
it('applies the user-verified price profile without enabling paid calls',()=>{
  const profile=evaluationProfile({SUPPORT_EVALUATION_PROFILE:'gpt53codex-2026-11-09'});
  expect(profile).toMatchObject({SUPPORT_CODEX_MODEL:'gpt-5.3-codex',SUPPORT_EVALUATION_APPROVED_USD:'10',SUPPORT_EVALUATION_INPUT_USD_PER_MILLION:'1.75',SUPPORT_EVALUATION_CACHED_USD_PER_MILLION:'0.175',SUPPORT_EVALUATION_OUTPUT_USD_PER_MILLION:'14'});
  expect(profile.SUPPORT_CODEX_PAID_ENABLED).toBeUndefined();
  expect(evaluationProfile({})).toEqual({});
  expect(()=>evaluationProfile({SUPPORT_EVALUATION_PROFILE:'unknown'})).toThrow();
  expect(()=>evaluationProfile({SUPPORT_EVALUATION_PROFILE:'gpt53codex-2026-11-09',SUPPORT_CODEX_MODEL:'different-model'})).toThrow();
});
it('supports the bounded larger evaluation history while retaining the default cap',async()=>{
  const create=vi.fn(async()=>completed());
  const transport=responsesTransport({responses:{create}} as unknown as ResponsesClient,'requested-model',()=>{},125000);
  await transport.session().run('x'.repeat(70000),{},new AbortController().signal);
  expect(create).toHaveBeenCalledTimes(1);
  await expect(transport.session().run('x'.repeat(125001),{},new AbortController().signal)).rejects.toMatchObject({code:'codex_budget',budgetReason:'transport_context_limit'});
  expect(create).toHaveBeenCalledTimes(1);
});
it('requires an explicitly selected revision and blocks subsequent code pushes',()=>{
 expect(evaluationRevisionAllowed({RAILWAY_GIT_COMMIT_SHA:'a'.repeat(40)})).toBe(false);
 expect(evaluationRevisionAllowed({RAILWAY_GIT_COMMIT_SHA:'a'.repeat(40),SUPPORT_EVALUATION_RUN_REVISION:'a'.repeat(8)})).toBe(true);
 expect(evaluationRevisionAllowed({RAILWAY_GIT_COMMIT_SHA:'b'.repeat(40),SUPPORT_EVALUATION_RUN_REVISION:'a'.repeat(8)})).toBe(false);
 expect(evaluationRevisionAllowed({RAILWAY_GIT_COMMIT_SHA:'a'.repeat(40),SUPPORT_EVALUATION_RUN_REVISION:'a'})).toBe(false);
});
