import { inArray } from "drizzle-orm";
import { getReservationFinancialSummary } from "@shared/reservationFolio";
import { charges, payments, salesInvoices } from "@shared/schema";
import { db } from "./db";

export type OperationalBalanceReservation = {
  id: string;
  totalRoomAmount?: string | number | null;
  finalRatePerNight?: string | number | null;
  nights?: number | null;
};

type OperationalCharge = typeof charges.$inferSelect;
type OperationalPayment = typeof payments.$inferSelect;

export function calculateReservationOperationalSummaries(
  reservationList: OperationalBalanceReservation[],
  chargeRows: OperationalCharge[],
  paymentRows: OperationalPayment[],
  invoiceRows: (typeof salesInvoices.$inferSelect)[] = [],
) {
  const chargesByReservation = new Map<string, OperationalCharge[]>();
  for (const charge of chargeRows) {
    const current = chargesByReservation.get(charge.reservationId) ?? [];
    current.push(charge);
    chargesByReservation.set(charge.reservationId, current);
  }

  const paymentsByReservation = new Map<string, OperationalPayment[]>();
  for (const payment of paymentRows) {
    const current = paymentsByReservation.get(payment.reservationId) ?? [];
    current.push(payment);
    paymentsByReservation.set(payment.reservationId, current);
  }
  const invoicesByReservation = new Map<string, (typeof salesInvoices.$inferSelect)[]>();
  for (const invoice of invoiceRows) {
    if (!invoice.reservaId) continue;
    const current = invoicesByReservation.get(invoice.reservaId) ?? [];
    current.push(invoice);
    invoicesByReservation.set(invoice.reservaId, current);
  }

  return new Map(reservationList.map(reservation => {
    const savedRoomTotal = Number(reservation.totalRoomAmount) || 0;
    const roomTotal = savedRoomTotal > 0
      ? savedRoomTotal
      : (Number(reservation.finalRatePerNight) || 0) * (reservation.nights || 0);
    return [
      reservation.id,
      getReservationFinancialSummary(
        roomTotal,
        chargesByReservation.get(reservation.id) ?? [],
        paymentsByReservation.get(reservation.id) ?? [],
        invoicesByReservation.get(reservation.id) ?? [],
      ),
    ];
  }));
}

export async function loadReservationOperationalSummaries(
  reservationList: OperationalBalanceReservation[],
  options: { includeInvoices?: boolean } = {},
) {
  if (reservationList.length === 0) return new Map();

  const reservationIds = reservationList.map(reservation => reservation.id);
  const [chargeRows, paymentRows] = await Promise.all([
    db.select().from(charges).where(inArray(charges.reservationId, reservationIds)),
    db.select().from(payments).where(inArray(payments.reservationId, reservationIds)),
  ]);
  const invoiceRows = options.includeInvoices
    ? await db.select().from(salesInvoices).where(inArray(salesInvoices.reservaId, reservationIds))
    : [];

  return calculateReservationOperationalSummaries(reservationList, chargeRows, paymentRows, invoiceRows);
}

export async function loadReservationOperationalBalances(
  reservationList: OperationalBalanceReservation[],
): Promise<Map<string, number>> {
  const summaries = await loadReservationOperationalSummaries(reservationList);
  return new Map(Array.from(summaries, ([id, summary]) => [id, summary.operationalFolioBalance]));
}

export function buildPendingOperationalReservationRows<
  T extends OperationalBalanceReservation,
>(
  reservationList: T[],
  balances: Map<string, number>,
) {
  return reservationList
    .map(reservation => ({
      ...reservation,
      balance: balances.get(reservation.id) ?? 0,
    }))
    .filter(row => row.balance > 0.01)
    .sort((left, right) => right.balance - left.balance);
}

export function projectReservationOperationalReportRows<T extends { id: string }>(
  rows: T[],
  summaries: Awaited<ReturnType<typeof loadReservationOperationalSummaries>>,
  pendingOnly = false,
) {
  const projected = rows.map(row => {
    const summary = summaries.get(row.id);
    return {
      ...row,
      total: summary?.operationalServices ?? 0,
      paid: summary?.activeHistoricalSettlements ?? 0,
      balance: summary?.operationalFolioBalance ?? 0,
    };
  });
  return pendingOnly ? projected.filter(row => row.balance > 0.01) : projected;
}