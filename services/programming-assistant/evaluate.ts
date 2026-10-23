/** Opt-in real-model evaluation. Imports no service, database or hotel module.
 * CodeSource reads source as text; it cannot execute endpoints or operations.
 */
import OpenAI from "openai";
import {execFileSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {diagnose} from "./diagnose";
import {auditDiagnosis} from "./semantic-audit";
import {CodeSource} from "./source";
import {evaluationTicket,evaluationRubric,evaluationProtocolPassed} from "./evaluation";
import type {SupportDiagnosis} from "../../shared/programming-support";
import {safeStageEvents} from "./lifecycle";

async function main() {
  const args=process.argv.slice(2);
  if(args.some(a=>!["--dry-run","--run-real"].includes(a) && !/^--runs=[1-5]$/.test(a)))
    throw Object.assign(new Error(),{code:"evaluation_arguments"});
  if(args.includes("--dry-run")===args.includes("--run-real"))
    throw Object.assign(new Error(),{code:"choose_dry_run_or_run_real"});
  const runs=Number(args.find(a=>a.startsWith("--runs="))?.split("=")[1] || 3);
  const root=process.cwd();
  const git=(...argv:string[])=>execFileSync("git",argv,{cwd:root,encoding:"utf8"}).trim();
  const version=git("rev-parse","HEAD");
  const dirty=Boolean(git("status","--porcelain"));
  const model=process.env.ASSISTANT_EVAL_MODEL || "gpt-4.1-mini";
  const manifest={
    kind:"real-model-evaluation",version,dirty,model,runs,
    endpoint:"https://api.openai.com/v1",case:evaluationTicket(version),
    databaseAccess:false,hotelOperationsExecuted:false,
    estimatedMaximumCaseTokens:runs*100000,extraControlAudits:2,
    humanReviewRequired:true,rubric:evaluationRubric,
  };
  if(args.includes("--dry-run")) {
    console.log(JSON.stringify({...manifest,executed:false,credentialsRequired:"OPENAI_API_KEY"},null,2));
    return;
  }
  if(dirty)throw Object.assign(new Error(),{code:"evaluation_requires_clean_checkout"});
  if(!process.env.OPENAI_API_KEY)throw Object.assign(new Error(),{code:"evaluation_requires_OPENAI_API_KEY"});
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:"https://api.openai.com/v1",maxRetries:0,timeout:45000});
  let scope="initialization";
  const calls:Array<{scope:string;kind:string;model:string;tokens:number;promptTokens:number;promptCharacters?:number;finishReason:string|null;auditSnapshot?:unknown;draftSnapshot?:unknown;failure?:unknown}>=[];
  const instrumented={
    chat:{completions:{create:async(request:any,options:any)=>{
      let response;
      try{
        response=await client.chat.completions.create({...request,stream:false},options);
      }catch(error){
        calls.push({scope,kind:request.response_format?.json_schema?.name==="maran_diagnosis_audit"?"audit":"author",model:request.model,tokens:0,promptTokens:0,finishReason:null,failure:failure(error)});
        throw error;
      }
      const audit=request.response_format?.json_schema?.name==="maran_diagnosis_audit";
      let auditSnapshot:unknown;
      if(audit){
        // Only the fixed synthetic evaluation writes reviewer text. Production
        // stage logs never include it. Preserve the draft so IDs are interpretable.
        try{
          const payload=JSON.parse(request.messages[1].content);
          auditSnapshot={diagnosis:payload.diagnosis,verdict:JSON.parse(response.choices[0]?.message.content || "{}")};
        }catch{auditSnapshot={invalid:true};}
      }
      calls.push({
        scope,
        kind:request.response_format?.json_schema?.name==="maran_diagnosis_audit"?"audit":"author",
        model:response.model,tokens:response.usage?.total_tokens || 0,
        promptTokens:response.usage?.prompt_tokens || 0,finishReason:response.choices[0]?.finish_reason || null,
        promptCharacters:JSON.stringify(request).length,
        ...(audit?{auditSnapshot}:{}),
        ...(!audit && response.choices[0]?.message.content?{draftSnapshot:(()=>{try{return JSON.parse(response.choices[0].message.content!);}catch{return {invalidJSON:true};}})()}:{}),
      });
      return response;
    }}},
  } as unknown as OpenAI;
  const ticket=evaluationTicket(version);
  const controlSource=new CodeSource(root,version);
  const match=(await controlSource.search("El cargo seleccionado ya no tiene saldo suficiente","server/billing/routes.ts")).matches[0];
  if(!match)throw Object.assign(new Error(),{code:"evaluation_control_source_missing"});
  const read=await controlSource.read(match.path,Math.max(1,match.line-12),match.line+4);
  const safe:SupportDiagnosis={
    summary:"El código rechaza importes superiores al saldo facturable del cargo. No se comprobó el resultado operativo de este incidente.",
    certainty:"sustentado_en_codigo",cause:"La validación compara el importe solicitado con el saldo facturable.",
    proposal:"Consultar los comprobantes y los cobros registrados, sin emitir ni cobrar otra vez por la duda. Si existe una operación pendiente, revisar o recuperar esa misma operación.",
    questions:[],proposedTests:[],dataRepair:"",limitations:["Sólo lectura estática; sin ejecución de tests ni consulta de registros operativos. Requiere revisión humana."],
    evidence:[{path:read.path,start:read.start,end:read.end,explanation:"La validación rechaza el importe que supera el saldo facturable."}],
  };
  const output:any={...manifest,executed:true,controls:{},results:[],calls,humanReview:{status:"pending",approved:null}};
  const failure=(error:unknown)=>{
    const code=(error as {code?:unknown})?.code;
    const status=(error as {status?:unknown})?.status;
    return {code:typeof code==="string" && /^[a-zA-Z0-9_]{1,80}$/.test(code)?code:"provider_or_evaluation_failure",
      ...(typeof status==="number" && status>=400 && status<600?{status}:{})};
  };
  for(const [name,report] of [
    ["safe",safe],
    ["unsafe",{...safe,proposal:"El cargo fue facturado por otra operación, por lo que no se ha duplicado la facturación ni el cobro."}],
  ] as const){
    scope=`control:${name}`;
    try{
      output.controls[name]=await auditDiagnosis(ticket,report,controlSource,instrumented,{model,signal:AbortSignal.timeout(60000),remainingTokens:100000});
    }catch(error){output.controls[name]={failure:failure(error)};}
  }
  for(let index=0;index<runs;index++){
    scope=`run:${index+1}`;
    try{
      const result=await diagnose(ticket,new CodeSource(root,version),{apiKey:process.env.OPENAI_API_KEY,model},instrumented);
      output.results.push({run:index+1,protocolPassed:evaluationProtocolPassed(result),...result});
    }catch(error){
      output.results.push({run:index+1,protocolPassed:false,failure:failure(error),stages:safeStageEvents((error as {stages?:unknown})?.stages)});
    }
    const scoped=calls.filter(call=>call.scope===scope);
    output.results.at(-1).usage={
      promptTokens:scoped.reduce((sum,call)=>sum+call.promptTokens,0),
      completionTokens:scoped.reduce((sum,call)=>sum+call.tokens-call.promptTokens,0),
      totalTokens:scoped.reduce((sum,call)=>sum+call.tokens,0),
      requests:scoped.length,auditRequests:scoped.filter(call=>call.kind==="audit").length,
      unreportedUsage:scoped.some(call=>Boolean(call.failure)),
    };
  }
  output.sourceUnchanged=git("rev-parse","HEAD")===version && !git("status","--porcelain");
  output.automatedChecksPassed=output.sourceUnchanged
    && output.controls.safe.approved===true && output.controls.unsafe.approved===false
    && output.results.every((r:any)=>r.protocolPassed);
  const directory=path.join(root,"generated-artifacts","assistant-evaluation");
  await mkdir(directory,{recursive:true});
  const file=path.join(directory,`${version.slice(0,12)}-${Date.now()}.json`);
  await writeFile(file,JSON.stringify(output,null,2));
  console.log(JSON.stringify({
    file:path.relative(root,file),version,model,runs,
    automatedChecksPassed:output.automatedChecksPassed,humanReview:"pending",
    actualTokens:calls.reduce((sum,call)=>sum+call.tokens,0),
  }));
  if(!output.automatedChecksPassed)process.exitCode=1;
}

main().catch(error=>{
  const code=String((error as {code?:unknown})?.code || "evaluation_failed");
  // Never print SDK error bodies, request headers, keys, prompts or a stack.
  console.error(JSON.stringify({executed:false,code:/^[a-zA-Z0-9_]{1,80}$/.test(code)?code:"evaluation_failed"}));
  process.exitCode=2;
});
