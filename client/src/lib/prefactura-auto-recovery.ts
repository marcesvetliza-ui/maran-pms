import type { PrefacturaAttempt } from "./prefactura-submission";

export type ReceptionRecoveryStatus = {
  operationId?: string;
  stage?: string;
  safeToCorrect?: boolean;
  preflightCorrection?: { code: string; message: string } | null;
  canRetryNumberConflict?: boolean;
  canCloseCancelled?: boolean;
  collectionCorrectionCompleted?: boolean;
  paymentConflicts?: string[];
  departureReopened?: boolean;
  attempt?: PrefacturaAttempt | null;
};

/** An opening may resume only the exact, server-verified original intent.
 * Unknown/contradictory fiscal results keep their existing review controls. */
export function automaticPrefacturaAction(reservationId: string | number, operationId: string | null,
  status: ReceptionRecoveryStatus | undefined): "resume" | "correct" | null {
  const attempt = status?.attempt;
  if (!operationId || status?.operationId !== operationId || !attempt?.invoiceRequest ||
      String(attempt.invoiceRequest.reservaId) !== String(reservationId) ||
      attempt.invoiceRequest.creditOperationId !== operationId ||
      attempt.invoiceRequest.prefacturaRecovery?.version !== 2 ||
      !Array.isArray(attempt.payments) || attempt.payments.some(payment =>
        String(payment.reservationId) !== String(reservationId) || typeof payment.paymentRequestId !== "string") ||
      status.paymentConflicts?.length || status.departureReopened || status.collectionCorrectionCompleted) return null;
  // Retire only a preflight draft proved to have no invoice/payment, or an
  // already cancelled document whose original closure guard authorizes it.
  if (status.preflightCorrection?.code === 'GROUP_ADVANCE_CHOICE_REQUIRED' && status.safeToCorrect &&
      status.stage === 'prepared' && attempt.payments.length > 0 && attempt.payments.every(payment =>
        ['efectivo','tarjeta_credito','tarjeta_debito','transferencia','mercadopago'].includes(payment.method) &&
        Number.isFinite(Number(payment.amount)) && Number(payment.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(payment.date || ''))) return 'correct';
  if (status.canCloseCancelled || status.stage === "blocked" && status.safeToCorrect && !status.canRetryNumberConflict && attempt.payments.length === 0) return "correct";
  if (["prepared", "numbered", "submitting", "uncertain", "authorized"].includes(status.stage || "") ||
      status.stage === "blocked" && status.canRetryNumberConflict) return "resume";
  return null;
}
