import type { Agency } from './schema';
import { calendarNights } from './nightlyPricing';
import { nightlyReportPrices, type ReportPricedStay } from './nightlyReportPrices';

export type AgencyProductionFilters = { from?: string; to?: string; agencyId?: string };
export type AgencyProductionStay = ReportPricedStay & {
  id: string; agencyId: string | null; status: string; checkInDate: string; checkOutDate: string;
  roomIsVirtual?: boolean | null; roomNumber?: string | null; floor?: number | null;
};
export type AgencyProductionRow = {
  agency: Agency; totalReservations: number; totalNights: number; totalRevenue: number;
  commissionRate: number; totalCommission: number; activeReservations: number;
  nightShare: number; estimatedNights: number; unpricedNights: number; invalidReservations: number;
};
const actual = new Set(['checked_in', 'checked_out']);

/** Reservation/night production, independent of the commission percentage.
 * A date filter clips stay nights; checkout itself never contributes a night.
 * No attribution is inferred from a payer, guest profile or matching name. */
export function calculateAgencyProduction(agencies: Agency[], stays: AgencyProductionStay[], filters: AgencyProductionFilters, asOf: string): AgencyProductionRow[] {
  const rows = new Map<string, AgencyProductionRow>();
  for (const agency of agencies) {
    if (filters.agencyId && agency.id !== filters.agencyId) continue;
    const rate = Number(agency.commissionRate || 0);
    rows.set(agency.id, { agency, totalReservations: 0, totalNights: 0, totalRevenue: 0, commissionRate: Number.isFinite(rate) ? rate : 0, totalCommission: 0, activeReservations: 0, nightShare: 0, estimatedNights: 0, unpricedNights: 0, invalidReservations: 0 });
  }
  for (const stay of stays) {
    const row = stay.agencyId ? rows.get(stay.agencyId) : undefined;
    if (!row || !actual.has(stay.status)) continue;
    if (stay.roomIsVirtual || stay.roomNumber === 'REUB' || stay.floor === 99) continue;
    let dates: string[];
    try { dates = calendarNights(stay.checkInDate, stay.checkOutDate); }
    catch { row.invalidReservations++; continue; }
    const selected = dates.filter(date => (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to) && date < asOf);
    if (!selected.length) continue;
    row.totalReservations++; row.totalNights += selected.length;
    if (stay.status !== 'checked_out') row.activeReservations++;
    const prices = nightlyReportPrices(stay, dates);
    for (const date of selected) {
      const price = prices.get(date);
      if (!price) { row.unpricedNights++; continue; }
      row.totalRevenue += Math.round(price.amount * 100);
      if (price.estimated) row.estimatedNights++;
    }
  }
  const totalNights = [...rows.values()].reduce((sum, r) => sum + r.totalNights, 0);
  for (const row of rows.values()) {
    row.totalRevenue /= 100;
    row.totalCommission = Math.round(row.totalRevenue * row.commissionRate) / 100;
    row.nightShare = totalNights ? row.totalNights / totalNights * 100 : 0;
  }
  return [...rows.values()].sort((a, b) => b.totalNights - a.totalNights || b.totalReservations - a.totalReservations || (a.agency.nombreFantasia || a.agency.razonSocial).localeCompare(b.agency.nombreFantasia || b.agency.razonSocial, 'es', { sensitivity: 'base' }) || a.agency.id.localeCompare(b.agency.id));
}
