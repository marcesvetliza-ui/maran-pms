import type { HousekeepingPreparation } from "./schema";
import { legacyBedLabels } from "./bedCatalog";
export const physicalBedLabels = legacyBedLabels;
export type BedPreparation = {
  roomId: string;
  bedConfig: string;
  bedRevision: number;
  bedTypeId: string | null;
  bedTypeNotes: string | null;
  confirmedAt: string;
  confirmedBy: string;
};
export function compareBeds(
  current: string | null,
  requestedCode: string | null,
  notes: string | null,
): "same" | "different" | "review" | "unspecified" {
  if (!requestedCode && !notes?.trim()) return "unspecified";
  if (notes?.trim() || !current) return "review";
  // Only explicit equivalents: general names/free text are not reliable IDs.
  const known: Record<string, string> = {
    DBL: "MAT",
    TWN: "TWIN",
    ...Object.fromEntries(Object.keys(physicalBedLabels).map((k) => [k, k])),
  };
  if (requestedCode === current) return "same";
  const expected = requestedCode ? known[requestedCode] : null;
  return !expected || !physicalBedLabels[current]
    ? "review"
    : expected === current
      ? "same"
      : "different";
}
export function preparationIsCurrent(
  value: BedPreparation | null,
  roomId: string | null,
  currentBed: string | null,
  bedTypeId: string | null,
  notes: string | null,
  revision = 0,
) {
  return (
    !!value &&
    value.roomId === roomId &&
    value.bedConfig === currentBed &&
    value.bedRevision === revision &&
    value.bedTypeId === (bedTypeId || null) &&
    value.bedTypeNotes === (notes || null)
  );
}
export function taskDuration(
  start: string | Date | null,
  end: string | Date | null,
  now = Date.now(),
): number | null {
  if (!start) return null;
  const a = new Date(start).getTime(),
    b = end ? new Date(end).getTime() : now;
  return Number.isFinite(a) && Number.isFinite(b) && b >= a
    ? Math.floor((b - a) / 1000)
    : null;
}
export function durationLabel(seconds: number | null) {
  if (seconds === null) return "—";
  const h = Math.floor(seconds / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  return `${h ? `${h} h ` : ""}${m} min ${s} s`;
}
export type PlanningTask = {
  id: string;
  roomId: string;
  roomNumber: string | null;
  taskType: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  staffName: string | null;
  notes: string | null;
  scheduledDate: string;
  startedAt: string | null;
  completedAt: string | null;
  inspectedAt: string | null;
};
export type PlanningRequest = {
  id: string;
  roomId: string | null;
  reservationCode: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  lateCheckOut?: boolean;
  lateCheckOutTime?: string | null;
  status: string;
  bedTypeId: string | null;
  bedTypeCode: string | null;
  bedTypeName: string | null;
  bedTypeNotes: string | null;
  numberOfGuests: number | null;
  comparison: ReturnType<typeof compareBeds>;
  bedPreparation: BedPreparation | null;
  preparationCurrent: boolean;
  noMove: HousekeepingPreparation | null;
  observations: { text: string; priority: string }[];
};
export type PlanningRoom = {
  id: string;
  roomNumber: string;
  floor: number | null;
  active: boolean;
  currentStatus: string | null;
  lastServiceDate?: string | null;
  currentBed: string | null;
  currentBedRevision: number;
  allowedBeds: string[] | null;
  requests: PlanningRequest[];
  tasks: PlanningTask[];
};
export type HousekeepingPlanning = {
  date: string;
  today: string;
  asOf: string;
  mode: "past" | "today" | "future";
  rooms: PlanningRoom[];
  unassigned: PlanningRequest[];
  totals: {
    arrivals: number;
    departures: number;
    stays: number;
    tasks: number;
    completed: number;
  };
};
