import type {SupportDiagnosis} from '../../shared/programming-support';
const norm=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

/** Explicit contradictions and retry advice in read-only financial diagnoses.
 * Bounded language rules, not proof of all prose or access to operational state.
 */
export function financialConsistencyIssues(report:SupportDiagnosis) {
 const fields=[{field:'summary',text:report.summary},{field:'cause',text:report.cause},{field:'proposal',text:report.proposal},...report.evidence.map((ref,index)=>({field:`evidence.${index}.explanation`,text:ref.explanation}))];
 if(!/factur|cobro|caja|comprobante|pago|emision/.test(norm(fields.map(field=>field.text).join(' '))))return [];
 const issues:Array<{field:string;code:string;guidance:string}>=[];
 for(const field of fields)for(const sentence of norm(field.text).split(/[.!?\n]+/)) {
  const scope=/\b(?:codigo|test|tests|prueba|pruebas|mock|mocks|simulad[ao]|escenario)\b/.test(sentence);
  const actualMoney=/no (?:existe|hubo|hay|ocurrio|se produjo|se registro)\s+(?:un[ao]?\s+)?(?:doble cobro|cobros? duplicad[oa]s?|doble factur\w*|facturas? duplicad[oa]s?)|no se (?:cobro|facturo) dos veces/.test(sentence);
  const cannotConfirm=/no (?:se )?(?:puede|podemos|permite|logra)[^.!?]{0,55}(?:afirmar|confirmar|concluir|determinar)|no (?:debe|corresponde)[^.!?]{0,40}(?:afirmar|interpretar|suponer)|sin (?:poder )?confirmar/.test(sentence);
  if(actualMoney && !scope && !cannotConfirm)issues.push({field:field.field,code:'UNVERIFIED_OPERATIONAL_OUTCOME',guidance:'El asistente no consultó registros operativos. No afirmar que no hubo doble cobro/factura en el caso concreto. Distinguir protección del código de resultado observado y explicar cómo revisar comprobantes y Caja.'});
  const fiscalReal=/\bemision(?: fiscal)? real\b|\bfactura real\b/.test(sentence);
  const negatedReal=/\bno\b[^.!?]{0,55}(?:emision(?: fiscal)? real|factura real)|sin[^.!?]{0,40}(?:emision(?: fiscal)? real|factura real)/.test(sentence);
  if(fiscalReal && /\b(?:test|tests|prueba|pruebas|mock|mocks|simulad[ao])\b/.test(sentence) && !negatedReal)issues.push({field:field.field,code:'SIMULATED_TEST_AS_REAL_ISSUANCE',guidance:'Una aserción leída con emisor/persistencia simulados no acredita emisión fiscal real. Describir exactamente su alcance y aclarar que el asistente no ejecutó esa prueba.'});
  if(!['summary','proposal'].includes(field.field))continue;
  const retry=/\breintent\w*\b|\breemit\w*\b|volver a (?:emitir|facturar|cobrar)/.test(sentence);
  const negativeRetry=/\bno\b[^.!?]{0,55}(?:reintent\w*|reemit\w*|volver a)|evitar[^.!?]{0,40}(?:reintent\w*|reemit\w*)|sin volver a/.test(sentence);
  const safeRecovery=/recuper\w*|reanud\w*|mism[ao] (?:operationid|uuid|operacion|intento)|sin crear (?:otra|una nueva)|antes de (?:reintentar|reemitir|volver a)/.test(sentence);
  const uncertainRetry=/duda|anomalia|inciert|desconoc|si es necesario|estado pendiente/.test(sentence);
  if(retry && !negativeRetry && !safeRecovery && uncertainRetry)issues.push({field:field.field,code:'REISSUE_WHILE_STATE_UNKNOWN',guidance:'Ante duda o estado incierto, no indicar otra emisión/cobro. Primero consultar estado, comprobantes y Caja; si existe una operación pendiente, recuperar esa misma identidad sin crear otra.'});
 }
 return issues.slice(0,6);
}
