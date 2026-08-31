export const CARD_SETTLEMENT_TYPE = "LIQ-TARJETA";

export type PurchaseInvoiceAmountInput = {
  tipoComprobante?: string | null;
  montoNeto?: string | number | null;
  montoIva21?: string | number | null;
  montoIva105?: string | number | null;
  montoIva27?: string | number | null;
  montoIva5?: string | number | null;
  montoIva25?: string | number | null;
  montoExento?: string | number | null;
  montoNoGravado?: string | number | null;
  impuestosInternos?: string | number | null;
  ley25413?: string | number | null;
  percepcionIibb?: string | number | null;
  percepcionIva?: string | number | null;
  percepcionGanancias?: string | number | null;
  retencionIibb?: string | number | null;
  retencionGanancias?: string | number | null;
  retencionIva?: string | number | null;
  retencionSuss?: string | number | null;
};

export type PurchaseInvoiceNetLine = {
  neto: string | number | null;
  alicuota: string;
};

const IVA_FIELD_BY_RATE: Record<string, keyof PurchaseInvoiceAmountInput> = {
  "5": "montoIva5",
  "10.5": "montoIva105",
  "21": "montoIva21",
  "25": "montoIva25",
  "27": "montoIva27",
};

const IVA_RATE_BY_CODE: Record<string, number> = {
  "5": 5,
  "10.5": 10.5,
  "21": 21,
  "25": 2.5,
  "27": 27,
};

function amount(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseFloat(value || "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function formAmount(value: unknown): string {
  return value === null || value === undefined || value === "" ? "0" : String(value);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isCardSettlement(tipoComprobante?: string | null): boolean {
  return tipoComprobante === CARD_SETTLEMENT_TYPE;
}

export function mapPurchaseInvoiceAmountFields(row: Record<string, unknown>) {
  return {
    montoNeto: formAmount(row.monto_neto),
    montoIva21: formAmount(row.monto_iva21),
    montoIva105: formAmount(row.monto_iva105),
    montoIva27: formAmount(row.monto_iva27),
    montoIva5: formAmount(row.monto_iva5),
    montoIva25: formAmount(row.monto_iva25),
    montoExento: formAmount(row.monto_exento),
    montoNoGravado: formAmount(row.monto_no_gravado),
    impuestosInternos: formAmount(row.impuestos_internos),
    ley25413: formAmount(row.ley_25413),
    percepcionIibb: formAmount(row.percepcion_iibb),
    percepcionIva: formAmount(row.percepcion_iva),
    percepcionGanancias: formAmount(row.percepcion_ganancias),
    retencionIibb: formAmount(row.retencion_iibb),
    retencionGanancias: formAmount(row.retencion_ganancias),
    retencionIva: formAmount(row.retencion_iva),
    retencionSuss: formAmount(row.retencion_suss),
    montoTotal: formAmount(row.monto_total),
  };
}

export function calculatePurchaseInvoiceAmountsFromNetLines(
  lines: PurchaseInvoiceNetLine[],
): Record<string, string> {
  const ivaTotals: Record<string, number> = {};
  let netoTotal = 0;

  for (const line of lines) {
    const neto = amount(line.neto);
    netoTotal += neto;
    const field = IVA_FIELD_BY_RATE[line.alicuota];
    const rate = IVA_RATE_BY_CODE[line.alicuota];
    if (field && rate && neto > 0) {
      ivaTotals[field] = (ivaTotals[field] || 0) + neto * rate / 100;
    }
  }

  return {
    montoNeto: netoTotal > 0 ? netoTotal.toFixed(2) : "",
    montoIva5: ivaTotals.montoIva5 ? ivaTotals.montoIva5.toFixed(2) : "",
    montoIva25: ivaTotals.montoIva25 ? ivaTotals.montoIva25.toFixed(2) : "",
    montoIva105: ivaTotals.montoIva105 ? ivaTotals.montoIva105.toFixed(2) : "",
    montoIva21: ivaTotals.montoIva21 ? ivaTotals.montoIva21.toFixed(2) : "",
    montoIva27: ivaTotals.montoIva27 ? ivaTotals.montoIva27.toFixed(2) : "",
  };
}

export function calculatePurchaseInvoiceTotal(input: PurchaseInvoiceAmountInput): number {
  const baseAndTaxes =
    amount(input.montoNeto) +
    amount(input.montoIva21) +
    amount(input.montoIva105) +
    amount(input.montoIva27) +
    amount(input.montoIva5) +
    amount(input.montoIva25) +
    amount(input.montoExento) +
    amount(input.montoNoGravado) +
    amount(input.impuestosInternos) +
    amount(input.ley25413) +
    amount(input.percepcionIibb) +
    amount(input.percepcionIva) +
    amount(input.percepcionGanancias);

  const retentions =
    amount(input.retencionIibb) +
    amount(input.retencionGanancias) +
    amount(input.retencionIva) +
    amount(input.retencionSuss);

  return roundCurrency(baseAndTaxes + (isCardSettlement(input.tipoComprobante) ? retentions : -retentions));
}

export function purchaseInvoiceRetentionSide(tipoComprobante?: string | null): "debe" | "haber" {
  return isCardSettlement(tipoComprobante) ? "debe" : "haber";
}

export function shouldRegisterPracticedIibbRetention(tipoComprobante?: string | null): boolean {
  return !isCardSettlement(tipoComprobante);
}