import { describe, it, expect } from "vitest";
import { suggestRateAdjustment } from "../revenue/suggestions";
import type { RevenueRateSuggestionConfig } from "@shared/schema";

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

describe("suggestRateAdjustment", () => {
  it("nunca marca neverAutoApply en false, sea cual sea la entrada", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 50,
      currentAdr: null,
      demandEvents: [],
      competitorRates: [],
      config: baseConfig,
    });
    expect(result.neverAutoApply).toBe(true);
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });

  it("sugiere subir cuando la ocupación proyectada supera el umbral alto", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 92,
      currentAdr: null,
      demandEvents: [],
      competitorRates: [],
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
      currentAdr: null,
      demandEvents: [],
      competitorRates: [],
      config: baseConfig,
    });
    expect(result.direction).toBe("bajar");
    expect(result.suggestedChangePct).toBe(15);
  });

  it("mantiene cuando la ocupación está dentro del rango normal y no hay otras señales", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      currentAdr: null,
      demandEvents: [],
      competitorRates: [],
      config: baseConfig,
    });
    expect(result.direction).toBe("mantener");
    expect(result.suggestedChangePct).toBe(0);
  });

  it("un evento de demanda de impacto alto empuja a subir aunque la ocupación esté en rango normal", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      currentAdr: null,
      demandEvents: [{ name: "Congreso regional", category: "evento_ciudad", impact: "alto" }],
      competitorRates: [],
      config: baseConfig,
    });
    expect(result.direction).toBe("subir");
    expect(result.reasons.some(r => r.includes("Congreso regional"))).toBe(true);
  });

  it("ignora eventos de demanda cuando la configuración los desactiva", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      currentAdr: null,
      demandEvents: [{ name: "Congreso regional", category: "evento_ciudad", impact: "alto" }],
      competitorRates: [],
      config: { ...baseConfig, considerDemandEvents: false },
    });
    expect(result.direction).toBe("mantener");
    expect(result.reasons.some(r => r.includes("Congreso regional"))).toBe(false);
  });

  it("competencia muy por encima de nuestra tarifa empuja a subir y lo explica con números", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      currentAdr: 10000,
      demandEvents: [],
      competitorRates: [{ competitorName: "Hotel Rival", rate: 13000 }],
      config: baseConfig,
    });
    expect(result.direction).toBe("subir");
    expect(result.reasons.some(r => r.includes("competidor"))).toBe(true);
    expect(result.reasons.some(r => r.includes("13000") || r.includes("13.000"))).toBe(true);
  });

  it("ignora la competencia cuando la configuración la desactiva", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      currentAdr: 10000,
      demandEvents: [],
      competitorRates: [{ competitorName: "Hotel Rival", rate: 13000 }],
      config: { ...baseConfig, considerCompetitorRates: false },
    });
    expect(result.direction).toBe("mantener");
    expect(result.reasons.some(r => r.includes("competidor"))).toBe(false);
  });

  it("toda sugerencia trae al menos una razón legible", () => {
    const result = suggestRateAdjustment({
      date: "2026-12-24",
      occupancyPct: 60,
      currentAdr: null,
      demandEvents: [],
      competitorRates: [],
      config: baseConfig,
    });
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
