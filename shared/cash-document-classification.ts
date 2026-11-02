import { receiptTypeLabel } from "./receiptTypes";

export type CashDocumentClass = "fiscal" | "non_fiscal" | "pending" | "unclassified" | "other";
export const CASH_DOCUMENT_LABELS: Record<CashDocumentClass, string> = {
  fiscal: "Comprobante fiscal", non_fiscal: "Comprobante no fiscal", pending: "Anticipo / pendiente de facturar",
  unclassified: "Sin clasificar", other: "Otros movimientos de caja",
};
const NON_FISCAL = new Set(["ticket", "voucher_justo", "voucher_pedidos_ya", "voucher_room_service", "voucher_consumo_interno", "cierre_habitacion", "cierre_spa", "cierre_spa_agustin", "cierre_spa_cortesia"]);
const FISCAL = new Set(["FA", "FB", "FC", "FT", "FM", "FMB", "NCA", "NCB", "NCC", "NCT", "NCM", "NCMB", "NDA", "NDB", "NDC", "NDT", "NDM", "NDMB"]);
export function normalizedDocumentType(type: unknown): string {
  const value = String(type ?? "").trim();
  return ({ factura_a: "FA", factura_b: "FB", factura_c: "FC", factura_t: "FT", "Factura A": "FA", "Factura B": "FB", "Factura C": "FC" } as Record<string,string>)[value] || value;
}
export function isNonFiscalDocument(type: unknown): boolean { return NON_FISCAL.has(normalizedDocumentType(type)); }
export type CashDocument = { id: number; type: string; pointOfSale: number; number: number; status: string | null };
export type CashDocumentEvidence = { documentClass?: CashDocumentClass; documentReference?: string; documents?: CashDocument[] };
export function documentReference(document: CashDocument): string {
  const type = normalizedDocumentType(document.type);
  const name = ({ FA:"Factura A", FB:"Factura B", FC:"Factura C", FT:"Factura T", cierre_habitacion:"Cierre de habitación" } as Record<string,string>)[type] || receiptTypeLabel(type);
  return `${name} ${String(document.pointOfSale).padStart(4,"0")}-${String(document.number).padStart(8,"0")}`;
}
export function classifyCashDocument(input: {sourceType?: string; receiptType?: string | null; receiptNumber?: string | null}, documents: CashDocument[], knownPayment = false): CashDocumentEvidence {
  const valid = documents.filter(d => ["emitida", "autorizada", "parcialmente_acreditada", "acreditada", "anulada"].includes(d.status || "") && Number(d.number) > 0);
  const classes = new Set(valid.map(d => isNonFiscalDocument(d.type) ? "non_fiscal" : FISCAL.has(normalizedDocumentType(d.type)) ? "fiscal" : "unclassified"));
  // More than one document must never multiply the money or guess an allocation.
  if (classes.size > 1 || valid.length > 1) return {documentClass:"unclassified", documentReference:valid.map(documentReference).join(" · "), documents:valid};
  if (valid.length === 1) return {documentClass:[...classes][0] as CashDocumentClass, documentReference:documentReference(valid[0]), documents:valid};
  if (documents.length) return {documentClass:"pending", documentReference:"Comprobante pendiente de autorización", documents};
  if (input.sourceType === "manual") return {documentClass:"other", documentReference:receiptTypeLabel(input.receiptType || "Movimiento manual")};
  if (isNonFiscalDocument(input.receiptType)) return {documentClass:"non_fiscal", documentReference:`${receiptTypeLabel(input.receiptType!)}${input.receiptNumber ? ` · recibo de caja #${input.receiptNumber}` : " · sin número vinculado"}`};
  return {documentClass:knownPayment || FISCAL.has(normalizedDocumentType(input.receiptType)) ? "pending" : "unclassified", documentReference:"Sin comprobante vinculado"};
}
export function isCashMethod(value: unknown): boolean { return ["cash", "efectivo"].includes(String(value || "").trim().toLowerCase()); }
export function cashDocumentSummary(movements: Array<CashDocumentEvidence & {paymentMethod?: string; amount: string | number; movementType?: string; anulado?: boolean}>) {
  const totals: Record<CashDocumentClass, number> = {fiscal:0, non_fiscal:0, pending:0, unclassified:0, other:0};
  for (const m of movements) if (!m.anulado && m.movementType === "income" && isCashMethod(m.paymentMethod)) totals[m.documentClass || "unclassified"] += Math.round(Number(m.amount) * 100);
  return Object.entries(totals).map(([key, cents]) => ({key:key as CashDocumentClass, label:CASH_DOCUMENT_LABELS[key as CashDocumentClass], total:cents / 100}));
}
/** Internal imputations/prepaid redemptions are not a fresh collection. */
export function nonFiscalCollectionError(type: unknown, methods: unknown[]): string | null {
  if (!isNonFiscalDocument(type)) return null;
  const noCollection = new Set(["", "none", "sin_cobro", "sin_pago", "no_charge", "courtesy", "cortesia", "room_charge", "cuenta_habitacion", "cargo_habitacion", "venta_previa", "gift_voucher"]);
  return methods.some(method => !isCashMethod(method) && !noCollection.has(String(method ?? "").trim().toLowerCase()))
    ? "Los comprobantes no fiscales solo admiten cobros en efectivo o sin cobro nuevo. Para cobrar con otro medio, elegí un comprobante fiscal." : null;
}
