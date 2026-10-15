import { and, asc, eq, gt, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "../db";
import {
  groupCharges, groupReservationLinks, groupRoomBlocks, maintenanceBlocks,
  ratePlans, reservations, revenuePaceSnapshotRuns, revenuePaceSnapshots,
  revenueReferenceRatePlans, roomTypes, rooms,
} from "@shared/schema";
import { isOperationalInventoryRoom } from "@shared/room-availability";
import { addCalendarDays } from "@shared/nightAuditDate";
import { parseReservationRate } from "@shared/reservationRate";
import { classifyReservationRate } from "@shared/nightAudit";
import type { ReferenceRatePlanRow } from "./competitorPricing";
export { buildCompetitorComparisons, pickApplicableRatePlan } from "./competitorPricing";
export type { ResolvedRatePlan, RatePlanRow, ReferenceRatePlanRow, CompetitorRateRow, CompetitorComparison } from "./competitorPricing";

/**
 * Fuente de verdad propia para Revenue Management. No reutiliza ninguna de
 * las 4 fórmulas de ADR/RevPAR/ocupación que ya coexisten en el sistema
 * (server/reports/routes.ts ingresosAlojamiento/kpis, getExecutiveStats,
 * getReportOccupancy/getReportRevenueByRoomType) porque esas 4 divergen
 * entre sí. Metodología:
 *
 *  - Días pasados: solo reservas checked_in/checked_out cuentan como "vendidas"
 *    (ingreso real, igual que ingresosAlojamiento).
 *  - Días de hoy en adelante: cualquier estado salvo cancelled/no_show cuenta
 *    como "vendido" (pipeline/forecast, igual criterio que /api/reports/forecast).
 *  - Universo de habitaciones: roomsAvailable (denominador) y roomsSold
 *    (numerador) se calculan sobre el MISMO conjunto de habitaciones
 *    operativas (isOperationalInventoryRoom) — una reserva sobre una
 *    habitación virtual/inactiva no infla la ocupación.
 *  - Ingreso de alojamiento, por noche y reserva, en este orden:
 *      1) final_rate_per_night si es > 0 (dato directo).
 *      2) total_room_amount prorrateado por `nights` si es > 0 (prorrateo
 *         exacto: se conoce la cantidad real de noches, no es una suposición).
 *      3) si la reserva pertenece a un grupo (group_reservation_links) y hay
 *         un group_room_blocks con agreedRate + rango de fechas que cubre
 *         esta noche para el mismo tipo de habitación: se usa agreedRate
 *         como tarifa de ESA noche (se interpreta como tarifa por noche, no
 *         por estadía — el esquema no lo aclara, es un supuesto explícito).
 *      4) si no hay nada de lo anterior: se clasifica con
 *         classifyReservationRate (shared/nightAudit.ts) — "zeroWithReason"
 *         (comp/cortesía confirmado, cuenta como $0 real) vs. dato faltante
 *         ("missing_rate": cuenta para ocupación pero se EXCLUYE del
 *         denominador de ADR para no diluir el promedio con un supuesto $0
 *         que en realidad es "no sabemos").
 *  - group_charges NUNCA se suma a ingresos de alojamiento: la única UI que
 *    los carga (client/src/pages/group-detail.tsx) solo ofrece categorías
 *    de extras (alimentos/bebidas/eventos/transporte/spa/lavandería/otros,
 *    nunca "alojamiento"), y así lo confirma también
 *    computeGroupOperationalLedger, que los trata como "groupCharges"
 *    separado de "accommodation". Se exponen aparte como
 *    otherGroupChargesRevenue — informativo, nunca entra a ADR/RevPAR.
 */

const STALE_COMPETITOR_RATE_AFTER_DAYS = 7;
const PACE_HORIZON_DAYS = 400;

export type RateSource =
  | "final_rate_per_night"
  | "total_room_amount_prorated"
  | "group_block_agreed_rate"
  | "zero_with_reason"
  | "missing_rate";

export type RevenueDayMetrics = {
  date: string;
  isForecast: boolean;
  roomsAvailable: number;
  roomsSold: number;
  ratedRoomNights: number;
  roomsWithMissingRate: number;
  occupancyPct: number;
  directRoomRevenue: number;
  otherGroupChargesRevenue: number;
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
  rateSource: RateSource;
  countsForAdr: boolean;
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

function statusSoldOnDay(status: string, isForecast: boolean): boolean {
  return isForecast ? !FORECAST_EXCLUDED_STATUSES.has(status) : ACTUAL_STATUSES.has(status);
}

type RawReservationRow = {
  id: string;
  roomId: string;
  roomTypeId: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  finalRatePerNight: string | null;
  totalRoomAmount: string | null;
  nights: number;
  specialRateReason: string | null;
};

type GroupBlockRow = {
  groupId: string;
  roomTypeId: string;
  agreedRate: string | null;
  blockCheckInDate: string | null;
  blockCheckOutDate: string | null;
};

function resolveNightlyRate(
  r: RawReservationRow,
  date: string,
  groupIdByReservationId: Map<string, string>,
  groupBlockRows: GroupBlockRow[],
): { rate: number; source: RateSource; countsForAdr: boolean } {
  const direct = parseReservationRate(r.finalRatePerNight);
  if (direct !== null && direct > 0) return { rate: direct, source: "final_rate_per_night", countsForAdr: true };

  const totalAmount = parseReservationRate(r.totalRoomAmount);
  const nights = Number(r.nights) || 0;
  if (totalAmount !== null && totalAmount > 0 && nights > 0) {
    return { rate: totalAmount / nights, source: "total_room_amount_prorated", countsForAdr: true };
  }

  const groupId = groupIdByReservationId.get(r.id);
  if (groupId) {
    const block = groupBlockRows.find(b =>
      b.groupId === groupId && b.roomTypeId === r.roomTypeId &&
      b.blockCheckInDate !== null && b.blockCheckOutDate !== null &&
      b.blockCheckInDate <= date && date < b.blockCheckOutDate,
    );
    if (block) {
      const agreed = parseReservationRate(block.agreedRate);
      if (agreed !== null && agreed > 0) {
        return { rate: agreed, source: "group_block_agreed_rate", countsForAdr: true };
      }
    }
  }

  const classification = classifyReservationRate(r.finalRatePerNight, r.specialRateReason);
  if (classification === "zeroWithReason") {
    return { rate: 0, source: "zero_with_reason", countsForAdr: true };
  }
  return { rate: 0, source: "missing_rate", countsForAdr: false };
}

async function loadRangeData(from: string, toExclusive: string) {
  const today = todayArgentina();

  const [roomRows, blockRows, resRows, chargeRows, groupLinkRows, groupBlockRows] = await Promise.all([
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
      roomTypeId: reservations.roomTypeId,
      status: reservations.status,
      checkInDate: reservations.checkInDate,
      checkOutDate: reservations.checkOutDate,
      finalRatePerNight: reservations.finalRatePerNight,
      totalRoomAmount: reservations.totalRoomAmount,
      nights: reservations.nights,
      specialRateReason: reservations.specialRateReason,
    }).from(reservations)
      .where(and(lt(reservations.checkInDate, toExclusive), gt(reservations.checkOutDate, from))),
    db.select().from(groupCharges)
      .where(and(gte(groupCharges.date, from), lt(groupCharges.date, toExclusive))),
    db.select({
      groupId: groupReservationLinks.groupId,
      reservationId: groupReservationLinks.reservationId,
    }).from(groupReservationLinks),
    db.select({
      groupId: groupRoomBlocks.groupId,
      roomTypeId: groupRoomBlocks.roomTypeId,
      agreedRate: groupRoomBlocks.agreedRate,
      blockCheckInDate: groupRoomBlocks.blockCheckInDate,
      blockCheckOutDate: groupRoomBlocks.blockCheckOutDate,
    }).from(groupRoomBlocks)
      .where(and(
        isNotNull(groupRoomBlocks.agreedRate),
        isNotNull(groupRoomBlocks.blockCheckInDate),
        isNotNull(groupRoomBlocks.blockCheckOutDate),
      )),
  ]);

  const operationalRooms = roomRows.filter(isOperationalInventoryRoom);
  const operationalRoomIds = new Set(operationalRooms.map(r => r.id));
  const roomNumberById = new Map(roomRows.map(r => [r.id, r.roomNumber]));
  const groupIdByReservationId = new Map(groupLinkRows.map(l => [l.reservationId, l.groupId]));

  const chargesByDate = new Map<string, typeof chargeRows>();
  for (const charge of chargeRows) {
    const list = chargesByDate.get(charge.date) ?? [];
    list.push(charge);
    chargesByDate.set(charge.date, list);
  }

  return {
    today, operationalRooms, operationalRoomIds, blockRows,
    resRows: resRows as RawReservationRow[], chargesByDate, roomNumberById,
    groupIdByReservationId, groupBlockRows: groupBlockRows as GroupBlockRow[],
  };
}

function aggregateDay(
  date: string,
  isForecast: boolean,
  roomsAvailable: number,
  nightsToday: RawReservationRow[],
  chargesByDate: Map<string, Array<{ amount: string }>>,
  groupIdByReservationId: Map<string, string>,
  groupBlockRows: GroupBlockRow[],
): RevenueDayMetrics {
  const resolved = nightsToday.map(r => resolveNightlyRate(r, date, groupIdByReservationId, groupBlockRows));
  const directRevenue = resolved.reduce((sum, res) => sum + res.rate, 0);
  const ratedRoomNights = resolved.filter(res => res.countsForAdr).length;
  const roomsWithMissingRate = resolved.length - ratedRoomNights;
  const otherGroupRevenue = (chargesByDate.get(date) ?? []).reduce((sum, c) => sum + Number(c.amount), 0);
  const totalRevenue = directRevenue;
  const roomsSold = resolved.length;

  return {
    date,
    isForecast,
    roomsAvailable,
    roomsSold,
    ratedRoomNights,
    roomsWithMissingRate,
    occupancyPct: roomsAvailable > 0 ? round2((roomsSold / roomsAvailable) * 100) : 0,
    directRoomRevenue: round2(directRevenue),
    otherGroupChargesRevenue: round2(otherGroupRevenue),
    totalRevenue: round2(totalRevenue),
    adr: ratedRoomNights > 0 ? round2(totalRevenue / ratedRoomNights) : 0,
    revpar: roomsAvailable > 0 ? round2(totalRevenue / roomsAvailable) : 0,
  };
}

export async function computeRevenueBoard(from: string, toExclusive: string): Promise<RevenueDayMetrics[]> {
  const { today, operationalRooms, operationalRoomIds, blockRows, resRows, chargesByDate, groupIdByReservationId, groupBlockRows } =
    await loadRangeData(from, toExclusive);
  const dates = enumerateDates(from, toExclusive);

  return dates.map(date => {
    const isForecast = date >= today;

    const roomsAvailable = operationalRooms.filter(room =>
      !blockRows.some(b => b.roomId === room.id && b.blockFrom <= date && date < b.blockTo),
    ).length;

    // Mismo universo que roomsAvailable: una reserva sobre una habitación que
    // ya no es operativa (virtual/inactiva) no cuenta como "vendida" acá,
    // igual que esa habitación no cuenta como "disponible" arriba.
    const nightsToday = resRows.filter(r =>
      operationalRoomIds.has(r.roomId) &&
      statusSoldOnDay(r.status, isForecast) && r.checkInDate <= date && date < r.checkOutDate,
    );

    return aggregateDay(date, isForecast, roomsAvailable, nightsToday, chargesByDate, groupIdByReservationId, groupBlockRows);
  });
}

export async function getRevenueDayDetail(date: string): Promise<RevenueDayDetail> {
  const toExclusive = addCalendarDays(date, 1);
  const { today, operationalRooms, operationalRoomIds, blockRows, resRows, chargesByDate, roomNumberById, groupIdByReservationId, groupBlockRows } =
    await loadRangeData(date, toExclusive);
  const isForecast = date >= today;

  const roomsAvailable = operationalRooms.filter(room =>
    !blockRows.some(b => b.roomId === room.id && b.blockFrom <= date && date < b.blockTo),
  ).length;

  const nightsToday = resRows.filter(r =>
    operationalRoomIds.has(r.roomId) &&
    statusSoldOnDay(r.status, isForecast) && r.checkInDate <= date && date < r.checkOutDate,
  );

  const metrics = aggregateDay(date, isForecast, roomsAvailable, nightsToday, chargesByDate, groupIdByReservationId, groupBlockRows);

  const reservationDetails: RevenueDayReservationDetail[] = nightsToday.map(r => {
    const resolution = resolveNightlyRate(r, date, groupIdByReservationId, groupBlockRows);
    return {
      reservationId: r.id,
      roomId: r.roomId,
      roomNumber: roomNumberById.get(r.roomId) ?? "?",
      status: r.status,
      nightlyRate: round2(resolution.rate),
      rateSource: resolution.source,
      countsForAdr: resolution.countsForAdr,
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

  return {
    ...metrics,
    reservations: reservationDetails,
    groupCharges: groupChargeDetails,
  };
}

// ==================== TARIFA PUBLICADA (para comparar vs. competencia) ====================
// No existe en el resto del sistema ninguna función que resuelva "la tarifa
// vigente para un tipo de habitación en una fecha dada" (confirmado por
// relevamiento: ni server/routes/publicBooking.ts ni storage.getRatePlansByRoomType
// filtran por validFrom/validTo). Esto es intencionalmente DISTINTO del ADR:
// el ADR es la tarifa promedio realmente cobrada (incluye descuentos, $0,
// forecast); esto es el precio de lista vigente del plan tarifario. La parte
// pura (elegir el plan vigente, filtrar competencia compatible) vive en
// ./competitorPricing.ts — acá solo la consulta a la base.

// ==================== PLAN TARIFARIO DE REFERENCIA (configurado a mano) ====================
// Reemplaza cualquier heurística automática: la comparación contra
// competencia de un tipo de habitación solo se activa si hay una fila en
// revenue_reference_rate_plans para ese tipo (ver server/routes/revenue.ts,
// permiso api:revenue:configure). Sin esa fila, buildCompetitorComparisons
// excluye el tipo de habitación con el motivo explícito. roomTypeBaseOccupancy
// se trae con JOIN a room_types porque es la única configuración real que
// justifica usar baseRate como tarifa de un tramo de ocupación sin tramo
// propio publicado (ver rateForOccupancy en competitorPricing.ts).

export async function loadReferenceRatePlanRows(roomTypeIds: string[]): Promise<Map<string, ReferenceRatePlanRow>> {
  const map = new Map<string, ReferenceRatePlanRow>();
  if (roomTypeIds.length === 0) return map;
  const rows = await db.select({
    roomTypeId: revenueReferenceRatePlans.roomTypeId,
    includesBreakfast: revenueReferenceRatePlans.includesBreakfast,
    roomTypeBaseOccupancy: roomTypes.baseOccupancy,
    id: ratePlans.id, name: ratePlans.name, baseRate: ratePlans.baseRate,
    rate1pax: ratePlans.rate1pax, rate2pax: ratePlans.rate2pax, rate3pax: ratePlans.rate3pax, rate4pax: ratePlans.rate4pax,
    currency: ratePlans.currency, refundable: ratePlans.refundable,
    validFrom: ratePlans.validFrom, validTo: ratePlans.validTo,
  })
    .from(revenueReferenceRatePlans)
    .innerJoin(ratePlans, eq(ratePlans.id, revenueReferenceRatePlans.ratePlanId))
    .innerJoin(roomTypes, eq(roomTypes.id, revenueReferenceRatePlans.roomTypeId))
    .where(inArray(revenueReferenceRatePlans.roomTypeId, roomTypeIds));
  for (const row of rows) {
    map.set(row.roomTypeId, { ...row, roomTypeBaseOccupancy: Number(row.roomTypeBaseOccupancy) });
  }
  return map;
}

// ==================== PACE SNAPSHOTS ====================
// Cuándo se captura cada día, en una sola frase: una vez por día calendario
// (America/Argentina/Buenos_Aires), disparada por la primera lectura del
// tablero o del pace report ese día (no hay scheduler/cron en este backend;
// POST /api/revenue/pace/capture-snapshot queda disponible para cablear uno
// más adelante). "Una vez" es una garantía real, no solo la intención:
//
//  - Completa y transaccional: TODA la captura de un día (cálculo + upsert
//    de cada stayDate del horizonte + el registro de corrida en
//    revenue_pace_snapshot_runs) corre dentro de UNA sola transacción. Si el
//    proceso se interrumpe a mitad de camino, Postgres descarta todo — no
//    quedan filas parciales ni un registro de corrida a medias.
//  - Sin carreras: antes de calcular nada, la transacción toma un advisory
//    lock de Postgres con clave (snapshotDate), mismo mecanismo que ya usa
//    el resto del código para serializar escrituras concurrentes
//    (server/productionPending.ts, server/inventoryLocations.ts). Si dos
//    requests disparan la captura del mismo día al mismo tiempo, la segunda
//    queda bloqueada hasta que la primera termine (commit o rollback) y
//    libera el lock. Al despertar, vuelve a chequear revenue_pace_snapshot_runs:
//    si la primera ya completó el día, la segunda NO recalcula ni
//    sobrescribe nada — devuelve el resultado ya confirmado tal cual quedó.
//  - El registro en revenue_pace_snapshot_runs solo existe, por
//    construcción, para un día cuya captura terminó por completo — es la
//    fuente para detectar huecos reales de historial (ver
//    findMissingSnapshotDates).

const PACE_SNAPSHOT_LOCK_SALT = 90210;

export async function captureDailyPaceSnapshot(
  horizonDays = PACE_HORIZON_DAYS,
  testOnlyFailAfterUpsertCount?: number,
): Promise<{ snapshotDate: string; daysCaptured: number; alreadyCompleted: boolean }> {
  const snapshotDate = todayArgentina();
  const toExclusive = addCalendarDays(snapshotDate, horizonDays);

  return withDatabaseTransaction(async () => {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('revenue_pace_snapshot:' || ${snapshotDate}, ${PACE_SNAPSHOT_LOCK_SALT}))`);

    // Doble chequeo DESPUÉS de tomar el lock: si otra captura concurrente ya
    // completó este día mientras esperábamos, no la recalculamos ni la
    // pisamos — se devuelve tal cual quedó.
    const existingRun = await db.select({ daysCaptured: revenuePaceSnapshotRuns.daysCaptured })
      .from(revenuePaceSnapshotRuns).where(eq(revenuePaceSnapshotRuns.snapshotDate, snapshotDate)).limit(1);
    if (existingRun.length > 0) {
      return { snapshotDate, daysCaptured: existingRun[0].daysCaptured, alreadyCompleted: true };
    }

    const metricsForDays = await computeRevenueBoard(snapshotDate, toExclusive);

    let upserted = 0;
    for (const day of metricsForDays) {
      await db.insert(revenuePaceSnapshots).values({
        snapshotDate,
        stayDate: day.date,
        roomsSold: day.roomsSold,
        roomRevenue: day.totalRevenue.toFixed(2),
      }).onConflictDoUpdate({
        target: [revenuePaceSnapshots.snapshotDate, revenuePaceSnapshots.stayDate],
        set: { roomsSold: day.roomsSold, roomRevenue: day.totalRevenue.toFixed(2) },
      });
      upserted += 1;
      // Seam exclusivo para tests: ningún endpoint pasa este argumento.
      if (testOnlyFailAfterUpsertCount !== undefined && upserted >= testOnlyFailAfterUpsertCount) {
        throw new Error("[solo test] captura interrumpida a propósito antes de completar el día");
      }
    }

    await db.insert(revenuePaceSnapshotRuns).values({
      snapshotDate,
      daysCaptured: metricsForDays.length,
      horizonDays,
    }).onConflictDoUpdate({
      target: revenuePaceSnapshotRuns.snapshotDate,
      set: { daysCaptured: metricsForDays.length, horizonDays, completedAt: new Date() },
    });

    return { snapshotDate, daysCaptured: metricsForDays.length, alreadyCompleted: false };
  });
}

export async function ensureTodayPaceSnapshot(): Promise<void> {
  const snapshotDate = todayArgentina();
  const existing = await db.select({ snapshotDate: revenuePaceSnapshotRuns.snapshotDate })
    .from(revenuePaceSnapshotRuns).where(eq(revenuePaceSnapshotRuns.snapshotDate, snapshotDate)).limit(1);
  if (existing.length === 0) {
    await captureDailyPaceSnapshot();
  }
}

async function findTrackingStartDate(): Promise<string | null> {
  const rows = await db.select({ snapshotDate: revenuePaceSnapshotRuns.snapshotDate })
    .from(revenuePaceSnapshotRuns).orderBy(asc(revenuePaceSnapshotRuns.snapshotDate)).limit(1);
  return rows[0]?.snapshotDate ?? null;
}

async function findMissingSnapshotDates(fromDate: string, toDateInclusive: string): Promise<string[]> {
  if (fromDate > toDateInclusive) return [];
  const rows = await db.select({ snapshotDate: revenuePaceSnapshotRuns.snapshotDate }).from(revenuePaceSnapshotRuns)
    .where(and(gte(revenuePaceSnapshotRuns.snapshotDate, fromDate), lte(revenuePaceSnapshotRuns.snapshotDate, toDateInclusive)));
  const present = new Set(rows.map(r => r.snapshotDate));
  const missing: string[] = [];
  let cur = fromDate;
  let guard = 0;
  while (cur <= toDateInclusive && guard < 3660) {
    if (!present.has(cur)) missing.push(cur);
    cur = addCalendarDays(cur, 1);
    guard += 1;
  }
  return missing;
}

export type PacePoint = { snapshotDate: string; leadDays: number; roomsSold: number; roomRevenue: number };

export type PaceReport = {
  stayDate: string;
  currentYear: PacePoint[];
  previousYear: PacePoint[];
  yoyAvailable: boolean;
  message: string | null;
  trackingStartDate: string | null;
  missingSnapshotDates: string[];
};

function leadDaysBetween(stayDate: string, snapshotDate: string): number {
  const stay = new Date(stayDate + "T00:00:00Z").getTime();
  const snap = new Date(snapshotDate + "T00:00:00Z").getTime();
  return Math.round((stay - snap) / 86_400_000);
}

export async function getPaceForStayDate(stayDate: string): Promise<PaceReport> {
  const lastYearStayDate = addCalendarDays(stayDate, -365);
  const today = todayArgentina();

  const [currentRows, previousRows, trackingStartDate] = await Promise.all([
    db.select().from(revenuePaceSnapshots)
      .where(eq(revenuePaceSnapshots.stayDate, stayDate))
      .orderBy(asc(revenuePaceSnapshots.snapshotDate)),
    db.select().from(revenuePaceSnapshots)
      .where(eq(revenuePaceSnapshots.stayDate, lastYearStayDate))
      .orderBy(asc(revenuePaceSnapshots.snapshotDate)),
    findTrackingStartDate(),
  ]);

  const missingSnapshotDates = trackingStartDate ? await findMissingSnapshotDates(trackingStartDate, today) : [];

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
    trackingStartDate,
    missingSnapshotDates,
  };
}
