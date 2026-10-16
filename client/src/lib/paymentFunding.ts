import { z } from "zod";

const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const fundingMethods = ["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "mercadopago"] as const;
export const fundingMethodLabels: Record<typeof fundingMethods[number], string> = {
  efectivo: "Efectivo", tarjeta_debito: "Débito", tarjeta_credito: "Crédito",
  transferencia: "Transferencia", mercadopago: "Mercado Pago",
};
const scopeSchema = z.object({ kind: z.enum(["spa", "reservation"]), id: z.string().min(1) });
export const requestSchema = z.object({
  scope: scopeSchema, documentId: z.string().min(1),
  applications: z.array(z.object({ receiptId: z.string().min(1), amountCents: cents.positive() })),
  newCollections: z.array(z.object({ rowId: z.string().min(1), method: z.enum(fundingMethods), amountCents: cents.positive(), shiftId: z.string().min(1) })),
});
export type FundingRequest = z.infer<typeof requestSchema>;
export const operationSchema = z.object({
  id: z.string().uuid(), scope: scopeSchema,
  status: z.enum(["reserved", "authorizing", "fiscal_unknown", "authorized_pending_link", "applied", "aborted"]),
  canAuthorize: z.boolean(), canFinalize: z.boolean(), canResume: z.boolean(), fundsRetained: z.boolean(),
  invoice: z.unknown().nullable(), result: z.unknown().nullable(), lastError: z.unknown().nullable(),
});
export type FundingOperation = z.infer<typeof operationSchema>;
export const projectionSchema = z.object({
  scope: scopeSchema,
  receipts: z.array(z.object({ id: z.string(), sourcePaymentId: z.string(), method: z.enum(fundingMethods),
    amountCents: cents, appliedCents: cents, heldCents: cents, freeCents: cents, version: cents })),
  documents: z.array(z.object({ id: z.string(), totalCents: cents, status: z.string(), snapshot: z.record(z.unknown()) })),
  operations: z.array(operationSchema), debtCents: cents,
  legacyHistory: z.object({reason:z.string(),status:z.string(),totalCents:z.number().int(),paidCents:z.number().int(),
    payments:z.array(z.object({id:z.string(),method:z.string(),status:z.string(),amountCents:z.number().int()})),
    invoices:z.array(z.object({id:z.string(),type:z.string(),point:z.number().nullable(),number:z.number().nullable(),status:z.string(),amountCents:z.number().int()})),
  }).optional(),
  rectifications: z.array(z.object({ shiftId: z.string(), revision: cents, physicalCountCents: cents.nullable(), reason: z.string() })),
}).superRefine((data, ctx) => {
  for (const receipt of data.receipts) {
    if (receipt.amountCents !== receipt.appliedCents + receipt.heldCents + receipt.freeCents)
      ctx.addIssue({ code: "custom", message: "La distribución del cobro no concilia." });
  }
});
export type FundingProjection = z.infer<typeof projectionSchema>;
const previewSchema = z.object({ previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  scope: scopeSchema, documentId: z.string(), totalCents: cents,
  fundingMode: z.enum(["existing_only", "existing_and_new"]), request: requestSchema,
  paymentMethods: z.array(z.object({ method: z.enum(fundingMethods), amountCents: cents })),
});
export type FundingPreview = z.infer<typeof previewSchema>;
export const confirmationSchema = z.object({ operationId: z.string().uuid(),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/), request: requestSchema });
export type FundingConfirmation = z.infer<typeof confirmationSchema>;
export class FundingApiError extends Error {
  constructor(public code: string, message: string, public status: number, public operationId?: string) { super(message); }
}

async function call<T>(path: string, schema: z.ZodType<T, any, any>, body?: unknown): Promise<T> {
  const response = await fetch(`/api/payment-funding${path}`, {
    method: body === undefined ? "GET" : "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const envelope = await response.json().catch(() => null);
  if (!response.ok || envelope?.ok !== true) {
    throw new FundingApiError(envelope?.error?.code ?? "FUNDING_UNAVAILABLE",
      envelope?.error?.message ?? "Financiación no disponible. No vuelva a emitir ni cobrar; consulte la misma operación.",
      response.status, envelope?.error?.operationId);
  }
  const parsed = schema.safeParse(envelope.data);
  if (!parsed.success) throw new FundingApiError("INVALID_RESPONSE", "No se pudo verificar la respuesta. Consulte la misma operación antes de continuar.", response.status);
  return parsed.data;
}
function verifyOperation(operation: FundingOperation, expectedId: string) {
  if (operation.id !== expectedId) throw new FundingApiError("INVALID_RESPONSE", "La respuesta pertenece a otra operación. No vuelva a emitir ni cobrar.", 502, expectedId);
  return operation;
}
export const collectionShiftsSchema = z.array(z.object({ id: z.string().min(1), label: z.string().min(1) }));
export const preparedDocumentSchema = z.object({ documentId: z.string().min(1), totalCents: cents.positive() });
export const spaRecipientSchema=z.object({guestId:z.string().nullable(),kind:z.enum(["guest","spa_client"]).nullable(),
  firstName:z.string(),lastName:z.string(),documentType:z.string().nullish(),documentNumber:z.string().nullish(),
  vatCondition:z.string().nullish(),cuit:z.string().nullish(),address:z.string().nullish(),editable:z.boolean()});
export type SpaRecipient=z.infer<typeof spaRecipientSchema>;
const decimal=z.union([z.string(),z.number()]).transform(Number);
export const spaAccountViewSchema=z.object({id:z.string(),guestName:z.string().nullable(),status:z.string(),totalCents:cents,paidCents:cents,balanceCents:cents,
 readOnly:z.boolean(),canInvoice:z.boolean(),transferred:z.object({roomNumber:z.string(),reservationId:z.string(),amountCents:cents}).passthrough().nullable(),
 items:z.array(z.object({id:z.string(),description:z.string(),quantity:z.number(),unitPrice:decimal,subtotal:decimal,itemType:z.string(),inventoryItemId:z.string().nullable()})),
 payments:z.array(z.object({id:z.string(),amount:decimal,method:z.string(),status:z.string(),notes:z.string().nullable(),createdAt:z.string().nullable()})),
 movements:z.array(z.object({id:z.string(),type:z.string(),amount:decimal,description:z.string().nullable(),createdAt:z.string().nullable()})),
 operations:z.array(z.object({id:z.string(),status:z.string(),invoice:z.unknown()})),
 invoices:z.array(z.object({id:z.string(),type:z.string().nullable(),point:z.number().nullable(),number:z.number().nullable(),status:z.string(),amountCents:cents})),
 events:z.array(z.object({action:z.string(),reason:z.string(),createdAt:z.string()})),
});
export type SpaAccountView=z.infer<typeof spaAccountViewSchema>;
export const fundingApi = {
  account:(id:string)=>call(`/spa/${encodeURIComponent(id)}/account`,spaAccountViewSchema),
  accountCommand:(id:string,body:unknown)=>call(`/spa/${encodeURIComponent(id)}/account`,z.object({action:z.string()}).passthrough(),body),
  roomTargets:(id:string)=>call(`/spa/${encodeURIComponent(id)}/room-targets`,z.array(z.object({id:z.string(),roomNumber:z.string(),firstName:z.string(),lastName:z.string()}))),
  productCatalog:(id:string)=>call(`/spa/${encodeURIComponent(id)}/product-catalog`,z.array(z.object({id:z.string(),name:z.string()}))),
  recipient:(id:string)=>call(`/spa/${encodeURIComponent(id)}/recipient`,spaRecipientSchema),
  recipientCandidate:(id:string)=>call(`/recipients/${encodeURIComponent(id)}`,spaRecipientSchema),
  saveRecipient:(id:string,body:unknown)=>call(`/spa/${encodeURIComponent(id)}/recipient`,spaRecipientSchema,body),
  enrollment: (id: string) => call(`/spa/${encodeURIComponent(id)}/enrollment`, z.object({ adopted: z.boolean() })),
  adoptUnbilled: (id: string) => call(`/spa/${encodeURIComponent(id)}/adopt-unbilled`, z.object({ accountId: z.string().min(1) }), {}),
  collectionShifts: (id: string) => call(`/spa/${encodeURIComponent(id)}/collection-shifts`, collectionShiftsSchema),
  prepareDocument: (id: string) => call(`/spa/${encodeURIComponent(id)}/prepare-document`, preparedDocumentSchema, {}),
  scope: (id: string) => call(`/scopes/spa/${encodeURIComponent(id)}`, projectionSchema),
  preview: (request: FundingRequest) => call("/previews", previewSchema, requestSchema.parse(request)),
  reserve: async (confirmation: FundingConfirmation) => verifyOperation(await call("/operations", operationSchema, confirmationSchema.parse(confirmation)), confirmation.operationId),
  operation: async (id: string) => verifyOperation(await call(`/operations/${encodeURIComponent(id)}`, operationSchema), id),
  action: async (id: string, action: "authorize" | "finalize" | "resume") => verifyOperation(await call(`/operations/${encodeURIComponent(id)}/${action}`, operationSchema, {}), id),
};

/** Decimal pesos only: no thousands separators or floating-point rounding. */
export function pesosToCents(value: string): number {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) throw new Error("Ingresá un importe sin separador de miles y con hasta dos decimales.");
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const result = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error("El importe debe ser positivo y válido.");
  return result;
}
export function centsToInput(value: number) { return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`; }
export function fundingMoney(value: number) { return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value / 100); }
export function fundingJournalKey(userId: string, accountId: string) { return `spa-funding:${encodeURIComponent(userId)}:${encodeURIComponent(accountId)}`; }
export function readFundingJournal(key: string, accountId: string): FundingConfirmation | null {
  const raw = sessionStorage.getItem(key);
  if (raw === null) return null;
  const entry = confirmationSchema.parse(JSON.parse(raw));
  if (entry.request.scope.kind !== "spa" || entry.request.scope.id !== accountId) throw new Error("La operación pendiente no pertenece a este folio. Solicite revisión.");
  return entry;
}
export function persistFundingConfirmation(key: string, preview: FundingPreview): FundingConfirmation {
  // Persist before the first POST. Storage failure must prevent the reservation.
  const entry = confirmationSchema.parse({ operationId: crypto.randomUUID(), previewHash: preview.previewHash, request: preview.request });
  sessionStorage.setItem(key, JSON.stringify(entry));
  return entry;
}
