import {permitsCodeProposal} from '@shared/support-recommendation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { SupportTicket } from '@shared/programming-support';
export function SupportChangeReview({ticket,canReview,simulation,proposalReview=false,busy,onDecision}:{ticket:SupportTicket;canReview:boolean;simulation:boolean;proposalReview?:boolean;busy:boolean;onDecision:(body:Record<string,unknown>)=>void}) {
  const [comment,setComment]=useState('');
  const candidate=ticket.changeCandidate;
  if(!candidate || candidate.kind === "proposal" && ticket.report?.recommendedAction && !permitsCodeProposal(ticket.report))return null;
  const isProposal=candidate.kind==='proposal';
  const labels={awaiting_review:'Esperando revisión',approved_simulation:'Aprobación simulada registrada',approved_for_preparation:'Aprobada para preparar el cambio',rejected:'Rechazada',changes_requested:'Se solicitaron ajustes',invalidated:'Propuesta desactualizada'};
  return <section className="rounded-xl border p-4 space-y-3">
    <h2 className="font-semibold">{isProposal?'Tu decisión sobre la propuesta':'Revisión de propuesta — simulación'}</h2>
    <p role="status">{labels[candidate.status]}</p>
    <p>{isProposal?'Aprobar autoriza preparar un cambio concreto para revisión. Todavía no hay archivos modificados ni pruebas ejecutadas.':'Este cambio es ficticio. Aprobarlo no modifica archivos, datos ni despliegues.'}</p>
    <details><summary>{isProposal?'Ver propuesta y pruebas previstas':'Ver cambio propuesto y comprobaciones'}</summary><p>Destino: Xenia piloto · revisión {candidate.baseRevision}</p><pre className="overflow-auto whitespace-pre-wrap">{candidate.diff}</pre><ul>{candidate.tests.map(test=><li key={test.name}>{test.name} — {test.result==='planned'?'pendiente de ejecución':'simulado'}</li>)}</ul></details>
    {canReview&&(isProposal?proposalReview&&permitsCodeProposal(ticket.report):simulation)&&candidate.status==='awaiting_review'&&<>
      <label className="block">Comentario de revisión<Textarea value={comment} maxLength={2000} onChange={event=>setComment(event.target.value)}/></label>
      <div className="flex flex-wrap gap-2">{([['approve',isProposal?'Aprobar preparación del cambio':'Aprobar simulación'],['reject','Rechazar propuesta'],['revise','Pedir ajustes']] as const).map(([decision,label])=><Button key={decision} variant="outline" disabled={busy||ticket.status!=='proposal_ready'} onClick={()=>onDecision({candidateId:candidate.id,digest:candidate.digest,reportId:candidate.reportId,decision,comment})}>{label}</Button>)}</div>
    </>}
    {(ticket.workflowEvents||[]).map(event=><p className="text-sm" key={event.id}>{event.kind==='prepared'?'Propuesta preparada':event.kind==='approve'?(event.candidateKind==='proposal'?'Preparación autorizada':'Aprobación simulada'):event.kind==='reject'?'Propuesta rechazada':event.kind==='revise'?'Ajustes solicitados':'Propuesta invalidada'} · {event.comment}</p>)}
  </section>;
}
