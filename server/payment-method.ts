export type ReservationPaymentClass = "cash" | "current_account" | "voucher" | "other";

/** Canonicalize every payment spelling accepted by room checkout. */
export function normalizeReservationPaymentMethod(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

const aliases: Record<string, string> = {
  efectivo: "cash", cash: "cash",
  tarjeta_debito: "debit_card", debit_card: "debit_card",
  tarjeta_credito: "credit_card", credit_card: "credit_card",
  transferencia: "transfer", transfer: "transfer",
  mercadopago: "mercadopago",
  cuenta_corriente: "current_account", current_account: "current_account",
  cargo_habitacion: "room_charge", room_charge: "room_charge",
  voucher: "voucher", gift_voucher: "voucher", gift_voucher_room: "voucher",
  voucher_regalo: "voucher", room_charge_voucher: "voucher",
  voucher_habitacion: "voucher",
};

const spanishCanonical: Record<string, string> = {
  cash: "efectivo",
  debit_card: "tarjeta_debito",
  credit_card: "tarjeta_credito",
  transfer: "transferencia",
  current_account: "cuenta_corriente",
  check: "cheque",
};

/**
 * El resto del sistema (Caja, reportes, pagos de grupo) acepta ambas
 * grafías de una misma forma de pago como alias (ver `aliases` arriba) —
 * pero la factura fiscal (ARCA) y sus PDFs solo reconocen la grafía en
 * español. Un pago guardado con la grafía en inglés (ej. un anticipo
 * cargado desde el flujo de grupos) rompía la emisión de la factura al
 * intentar aplicarlo, con el error "Forma de pago inválida: transfer".
 */
export function normalizeToSpanishPaymentMethod(value: unknown): string {
  const normalized = normalizeReservationPaymentMethod(value);
  return spanishCanonical[normalized] ?? normalized;
}

export function classifyReservationPaymentMethod(value: unknown): {
  method: string;
  class: ReservationPaymentClass;
  informational: boolean;
} {
  const method = aliases[normalizeReservationPaymentMethod(value)] ?? normalizeReservationPaymentMethod(value);
  // A retención (IIBB/Ganancias/IVA) that whoever pays us withholds is never
  // money that reached Caja — same treatment as current_account/voucher:
  // it settles the folio balance but doesn't count as cash received.
  const isRetencion = method.startsWith("retencion_");
  const informational = method === "current_account" || method === "voucher" || isRetencion;
  return {
    method,
    class: informational ? (isRetencion ? "other" : (method as "current_account" | "voucher")) : method === "cash" ? "cash" : "other",
    informational,
  };
}