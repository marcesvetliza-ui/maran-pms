import { createHash } from "node:crypto";

export type ReservationPaymentRequest = { id: string; fingerprint: string };

export const RESERVATION_PAYMENT_REQUEST_SCHEMA_SQL = `
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_request_id varchar;
  ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_request_fingerprint text;
  CREATE UNIQUE INDEX IF NOT EXISTS payments_request_id_unique ON payments (payment_request_id);
`;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export function parseReservationPaymentRequest(
  body: Record<string, unknown>,
  actor: string,
): ReservationPaymentRequest | undefined {
  const id = body.paymentRequestId;
  if (id === undefined) return undefined; // Existing clients retain their contract.
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw Object.assign(new Error("Identificador de operación de pago inválido."), { statusCode: 400 });
  }
  const { paymentRequestId, paymentRequestFingerprint, ...payload } = body;
  return {
    id: id.toLowerCase(),
    fingerprint: createHash("sha256").update(JSON.stringify(canonical({ actor, payload }))).digest("hex"),
  };
}

export function assertPaymentRequestMatches(
  payment: { paymentRequestFingerprint?: string | null },
  request: ReservationPaymentRequest,
): void {
  if (payment.paymentRequestFingerprint !== request.fingerprint) {
    throw Object.assign(new Error("Esta operación de pago ya fue utilizada con otros datos o por otro usuario."), { statusCode: 409 });
  }
}
