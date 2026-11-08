export type SupportInvestigatorMode='legacy'|'simulation'|'codex';
export function supportInvestigatorMode(values:Record<string,string|undefined>):SupportInvestigatorMode {
  if(values.SUPPORT_WORKFLOW_SIMULATION_ENABLED==='true')return 'simulation';
  const mode=values.SUPPORT_INVESTIGATOR||'legacy';
  if(mode!=='legacy'&&mode!=='codex')throw Error('SUPPORT_INVESTIGATOR debe ser legacy o codex');
  return mode;
}
