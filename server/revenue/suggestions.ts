import type { RevenueRateSuggestionConfig } from "@shared/schema";
import type { CompetitorComparison } from "./competitorPricing";

/**
 * Motor de sugerencias de tarifa. Es una función pura, de solo lectura:
 * nunca escribe en rate_plans ni en ninguna reserva. Devuelve una dirección
 * sugerida + el porcentaje + la lista de razones legibles que la explican,
 * para que un humano decida si la aplica manualmente en Planes Tarifarios.
 *
 * La comparación contra competencia NUNCA usa el ADR del día (una tarifa
 * promedio realmente cobrada, mezclada con descuentos y $0) como si fuera
 * "nuestro precio publicado": compara contra el plan tarifario de
 * REFERENCIA configurado a mano por tipo de habitación (nunca un plan
 * elegido automáticamente), y solo usa tarifas de competencia ya
 * verificadas como compatibles — misma moneda, mismo tipo de habitación,
 * misma condición de reembolso, mismo tramo de ocupación, no desactualizadas
 * (ver buildCompetitorComparisons). Mientras un tipo de habitación no tenga
 * plan de referencia configurado, o una tarifa de competencia no tenga
 * cargadas sus condiciones, quedan excluidos del motor con el motivo
 * explícito — igual siguen visibles como referencia manual en la pantalla
 * de Tarifas de Competencia.
 */

export type RateSuggestionDirection = "subir" | "bajar" | "mantener";

export type RateSuggestionDemandEvent = {
  name: string;
  category: string;
  impact: "alto" | "medio" | "bajo";
};

export type RateSuggestionInput = {
  date: string;
  occupancyPct: number;
  demandEvents: RateSuggestionDemandEvent[];
  competitorComparisons: CompetitorComparison[];
  config: RevenueRateSuggestionConfig;
};

export type RateSuggestion = {
  date: string;
  direction: RateSuggestionDirection;
  suggestedChangePct: number;
  reasons: string[];
  neverAutoApply: true;
  disclaimer: string;
};

const IMPACT_RANK: Record<RateSuggestionDemandEvent["impact"], number> = { bajo: 1, medio: 2, alto: 3 };
const COMPETITOR_GAP_THRESHOLD_PCT = 15;

const DISCLAIMER = "Sugerencia informativa del motor de Revenue Management. No se aplica sola: hay que cargarla a mano en Planes Tarifarios si se está de acuerdo.";

export function suggestRateAdjustment(input: RateSuggestionInput): RateSuggestion {
  const reasons: string[] = [];
  const high = Number(input.config.highOccupancyThresholdPct);
  const low = Number(input.config.lowOccupancyThresholdPct);
  const incPct = Number(input.config.increaseSuggestionPct);
  const decPct = Number(input.config.decreaseSuggestionPct);

  let direction: RateSuggestionDirection = "mantener";
  let pct = 0;

  if (input.occupancyPct >= high) {
    direction = "subir";
    pct = incPct;
    reasons.push(`Ocupación proyectada ${input.occupancyPct.toFixed(0)}% ≥ umbral alto configurado (${high}%).`);
  } else if (input.occupancyPct <= low) {
    direction = "bajar";
    pct = decPct;
    reasons.push(`Ocupación proyectada ${input.occupancyPct.toFixed(0)}% ≤ umbral bajo configurado (${low}%).`);
  } else {
    reasons.push(`Ocupación proyectada ${input.occupancyPct.toFixed(0)}% dentro del rango normal (${low}%–${high}%); sin señal de ocupación para mover la tarifa.`);
  }

  if (input.config.considerDemandEvents && input.demandEvents.length > 0) {
    const topEvent = input.demandEvents.slice().sort((a, b) => IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact])[0];
    reasons.push(`Evento de demanda cargado para esta fecha: "${topEvent.name}" (impacto ${topEvent.impact}).`);
    if (topEvent.impact === "alto") {
      if (direction !== "subir") {
        direction = "subir";
        reasons.push("El evento de impacto alto por sí solo ya justifica considerar una suba, más allá de la ocupación.");
      }
      pct = Math.max(pct, incPct);
    }
  }

  if (input.config.considerCompetitorRates) {
    for (const comp of input.competitorComparisons) {
      if (comp.roomTypeId === "__unclassified__") {
        reasons.push(`${comp.excludedCount} tarifa(s) de competencia cargada(s) sin tipo de habitación especificado: no son comparables, se excluyen.`);
        continue;
      }
      if (!comp.referenceConfigured) {
        reasons.push(`${comp.roomTypeName}: no hay un plan tarifario de referencia configurado para este tipo de habitación — configuralo para habilitar la comparación.`);
        continue;
      }
      if (!comp.ourPublishedRate) {
        reasons.push(`${comp.roomTypeName}: el plan de referencia configurado no está vigente para esta fecha, no se puede comparar contra la competencia.`);
        continue;
      }
      if (comp.compatibleRates.length === 0) {
        const extra = comp.excludedCount > 0 ? ` (${comp.excludedCount} excluida(s): ${comp.excludedReasons.join("; ")})` : "";
        reasons.push(`${comp.roomTypeName}: hay tarifas de competencia cargadas pero ninguna es comparable${extra}.`);
        continue;
      }

      // Cada tarifa compatible ya trae su propio "ourRate" (puede ser un
      // tramo de ocupación distinto del mismo plan de referencia), así que
      // el gap se promedia por fila en vez de mezclar tramos en un único
      // "nuestro precio" — evita comparar, por ejemplo, 1 pax de un lado
      // contra 3 pax del otro.
      const diffPcts = comp.compatibleRates.map(c => ((c.rate - c.ourRate) / c.ourRate) * 100);
      const avgDiffPct = diffPcts.reduce((sum, d) => sum + d, 0) / diffPcts.length;
      reasons.push(
        `${comp.roomTypeName}: tarifa de referencia (plan "${comp.ourPublishedRate.name}") ` +
        `vs. promedio de ${comp.compatibleRates.length} competidor(es) compatible(s) (misma moneda, mismo tipo, misma condición de reembolso, mismo tramo de ocupación, no desactualizados): ` +
        `${avgDiffPct >= 0 ? "+" : ""}${avgDiffPct.toFixed(0)}% respecto a nuestra tarifa en el tramo correspondiente.`,
      );
      const diffPct = avgDiffPct;

      if (diffPct >= COMPETITOR_GAP_THRESHOLD_PCT && direction !== "subir") {
        direction = "subir";
        pct = Math.max(pct, incPct);
        reasons.push(`${comp.roomTypeName}: la competencia está marcadamente por encima de nuestra tarifa publicada, hay margen para subir.`);
      } else if (diffPct <= -COMPETITOR_GAP_THRESHOLD_PCT && direction === "mantener") {
        reasons.push(`${comp.roomTypeName}: nuestra tarifa ya está por encima del promedio de competencia cargado; no se sugiere subir más sin otra señal.`);
      }
    }
  }

  return {
    date: input.date,
    direction,
    suggestedChangePct: direction === "mantener" ? 0 : pct,
    reasons,
    neverAutoApply: true,
    disclaimer: DISCLAIMER,
  };
}
