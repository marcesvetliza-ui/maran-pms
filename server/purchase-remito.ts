import { sql } from "drizzle-orm";
import { db } from "./db";
import { generarAsiento } from "./accounting";
import { assertPurchaseInvoiceNotDuplicate } from "./purchase-invoice-duplicates";
import { calculatePurchaseInvoiceTotal, normalizeNonFiscalPurchase, nonFiscalPurchaseStockTotal } from "@shared/purchaseInvoiceTotals";
import { isPurchaseRemito, remitoBalance } from "@shared/purchase-remito";

type Executor = Pick<typeof db, "execute">;
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const amountFields = ["montoNeto", "montoIva21", "montoIva105", "montoIva27", "montoIva5", "montoIva25", "montoExento", "montoNoGravado", "impuestosInternos", "ley25413", "percepcionIibb", "percepcionIva", "percepcionGanancias", "retencionIibb", "retencionGanancias", "retencionIva", "retencionSuss", "retencionMunicipal"] as const;
const snake = (key: string) => key === "ley25413" ? "ley_25413" : key.replace(/[A-Z]/g, c => "_" + c.toLowerCase());

/** Append a reversal instead of deleting the original accounting evidence. */
async function reverseEntry(tx: Executor, original: any) {
  if (!original.asiento_id) return;
  const result = await tx.execute(sql`
    INSERT INTO accounting_entries(numero_minuta,fecha,periodo,concepto,tipo_origen,origen_id,origen_tipo)
    SELECT (SELECT COALESCE(MAX(numero_minuta),0)+1 FROM accounting_entries WHERE periodo=e.periodo),
      e.fecha,e.periodo,${"Reversión por actualización de remito #" + original.id},'factura',${original.id},'purchase_remito_reversal'
    FROM accounting_entries e WHERE e.id=${original.asiento_id} RETURNING id
  `);
  if (!result.rows.length) throw fail("No se encontró el asiento original del remito.");
  await tx.execute(sql`
    INSERT INTO accounting_entry_lines(entry_id,account_id,debe,haber,comprobante_tipo,comprobante_numero,proveedor_nombre)
    SELECT ${result.rows[0].id},account_id,haber,debe,comprobante_tipo,comprobante_numero,proveedor_nombre
    FROM accounting_entry_lines WHERE entry_id=${original.asiento_id}
  `);
}

/** Caller supplies a transaction. Same ID, stock source and payment items survive. */
export async function updatePurchaseRemito(tx: Executor, id: number, input: any, actor?: string, invoiceMode = false) {
  const existing = (await tx.execute(sql`SELECT * FROM purchase_invoices WHERE id=${id} FOR UPDATE`)).rows[0] as any;
  if (!existing) throw fail("Remito no encontrado.", 404);
  if (!isPurchaseRemito(existing.tipo_comprobante) || !["pendiente", "parcial", "pagado", "registrado"].includes(existing.estado)) throw fail("El remito cambió de estado. Actualizá la pantalla.");
  if (input.supplierId != null && Number(input.supplierId) !== Number(existing.supplier_id)) throw fail("La factura debe pertenecer al mismo proveedor del remito.", 400);
  const nextType = input.tipoComprobante ?? existing.tipo_comprobante;
  if (invoiceMode ? !/^FACT-[ABCM]$/.test(nextType) : !isPurchaseRemito(nextType)) throw fail("Tipo de comprobante inválido para esta operación.", 400);
  if (input.stockItems?.length || input.formasPago?.length) throw fail("El remito conserva su stock y sus pagos. Registrá cualquier nuevo pago desde una orden de pago.", 400);
  if ((await tx.execute(sql`SELECT id FROM inventory_source_reversals WHERE source_type='purchase_invoice' AND source_id=${String(id)} AND completed_at IS NOT NULL`)).rows.length) throw fail("El stock del remito fue revertido. No se puede cambiar su uso ni asociar una factura.");
  const payments = (await tx.execute(sql`SELECT COALESCE(sum(importe_cancelado),0) AS paid, count(*) AS count FROM payment_order_items WHERE invoice_id=${id}`)).rows[0] as any;
  const paidByOrders = Number(payments?.paid ?? 0);
  const lines = (await tx.execute(sql`SELECT quantity,unit_price,line_total FROM purchase_invoice_lines WHERE invoice_id=${id} ORDER BY line_number`)).rows as any[];
  let body: any = { ...input, tipoComprobante: nextType };
  if (!invoiceMode) {
    body = normalizeNonFiscalPurchase({ ...body, tipoComprobante: "REMITO-NF" });
    body.tipoComprobante = nextType;
    body.montoNeto = nextType === "REMITO-NF" ? nonFiscalPurchaseStockTotal(lines.map(row => ({ quantity: 1, unitCost: Number(row.line_total) }))).toFixed(2) : "0";
  }
  if (nextType === "REMITO" && Number(payments?.count ?? 0) > 0) throw fail("El remito ya tiene pagos aplicados. No puede pasar a entrega pendiente de factura.");
  const total = nextType === "REMITO" ? 0 : calculatePurchaseInvoiceTotal(body);
  const balance = nextType === "REMITO" ? { saldo: 0, estado: "registrado" } : remitoBalance(total, existing, paidByOrders);
  for (const field of amountFields) if (!Number.isFinite(Number(body[field] ?? 0)) || Number(body[field] ?? 0) < 0) throw fail("Los importes deben ser números válidos y no negativos.", 400);
  const supplier = (await tx.execute(sql`SELECT condicion_iva FROM accounting_suppliers WHERE id=${existing.supplier_id}`)).rows[0];
  if (!supplier) throw fail("Proveedor no encontrado.", 400);
  if (invoiceMode) {
    const { condicionIvaPermiteComprobante } = await import("@shared/purchaseInvoiceTotals");
    if (!condicionIvaPermiteComprobante(supplier.condicion_iva as string, nextType)) throw fail("El tipo de factura no corresponde a la condición IVA del proveedor.", 400);
    if (!String(body.numeroComprobante ?? "").trim() || !/^\d{4}-\d{2}-\d{2}$/.test(body.fechaEmision ?? "")) throw fail("Completá el número y la fecha de la factura.", 400);
    if (amountFields.filter(field => field.startsWith("retencion")).some(field => Number(body[field] ?? 0) !== 0)) throw fail("Las retenciones se registran al pagar, desde la orden de pago.", 400);
    await assertPurchaseInvoiceNotDuplicate(tx as any, { ...body, excludeInvoiceId: id, supplierId: existing.supplier_id, proveedorCuit: existing.proveedor_cuit });
  }
  const history = [...(Array.isArray(existing.special_details?.remitoHistory) ? existing.special_details.remitoHistory : []), {
    action: invoiceMode ? "factura_recibida" : "uso_remito", at: new Date().toISOString(), actor: actor ?? null,
    previous: { ...existing, special_details: undefined }, nextType,
  }];
  if (!invoiceMode && nextType !== existing.tipo_comprobante) {
    await assertPurchaseInvoiceNotDuplicate(tx as any, { ...body, excludeInvoiceId: id, supplierId: existing.supplier_id, proveedorCuit: existing.proveedor_cuit, numeroComprobante: existing.numero_comprobante, puntoVenta: existing.punto_venta });
  }
  await reverseEntry(tx, existing);
  const number = invoiceMode ? String(body.numeroComprobante).trim() : existing.numero_comprobante;
  const pv = invoiceMode ? body.puntoVenta || null : existing.punto_venta;
  const external = invoiceMode ? (pv ? `${String(pv).padStart(5, "0")}-${number.padStart(8, "0")}` : number) : existing.numero_comprobante_ext;
  const assignments = amountFields.map(field => sql`${sql.identifier(snake(field))}=${Number(body[field] ?? 0)}`);
  const raw = (await tx.execute(sql`
    UPDATE purchase_invoices SET ${sql.join(assignments, sql`, `)}, tipo_comprobante=${nextType},
      numero_comprobante=${number},punto_venta=${pv},numero_comprobante_ext=${external},
      fecha_emision=${invoiceMode ? body.fechaEmision : existing.fecha_emision},periodo=${invoiceMode ? body.periodo || null : existing.periodo},
      monto_total=${total},saldo_pendiente=${balance.saldo},estado=${balance.estado},condicion_pago='cuenta_corriente',
      cuenta_contable_id=${body.cuentaContableId || existing.cuenta_contable_id || null},
      centro_costo=${body.centroCosto ?? existing.centro_costo},observaciones=${body.observaciones ?? existing.observaciones},
      envio=${invoiceMode && body.envio ? JSON.stringify(body.envio) : null}::jsonb,
      descuento=${invoiceMode && body.descuento ? JSON.stringify(body.descuento) : null}::jsonb,asiento_id=NULL,
      special_details=${JSON.stringify({ ...existing.special_details, remitoHistory: history })}::jsonb,updated_at=now()
    WHERE id=${id} RETURNING *
  `)).rows[0] as any;
  if (nextType !== "REMITO") {
    const invoice: any = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.replace(/_([a-z])/g, (_match, c) => c.toUpperCase()), value]));
    invoice.ley25413 = raw.ley_25413;
    const entry = await generarAsiento(invoice, tx);
    await tx.execute(sql`UPDATE purchase_invoices SET asiento_id=${entry} WHERE id=${id}`);
    raw.asiento_id = entry;
  }
  return raw;
}
