import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { withInvoiceAdvisoryLock } from "./billing/invoiceAdvisoryLock";
import { initialNightlyPricing, nightlyTotal, amountString, pricingError } from "@shared/nightlyPricing";

const financialScope = new AsyncLocalStorage<Set<string>>();
const nightlyWriter = new AsyncLocalStorage<number>();
export const withNightlyWriter = <T>(revision: number, action: () => Promise<T>) => nightlyWriter.run(revision, action);
export function withFinancialScopeLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const held = financialScope.getStore();
  if (held?.has(key)) return action();
  return withInvoiceAdvisoryLock(pool, key, () =>
    financialScope.run(new Set([...(held || []), key]), action));
}
/** Locks a compound booking on one session; nested canonical updates reuse
 * the same scopes instead of exhausting the pool for many rooms. */
export async function withReservationFinancialLocks<T>(ids: string[], action: () => Promise<T>): Promise<T> {
  const keys = [...new Set(ids.map(id => `folio-invoice:${id}`))].sort();
  const c = await pool.connect();
  const acquired: string[] = [];
  try {
    for (const key of keys) { await c.query("SELECT pg_advisory_lock(hashtext($1))", [key]); acquired.push(key); }
    return await financialScope.run(new Set([...(financialScope.getStore() || []), ...keys]), action);
  } finally {
    for (const key of acquired.reverse()) await c.query("SELECT pg_advisory_unlock(hashtext($1))", [key]).catch(() => undefined);
    c.release();
  }
}
export async function withReservationFinancialLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  const links = await db.execute(sql`SELECT group_id FROM group_reservation_links WHERE reservation_id=${id}`);
  const groupId = (links.rows[0] as any)?.group_id;
  const run = () => withFinancialScopeLock(`folio-invoice:${id}`, action);
  return groupId ? withFinancialScopeLock(`group-invoice:${groupId}`, run) : run();
}
const nightlyFields = ["baseRatePerNight", "finalRatePerNight", "totalRoomAmount", "discountType", "discountValue", "nights", "checkInDate", "checkOutDate", "voucherId", "voucherAppliedAmount"];
const financialFields = [...nightlyFields, "earlyCheckInCharge", "lateCheckOutCharge"];
export const mayChangePricing = (patch: Record<string, any>) => financialFields.some(key => patch[key] !== undefined);
const parseMap = (value: any): Record<string, any> | null => {
  try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null; }
  catch { return null; }
};
/** Conservative fiscal policy: no attribution to nights; ambiguous fiscal history fails closed. */
export async function accommodationFiscalStatus(id: string, totalCents = 0) {
  let coveredCents = 0, ambiguous = false, authorizing = false;
  const result = await db.execute(sql`
    SELECT id, estado, source_charge_amounts, source_charge_ids, monto_total, monto_acreditado,
      credit_reapplication_intent
    FROM sales_invoices
    WHERE reserva_id=${id} AND tipo_comprobante IN ('FA','FB','FC','FT','FM','FMB')
      AND (estado IN ('emitida','parcial','autorizacion_pendiente')
        OR (estado='anulada' AND credit_reapplication_intent->'checkoutDiscount' IS NOT NULL))
  `);
  for (const invoice of result.rows as any[]) {
    const amounts = parseMap(invoice.source_charge_amounts);
    // No fiscal mapping is not proof of no lodging coverage.
    if (!amounts || Object.keys(amounts).length === 0 || Number(invoice.monto_acreditado || 0) > 0) ambiguous = true;
    const amount = Number(amounts?.accommodation || 0);
    if (!Number.isFinite(amount) || amount < 0) ambiguous = true;
    else if (amount > 0) {
      if (invoice.estado === "autorizacion_pendiente") authorizing = true;
      else coveredCents += Math.round(amount * 100);
    }
  }
  const group = await db.execute(sql`
    SELECT si.id FROM sales_invoices si
    JOIN group_reservation_links gl ON gl.group_id=si.group_id
    WHERE gl.reservation_id=${id}
      AND si.estado IN ('emitida','parcial','autorizacion_pendiente')
      AND si.tipo_comprobante IN ('FA','FB','FC','FT','FM','FMB')
    LIMIT 1
  `);
  const blocked = group.rows.length
    ? "La reserva pertenece a un grupo con facturación. Resolvé el ajuste en el Folio Maestro antes de modificar alojamiento."
    : ambiguous || authorizing || coveredCents > 0
      ? "El alojamiento tiene cobertura fiscal o una autorización pendiente. Resolvé primero el ajuste por el circuito fiscal existente; no se modificarán pagos ni Caja." : null;
  const state = group.rows.length ? "grupal" : ambiguous ? "revisar" : authorizing ? "en_curso" : coveredCents >= totalCents && coveredCents > 0 ? "facturado" : coveredCents > 0 ? "parcial" : "pendiente";
  return { blocked, state, coveredCents: ambiguous || group.rows.length ? null : coveredCents,
    pendingCents: ambiguous || group.rows.length ? null : Math.max(0, totalCents - coveredCents) };
}
export async function accommodationFiscalBlock(id: string): Promise<string | null> {
  return (await accommodationFiscalStatus(id)).blocked;
}
export async function initializeNightlyPricing(data: Record<string, any>) {
  // Never accept a client-supplied pricing identity or reconstruct an existing reservation.
  delete data.nightlyPricing; delete data.pricingScheme; delete data.pricingRevision;
  const lines = initialNightlyPricing(data);
  data.pricingScheme = "nightly_v1";
  data.nightlyPricing = lines;
  data.pricingRevision = 0;
  data.nights = lines.length;
  data.totalRoomAmount = amountString(nightlyTotal(lines));
  data.finalRatePerNight = amountString(Math.round(nightlyTotal(lines) / lines.length));
}
export async function guardPricingUpdate(existing: Record<string, any>, patch: Record<string, any>) {
  const revision = nightlyWriter.getStore();
  if (revision === undefined) {
    delete patch.pricingScheme; delete patch.nightlyPricing; delete patch.pricingRevision;
  }
  const changed = financialFields.filter(key => patch[key] !== undefined &&
    String(patch[key] ?? "") !== String(existing[key] ?? "") &&
    !(Number.isFinite(Number(patch[key])) && Number(patch[key]) === Number(existing[key])));
  if (revision !== undefined) {
    if (existing.pricingRevision !== revision) pricingError("Otra persona modificó los precios. Actualizá el folio y revisá nuevamente.", 409);
    if (["checked_out", "cancelled", "no_show"].includes(existing.status)) pricingError("La reserva está cerrada y no admite cambios de alojamiento.", 409);
  }
  if (!changed.length && revision === undefined) return;
  if (existing.pricingScheme === "nightly_v1" && revision === undefined && changed.some(key => nightlyFields.includes(key))) {
    pricingError("Esta reserva usa precios por noche. Usá Editar tarifas o Modificar estadía desde el Folio.", 409);
  }
  const blocked = await accommodationFiscalBlock(existing.id);
  if (blocked) pricingError(blocked, 409);
}
