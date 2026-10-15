import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";

export const moneyMethods = ["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "mercadopago"] as const;
export const scopeSchema = z.object({ kind: z.enum(["reservation", "spa"]), id: z.string().min(1).max(100) }).strict();
const cents = z.number().int().positive().max(9_000_000_000_000);
const key = z.string().min(1).max(120);
export const fundingRequestSchema = z.object({
  scope: scopeSchema,
  documentId: key,
  applications: z.array(z.object({ receiptId: key, amountCents: cents }).strict()).max(100),
  newCollections: z.array(z.object({
    rowId: key, method: z.enum(moneyMethods), amountCents: cents, shiftId: key,
  }).strict()).max(20),
}).strict();
export const correctionRequestSchema = z.object({
  scope: scopeSchema, receiptId: key,
  action: z.enum(["change_method", "void_nonexistent", "restore_coverage"]),
  newMethod: z.enum(moneyMethods).optional(),
  reason: z.string().trim().min(10).max(2000),
  evidenceRef: z.string().trim().min(3).max(500),
  historical: z.boolean().default(false),
  restorations: z.array(z.object({ receiptId: key, documentId: key, amountCents: cents }).strict()).max(100).default([]),
}).strict();
export type Scope = z.infer<typeof scopeSchema>;
export type FundingRequest = z.infer<typeof fundingRequestSchema>;
export type CorrectionRequest = z.infer<typeof correctionRequestSchema>;
export type Collection = FundingRequest["newCollections"][number];
export type Actor = { id: string; permissions: string[] };
export type InvoiceResult = {
  operationId: string; documentId: string; invoiceId: string; cae: string;
  totalCents: number; claimHash: string;
};
export type FiscalLookup = { outcome: "authorized"; invoice: InvoiceResult } | { outcome: "unknown" | "rejected" };
// Implementations MUST claim a stable fiscal number before network I/O and
// look up that same claim on recovery. A timeout/not-found is never rejection.
export interface FiscalGateway {
  authorize(operationId: string, claim: Record<string, any>): Promise<FiscalLookup>;
  lookup(operationId: string): Promise<FiscalLookup>;
}
export interface FundingAdapter {
  assertScope(client: PoolClient, scope: Scope, operationId?: string): Promise<void>;
  assertReceipt(client: PoolClient, receipt: any): Promise<void>;
  totals(client: PoolClient, scope: Scope): Promise<{ totalCents: number; paidCents: number }>;
  validateCollection(client:PoolClient,scope:Scope,collection:Collection):Promise<any>;
  collect(client: PoolClient, scope: Scope, collection: Collection, operationId: string, actor: Actor): Promise<any>;
  finalize(client: PoolClient, scope: Scope, operation: any, invoice: InvoiceResult, actor: Actor): Promise<void>;
  correct(client: PoolClient, receipt: any, request: CorrectionRequest, operationId: string, actor: Actor): Promise<void>;
}
export class FundingError extends Error {
  constructor(public code: string, message: string, public status = 409, public retryable = false, public details?: any) {
    super(message);
  }
}
export function requirePermission(actor: Actor, permission = "funding:write") {
  if (!actor?.id || !actor.permissions.includes(permission)) throw new FundingError("FORBIDDEN", "No tiene permiso para esta operación.", 403);
}
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export function hash(value: any) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function stableId(value: string) {
  const h = hash(value).slice(0, 32);
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20)}`;
}
export function identifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Invalid SQL identifier");
  return `"${value}"`;
}
export function number(value: unknown): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new FundingError("INVALID_MONEY", "Importe fuera de rango.", 422);
  return result;
}
export function amount(cents: number) { return (cents / 100).toFixed(2); }
