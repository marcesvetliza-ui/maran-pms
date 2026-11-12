import { supportLabels, type SupportDiagnosis, type SupportTicket } from './programming-support';

/** Historical reports remain readable; only an explicit current change can be prepared. */
export function permitsCodeProposal(report: SupportDiagnosis | null) {
  return report?.recommendedAction === 'code_change';
}

export function supportTicketLabel(ticket: Pick<SupportTicket, 'status' | 'report'>) {
  if (ticket.status === 'proposal_ready') {
    if (ticket.report?.recommendedAction === 'no_change') return 'Sin cambios necesarios';
    if (ticket.report?.recommendedAction === 'verification') return 'Comprobación pendiente';
  }
  return supportLabels[ticket.status];
}

export function recommendationDescription(report: SupportDiagnosis) {
  if (report.recommendedAction === 'no_change') return 'La revisión no propone modificar código. El diagnóstico conserva su evidencia y alcance.';
  if (report.recommendedAction === 'verification') return 'Falta comprobar el comportamiento observado. Este diagnóstico no autoriza preparar un cambio de código.';
  return '';
}
