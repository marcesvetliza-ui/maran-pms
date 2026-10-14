/**
 * Lógica pura (sin DB) para resolver "nuestra tarifa publicada vigente" y
 * filtrar tarifas de competencia comparables. Separado de metrics.ts a
 * propósito: metrics.ts importa `db` a nivel de módulo (requiere
 * DATABASE_URL incluso para usar sus funciones puras), y esta lógica se
 * testea mucho más rápido — y en la suite normal, sin Postgres — si no
 * arrastra esa dependencia.
 */

const STALE_COMPETITOR_RATE_AFTER_DAYS = 7;

export type ResolvedRatePlan = { ratePlanId: string; name: string; rate: number; currency: string };

export type RatePlanRow = {
  id: string; roomTypeId: string; name: string; baseRate: string; currency: string;
  validFrom: string | null; validTo: string | null;
};

/** Entre los planes vigentes para `date` (validFrom/validTo la cubren), elige el más reciente. */
export function pickApplicableRatePlan(plans: RatePlanRow[], date: string): ResolvedRatePlan | null {
  const applicable = plans.filter(p =>
    (p.validFrom === null || p.validFrom <= date) && (p.validTo === null || p.validTo >= date),
  );
  if (applicable.length === 0) return null;
  applicable.sort((a, b) => (b.validFrom ?? "").localeCompare(a.validFrom ?? ""));
  const chosen = applicable[0];
  const rate = Number(chosen.baseRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { ratePlanId: chosen.id, name: chosen.name, rate, currency: chosen.currency };
}

export type CompetitorRateRow = {
  competitorName: string;
  roomTypeId: string | null;
  stayDate: string;
  rate: string;
  currency: string;
  createdAt: Date | string | null;
};

export type CompetitorComparison = {
  roomTypeId: string;
  roomTypeName: string;
  ourPublishedRate: ResolvedRatePlan | null;
  compatibleRates: Array<{ competitorName: string; rate: number }>;
  excludedCount: number;
  excludedReasons: string[];
};

/**
 * Agrupa las tarifas de competencia de un día por tipo de habitación y
 * descarta las que no son comparables: sin tipo de habitación, moneda
 * distinta a la de nuestro plan vigente, o cargadas hace más de
 * STALE_COMPETITOR_RATE_AFTER_DAYS días. Nunca compara contra ADR.
 */
export function buildCompetitorComparisons(
  date: string,
  competitorRows: CompetitorRateRow[],
  roomTypeNameById: Map<string, string>,
  ratePlansByRoomType: Map<string, RatePlanRow[]>,
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
    const ourPublishedRate = pickApplicableRatePlan(ratePlansByRoomType.get(roomTypeId) ?? [], date);
    const compatibleRates: Array<{ competitorName: string; rate: number }> = [];
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
      if (!ourPublishedRate || row.currency !== ourPublishedRate.currency) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: moneda ${row.currency} no comparable`);
        continue;
      }
      compatibleRates.push({ competitorName: row.competitorName, rate });
    }

    comparisons.push({
      roomTypeId,
      roomTypeName: roomTypeNameById.get(roomTypeId) ?? roomTypeId,
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
      ourPublishedRate: null,
      compatibleRates: [],
      excludedCount: unclassified,
      excludedReasons: [`${unclassified} tarifa(s) de competencia sin tipo de habitación, no comparables`],
    });
  }

  return comparisons;
}
