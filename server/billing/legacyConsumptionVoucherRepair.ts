import { isDeepStrictEqual } from "node:util";
import type { Pool, PoolClient } from "pg";

// One-time, user-authorized metadata repair. These identities deliberately
// cannot match a different reservation or a newly issued document.
const reservationId = "d8b09f1c-3b0b-4f2e-bbfb-e3b1691fb6ab";
const chargeId = "d44d7e28-13a5-4769-a47c-7868eff04d38";
const invoiceId = 194;
const repairKey = "legacy-consumption-voucher-194-20261114";
const description = "Restaurante - Pedido ORD-20260328-7534";
const expectedItems = [{ cantidad: 1, subtotal: 10000, alicuotaIva: "no_gravado",
  descripcion: description, subtotalNeto: 10000, precioUnitario: 10000 }];
const parseJson = (value: unknown) => {
  try { return typeof value === "string" ? JSON.parse(value) : value; }
  catch { return undefined; }
};

export async function repairLegacyConsumptionVoucher(
  pool: Pick<Pool, "connect">,
): Promise<"applied" | "already_applied" | "not_applicable"> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL statement_timeout='5s'");
    // Same lock as reservation edits and Prefactura, held until commit.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`folio-invoice:${reservationId}`]);
    const reservation = (await client.query("SELECT * FROM reservations WHERE id=$1 FOR UPDATE", [reservationId])).rows[0];
    if (!reservation || reservation.reservation_code !== "RES-1774007027320-402" || reservation.pricing_scheme !== "legacy") {
      await client.query("ROLLBACK");
      return "not_applicable";
    }
    const applied = await client.query("SELECT id FROM audit_logs WHERE entity_type='sales_invoice' AND entity_id=$1 AND details LIKE $2", [String(invoiceId), `%"repairKey":"${repairKey}"%`]);
    if (applied.rows.length) {
      await client.query("ROLLBACK");
      return "already_applied";
    }
    const invoice = (await client.query("SELECT *, fecha_emision::text AS fecha_emision FROM sales_invoices WHERE id=$1 FOR UPDATE", [invoiceId])).rows[0];
    const charge = (await client.query("SELECT * FROM charges WHERE id=$1 FOR UPDATE", [chargeId])).rows[0];
    const sourceIds = parseJson(invoice?.source_charge_ids);
    const linked = await client.query("SELECT id FROM sales_invoices WHERE nota_credito_id=$1 LIMIT 1", [invoiceId]);
    const group = await client.query("SELECT id FROM group_reservation_links WHERE reservation_id=$1 LIMIT 1", [reservationId]);
    if (!invoice || !charge ||
      invoice.reserva_id !== reservationId || invoice.tipo_comprobante !== "cierre_habitacion" ||
      invoice.estado !== "emitida" || invoice.punto_venta !== 1 || invoice.numero !== 19 ||
      String(invoice.fecha_emision).slice(0, 10) !== "2026-08-21" ||
      Number(invoice.monto_total) !== 10000 || Number(invoice.monto_acreditado) !== 0 ||
      invoice.cae !== null || invoice.modo_ficticio !== false || invoice.source_charge_amounts !== null ||
      invoice.group_id !== null || invoice.group_payment_id !== null || invoice.spa_account_id !== null ||
      invoice.nota_credito_id !== null || invoice.credit_reapplication_intent !== null ||
      !isDeepStrictEqual(sourceIds, ["accommodation", chargeId]) ||
      !isDeepStrictEqual(parseJson(invoice.items), expectedItems) ||
      charge.reservation_id !== reservationId || charge.category !== "restaurant" ||
      charge.status !== "active" || charge.description !== description || Number(charge.amount) !== 10000 ||
      linked.rows.length || group.rows.length) {
      await client.query("ROLLBACK");
      return "not_applicable";
    }

    const after = { sourceChargeIds: [chargeId], sourceChargeAmounts: { [chargeId]: 10000 } };
    await client.query("UPDATE sales_invoices SET source_charge_ids=$2::jsonb, source_charge_amounts=$3::jsonb WHERE id=$1",
      [invoiceId, JSON.stringify(after.sourceChargeIds), JSON.stringify(after.sourceChargeAmounts)]);
    const note = "Corrección autorizada de atribución del cierre no fiscal 0001-00000019: sus $10.000 corresponden únicamente al consumo de restaurante ORD-20260328-7534. Se retira la referencia sin importe a alojamiento; se conservan comprobante, importes, fechas, cobros y Caja.";
    await client.query(`INSERT INTO audit_logs(user_name,action,module,entity_type,entity_id,description,details,timestamp)
      VALUES('Mantenimiento autorizado por el usuario','update','billing','sales_invoice',$1,$2,$3,now())`,
      [String(invoiceId), note, JSON.stringify({ repairKey, reservationId,
        before: { sourceChargeIds: invoice.source_charge_ids, sourceChargeAmounts: invoice.source_charge_amounts }, after })]);
    await client.query(`INSERT INTO reservation_changelog(reservation_id,operador,tipo,descripcion)
      VALUES($1,'Mantenimiento autorizado por el usuario','modificacion',$2)`, [reservationId, note]);
    await client.query("COMMIT");
    return "applied";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
