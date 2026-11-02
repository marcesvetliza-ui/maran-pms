import { sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import { enrichCashDocumentEvidence } from "./cash-document-evidence";
export async function getCashDayReport(fecha: string, executor: {execute:(query:any)=>Promise<{rows:any[]}>}=db, visibility: SQL=sql`true`) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw Object.assign(new Error("Fecha inválida"), {statusCode:400});
  // Same source as cash shifts: allocations and document issuance are not new money.
  const rows = await executor.execute(sql`
    SELECT cm.id, cm.source_type AS "sourceType", cm.source_id AS "sourceId",
           cm.payment_id AS "paymentId", cm.receipt_type AS "receiptType", cm.receipt_number AS "receiptNumber",
           cm.payment_method AS "paymentMethod", cm.amount, cm.movement_type AS "movementType",
           cm.area, cm.source_label AS descripcion, cm.source_label AS referencia
    FROM cash_movements cm
    WHERE (cm.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = ${fecha}::date
      AND cm.movement_type='income' AND NOT cm.anulado
      AND COALESCE(cm.receipt_type,'') <> 'inicio_caja'
      AND ${visibility}
    ORDER BY cm.created_at, cm.id
  `);
  const enriched = await enrichCashDocumentEvidence(rows.rows as any[], executor);
  const todos = enriched.map(row => ({...row, modulo: ({recepcion:"reserva",reception:"reserva",restaurant:"restaurant",restaurante:"restaurant",spa:"spa",eventos:"eventos",administracion:"administracion"} as Record<string,string>)[row.area] || row.area,
    metodo: row.paymentMethod === "efectivo" ? "cash" : row.paymentMethod, monto: Number(row.amount), referencia: row.documentReference || row.referencia}));

  const porMetodo: Record<string, number> = {};
  const porModulo: Record<string, number> = {};
  for (const p of todos) {
    const m = (p as any).metodo || "otros";
    porMetodo[m] = Math.round(((porMetodo[m] || 0) + Number(p.monto)) * 100) / 100;
    const mod = (p as any).modulo || "otros";
    porModulo[mod] = Math.round(((porModulo[mod] || 0) + Number(p.monto)) * 100) / 100;
  }

  return {
    fecha,
    movimientos: todos,
    totalPorMetodo: porMetodo,
    porModulo,
    totalGeneral: todos.reduce((s, p) => s + Math.round(Number(p.monto) * 100), 0) / 100,
  };
}
