import { describe, it, expect } from "vitest";
import { pickApplicableRatePlan, buildCompetitorComparisons, type CompetitorRateRow, type RatePlanRow } from "../revenue/competitorPricing";

function ratePlan(overrides: Partial<RatePlanRow> = {}): RatePlanRow {
  return {
    id: "p1", roomTypeId: "rt-1", name: "Estándar", baseRate: "50000",
    rate1pax: null, rate2pax: null, rate3pax: null, rate4pax: null,
    currency: "ARS", refundable: "true", validFrom: null, validTo: null,
    ...overrides,
  };
}

describe("pickApplicableRatePlan", () => {
  it("elige el plan sin límites de vigencia cuando no hay otro, con baseRate si no se pide ocupación", () => {
    const result = pickApplicableRatePlan([ratePlan()], "2026-06-15");
    expect(result).toEqual({ ratePlanId: "p1", name: "Estándar", rate: 50000, currency: "ARS", refundable: true });
  });

  it("descarta un plan cuya vigencia no cubre la fecha pedida", () => {
    const plans = [ratePlan({ id: "p1", name: "Temporada alta", baseRate: "80000", validFrom: "2026-12-01", validTo: "2027-02-28" })];
    expect(pickApplicableRatePlan(plans, "2026-06-15")).toBeNull();
  });

  it("entre varios planes vigentes, elige el de validFrom más reciente", () => {
    const plans = [
      ratePlan({ id: "old", name: "Viejo", baseRate: "40000", validFrom: "2026-01-01" }),
      ratePlan({ id: "new", name: "Nuevo", baseRate: "55000", validFrom: "2026-05-01" }),
    ];
    const result = pickApplicableRatePlan(plans, "2026-06-15");
    expect(result?.ratePlanId).toBe("new");
    expect(result?.rate).toBe(55000);
  });

  it("devuelve null si el baseRate no es un número válido o es cero", () => {
    expect(pickApplicableRatePlan([ratePlan({ baseRate: "0" })], "2026-06-15")).toBeNull();
  });

  it("devuelve null si no hay ningún plan para ese tipo de habitación", () => {
    expect(pickApplicableRatePlan([], "2026-06-15")).toBeNull();
  });

  it("con ocupación pedida, usa el tramo de pax publicado en vez de baseRate", () => {
    const result = pickApplicableRatePlan([ratePlan({ rate2pax: "48000" })], "2026-06-15", 2);
    expect(result?.rate).toBe(48000);
  });

  it("con ocupación pedida pero ese tramo no publicado, cae a baseRate", () => {
    const result = pickApplicableRatePlan([ratePlan({ baseRate: "50000" })], "2026-06-15", 3);
    expect(result?.rate).toBe(50000);
  });

  it("refundable se normaliza de texto 'false' a boolean false", () => {
    const result = pickApplicableRatePlan([ratePlan({ refundable: "false" })], "2026-06-15");
    expect(result?.refundable).toBe(false);
  });
});

describe("buildCompetitorComparisons", () => {
  const roomTypeId = "rt-1";
  const roomTypeNameById = new Map([[roomTypeId, "Doble Standard"]]);
  const referenceRatePlanRowByRoomType = new Map([[roomTypeId, ratePlan({ rate2pax: "52000" })]]);
  const now = new Date("2026-06-15T12:00:00Z");

  function competitorRow(overrides: Partial<CompetitorRateRow> = {}): CompetitorRateRow {
    return {
      competitorName: "Hotel Rival",
      roomTypeId,
      stayDate: "2026-06-20",
      rate: "60000",
      currency: "ARS",
      refundable: true,
      occupancy: 2,
      createdAt: now,
      ...overrides,
    };
  }

  it("incluye una tarifa compatible (moneda, tipo, reembolso, ocupación y frescura todos coinciden)", () => {
    const rows = [competitorRow()];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, referenceRatePlanRowByRoomType, now);
    expect(comp.roomTypeId).toBe(roomTypeId);
    expect(comp.referenceConfigured).toBe(true);
    expect(comp.compatibleRates).toEqual([{ competitorName: "Hotel Rival", rate: 60000, occupancy: 2, ourRate: 52000 }]);
    expect(comp.excludedCount).toBe(0);
  });

  it("excluye una tarifa sin reembolsabilidad cargada, pero no la descarta de la lista (queda como referencia manual)", () => {
    const rows = [competitorRow({ refundable: null })];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, referenceRatePlanRowByRoomType, now);
    expect(comp.compatibleRates).toHaveLength(0);
    expect(comp.excludedCount).toBe(1);
    expect(comp.excludedReasons[0]).toMatch(/faltan condiciones/);
  });

  it("excluye una tarifa sin ocupación cargada", () => {
    const rows = [competitorRow({ occupancy: null })];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, referenceRatePlanRowByRoomType, now);
    expect(comp.compatibleRates).toHaveLength(0);
    expect(comp.excludedReasons[0]).toMatch(/faltan condiciones/);
  });

  it("excluye una tarifa cuya reembolsabilidad no coincide con el plan de referencia", () => {
    const rows = [competitorRow({ refundable: false })]; // referencia es refundable:true
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, referenceRatePlanRowByRoomType, now);
    expect(comp.compatibleRates).toHaveLength(0);
    expect(comp.excludedReasons[0]).toMatch(/reembolso/);
  });

  it("sin plan de referencia configurado para el tipo de habitación, todas las filas quedan excluidas del motor y referenceConfigured es false", () => {
    const rows = [competitorRow()];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, new Map(), now);
    expect(comp.referenceConfigured).toBe(false);
    expect(comp.ourPublishedRate).toBeNull();
    expect(comp.compatibleRates).toHaveLength(0);
    expect(comp.excludedReasons[0]).toMatch(/no hay plan tarifario de referencia configurado/);
  });

  it("plan de referencia configurado pero no vigente para la fecha: excluido con motivo distinto a 'no configurado'", () => {
    const expiredPlan = new Map([[roomTypeId, ratePlan({ validTo: "2026-01-01" })]]);
    const rows = [competitorRow()];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, expiredPlan, now);
    expect(comp.referenceConfigured).toBe(true);
    expect(comp.ourPublishedRate).toBeNull();
    expect(comp.excludedReasons[0]).toMatch(/no está vigente/);
  });

  it("excluye una tarifa en moneda distinta a la del plan de referencia", () => {
    const rows = [competitorRow({ currency: "USD" })];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, referenceRatePlanRowByRoomType, now);
    expect(comp.compatibleRates).toHaveLength(0);
    expect(comp.excludedReasons[0]).toMatch(/moneda/);
  });

  it("excluye una tarifa desactualizada (cargada hace más de 7 días)", () => {
    const old = new Date(now.getTime() - 10 * 86_400_000);
    const rows = [competitorRow({ createdAt: old })];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, referenceRatePlanRowByRoomType, now);
    expect(comp.compatibleRates).toHaveLength(0);
    expect(comp.excludedReasons[0]).toMatch(/desactualizada/);
  });

  it("mantiene una tarifa cargada hace exactamente 3 días (dentro de la ventana de frescura)", () => {
    const recent = new Date(now.getTime() - 3 * 86_400_000);
    const rows = [competitorRow({ createdAt: recent })];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, referenceRatePlanRowByRoomType, now);
    expect(comp.compatibleRates).toHaveLength(1);
  });

  it("agrupa las tarifas sin tipo de habitación como no clasificables, nunca las mezcla con un tipo real", () => {
    const rows = [competitorRow(), competitorRow({ roomTypeId: null, competitorName: "Hotel Genérico" })];
    const comparisons = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, referenceRatePlanRowByRoomType, now);
    const unclassified = comparisons.find(c => c.roomTypeId === "__unclassified__");
    expect(unclassified).toBeDefined();
    expect(unclassified?.excludedCount).toBe(1);
    const classified = comparisons.find(c => c.roomTypeId === roomTypeId);
    expect(classified?.compatibleRates).toHaveLength(1);
  });

  it("dos competidores con ocupaciones distintas se comparan cada uno contra SU tramo correspondiente, no un valor único mezclado", () => {
    const planWithTiers = new Map([[roomTypeId, ratePlan({ rate1pax: "40000", rate2pax: "52000" })]]);
    const rows = [
      competitorRow({ competitorName: "Hotel A", occupancy: 1, rate: "45000" }),
      competitorRow({ competitorName: "Hotel B", occupancy: 2, rate: "60000" }),
    ];
    const [comp] = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, planWithTiers, now);
    expect(comp.compatibleRates).toEqual([
      { competitorName: "Hotel A", rate: 45000, occupancy: 1, ourRate: 40000 },
      { competitorName: "Hotel B", rate: 60000, occupancy: 2, ourRate: 52000 },
    ]);
  });

  it("ignora filas de otra fecha (stayDate distinto al pedido)", () => {
    const rows = [competitorRow({ stayDate: "2026-07-01" })];
    const comparisons = buildCompetitorComparisons("2026-06-20", rows, roomTypeNameById, referenceRatePlanRowByRoomType, now);
    expect(comparisons).toHaveLength(0);
  });
});
