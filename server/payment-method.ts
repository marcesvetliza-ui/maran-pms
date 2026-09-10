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

export function classifyReservationPaymentMethod(value: unknown): {
  method: string;
  class: ReservationPaymentClass;
  informational: boolean;
} {
  const method = aliases[normalizeReservationPaymentMethod(value)] ?? normalizeReservationPaymentMethod(value);
  const informational = method === "current_account" || method === "voucher";
  return {
    method,
    class: informational ? (method as "current_account" | "voucher") : method === "cash" ? "cash" : "other",
    informational,
  };
}