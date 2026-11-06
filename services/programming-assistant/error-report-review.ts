import type {SupportDiagnosis,SupportTicket} from '../../shared/programming-support';
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const errorReportReviewInstruction=`En errores de interfaz, separar origen del mensaje, propagación, transporte y presentación. Una reexportación no demuestra dónde se construye o lanza el error: citar la implementación y el throw reales cuando se atribuye allí el origen. Comparar cada expectativa operativa con el contenido real del mensaje y con la propuesta. Mostrar el texto mediante un parser no agrega información que el servidor no envió. Si se pide identificar un ingrediente, distinguir las unidades faltantes del nombre/identificador del insumo: indicar qué ya contiene el mensaje, qué recupera la presentación y qué queda pendiente. Una solución parcial puede ser válida si declara su alcance; no presentarla como cumplimiento completo ni inventar datos del incidente. Proponer enriquecimiento del contexto sólo tras seguir las llamadas pertinentes; no cambiar el motor de conversiones por un problema de presentación.`;
/** Detects omission of the user's explicit identification requirement; not semantic proof. */
export function errorProposalCoverageIssues(report:SupportDiagnosis,ticket:SupportTicket){
 const request=normalize(`${ticket.actual||''} ${ticket.expected||''} ${ticket.messages?.map(m=>m.text).join(' ')||''}`);
 if(!/receta|equivalenc/.test(request))return [];
 const identityRequested=/(?:que|cual(?:es)?)\s+(?:(?:es|son|el|la|los|las|de)\s+){0,4}(?:ingrediente|insumo|articulo)|(?:identificar|identifique|nombre|identificador)[^.!?\n]{0,40}(?:ingrediente|insumo|articulo)|(?:ingrediente|insumo)[^.!?\n]{0,35}(?:nombre|identificador)/.test(request);
 const proposal=normalize(report.proposal);
 if(!identityRequested||!/parseapierror|parser|mostrar (?:el )?(?:mensaje|error)|mensaje detallado/.test(proposal))return [];
 const explanation=normalize(`${report.summary} ${report.cause} ${report.proposal}`);
 const gapAcknowledged=/(?:no|sin|falta|pendiente|no permite)[^.!?\n]{0,65}(?:nombre|identific|identidad)|(?:nombre|identific|identidad)[^.!?\n]{0,55}(?:no |falta|pendiente|ausente)/.test(explanation);
 const contextAddressed=/(?:agregar|anadir|incorporar|enriquecer|incluir|propagar|adjuntar|devolver)[^.!?\n]{0,80}(?:nombre|identific|identidad)|(?:nombre|identific)[^.!?\n]{0,55}(?:ya (?:esta|viene|figura)|esta incluido|se incluye)/.test(explanation);
 if(gapAcknowledged||contextAddressed)return [];
 return [{field:'proposal',code:'REQUESTED_ITEM_IDENTITY_UNADDRESSED',guidance:'El caso pide saber qué ingrediente/insumo falla. Contrastar el mensaje real: presentar el error con parseApiError puede recuperar unidades sin identificar el artículo. Explicar qué contiene el mensaje, qué parte resuelve la propuesta y qué queda pendiente, o fundamentar cómo se preservará el contexto del artículo. No cambiar sólo la certeza ni afirmar que un parser añade un nombre ausente.'}];
}
