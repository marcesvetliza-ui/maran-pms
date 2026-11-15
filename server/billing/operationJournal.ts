import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { db } from "../db";

export const BILLING_OPERATION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS billing_operations (
  operation_id text PRIMARY KEY,
  owner_type text NOT NULL,
  owner_id text NOT NULL,
  payload_hash text NOT NULL,
  request_snapshot jsonb NOT NULL,
  fiscal_identity jsonb NOT NULL,
  stage text NOT NULL CHECK(stage IN ('prepared','numbered','submitting','authorized','blocked','rejected','uncertain','corrected')),
  invoice_id integer,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_operations_owner_idx ON billing_operations(owner_type,owner_id,created_at DESC);
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS fiscal_identity jsonb;
`;
type Executor = Pick<typeof db, "execute">;
export type FiscalIdentity = { environment: string; issuer: string; pointOfSale: number; type: string };
export type BillingOperation = { operation_id: string; owner_type: string; owner_id: string; stage: string; invoice_id: number | null; payload_hash: string; request_snapshot: any; fiscal_identity: FiscalIdentity; error_code: string | null };
export const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined && typeof value[key] !== "function").map(key => [key, canonical(value[key])])) : value;
export const payloadHash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const snapshotKeys = ["acknowledgeUnassignedAdvance", "reservationBillingAction", "groupDocumentationOnly","correctionOriginalInvoiceId","tipoComprobante", "cliente", "items", "reservaId", "paymentId", "groupId", "groupPaymentId", "groupPaymentIntent", "spaAccountId", "folioId", "puntoVenta", "puntoVentaOverride", "cashArea", "cashFormaPago", "cashFormaPagoDetalle", "ccEntityType", "ccEntityId", "sourceChargeIds", "sourceChargeAmounts", "observaciones", "folioContext", "creditReapplications", "ordinaryAdvanceApplications", "creditOperationId", "reservationSettlementMethod", "checkoutDiscount", "recipientMode", "recipientEntity", "recipientConsumerFinal", "prefacturaRecovery"];
export function operationSnapshot(input: Record<string, any>) {
  return JSON.parse(JSON.stringify(Object.fromEntries(snapshotKeys.filter(key => input[key] !== undefined).map(key => [key, input[key]]))));
}
export function operationOwner(data: any) {
  return data.reservaId ? { type: "reservation", id: String(data.reservaId) } : data.groupId ? { type: "group", id: String(data.groupId) }
    : data.spaAccountId ? { type: "spa", id: String(data.spaAccountId) } : { type: "direct", id: String(data.paymentId || data.restaurantOrderId || "direct") };
}
export async function beginBillingOperation(database: Executor, data: any, identity: FiscalIdentity): Promise<BillingOperation> {
  const owner = operationOwner(data);
  const operationId = String(data.creditReapplicationIntent?.operationId || data.operationId || randomUUID());
  if (operationId.length > 200) throw Object.assign(new Error("Identificador de operación inválido."), { statusCode: 400 });
  const snapshot = operationSnapshot(data.requestSnapshot || data);
  const hash = payloadHash(snapshot);
  await database.execute(sql`
    INSERT INTO billing_operations(operation_id,owner_type,owner_id,payload_hash,request_snapshot,fiscal_identity,stage)
    VALUES(${operationId},${owner.type},${owner.id},${hash},${JSON.stringify(snapshot)}::jsonb,${JSON.stringify(identity)}::jsonb,'prepared')
    ON CONFLICT(operation_id) DO NOTHING
  `);
  const operation = (await database.execute(sql`SELECT * FROM billing_operations WHERE operation_id=${operationId}`)).rows[0] as BillingOperation;
  if (!operation || operation.owner_type !== owner.type || operation.owner_id !== owner.id) throw Object.assign(new Error("La operación no pertenece a esta cuenta."), { statusCode: 409, code: "BILLING_OPERATION_MISMATCH" });
  if (!data.recoveryInvoiceId && operation.payload_hash !== hash) throw Object.assign(new Error("La operación pendiente conserva otros datos. Recuperá el intento original antes de preparar uno nuevo."), { statusCode: 409, code: "BILLING_OPERATION_MISMATCH" });
  if (payloadHash(operation.fiscal_identity) !== payloadHash(identity)) throw Object.assign(new Error("La configuración fiscal cambió desde este intento. No se reenviará con otro ambiente, emisor o punto de venta."), { statusCode: 409, code: "BILLING_IDENTITY_CHANGED" });
  // A numbering conflict happened BEFORE this operation had a draft or sent
  // anything. Retry only its immutable request, never a rejected/uncertain send.
  const retryNumberConflict = operation.stage === "blocked" && operation.error_code === "BILLING_NUMBER_CONFLICT" && !operation.invoice_id;
  if (["blocked", "rejected", "corrected"].includes(operation.stage) && !retryNumberConflict) throw Object.assign(new Error("Este intento necesita corregirse antes de preparar una nueva emisión."), { statusCode: 409, code: "BILLING_CORRECTION_REQUIRED", operationId });
  if (["submitting", "uncertain"].includes(operation.stage) && !operation.invoice_id) throw Object.assign(new Error("Hay una autorización sin resultado verificable. Conservamos la operación para revisión."), { statusCode: 409, code: "BILLING_RESULT_UNCERTAIN" });
  return operation;
}
export async function billingOperationStage(database: Executor, id: string, stage: string, invoiceId?: number, errorCode?: string) {
  await database.execute(sql`UPDATE billing_operations SET stage=${stage},invoice_id=COALESCE(${invoiceId ?? null},invoice_id),error_code=${errorCode ?? null},updated_at=now() WHERE operation_id=${id}`);
}
export async function billingOperationNumber(database: Executor, id: string, number: number) {
  // Internal diagnostic metadata does not change the immutable request hash.
  await database.execute(sql`UPDATE billing_operations SET request_snapshot=jsonb_set(request_snapshot,'{_numberAttempt}',${JSON.stringify(number)}::jsonb),updated_at=now() WHERE operation_id=${id}`);
}
export async function operationForInvoice(database: Executor, invoiceId: number) {
  return (await database.execute(sql`SELECT * FROM billing_operations WHERE invoice_id=${invoiceId} OR operation_id=(SELECT fiscal_identity->>'operationId' FROM sales_invoices WHERE id=${invoiceId}) ORDER BY created_at DESC LIMIT 1`)).rows[0] as BillingOperation | undefined;
}
