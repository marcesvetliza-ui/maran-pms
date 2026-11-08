/** Isolated, non-inference credential/model check. Never starts the assistant. */
import OpenAI from 'openai';

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
    throw Error('Se requiere un trabajo aislado de evaluación piloto');
  }
  if (['DATABASE_URL','ASSISTANT_DATABASE_URL','SUPPORT_SHARED_SECRET','RAILWAY_MARAN_PROJECT_TOKEN'].some(key => !!process.env[key])) {
    throw Error('El trabajo no debe recibir credenciales operativas');
  }
  const action=process.env.SUPPORT_EVALUATION_ACTION || 'dry-run';
  if(action==='dry-run') {
    console.log(JSON.stringify({action,providerTurns:0,inferenceEnabled:false}));
    return;
  }
  if(action!=='models') throw Error('Acción no admitida: usar dry-run o models');
  if(!process.env.OPENAI_API_KEY) throw Error('Falta la referencia a la clave del asistente de Xenia');
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:30000});
  const models=await discoverModels(client);
  console.log(JSON.stringify({action,models,providerTurns:0,inferenceEnabled:false}));
}
