import type { SupportMessage, SupportTicket } from "./programming-support";
import type { SupportWorkflowEvent } from "./support-change-workflow";

type Feedback = NonNullable<SupportTicket["feedback"]>[number];
export type SupportTimelineEntry =
  | { type: "message"; id: string; at: string; message: SupportMessage }
  | { type: "decision"; id: string; at: string; event: SupportWorkflowEvent }
  | { type: "feedback"; id: string; at: string; feedback: Feedback };

/** Read-only presentation of server records. Free text never becomes a decision. */
export function supportTimeline(ticket: SupportTicket): SupportTimelineEntry[] {
  const entries: SupportTimelineEntry[] = [
    ...(ticket.messages || []).map(message => ({
      type: "message" as const, id: `message/${message.id}`,
      at: message.createdAt, message,
    })),
    ...(ticket.workflowEvents || []).map(event => ({
      type: "decision" as const, id: `decision/${event.id}`, at: event.at, event,
    })),
    ...(ticket.feedback || []).map(feedback => ({
      type: "feedback" as const, id: `feedback/${feedback.requestId}`,
      at: feedback.createdAt, feedback,
    })),
  ];
  // Stable ordering also preserves archived records with missing/invalid dates.
  return entries.sort((a, b) =>
    (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0),
  );
}

export function supportMessageLabel(message: SupportMessage, owns: boolean) {
  if (message.author === "user")
    return owns ? "Vos · Observación del colaborador" : "Colaborador · Observación";
  if (message.author !== "assistant" || message.kind === "status") return "Sistema";
  if (message.kind === "clarification") return "Asistente · Aclaración solicitada";
  if (message.kind === "diagnosis" && message.reportId && message.revision) {
    if (message.validationStatus === "incomplete")
      return "Asistente · Diagnóstico con verificación incompleta";
    if (message.certainty === "hipotesis") return "Asistente · Hipótesis";
    if (message.certainty === "sustentado_en_codigo")
      return "Asistente · Sustentado en código";
    if (message.certainty === "falta_informacion")
      return "Asistente · Falta información";
  }
  // Historical assistant messages have no proven report identity/certainty.
  return "Asistente";
}

export function supportDecisionLabel(event: SupportWorkflowEvent) {
  if (event.kind === "prepared") return "Propuesta preparada";
  if (event.kind === "approve")
    return event.candidateKind === "proposal"
      ? "Preparación autorizada"
      : "Aprobación simulada";
  if (event.kind === "reject") return "Propuesta rechazada";
  if (event.kind === "revise") return "Ajustes solicitados";
  return "Propuesta invalidada";
}
