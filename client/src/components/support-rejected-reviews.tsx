import {safeRejectedReviews,rejectedStatementText,type SupportTicket} from '@shared/programming-support';

export function SupportRejectedReviews({ticket}:{ticket:SupportTicket}) {
  const reviews=safeRejectedReviews(ticket.rejectedReviews);
  if(!reviews.length)return ticket.execution?.auditReason==='semantic_rejected'?<p className="text-sm text-muted-foreground">Este intento no guardó los borradores ni las observaciones completas. Sus contadores no permiten reconstruir qué afirmaciones rechazó el auditor.</p>:null;
  return <details className="rounded-lg border p-3 text-sm">
    <summary className="cursor-pointer font-medium">Borradores y observaciones de la revisión</summary>
    <p className="mt-2 font-medium">Material rechazado para evaluar el piloto. No es un diagnóstico aprobado ni una indicación para operar.</p>
    <p className="mt-2 text-muted-foreground">Lectura privada de esta consulta. Abrirla no inicia otra investigación ni aplica cambios. Las observaciones del auditor también requieren evaluación humana.</p>
    {reviews.map((review,index)=><section key={index} className="mt-4 space-y-3 border-t pt-3">
      <h3 className="font-medium">Revisión {review.audit} — borrador rechazado</h3>
      {review.issues.map((issue,i)=><div key={i} className="space-y-1 rounded border p-3">
        <p className="font-medium">Observación {i+1} · {issue.statementId}</p>
        <p>Texto cuestionado:</p><p className="whitespace-pre-wrap">{rejectedStatementText(review.draft,issue.statementId)}</p>
        <p className="whitespace-pre-wrap"><strong>Motivo del auditor:</strong> {issue.problem}</p>
        <p className="whitespace-pre-wrap"><strong>Corrección solicitada por el auditor:</strong> {issue.correction}</p>
      </div>)}
      <details><summary className="cursor-pointer">Borrador completo rechazado</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{JSON.stringify(review.draft,null,2)}</pre></details>
    </section>)}
  </details>;
}
