import {isCreditNoteRecoveryCoverage} from "./credit-note-recovery";
import type {SupportDiagnosis} from '../../shared/programming-support';
import type {CodeSource} from './source';
const norm=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const operationalTest=(path:string)=>(path.includes('/tests/')||path.includes('.test.'))&&!/programming-(assistant|diagnosis|support)/.test(path);

/** Checks explicit, mechanically verifiable claims. Not a general proof of prose. */
export async function validateReportClaims(report:SupportDiagnosis,source:CodeSource,coverage:readonly string[] = []) {
 const issues:Array<Record<string,unknown>>=[];
 // Coverage is derived from the case, not the author's labels. A grounded
 // explanation of this recovery must cite the handler and the screen involved.
 if(isCreditNoteRecoveryCoverage(coverage)){
  let backend=false,screen=false;
  for(const ref of report.evidence){
   if(ref.path==="server/billing/routes.ts"){
    const route=await source.routeAt(ref);
    backend ||= !!route && route.method==="POST" && route.endpoint==="/api/billing/credit-notes/:id/reconcile" && route.containsRange;
   }
   if(ref.path==="client/src/pages/billing.tsx"){
    const read=await source.read(ref.path,ref.start,Math.min(ref.end,ref.start+159));
    screen ||= read.content.includes("Reintentar y conciliar");
   }
  }
  if(!backend || !screen)issues.push({field:"evidence",code:"RECOVERY_WORKFLOW_NOT_SUPPORTED",missing:{backend:!backend,screen:!screen},guidance:"La conclusión sobre una NC pendiente debe contrastarse y citarse contra el handler real de recuperación y la acción de Facturación. Los guards para borrar pagos, reemplazar facturas o las referencias de Caja de Restaurant no demuestran esa conciliación. Usar las lecturas verificadas de orientación, investigar lo que falte antes de concluir; cambiar sólo la certeza no respalda el circuito ni autoriza otra operación. No inventar la causa del incidente."});
 }
 const endpoints=[...new Set([...`${report.summary}\n${report.cause}`.matchAll(/\/api\/[A-Za-z0-9_/:.-]+/g)].map(match=>match[0].replace(/[.,]+$/,'')))];
 const tests:Array<{path:string;content:string}>=[];
 for(let index=0;index<report.evidence.length;index++) {
  const ref=report.evidence[index];
  const test=operationalTest(ref.path);
  if(test){
   const read=await source.read(ref.path,ref.start,Math.min(ref.end,ref.start+159));
   tests.push({path:ref.path,content:read.content});
  }
  // A reference to a helper or client call is not a claim to own the route.
  if(!ref.path.startsWith('server/')||test||!/(?:endpoint|handler|ruta)\s+(?:GET|POST|PATCH|PUT|DELETE)\b/i.test(ref.explanation))continue;
  const method=ref.explanation.match(/\b(GET|POST|PATCH|PUT|DELETE)\b/i)![1].toUpperCase();
  const endpoint=ref.explanation.match(/\/api\/[A-Za-z0-9_/:.-]+/)?.[0].replace(/[.,]+$/,'') || (endpoints.length===1?endpoints[0]:undefined);
  if(!endpoint)continue;
  const actual=await source.routeAt(ref);
  if(!actual || actual.method!==method || actual.endpoint!==endpoint || !actual.containsRange)issues.push({field:`evidence.${index}`,code:'ENDPOINT_CITATION_MISMATCH',expected:{method,endpoint},actual:actual && {method:actual.method,endpoint:actual.endpoint,declaration:actual.declaration},guidance:'La cita no pertenece al handler indicado o cruza otra ruta. Usar trace_endpoint, citar el módulo y rango reales y corregir la explicación.'});
 }
 const claims=[{field:'summary',text:report.summary},{field:'cause',text:report.cause},...report.evidence.map((ref,index)=>({field:`evidence.${index}.explanation`,text:ref.explanation}))];
 for(const claim of claims) {
  const patterns=[/\b(?:pruebas|tests)\s+(?:unitarias|unitarios|de integracion|integradas)?\s*(?:para|de|sobre)\s+['"`]?([A-Za-z_$][\w$]*)/gi,/\b(?:funcion|metodo|helper)\s+['"`]?([A-Za-z_$][\w$]*)['"`]?[^.!?\n]{0,90}\b(?:probad[ao]|cubiert[ao]|testeada)[^.!?\n]{0,35}\b(?:tests|pruebas)/gi];
  // Accent removal keeps string offsets stable, including camelCase symbols.
  const text=claim.text.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for(const pattern of patterns)for(const match of text.matchAll(pattern)) {
   const prefix=norm(text.slice(Math.max(0,match.index!-80),match.index!));
   if(/\b(?:no|sin|ninguna|ningun)\b[^.!?\n]{0,65}$/.test(prefix))continue;
   const symbol=match[1];
   if(['la','el','una','un','este','esta','ese','esa'].includes(norm(symbol)))continue;
   if(!/\b(funcion|metodo|helper)\b/i.test(match[0]) && !/[a-z][A-Z]|_|\$/.test(symbol) && !/[`'"]/.test(match[0]))continue;

   const direct=new RegExp(`\\b(?:expect|assert(?:\\.\\w+)?)\\s*\\(\\s*(?:await\\s+)?(?:[A-Za-z_$][\\w$]*\\.)*${escape(symbol)}\\s*\\(`);
   if(!tests.some(test=>direct.test(test.content)))issues.push({field:claim.field,code:'TESTED_SYMBOL_WITHOUT_ASSERTION',symbol,citedTestPaths:tests.map(test=>test.path),guidance:'La afirmación de pruebas para esta función requiere citar una aserción operativa que pruebe ese símbolo. Una prueba de otra función o un mock no demuestra su comportamiento. Buscar pruebas y citar lo leído; si sólo hay evidencia de otra función, describirla con su nombre y alcance real. No declarar ausencia general de tests.'});
  }
 }
 return issues.slice(0,6);
}
