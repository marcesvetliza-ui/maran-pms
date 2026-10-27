import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../db-storage";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface GroupFiscalCashDocument {
  id: number;
  groupId: string;
  tipoComprobante: string;
  puntoVenta: number;
  numero: number;
  montoTotal: string | number;
  clienteRazonSocial?: string;
  originalReference?: string;
}

// This is fiscal evidence, NEVER a collection or a refund. Group operations
// belong to Reception regardless of the fiscal point of sale.
// Call within the same transaction that completes credit-note reconciliation.
export async function ensureGroupFiscalCashInformation(
  tx: Transaction,
  document: GroupFiscalCashDocument,
  operator?: string,
): Promise<boolean> {
  const isCredit = /^NC(A|B|C|T|M|MB)$/.test(document.tipoComprobante);
  const isInvoice = /^(FA|FB|FC|FT|FM|FMB)$/.test(document.tipoComprobante);
  const amount = Number(document.montoTotal);
  if (!document.groupId || !Number.isSafeInteger(document.id) || document.id <= 0 ||
      (!isCredit && !isInvoice) || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Comprobante de grupo inválido para el registro informativo de Caja");
  }
  const sourceType = isCredit ? "nota_credito" : "comprobante_grupo";
  const sourceId = String(document.id);
  // Independent of shift and caller: concurrent retries cannot duplicate it.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`group-fiscal-cash:${document.id}`}))`);
  const existing = await tx.execute(sql`
    SELECT id FROM cash_movements
    WHERE source_type = ${sourceType} AND source_id = ${sourceId}
      AND movement_type = 'informational' AND anulado = false
    LIMIT 1
  `);
  if (existing.rows.length) return false;

  const reference = `${document.tipoComprobante} ${String(document.puntoVenta).padStart(4, "0")}-${String(document.numero).padStart(8, "0")}`;
  const label = [
    reference,
    document.originalReference ? `s/${document.originalReference}` : null,
    document.clienteRazonSocial,
    "Grupo · sólo informativo",
  ].filter(Boolean).join(" — ");

  for (;;) {
    const shift = await storage.getOrCreateActiveTurno("recepcion");
    // Same lock as closeShift/registerCashMovement: never append to a closed
    // shift or change its saved closing summary.
    const locked = await tx.execute(sql`
      SELECT id, area, status FROM cash_shifts WHERE id = ${shift.id} FOR UPDATE
    `);
    const current = locked.rows[0] as { id: string; area: string; status: string } | undefined;
    if (!current || current.status !== "open") continue;
    await tx.execute(sql`
      INSERT INTO cash_movements (
        id, shift_id, area, source_type, source_id, source_label,
        payment_method, amount, movement_type, receipt_type, registered_by,
        payment_id, receipt_number
      ) VALUES (
        ${randomUUID()}, ${current.id}, ${current.area}, ${sourceType}, ${sourceId}, ${label},
        ${isCredit ? "nc" : "factura_grupo"}, ${amount.toFixed(2)}, 'informational',
        ${document.tipoComprobante}, ${operator || null}, NULL,
        nextval('cash_movements_receipt_number_seq'::regclass)::text
      )
    `);
    return true;
  }
}
