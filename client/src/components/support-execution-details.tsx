import type {SupportTicket} from '@shared/programming-support';
import {safeSupportExecution,executionReasonLabels,executionStageLabels,executionOutcomeLabels} from '@shared/programming-support-execution';
import {formatHotelDateTime} from '@/lib/hotelTime';

export function SupportExecutionDetails({ticket}:{ticket:SupportTicket}) {
  const run=safeSupportExecution(ticket.execution);
  return <details className="rounded-lg border p-3 text-sm">
    <summary className="cursor-pointer font-medium">Detalle de ejecución</summary>
    <p className="mt-2 break-all">Consulta: {ticket.id}</p>
    {!run ? <p className="mt-2 text-muted-foreground">{['queued','investigating'].includes(ticket.status) ? 'La investigación está en curso. El registro se guardará al finalizar.' : ticket.status==='received' ? 'Todavía no se ha registrado una ejecución.' : 'Este intento no tiene un registro de ejecución guardado. Los intentos anteriores a esta mejora no permiten recuperar desde esta pantalla el motivo del corte.'} Abrir este detalle no solicita otra investigación.</p> : <>
      <p className="mt-2 break-all">Revisión del intento: {run.revision}</p>
      <p>Finalizado: {formatHotelDateTime(run.finishedAt)}</p>
      <p className="mt-2">{run.partialReason ? executionReasonLabels[run.partialReason] : run.outcome==='complete' ? 'Revisión completada.' : run.outcome==='clarification' ? 'Se solicitó una aclaración operativa.' : run.outcome==='failed' ? 'La ejecución falló; no se publicó un diagnóstico validado.' : 'La revisión quedó incompleta; el motivo específico no fue registrado.'}</p>
      {(run.partialReason||run.failureCode)&&<p className="break-all text-muted-foreground">Código: {run.partialReason||run.failureCode}</p>}
      <p className="mt-2">Tokens consumidos: {run.tokens??'No registrado'} · Consultas de código: {run.calls??'No registrado'} · Revisiones independientes: {run.semanticAudits??'No registrado'}</p>
      <ol className="mt-2 list-decimal space-y-2 pl-5">{run.stages.map((stage,i)=><li key={i}>
        {executionStageLabels[stage.stage]}: {executionOutcomeLabels[stage.outcome]} · tokens acumulados: {stage.totalTokens}
        {stage.reason&&<span> · control: {stage.reason}</span>}
        {stage.issueCount!==undefined&&<span> · observaciones: {stage.issueCount}</span>}
        {stage.availableTokens!==undefined&&<span> · disponibles: {stage.availableTokens}</span>}
        {stage.estimatedTokens!==undefined&&<span> · estimación: {stage.estimatedTokens}</span>}
        {stage.reservedTokens!==undefined&&<span> · reserva: {stage.reservedTokens}</span>}
      </li>)}</ol>
      <p className="mt-2 text-muted-foreground">Lectura del registro existente. No inicia otra investigación ni aplica cambios.</p>
    </>}
  </details>;
}
