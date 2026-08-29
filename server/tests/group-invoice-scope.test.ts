import { describe, expect, it } from "vitest";
import {
  attachGroupInvoiceCompositionSources,
  getPersistedGroupInvoiceCompositionSources,
  parseGroupInvoiceSourceAmounts,
} from "../billing/groupInvoiceScope";
import { calcularMontos } from "../billing/invoiceService";
import { allocateGroupInvoiceSources, grossItemsTotal } from "../../client/src/lib/group-invoice-allocation";
import { computeGroupOperationalLedger } from "../billing/groupOperationalLedger";
import { buildGroupInvoiceComposition } from "../../shared/groupInvoiceComposition";

describe("group invoice source availability", () => {
  it("separates operational debt from fiscal availability for partial group collections", () => {
    const accommodationSource = "reservation:r-1:accommodation";
    const lines = [{
      reservationId: "r-1",
      reservationCode: "R-1",
      guestName: "Huésped",
      roomNumber: "101",
      status: "checked_in",
      nights: 1,
      accommodationTotal: 360_000,
      charges: [],
      extrasTotal: 0,
      payments: [
        { id: "allocation-advance", groupPaymentId: "advance", amount: "60000.00", status: "active" },
        { id: "allocation-fiscal", groupPaymentId: "fiscal", amount: "30000.00", status: "active" },
      ],
      paymentsTotal: 90_000,
    }] as any;
    const parents = [
      { id: "advance", amount: "60000.00" },
      { id: "fiscal", amount: "30000.00" },
    ] as any;
    const invoice = {
      monto_total: "30000.00",
      monto_acreditado: "0.00",
      source_charge_amounts: { [accommodationSource]: 30_000 },
    };

    const operational = computeGroupOperationalLedger(lines, [], parents);
    const invoiced = Object.values(parseGroupInvoiceSourceAmounts(invoice))
      .reduce((sum, amount) => sum + amount, 0);

    expect(operational).toMatchObject({
      accommodation: 360_000,
      payments: 90_000,
      balance: 270_000,
    });
    expect({
      eligible: 360_000,
      invoiced,
      available: 360_000 - invoiced,
    }).toEqual({
      eligible: 360_000,
      invoiced: 30_000,
      available: 330_000,
    });

    lines[0].payments.push({
      id: "allocation-final",
      groupPaymentId: "final",
      amount: "270000.00",
      status: "active",
    });
    lines[0].paymentsTotal = 360_000;
    parents.push({ id: "final", amount: "270000.00" });
    expect(computeGroupOperationalLedger(lines, [], parents).balance).toBe(0);
  });

  it("keeps a partial invoice allocation by concept", () => {
    expect(parseGroupInvoiceSourceAmounts({
      monto_total: "100.00",
      monto_acreditado: "0.00",
      source_charge_amounts: {
        "reservation:r-1:accommodation": 70,
        "group-charge:g-1": 30,
      },
    })).toEqual({
      "reservation:r-1:accommodation": 70,
      "group-charge:g-1": 30,
    });
  });

  it("restores the proportional available amount after a partial credit note without a legacy source map", () => {
    expect(parseGroupInvoiceSourceAmounts({
      monto_total: "100.00",
      monto_acreditado: "25.00",
      source_charge_amounts: {
        "reservation:r-1:accommodation": 60,
        "group-charge:g-1": 40,
      },
      credit_source_charge_amounts: [],
    })).toEqual({
      "reservation:r-1:accommodation": 45,
      "group-charge:g-1": 30,
    });
  });

  it("uses an explicit credit-note allocation when it is available for a deterministic reissue", () => {
    expect(parseGroupInvoiceSourceAmounts({
      monto_total: "100.00",
      monto_acreditado: "25.00",
      source_charge_amounts: {
        "reservation:r-1:accommodation": 60,
        "group-charge:g-1": 40,
      },
      credit_source_charge_amounts: [{
        "reservation:r-1:accommodation": 20,
        "group-charge:g-1": 5,
      }],
    })).toEqual({
      "reservation:r-1:accommodation": 40,
      "group-charge:g-1": 35,
    });
  });

  it("preserves gross cents across multiple VAT lines", () => {
    const totals = calcularMontos([
      { descripcion: "Concepto 1", cantidad: 1, precioUnitario: 0.03, alicuotaIva: "21", subtotalNeto: 0.02, subtotal: 0.03 },
      { descripcion: "Concepto 2", cantidad: 1, precioUnitario: 0.03, alicuotaIva: "21", subtotalNeto: 0.02, subtotal: 0.03 },
    ], "FB");

    expect(totals).toMatchObject({ montoNeto: 0.05, montoIva21: 0.01, montoTotal: 0.06 });
  });

  it("builds a group source payload from gross cents instead of rounded IVA preview values", () => {
    const items = [{
      descripcion: "Concepto de tres centavos",
      cantidad: 1,
      precioUnitario: 0.03,
      alicuotaIva: "21",
      subtotalNeto: 0.02,
      subtotal: 0.03,
    }];
    const total = grossItemsTotal(items);

    expect(total).toBe(0.03);
    expect(allocateGroupInvoiceSources([{ id: "group-charge:g-1", available: 0.03 }], total))
      .toEqual({ "group-charge:g-1": 0.03 });
    expect(calcularMontos(items, "FB").montoTotal).toBe(total);
  });

  it("groups exact fiscal cents into accommodation, room charges and group charges", () => {
    const composition = buildGroupInvoiceComposition([
      {
        id: "reservation:r-1:accommodation",
        kind: "accommodation",
        concept: "Alojamiento",
        destination: "Habitación 101",
      },
      {
        id: "reservation:r-1:charge:c-1",
        kind: "room_charge",
        concept: "Minibar",
        destination: "Habitación 101",
      },
      {
        id: "group-charge:g-1",
        kind: "group_charge",
        concept: "Salón",
        destination: "Grupo",
      },
    ], {
      "reservation:r-1:accommodation": 100.01,
      "reservation:r-1:charge:c-1": 20.02,
      "group-charge:g-1": 30.03,
    });

    expect(composition.sections.map((section) => [section.label, section.total])).toEqual([
      ["Alojamiento", 100.01],
      ["Consumos por habitación", 20.02],
      ["Cargos grupales", 30.03],
    ]);
    expect(composition.total).toBe(150.06);
  });

  it("persists immutable source labels inside invoice items without changing fiscal amounts", () => {
    const items = [{
      descripcion: "Servicios grupales",
      cantidad: 1,
      precioUnitario: 150.06,
      alicuotaIva: "21" as const,
      subtotalNeto: 124.02,
      subtotal: 150.06,
    }];
    const sources = [{
      id: "reservation:r-1:accommodation",
      kind: "accommodation" as const,
      concept: "Alojamiento",
      destination: "Habitación 101",
      reservationCode: "R-1",
      roomNumber: "101",
    }];

    const persisted = attachGroupInvoiceCompositionSources(items, sources);
    expect(calcularMontos(persisted, "FB").montoTotal).toBe(150.06);
    expect(getPersistedGroupInvoiceCompositionSources(persisted)).toEqual(sources);
  });

  it.each([
    {
      label: "anticipo no fiscal",
      collected: 120_000,
      fiscalInvoices: [],
      expectedFinancial: 180_000,
      expectedFiscal: 300_000,
    },
    {
      label: "anticipo fiscal",
      collected: 120_000,
      fiscalInvoices: [{
        monto_total: "120000.00",
        monto_acreditado: "0.00",
        source_charge_amounts: { "reservation:r-1:accommodation": 120_000 },
      }],
      expectedFinancial: 180_000,
      expectedFiscal: 180_000,
    },
    {
      label: "anticipos mixtos",
      collected: 300_000,
      fiscalInvoices: [{
        monto_total: "200000.00",
        monto_acreditado: "0.00",
        source_charge_amounts: { "reservation:r-1:accommodation": 200_000 },
      }],
      expectedFinancial: 0,
      expectedFiscal: 100_000,
    },
  ])("keeps financial and fiscal balances independent: $label", ({
    collected,
    fiscalInvoices,
    expectedFinancial,
    expectedFiscal,
  }) => {
    const eligible = 300_000;
    const fiscallyDocumented = fiscalInvoices.reduce(
      (total, invoice) => total + Object.values(parseGroupInvoiceSourceAmounts(invoice))
        .reduce((sum, amount) => sum + amount, 0),
      0,
    );

    expect(Math.max(0, eligible - collected)).toBe(expectedFinancial);
    expect(Math.max(0, eligible - fiscallyDocumented)).toBe(expectedFiscal);
  });
});