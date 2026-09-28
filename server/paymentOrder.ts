import { sql } from "drizzle-orm";
import { db } from "./db";
import { generarAsientoOP } from "./accounting";

type Executor = Pick<typeof db, "execute">;

export type CreatePaymentOrderInput = {
  supplierId: number;
  fecha?: string | null;
  facturaIds: number[];
  // Solo válido cuando facturaIds tiene una sola factura (no NC): paga esa
  // parte ahora y deja el resto con saldo pendiente en cuenta corriente
  // (estado "parcial") en vez de cancelar el saldo completo.
  montoParcial?: number | null;
  retencionIibb?: string | number | null;
  retencionGanancias?: string | number | null;
  retencionIva?: string | number | null;
  retencionProfLibs?: string | number | null;
  compensacion?: string | number | null;
  formaPago?: string | null;
  depBancario?: string | number | null;
  efectivo?: string | number | null;
  cheques?: string | number | null;
  observaciones?: string | null;
  alicuotaIibb?: string | number | null;
};

/**
 * Núcleo compartido por la Orden de Pago manual (POST /api/payment-orders,
 * puede cancelar varias facturas juntas y aplicar retenciones) y por el pago
 * automático al cargar un comprobante con una forma de pago real (ver
 * POST /api/purchase-invoices) — ese segundo caso es siempre una sola
 * factura, sin retenciones ni compensación, pero la lógica de fondo
 * (numeración, marcar pagado, asiento contable) tiene que ser la misma.
 * Recibe el mismo executor que ya está usando el llamador, para que quede
 * todo dentro de una única transacción.
 */
export async function createPaymentOrder(tx: Executor, input: CreatePaymentOrderInput, getArgentinaToday: () => string) {
  const { supplierId, fecha, facturaIds, formaPago, observaciones } = input;
  if (!supplierId || !facturaIds?.length) {
    throw Object.assign(new Error("Proveedor y facturas son requeridos"), { statusCode: 400 });
  }

  const idsInt = facturaIds.map((id) => Number(id)).filter((id) => Number.isInteger(id));
  if (idsInt.length === 0) {
    throw Object.assign(new Error("IDs de facturas inválidos"), { statusCode: 400 });
  }
  const idsSQL = sql.raw(idsInt.join(","));
  const facturasRes = await tx.execute(sql`
    SELECT id, monto_total, monto_neto, saldo_pendiente, tipo_comprobante, estado, supplier_id FROM purchase_invoices
    WHERE id IN (${idsSQL}) AND supplier_id = ${supplierId} AND estado IN ('pendiente', 'parcial')
  `);
  if (facturasRes.rows.length !== idsInt.length) {
    const idsEncontrados = facturasRes.rows.map((r: any) => Number(r.id));
    const todosRes = await tx.execute(sql`SELECT id, estado FROM purchase_invoices WHERE id IN (${idsSQL})`);
    const noEncontradas = idsInt.filter((id) => !todosRes.rows.find((r: any) => Number(r.id) === id));
    const noPendientes = todosRes.rows
      .filter((r: any) => !["pendiente", "parcial"].includes(r.estado) && !idsEncontrados.includes(Number(r.id)))
      .map((r: any) => `#${r.id} (${r.estado})`);
    let errorMsg = "No se pudo generar la OP: ";
    if (noEncontradas.length > 0) errorMsg += `Facturas no encontradas: ${noEncontradas.join(", ")}. `;
    if (noPendientes.length > 0) errorMsg += `Facturas no pendientes: ${noPendientes.join(", ")}. `;
    if (noEncontradas.length === 0 && noPendientes.length === 0) errorMsg += `Proveedor no coincide con las facturas seleccionadas (supplierId: ${supplierId}).`;
    throw Object.assign(new Error(errorMsg), { statusCode: 400 });
  }

  const isNC = (r: any) => (r.tipo_comprobante || "").startsWith("NC");
  const montoParcial = input.montoParcial != null ? Number(input.montoParcial) : null;
  if (montoParcial != null) {
    if (idsInt.length !== 1 || isNC(facturasRes.rows[0])) {
      throw Object.assign(new Error("El pago parcial solo se puede aplicar a una sola factura (no Nota de Crédito)."), { statusCode: 400 });
    }
    const saldo = parseFloat((facturasRes.rows[0] as any).saldo_pendiente);
    if (!Number.isFinite(montoParcial) || montoParcial <= 0 || montoParcial > saldo + 0.005) {
      throw Object.assign(new Error("El monto parcial debe ser mayor a $0,00 y no puede superar el saldo pendiente de la factura."), { statusCode: 400 });
    }
  }
  // Cuánto se cancela de cada factura en esta OP: el saldo pendiente
  // completo, salvo que se pidió un pago parcial de la única factura elegida.
  const amountFor = (r: any) => montoParcial != null && Number(r.id) === idsInt[0]
    ? montoParcial
    : parseFloat(r.saldo_pendiente);

  // Calcular totales — las NC (Notas de Crédito) restan del total a abonar
  const totalFacturas = facturasRes.rows.reduce((s: number, r: any) =>
    isNC(r) ? s - amountFor(r) : s + amountFor(r), 0);
  const baseNetosIibb = facturasRes.rows.reduce((s: number, r: any) =>
    isNC(r) ? s : s + parseFloat(r.monto_neto || "0"), 0);
  const retIibb = parseFloat(String(input.retencionIibb ?? "0")) || 0;
  const retGan = parseFloat(String(input.retencionGanancias ?? "0")) || 0;
  const retIva = parseFloat(String(input.retencionIva ?? "0")) || 0;
  const retProf = parseFloat(String(input.retencionProfLibs ?? "0")) || 0;
  const comp = parseFloat(String(input.compensacion ?? "0")) || 0;
  const totalAbonado = totalFacturas - retIibb - retGan - retIva - retProf - comp;

  // Número de OP autoincremental
  const numRes = await tx.execute(sql`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 2) AS INTEGER)), 0) + 1 AS next FROM payment_orders
  `);
  const nextNum = (numRes.rows[0] as any).next as number;
  const numero = `000-${String(nextNum).padStart(8, "0")}`;

  // Insertar OP
  const dep = parseFloat(String(input.depBancario ?? "0")) || 0;
  const ef = parseFloat(String(input.efectivo ?? "0")) || 0;
  const ch = parseFloat(String(input.cheques ?? "0")) || 0;
  const alicuotaIibb = parseFloat(String(input.alicuotaIibb ?? "0")) || 0;
  const opFecha = fecha || getArgentinaToday();
  const opRes = await tx.execute(sql`
    INSERT INTO payment_orders (numero, supplier_id, fecha, forma_pago, dep_bancario, efectivo, cheques, total_facturas, retencion_iibb, retencion_ganancias, retencion_iva, retencion_prof_libs, compensacion, total_abonado, observaciones, alicuota_iibb_op)
    VALUES (${numero}, ${supplierId}, ${opFecha}, ${formaPago || "transferencia"}, ${dep}, ${ef}, ${ch}, ${totalFacturas}, ${retIibb}, ${retGan}, ${retIva}, ${retProf}, ${comp}, ${totalAbonado}, ${observaciones || null}, ${alicuotaIibb || null})
    RETURNING *
  `);
  const op = opRes.rows[0] as any;

  // Marcar facturas como pagadas (o parciales, si queda saldo) e insertar
  // ítems. Las NC se insertan con importe_cancelado negativo y siempre se
  // consumen enteras (no admiten pago parcial, validado más arriba).
  for (const fid of idsInt) {
    const factura = facturasRes.rows.find((r: any) => Number(r.id) === fid) as any;
    const cancelado = amountFor(factura);
    const importeCancelado = isNC(factura) ? -Math.abs(cancelado) : cancelado;
    const nuevoSaldo = isNC(factura) ? 0 : Math.max(Math.round((parseFloat(factura.saldo_pendiente) - cancelado) * 100) / 100, 0);
    const nuevoEstado = nuevoSaldo > 0.005 ? "parcial" : "pagado";
    await tx.execute(sql`UPDATE purchase_invoices SET estado = ${nuevoEstado}, saldo_pendiente = ${nuevoSaldo} WHERE id = ${fid}`);
    await tx.execute(sql`
      INSERT INTO payment_order_items (payment_order_id, invoice_id, importe_cancelado)
      VALUES (${op.id}, ${fid}, ${importeCancelado})
    `);
  }

  // Generar asiento contable. generarAsientoOP espera el PaymentOrder tipado
  // (camelCase) — op acá es la fila cruda que devolvió el INSERT (snake_case),
  // así que se mapea explícitamente en vez de spread directo: de lo
  // contrario op.totalFacturas/depBancario/etc. leen undefined y el asiento
  // queda desbalanceado (sin la línea de Proveedores a Pagar).
  const supplier = await tx.execute(sql`SELECT razon_social FROM accounting_suppliers WHERE id = ${supplierId}`);
  const entryId = await generarAsientoOP({
    id: op.id,
    fecha: op.fecha,
    totalFacturas: op.total_facturas,
    retencionIibb: op.retencion_iibb,
    retencionGanancias: op.retencion_ganancias,
    retencionIva: op.retencion_iva,
    depBancario: op.dep_bancario,
    efectivo: op.efectivo,
    totalAbonado: op.total_abonado,
    supplier: supplier.rows[0] as any,
  } as any, tx as any);
  await tx.execute(sql`UPDATE payment_orders SET asiento_id = ${entryId} WHERE id = ${op.id}`);
  op.asiento_id = entryId;

  // Insertar retención IIBB si corresponde
  if (retIibb > 0) {
    const nroRes = await tx.execute(sql`SELECT COALESCE(MAX(nro_constancia), 0) + 1 AS next FROM iibb_retentions`);
    const nroConstancia = (nroRes.rows[0] as any).next;
    const sup = await tx.execute(sql`SELECT cuit FROM accounting_suppliers WHERE id = ${supplierId}`);
    const cuit = (sup.rows[0] as any)?.cuit || "";
    await tx.execute(sql`
      INSERT INTO iibb_retentions (nro_constancia, supplier_id, cuit_proveedor, fecha_retencion, fecha_comprobante, nro_comprobante, importe_base, alicuota, importe_retenido)
      VALUES (${nroConstancia}, ${supplierId}, ${cuit}, ${opFecha}, ${opFecha}, ${nextNum}, ${baseNetosIibb > 0 ? baseNetosIibb : totalFacturas}, ${alicuotaIibb}, ${retIibb})
    `);
  }

  return { op, numero, facturas: facturasRes.rows };
}
