import { RECEIVED_RETENTION_ACCOUNT_CODES } from "./purchaseInvoiceTotals";
export const SPECIAL_PURCHASE_TYPES = [
  "RETENCION",
  "RESUMEN-BANCO",
  "LIQ-TARJETA",
] as const;
export const RETENTION_LABELS = {
  iva: "IVA",
  ganancias: "Ganancias",
  iibb: "IIBB",
  municipal: "Municipalidad",
  suss: "SUSS",
} as const;
export type SpecialPurchaseAmounts = {
  tipo: string;
  importe?: number;
  neto21?: number;
  neto105?: number;
  exento?: number;
  percepcionIva?: number;
  ley25413?: number;
  retencionIibb?: number;
  iva21Override?: number | null;
  iva105Override?: number | null;
};
export function specialPurchaseTotals(p: SpecialPurchaseAmounts) {
  const cents = (n: number | undefined) => Math.round((n ?? 0) * 100);
  const iva21 =
    p.iva21Override != null
      ? cents(p.iva21Override)
      : Math.round(cents(p.neto21) * 0.21);
  const iva105 =
    p.iva105Override != null
      ? cents(p.iva105Override)
      : Math.round(cents(p.neto105) * 0.105);
  const neto =
    p.tipo === "RETENCION"
      ? cents(p.importe)
      : cents(p.neto21) + cents(p.neto105);
  const total =
    p.tipo === "RETENCION"
      ? neto
      : neto +
        cents(p.exento) +
        iva21 +
        iva105 +
        cents(p.percepcionIva) +
        cents(p.ley25413) +
        cents(p.retencionIibb);
  return {
    neto: neto / 100,
    iva21: p.tipo === "RETENCION" ? 0 : iva21 / 100,
    iva105: p.tipo === "RETENCION" ? 0 : iva105 / 100,
    total: total / 100,
  };
}
export function specialPurchaseAccountCode(
  tipo: string,
  subtipo?: keyof typeof RETENTION_LABELS,
) {
  return tipo === "RETENCION"
    ? subtipo
      ? RECEIVED_RETENTION_ACCOUNT_CODES[subtipo]
      : null
    : tipo === "RESUMEN-BANCO"
      ? "4.2.1.08.18"
      : "4.2.1.08.05.02";
}
