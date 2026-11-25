import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  db,
  withDatabaseTransaction,
  withReadOnlyDatabaseTransaction,
} from "./db";
import { storage } from "./db-storage";
import {
  withFinancialScopeLock,
  withReservationFinancialLocks,
} from "./nightlyPricingGuard";
import { getGroupInvoiceSnapshot } from "./billing/groupInvoiceScope";
import {
  groupAccountSnapshot,
  loadGroupAccountEvidence,
} from "./billing/groupAccount";
import { groupAdvanceReceipt } from "./billing/groupAdvanceReceipt";
import { operationSnapshot, payloadHash } from "./billing/operationJournal";
import { assertBillingPoint, fiscalRecipientError } from "./billing/preflight";
import {
  parseReservationPaymentRequest,
  type ReservationPaymentRequest,
} from "./reservationPaymentRequest";
import { getGroupPaymentRequest } from "./groupPaymentRequest";

const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
const cents = (value: unknown) => Math.round(Number(value) * 100);
const money = (value: number) => value / 100;
const uuid = (id: unknown) =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
type Selection = { reservationId: string; recipient: "group" | "guest" };
type Choice = {
  selection: Selection[];
  closeRooms: boolean;
  paymentRows?: any[];
  receiverDetails?: any;
  puntoVentaOverride?: number;
};
type Row = {
  operation_id: string;
  group_id: string;
  actor_id: string;
  fingerprint: string;
  reservation_ids: string[];
  plan: any;
  status: string;
  collection_finished: boolean;
};

function choices(body: Choice): Choice {
  if (
    !Array.isArray(body.selection) ||
    !body.selection.length ||
    body.selection.length > 200 ||
    typeof body.closeRooms !== "boolean" ||
    body.selection.some(
      (s) =>
        !s ||
        typeof s.reservationId !== "string" ||
        !["group", "guest"].includes(s.recipient),
    ) ||
    new Set(body.selection.map((s) => s.reservationId)).size !==
      body.selection.length
  )
    throw fail("Elegí las habitaciones y el receptor de cada factura.", 400);
  return {
    selection: body.selection
      .map(({ reservationId, recipient }) => ({ reservationId, recipient }))
      .sort((a, b) => a.reservationId.localeCompare(b.reservationId)),
    closeRooms: body.closeRooms,
    ...(body.paymentRows ? { paymentRows: body.paymentRows } : {}),
    ...(body.receiverDetails ? { receiverDetails: body.receiverDetails } : {}),
    ...(body.puntoVentaOverride !== undefined
      ? { puntoVentaOverride: body.puntoVentaOverride }
      : {}),
  };
}
function recipient(entity: any, guest = false) {
  const cuit = String(entity?.cuilCuit || "").replace(/\D/g, "");
  return {
    razonSocial: guest
      ? [entity?.firstName, entity?.lastName].filter(Boolean).join(" ")
      : String(entity?.razonSocial || ""),
    ...(cuit
      ? { cuit }
      : entity?.documentNumber
        ? { dni: String(entity.documentNumber) }
        : {}),
    condicionIva: String(
      entity?.condicionIva || entity?.vatCondition || "consumidor_final",
    ),
    domicilio: String(entity?.direccion || entity?.address || ""),
  };
}
async function inspect(groupId: string, choice: Choice) {
  const group = await storage.getGroup(groupId);
  if (!group) throw fail("Grupo no encontrado.", 404);
  const [ledger, billing] = await Promise.all([
    storage.getGroupReservationLedger(groupId),
    getGroupInvoiceSnapshot(groupId),
  ]);
  const entity =
    group.billingEntityId && group.billingEntityType === "company"
      ? await storage.getCompany(group.billingEntityId)
      : group.billingEntityId && group.billingEntityType === "agency"
        ? await storage.getAgency(group.billingEntityId)
        : null;
  const payer = recipient(entity);
  // Only select public fiscal identity fields. Private certificates and tokens
  // never enter this operation's snapshot or the response to the browser.
  const config = (
    await db.execute(
      sql`SELECT arca_ambiente AS "arcaAmbiente",arca_cuit AS "arcaCuit",cuit,punto_venta AS "puntoVenta",punto_venta_homolog AS "puntoVentaHomolog" FROM billing_config ORDER BY id LIMIT 1`,
    )
  ).rows[0] as any;
  const blockers: string[] = [];
  let point: number | undefined;
  try {
    if (!config) throw fail("Configurá la facturación antes de emitir.");
    point = await assertBillingPoint(config, choice.puntoVentaOverride, db);
  } catch (e: any) {
    blockers.push(e.message);
  }
  const accountEvidence = await loadGroupAccountEvidence(
    groupId,
    ledger,
    billing,
  );
  const rows: any[] = [];
  for (const selection of choice.selection) {
    const reservation = group.reservations.find(
        (r) => r.id === selection.reservationId,
      ),
      line = ledger.find((r) => r.reservationId === selection.reservationId);
    if (
      !reservation ||
      !line ||
      !["confirmed", "checked_in", "checked_out"].includes(reservation.status)
    ) {
      blockers.push("Una habitación elegida ya no está activa en este grupo.");
      continue;
    }
    const membership = (
      await db.execute(
        sql`SELECT group_id FROM group_reservation_links WHERE reservation_id=${reservation.id}`,
      )
    ).rows;
    if (membership.length !== 1)
      blockers.push(
        `Hab. ${line.roomNumber}: su pertenencia al grupo requiere revisión.`,
      );
    if (!reservation.guest || reservation.guest.codigo === `GROUP-${groupId}`)
      blockers.push(
        `Hab. ${line.roomNumber}: asigná su pasajero antes de facturar.`,
      );
    const balance =
      cents(line.accommodationTotal) +
      cents(line.extrasTotal) -
      cents(line.paymentsTotal);
    if (balance < 0)
      blockers.push(
        `Hab. ${line.roomNumber}: tiene saldo a favor; revisá su aplicación antes de este cierre.`,
      );
    if (balance > 0 && reservation.status === "checked_out")
      blockers.push(
        `Hab. ${line.roomNumber}: la salida ya fue realizada y su saldo se cobra desde su folio.`,
      );
    const client =
      selection.recipient === "group"
        ? payer
        : recipient(reservation.guest, true);
    const type =
      client.condicionIva
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_") === "responsable_inscripto"
        ? "FA"
        : "FB";
    const sources = billing.sources.filter(
      (s) =>
        s.id.startsWith(`reservation:${reservation.id}:`) &&
        cents(s.available) > 0,
    );
    const amount = sources.reduce((n, s) => n + cents(s.available), 0);
    if (amount) {
      const error = fiscalRecipientError(type, client);
      if (error) blockers.push(`Hab. ${line.roomNumber}: ${error}`);
    }
    // The same evidence guard used by individual Prefactura, including legacy
    // group invoices whose room coverage cannot safely be reconstructed.
    const account = await groupAccountSnapshot(reservation.id, accountEvidence);
    if (account.fiscalRequiresReview)
      blockers.push(
        `Hab. ${line.roomNumber}: su cobertura fiscal histórica requiere conciliación.`,
      );
    if (account.reviewReceipts.length)
      blockers.push(
        "Hay recibos grupales cuya distribución requiere conciliación.",
      );
    if (balance > 0 && account.unassigned > 0.009)
      blockers.push(
        "Hay anticipos sin asignar: aplicalos desde Folio Grupal antes de calcular el cobro nuevo.",
      );
    const pending = (
      await db.execute(
        sql`SELECT operation_id,stage FROM billing_operations WHERE owner_type='reservation' AND owner_id=${reservation.id} AND stage IN ('prepared','numbered','submitting','blocked','rejected','uncertain') ORDER BY operation_id`,
      )
    ).rows;
    if (pending.length)
      blockers.push(
        `Hab. ${line.roomNumber}: tiene una emisión anterior pendiente.`,
      );
    const sourceChargeAmounts = Object.fromEntries(
      sources.map((s) => [
        s.kind === "accommodation"
          ? "accommodation"
          : s.id.slice(`reservation:${reservation.id}:charge:`.length),
        s.available,
      ]),
    );
    rows.push({
      reservationId: reservation.id,
      roomNumber: line.roomNumber,
      guestName: line.guestName,
      status: reservation.status,
      balance: money(Math.max(0, balance)),
      paid: line.paymentsTotal,
      invoiceAmount: money(amount),
      client,
      type,
      sourceChargeAmounts,
      items: sources.map((s) => ({
        descripcion: s.concept,
        cantidad: 1,
        precioUnitario: s.available,
        subtotal: s.available,
        subtotalNeto: s.available / 1.21,
        alicuotaIva: "21",
      })),
      pending,
    });
  }
  const pendingGroup = (
    await db.execute(
      sql`SELECT operation_id,stage FROM billing_operations WHERE owner_type='group' AND owner_id=${groupId} AND stage IN ('prepared','numbered','submitting','blocked','rejected','uncertain') ORDER BY operation_id`,
    )
  ).rows;
  if (pendingGroup.length)
    blockers.push(
      "El grupo tiene una emisión pendiente; verificá esa operación antes de iniciar otra.",
    );
  const total = money(rows.reduce((n, r) => n + cents(r.balance), 0));
  if (cents(total) > Math.max(0, cents(billing.financial.operationalBalance)))
    blockers.push(
      "El cobro de las habitaciones supera el saldo operativo del grupo. Revisá sus anticipos y ajustes.",
    );
  const defaultReceiver = payer.razonSocial ? payer : rows[0]?.client;
  const {
    paymentRows: _paymentRows,
    receiverDetails: _receiver,
    ...fiscalChoice
  } = choice;
  const facts = {
    choice: fiscalChoice,
    rows,
    financial: billing.financial,
    pendingGroup,
    config,
    point,
  };
  return {
    fingerprint: payloadHash(facts),
    canPrepare: !blockers.length,
    blockers: [...new Set(blockers)],
    rows,
    total,
    payer: defaultReceiver,
    point,
    remainingGroupCharges: billing.sources
      .filter((s) => s.kind === "group_charge")
      .reduce((n, s) => n + s.available, 0),
    fiscalIdentity:
      config && point
        ? {
            environment: config.arcaAmbiente || "ficticio",
            issuer: String(config.arcaCuit || config.cuit).replace(/\D/g, ""),
            pointOfSale: point,
          }
        : null,
  };
}
export const previewRoomInvoiceBatch = (groupId: string, body: Choice) =>
  withReadOnlyDatabaseTransaction(() => inspect(groupId, choices(body)));
export async function prepareRoomInvoiceBatch(
  groupId: string,
  body: Choice & { operationId: string; fingerprint: string },
  actor: string,
) {
  const choice = choices(body);
  if (!uuid(body.operationId) || typeof body.fingerprint !== "string")
    throw fail("Revisá el resumen antes de confirmar.", 400);
  const identity = payloadHash({
    groupId,
    choice,
    fingerprint: body.fingerprint,
    actor,
  });
  return withFinancialScopeLock(`group-invoice:${groupId}`, () =>
    withReservationFinancialLocks(
      choice.selection.map((s) => s.reservationId),
      () =>
        withDatabaseTransaction(async () => {
          await db.execute(
            sql`SELECT id FROM groups WHERE id=${groupId} FOR UPDATE`,
          );
          const prior = await loadBatch(groupId, body.operationId);
          if (prior) {
            if (prior.fingerprint !== identity)
              throw fail("Este cierre conserva otros datos.");
            return progress(prior, actor);
          }
          const overlapping = (
            await db.execute(
              sql`SELECT operation_id FROM group_room_invoice_batches WHERE group_id=${groupId} AND status='active' AND reservation_ids && ${sql.param(choice.selection.map((s) => s.reservationId))}::text[]`,
            )
          ).rows;
          if (overlapping.length)
            throw fail(
              "Hay un cierre por habitación en curso. Abrilo para continuar con la misma operación.",
            );
          const review = await inspect(groupId, choice);
          if (review.fingerprint !== body.fingerprint)
            throw fail(
              "Los saldos o los datos fiscales cambiaron. Actualizá el resumen.",
            );
          if (review.blockers.length) throw fail(review.blockers[0]);
          const group = await storage.getGroup(groupId);
          const selectedIds = review.rows.map((r) => r.reservationId),
            closeIds = choice.closeRooms
              ? review.rows
                  .filter((r) => r.status !== "checked_out")
                  .map((r) => r.reservationId)
              : [];
          const receiver = choice.receiverDetails || review.payer;
          let paymentBody: any = null,
            paymentRequest: ReservationPaymentRequest | undefined;
          if (review.total > 0) {
            const raw = choice.paymentRows;
            if (!Array.isArray(raw) || !raw.length || raw.length > 20)
              throw fail("Ingresá los medios del cobro nuevo.", 400);
            const methods = new Set([
              "efectivo",
              "transferencia",
              "tarjeta_debito",
              "tarjeta_credito",
              "mercadopago",
              "cuenta_corriente",
              "cheque",
              "echeq",
            ]);
            const rows = raw.map((r) => ({
              method: r.method,
              amount: Number(r.amount).toFixed(2),
              reference: String(r.reference || "").trim(),
              ...(r.retention ? { retention: r.retention } : {}),
            }));
            if (
              rows.some(
                (r) =>
                  !methods.has(r.method) ||
                  !Number.isFinite(Number(r.amount)) ||
                  Number(r.amount) < 0 ||
                  !r.reference ||
                  r.reference.length > 500 ||
                  (r.retention &&
                    (!["iibb", "ganancias"].includes(r.retention.tipo) ||
                      !Number.isFinite(Number(r.retention.monto)) ||
                      Number(r.retention.monto) <= 0 ||
                      r.method === "cuenta_corriente")),
              ) ||
              rows.reduce(
                (n, r) => n + cents(r.amount) + cents(r.retention?.monto || 0),
                0,
              ) !== cents(review.total)
            )
              throw fail(
                "Los medios y retenciones deben coincidir con el cobro nuevo; completá sus referencias.",
                400,
              );
            if (
              !receiver?.razonSocial?.trim() ||
              (!receiver.cuit && !receiver.dni)
            )
              throw fail(
                "Completá nombre y CUIT o DNI del receptor del cobro.",
                400,
              );
            if (
              rows.some((r) => r.method === "cuenta_corriente") &&
              (!["company", "agency"].includes(
                group!.billingEntityType || "",
              ) ||
                !group!.billingEntityId)
            )
              throw fail(
                "La Cuenta Corriente requiere una empresa o agencia configurada en el grupo.",
                400,
              );
            const allocations = Object.fromEntries(
              review.rows
                .filter((r) => r.balance > 0)
                .map((r) => [r.reservationId, r.balance]),
            );
            paymentBody = {
              paymentRequestId: randomUUID(),
              groupRoomInvoiceBatchId: body.operationId,
              paymentRows: rows,
              receiptType: "none",
              distribution: closeIds.length ? "equal" : "manual",
              explicitAllocation: true,
              closeAllRooms: !!closeIds.length,
              closeReservationIds: closeIds,
              distributionDetail: allocations,
              receiverDetails: receiver,
              billingEntityType: group!.billingEntityType,
              billingEntityId: group!.billingEntityId,
              concepts: review.rows
                .filter((r) => r.balance > 0)
                .map((r) => ({
                  description: `Cobro habitación ${r.roomNumber}`,
                  amount: r.balance,
                })),
              notes: "Cobro grupal con facturas individuales por habitación",
            };
            paymentRequest = parseReservationPaymentRequest(
              {
                ...paymentBody,
                groupId,
                endpoint: `/api/groups/${groupId}/payment`,
              },
              actor,
            );
          }
          const plan = {
            choice,
            rows: review.rows,
            selectedIds,
            closeIds,
            total: review.total,
            paymentBody,
            paymentRequest,
            invoices: review.rows
              .filter((r) => r.invoiceAmount > 0)
              .map((r) => ({
                reservationId: r.reservationId,
                roomNumber: r.roomNumber,
                amount: r.invoiceAmount,
                body: {
                  reservaId: r.reservationId,
                  creditOperationId: randomUUID(),
                  tipoComprobante: r.type,
                  cliente: r.client,
                  items: r.items,
                  sourceChargeIds: Object.keys(r.sourceChargeAmounts),
                  sourceChargeAmounts: r.sourceChargeAmounts,
                  puntoVentaOverride: review.point,
                  groupDocumentationOnly: true,
                  reservationBillingAction: "invoice_only",
                  prefacturaRecovery: {
                    version: 2,
                    payments: [],
                    checkoutRequested: false,
                  },
                  expectedFiscalIdentity: review.fiscalIdentity,
                  groupRoomInvoiceBatchId: body.operationId,
                },
              })),
          };
          await db.execute(
            sql`INSERT INTO group_room_invoice_batches(operation_id,group_id,actor_id,fingerprint,reservation_ids,plan) VALUES(${body.operationId},${groupId},${actor},${identity},${sql.param(selectedIds)}::text[],${JSON.stringify(plan)}::jsonb)`,
          );
          await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
            VALUES(${actor},${actor},'create','groups','group',${groupId},'Cierre preparado con cobro único y facturas por habitación',${JSON.stringify({ operationId: body.operationId, reservationIds: selectedIds, total: review.total, closeIds })},now())`);
          return progress((await loadBatch(groupId, body.operationId))!, actor);
        }),
    ),
  ).catch(async (error: any) => {
    if (
      error.statusCode >= 400 &&
      error.statusCode < 500 &&
      !(await loadBatch(groupId, body.operationId))
    )
      error.notApplied = true;
    throw error;
  });
}
async function loadBatch(
  groupId: string,
  id: string,
  executor: any = db,
): Promise<Row | undefined> {
  return (
    await executor.execute(
      sql`SELECT * FROM group_room_invoice_batches WHERE operation_id=${id} AND group_id=${groupId}`,
    )
  ).rows[0] as any;
}
async function collection(row: Row, executor: any = db) {
  if (!row.plan.paymentRequest)
    return { done: row.collection_finished, review: false };
  const result = await getGroupPaymentRequest(
    row.plan.paymentRequest,
    row.group_id,
    executor,
  );
  if (!result) return { done: false, review: false };
  const parent: any = result.groupPayment,
    children = result.reservationPayments.filter(
      (p: any) => p.status !== "anulado",
    );
  const facts = groupAdvanceReceipt(
    {
      distribution_detail: parent.distributionDetail,
      amount: parent.amount,
      payment_method_detail: parent.paymentMethodDetail,
      method: parent.method,
    },
    children.map((p: any) => ({
      reservation_id: p.reservationId,
      amount: p.amount,
      method: p.method,
    })),
  );
  const expected = row.plan.paymentBody.distributionDetail;
  const matches =
    !facts.requiresReview &&
    cents(parent.amount) === cents(row.plan.total) &&
    payloadHash(facts.detail) === payloadHash(expected) &&
    Object.keys(expected).every(
      (id) =>
        children
          .filter((p: any) => p.reservationId === id)
          .reduce((n: number, p: any) => n + cents(p.amount), 0) ===
        cents(expected[id]),
    );
  return { done: matches, review: !matches, groupPaymentId: parent.id };
}
async function progress(row: Row, actor: string) {
  let receipt: any;
  try {
    receipt = await collection(row);
  } catch (e: any) {
    receipt = { done: false, review: true, error: e.message };
  }
  const invoices = [];
  for (const plan of row.plan.invoices) {
    const claimed = (
      await db.execute(
        sql`SELECT id,estado,tipo_comprobante,punto_venta,numero,reconciliation_status,credit_reapplication_intent FROM sales_invoices WHERE reserva_id=${plan.reservationId} AND credit_reapplication_intent->>'operationId'=${plan.body.creditOperationId} ORDER BY id`,
      )
    ).rows as any[];
    const invoice = claimed[0],
      done =
        claimed.length === 1 &&
        invoice.estado === "emitida" &&
        invoice.credit_reapplication_intent?.status === "completed" &&
        invoice.reconciliation_status === "conciliada";
    const needsReview =
      claimed.length > 1 ||
      (invoice && ["anulada", "parcial", "error"].includes(invoice.estado));
    invoices.push({
      ...plan,
      done,
      needsReview: !!needsReview,
      invoice: invoice
        ? {
            id: invoice.id,
            type: invoice.tipo_comprobante,
            point: invoice.punto_venta,
            number: invoice.numero,
            status: invoice.estado,
          }
        : null,
    });
  }
  const complete = receipt.done && invoices.every((i) => i.done);
  // No checkout is replayed here. Reversing a completed departure must remain effective.
  if (complete && row.status === "active")
    await db.execute(
      sql`UPDATE group_room_invoice_batches SET status='completed' WHERE operation_id=${row.operation_id} AND status='active'`,
    );
  return {
    id: row.operation_id,
    groupId: row.group_id,
    status: complete
      ? "completed"
      : row.status === "completed"
        ? "review"
        : row.status,
    collection: receipt,
    canCollect: row.actor_id === actor,
    total: row.plan.total,
    rows: row.plan.rows,
    closeIds: row.plan.closeIds,
    paymentBody: row.plan.paymentBody,
    invoices,
  };
}
export async function roomInvoiceBatchProgress(
  groupId: string,
  id: string,
  actor: string,
) {
  const row = await loadBatch(groupId, id);
  if (!row) throw fail("Cierre no encontrado.", 404);
  return progress(row, actor);
}
export async function listRoomInvoiceBatches(groupId: string) {
  return (
    await db.execute(
      sql`SELECT operation_id AS id,status,created_at AS "createdAt",plan->'rows' AS rows FROM group_room_invoice_batches WHERE group_id=${groupId} ORDER BY (status='active') DESC,created_at DESC LIMIT 100`,
    )
  ).rows;
}

/** Called inside the existing receipt transaction, after the group row lock. */
export async function assertRoomBatchPayment(
  executor: any,
  id: unknown,
  groupId: string,
  request?: ReservationPaymentRequest,
) {
  if (id === undefined) return;
  const row =
    typeof id === "string" ? await loadBatch(groupId, id, executor) : null;
  if (
    !row ||
    row.status !== "active" ||
    !request ||
    payloadHash(row.plan.paymentRequest) !== payloadHash(request)
  )
    throw fail(
      "El cobro no coincide con el cierre por habitación vigente. No se registró otro cobro.",
    );
}
/** Validate both before journaling and again under the existing group invoice lock. */
export async function assertRoomBatchInvoice(body: any) {
  if (body.groupRoomInvoiceBatchId === undefined) return;
  const row = (
    await db.execute(
      sql`SELECT * FROM group_room_invoice_batches WHERE operation_id=${String(body.groupRoomInvoiceBatchId)}`,
    )
  ).rows[0] as Row | undefined;
  const child = row?.plan.invoices.find(
    (i: any) =>
      i.reservationId === body.reservaId &&
      i.body.creditOperationId === body.creditOperationId,
  );
  if (
    !row ||
    row.status === "retired" ||
    !child ||
    payloadHash(operationSnapshot(child.body)) !==
      payloadHash(operationSnapshot(body))
  )
    throw fail("La factura no coincide con el cierre original por habitación.");
  const membership = (
    await db.execute(
      sql`SELECT group_id FROM group_reservation_links WHERE reservation_id=${String(body.reservaId)}`,
    )
  ).rows as any[];
  if (membership.length !== 1 || membership[0].group_id !== row.group_id)
    throw fail(
      "La habitación cambió de grupo. Se conserva la operación original.",
    );
  const expected = child.body.expectedFiscalIdentity;
  const config = (
    await db.execute(
      sql`SELECT arca_ambiente AS "arcaAmbiente",arca_cuit AS "arcaCuit",cuit,punto_venta AS "puntoVenta",punto_venta_homolog AS "puntoVentaHomolog" FROM billing_config ORDER BY id LIMIT 1`,
    )
  ).rows[0] as any;
  if (
    !config ||
    config.arcaAmbiente !== expected.environment ||
    String(config.arcaCuit || config.cuit).replace(/\D/g, "") !==
      expected.issuer
  )
    throw fail(
      "La configuración fiscal cambió desde este cierre. Se conservan sus comprobantes originales.",
    );
  await assertBillingPoint(config, expected.pointOfSale, db);
  const receipt = await collection(row);
  if (!receipt.done || receipt.review)
    throw fail(
      "Verificá el cobro grupal original antes de emitir sus facturas individuales.",
    );
}
export async function finishZeroBatchCollection(
  groupId: string,
  id: string,
  actor: string,
) {
  return withFinancialScopeLock(`group-invoice:${groupId}`, () =>
    withDatabaseTransaction(async () => {
      await db.execute(
        sql`SELECT id FROM groups WHERE id=${groupId} FOR UPDATE`,
      );
      const row = await loadBatch(groupId, id);
      if (!row || row.status === "retired" || row.plan.paymentBody)
        throw fail("Este cierre debe verificar su cobro original.");
      if (row.collection_finished) return progress(row, actor);
      // Existing atomic close guard rechecks every selected room's exact balance.
      if (row.plan.closeIds.length)
        await storage.closeGroupReservations(groupId, row.plan.closeIds, actor);
      await db.execute(
        sql`UPDATE group_room_invoice_batches SET collection_finished=true WHERE operation_id=${id}`,
      );
      return progress({ ...row, collection_finished: true }, actor);
    }),
  );
}
export async function retireUnstartedRoomInvoiceBatch(
  groupId: string,
  id: string,
  actor: string,
) {
  return withFinancialScopeLock(`group-invoice:${groupId}`, () =>
    withDatabaseTransaction(async () => {
      await db.execute(
        sql`SELECT id FROM groups WHERE id=${groupId} FOR UPDATE`,
      );
      const row = await loadBatch(groupId, id);
      if (!row || row.actor_id !== actor)
        throw fail(
          "Solo el operador original puede corregir este cierre sin iniciar.",
        );
      if (row.status === "retired") return { retired: true };
      if (
        row.status !== "active" ||
        row.collection_finished ||
        (await collection(row)).done
      )
        throw fail(
          "El cierre ya registró actividad. Se conserva para continuar y conciliar.",
        );
      const ids = row.plan.invoices.map((i: any) => i.body.creditOperationId);
      if (
        ids.length &&
        (
          await db.execute(
            sql`SELECT operation_id FROM billing_operations WHERE operation_id=ANY(${sql.param(ids)}::text[]) UNION ALL SELECT credit_reapplication_intent->>'operationId' FROM sales_invoices WHERE credit_reapplication_intent->>'operationId'=ANY(${sql.param(ids)}::text[])`,
          )
        ).rows.length
      )
        throw fail(
          "Existe una emisión de este cierre. No se reemplazará la operación.",
        );
      await db.execute(
        sql`UPDATE group_room_invoice_batches SET status='retired' WHERE operation_id=${id}`,
      );
      return { retired: true };
    }),
  );
}
