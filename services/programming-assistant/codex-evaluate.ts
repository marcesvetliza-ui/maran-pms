/** Private evaluator. Default dry-run never creates a Codex transport. */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CodeSource } from './source';
import { investigateWithCodex } from './codex-investigator';
import { createResponsesTransport } from './responses-transport';
import { evaluationRevisionAllowed } from './evaluation-profile';
import type { SupportTicket } from '../../shared/programming-support';
const root=process.cwd();
const container=process.env.SUPPORT_EVALUATION_ISOLATED_JOB==='true';
if(container&&(process.env.APP_ENV!=='pilot'||['DATABASE_URL','ASSISTANT_DATABASE_URL','SUPPORT_SHARED_SECRET','RAILWAY_MARAN_PROJECT_TOKEN'].some(key=>!!process.env[key])))throw Error('Configuración de aislamiento inválida');
const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(!container&&git('status','--porcelain'))throw Error('La evaluación requiere una revisión sin cambios locales');
const revision=container?process.env.RAILWAY_GIT_COMMIT_SHA||'':git('rev-parse','HEAD');
if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Revisión inválida');
const cases=JSON.parse(await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)),'evaluation/codex-support-cases.json'),'utf8')) as Array<{id:string;title:string;module:string;actual:string;expected:string;page:string;checks:string[]}>;
const selectedIds=(process.env.SUPPORT_EVALUATION_CASES||'cash-empty-count,recipe-detail,missing-fact').split(',');
if(!selectedIds.length||selectedIds.length>6||new Set(selectedIds).size!==selectedIds.length||selectedIds.some(id=>!cases.some(item=>item.id===id)))throw Error('Selección de casos inválida');
const selected=selectedIds.map(id=>cases.find(item=>item.id===id)!);
class EvaluationSource extends CodeSource {
  async files(){return (await super.files()).filter(file=>!/(?:assistant|asistente|codex|programming-support|programming-diagnosis)/i.test(file));}
}
const snapshot=async()=>{
 const source=new EvaluationSource(root,revision),files=await source.files(),hash=createHash('sha256');
 for(const file of files)hash.update(file+'\0').update(await readFile(path.join(root,file))).update('\0');
 return {fileCount:files.length,sha256:hash.digest('hex')};
};
const before=await snapshot(),execute=container?process.env.SUPPORT_EVALUATION_ACTION==='evaluate':process.argv.includes('--execute');
if(container&&execute&&!evaluationRevisionAllowed(process.env))throw Error('Seleccionar explícitamente la revisión de la tanda');
if(before.fileCount===0)throw Error('Catálogo de código vacío');
const model=process.env.SUPPORT_CODEX_MODEL||null;
const reportedModels=new Set<string>();
const manifest:any={engine:'responses-api',sourceVerification:container?'container-content-hash':'clean-git-and-content-hash',revision,source:before,requestedModel:model,effectiveModel:null,executed:false,providerTurns:0,reportedTokens:0,estimatedUsd:0,usageIncomplete:false,cases:selectedIds,maxTurnsPerCase:16,maxReportedTokensPerCase:100000,maxContextCharsPerCase:120000,maxResearchToolsPerCase:10,groundScreen:true,humanReview:'pending',results:[]};
if(execute){
 const number=(key:string,zero=false)=>{const value=Number(process.env[key]);if(!process.env[key]||!Number.isFinite(value)||(zero?value<0:value<=0))throw Error(`Configurar ${key}`);return value;};
 if(process.env.SUPPORT_CODEX_PAID_ENABLED!=='true'||!process.env.OPENAI_API_KEY||!model)throw Error('Falta autorización de llamadas pagadas, clave o modelo explícito');
 const budget=number('SUPPORT_EVALUATION_APPROVED_USD'),inputRate=number('SUPPORT_EVALUATION_INPUT_USD_PER_MILLION'),outputRate=number('SUPPORT_EVALUATION_OUTPUT_USD_PER_MILLION'),cachedRate=number('SUPPORT_EVALUATION_CACHED_USD_PER_MILLION',true);
 if(budget>10||selectedIds.join(',')!=='cash-empty-count,recipe-detail,missing-fact')throw Error('Esta tanda admite únicamente los tres casos aprobados y hasta USD 10');
 if(!process.env.SUPPORT_EVALUATION_PRICE_SOURCE?.startsWith('https://'))throw Error('Registrar la fuente de los precios verificados');
 if(cachedRate>inputRate)throw Error('La tarifa de caché excede la de entrada');
 manifest.approvedUsd=budget;manifest.prices={inputRate,outputRate,cachedRate,source:process.env.SUPPORT_EVALUATION_PRICE_SOURCE,verifiedOn:process.env.SUPPORT_EVALUATION_PRICE_VERIFIED_ON||null};
 // Allow for the last bounded reply crossing the recorded-token limit.
 manifest.estimatedReservationUsd=selected.length*102500*Math.max(inputRate,outputRate,cachedRate)/1e6;
 if(manifest.estimatedReservationUsd>budget)throw Error('La reserva estimada de la tanda supera el presupuesto aprobado');
 manifest.executed=true;
 for(const item of selected){
  const ticket={id:item.id,title:item.title,module:item.module,actual:item.actual,expected:item.expected,page:item.page,reference:'',steps:'Sólo investigación de código; no ejecutar pruebas ni operaciones.',version:revision,messages:[],status:'received',environment:'pilot',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),createdBy:'synthetic-evaluator',report:null,lastError:null} as SupportTicket;
  try{
   const result=await investigateWithCodex(ticket,new EvaluationSource(root,revision),{apiKey:process.env.OPENAI_API_KEY,model,maxTurns:16,maxTokens:100000,maxContextChars:120000,maxResearchTools:10,groundScreen:true,timeoutMs:240000},async(key,name)=>createResponsesTransport(key,name,reported=>reportedModels.add(reported),125000));
   const usage=result.investigator!;manifest.providerTurns+=usage.providerTurns;manifest.reportedTokens+=result.tokens;
   manifest.estimatedUsd+=((usage.inputTokens-usage.cachedInputTokens)*inputRate+usage.cachedInputTokens*cachedRate+usage.outputTokens*outputRate)/1e6;
   manifest.results.push({id:item.id,result,evaluatorChecks:item.checks,humanVerdict:null});
  }catch(error){
   const failure=error as {code?:string;budgetReason?:string;budgetPhase?:string;rejectedDraft?:unknown;provenanceIssues?:string[];allowedReads?:unknown;usageIncomplete?:boolean;knownUsage?:{input:number;cachedInput:number;output:number};investigation?:{rounds:number;tokens:number}};
   manifest.providerTurns+=failure.investigation?.rounds||0;manifest.reportedTokens+=failure.investigation?.tokens||0;
   if(failure.knownUsage){const u=failure.knownUsage;manifest.estimatedUsd+=((u.input-u.cachedInput)*inputRate+u.cachedInput*cachedRate+u.output*outputRate)/1e6;}
   manifest.usageIncomplete=!!failure.usageIncomplete;manifest.results.push({id:item.id,failed:true,code:failure.code||'evaluation_failed',budgetReason:failure.budgetReason||null,budgetPhase:failure.budgetPhase||null,rejectedDraft:failure.rejectedDraft||null,provenanceIssues:failure.provenanceIssues||[],allowedReads:failure.allowedReads||[],usageIncomplete:!!failure.usageIncomplete,reportedTokens:failure.investigation?.tokens??null,humanVerdict:null});
   // Do not retry or advance to another billable case after a failure.
   manifest.stopped=true;break;
  }
  if(manifest.estimatedUsd>=budget){manifest.stopped=true;break;}
 }
}
const after=await snapshot();manifest.sourceUnchanged=before.sha256===after.sha256&&(container||git('rev-parse','HEAD')===revision&&!git('status','--porcelain'));
manifest.reportedModels=[...reportedModels];manifest.effectiveModel=reportedModels.size===1?[...reportedModels][0]:null;
const output=path.join(tmpdir(),`codex-support-evaluation-${Date.now()}.json`);await writeFile(output,JSON.stringify(manifest,null,2),{mode:0o600});
console.log(JSON.stringify({artifact:output,revision,executed:manifest.executed,cases:selectedIds,providerTurns:manifest.providerTurns,sourceUnchanged:manifest.sourceUnchanged}));
if(container)console.log(JSON.stringify(manifest));
if(!manifest.sourceUnchanged||manifest.stopped)process.exitCode=1;
