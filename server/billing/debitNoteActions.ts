import type { Express, Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { requireAuth } from "../auth";
import { hasPermission } from "../permissions";
import { withFinancialScopeLock, withReservationFinancialLock } from "../nightlyPricingGuard";
import { creditTypeForDebitNote, debitNoteCorrectionTag } from "@shared/debitNoteActions";
import { creditTypeForInvoice } from "@shared/fiscal-document-types";
import { buildComprobanteAsociado, calcularMontos, emitirFactura, type NewInvoiceData } from "./invoiceService";
import { payloadHash } from "./operationJournal";
import { releaseReservationCredit, reclaimReservationCredit } from "./reservationCreditRelease";
import { getBillingConfig } from "./billingConfig";
import { RESTAURANT_CREDIT_NOTE_PERMISSION } from "./restaurantCreditNoteAccess";

const CREDIT_TYPES = new Set(["NCA", "NCB", "NCC", "NCT", "NCM", "NCMB"]);
const DEBIT_TYPES = ["NDA", "NDB", "NDC", "NDT", "NDM", "NDMB"];
const DISPLAY_METHODS = new Set(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia", "mercadopago", "cuenta_corriente"]);
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const parse = (value: any) => { try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return null; } };
const money = (value: unknown): number => {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(String(value ?? ""))) throw fail("El comprobante tiene un importe inválido.");
  const [whole, fraction = ""] = String(value).split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw fail("El importe no puede verificarse con precisión.");
  return result;
};
const pesos = (cents: number) => (cents / 100).toFixed(2);
const label = (note: any) => `${note.tipo_comprobante} ${String(note.punto_venta).padStart(4, "0")}-${String(note.numero).padStart(8, "0")}`;
const isNote = (row: any) => CREDIT_TYPES.has(row?.tipo_comprobante) || !!creditTypeForDebitNote(row?.tipo_comprobante);
const snapshot = (row: any) => payloadHash(Object.fromEntries([
  "id", "tipo_comprobante", "punto_venta", "numero", "estado", "monto_total", "monto_acreditado", "nota_credito_id",
  "reserva_id", "group_id", "spa_account_id", "restaurant_order_id", "folio_id", "cash_forma_pago", "items",
  "cliente_razon_social", "cliente_cuit", "cliente_dni", "cliente_condicion_iva", "source_charge_ids", "source_charge_amounts", "fiscal_identity",
].map(key => [key, row[key] ?? null])));
const operationKey = (kind: string, id: number, value: unknown) => {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw fail("Actualizá la pantalla para preparar la corrección.", 400);
  return `${kind}:${id}:${value}`;
};
const reason = (value: unknown) => {
  if (typeof value !== "string" || value.trim().length < 3 || value.trim().length > 500) throw fail("Ingresá un motivo de entre 3 y 500 caracteres.", 400);
  return value.trim();
};
function assertBody(body: any, fields: string[]) {
  if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).some(key => !fields.includes(key))) throw fail("La solicitud contiene campos no permitidos.", 400);
}
type Chain = { rows: any[]; root: any; top: any; reservationId: string | null; mode: "invoice_credit" | "additional_debit" };

async function readChain(executor: any, id: number, lock = false): Promise<Chain> {
  const rows: any[] = [], seen = new Set<number>();
  let next = id;
  while (next) {
    if (seen.has(next) || rows.length >= 24) throw fail("Los comprobantes asociados tienen un vínculo circular o ambiguo.");
    seen.add(next);
    const row = (await executor.execute(sql`SELECT * FROM sales_invoices WHERE id=${next}`)).rows[0];
    if (!row) throw fail("No se encontró el comprobante asociado.", 404);
    rows.push(row);
    if (!isNote(row) || row.nota_credito_id == null) break;
    next = Number(row.nota_credito_id);
  }
  if (lock) {
    await executor.execute(sql`SELECT id FROM sales_invoices WHERE id IN (${sql.join(rows.map(row => sql`${Number(row.id)}`), sql`,`)}) ORDER BY id FOR UPDATE`);
    return readChain(executor, id);
  }
  const last = rows[rows.length - 1];
  const hasInvoice = !isNote(last);
  if (hasInvoice && !creditTypeForInvoice(last.tipo_comprobante)) throw fail("El documento asociado no es una factura fiscal.");
  const top = hasInvoice ? rows[rows.length - 2] : last;
  if (!top || CREDIT_TYPES.has(top.tipo_comprobante) && !hasInvoice) throw fail("No se pudo identificar la factura original de esta corrección.");
  const root = last;
  for (let index = 0; index < rows.length - 1; index++) {
    const child = rows[index], parent = rows[index + 1];
    if (isNote(parent) && CREDIT_TYPES.has(child.tipo_comprobante) === CREDIT_TYPES.has(parent.tipo_comprobante)) throw fail("La cadena de notas no conserva una corrección de signo contrario.");
    const expectedCredit = creditTypeForDebitNote(child.tipo_comprobante) || (creditTypeForDebitNote(parent.tipo_comprobante) ?? creditTypeForInvoice(parent.tipo_comprobante));
    const actualCredit = CREDIT_TYPES.has(child.tipo_comprobante) ? child.tipo_comprobante : CREDIT_TYPES.has(parent.tipo_comprobante) ? parent.tipo_comprobante : creditTypeForInvoice(parent.tipo_comprobante);
    if (expectedCredit !== actualCredit) throw fail("Los comprobantes asociados no conservan la misma clase fiscal.");
    if (Number(child.punto_venta) !== Number(parent.punto_venta) ||
        ["reserva_id", "group_id", "spa_account_id", "restaurant_order_id"].some(key => child[key] != null && parent[key] != null && String(child[key]) !== String(parent[key]))) throw fail("Los comprobantes no pertenecen al mismo punto de venta o cuenta.");
    const childIdentity = parse(child.fiscal_identity), parentIdentity = parse(parent.fiscal_identity);
    if (childIdentity && parentIdentity && ["environment", "issuer"].some(key => childIdentity[key] !== parentIdentity[key])) throw fail("Los comprobantes asociados pertenecen a ambientes o emisores distintos.");
    for (const key of ["cliente_cuit", "cliente_dni"]) if (child[key] && parent[key] && String(child[key]).replace(/[\s-]/g, "") !== String(parent[key]).replace(/[\s-]/g, "")) throw fail("Los comprobantes asociados pertenecen a receptores diferentes.");
  }
  const owner = rows.find(row => row.reserva_id != null);
  if (owner && rows.some(row => row.reserva_id != null && String(row.reserva_id) !== String(owner.reserva_id))) throw fail("Los comprobantes pertenecen a reservas diferentes.");
  const archived = await executor.execute(sql`SELECT 1 FROM sales_control_archive WHERE kind='invoice' AND record_id IN (${sql.join(rows.map(row => sql`${String(row.id)}`), sql`,`)}) LIMIT 1`);
  if (archived.rows.length) throw fail("El comprobante pertenece al archivo histórico de ventas.");
  return { rows, root, top, reservationId: owner ? String(owner.reserva_id) : null, mode: CREDIT_TYPES.has(top.tipo_comprobante) ? "invoice_credit" : "additional_debit" };
}

async function scoped<T>(chain: Chain, action: () => Promise<T>): Promise<T> {
  if (chain.reservationId) return withReservationFinancialLock(chain.reservationId, action);
  const group = chain.rows.find(row => row.group_id)?.group_id;
  if (group) return withFinancialScopeLock(`group-invoice:${group}`, action);
  const spa = chain.rows.find(row => row.spa_account_id)?.spa_account_id;
  if (spa) return withFinancialScopeLock(`spa-invoice:${spa}`, action);
  return withFinancialScopeLock(`debit-note:${chain.root.id}`, action);
}

async function access(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw fail("Comprobante inválido.", 400);
    if (hasPermission(String(req.user?.role || ""), "api:billing:nc-reconciliation")) return next();
    if (!hasPermission(String(req.user?.role || ""), RESTAURANT_CREDIT_NOTE_PERMISSION)) throw fail("No autorizado para corregir esta Nota de Débito.", 403);
    const chain = await readChain(db, id);
    const original = chain.root;
    if (chain.reservationId || chain.rows.some(row => row.group_id || row.spa_account_id) || !original.restaurant_order_id || original.center_settlement_area && original.center_settlement_area !== "restaurant") throw fail("Este permiso sólo permite corregir notas de Restaurant.", 403);
    const order = await db.execute(sql`SELECT id FROM restaurant_orders WHERE id=${String(original.restaurant_order_id)}`);
    if (order.rows.length !== 1) throw fail("No se pudo verificar el pedido de Restaurant.", 403);
    next();
  } catch (error: any) { res.status(error.statusCode || 503).json({ error: error.message }); }
}

async function auditChange(tx: any, note: any, req: any, action: string, details: any, description?: string) {
  await tx.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,ip_address,timestamp)
    VALUES(${String(req.user?.id || "")},${String(req.user?.fullName || req.user?.username || "")},${action},'billing','debit_note',${String(note.id)},${description || (action === "update" ? "Corrección de forma de pago informativa de Nota de Débito" : "Anulación fiscal de Nota de Débito")},${JSON.stringify(details)},${String(req.ip || "")},now())`);
}

function assertIssued(note: any) {
  if (!["emitida", "parcial"].includes(note.estado) || note.reconciliation_status && note.reconciliation_status !== "conciliada") throw fail("Completá la autorización o conciliación pendiente antes de corregir la nota.");
  if (!note.modo_ficticio && !/^\d{14}$/.test(String(note.cae || ""))) throw fail("La nota no conserva una autorización fiscal verificable.");
}
function correctionItems(target: any) {
  const items = parse(target.items);
  if (!Array.isArray(items) || !items.length || money(calcularMontos(items, target.tipo_comprobante).montoTotal.toFixed(2)) !== money(target.monto_total)) throw fail("El detalle fiscal de la nota no coincide con su importe.");
  return items;
}
async function assertIdentity(note: any) {
  if (note.modo_ficticio) return;
  const config = await getBillingConfig(), identity = parse(note.fiscal_identity);
  if (!identity || identity.environment !== config.arcaAmbiente || identity.issuer !== String(config.arcaCuit || config.cuit || "").replace(/\D/g, "")) throw fail("La configuración fiscal cambió. La corrección debe usar el ambiente y emisor de la nota original.");
}

async function previousAnnulment(id: number, key?: string) {
  const rows = (await db.execute(sql`SELECT * FROM sales_invoices WHERE nota_credito_id=${id} AND tipo_comprobante IN ('NCA','NCB','NCC','NCT','NCM','NCMB') AND observaciones LIKE ${`%[annul-debit:${id}:%`}
    AND ${key ? sql`(fiscal_identity->>'operationId'=${key} OR observaciones LIKE ${`%[debit-operation:${key}]`})` : sql`reconciliation_status='pendiente'`} ORDER BY id`)).rows as any[];
  if (rows.length > 1) throw fail("Hay más de una corrección vinculada. Revisá el historial antes de continuar.");
  return rows[0];
}

async function counterpartyProof(executor: any, chain: Chain, amount: number) {
  if (chain.mode === "invoice_credit") {
    const source = parse(chain.rows[0].source_charge_amounts), originalSource = parse(chain.top.source_charge_amounts);
    if (!source || Array.isArray(source) || !originalSource || Array.isArray(originalSource) || Object.values(source).reduce((sum: number, value) => sum + money(value), 0) !== money(chain.rows[0].monto_total) ||
        Object.entries(source).some(([key, value]) => !Object.hasOwn(originalSource, key) || money(value) <= 0 || money(value) > money(originalSource[key]))) throw fail("La nota no conserva un detalle consistente de los conceptos originales.");
  }
  const affected = chain.mode === "invoice_credit" ? chain.rows : chain.rows.filter(isNote);
  for (const row of affected) {
    const children = (await executor.execute(sql`SELECT tipo_comprobante,monto_total,monto_acreditado,estado FROM sales_invoices WHERE nota_credito_id=${Number(row.id)}
      AND tipo_comprobante IN (${sql.join((CREDIT_TYPES.has(row.tipo_comprobante) ? DEBIT_TYPES : [...CREDIT_TYPES]).map(type=>sql`${type}`),sql`,`)})
      AND estado IN ('emitida','parcial','anulada') AND (reconciliation_status IS NULL OR reconciliation_status='conciliada')`)).rows as any[];
    const net = children.reduce((sum, child) => {
      const total = money(child.monto_total), credited = money(child.monto_acreditado || "0");
      if (credited > total || child.estado === "anulada" && credited !== total) throw fail("Una corrección anterior tiene un saldo inconsistente.");
      return sum + total - credited;
    }, 0);
    if (net !== money(row.monto_acreditado || "0")) throw fail("El saldo de la nota no coincide con sus correcciones anteriores. Requiere conciliación.");
  }
  const states = affected.map((row, index) => {
    const total = money(row.monto_total), credited = money(row.monto_acreditado || "0") + (index % 2 ? -amount : amount);
    if (credited < 0 || credited > total) throw fail("Los saldos de los comprobantes asociados requieren conciliación antes de continuar.");
    return { row, credited, state: credited === total ? "anulada" : credited === 0 ? "emitida" : "parcial" };
  });
  let movement: any;
  if (chain.mode === "additional_debit") {
    const movements = (await executor.execute(sql`SELECT fm.*,f.entity_type,f.entity_id FROM folio_movements fm JOIN folios f ON f.id=fm.folio_id
      WHERE fm.source_type='nota_debito' AND fm.source_id=${String(chain.top.id)} AND fm.type='charge' AND fm.amount::numeric>0`)).rows as any[];
    if (movements.length > 1 || movements.length && money(movements[0].amount) !== money(chain.top.monto_total)) throw fail("El movimiento de la Nota de Débito no tiene un origen único.");
    movement = movements[0];
    if (chain.reservationId && (!movement || movement.entity_type !== "reservation" || String(movement.entity_id) !== chain.reservationId)) throw fail("No se pudo verificar el cargo adicional de esta Nota de Débito en la reserva.");
    if (movement && !chain.reservationId) {
      let owner: string | undefined;
      if (movement.entity_type === "spa_account") owner = chain.rows.find(row => row.spa_account_id)?.spa_account_id || (await executor.execute(sql`SELECT id FROM spa_accounts WHERE invoice_id=${Number(chain.root.id)}`)).rows[0]?.id;
      if (movement.entity_type === "event") owner = (await executor.execute(sql`SELECT id FROM events WHERE invoice_id=${Number(chain.root.id)}`)).rows[0]?.id;
      if (movement.entity_type === "restaurant_order") owner = chain.rows.find(row => row.restaurant_order_id)?.restaurant_order_id;
      if (movement.entity_type === "group") owner = chain.rows.find(row => row.group_id)?.group_id;
      if (!owner || String(owner) !== String(movement.entity_id)) throw fail("El movimiento de la nota pertenece a una cuenta que no coincide con su origen.");
    }
  }
  return { states, movement };
}

/** Every counterparty changes its ancestors with alternating signs. The original
 * invoice's backwards NC pointer is retained, and traversal stops at that sale.
 * A debit that added a new amount owns its own folio charge instead. */
export async function reconcileDebitCounterparty(targetId: number, correction: any, req: any) {
  return db.transaction(async tx => {
    const chain = await readChain(tx, targetId, true);
    const note = (await tx.execute(sql`SELECT * FROM sales_invoices WHERE id=${Number(correction.id)} FOR UPDATE`)).rows[0] as any;
    if (note?.reconciliation_status === "conciliada") return note;
    const target = chain.rows[0], amount = money(note?.monto_total);
    if (!note || note.estado !== "emitida" || Number(note.nota_credito_id) !== targetId || !amount || amount !== money(target.monto_total) - money(target.monto_acreditado || "0")) throw fail("El ajuste no coincide con el saldo vigente de la nota.");
    if (CREDIT_TYPES.has(note.tipo_comprobante) === CREDIT_TYPES.has(target.tipo_comprobante)) throw fail("La corrección debe tener signo contrario a la nota original.");
    const { states, movement } = await counterpartyProof(tx, chain, amount);
    if (chain.mode === "invoice_credit" && chain.reservationId) {
      if (CREDIT_TYPES.has(note.tipo_comprobante)) await releaseReservationCredit(tx, chain.root, note);
      else await reclaimReservationCredit(tx, chain.root, note);
    }
    if (chain.mode === "additional_debit") {
      if (movement) {
        if (chain.reservationId && (movement.entity_type !== "reservation" || String(movement.entity_id) !== chain.reservationId)) throw fail("El movimiento pertenece a otra cuenta.");
        await tx.execute(sql`SELECT id FROM folios WHERE id=${String(movement.folio_id)} FOR UPDATE`);
        const signedAmount = CREDIT_TYPES.has(note.tipo_comprobante) ? -amount : amount;
        await tx.execute(sql`INSERT INTO folio_movements(id,folio_id,type,amount,description,source_type,source_id,voided_movement_id,void_reason,registered_by)
          VALUES(${`debit-correction:${note.id}`},${String(movement.folio_id)},'charge',${pesos(signedAmount)},${`${label(note)} — corrección de ${label(target)}`},'nota_debito',${String(note.id)},${String(movement.id)},${String(note.observaciones || "")},${String(req.user?.fullName || req.user?.username || "")})`);
        await tx.execute(sql`UPDATE folios SET total_charges=(SELECT coalesce(sum(amount::numeric),0) FROM folio_movements WHERE folio_id=${String(movement.folio_id)} AND type IN ('charge','transfer_in')),
          total_payments=(SELECT coalesce(sum(amount::numeric),0) FROM folio_movements WHERE folio_id=${String(movement.folio_id)} AND type IN ('payment','advance','discount','transfer_out','void')) WHERE id=${String(movement.folio_id)}`);
        await tx.execute(sql`UPDATE folios SET balance=total_charges::numeric-total_payments::numeric WHERE id=${String(movement.folio_id)}`);
      }
    }
    for (const { row, credited, state } of states) await tx.execute(sql`UPDATE sales_invoices SET monto_acreditado=${pesos(credited)},estado=${state} WHERE id=${Number(row.id)}`);
    const area = chain.reservationId || chain.root.group_id ? "recepcion" : chain.root.center_settlement_area || (chain.root.spa_account_id ? "spa" : chain.root.restaurant_order_id ? "restaurant" : "recepcion");
    await tx.execute(sql`INSERT INTO cash_movements(id,area,source_type,source_id,source_label,payment_method,amount,movement_type,registered_by)
      VALUES(${`debit-correction:${note.id}`},${area},${CREDIT_TYPES.has(note.tipo_comprobante) ? "nota_credito" : "nota_debito"},${String(note.id)},${`${label(note)} s/${label(target)}`},${CREDIT_TYPES.has(note.tipo_comprobante) ? "nc" : "nd"},${pesos(amount)},'informational',${String(req.user?.fullName || req.user?.username || "")})`);
    const restoring = !CREDIT_TYPES.has(note.tipo_comprobante), auditTarget = creditTypeForDebitNote(target.tipo_comprobante) ? target : chain.rows.find(row => creditTypeForDebitNote(row.tipo_comprobante));
    await auditChange(tx, auditTarget, req, restoring ? "update" : "delete", { correctionId: note.id, targetDocumentId: target.id, originalChain: chain.rows.map(row => ({ id: row.id, estado: row.estado, montoAcreditado: row.monto_acreditado })), after: states.map(state => ({ id: state.row.id, estado: state.state, montoAcreditado: pesos(state.credited) })), reason: note.observaciones }, restoring ? "Restauración fiscal de Nota de Débito" : "Anulación fiscal de Nota de Débito");
    const updated = await tx.execute(sql`UPDATE sales_invoices SET reconciliation_status='conciliada',reconciliation_error=NULL,reconciliation_updated_at=now() WHERE id=${Number(note.id)} RETURNING *`);
    return updated.rows[0];
  });
}

async function issueCounterparty(target: any, credit: boolean, request: any, req: any, previous?: any) {
  const type = credit ? creditTypeForDebitNote(target.tipo_comprobante) : DEBIT_TYPES.find(value => creditTypeForDebitNote(value) === target.tipo_comprobante);
  if (!type) throw fail("Tipo de nota no admitido para esta corrección.");
  if (previous && previous.tipo_comprobante !== type) throw fail("El intento anterior no conserva la clase fiscal esperada.");
  const amount = money(target.monto_total) - money(target.monto_acreditado || "0");
  if (amount <= 0 || money(target.monto_acreditado || "0") !== 0) throw fail("Esta acción requiere el saldo íntegro de la nota. Revisá sus correcciones anteriores.");
  const chain = await readChain(db, Number(target.id));
  if (!credit && !creditTypeForDebitNote(chain.rows[1]?.tipo_comprobante)) throw fail("Esta NC no corresponde a una anulación de Nota de Débito.", 400);
  await counterpartyProof(db, chain, amount);
  if (credit && chain.mode === "invoice_credit" && chain.reservationId) await releaseReservationCredit(db, chain.root, { monto_total: pesos(amount) }, true);
  const fiscalSource = previous || target;
  const items = previous ? parse(previous.items) : correctionItems(target);
  const data: NewInvoiceData = {
    operationId: request.operationKey,
    tipoComprobante: type as NewInvoiceData["tipoComprobante"],
    cliente: { razonSocial: fiscalSource.cliente_razon_social, cuit: fiscalSource.cliente_cuit, dni: fiscalSource.cliente_dni, documentType: fiscalSource.cliente_document_type, condicionIva: fiscalSource.cliente_condicion_iva, domicilio: fiscalSource.cliente_domicilio },
    items, facturaOriginalId: Number(target.id), comprobanteAsociado: buildComprobanteAsociado(target),
    operador: previous?.operador || String(req.user?.fullName || req.user?.username || ""), puntoVentaOverride: Number(fiscalSource.punto_venta),
    reservaId: chain.reservationId || undefined, groupId: chain.rows.find(row => row.group_id)?.group_id || undefined,
    spaAccountId: chain.rows.find(row => row.spa_account_id)?.spa_account_id || undefined,
    restaurantOrderId: chain.rows.find(row => row.restaurant_order_id)?.restaurant_order_id || undefined,
    sourceChargeIds: parse(fiscalSource.source_charge_ids) || undefined, sourceChargeAmounts: parse(fiscalSource.source_charge_amounts) || undefined,
    cashFormaPago: fiscalSource.cash_forma_pago || undefined,
    observaciones: previous?.observaciones || `${credit ? "Anulación" : "Restauración"} de ${label(target)} — ${request.reason} [annul-debit:${target.id}:${request.expectedFingerprint}] [debit-operation:${request.operationKey}]`,
    recoverableCreditNote: credit, recoverableDebitNote: !credit, recoveryInvoiceId: previous ? Number(previous.id) : undefined,
  };
  const issued = previous?.estado === "emitida" ? previous : await emitirFactura(data);
  try { return await reconcileDebitCounterparty(Number(target.id), issued, req); }
  catch (error: any) {
    await db.execute(sql`UPDATE sales_invoices SET reconciliation_error=${String(error.message)},reconciliation_updated_at=now() WHERE id=${Number(issued.id)}`);
    throw fail(`El ajuste está emitido y falta conciliarlo. Reintentá esta misma acción: ${String(error.message)}`);
  }
}

export async function restoreAnnulledDebitCredit(nc: any, body: any, req: any) {
  const key = operationKey("debit-restore", Number(nc.id), body.operationId);
  const previous = (await db.execute(sql`SELECT * FROM sales_invoices WHERE nota_credito_id=${Number(nc.id)} AND tipo_comprobante IN ('NDA','NDB','NDC','NDT','NDM','NDMB') AND (fiscal_identity->>'operationId'=${key} OR observaciones LIKE ${`%[debit-operation:${key}]`}) ORDER BY id`)).rows as any[];
  if (previous.length > 1) throw fail("Hay más de un intento de restauración. Revisá la conciliación.");
  if (previous[0]?.reconciliation_status === "conciliada") return previous[0];
  const amount = money(nc.monto_total) - money(nc.monto_acreditado || "0");
  if (money(String(body.monto)) !== amount) throw fail("Esta NC anula una Nota de Débito y debe revertirse por su saldo total.", 400);
  const motive = reason(body.motivo);
  assertIssued(nc); if (!previous[0]) await assertIdentity(nc);
  return issueCounterparty(nc, false, { reason: motive, expectedFingerprint: snapshot(nc), operationKey: key }, req, previous[0]);
}

export async function resumeDebitAnnulment(note: any, nc: any, req: any) {
  if (nc.reconciliation_status === "conciliada") return nc;
  const chain = await readChain(db, Number(note.id));
  const frozen = debitNoteCorrectionTag(nc)?.fingerprint;
  if (!frozen || snapshot(note) !== frozen) throw fail("La nota cambió desde el intento original. Conservamos el ajuste pendiente para revisión.");
  return scoped(chain, () => issueCounterparty(note, true, { reason: "Recuperación del ajuste original", expectedFingerprint: snapshot(note) }, req, nc));
}

export function registerDebitNoteActionRoutes(app: Express) {
  app.get("/api/billing/debit-notes/:id/actions", requireAuth, access, async (req, res) => {
    try {
      const chain = await readChain(db, Number(req.params.id)), note = chain.rows[0];
      if (!creditTypeForDebitNote(note.tipo_comprobante)) throw fail("El comprobante no es una Nota de Débito.", 400);
      const key = req.query.operationId ? operationKey("debit-annul", Number(note.id), req.query.operationId) : undefined;
      const previous = await previousAnnulment(Number(note.id), key) || await previousAnnulment(Number(note.id));
      const previousKey = previous ? parse(previous.fiscal_identity)?.operationId || debitNoteCorrectionTag(previous)?.operationKey : null;
      const recoveryOperationId = typeof previousKey === "string" ? previousKey.match(/[a-f0-9-]{36}$/i)?.[0] : undefined;
      const previousFingerprint = previous ? debitNoteCorrectionTag(previous)?.fingerprint : undefined;
      let unavailable: string | null = null;
      try { assertIssued(note); if (money(note.monto_acreditado || "0") !== 0) throw fail("La nota ya tiene una corrección; revisá su conciliación."); correctionItems(note); await counterpartyProof(db, chain, money(note.monto_total)); }
      catch (error: any) { unavailable = error.message; }
      res.json({ invoice: note, expectedFingerprint: previousFingerprint || snapshot(note), recoveryOperationId, creditType: creditTypeForDebitNote(note.tipo_comprobante), canEdit: ["emitida", "parcial", "registrada"].includes(note.estado) && (!note.reconciliation_status || note.reconciliation_status === "conciliada") && !previous, canAnnul: !unavailable || !!previous, reason: unavailable, correction: previous ? { id: previous.id, estado: previous.estado, reconciliationStatus: previous.reconciliation_status } : null });
    } catch (error: any) { res.status(error.statusCode || 500).json({ error: error.message }); }
  });
  app.patch("/api/billing/debit-notes/:id", requireAuth, access, async (req, res) => {
    try {
      assertBody(req.body, ["cashFormaPago", "reason", "expectedFingerprint"]);
      const motive = reason(req.body.reason);
      if (!DISPLAY_METHODS.has(req.body.cashFormaPago)) throw fail("Forma de pago no admitida.", 400);
      const chain = await readChain(db, Number(req.params.id));
      const result = await scoped(chain, () => db.transaction(async tx => {
        const current = await readChain(tx, Number(req.params.id), true), note = current.rows[0];
        if (!creditTypeForDebitNote(note.tipo_comprobante) || !["emitida", "parcial", "registrada"].includes(note.estado)) throw fail("Sólo se puede editar una Nota de Débito vigente.");
        if (note.reconciliation_status && note.reconciliation_status !== "conciliada" || await previousAnnulment(Number(note.id))) throw fail("Completá la conciliación pendiente antes de editar la nota.");
        if (snapshot(note) !== req.body.expectedFingerprint) throw fail("La nota cambió desde que se abrió. Actualizá la pantalla.");
        const updated = await tx.execute(sql`UPDATE sales_invoices SET cash_forma_pago=${req.body.cashFormaPago},cash_forma_pago_detalle=NULL WHERE id=${Number(note.id)} RETURNING *`);
        await auditChange(tx, note, req, "update", { before: note.cash_forma_pago, after: req.body.cashFormaPago, reason: motive, informationalOnly: true });
        return updated.rows[0];
      }));
      res.json(result);
    } catch (error: any) { res.status(error.statusCode || 500).json({ error: error.message }); }
  });
  app.post("/api/billing/debit-notes/:id/annul", requireAuth, access, async (req, res) => {
    try {
      assertBody(req.body, ["reason", "expectedFingerprint", "operationId"]);
      const motive = reason(req.body.reason), id = Number(req.params.id), chain = await readChain(db, id);
      const key = operationKey("debit-annul", id, req.body.operationId);
      const result = await scoped(chain, async () => {
        const current = await readChain(db, id), note = current.rows[0];
        if (!creditTypeForDebitNote(note.tipo_comprobante)) throw fail("El comprobante no es una Nota de Débito.", 400);
        const previous = await previousAnnulment(id, key);
        if (previous) {
          if (previous.reconciliation_status === "conciliada") return { ...previous, alreadyCompleted: true, currentDebitState: note.estado };
          const frozen = debitNoteCorrectionTag(previous)?.fingerprint;
          if (snapshot(note) !== frozen) throw fail("La nota cambió desde el intento original. Conservamos el ajuste pendiente para revisión.");
          if (req.body.expectedFingerprint !== frozen && req.body.expectedFingerprint !== snapshot(note)) throw fail("El intento anterior conserva otros datos. Actualizá la nota.");
          return issueCounterparty(note, true, { reason: motive, expectedFingerprint: frozen, operationKey: key }, req, previous);
        }
        if (await previousAnnulment(id)) throw fail("Hay una anulación pendiente. Reanudá ese mismo intento desde Facturación.");
        assertIssued(note); await assertIdentity(note);
        if (snapshot(note) !== req.body.expectedFingerprint) throw fail("La nota cambió desde que se abrió. Actualizá la pantalla.");
        return issueCounterparty(note, true, { reason: motive, expectedFingerprint: snapshot(note), operationKey: key }, req);
      });
      res.json(result);
    } catch (error: any) { res.status(error.statusCode || 500).json({ error: error.message }); }
  });
}
