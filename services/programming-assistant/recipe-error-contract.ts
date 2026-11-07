import type {CodeSource} from './source';
import type {SupportDiagnosis} from '../../shared/programming-support';

/** Independent source packet: the author cannot hide the message constructor
 * by choosing to cite only the endpoint. Unknown code shapes remain unknown. */
export async function recipeErrorContract(source:CodeSource) {
  const route='server/inventoryStage2Routes.ts';
  if(!source.readRanges.has(route))return undefined;
  const files=await source.files();
  if(!files.includes(route)||!files.includes('server/inventoryStockEngine.ts'))return undefined;
  const endpoint=(await source.search("app.post('/api/inventory/recipe-stock-preview'",route)).matches.find(m=>m.path===route);
  const lookup=(await source.search('export async function unitFactor(','server/inventoryStockEngine.ts')).matches.find(m=>m.path==='server/inventoryStockEngine.ts');
  if(!endpoint||!lookup)return undefined;
  if(!source.readRanges.get(route)?.some(([start,end])=>start<=endpoint.line&&end>=endpoint.line))return undefined;
  const handler=await source.read(route,endpoint.line,endpoint.line+7);
  const wrapper=await source.read(lookup.path,lookup.line,lookup.line+4);
  const originPath='shared/inventoryUnits.ts';
  const definition=files.includes(originPath)?(await source.search('export function inventoryUnitFactor(',originPath)).matches.find(m=>m.path===originPath):undefined;
  const origin=definition?await source.read(originPath,definition.line,definition.line+24):undefined;
  if(!origin)return {readings:[handler,wrapper],unitOnlyMessage:false};
  const message=origin.content.match(/throw\s+(?:Object\.assign\(\s*)?fail\((`Falta equivalencia explícita[^`]+`)\)/)?.[1];
  // Only assert this narrow fact when all three current expressions match.
  // Changes to enrichment/transport invalidate the fact instead of retaining
  // an old expectation about what the server must return.
  const unitOnlyMessage=message==='`Falta equivalencia explícita de ${from} a ${to} para este artículo`'
    && /return inventoryUnitFactor\(from,to,/.test(wrapper.content)
    && !/\bcatch\b|\bthrow\b/.test(wrapper.content)
    && /catch\(e:any\)\{res\.status\(e\.statusCode\|\|500\)\.json\(\{error:e\.message\}\)/.test(handler.content)
    && /const factor=await unitFactor\(db,item\.id,line\.unit \|\| item\.unit,item\.unit\)/.test(handler.content);
  return {readings:[origin,wrapper,handler],message,unitOnlyMessage};
}

/** Observed regression only, not a general language truth checker. Positive
 * identity claims must not be excused by an unrelated disclaimer elsewhere. */
export function recipeMessageIdentityIssues(report:SupportDiagnosis,contract:Awaited<ReturnType<typeof recipeErrorContract>>) {
  if(!contract?.unitOnlyMessage)return [];
  const claims=[{field:'summary',text:report.summary},{field:'cause',text:report.cause},{field:'proposal',text:report.proposal},...report.evidence.map((ref,i)=>({field:`evidence.${i}.explanation`,text:ref.explanation}))];
  return claims.flatMap(({field,text})=>text.split(/(?<=[.!?;])\s+|\n|\bpero\b|\bsin embargo\b/i).flatMap(sentence=>{
    const normalized=sentence.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const positive=/detalle que identifica (?:al |el )?(?:ingrediente|insumo|articulo)|(?:permitira|permite|permitiria)[^.!?;\n]{0,65}(?:que|cual) (?:ingrediente|insumo|articulo)|(?:mensaje|detalle|servidor|backend)[^.!?;\n]{0,80}(?:incluye|contiene|identifica|individualiza|provee|proporciona)[^.!?;\n]{0,45}(?:(?:nombre|identificador|identidad)|(?:que|cual|al) (?:ingrediente|insumo|articulo))/.test(normalized);
    const negated=/\bno (?:incluye|contiene|identifica|individualiza|permite|permitira|provee|proporciona)\b|no (?:se )?(?:debe|puede) (?:afirmarse|afirmar|decirse|decir|asegurarse)/.test(normalized);
    const conditionalEnrichment=/(?:si|cuando|una vez)[^.!?;\n]{0,55}(?:agrega|incorpora|enriquece|incluye)[^.!?;\n]{0,45}(?:nombre|identificador|identidad)/.test(normalized);
    return positive&&!negated&&!conditionalEnrichment?[{field,code:'MESSAGE_ITEM_IDENTITY_UNSUPPORTED',guidance:'La expresión del mensaje y sus propagadores actuales sólo aportan las unidades; no contienen nombre/id del ingrediente. Corregir esta afirmación concreta, incluso si otro párrafo declara limitaciones. Un parser no crea ese dato. Distinguir recuperación del detalle existente y enriquecimiento pendiente.',message:contract.message,readings:contract.readings.map(({path,start,end,content})=>({path,start,end,content}))}]:[];
  })).slice(0,4);
}
