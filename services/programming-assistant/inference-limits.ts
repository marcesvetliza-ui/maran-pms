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
 // A provider rejection is not observation of the input value that caused it.
 // This deliberately bounded check catches explicit missing-input admissions,
 // not every hypothesis or a static defect established by a source expression.
 const missingIncidentInput=report.limitations.some(text=>{
  const t=normalize(text);
  return /no se dispone|no se conoce|no se (?:observo|capturo)|sin (?:conocer|observar|capturar)/.test(t) &&
    /(?:fecha|importe|valor|dato|entrada|payload|solicitud)/.test(t) &&
    /env(?:io|iado|iada)|solicitud|intento|incidente|ejecucion/.test(t);
 });
 if(missingIncidentInput){
  const cause=normalize(report.cause);
  const inputHypothesis=/(?:puede|podria) (?:deberse|ser)|posible (?:causa|origen)|causa probable/.test(cause);
  if(report.certainty==='sustentado_en_codigo' && inputHypothesis)
   issues.push({field:'cause',code:'UNOBSERVED_INPUT_AS_CODE_CAUSE',guidance:'El propio informe desconoce el dato del intento y sólo propone una posible causa. No presentar esa atribución como sustentada en código. Identificar el defecto concreto de la expresión leída o concluir que no se determinó la causa histórica; separar hipótesis condicionales de hallazgos y no recomendar cambios para una asignación no demostrada.'});
  if(/(?:esto|ello|lo (?:anterior|cual)) queda evidenciado|(?:esto|ello) (?:demuestra|confirma|prueba)/.test(cause))
   issues.push({field:'cause',code:'PROVIDER_ERROR_AS_INPUT_PROOF',guidance:'Capturar el rechazo del proveedor no evidencia el valor ni el defecto de una entrada que el informe admite desconocer. No usar el error genérico como prueba de una fecha, importe o asignación concreta. Explicar qué demuestra el código, qué prueba el rechazo y qué no se pudo determinar del incidente.'});
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
