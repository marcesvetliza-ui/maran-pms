import { db } from "./db";
import { sql } from "drizzle-orm";
import {
  accountingAccounts,
  accountingEntries,
  accountingEntryLines,
  iibbRetentions,
  type PurchaseInvoice,
  type PaymentOrder,
} from "@shared/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAccountId(codigo: string): Promise<number | null> {
  const res = await db.execute(
    sql`SELECT id FROM accounting_accounts WHERE codigo = ${codigo} LIMIT 1`
  );
  return res.rows.length > 0 ? (res.rows[0] as any).id : null;
}

async function nextMinuta(periodo: string): Promise<number> {
  const res = await db.execute(
    sql`SELECT COALESCE(MAX(numero_minuta), 0) + 1 AS next FROM accounting_entries WHERE periodo = ${periodo}`
  );
  return (res.rows[0] as any).next as number;
}

function parseNum(v: string | null | undefined): number {
  return parseFloat(v || "0") || 0;
}

// ─── Concepto ─────────────────────────────────────────────────────────────────

function getConcepto(tipoComprobante: string): string {
  if (tipoComprobante.startsWith("NC")) return "Prov N.Credito A/M";
  if (tipoComprobante === "RESUMEN-BANCO") return "Prov. Resumen Banco";
  if (tipoComprobante === "LIQ-TARJETA") return "Prov.Liq.Tarjeta";
  if (tipoComprobante === "FACT-A") return "Prov Fac/NDebito A/M";
  return "Prov Fac/Deb B/C/Rec";
}

// ─── Asiento de Factura / NC / Resumen / Tarjeta ──────────────────────────────

export async function generarAsiento(
  invoice: PurchaseInvoice & { supplier?: { razonSocial?: string } | null }
): Promise<number> {
  const periodo =
    invoice.periodo ||
    (() => {
      const d = new Date(invoice.fechaEmision);
      return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    })();

  const minuta = await nextMinuta(periodo);
  const concepto = getConcepto(invoice.tipoComprobante);
  const isNC = invoice.tipoComprobante.startsWith("NC");
  const isBanco = invoice.tipoComprobante === "RESUMEN-BANCO";
  const isTarjeta = invoice.tipoComprobante === "LIQ-TARJETA";

  // Montos
  const neto = parseNum(invoice.montoNeto);
  const iva21 = parseNum(invoice.montoIva21);
  const iva105 = parseNum(invoice.montoIva105);
  const iva27 = parseNum(invoice.montoIva27);
  const iva5 = parseNum(invoice.montoIva5);
  const iva25 = parseNum(invoice.montoIva25);
  const percIva = parseNum(invoice.percepcionIva);
  const percIibb = parseNum(invoice.percepcionIibb);
  const percGanancias = parseNum(invoice.percepcionGanancias);
  const impInt = parseNum(invoice.impuestosInternos);
  const ley25 = parseNum(invoice.ley25413);
  const retIva = parseNum(invoice.retencionIva);
  const retIibb = parseNum(invoice.retencionIibb);
  const retGanancias = parseNum(invoice.retencionGanancias);
  const retSuss = parseNum(invoice.retencionSuss);
  const total = parseNum(invoice.montoTotal);

  // Account IDs
  const [
    acIva21, acIva105, acIva27,
    acPercIva, acPercIibb, acPercGanancias,
    acRetIva, acRetIibb, acRetGanancias, acRetSuss,
    acImpInt, acLey25, acProv, acCaja,
    acCuentaContable,
  ] = await Promise.all([
    getAccountId("1.1.4.07.01"),
    getAccountId("1.1.4.07.02"),
    getAccountId("1.1.4.07.03"),
    getAccountId("1.1.4.01.04.02"),
    getAccountId("1.1.4.01.08.02"),
    getAccountId("1.1.4.01.05"),
    getAccountId("1.1.4.01.04.01"),
    getAccountId("1.1.4.01.08.01"),
    getAccountId("1.1.4.01.05"),
    getAccountId("1.1.4.01.10"),
    getAccountId("2.1.3.02.09"),
    getAccountId("1.1.4.01.15"),
    getAccountId("2.1.1.01"),
    getAccountId("1.1.1.01"),
    invoice.cuentaContableId ? invoice.cuentaContableId : null,
  ]);

  // Insert entry
  const entryRes = await db.execute(sql`
    INSERT INTO accounting_entries (numero_minuta, fecha, periodo, concepto, tipo_origen, origen_id, origen_tipo)
    VALUES (${minuta}, ${invoice.fechaEmision}, ${periodo}, ${concepto}, 'factura', ${invoice.id}, 'purchase_invoice')
    RETURNING id
  `);
  const entryId = (entryRes.rows[0] as any).id as number;

  const provNombre = (invoice as any).supplier?.razonSocial || invoice.proveedorNombre || "";
  const compNum = invoice.numeroComprobanteExt || invoice.numeroComprobante;
  const compTipo = `PROV ${invoice.tipoComprobante}`;

  // Build lines
  type Line = { accountId: number | null; debe: number; haber: number };
  const lines: Line[] = [];

  const sign = isNC ? -1 : 1;

  // DEBE: cuenta contable (gasto)
  const cuentaGastoId = acCuentaContable ?? invoice.cuentaContableId ?? null;
  if (cuentaGastoId && neto !== 0) {
    lines.push({ accountId: cuentaGastoId, debe: neto * sign, haber: 0 });
  }

  // DEBE: IVA fields
  if (iva21 > 0 && acIva21) lines.push({ accountId: acIva21, debe: iva21 * sign, haber: 0 });
  if (iva105 > 0 && acIva105) lines.push({ accountId: acIva105, debe: iva105 * sign, haber: 0 });
  if (iva27 > 0 && acIva27) lines.push({ accountId: acIva27, debe: iva27 * sign, haber: 0 });
  if (iva5 > 0 && acIva21) lines.push({ accountId: acIva21, debe: iva5 * sign, haber: 0 });
  if (iva25 > 0 && acIva21) lines.push({ accountId: acIva21, debe: iva25 * sign, haber: 0 });

  // DEBE: percepciones (activos a favor)
  if (percIva > 0 && acPercIva) lines.push({ accountId: acPercIva, debe: percIva * sign, haber: 0 });
  if (percIibb > 0 && acPercIibb) lines.push({ accountId: acPercIibb, debe: percIibb * sign, haber: 0 });
  if (percGanancias > 0 && acPercGanancias) lines.push({ accountId: acPercGanancias, debe: percGanancias * sign, haber: 0 });

  // DEBE: impuestos internos y ley 25413
  if (impInt > 0 && acImpInt) lines.push({ accountId: acImpInt, debe: impInt * sign, haber: 0 });
  if (ley25 > 0 && acLey25) lines.push({ accountId: acLey25, debe: ley25 * sign, haber: 0 });

  // HABER
  if (invoice.condicionPago === "contado" || isBanco || isTarjeta) {
    // Pago inmediato: haber = caja o banco
    if (acCaja) lines.push({ accountId: acCaja, debe: 0, haber: total * sign });
    // Retenciones en haber (reducen el pago)
    if (retIva > 0 && acRetIva) lines.push({ accountId: acRetIva, debe: 0, haber: retIva * sign });
    if (retIibb > 0 && acRetIibb) lines.push({ accountId: acRetIibb, debe: 0, haber: retIibb * sign });
    if (retGanancias > 0 && acRetGanancias) lines.push({ accountId: acRetGanancias, debe: 0, haber: retGanancias * sign });
    if (retSuss > 0 && acRetSuss) lines.push({ accountId: acRetSuss, debe: 0, haber: retSuss * sign });
  } else {
    // Cuenta corriente: haber = proveedores a pagar
    if (acProv) lines.push({ accountId: acProv, debe: 0, haber: total * sign });
  }

  // Insert lines
  for (const line of lines) {
    if (!line.accountId || (line.debe === 0 && line.haber === 0)) continue;
    await db.execute(sql`
      INSERT INTO accounting_entry_lines (entry_id, account_id, comprobante_tipo, comprobante_numero, proveedor_nombre, debe, haber)
      VALUES (${entryId}, ${line.accountId}, ${compTipo}, ${compNum}, ${provNombre}, ${line.debe}, ${line.haber})
    `);
  }

  return entryId;
}

// ─── Asiento de Orden de Pago ─────────────────────────────────────────────────

export async function generarAsientoOP(
  op: PaymentOrder & { supplier?: { razonSocial?: string } | null }
): Promise<number> {
  const d = new Date(op.fecha);
  const periodo = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const minuta = await nextMinuta(periodo);

  const totalFact = parseNum(op.totalFacturas);
  const retIibb = parseNum(op.retencionIibb);
  const retGanancias = parseNum(op.retencionGanancias);
  const retIva = parseNum(op.retencionIva);
  const depBancario = parseNum(op.depBancario);
  const efectivo = parseNum(op.efectivo);

  const [acProv, acCaja, acBanco, acRetIibb, acRetGanancias, acRetIva] = await Promise.all([
    getAccountId("2.1.1.01"),
    getAccountId("1.1.1.01"),
    getAccountId("1.1.1.02"),
    getAccountId("1.1.4.01.08.01"),
    getAccountId("1.1.4.01.05"),
    getAccountId("1.1.4.01.04.01"),
  ]);

  const entryRes = await db.execute(sql`
    INSERT INTO accounting_entries (numero_minuta, fecha, periodo, concepto, tipo_origen, origen_id, origen_tipo)
    VALUES (${minuta}, ${op.fecha}, ${periodo}, 'Prov. Retenciones', 'orden_pago', ${op.id}, 'payment_order')
    RETURNING id
  `);
  const entryId = (entryRes.rows[0] as any).id as number;

  const provNombre = (op as any).supplier?.razonSocial || "";

  // DEBE: Proveedores a Pagar
  if (acProv && totalFact > 0) {
    await db.execute(sql`
      INSERT INTO accounting_entry_lines (entry_id, account_id, proveedor_nombre, debe, haber)
      VALUES (${entryId}, ${acProv}, ${provNombre}, ${totalFact}, 0)
    `);
  }

  // HABER: Banco o Caja
  if (depBancario > 0 && acBanco) {
    await db.execute(sql`
      INSERT INTO accounting_entry_lines (entry_id, account_id, proveedor_nombre, debe, haber)
      VALUES (${entryId}, ${acBanco}, ${provNombre}, 0, ${depBancario})
    `);
  }
  if (efectivo > 0 && acCaja) {
    await db.execute(sql`
      INSERT INTO accounting_entry_lines (entry_id, account_id, proveedor_nombre, debe, haber)
      VALUES (${entryId}, ${acCaja}, ${provNombre}, 0, ${efectivo})
    `);
  }
  // Si es transferencia y no hay depBancario ni efectivo, usar banco
  if (depBancario === 0 && efectivo === 0 && acBanco) {
    const totalAbonado = parseNum(op.totalAbonado);
    await db.execute(sql`
      INSERT INTO accounting_entry_lines (entry_id, account_id, proveedor_nombre, debe, haber)
      VALUES (${entryId}, ${acBanco}, ${provNombre}, 0, ${totalAbonado})
    `);
  }

  // HABER: Retenciones
  if (retIibb > 0 && acRetIibb) {
    await db.execute(sql`
      INSERT INTO accounting_entry_lines (entry_id, account_id, proveedor_nombre, debe, haber)
      VALUES (${entryId}, ${acRetIibb}, ${provNombre}, 0, ${retIibb})
    `);
  }
  if (retGanancias > 0 && acRetGanancias) {
    await db.execute(sql`
      INSERT INTO accounting_entry_lines (entry_id, account_id, proveedor_nombre, debe, haber)
      VALUES (${entryId}, ${acRetGanancias}, ${provNombre}, 0, ${retGanancias})
    `);
  }
  if (retIva > 0 && acRetIva) {
    await db.execute(sql`
      INSERT INTO accounting_entry_lines (entry_id, account_id, proveedor_nombre, debe, haber)
      VALUES (${entryId}, ${acRetIva}, ${provNombre}, 0, ${retIva})
    `);
  }

  return entryId;
}
