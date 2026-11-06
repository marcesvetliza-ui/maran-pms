import type {SupportDiagnosis,SupportTicket} from '../../shared/programming-support';
import type {CodeSource} from './source';
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const cashReasoningInstruction=`Para Caja distinguí tres ejes: clase del comprobante, tipo del movimiento (income/expense/informational) y medio de pago. La clase fiscal/no fiscal no demuestra por sí sola el tipo de movimiento ni su efecto en efectivo. Leé la creación del cobro pertinente, el cálculo del efectivo esperado y el conteo/diferencia en la pantalla antes de atribuir un signo al comprobante. Que un bucle excluya informational no demuestra que los cobros no fiscales entren en esa rama. Contrastá explicación y aritmética con los valores aportados, sin certificar movimientos históricos no consultados. Una diferencia contado menos esperado no es un egreso. No sugerir inventar un conteo para cuadrar ni registrar nuevamente dinero ya cobrado. Las pruebas con cierre, emisión, anulación u otros cambios de estado deben ser simulaciones con datos sintéticos en un entorno aislado; nunca cerrar turnos operativos para diagnosticar. Una explicación correcta puede concluir que no se identificó un defecto.`;
export function isCashInvestigation(ticket:SupportTicket){return /\bcaja\b|cash|conteo|efectivo/.test(normalize(`${ticket.module||''} ${ticket.title||''} ${ticket.actual||''} ${ticket.expected||''} ${ticket.messages?.map(m=>m.text).join(' ')||''}`));}
/** Actual source orientation, not an answer template or an incident database. */
export async function orientCashReview(source:CodeSource,spa=false){
 const files=await source.files();
 const anchors=[
  {path:'shared/cash-document-classification.ts',term:'export function cashDocumentSummary',before:0,after:5},
  {path:'client/src/pages/cash-register.tsx',term:'const efectivoContado =',before:0,after:7},
  {path:'client/src/pages/cash-register.tsx',term:'const efectivoSistema =',before:1,after:4},
  {path:'client/src/pages/cash-register.tsx',term:'Sistema (efectivo):',before:6,after:15},
  {path:'server/db-storage.ts',term:'const sign = m.movementType === "expense" ? -1 : 1;',before:35,after:12},
  ...(spa?[{path:'server/routes/spa.ts',term:'receiptType: "cierre_spa"',before:12,after:4}]:[]),
 ];
 const readings=[];
 for(const anchor of anchors){
  if(!files.includes(anchor.path))continue;
  const match=(await source.search(anchor.term,anchor.path)).matches.find(m=>m.path===anchor.path);
  if(match)readings.push(await source.read(anchor.path,Math.max(1,match.line-anchor.before),match.line+anchor.after));
 }
 return readings;
}
/** Bounded contradiction checks. They do not replace source review or prove an incident. */
export function cashReasoningIssues(report:SupportDiagnosis){
 const issues:Array<{field:string;code:string;guidance:string}>=[];
 const fields=[{field:'summary',text:report.summary},{field:'cause',text:report.cause},{field:'proposal',text:report.proposal},...report.evidence.map((r,i)=>({field:`evidence.${i}.explanation`,text:r.explanation}))];
 for(const field of fields)for(const sentence of normalize(field.text).split(/[.!?\n]+/)){
  if(!/comprobantes? no fiscales?|cobros? no fiscales?/.test(sentence))continue;
  if(/no (?:significa|implica|demuestra|permite concluir)|no (?:todos|todo|siempre|necesariamente)|no (?:son|es) (?:necesariamente )?informational|no (?:esta|quedo) (?:demostrado|probado)|no se (?:puede|pudo) (?:afirmar|deducir|concluir)|independiente|distinguir|distingu\w*|separar|por si sol[oa]s?|\bsi\b|\bcuando\b/.test(sentence))continue;
  if(/\binformational\b|(?:son|es|como|tipo|marcad\w*)[^.!?]{0,30}\binformativ\w*/.test(sentence))
   issues.push({field:field.field,code:'NON_FISCAL_AS_MOVEMENT_TYPE',guidance:'No deducir que un cobro es informational por tener comprobante no fiscal. Son ejes independientes. Seguir la creación del movimiento y verificar su tipo y medio; excluir una rama no demuestra que estos cobros entren en ella.'});
  if(/\b(?:todos|siempre|necesariamente)\b/.test(sentence)&&/suman?|ingresos?|efectivo/.test(sentence))
   issues.push({field:field.field,code:'NON_FISCAL_ALWAYS_CASH',guidance:'No invertir la generalización: un no fiscal tampoco demuestra siempre dinero nuevo. Confirmar tipo income y medio efectivo, y separar cortesías, canjes e imputaciones sin cobro.'});
  if(/no (?:deben? )?(?:restar ni sumar|sumar ni restar)|no (?:afectan?|impactan?|suman?|se suman?)[^.!?]{0,45}(?:efectivo|saldo fisico|caja)|solo (?:deben? )?reflejar ingresos informativos/.test(sentence))
   issues.push({field:field.field,code:'NON_FISCAL_NEVER_CASH',guidance:'La clase no fiscal no excluye un ingreso en efectivo. Distinguir cobro nuevo, egreso e imputación informativa. No cambiar signos ni recomendar excluir todos los no fiscales del efectivo.'});
 }
 for(const [i,test] of report.proposedTests.entries()){
  const text=normalize(test);
  const action=/\b(?:cerrar|confirmar|emitir|anular|registrar|descontar)\b/.exec(text);
  if(!action||!/(?:turno|comprobante|factura|cobro|pago|stock|movimiento)/.test(text))continue;
  if(/\bleer\b|inspeccion|revisar (?:el )?codigo|simul\w*|datos sinteticos|base (?:local )?de pruebas|entorno (?:aislado|de pruebas)|sin confirmar|sin (?:cerrar|emitir|anular|registrar|descontar)/.test(text))continue;
  const prefix=text.slice(Math.max(0,action.index-35),action.index);
  if(/\bno\s+(?:se\s+)?$|\bsin\s+$/.test(prefix))continue;
  issues.push({field:`proposedTests.${i}`,code:'LIVE_STATE_CHANGE_AS_TEST',guidance:'La inspección no autoriza cerrar turnos, emitir/anular comprobantes, registrar cobros o afectar stock para comprobar una hipótesis. Proponer una simulación con datos sintéticos en un entorno aislado, o una comprobación de lectura sin confirmar operaciones.'});
 }
 return issues.slice(0,8);
}
