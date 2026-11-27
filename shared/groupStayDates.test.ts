import { describe, expect, it } from "vitest";
import { groupStayTarget, priceGroupStay } from "./groupStayDates";

const stay = { id: "stay", checkInDate: "2030-05-03", checkOutDate: "2030-05-07", pricingScheme: "nightly_v1", pricingRevision: 2,
  finalRatePerNight: "147000.00", totalRoomAmount: "588000.00",
  nightlyPricing: [3,4,5,6].map(day => ({ date: `2030-05-0${day}`, rateCents: 14700000, discountCents: 0 })) };

describe("fechas y precio del alojamiento grupal", () => {
  it("al quitar una noche actualiza fechas, detalle, cantidad y total juntos", () => {
    const p = priceGroupStay(stay, { checkInDate: "2030-05-04", checkOutDate: "2030-05-07" });
    expect(p.patch).toMatchObject({ nights: 3, totalRoomAmount: "441000.00", pricingRevision: 3 });
    expect(p.patch!.nightlyPricing.map(n => n.date)).toEqual(["2030-05-04", "2030-05-05", "2030-05-06"]);
  });
  it("conserva las tarifas y descuentos contratados, aunque varíen por noche", () => {
    const before = { ...stay, totalRoomAmount: "584999.99", nightlyPricing: stay.nightlyPricing.map((n,i) => ({ ...n, discountCents: i === 0 ? 300001 : 0 })) };
    const p = priceGroupStay(before, { checkInDate: "2030-05-03", checkOutDate: "2030-05-06" });
    expect(p.patch!.nightlyPricing).toEqual(before.nightlyPricing.slice(0,3));
    expect(p.total).toBe("437999.99");
  });
  it("traslada una tarifa plana con su descuento sin consultar precios actuales", () => {
    const before = { ...stay, totalRoomAmount: "560000.00", nightlyPricing: stay.nightlyPricing.map(n => ({ ...n, discountCents: 700000 })) };
    const p = priceGroupStay(before, { checkInDate: "2030-06-03", checkOutDate: "2030-06-07" });
    expect(p.total).toBe("560000.00");
    expect(p.patch!.nightlyPricing.every(n => n.rateCents === 14700000 && n.discountCents === 700000)).toBe(true);
  });
  it("requiere cotizar una noche nueva si el contrato tiene precios variables", () => {
    const before = { ...stay, totalRoomAmount: "688000.00", nightlyPricing: stay.nightlyPricing.map((n,i) => ({ ...n, rateCents: n.rateCents + (i === 0 ? 10000000 : 0) })) };
    const dates = { checkInDate: stay.checkInDate, checkOutDate: "2030-05-08" };
    expect(priceGroupStay(before, dates)).toMatchObject({ patch: null, total: null, missingRates: ["2030-05-07"] });
    const p = priceGroupStay(before, dates, { "2030-05-07": "123456.78" });
    expect(p.total).toBe("811456.78");
    expect(p.patch!.nightlyPricing.slice(0,4)).toEqual(before.nightlyPricing);
  });
  it.each(["dates", "total"])("rechaza un detalle anterior inconsistente: %s", kind => {
    const before = { ...stay, ...(kind === "dates" ? { checkInDate: "2030-05-04" } : { totalRoomAmount: "123.00" }) };
    expect(() => priceGroupStay(before, { checkInDate: "2030-05-04", checkOutDate: "2030-05-07" })).toThrow(/no coinciden/);
  });
  it("no permite usar una cotización nueva para cambiar una noche conservada", () => {
    expect(() => priceGroupStay(stay, { checkInDate: "2030-05-04", checkOutDate: "2030-05-08" }, { "2030-05-05": "1" })).toThrow(/noches nuevas/);
  });
  it("conserva las fechas propias del bloque o de una habitación", () => {
    const group = { checkInDate: "2030-05-03", checkOutDate: "2030-05-07" }, next = { checkInDate: "2030-06-03", checkOutDate: "2030-06-07" };
    const own = { checkInDate: "2030-05-04", checkOutDate: "2030-05-06" };
    expect(groupStayTarget(group, next, own)).toEqual({ ownDates: true, dates: own });
    expect(groupStayTarget(group, next, own, { blockCheckInDate: own.checkInDate, blockCheckOutDate: own.checkOutDate }).dates).toEqual(own);
    expect(groupStayTarget(group, next, group).dates).toEqual(next);
  });
  it("admite una reserva anterior de tarifa plana comprobable y protege precios especiales", () => {
    expect(priceGroupStay({ ...stay, pricingScheme: "legacy", nightlyPricing: null }, { checkInDate: "2030-05-04", checkOutDate: "2030-05-07" }).total).toBe("441000.00");
    expect(() => priceGroupStay({ ...stay, pricingScheme: "legacy", totalRoomAmount: "500000.00", nightlyPricing: null }, { checkInDate: "2030-05-04", checkOutDate: "2030-05-07" })).toThrow(/importe especial/);
  });
  it("conserva el descuento conocido de una tarifa plana anterior", () => {
    const p = priceGroupStay({ ...stay, pricingScheme: "legacy", nightlyPricing: null, baseRatePerNight: "150000.00" }, { checkInDate: "2030-05-04", checkOutDate: "2030-05-07" });
    expect(p.patch!.nightlyPricing).toEqual([4,5,6].map(day => ({ date: `2030-05-0${day}`, rateCents: 15000000, discountCents: 300000 })));
    expect(p.total).toBe("441000.00");
  });
});
