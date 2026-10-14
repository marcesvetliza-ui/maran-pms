/**
 * Lógica pura (sin DB) para resolver "nuestra tarifa de referencia" y
 * filtrar tarifas de competencia comparables. Separado de metrics.ts a
 * propósito: metrics.ts importa `db` a nivel de módulo (requiere
 * DATABASE_URL incluso para usar sus funciones puras), y esta lógica se
 * testea mucho más rápido — y en la suite normal, sin Postgres — si no
 * arrastra esa dependencia.
 *
 * Dos condiciones deben cumplirse para que una tarifa de competencia entre
 * al motor de sugerencias, además de moneda/tipo de habitación/antigüedad:
 *  - reembolsabilidad (refundable) cargada y coincide con la del plan de
 *    referencia;
 *  - ocupación (occupancy, 1-4 pax) cargada y el plan de referencia tiene
 *    tarifa publicada para ese tramo.
 * Mientras falten, la fila sigue siendo válida como referencia MANUAL en la
 * pantalla de Tarifas de Competencia (eso no cambia), pero queda excluida
 * del motor con el motivo explícito — nunca se la mezcla en silencio.
 */

const STALE_COMPETITOR_RATE_AFTER_DAYS = 7;

export type ResolvedRatePlan = { ratePlanId: string; name: string; rate: number; currency: string; refundable: boolean };

export type RatePlanRow = {
  id: string; roomTypeId: string; name: string; baseRate: string;
  rate1pax: string | null; rate2pax: string | null; rate3pax: string | null; rate4pax: string | null;
  currency: string; refundable: string; validFrom: string | null; validTo: string | null;
};

function rateForOccupancy(plan: RatePlanRow, occupancy: number | null): number | null {
  const tierRaw = occupancy === 1 ? plan.rate1pax
    : occupancy === 2 ? plan.rate2pax
    : occupancy === 3 ? plan.rate3pax
    : occupancy === 4 ? plan.rate4pax
    : null;
  const tier = tierRaw !== null && tierRaw !== undefined ? Number(tierRaw) : NaN;
  if (Number.isFinite(tier) && tier > 0) return tier;
  const base = Number(plan.baseRate);
  return Number.isFinite(base) && base > 0 ? base : null;
}

/**
 * Entre los planes vigentes para `date` (validFrom/validTo la cubren), elige
 * el más reciente y resuelve su tarifa para `occupancy` (o baseRate si no se
 * pide ocupación o ese tramo no está publicado). Se usa tanto para "cuál es
 * el plan vigente" en general como para validar un plan de referencia ya
 * elegido explícitamente (pasando un array de un solo elemento).
 */
export function pickApplicableRatePlan(plans: RatePlanRow[], date: string, occupancy: number | null = null): ResolvedRatePlan | null {
  const applicable = plans.filter(p =>
    (p.validFrom === null || p.validFrom <= date) && (p.validTo === null || p.validTo >= date),
  );
  if (applicable.length === 0) return null;
  applicable.sort((a, b) => (b.validFrom ?? "").localeCompare(a.validFrom ?? ""));
  const chosen = applicable[0];
  const rate = rateForOccupancy(chosen, occupancy);
  if (rate === null) return null;
  return { ratePlanId: chosen.id, name: chosen.name, rate, currency: chosen.currency, refundable: chosen.refundable === "true" };
}

export type CompetitorRateRow = {
  competitorName: string;
  roomTypeId: string | null;
  stayDate: string;
  rate: string;
  currency: string;
  refundable: boolean | null;
  occupancy: number | null;
  createdAt: Date | string | null;
};

export type CompatibleCompetitorRate = { competitorName: string; rate: number; occupancy: number; ourRate: number };

export type CompetitorComparison = {
  roomTypeId: string;
  roomTypeName: string;
  referenceConfigured: boolean;
  ourPublishedRate: ResolvedRatePlan | null;
  compatibleRates: CompatibleCompetitorRate[];
  excludedCount: number;
  excludedReasons: string[];
};

/**
 * Agrupa las tarifas de competencia de un día por tipo de habitación y
 * descarta las que no son comparables: sin tipo de habitación, sin plan de
 * referencia configurado para ese tipo, sin condiciones cargadas
 * (reembolso/ocupación), condiciones que no coinciden, moneda distinta, o
 * cargadas hace más de STALE_COMPETITOR_RATE_AFTER_DAYS días. Nunca compara
 * contra ADR.
 */
export function buildCompetitorComparisons(
  date: string,
  competitorRows: CompetitorRateRow[],
  roomTypeNameById: Map<string, string>,
  referenceRatePlanRowByRoomType: Map<string, RatePlanRow>,
  now: Date = new Date(),
): CompetitorComparison[] {
  const dayRows = competitorRows.filter(r => r.stayDate === date);
  const byRoomType = new Map<string, CompetitorRateRow[]>();
  const unclassified = dayRows.filter(r => !r.roomTypeId).length;

  for (const row of dayRows) {
    if (!row.roomTypeId) continue;
    const list = byRoomType.get(row.roomTypeId) ?? [];
    list.push(row);
    byRoomType.set(row.roomTypeId, list);
  }

  const staleCutoff = now.getTime() - STALE_COMPETITOR_RATE_AFTER_DAYS * 86_400_000;
  const comparisons: CompetitorComparison[] = [];

  for (const [roomTypeId, rows] of byRoomType) {
    const referencePlanRow = referenceRatePlanRowByRoomType.get(roomTypeId) ?? null;
    const referenceConfigured = referencePlanRow !== null;
    const ourPublishedRate = referencePlanRow ? pickApplicableRatePlan([referencePlanRow], date) : null;
    const compatibleRates: CompatibleCompetitorRate[] = [];
    const excludedReasons: string[] = [];
    let excludedCount = 0;

    for (const row of rows) {
      const rate = Number(row.rate);
      if (!Number.isFinite(rate) || rate <= 0) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: tarifa inválida`);
        continue;
      }
      const createdAtMs = row.createdAt ? new Date(row.createdAt).getTime() : NaN;
      if (!Number.isFinite(createdAtMs) || createdAtMs < staleCutoff) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: desactualizada (cargada hace más de ${STALE_COMPETITOR_RATE_AFTER_DAYS} días)`);
        continue;
      }
      if (row.refundable === null || row.occupancy === null) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: faltan condiciones para comparar (reembolso y/u ocupación) — queda como referencia manual`);
        continue;
      }
      if (!referencePlanRow) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: no hay plan tarifario de referencia configurado para este tipo de habitación`);
        continue;
      }
      const resolved = pickApplicableRatePlan([referencePlanRow], date, row.occupancy);
      if (!resolved) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: el plan de referencia configurado no está vigente para esta fecha, o no tiene tarifa publicada para ${row.occupancy} pax`);
        continue;
      }
      if (resolved.refundable !== row.refundable) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: la condición de reembolso no coincide con el plan de referencia`);
        continue;
      }
      if (row.currency !== resolved.currency) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: moneda ${row.currency} no comparable`);
        continue;
      }
      compatibleRates.push({ competitorName: row.competitorName, rate, occupancy: row.occupancy, ourRate: resolved.rate });
    }

    comparisons.push({
      roomTypeId,
      roomTypeName: roomTypeNameById.get(roomTypeId) ?? roomTypeId,
      referenceConfigured,
      ourPublishedRate,
      compatibleRates,
      excludedCount,
      excludedReasons,
    });
  }

  if (unclassified > 0) {
    comparisons.push({
      roomTypeId: "__unclassified__",
      roomTypeName: "Sin tipo de habitación especificado",
      referenceConfigured: false,
      ourPublishedRate: null,
      compatibleRates: [],
      excludedCount: unclassified,
      excludedReasons: [`${unclassified} tarifa(s) de competencia sin tipo de habitación, no comparables`],
    });
  }

  return comparisons;
}
