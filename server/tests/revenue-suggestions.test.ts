import { describe, it, expect } from "vitest";
import { suggestRateAdjustment } from "../revenue/suggestions";
import type { RevenueRateSuggestionConfig } from "@shared/schema";
import type { CompetitorComparison } from "../revenue/competitorPricing";

const baseConfig: RevenueRateSuggestionConfig = {
  id: 1,
  highOccupancyThresholdPct: "80",
  lowOccupancyThresholdPct: "40",
  increaseSuggestionPct: "10",
  decreaseSuggestionPct: "15",
  considerDemandEvents: true,
  considerCompetitorRates: true,
  updatedAt: new Date(),
  updatedBy: null,
};

function comparison(overrides: Partial<CompetitorComparison>): CompetitorComparison {
  return {
    roomTypeId: "rt-1",
    roomTypeName: "Doble Standard",
    ourPublishedRate: { ratePlanId: "p1", name: "Estándar", rate: 10000, currency: "ARS" },
    compatibleRates: [],
    excludedCount: 0,
    excludedReasons: [],
    ...overrides,
  };
}

describe("suggestRateAdjustment", () => {
  it("nunca marca neverAutoApply en false, sea cual sea la entrada", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 50,
      demandEvents: [],
      competitorComparisons: [],
      config: baseConfig,
    });
    expect(result.neverAutoApply).toBe(true);
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });

  it("sugiere subir cuando la ocupación proyectada supera el umbral alto", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 92,
      demandEvents: [],
      competitorComparisons: [],
      config: baseConfig,
    });
    expect(result.direction).toBe("subir");
    expect(result.suggestedChangePct).toBe(10);
    expect(result.reasons.some(r => r.includes("92"))).toBe(true);
  });

  it("sugiere bajar cuando la ocupación proyectada está por debajo del umbral bajo", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 20,
      demandEvents: [],
      competitorComparisons: [],
      config: baseConfig,
    });
    expect(result.direction).toBe("bajar");
    expect(result.suggestedChangePct).toBe(15);
  });

  it("mantiene cuando la ocupación está dentro del rango normal y no hay otras señales", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      demandEvents: [],
      competitorComparisons: [],
      config: baseConfig,
    });
    expect(result.direction).toBe("mantener");
    expect(result.suggestedChangePct).toBe(0);
  });

  it("un evento de demanda de impacto alto empuja a subir aunque la ocupación esté en rango normal", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      demandEvents: [{ name: "Congreso regional", category: "evento_ciudad", impact: "alto" }],
      competitorComparisons: [],
      config: baseConfig,
    });
    expect(result.direction).toBe("subir");
    expect(result.reasons.some(r => r.includes("Congreso regional"))).toBe(true);
  });

  it("ignora eventos de demanda cuando la configuración los desactiva", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      demandEvents: [{ name: "Congreso regional", category: "evento_ciudad", impact: "alto" }],
      competitorComparisons: [],
      config: { ...baseConfig, considerDemandEvents: false },
    });
    expect(result.direction).toBe("mantener");
    expect(result.reasons.some(r => r.includes("Congreso regional"))).toBe(false);
  });

  it("competencia muy por encima de nuestra tarifa PUBLICADA empuja a subir y lo explica con números", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      demandEvents: [],
      competitorComparisons: [comparison({
        ourPublishedRate: { ratePlanId: "p1", name: "Estándar", rate: 10000, currency: "ARS" },
        compatibleRates: [{ competitorName: "Hotel Rival", rate: 13000 }],
      })],
      config: baseConfig,
    });
    expect(result.direction).toBe("subir");
    expect(result.reasons.some(r => r.includes("competidor"))).toBe(true);
    expect(result.reasons.some(r => r.includes("13000") || r.includes("13.000"))).toBe(true);
    // Nunca debe aparecer la palabra ADR: compara contra la tarifa publicada, no el promedio cobrado.
    expect(result.reasons.some(r => /\bADR\b/.test(r))).toBe(false);
  });

  it("ignora la competencia cuando la configuración la desactiva", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      demandEvents: [],
      competitorComparisons: [comparison({
        compatibleRates: [{ competitorName: "Hotel Rival", rate: 13000 }],
      })],
      config: { ...baseConfig, considerCompetitorRates: false },
    });
    expect(result.direction).toBe("mantener");
    expect(result.reasons.some(r => r.includes("competidor"))).toBe(false);
  });

  it("si no hay plan tarifario vigente para un tipo de habitación, lo dice explícitamente en vez de omitirlo en silencio", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      demandEvents: [],
      competitorComparisons: [comparison({ ourPublishedRate: null, compatibleRates: [] })],
      config: baseConfig,
    });
    expect(result.reasons.some(r => r.includes("Doble Standard") && r.includes("no hay un plan tarifario vigente"))).toBe(true);
  });

  it("si hay tarifas de competencia cargadas pero ninguna compatible, lo dice explícitamente con el motivo de exclusión", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      demandEvents: [],
      competitorComparisons: [comparison({
        compatibleRates: [],
        excludedCount: 2,
        excludedReasons: ["Hotel Rival: moneda USD no comparable", "Hotel Otro: desactualizada (cargada hace más de 7 días)"],
      })],
      config: baseConfig,
    });
    expect(result.reasons.some(r => r.includes("ninguna es comparable"))).toBe(true);
    expect(result.reasons.some(r => r.includes("moneda USD"))).toBe(true);
  });

  it("una comparación sin tipo de habitación especificado se reporta como no clasificable, no se mezcla con un tipo real", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      demandEvents: [],
      competitorComparisons: [comparison({ roomTypeId: "__unclassified__", excludedCount: 3, ourPublishedRate: null })],
      config: baseConfig,
    });
    expect(result.reasons.some(r => r.includes("sin tipo de habitación especificado"))).toBe(true);
  });

  it("toda sugerencia trae al menos una razón legible", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      demandEvents: [],
      competitorComparisons: [],
      config: baseConfig,
    });
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
