/** Prices copied by the user from the official model page on 2026-11-09.
 * This profile only applies to the authorized isolated three-case evaluation. */
export function evaluationRevisionAllowed(env:Record<string,string|undefined>) {
  return evaluationRevisionSelection(env).reason === 'selected';
}
/** Only commit-shaped metadata is printable. Invalid values may contain secrets. */
export function evaluationRevisionSelection(env:Record<string,string|undefined>) {
  const approved=env.SUPPORT_EVALUATION_RUN_REVISION||'',actual=env.RAILWAY_GIT_COMMIT_SHA||'';
  const selectedRevision=/^[a-f0-9]{8,40}$/.test(approved)?approved:null;
  const runningRevision=/^[a-f0-9]{40}$/.test(actual)?actual:null;
  const reason=!runningRevision?'running_revision_missing_or_invalid'
    :!selectedRevision?'selection_missing_or_invalid'
    :!runningRevision.startsWith(selectedRevision)?'revision_mismatch':'selected';
  return {selectedRevision,runningRevision,reason};
}
export function evaluationProfile(env:Record<string,string|undefined>):Record<string,string> {
  if(!env.SUPPORT_EVALUATION_PROFILE)return {};
  const fail=()=>{throw Object.assign(Error('Perfil de evaluación inválido'),{evaluationCode:'evaluation_profile_invalid'});};
  if(env.SUPPORT_EVALUATION_PROFILE!=='gpt53codex-2026-11-09')return fail();
  const preset={
    SUPPORT_CODEX_MODEL:'gpt-5.3-codex',
    SUPPORT_EVALUATION_APPROVED_USD:'10',
    SUPPORT_EVALUATION_INPUT_USD_PER_MILLION:'1.75',
    SUPPORT_EVALUATION_CACHED_USD_PER_MILLION:'0.175',
    SUPPORT_EVALUATION_OUTPUT_USD_PER_MILLION:'14',
    SUPPORT_EVALUATION_PRICE_SOURCE:'https://developers.openai.com/api/docs/models/gpt-5.3-codex',
    SUPPORT_EVALUATION_PRICE_VERIFIED_ON:'2026-11-09',
  };
  for(const [key,value] of Object.entries(preset))if(env[key]!==undefined&&env[key]!==value)return fail();
  return preset;
}
