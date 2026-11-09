import OpenAI from 'openai';
import type { ResponseCreateParamsNonStreaming, Response } from 'openai/resources/responses/responses';
import type { AgentTransport } from './codex-transport';

export type ResponsesClient={responses:{create(body:ResponseCreateParamsNonStreaming,options:{signal:AbortSignal}):PromiseLike<Response>}};
/** No native tools, remote sessions, host authentication, or operational access. */
export function responsesTransport(client:ResponsesClient,model:string,onModel:(model:string)=>void=()=>{}):AgentTransport {
  if(!model.trim())throw Error('Modelo explícito requerido');
  return {
    session(){
      const history:Array<{role:'user'|'assistant';content:string}>=[];
      return {async run(prompt,schema,signal){
        const input=[...history,{role:'user' as const,content:prompt}];
        if(input.reduce((n,item)=>n+item.content.length,0)>65000)throw Object.assign(Error('Contexto excedido'),{code:'codex_budget'});
        const response=await client.responses.create({model,input,store:false,stream:false,tools:[],tool_choice:'none',
          max_output_tokens:2500,reasoning:{effort:'low'},text:{format:{type:'json_schema',name:'support_agent_step',schema:schema as Record<string,unknown>,strict:true}}}, {signal});
        // No tool output is executed, even if a provider unexpectedly returns it.
        if(response.output.some(item=>!['message','reasoning'].includes(item.type)))throw Object.assign(Error('Herramienta no permitida'),{code:'codex_native_tool'});
        const usage=response.usage;
        if(response.status!=='completed'||!response.output_text||response.output_text.length>40000||!usage||!response.model)throw Object.assign(Error('Respuesta incompleta'),{code:'codex_protocol'});
        const values=[usage.input_tokens,usage.output_tokens,usage.input_tokens_details.cached_tokens];
        if(values.some(value=>!Number.isSafeInteger(value)||value<0)||values[2]>values[0])throw Object.assign(Error('Uso inválido'),{code:'codex_protocol'});
        onModel(response.model);
        history.push({role:'user',content:prompt},{role:'assistant',content:response.output_text});
        return {text:response.output_text,usage:{input:values[0],output:values[1],cachedInput:values[2]}};
      }};
    },
    async close(){},
  };
}
export function createResponsesTransport(apiKey:string,model:string,onModel?:(model:string)=>void) {
  if(!apiKey.trim())throw Error('Clave requerida');
  return responsesTransport(new OpenAI({apiKey,maxRetries:0,timeout:60000}),model,onModel);
}
