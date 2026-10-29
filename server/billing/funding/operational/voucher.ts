import { assertOpenSpaCashShift } from "./spaCashShift";
import { spaPrefacturaInputSchema } from "@shared/spaPrefactura";
import { calcularMontos, type InvoiceItem } from "../../invoiceService";
import {
  fundingRequestSchema,
  FundingError,
  hash,
  identifier,
  requirePermission,
  stableId,
  type Actor,
} from "../contracts";
import { SqlFundingAdapter } from "../adapters";
import type { PaymentFundingService } from "../service";
import { applySpaPreferences } from "./preferences";
import { spaChargeRows } from "./account";
import { spaRecipientProfiles } from "./recipient";

const inputSchema = spaPrefacturaInputSchema.extend({
  newCollections: fundingRequestSchema.shape.newCollections,
});
/** Local receipt, never a CAE or a fiscal claim. Settings, collections, stock,
 * counter, receipt and final close commit together. The voucher completes the
 * operation; consultation and exact retries never create another collection. */
export async function issueSpaVoucher(
  service: PaymentFundingService,
  id: string,
  input: unknown,
  actor: Actor,
  schema = "public",
) {
  requirePermission(actor);
  const request = inputSchema.parse(input),
    s = identifier(schema),
    scope = { kind: "spa" as const, id };
  if (request.settings.receiptType !== "cierre_spa")
    throw new FundingError(
      "INVALID_RECEIPT_TYPE",
      "Seleccioná Voucher SPA.",
      422,
    );
  return service.store.transaction(scope, null, async (c) => {
    const key = `spa-voucher:${id}:${request.requestId}`,
      fingerprint = hash({ request, actor: actor.id });
    const prior = (
      await c.query(
        "SELECT payload FROM payment_funding.events WHERE event_key=$1",
        [key],
      )
    ).rows[0]?.payload;
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new FundingError(
          "IDEMPOTENCY_CONFLICT",
          "Este intento ya se usó con otros datos.",
        );
      return prior.result;
    }
    await service.store.assertAdopted(c, scope);
    const account = (
      await c.query(`SELECT * FROM ${s}.spa_accounts WHERE id=$1 FOR UPDATE`, [
        id,
      ])
    ).rows[0];
    if (!account || account.status !== "open" || account.invoice_id)
      throw new FundingError(
        "ACCOUNT_CLOSED",
        "La cuenta ya tiene un cierre o comprobante. Revisá su historial.",
      );
    if (
      (
        await c.query(
          `SELECT 1 FROM ${s}.sales_invoices WHERE spa_account_id=$1 AND tipo_comprobante='cierre_spa' AND estado<>'descartada'`,
          [id],
        )
      ).rowCount
    )
      throw new FundingError(
        "DOCUMENT_ALREADY_ISSUED",
        "La cuenta ya tiene un voucher SPA.",
      );
    await applySpaPreferences(
      service,
      c,
      id,
      {
        requestId: request.requestId,
        expectedVersion: request.expectedVersion,
        settings: request.settings,
      },
      actor,
      schema,
    );
    const adapter = service.adapter(scope) as SqlFundingAdapter,
      folio = await adapter.folio(c, scope),
      totals = await adapter.totals(c, scope);
    const reserved = await c.query(
      `SELECT 1 FROM payment_funding.applications a JOIN payment_funding.receipts r ON r.id=a.receipt_id WHERE r.scope_kind='spa' AND r.scope_id=$1 AND a.status IN ('held','applied') LIMIT 1`,
      [id],
    );
    if (reserved.rowCount)
      throw new FundingError(
        "FUNDS_UNAVAILABLE",
        "Hay pagos aplicados o reservados. Completá su operación antes de emitir el voucher.",
      );
    if (
      new Set(request.newCollections.map((r) => r.rowId)).size !==
      request.newCollections.length
    )
      throw new FundingError(
        "INVALID_REQUEST",
        "Las formas de cobro están duplicadas.",
        422,
      );
    const extra = request.newCollections.reduce((n, r) => n + r.amountCents, 0);
    if (
      totals.totalCents <= 0 ||
      totals.paidCents + extra !== totals.totalCents
    )
      throw new FundingError(
        "FUNDING_TOTAL_MISMATCH",
        "Los pagos deben cubrir exactamente el importe del voucher.",
      );
    for (const row of request.newCollections) {
      await assertOpenSpaCashShift(c,row.shiftId,schema);
      const collected = await adapter.collect(
        c,
        scope,
        row,
        stableId(`spa-voucher:${id}:${request.requestId}`),
        actor,
      );
      await c.query(
        `INSERT INTO payment_funding.receipts(id,scope_kind,scope_id,source_payment_id,original_cents,effective_cents,method,cash_movement_id,folio_movement_id)
    VALUES($1,'spa',$2,$3,$4,$4,$5,$6,$7)`,
        [
          collected.id,
          id,
          collected.sourcePaymentId,
          row.amountCents,
          row.method,
          collected.cashMovementId,
          collected.folioMovementId,
        ],
      );
    }
    const points = (
      await c.query(
        `SELECT DISTINCT numero FROM ${s}.pos_configs WHERE area='spa' AND activo=true AND tipo='electronico' ORDER BY numero`,
      )
    ).rows;
    if (points.length !== 1)
      throw new FundingError(
        "FISCAL_PREPARATION_REQUIRED",
        "Revisá el punto de venta SPA antes de registrar el voucher.",
      );
    const point = points[0].numero;
    const counter = (
      await c.query(
        `INSERT INTO ${s}.invoice_counters(tipo_comprobante,punto_venta,ultimo_numero)
   VALUES('cierre_spa',$1,COALESCE((SELECT max(numero) FROM ${s}.sales_invoices WHERE tipo_comprobante='cierre_spa' AND punto_venta=$1),0)+1)
   ON CONFLICT(tipo_comprobante,punto_venta) DO UPDATE SET ultimo_numero=GREATEST(${s}.invoice_counters.ultimo_numero+1,
    COALESCE((SELECT max(numero) FROM ${s}.sales_invoices WHERE tipo_comprobante='cierre_spa' AND punto_venta=$1),0)+1) RETURNING ultimo_numero`,
        [point],
      )
    ).rows[0];
    const rows = await spaChargeRows(c, id, s);
    const items: InvoiceItem[] = rows.map((r) => ({
      descripcion: r.description,
      cantidad: r.quantity,
      precioUnitario: Number(r.unitPrice),
      subtotal: Number(r.subtotal),
      subtotalNeto: Math.round((Number(r.subtotal) / 1.21) * 100) / 100,
      alicuotaIva: "21",
    }));
    const amounts = calcularMontos(items, "cierre_spa");
    if (Math.round(amounts.montoTotal * 100) !== totals.totalCents)
      throw new FundingError(
        "SOURCE_CHANGED",
        "El total del voucher no coincide con la cuenta.",
      );
    let name = account.guest_name;
    if (request.settings.recipientKind === "client") {
      const appointment = (
        await c.query(
          `SELECT guest_id FROM ${s}.spa_appointments WHERE id=$1 FOR SHARE`,
          [account.appointment_id],
        )
      ).rows[0];
      if (appointment?.guest_id) {
        const people = await spaRecipientProfiles(
          c,
          id,
          appointment.guest_id,
          schema,
        );
        if (people.length !== 1)
          throw new FundingError(
            "INVALID_RECIPIENT",
            "Revisá la ficha del cliente SPA.",
            422,
          );
        name = [people[0].data.first_name, people[0].data.last_name]
          .filter(Boolean)
          .join(" ");
      }
    }
    if (request.settings.recipientKind === "company")
      name = (
        await c.query(
          `SELECT razon_social FROM ${s}.companies WHERE id=$1 FOR SHARE`,
          [request.settings.recipientId],
        )
      ).rows[0]?.razon_social;
    if (request.settings.recipientKind === "guest") {
      const g = (
        await c.query(
          `SELECT first_name,last_name FROM ${s}.guests WHERE id=$1 FOR SHARE`,
          [request.settings.recipientId],
        )
      ).rows[0];
      name = [g?.first_name, g?.last_name].filter(Boolean).join(" ");
    }
    if (!name?.trim())
      throw new FundingError(
        "INVALID_RECIPIENT",
        "Completá el nombre del destinatario.",
        422,
      );
    const payments = (
      await c.query(
        `SELECT method,amount FROM ${s}.spa_payments WHERE account_id=$1 AND status='active' ORDER BY id`,
        [id],
      )
    ).rows;
    const invoice = (
      await c.query(
        `INSERT INTO ${s}.sales_invoices(tipo_comprobante,punto_venta,numero,fecha_emision,cliente_razon_social,
   monto_neto,monto_iva21,monto_iva105,monto_exento,monto_no_gravado,monto_total,modo_ficticio,estado,spa_account_id,folio_id,items,operador,cash_forma_pago_detalle,observaciones)
   VALUES('cierre_spa',$1,$2,(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,$3,$4,$5,$6,$7,$8,$9,false,'emitida',$10,$11,$12,$13,$14,$15) RETURNING id`,
        [
          point,
          counter.ultimo_numero,
          name,
          amounts.montoNeto,
          amounts.montoIva21,
          amounts.montoIva105,
          amounts.montoExento,
          amounts.montoNoGravado,
          amounts.montoTotal,
          id,
          folio.id,
          JSON.stringify(items),
          actor.id,
          JSON.stringify(payments.map(p=>({method:adapter.normalize(p.method),amount:Number(p.amount)}))),
          request.settings.notes,
        ],
      )
    ).rows[0];
    if (!adapter.onFirstSpaClose)
      throw new FundingError(
        "INVENTORY_ADAPTER_REQUIRED",
        "No está configurado el cierre SPA.",
        503,
      );
    await adapter.onFirstSpaClose(c, id, actor);
    await c.query(
      `UPDATE ${s}.spa_accounts SET status='closed',receipt_type='voucher',total_paid=$2,closed_at=now(),closed_by=$3 WHERE id=$1`,
      [id, totals.totalCents / 100, actor.id],
    );
    await adapter.refreshFolio(c, scope);
    await c.query(
      `UPDATE ${s}.folios SET status='closed',closed_at=now(),closed_by=$2 WHERE id=$1`,
      [folio.id, actor.id],
    );
    const result = {
      invoiceId: String(invoice.id),
      totalCents: totals.totalCents,
    };
    await service.store.event(
      c,
      null,
      key,
      "spa_voucher_issued",
      { scopeKey: `spa:${id}`, fingerprint, result },
      actor.id,
    );
    return result;
  });
}
