import { sql } from "drizzle-orm";
import { db } from "../db";
import { ensureGroupFiscalCashInformation } from "./groupFiscalCash";
import { withFinancialScopeLock } from "../nightlyPricingGuard";
import {
  emitirFactura,
  buildComprobanteAsociado,
  type NewInvoiceData,
} from "./invoiceService";
const types: Record<string, string> = {
  FA: "NCA",
  FB: "NCB",
  FC: "NCC",
  FT: "NCT",
  FM: "NCM",
  FMB: "NCMB",
};
const parse = (v: any) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
const fail = (s: string): never => {
  throw new Error(s);
};
function cents(v: any): number {
  const n = Number(v);
  if (
    v === null ||
    v === undefined ||
    !Number.isFinite(n) ||
    n < 0 ||
    !Number.isSafeInteger(Math.round(n * 100)) ||
    Math.abs(n * 100 - Math.round(n * 100)) > 0.00001
  )
    fail("Importes de la NC inconsistentes; requiere revisión.");
  return Math.round(n * 100);
}
function amounts(v: any): Record<string, number> {
  const m = parse(v);
  if (!m || typeof m !== "object" || Array.isArray(m) || !Object.keys(m).length)
    fail("La NC o su factura no tiene detalle seguro por cargo.");
  return Object.fromEntries(
    Object.entries(m).map(([k, n]) => {
      const value = cents(n);
      if (!k || value <= 0) fail("Detalle por cargo inválido.");
      return [k, value];
    }),
  );
}
function validate(original: any, nc: any, previous: any[]) {
  if (
    !original ||
    !nc ||
    !original.group_id ||
    nc.group_id !== original.group_id ||
    original.reserva_id ||
    nc.reserva_id ||
    Number(nc.nota_credito_id) !== Number(original.id) ||
    types[original.tipo_comprobante] !== nc.tipo_comprobante
  )
    fail("La NC pendiente no corresponde a esta factura de grupo.");
  if (!["emitida", "parcial"].includes(original.estado))
    fail("La factura original no admite esta conciliación automática.");
  const source = amounts(original.source_charge_amounts),
    selected = amounts(nc.source_charge_amounts);
  const total = cents(original.monto_total),
    credit = cents(nc.monto_total),
    credited = cents(original.monto_acreditado || 0);
  if (
    !credit ||
    Object.values(source).reduce((a, b) => a + b, 0) !== total ||
    Object.values(selected).reduce((a, b) => a + b, 0) !== credit
  )
    fail("Los conceptos no coinciden con el total de la factura o NC.");
  const used: Record<string, number> = {};
  let previousTotal = 0;
  for (const row of previous) {
    const map = amounts(row.source_charge_amounts);
    const value = cents(row.monto_total);
    if (Object.values(map).reduce((a, b) => a + b, 0) !== value)
      fail("El historial de NC requiere revisión por cargo.");
    previousTotal += value;
    for (const [key, amount] of Object.entries(map)) {
      if (!source[key])
        fail("El historial contiene un cargo ajeno a la factura.");
      used[key] = (used[key] || 0) + amount;
    }
  }
  if (previousTotal !== credited || credited + credit > total)
    fail(
      "El historial acreditado requiere revisión antes de conciliar esta NC.",
    );
  for (const [key, value] of Object.entries(selected))
    if (!source[key] || (used[key] || 0) + value > source[key])
      fail("La NC supera el importe disponible del cargo.");
  for (const [key, value] of Object.entries(used))
    if (value > source[key])
      fail("El historial supera el importe original del cargo.");
  return { total, credit, credited, selected };
}
async function prior(database: any, originalId: number, ncId: number) {
  return (
    await database.execute(
      sql`SELECT source_charge_amounts,monto_total FROM sales_invoices WHERE nota_credito_id=${originalId} AND id<>${ncId} AND tipo_comprobante IN ('NCA','NCB','NCC','NCT','NCM','NCMB') AND estado IN ('emitida','parcial','anulada') AND (reconciliation_status IS NULL OR reconciliation_status='conciliada')`,
    )
  ).rows;
}
export async function recoverGroupCreditNote(
  ncId: number,
  user: { id?: string; username?: string; fullName?: string },
  authorize: typeof emitirFactura = emitirFactura,
) {
  const first = (
    await db.execute(sql`SELECT * FROM sales_invoices WHERE id=${ncId}`)
  ).rows[0] as any;
  if (
    !first?.group_id ||
    first.reserva_id ||
    !first.nota_credito_id ||
    !Object.values(types).includes(first.tipo_comprobante)
  )
    fail("No se encontró una NC de grupo recuperable.");
  return withFinancialScopeLock(`group-invoice:${first.group_id}`, async () => {
    let nc = (
      await db.execute(sql`SELECT * FROM sales_invoices WHERE id=${ncId}`)
    ).rows[0] as any;
    const original = (
      await db.execute(
        sql`SELECT * FROM sales_invoices WHERE id=${Number(first.nota_credito_id)}`,
      )
    ).rows[0] as any;
    if (!original || !nc) fail("No se encontró la NC o su factura original.");
    if (nc?.reconciliation_status === "conciliada")
      return {
        ...nc,
        reconciliationStatus: "conciliada",
        alreadyReconciled: true,
      };
    if (nc?.reconciliation_status !== "pendiente")
      fail("La NC no está disponible para recuperación automática.");
    validate(original, nc, await prior(db, original.id, ncId));
    if (nc.estado === "autorizacion_pendiente") {
      const items = parse(nc.items);
      if (!Array.isArray(items) || !items.length)
        fail("El intento guardado no tiene conceptos recuperables.");
      await authorize({
        tipoComprobante: nc.tipo_comprobante,
        cliente: {
          razonSocial: nc.cliente_razon_social,
          cuit: nc.cliente_cuit || undefined,
          dni: nc.cliente_dni || undefined,
          documentType: nc.cliente_document_type || undefined,
          condicionIva: nc.cliente_condicion_iva,
          domicilio: nc.cliente_domicilio || undefined,
        },
        items,
        facturaOriginalId: Number(original.id),
        comprobanteAsociado: buildComprobanteAsociado(original),
        operador: user.fullName || user.username,
        puntoVentaOverride: Number(nc.punto_venta),
        groupId: String(original.group_id),
        folioId: nc.folio_id || undefined,
        cashFormaPago: nc.cash_forma_pago || undefined,
        sourceChargeIds: Object.keys(amounts(nc.source_charge_amounts)),
        sourceChargeAmounts: parse(nc.source_charge_amounts),
        recoverableCreditNote: true,
        recoveryInvoiceId: ncId,
      } as NewInvoiceData);
    }
    return db.transaction(async (tx) => {
      const currentOriginal = (
        await tx.execute(
          sql`SELECT * FROM sales_invoices WHERE id=${Number(original.id)} FOR UPDATE`,
        )
      ).rows[0] as any;
      nc = (
        await tx.execute(
          sql`SELECT * FROM sales_invoices WHERE id=${ncId} FOR UPDATE`,
        )
      ).rows[0] as any;
      if (nc?.reconciliation_status === "conciliada")
        return {
          ...nc,
          reconciliationStatus: "conciliada",
          alreadyReconciled: true,
        };
      if (
        nc?.estado !== "emitida" ||
        !/^\d{14}$/.test(String(nc.cae || "")) ||
        nc.reconciliation_status !== "pendiente"
      )
        fail("La autorización de la NC todavía no está confirmada.");
      const check = validate(
        currentOriginal,
        nc,
        await prior(tx, Number(original.id), ncId),
      );
      const newCredited = check.credited + check.credit;
      await ensureGroupFiscalCashInformation(tx, {
        id: Number(nc.id),
        groupId: String(original.group_id),
        tipoComprobante: nc.tipo_comprobante,
        puntoVenta: Number(nc.punto_venta),
        numero: Number(nc.numero),
        montoTotal: nc.monto_total,
        clienteRazonSocial: nc.cliente_razon_social,
        originalReference: `${original.tipo_comprobante} ${String(original.punto_venta).padStart(4, "0")}-${String(original.numero).padStart(8, "0")}`,
      }, user.fullName || user.username);
      await tx.execute(
        sql`UPDATE sales_invoices SET monto_acreditado=${(newCredited / 100).toFixed(2)},estado=${newCredited === check.total ? "anulada" : "parcial"},nota_credito_id=${ncId} WHERE id=${Number(original.id)}`,
      );
      await tx.execute(
        sql`UPDATE sales_invoices SET reconciliation_status='conciliada',reconciliation_error=NULL,reconciliation_updated_at=NOW() WHERE id=${ncId}`,
      );
      await tx.execute(sql`UPDATE group_payments SET invoice_nc_ref=${JSON.stringify({...nc,reconciliation_status:'conciliada',reconciliationStatus:'conciliada',reconciliation_error:null})}
        WHERE group_id=${String(original.group_id)} AND invoice_ref::jsonb->>'id'=${String(original.id)} AND invoice_nc_ref IS NULL`);
      await tx.execute(
        sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp) VALUES (${user.id || null},${user.username || "Sistema"},'reconcile','billing','sales_invoice',${String(ncId)},'Recuperación de NC de grupo sin modificar cobros',${JSON.stringify({ originalInvoiceId: original.id, groupId: original.group_id, creditNoteId: ncId, amount: check.credit / 100 })},NOW())`,
      );
      return {
        ...nc,
        reconciliation_status: "conciliada",
        reconciliationStatus: "conciliada",
        reconciliation_error: null,
        reconciliationError: null,
        reconciliationRecovered: true,
      };
    });
  });
}
