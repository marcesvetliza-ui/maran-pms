/**
 * Lógica pura (sin DB) para resolver "nuestra tarifa de referencia" y
 * filtrar tarifas de competencia comparables. Separado de metrics.ts a
 * propósito: metrics.ts importa `db` a nivel de módulo (requiere
 * DATABASE_URL incluso para usar sus funciones puras), y esta lógica se
 * testea mucho más rápido — y en la suite normal, sin Postgres — si no
 * arrastra esa dependencia.
 *
 * Cuatro condiciones deben cumplirse para que una tarifa de competencia
 * entre al motor de sugerencias, además de moneda/tipo de habitación/
 * antigüedad:
 *  - reembolsabilidad (refundable) cargada y coincide con la del plan de
 *    referencia;
 *  - ocupación (occupancy, 1-4 pax) cargada, Y el plan de referencia tiene
 *    tarifa publicada para ese tramo exacto (rate1pax..rate4pax) — o, si no
 *    la tiene, esa ocupación coincide con room_types.baseOccupancy del
 *    tipo de habitación (la única configuración real y explícita de "a qué
 *    ocupación representa baseRate"). Fuera de ese caso, NUNCA se usa
 *    baseRate como aproximación — se excluye.
 *  - desayuno incluido/no incluido cargado y coincide con lo declarado al
 *    configurar el plan de referencia (revenue_reference_rate_plans.includesBreakfast);
 *  - impuestos incluidos/no incluidos cargado y coincide con el invariante
 *    fijo del sistema (ver OUR_RATES_INCLUDE_TAXES).
 * Mientras falten o no coincidan, la fila sigue siendo válida como
 * referencia MANUAL en la pantalla de Tarifas de Competencia (eso no
 * cambia), pero queda excluida del motor con el motivo explícito — nunca se
 * la mezcla en silencio.
 */

const STALE_COMPETITOR_RATE_AFTER_DAYS = 7;

// client/src/pages/rate-plans.tsx: "* Todas las tarifas incluyen IVA (21%).
// El desglose neto se realiza al emitir la factura." — invariante fijo de
// TODO plan tarifario propio, no hay (ni debería haber) un dato por plan
// que pueda contradecirlo, así que no es una columna: es esta constante.
export const OUR_RATES_INCLUDE_TAXES = true;

export type ResolvedRatePlan = { ratePlanId: string; name: string; rate: number; currency: string; refundable: boolean };

export type RatePlanRow = {
  id: string; roomTypeId: string; name: string; baseRate: string;
  rate1pax: string | null; rate2pax: string | null; rate3pax: string | null; rate4pax: string | null;
  currency: string; refundable: string; validFrom: string | null; validTo: string | null;
};

/** El plan de referencia configurado para un tipo de habitación, con el dato extra que solo vive en esa configuración (no en rate_plans). */
export type ReferenceRatePlanRow = RatePlanRow & {
  roomTypeBaseOccupancy: number;
  includesBreakfast: boolean;
};

function rateForOccupancy(plan: ReferenceRatePlanRow, occupancy: number | null): number | null {
  if (occupancy === null) {
    const base = Number(plan.baseRate);
    return Number.isFinite(base) && base > 0 ? base : null;
  }
  const tierRaw = occupancy === 1 ? plan.rate1pax
    : occupancy === 2 ? plan.rate2pax
    : occupancy === 3 ? plan.rate3pax
    : occupancy === 4 ? plan.rate4pax
    : null;
  const tier = tierRaw !== null && tierRaw !== undefined ? Number(tierRaw) : NaN;
  if (Number.isFinite(tier) && tier > 0) return tier;
  // No hay tramo publicado para esta ocupación específica. Solo usamos
  // baseRate como aproximación cuando el tipo de habitación declara
  // explícitamente que esa es su ocupación base (room_types.baseOccupancy)
  // — una configuración real existente, no una suposición nuestra. Para
  // cualquier otra ocupación sin tramo propio, se excluye.
  if (occupancy === plan.roomTypeBaseOccupancy) {
    const base = Number(plan.baseRate);
    return Number.isFinite(base) && base > 0 ? base : null;
  }
  return null;
}

/**
 * Valida que `plan` (el plan de referencia ya elegido explícitamente) esté
 * vigente para `date`, y resuelve su tarifa para `occupancy` según las
 * reglas de rateForOccupancy. Devuelve null si no está vigente o si esa
 * ocupación no tiene tarifa resoluble.
 */
export function pickApplicableRatePlan(plan: ReferenceRatePlanRow, date: string, occupancy: number | null = null): ResolvedRatePlan | null {
  const isValid = (plan.validFrom === null || plan.validFrom <= date) && (plan.validTo === null || plan.validTo >= date);
  if (!isValid) return null;
  const rate = rateForOccupancy(plan, occupancy);
  if (rate === null) return null;
  return { ratePlanId: plan.id, name: plan.name, rate, currency: plan.currency, refundable: plan.refundable === "true" };
}

export type CompetitorRateRow = {
  competitorName: string;
  roomTypeId: string | null;
  stayDate: string;
  rate: string;
  currency: string;
  refundable: boolean | null;
  occupancy: number | null;
  breakfastIncluded: boolean | null;
  taxesIncluded: boolean | null;
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
 * referencia configurado para ese tipo, sin condiciones cargadas (reembolso/
 * ocupación/desayuno/impuestos), condiciones que no coinciden, moneda
 * distinta, o cargadas hace más de STALE_COMPETITOR_RATE_AFTER_DAYS días.
 * Nunca compara contra ADR.
 */
export function buildCompetitorComparisons(
  date: string,
  competitorRows: CompetitorRateRow[],
  roomTypeNameById: Map<string, string>,
  referenceRatePlanRowByRoomType: Map<string, ReferenceRatePlanRow>,
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
    const ourPublishedRate = referencePlanRow ? pickApplicableRatePlan(referencePlanRow, date) : null;
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

      const missingConditions: string[] = [];
      if (row.refundable === null) missingConditions.push("reembolso");
      if (row.occupancy === null) missingConditions.push("ocupación");
      if (row.breakfastIncluded === null) missingConditions.push("desayuno incluido/no incluido");
      if (row.taxesIncluded === null) missingConditions.push("impuestos incluidos/no incluidos");
      if (missingConditions.length > 0) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: faltan condiciones para comparar (${missingConditions.join(", ")}) — queda como referencia manual`);
        continue;
      }

      if (!referencePlanRow) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: no hay plan tarifario de referencia configurado para este tipo de habitación`);
        continue;
      }
      const resolved = pickApplicableRatePlan(referencePlanRow, date, row.occupancy);
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
      if (referencePlanRow.includesBreakfast !== row.breakfastIncluded) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: el desayuno incluido/no incluido no coincide con el plan de referencia`);
        continue;
      }
      if (OUR_RATES_INCLUDE_TAXES !== row.taxesIncluded) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: impuestos incluidos no coincide (nuestras tarifas siempre incluyen IVA)`);
        continue;
      }
      if (row.currency !== resolved.currency) {
        excludedCount += 1;
        excludedReasons.push(`${row.competitorName}: moneda ${row.currency} no comparable`);
        continue;
      }
      // row.occupancy no puede ser null acá: el chequeo de missingConditions
      // más arriba ya excluyó y "continue"ó ese caso.
      compatibleRates.push({ competitorName: row.competitorName, rate, occupancy: row.occupancy!, ourRate: resolved.rate });
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
