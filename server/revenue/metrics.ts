import { and, asc, eq, gt, gte, lt } from "drizzle-orm";
import { db } from "../db";
import { groupCharges, maintenanceBlocks, reservations, revenuePaceSnapshots, rooms } from "@shared/schema";
import { isOperationalInventoryRoom } from "@shared/room-availability";
import { addCalendarDays } from "@shared/nightAuditDate";

/**
 * Fuente de verdad propia para Revenue Management. No reutiliza ninguna de
 * las 4 fórmulas de ADR/RevPAR/ocupación que ya coexisten en el sistema
 * (server/reports/routes.ts ingresosAlojamiento/kpis, getExecutiveStats,
 * getReportOccupancy/getReportRevenueByRoomType) porque esas 4 divergen
 * entre sí y ninguna suma group_charges — así que replicarlas perpetuaría
 * el mismo gap. Metodología:
 *  - Días pasados: solo reservas checked_in/checked_out cuentan como "vendidas"
 *    (ingreso real, igual que ingresosAlojamiento).
 *  - Días de hoy en adelante: cualquier estado salvo cancelled/no_show cuenta
 *    como "vendido" (pipeline/forecast, igual criterio que /api/reports/forecast).
 *  - Tarifa de esa noche: final_rate_per_night si es > 0, sino total_room_amount
 *    prorrateado por noches (mismo criterio que /api/reports/ocupacion).
 *  - Ingreso grupal: cuando una habitación de un grupo se carga a $0 porque la
 *    tarifa se pactó a nivel de grupo, esa plata vive en group_charges, no en
 *    la reserva. Se suma group_charges.amount del día (TODAS las categorías,
 *    sin filtrar: la tabla no estandariza "category" — ver
 *    computeGroupOperationalLedger, que tampoco filtra) como "ingreso de
 *    grupo" aparte, para no mostrar esas habitaciones como regaladas sin
 *    inventar un prorrateo por noche que el esquema no soporta.
 */

export type RevenueDayMetrics = {
  date: string;
  isForecast: boolean;
  roomsAvailable: number;
  roomsSold: number;
  occupancyPct: number;
  directRoomRevenue: number;
  groupChargesRevenue: number;
  totalRevenue: number;
  adr: number;
  revpar: number;
};

export type RevenueDayReservationDetail = {
  reservationId: string;
  roomId: string;
  roomNumber: string;
  status: string;
  nightlyRate: number;
  rateSource: "final_rate_per_night" | "total_room_amount_prorated";
};

export type RevenueDayGroupChargeDetail = {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  category: string;
};

export type RevenueDayDetail = RevenueDayMetrics & {
  reservations: RevenueDayReservationDetail[];
  groupCharges: RevenueDayGroupChargeDetail[];
};

const ACTUAL_STATUSES = new Set(["checked_in", "checked_out"]);
const FORECAST_EXCLUDED_STATUSES = new Set(["cancelled", "no_show"]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function todayArgentina(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

function enumerateDates(from: string, toExclusive: string): string[] {
  const dates: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur < toExclusive && guard < 3660) {
    dates.push(cur);
    cur = addCalendarDays(cur, 1);
    guard += 1;
  }
  return dates;
}

function nightlyRateOf(r: { finalRatePerNight: string | null; totalRoomAmount: string | null; nights: number }): {
  rate: number;
  source: "final_rate_per_night" | "total_room_amount_prorated";
} {
  const final = Number(r.finalRatePerNight) || 0;
  if (final > 0) return { rate: final, source: "final_rate_per_night" };
  const nights = Number(r.nights) || 0;
  const total = Number(r.totalRoomAmount) || 0;
  return { rate: nights > 0 ? total / nights : 0, source: "total_room_amount_prorated" };
}

function statusSoldOnDay(status: string, isForecast: boolean): boolean {
  return isForecast ? !FORECAST_EXCLUDED_STATUSES.has(status) : ACTUAL_STATUSES.has(status);
}

type RawReservationRow = {
  id: string;
  roomId: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  finalRatePerNight: string | null;
  totalRoomAmount: string | null;
  nights: number;
};

async function loadRangeData(from: string, toExclusive: string) {
  const today = todayArgentina();

  const [roomRows, blockRows, resRows, chargeRows] = await Promise.all([
    db.select({
      id: rooms.id,
      roomNumber: rooms.roomNumber,
      isActive: rooms.isActive,
      isVirtual: rooms.isVirtual,
    }).from(rooms),
    db.select({
      roomId: maintenanceBlocks.roomId,
      blockFrom: maintenanceBlocks.blockFrom,
      blockTo: maintenanceBlocks.blockTo,
    }).from(maintenanceBlocks)
      .where(and(lt(maintenanceBlocks.blockFrom, toExclusive), gt(maintenanceBlocks.blockTo, from))),
    db.select({
      id: reservations.id,
      roomId: reservations.roomId,
      status: reservations.status,
      checkInDate: reservations.checkInDate,
      checkOutDate: reservations.checkOutDate,
      finalRatePerNight: reservations.finalRatePerNight,
      totalRoomAmount: reservations.totalRoomAmount,
      nights: reservations.nights,
    }).from(reservations)
      .where(and(lt(reservations.checkInDate, toExclusive), gt(reservations.checkOutDate, from))),
    db.select().from(groupCharges)
      .where(and(gte(groupCharges.date, from), lt(groupCharges.date, toExclusive))),
  ]);

  const operationalRooms = roomRows.filter(isOperationalInventoryRoom);
  const roomNumberById = new Map(roomRows.map(r => [r.id, r.roomNumber]));

  const chargesByDate = new Map<string, typeof chargeRows>();
  for (const charge of chargeRows) {
    const list = chargesByDate.get(charge.date) ?? [];
    list.push(charge);
    chargesByDate.set(charge.date, list);
  }

  return { today, operationalRooms, blockRows, resRows: resRows as RawReservationRow[], chargesByDate, roomNumberById };
}

export async function computeRevenueBoard(from: string, toExclusive: string): Promise<RevenueDayMetrics[]> {
  const { today, operationalRooms, blockRows, resRows, chargesByDate } = await loadRangeData(from, toExclusive);
  const dates = enumerateDates(from, toExclusive);

  return dates.map(date => {
    const isForecast = date >= today;

    const roomsAvailable = operationalRooms.filter(room =>
      !blockRows.some(b => b.roomId === room.id && b.blockFrom <= date && date < b.blockTo),
    ).length;

    const nightsToday = resRows.filter(r =>
      statusSoldOnDay(r.status, isForecast) && r.checkInDate <= date && date < r.checkOutDate,
    );

    const directRevenue = nightsToday.reduce((sum, r) => sum + nightlyRateOf(r).rate, 0);
    const groupRevenue = (chargesByDate.get(date) ?? []).reduce((sum, c) => sum + Number(c.amount), 0);
    const totalRevenue = directRevenue + groupRevenue;
    const roomsSold = nightsToday.length;

    return {
      date,
      isForecast,
      roomsAvailable,
      roomsSold,
      occupancyPct: roomsAvailable > 0 ? round2((roomsSold / roomsAvailable) * 100) : 0,
      directRoomRevenue: round2(directRevenue),
      groupChargesRevenue: round2(groupRevenue),
      totalRevenue: round2(totalRevenue),
      adr: roomsSold > 0 ? round2(totalRevenue / roomsSold) : 0,
      revpar: roomsAvailable > 0 ? round2(totalRevenue / roomsAvailable) : 0,
    };
  });
}

export async function getRevenueDayDetail(date: string): Promise<RevenueDayDetail> {
  const toExclusive = addCalendarDays(date, 1);
  const { today, operationalRooms, blockRows, resRows, chargesByDate, roomNumberById } = await loadRangeData(date, toExclusive);
  const isForecast = date >= today;

  const roomsAvailable = operationalRooms.filter(room =>
    !blockRows.some(b => b.roomId === room.id && b.blockFrom <= date && date < b.blockTo),
  ).length;

  const nightsToday = resRows.filter(r =>
    statusSoldOnDay(r.status, isForecast) && r.checkInDate <= date && date < r.checkOutDate,
  );

  const reservationDetails: RevenueDayReservationDetail[] = nightsToday.map(r => {
    const { rate, source } = nightlyRateOf(r);
    return {
      reservationId: r.id,
      roomId: r.roomId,
      roomNumber: roomNumberById.get(r.roomId) ?? "?",
      status: r.status,
      nightlyRate: round2(rate),
      rateSource: source,
    };
  });

  const groupChargeRows = chargesByDate.get(date) ?? [];
  const groupChargeDetails: RevenueDayGroupChargeDetail[] = groupChargeRows.map(c => ({
    id: c.id,
    groupId: c.groupId,
    description: c.description,
    amount: round2(Number(c.amount)),
    category: c.category,
  }));

  const directRevenue = reservationDetails.reduce((sum, r) => sum + r.nightlyRate, 0);
  const groupRevenue = groupChargeDetails.reduce((sum, c) => sum + c.amount, 0);
  const totalRevenue = directRevenue + groupRevenue;
  const roomsSold = reservationDetails.length;

  return {
    date,
    isForecast,
    roomsAvailable,
    roomsSold,
    occupancyPct: roomsAvailable > 0 ? round2((roomsSold / roomsAvailable) * 100) : 0,
    directRoomRevenue: round2(directRevenue),
    groupChargesRevenue: round2(groupRevenue),
    totalRevenue: round2(totalRevenue),
    adr: roomsSold > 0 ? round2(totalRevenue / roomsSold) : 0,
    revpar: roomsAvailable > 0 ? round2(totalRevenue / roomsAvailable) : 0,
    reservations: reservationDetails,
    groupCharges: groupChargeDetails,
  };
}

// ==================== PACE SNAPSHOTS ====================
// Una fila por (snapshotDate, stayDate). Se captura de forma perezosa: la
// primera consulta al módulo cada día dispara la captura de ese día si no
// existe todavía (no hay scheduler/cron en este backend). Esto es
// equivalente en espíritu al guard idempotente de Night Audit
// (nightAuditAlreadyRan), pero vive enteramente dentro del módulo de Revenue
// para no tocar server/night-audit.ts. Queda pensado para que, el día que
// haya un cron real (p.ej. Railway), simplemente llame a este mismo POST.

const PACE_HORIZON_DAYS = 400;

export async function captureDailyPaceSnapshot(horizonDays = PACE_HORIZON_DAYS): Promise<{ snapshotDate: string; daysCaptured: number }> {
  const snapshotDate = todayArgentina();
  const toExclusive = addCalendarDays(snapshotDate, horizonDays);
  const metrics = await computeRevenueBoard(snapshotDate, toExclusive);

  for (const day of metrics) {
    await db.insert(revenuePaceSnapshots).values({
      snapshotDate,
      stayDate: day.date,
      roomsSold: day.roomsSold,
      roomRevenue: day.totalRevenue.toFixed(2),
    }).onConflictDoUpdate({
      target: [revenuePaceSnapshots.snapshotDate, revenuePaceSnapshots.stayDate],
      set: { roomsSold: day.roomsSold, roomRevenue: day.totalRevenue.toFixed(2) },
    });
  }

  return { snapshotDate, daysCaptured: metrics.length };
}

export async function ensureTodayPaceSnapshot(): Promise<void> {
  const snapshotDate = todayArgentina();
  const existing = await db.select({ id: revenuePaceSnapshots.id }).from(revenuePaceSnapshots)
    .where(eq(revenuePaceSnapshots.snapshotDate, snapshotDate)).limit(1);
  if (existing.length === 0) {
    await captureDailyPaceSnapshot();
  }
}

export type PacePoint = { snapshotDate: string; leadDays: number; roomsSold: number; roomRevenue: number };

export type PaceReport = {
  stayDate: string;
  currentYear: PacePoint[];
  previousYear: PacePoint[];
  yoyAvailable: boolean;
  message: string | null;
};

function leadDaysBetween(stayDate: string, snapshotDate: string): number {
  const stay = new Date(stayDate + "T00:00:00Z").getTime();
  const snap = new Date(snapshotDate + "T00:00:00Z").getTime();
  return Math.round((stay - snap) / 86_400_000);
}

export async function getPaceForStayDate(stayDate: string): Promise<PaceReport> {
  const lastYearStayDate = addCalendarDays(stayDate, -365);

  const [currentRows, previousRows] = await Promise.all([
    db.select().from(revenuePaceSnapshots)
      .where(eq(revenuePaceSnapshots.stayDate, stayDate))
      .orderBy(asc(revenuePaceSnapshots.snapshotDate)),
    db.select().from(revenuePaceSnapshots)
      .where(eq(revenuePaceSnapshots.stayDate, lastYearStayDate))
      .orderBy(asc(revenuePaceSnapshots.snapshotDate)),
  ]);

  const toPoints = (rows: typeof currentRows, stay: string): PacePoint[] => rows.map(r => ({
    snapshotDate: r.snapshotDate,
    leadDays: leadDaysBetween(stay, r.snapshotDate),
    roomsSold: r.roomsSold,
    roomRevenue: Number(r.roomRevenue),
  }));

  const currentYear = toPoints(currentRows, stayDate);
  const previousYear = toPoints(previousRows, lastYearStayDate);
  const yoyAvailable = previousYear.length > 0;

  return {
    stayDate,
    currentYear,
    previousYear,
    yoyAvailable,
    message: yoyAvailable
      ? null
      : "Todavía no hay historial de hace un año para esta fecha (el snapshot diario arrancó recién). La comparación interanual va a estar disponible automáticamente a medida que se acumule un año de datos.",
  };
}
