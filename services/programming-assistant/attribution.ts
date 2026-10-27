import type {SupportDiagnosis} from '../../shared/programming-support';
import type {CodeSource} from './source';

const normalized=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const missingEquivalence=(text:string)=>/falta[^.!?\n]{0,100}equivalenc|sin[^.!?\n]{0,60}equivalenc|no (?:encuentra|existe)[^.!?\n]{0,100}equivalenc/.test(normalized(text));

/** Bounded regression gate for the pilot's observed missing-equivalence error.
 * Not a general semantic verifier. Derives function ownership from the current
 * authorized source; does not assume that a function's name describes its role.
 */
export async function checkErrorAttribution(report:SupportDiagnosis,source:CodeSource) {
 const claims=[{field:'summary',text:report.summary},{field:'cause',text:report.cause},...report.evidence.map((e,index)=>({field:`evidence.${index}.explanation`,text:e.explanation}))];
 if(!claims.some(claim=>missingEquivalence(claim.text)))return [];
 const path=(await source.files()).find(path=>path==='server/inventoryUnits.ts');
 if(!path)return [];
 const read=await source.read(path,1,160);
 const reads=[read];
 // Follow explicit named re-exports through authorized source inspection. Main
 // moved inventoryUnitFactor to shared; the wrapper still owns conversion.
 const exports=[...read.content.matchAll(/export\s*\{([^}]+)\}\s*from/g)]
   .flatMap(match=>match[1].split(',').map(name=>name.trim()).filter(name=>/^[A-Za-z_$][\w$]*$/.test(name))).slice(0,4);
 for(const symbol of exports){
  const found=await source.inspectSymbol(symbol,{maxDefinitions:1,maxTests:0,lines:80});
  for(const definition of found.definitions)
   if(!reads.some(item=>item.path===definition.path && item.start<=definition.start && item.end>=definition.end))reads.push(definition);
 }
 const functions=reads.flatMap(read=>{
  const code=read.content.split('\n').map(line=>line.replace(/^\d+: /,'')).join('\n');
  const declarations=[...code.matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)];
  return declarations.map((match,index)=>{
   const start=match.index!,end=declarations[index+1]?.index??code.length;
   return {path:read.path,symbol:match[1],start:read.start+code.slice(0,start).split('\n').length-1,end:read.start+code.slice(0,end).trimEnd().split('\n').length-1,body:code.slice(start,end)};
  });
 });
 // This module's direct throw is small and locally inspectable. Do not infer
 // ownership from comments, import names or propagation through other modules.
 const owner=functions.find(fn=>fn.body.split('\n').some(line=>/^\s*throw\s+/.test(line)&&/falta equivalencia explicita/.test(normalized(line))));
 if(!owner)return [];
 const statement=owner.body.split('\n').find(line=>/^\s*throw\s+/.test(line)&&/falta equivalencia explicita/.test(normalized(line)))!.trim();
 const errors=[];
 for(const claim of claims){
  const mentions=[...claim.text.matchAll(/\b[A-Za-z_$][\w$]*\b/g)].filter(match=>functions.some(fn=>fn.symbol===match[0]));
  for(let index=0;index<mentions.length;index++){
   const mention=mentions[index];
   if(mention[0]===owner.symbol)continue;
   const fragment=claim.text.slice(mention.index!,Math.min(mentions[index+1]?.index??claim.text.length,mention.index!+650));
   const text=normalized(fragment);
   if(!missingEquivalence(fragment))continue;
   // Explicit distinctions and negations are not assertions of ownership.
   const prefix=normalized(claim.text.slice(Math.max(0,mention.index!-45),mention.index!));
   if(/(?:no es|no corresponde a|no proviene de|en vez de)\s*['"`]*$/.test(prefix)||/\bno (?:lanza|arroja|origina|produce|detecta|busca|consulta|genera|es responsable)\b/.test(text))continue;
   if(!/\b(?:lanza|arroja|origina|produce|detecta|genera|devuelve)\b|no encuentra/.test(text))continue;
   errors.push({field:claim.field,attributedSymbol:mention[0],origin:{path:owner.path,symbol:owner.symbol,start:owner.start,end:owner.end,statement},reason:'La función nombrada no es la que construye el mensaje de equivalencia faltante en este módulo. Corregir la atribución y citar la definición real; no conservar la explicación equivocada con menor certeza.'});
  }
 }
 return errors.slice(0,6);
}
