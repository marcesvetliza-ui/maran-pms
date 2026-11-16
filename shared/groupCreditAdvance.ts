/** Separate from normal group collection: accepting money beyond the net debt. */
export const GROUP_CREDIT_ADVANCE_PERMISSION = "api:groups:credit-advance";

export type GroupCreditAdvanceConfirmation = {
  confirmed: true;
  expectedBalanceCents: number;
  reason: string;
};

const directMethods = new Set([
  "cash", "efectivo", "transfer", "transferencia", "debit_card", "tarjeta_debito",
  "credit_card", "tarjeta_credito", "mercadopago",
]);

export function supportsGroupCreditAdvance(rows: Array<{ method: string; retention?: { monto: number } | null }>): boolean {
  return rows.length > 0 && rows.every(row => directMethods.has(row.method)
    && Number(row.retention?.monto || 0) === 0);
}

/** Signed balance is essential: a group can already have credit before this receipt. */
export function groupCreditAdvanceSummary(balanceCents: number, receivedCents: number) {
  const previousCreditCents = Math.max(0, -balanceCents);
  const creditCents = Math.max(0, receivedCents - balanceCents);
  return { previousCreditCents, addedCreditCents: creditCents - previousCreditCents, creditCents };
}

export function parseGroupCreditAdvanceConfirmation(value: unknown): GroupCreditAdvanceConfirmation {
  const v = value as Partial<GroupCreditAdvanceConfirmation> | null;
  if (!v || v.confirmed !== true || !Number.isSafeInteger(v.expectedBalanceCents)
    || typeof v.reason !== "string" || v.reason.trim().length < 3 || v.reason.trim().length > 500) {
    throw Object.assign(new Error("Confirmá el saldo a favor e indicá un motivo de entre 3 y 500 caracteres."), { statusCode: 400 });
  }
  return { confirmed: true, expectedBalanceCents: v.expectedBalanceCents!, reason: v.reason.trim() };
}
