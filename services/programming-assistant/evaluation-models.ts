/** Isolated, non-inference credential/model check. Never starts the assistant. */
import OpenAI from 'openai';
import { evaluationProfile,evaluationRevisionAllowed } from './evaluation-profile';

const fail=(code:string):never=>{throw Object.assign(new Error(code),{evaluationCode:code});};
export function safeFailure(error:unknown) {
  const e=error as {evaluationCode?:string;status?:number;name?:string};
  const known=['pilot_job_required','operational_credentials_present','invalid_action','api_key_reference_missing','evaluation_configuration_missing','evaluation_profile_invalid','evaluation_revision_not_selected'];
  if(known.includes(e?.evaluationCode||'')) return e.evaluationCode!;
  if(e?.status===401)return 'api_authentication_failed';
  if(e?.status===403)return 'api_permission_denied';
  if(e?.status===429)return 'api_rate_limit';
  if(e?.name==='APIConnectionTimeoutError')return 'api_connection_timeout';
  if(e?.name==='APIConnectionError')return 'api_connection_failed';
  return 'model_catalog_check_failed';
}

export async function discoverModels(client: { models: { list(): PromiseLike<AsyncIterable<{id:string}>> } }) {
  const page = await client.models.list();
  const ids:string[] = [];
  for await (const item of page) {
    if (/^(gpt-|o[134](?:-|$)|codex)/.test(item.id)) ids.push(item.id);
  }
  return [...new Set(ids)].sort();
}

export async function main() {
  if (process.env.APP_ENV !== 'pilot' || process.env.SUPPORT_EVALUATION_ISOLATED_JOB !== 'true') {
    fail('pilot_job_required');
  }
  if (['DATABASE_URL','ASSISTANT_DATABASE_URL','SUPPORT_SHARED_SECRET','RAILWAY_MARAN_PROJECT_TOKEN'].some(key => !!process.env[key])) {
    fail('operational_credentials_present');
  }
  const action=process.env.SUPPORT_EVALUATION_ACTION || 'dry-run';
  if(action==='evaluate') {
    if(!evaluationRevisionAllowed(process.env))fail('evaluation_revision_not_selected');
    Object.assign(process.env,evaluationProfile(process.env));
    const required=['OPENAI_API_KEY','SUPPORT_CODEX_MODEL','SUPPORT_CODEX_PAID_ENABLED','SUPPORT_EVALUATION_APPROVED_USD','SUPPORT_EVALUATION_INPUT_USD_PER_MILLION','SUPPORT_EVALUATION_OUTPUT_USD_PER_MILLION','SUPPORT_EVALUATION_CACHED_USD_PER_MILLION','SUPPORT_EVALUATION_PRICE_SOURCE','RAILWAY_GIT_COMMIT_SHA'];
    const missing=required.filter(key=>!process.env[key]?.trim());
    if(missing.length){console.error(JSON.stringify({missingConfiguration:missing,inferenceEnabled:false}));fail('evaluation_configuration_missing');}
    // Separate bundle; no evaluation code or transport starts in discovery mode.
    await import(new URL('./evaluator.mjs',import.meta.url).href);
    return;
  }
  if(action==='dry-run') {
    console.log(JSON.stringify({action,providerTurns:0,inferenceEnabled:false}));
    return;
  }
  if(action!=='models') fail('invalid_action');
  if(!process.env.OPENAI_API_KEY?.trim()) fail('api_key_reference_missing');
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:30000});
  const models=await discoverModels(client);
  console.log(JSON.stringify({action,models,providerTurns:0,inferenceEnabled:false}));
}
