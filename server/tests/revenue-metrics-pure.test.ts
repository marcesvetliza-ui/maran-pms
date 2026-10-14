import { describe, it, expect } from "vitest";
import { pickApplicableRatePlan, buildCompetitorComparisons, type CompetitorRateRow } from "../revenue/competitorPricing";

describe("pickApplicableRatePlan", () => {
  const roomTypeId = "rt-1";

  it("elige el plan sin límites de vigencia cuando no hay otro", () => {
    const plans = [{ id: "p1", roomTypeId, name: "Estándar", baseRate: "50000", currency: "ARS", validFrom: null, validTo: null }];
    const result = pickApplicableRatePlan(plans, "2026-06-15");
    expect(result).toEqual({ ratePlanId: "p1", name: "Estándar", rate: 50000, currency: "ARS" });
  });

  it("descarta un plan cuya vigencia no cubre la fecha pedida", () => {
    const plans = [{ id: "p1", roomTypeId, name: "Temporada alta", baseRate: "80000", currency: "ARS", validFrom: "2026-12-01", validTo: "2027-02-28" }];
    const result = pickApplicableRatePlan(plans, "2026-06-15");
    expect(result).toBeNull();
  });

  it("entre varios planes vigentes, elige el de validFrom más reciente", () => {
    const plans = [
      { id: "old", roomTypeId, name: "Viejo", baseRate: "40000", currency: "ARS", validFrom: "2026-01-01", validTo: null },
      { id: "new", roomTypeId, name: "Nuevo", baseRate: "55000", currency: "ARS", validFrom: "2026-05-01", validTo: null },
    ];
    const result = pickApplicableRatePlan(plans, "2026-06-15");
    expect(result?.ratePlanId).toBe("new");
    expect(result?.rate).toBe(55000);
  });

  it("devuelve null si el baseRate no es un número válido o es cero", () => {
    const plans = [{ id: "p1", roomTypeId, name: "Roto", baseRate: "0", currency: "ARS", validFrom: null, validTo: null }];
    expect(pickApplicableRatePlan(plans, "2026-06-15")).toBeNull();
  });

  it("devuelve null si no hay ningún plan para ese tipo de habitación", () => {
    expect(pickApplicableRatePlan([], "2026-06-15")).toBeNull();
  });
});

describe("buildCompetitorComparisons", () => {
  const roomTypeId = "rt-1";
  const roomTypeNameById = new Map([[roomTypeId, "Doble Standard"]]);
  const ratePlansByRoomType = new Map([
    [roomTypeId, [{ id: "p1", roomTypeId, name: "Estándar", baseRate: "50000", currency: "ARS", validFrom: null, validTo: null }]],
  ]);
  const now = new Date("2026-06-15T12:00:00Z");

  function competitorRow(overrides: Partial<CompetitorRateRow>): CompetitorRateRow {
    return {
      competitorName: "Hotel Rival",
      roomTypeId,
      stayDate: "2026-06-20",
      rate: "60000",
      currency: "ARS",
      createdAt: now,
      ...overrides,
    };
  }

  it("incluye una tarifa compatible (misma moneda, mismo tipo, reciente)", () => {
    const rows = [competitorRow({})];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, ratePlansByRoomType, now);
    expect(comp.roomTypeId).toBe(roomTypeId);
    expect(comp.ourPublishedRate?.rate).toBe(50000);
    expect(comp.compatibleRates).toEqual([{ competitorName: "Hotel Rival", rate: 60000 }]);
    expect(comp.excludedCount).toBe(0);
  });

  it("excluye una tarifa en moneda distinta a la de nuestro plan vigente", () => {
    const rows = [competitorRow({ currency: "USD" })];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, ratePlansByRoomType, now);
    expect(comp.compatibleRates).toHaveLength(0);
    expect(comp.excludedCount).toBe(1);
    expect(comp.excludedReasons[0]).toMatch(/moneda/);
  });

  it("excluye una tarifa desactualizada (cargada hace más de 7 días)", () => {
    const old = new Date(now.getTime() - 10 * 86_400_000);
    const rows = [competitorRow({ createdAt: old })];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, ratePlansByRoomType, now);
    expect(comp.compatibleRates).toHaveLength(0);
    expect(comp.excludedCount).toBe(1);
    expect(comp.excludedReasons[0]).toMatch(/desactualizada/);
  });

  it("mantiene una tarifa cargada hace exactamente 3 días (dentro de la ventana de frescura)", () => {
    const recent = new Date(now.getTime() - 3 * 86_400_000);
    const rows = [competitorRow({ createdAt: recent })];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, ratePlansByRoomType, now);
    expect(comp.compatibleRates).toHaveLength(1);
  });

  it("agrupa las tarifas sin tipo de habitación como no clasificables, nunca las mezcla con un tipo real", () => {
    const rows = [competitorRow({}), competitorRow({ roomTypeId: null, competitorName: "Hotel Genérico" })];
    const comparisons = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, ratePlansByRoomType, now);
    const unclassified = comparisons.find(c => c.roomTypeId === "__unclassified__");
    expect(unclassified).toBeDefined();
    expect(unclassified?.excludedCount).toBe(1);
    const classified = comparisons.find(c => c.roomTypeId === roomTypeId);
    expect(classified?.compatibleRates).toHaveLength(1);
  });

  it("si no hay plan tarifario vigente para ese tipo/fecha, ourPublishedRate es null y ninguna tarifa es compatible", () => {
    const rows = [competitorRow({})];
    const comparisons = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, new Map(), now);
    expect(comparisons[0].ourPublishedRate).toBeNull();
    expect(comparisons[0].compatibleRates).toHaveLength(0);
    expect(comparisons[0].excludedReasons[0]).toMatch(/moneda/);
  });

  it("ignora filas de otra fecha (stayDate distinto al pedido)", () => {
    const rows = [competitorRow({ stayDate: "2026-07-01" })];
    const comparisons = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, ratePlansByRoomType, now);
    expect(comparisons).toHaveLength(0);
  });
});
