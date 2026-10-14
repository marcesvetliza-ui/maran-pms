import type { RevenueRateSuggestionConfig } from "@shared/schema";

/**
 * Motor de sugerencias de tarifa. Es una función pura, de solo lectura:
 * nunca escribe en rate_plans ni en ninguna reserva. Devuelve una dirección
 * sugerida + el porcentaje + la lista de razones legibles que la explican,
 * para que un humano decida si la aplica manualmente en Planes Tarifarios.
 */

export type RateSuggestionDirection = "subir" | "bajar" | "mantener";

export type RateSuggestionDemandEvent = {
  name: string;
  category: string;
  impact: "alto" | "medio" | "bajo";
};

export type RateSuggestionCompetitorRate = {
  competitorName: string;
  rate: number;
};

export type RateSuggestionInput = {
  date: string;
  occupancyPct: number;
  currentAdr: number | null;
  demandEvents: RateSuggestionDemandEvent[];
  competitorRates: RateSuggestionCompetitorRate[];
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
    if (topEvent.impact === "alto" && direction !== "subir") {
      direction = "subir";
      pct = Math.max(pct, incPct);
      reasons.push("El evento de impacto alto por sí solo ya justifica considerar una suba, más allá de la ocupación.");
    } else if (topEvent.impact === "alto" && direction === "subir") {
      pct = Math.max(pct, incPct);
    }
  }

  if (input.config.considerCompetitorRates && input.competitorRates.length > 0 && input.currentAdr && input.currentAdr > 0) {
    const avgCompetitor = input.competitorRates.reduce((sum, c) => sum + c.rate, 0) / input.competitorRates.length;
    const diffPct = ((avgCompetitor - input.currentAdr) / input.currentAdr) * 100;
    reasons.push(`Tarifa propia de referencia (ADR del día) $${input.currentAdr.toFixed(0)} vs. promedio de ${input.competitorRates.length} competidor(es) cargado(s) a mano: $${avgCompetitor.toFixed(0)} (${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(0)}%).`);
    if (diffPct >= 15 && direction !== "subir") {
      direction = "subir";
      pct = Math.max(pct, incPct);
      reasons.push("La competencia está marcadamente por encima de nuestra tarifa: hay margen para subir.");
    } else if (diffPct <= -15 && direction === "mantener") {
      reasons.push("Nuestra tarifa ya está por encima del promedio de competencia cargado; no se sugiere subir más sin otra señal.");
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
