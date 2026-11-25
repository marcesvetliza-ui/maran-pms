export type LegacyEventTable = {
  status?: string | null;
  eventClientName?: string | null;
  eventClientPhone?: string | null;
  eventClientEmail?: string | null;
  eventSeats?: number | null;
  eventNotes?: string | null;
  eventAdvanceAmount?: string | number | null;
  eventAdvanceMethod?: string | null;
  eventAdvanceDate?: string | null;
};

export const legacyEventFields = [
  'eventClientName', 'eventClientPhone', 'eventClientEmail', 'eventSeats',
  'eventNotes', 'eventAdvanceAmount', 'eventAdvanceMethod', 'eventAdvanceDate',
] as const;

export function hasLegacyEventPreload(table: LegacyEventTable): boolean {
  return table.status === 'preloaded' || legacyEventFields.some(key => {
    const value = table[key];
    if (key === 'eventAdvanceAmount' || key === 'eventSeats') return Number(value || 0) !== 0;
    return value != null && String(value).trim() !== '';
  });
}

export function restaurantEventTableAction(table: LegacyEventTable, areaType?: string | null) {
  if (table.status === 'occupied') return 'order';
  if (hasLegacyEventPreload(table)) return 'legacy';
  return areaType === 'event' ? 'events' : 'normal';
}
