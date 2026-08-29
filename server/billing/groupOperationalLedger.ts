import type { GroupCharge, GroupPayment, GroupReservationLedgerLine } from "@shared/schema";

const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);

export type GroupOperationalLedger = {
  accommodation: number;
  extras: number;
  groupCharges: number;
  payments: number;
  balance: number;
};

/**
 * Computes the group's operational debt independently from fiscal invoices.
 * A group_payments row is the receipt; linked room payments are allocations
 * and therefore must never be counted a second time.
 */
export function computeGroupOperationalLedger(
  lines: GroupReservationLedgerLine[],
  groupCharges: GroupCharge[],
  groupPayments: GroupPayment[],
): GroupOperationalLedger {
  const parentIds = new Set(groupPayments.map((payment) => payment.id));
  const accommodationCents = lines.reduce((sum, line) => sum + cents(line.accommodationTotal), 0);
  const extrasCents = lines.reduce((sum, line) => sum + cents(line.extrasTotal), 0);
  const groupChargesCents = groupCharges.reduce((sum, charge) => sum + cents(charge.amount), 0);
  const directPaymentCents = lines.reduce((sum, line) => sum + line.payments
    .filter((payment) => !payment.groupPaymentId || !parentIds.has(payment.groupPaymentId))
    .reduce((paymentSum, payment) => paymentSum + cents(payment.amount), 0), 0);
  const parentPaymentCents = groupPayments.reduce((sum, payment) => sum + cents(payment.amount), 0);
  const paymentsCents = directPaymentCents + parentPaymentCents;

  return {
    accommodation: accommodationCents / 100,
    extras: extrasCents / 100,
    groupCharges: groupChargesCents / 100,
    payments: paymentsCents / 100,
    balance: (accommodationCents + extrasCents + groupChargesCents - paymentsCents) / 100,
  };
}