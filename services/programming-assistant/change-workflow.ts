import { createHash, randomUUID } from 'node:crypto';
import type { SupportTicket } from '../../shared/programming-support';
import type { SupportChangeCandidate, SupportDecision, SupportWorkflowEvent } from '../../shared/support-change-workflow';
import type { DiagnosisResult } from './diagnose';
import {supportReportText} from '../../shared/support-report-presentation';
export function simulateInvestigation(ticket: SupportTicket): DiagnosisResult {
  const report: DiagnosisResult['report'] = {
    summary:'Demostración del circuito de soporte. No es un diagnóstico del sistema.',
    certainty:'hipotesis', cause:'Causa no investigada: investigador simulado.',
    proposal:'Preparar un cambio ficticio para comprobar la revisión de Marcelo.',
    proposedTests:[],questions:[],dataRepair:'',limitations:['Sin modelo, sin pruebas de la aplicación y sin publicación de cambios.'],evidence:[],
  };
  const hasReply=(ticket.messages||[]).some(message=>message.author==='user');
  return { report,tokens:0,calls:0,readFiles:[],searches:[],
    ...(!hasReply?{clarification:{facts:[],questions:['Para probar el seguimiento, agregá una respuesta con lo que esperabas que ocurriera.']}}:{}),
  };
}
export function candidateDigest(candidate: Pick<SupportChangeCandidate,'kind'|'target'|'baseRevision'|'reportId'|'diff'|'tests'|'reportDigest'>) {
  return createHash('sha256').update(JSON.stringify({kind:candidate.kind,target:candidate.target,baseRevision:candidate.baseRevision,reportId:candidate.reportId,diff:candidate.diff,tests:candidate.tests,...(candidate.reportDigest?{reportDigest:candidate.reportDigest}:{})})).digest('hex');
}
// JSONB can reorder object keys. Bind values, not an incidental serialization order.
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
const reportDigest=(ticket:SupportTicket)=>createHash('sha256').update(JSON.stringify(canonical(ticket.report))).digest('hex');
export function prepareReviewedProposal(ticket:SupportTicket):SupportChangeCandidate {
  if(!ticket.reportId||!ticket.report||ticket.status!=='proposal_ready'||ticket.report.validationStatus!=='complete'||ticket.report.certainty!=='sustentado_en_codigo'||!supportReportText(ticket.report.proposal))throw Error('Falta un diagnóstico sustentado y revisado');
  const report=ticket.report,fields={kind:'proposal' as const,target:'xenia-pilot' as const,baseRevision:ticket.version,reportId:ticket.reportId,reportDigest:reportDigest(ticket),
    diff:`Problema: ${supportReportText(report.summary)}\n\nCausa: ${supportReportText(report.cause)}\n\nPropuesta: ${supportReportText(report.proposal)}`,
    tests:report.proposedTests.map(name=>({name,result:'planned' as const}))};
  return {...fields,id:randomUUID(),digest:candidateDigest(fields),status:'awaiting_review',createdAt:new Date().toISOString()};
}
export function prepareSimulatedChange(ticket: SupportTicket): SupportChangeCandidate {
  if(!ticket.reportId||!ticket.report||ticket.status!=='proposal_ready')throw Error('Falta un informe vigente');
  const fields={kind:'simulation' as const,target:'xenia-pilot' as const,baseRevision:ticket.version,reportId:ticket.reportId,
    diff:'--- /dev/null\n+++ b/support-simulation.txt\n@@ -0,0 +1 @@\n+Cambio ficticio: no ejecutar ni publicar.\n',
    tests:[{name:'Recorrido simulado de consulta y aprobación; no prueba la aplicación',result:'simulated' as const}]};
  return {...fields,id:randomUUID(),digest:candidateDigest(fields),status:'awaiting_review',createdAt:new Date().toISOString()};
}
export function invalidateChange(ticket: SupportTicket, actor: string) {
  if(!ticket.changeCandidate||ticket.changeCandidate.status==='invalidated')return;
  appendWorkflowEvent(ticket,'invalidated',actor,'Nueva información o nueva investigación: la aprobación anterior ya no es válida.');
  ticket.changeCandidate.status='invalidated';
}
export function appendWorkflowEvent(ticket: SupportTicket, kind: SupportWorkflowEvent['kind'], actor: string, comment: string, requestId?: string) {
  if(!ticket.changeCandidate)throw Error('No hay candidato');
  ticket.workflowEvents=[...(ticket.workflowEvents||[]),{id:randomUUID(),kind,candidateId:ticket.changeCandidate.id,candidateKind:ticket.changeCandidate.kind,digest:ticket.changeCandidate.digest,reportId:ticket.changeCandidate.reportId,actor,at:new Date().toISOString(),comment,...(requestId?{requestId}:{})}];
}
export function decideSimulatedChange(ticket: SupportTicket, decision: SupportDecision, actor: string, currentRevision: string,expectedKind:SupportChangeCandidate['kind']='simulation') {
  const previous=ticket.workflowEvents?.find(event=>event.requestId===decision.requestId);
  if(previous){
    if(previous.actor!==actor||previous.kind!==decision.decision||previous.candidateId!==decision.candidateId||previous.digest!==decision.digest||previous.reportId!==decision.reportId||previous.comment!==decision.comment)throw Error('Identificador utilizado para otra decisión');
    return;
  }
  const candidate=ticket.changeCandidate;
  if(ticket.status!=='proposal_ready'||!candidate||candidate.kind!==expectedKind||candidate.status!=='awaiting_review'||candidate.id!==decision.candidateId||candidate.reportId!==decision.reportId||ticket.reportId!==decision.reportId||candidate.digest!==decision.digest||candidateDigest(candidate)!==candidate.digest||candidate.baseRevision!==currentRevision||ticket.version!==currentRevision||(candidate.kind==='proposal'&&candidate.reportDigest!==reportDigest(ticket)))throw Error('La propuesta cambió o ya no admite aprobación; actualizá el caso');
  candidate.status=decision.decision==='approve'?(candidate.kind==='simulation'?'approved_simulation':'approved_for_preparation'):decision.decision==='reject'?'rejected':'changes_requested';
  appendWorkflowEvent(ticket,decision.decision,actor,decision.comment,decision.requestId);
  // A simulation is never a deployment authorization, even after approval.
}
