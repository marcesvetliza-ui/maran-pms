export const CARD_SETTLEMENT_TYPE = "LIQ-TARJETA";
export const RECEIVED_RETENTION_TYPE = "RETENCION";

export const RECEIVED_RETENTION_ACCOUNT_CODES = {
  iibb: "1.1.4.01.08.01",
  iva: "1.1.4.01.04.01",
  ganancias: "1.1.4.01.05",
  municipal: "1.1.4.01.11",
  suss: "1.1.4.01.10",
} as const;

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
  retencionMunicipal?: string | number | null;
};

export type PurchaseInvoiceNetLine = {
  neto: string | number | null;
  alicuota: string;
};

export type PurchaseInvoiceArticleAmount = {
  quantity: string | number;
  unitPrice: string | number;
  vatRate?: string | null;
};

/** A usa precio neto y discrimina IVA; B usa precio final y no suma IVA encima. */
export function suggestPurchaseAmountsFromArticles(
  articles: PurchaseInvoiceArticleAmount[],
  tipoComprobante: string,
): { lines: Array<{ neto: string; alicuota: string }>; fields: Record<string, string>; articleTotal: number } {
  const totals = new Map<string, number>();
  const grossPrice = tipoComprobante === "FACT-B" || tipoComprobante === "FACT-C" || tipoComprobante === "RECIBO-C";
  for (const article of articles) {
    const subtotal = roundCurrency(amount(article.quantity) * amount(article.unitPrice));
    const rate = grossPrice ? "0" : article.vatRate === "2.5" ? "25" : article.vatRate || "0";
    totals.set(rate, roundCurrency((totals.get(rate) || 0) + subtotal));
  }
  const lines = [...totals].map(([alicuota, neto]) => ({ alicuota, neto: neto.toFixed(2) }));
  const fields = grossPrice
    ? { montoNeto: [...totals.values()].reduce((sum, value) => sum + value, 0).toFixed(2),
        montoIva5: "", montoIva25: "", montoIva105: "", montoIva21: "", montoIva27: "" }
    : calculatePurchaseInvoiceAmountsFromNetLines(lines);
  return { lines, fields, articleTotal: calculatePurchaseInvoiceTotal({ tipoComprobante, ...fields }) };
}

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

export function isReceivedRetention(tipoComprobante?: string | null): boolean {
  return tipoComprobante === RECEIVED_RETENTION_TYPE;
}

/** Los comprobantes del proveedor se cancelan mediante su Orden de Pago. */
export function isSupplierPayableDocument(tipoComprobante?: string | null): boolean {
  return /^(FACT|NC|ND|RECIBO)-/.test(tipoComprobante || "");
}

export function receivedRetentionAccountCode(subtipo?: string | null): string | null {
  return RECEIVED_RETENTION_ACCOUNT_CODES[
    String(subtipo || "").toLowerCase() as keyof typeof RECEIVED_RETENTION_ACCOUNT_CODES
  ] || null;
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
    retencionMunicipal: formAmount(row.retencion_municipal),
    montoTotal: formAmount(row.monto_total),
    saldoPendiente: formAmount(row.saldo_pendiente),
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
  // Una retención recibida es un certificado por un crédito fiscal: el importe
  // ingresado ya es el valor final, igual que en los comprobantes C.
  if (isReceivedRetention(input.tipoComprobante)) {
    return roundCurrency(amount(input.montoNeto));
  }

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
    amount(input.retencionSuss) +
    amount(input.retencionMunicipal);

  return roundCurrency(baseAndTaxes + (isCardSettlement(input.tipoComprobante) ? retentions : -retentions));
}

export function isValidPurchaseInvoiceTotal(tipoComprobante: string | null | undefined, total: number): boolean {
  return tipoComprobante === "REMITO" || (Number.isFinite(total) && total > 0);
}

// condicion_iva de accounting_suppliers es texto libre: conviven "Responsable
// Inscripto" (ABM actual), "responsable_inscripto" (datos históricos/tests)
// y "R.Inscrp." (importado de la planilla real del proveedor consultor) —
// confirmado leyendo accounting-suppliers.tsx y server/seed.ts. Normalizamos
// a letras antes de comparar para no depender de un formato exacto.
function normalizeCondicionIva(raw: string | null | undefined): string {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

// La letra del comprobante depende de la condición IVA de quien lo EMITE (el
// proveedor), no la nuestra. Solo bloqueamos las combinaciones que AFIP nunca
// permite bajo ninguna interpretación — no la sugerencia general de letra
// (esa es no bloqueante a propósito: un proveedor cargado como Responsable
// Inscripto puede facturar un concepto exento y emitir B en vez de A).
// - Letra A discrimina IVA: solo puede emitirla un Responsable Inscripto.
// - Monotributo tiene un único comprobante habilitado, la C.
export function condicionIvaPermiteComprobante(
  condicionIva: string | null | undefined,
  tipoComprobante: string | null | undefined,
): boolean {
  const letra = /^(?:FACT|NC|ND|RECIBO)-([ABC])$/.exec(tipoComprobante || "")?.[1];
  if (!letra) return true;
  const norm = normalizeCondicionIva(condicionIva);
  const esResponsableInscripto = norm.includes("inscr");
  const esMonotributo = norm.startsWith("monotribut");
  if (letra === "A") return esResponsableInscripto;
  if (esMonotributo) return letra === "C";
  return true;
}

export function purchaseInvoiceRetentionSide(tipoComprobante?: string | null): "debe" | "haber" {
  return isCardSettlement(tipoComprobante) || isReceivedRetention(tipoComprobante) ? "debe" : "haber";
}

export function shouldRegisterPracticedIibbRetention(tipoComprobante?: string | null): boolean {
  return !isCardSettlement(tipoComprobante) && !isReceivedRetention(tipoComprobante);
}
