import type {SupportDiagnosis} from "../../shared/programming-support";
const normalize=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

/** Explicit scope contradictions, not a general semantic proof of a diagnosis.
 * In particular, a hypothesis label does not authorize an unsupported repair.
 */
export function inferenceLimitIssues(report:SupportDiagnosis){
 const issues:Array<{field:string;code:string;guidance:string}>=[];
 const fields=[{field:"summary",text:report.summary},{field:"cause",text:report.cause},{field:"proposal",text:report.proposal},...report.evidence.map((ref,i)=>({field:`evidence.${i}.explanation`,text:ref.explanation}))];
 for(const field of fields)for(const sentence of normalize(field.text).split(/[.!?\n]+/)){
  // Generating current code's payload is not observation of the historical wire
  // request. Keep negations and narrow conclusions about current code intact.
  const exclusion=/\bdescarta(?:r)?\b[^.!?\n]{0,90}\b(?:error|fall[oa]|problema|rechazo)\b/.exec(sentence);
  if(!exclusion)continue;
  const prefix=sentence.slice(Math.max(0,exclusion.index-75),exclusion.index);
  if(/\bno\b[^.!?\n]{0,65}$|\bsin\s+(?:poder\s+)?$/.test(prefix))continue;
  if(/\b(?:si|podria|hipoteticamente)\b/.test(sentence))continue;
  if(!/\b(?:codigo|xml|genera\w*|constru\w*|revision|inclu\w*)\b/.test(sentence))continue;
  if(/\b(?:payload|xml|solicitud)\s+(?:real|capturad[ao]|adjunt[ao])\b/.test(sentence))continue;
  issues.push({field:field.field,code:"CURRENT_CODE_AS_INCIDENT_PROOF",guidance:"La generación/lectura del código actual no descarta un fallo del envío histórico. Separar lo que hace esta revisión de lo sucedido en el intento. No sustituir una causa no demostrada por otra: si falta el envío/revisión real, declarar que la causa no pudo determinarse y pedir sólo ese dato operativo si es indispensable."});
 }
 const uninspectedPersistence=report.limitations.some(text=>{
  const t=normalize(text);
  return /no se (?:reviso|inspecciono|verifico|analizo)|no (?:se tiene|hay) evidencia|sin (?:revisar|inspeccionar)/.test(t) && /persist\w*|guard\w*|almacen\w*|base de datos/.test(t) && /codigo|mecanismo|logica|implementacion|persistencia/.test(t);
 });
 if(uninspectedPersistence)for(const field of [{field:"proposal",text:report.proposal},{field:"dataRepair",text:report.dataRepair}]){
  for(const sentence of normalize(field.text).split(/[.!?\n]+/)){
   const action=/\b(?:implementar|agregar|anadir|modificar|cambiar|corregir|copiar)\b/.exec(sentence);
   if(!action || !/persist\w*|guard\w*|almacen\w*|base de datos/.test(sentence))continue;
   const prefix=sentence.slice(Math.max(0,action.index-65),action.index);
   if(/\bno\b[^.!?\n]{0,50}$|\bsin\s+$/.test(prefix))continue;
   if(/\bsi\b/.test(sentence))continue;
   issues.push({field:field.field,code:"UNINSPECTED_MECHANISM_REPAIR",guidance:"La propuesta cambia persistencia mientras el propio informe admite no haber inspeccionado ese mecanismo. Investigar la lectura/escritura y la dependencia real antes de recomendar cambios. Una hipótesis puede indicar qué observar y qué hallazgo la refutaría, pero no convierte una reparación especulativa en una solución. Es válido concluir que no se identificó la causa."});
   break;
  }
 }
 return issues.slice(0,6);
}
