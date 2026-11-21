import { afterEach, expect, it, vi } from "vitest";
import { evaluationRevisionAllowed, evaluationRevisionSelection } from "../../services/programming-assistant/evaluation-profile";
import { evaluationFailureDetails, main } from "../../services/programming-assistant/evaluation-models";

afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
function isolated(action:string){
  vi.stubEnv("APP_ENV","pilot");vi.stubEnv("SUPPORT_EVALUATION_ISOLATED_JOB","true");
  vi.stubEnv("SUPPORT_EVALUATION_ACTION",action);
  for(const key of ["DATABASE_URL","ASSISTANT_DATABASE_URL","SUPPORT_SHARED_SECRET","RAILWAY_MARAN_PROJECT_TOKEN","OPENAI_API_KEY"])vi.stubEnv(key,"");
}
it("explains a stale evaluation selection without enabling inference or altering the guard",async()=>{
  isolated("evaluate");vi.stubEnv("RAILWAY_GIT_COMMIT_SHA","b".repeat(40));vi.stubEnv("SUPPORT_EVALUATION_RUN_REVISION","a".repeat(8));
  await expect(main()).rejects.toMatchObject({evaluationCode:"evaluation_revision_not_selected"});
  const detail=evaluationFailureDetails({evaluationCode:"evaluation_revision_not_selected"},process.env);
  expect(detail).toMatchObject({inferenceEnabled:false,revisionCheck:{runningRevision:"b".repeat(40),selectedRevision:"a".repeat(8),reason:"revision_mismatch"}});
  expect(evaluationRevisionAllowed(process.env)).toBe(false);
});
it("can inspect the runner revision without a key, a provider call or a matching selection",async()=>{
  isolated("revision");vi.stubEnv("RAILWAY_GIT_COMMIT_SHA","b".repeat(40));vi.stubEnv("SUPPORT_EVALUATION_RUN_REVISION","a".repeat(8));
  const log=vi.spyOn(console,"log").mockImplementation(()=>{});
  await main();
  expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({component:"isolated-evaluation-runner",action:"revision",providerTurns:0,inferenceEnabled:false,revisionCheck:{reason:"revision_mismatch"}});
});
it("does not print invalid revision values or unrelated provider error details",()=>{
  const env={RAILWAY_GIT_COMMIT_SHA:"private-key-value",SUPPORT_EVALUATION_RUN_REVISION:"other-private-value"};
  expect(evaluationRevisionSelection(env)).toEqual({selectedRevision:null,runningRevision:null,reason:"running_revision_missing_or_invalid"});
  expect(JSON.stringify(evaluationFailureDetails({evaluationCode:"evaluation_revision_not_selected",message:"private body"},env))).not.toContain("private");
  expect(evaluationFailureDetails({status:401,message:"private body"},env)).toEqual({error:"api_authentication_failed",inferenceEnabled:false});
});
it("still rejects operational credentials for the diagnostic revision action",async()=>{
  isolated("revision");vi.stubEnv("ASSISTANT_DATABASE_URL","postgresql://synthetic/test");
  await expect(main()).rejects.toMatchObject({evaluationCode:"operational_credentials_present"});
});
it("keeps the revision guard ahead of the small chat evaluation even with the old monetary profile",async()=>{
  isolated("chat-evaluate");vi.stubEnv("RAILWAY_GIT_COMMIT_SHA","b".repeat(40));vi.stubEnv("SUPPORT_EVALUATION_RUN_REVISION","a".repeat(8));
  vi.stubEnv("SUPPORT_EVALUATION_PROFILE","gpt53codex-2026-11-09");vi.stubEnv("SUPPORT_EVALUATION_APPROVED_USD","10");
  await expect(main()).rejects.toMatchObject({evaluationCode:"evaluation_revision_not_selected"});
});
