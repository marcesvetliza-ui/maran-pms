import type { Thread, Usage } from '@openai/codex-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
export type AgentReply = { text: string; model?:string; usage: { input: number; cachedInput: number; output: number } };
export interface AgentSession { run(prompt:string,schema:unknown,signal:AbortSignal):Promise<AgentReply>; }
export interface AgentTransport { session():AgentSession; close():Promise<void>; }
export const codexToolPolicy = {
  shell_tool:false, unified_exec:false, apply_patch_freeform:false, js_repl:false,
  multi_agent:false, apps:false, plugins:false, hooks:false, shell_snapshot:false,
};
/** Only the API credential is passed explicitly. Never inherit PMS/service secrets.
 * Paid evaluations must run in the isolated service/container, without host auth. */
export async function createCodexTransport(apiKey:string,model:string):Promise<AgentTransport> {
  if(!apiKey||!model.trim())throw Error('Configurar clave y modelo explícito de Codex');
  const { Codex } = await import("@openai/codex-sdk");
  const directory=await mkdtemp(path.join(tmpdir(),'support-codex-'));
  try {
  const codex=new Codex({apiKey,env:{PATH:process.env.PATH||'/usr/local/bin:/usr/bin:/bin'},
    config:{features:codexToolPolicy,project_doc_max_bytes:0,allow_login_shell:false},
    configOverrides:['mcp_servers={}'],
  });
  return {
    session(){
      const thread=codex.startThread({model,workingDirectory:directory,skipGitRepoCheck:true,
        sandboxMode:'read-only',approvalPolicy:'never',networkAccessEnabled:false,webSearchMode:'disabled'});
      return {run:(prompt,schema,signal)=>readTurn(thread,prompt,schema,signal)};
    },
    close:()=>rm(directory,{recursive:true,force:true}),
  };
  } catch(error) {
    await rm(directory,{recursive:true,force:true});
    throw error;
  }
}
/** Stream events are checked in addition to disabling native tools. This is a
 * guard, not a substitute for validating sandbox enforcement on the deployment. */
export async function readTurn(thread:Pick<Thread,'runStreamed'>,prompt:string,schema:unknown,signal:AbortSignal):Promise<AgentReply> {
  const controller=new AbortController();
  const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  try {
    const {events}=await thread.runStreamed(prompt,{outputSchema:schema,signal:controller.signal});
    let text='',usage:Usage|undefined,completed=false;
    for await(const event of events){
      if(event.type.startsWith('item.')&&'item' in event){
        if(!['agent_message','reasoning','todo_list'].includes(event.item.type)){
          controller.abort();throw Object.assign(Error('Codex solicitó una herramienta nativa no permitida'),{code:'codex_native_tool'});
        }
        if(event.type==='item.completed'&&event.item.type==='agent_message')text=event.item.text;
      }
      if(event.type==='turn.failed'||event.type==='error')throw Object.assign(Error('La ejecución de Codex no se completó'),{code:'codex_turn_failed'});
      if(event.type==='turn.completed'){usage=event.usage;completed=true;}
    }
    if(!completed||!usage||!text||text.length>40000)throw Object.assign(Error('Respuesta incompleta de Codex'),{code:'codex_protocol'});
    for(const value of [usage.input_tokens,usage.cached_input_tokens,usage.output_tokens])if(!Number.isSafeInteger(value)||value<0)throw Error('Uso de tokens inválido');
    if(usage.cached_input_tokens>usage.input_tokens)throw Error('Uso de caché inválido');
    return {text,usage:{input:usage.input_tokens,cachedInput:usage.cached_input_tokens,output:usage.output_tokens}};
  } finally {signal.removeEventListener('abort',abort);}
}
