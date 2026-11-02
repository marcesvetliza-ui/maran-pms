/** Synthetic provider output: exercises protocol/provenance, never model quality. */
export function simulatedFiscalAudit(value: any, request?:any) {
 if(typeof value?.approved!=='boolean' || !Array.isArray(value?.issues))return value;
 const payload=request && JSON.parse(request.messages.find((m:any)=>m.role==='user').content);
 if(!payload?.evidence?.proofReferences)return value;
 let codeQuote='',evidenceIndex=-1;
 for(const [index,ref] of payload.evidence.proofReferences.entries()){
  const collection=ref.collection==='decisionBriefReadings'?payload.evidence.decisionBrief.readings:payload.evidence[ref.collection];
  const line=collection[ref.index]?.content.split('\n').find((line:string)=>/^\d+: \S/.test(line));
  if(line){codeQuote=line.replace(/^\d+: /,'').slice(0,100);evidenceIndex=index;break;}
 }
 return {...value,checks:[
  {topic:'causal_inference',statementId:'cause_1_1'},
  {topic:'repair_and_action',statementId:'proposal_1_1'},
  {topic:'test_preconditions',statementId:'proposal_1_1'},
 ].map(check=>({...check,supported:true,reason:'Respuesta simulada para comprobar exclusivamente el protocolo de auditoría.',counterexample:'El control semántico del modelo real no se evalúa con este proveedor simulado.',evidenceIndex,codeQuote}))};
}
