import { activeSalesRecord } from "./salesArchive";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
export const manualTrackingInput = z.object({
  requestId: z.string().uuid(),
  accountMovementId: z.string().min(1).max(100).nullable().optional(),
  salesInvoiceId: z.number().int().positive().nullable().optional(),
  entityName: z.string().trim().min(1).max(250),
  reference: z.string().trim().max(150).default(""),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  motivo: z.string().trim().min(1).max(1000),
  monto: z.number().finite().min(0).max(999999999).nullable().default(null),
  estado: z
    .enum(["pendiente", "enviada", "reclamada", "pagada", "cargada_extranet"])
    .default("pendiente"),
  observaciones: z.string().max(5000).nullable().default(null),
});
export async function ensureCcManualTrackingSchema() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS cc_manual_tracking(
 id serial PRIMARY KEY,request_id uuid UNIQUE NOT NULL,sales_invoice_id integer UNIQUE REFERENCES sales_invoices(id),
 entity_name text NOT NULL,reference text NOT NULL DEFAULT '',fecha date NOT NULL,motivo text NOT NULL,
 monto numeric(14,2),estado text NOT NULL DEFAULT 'pendiente',observaciones text,updated_by text,
 updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(
    sql`ALTER TABLE cc_manual_tracking ADD COLUMN IF NOT EXISTS account_movement_id varchar REFERENCES account_movements(id)`,
  );
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS cc_manual_tracking_movement_unique ON cc_manual_tracking(account_movement_id) WHERE account_movement_id IS NOT NULL`,
  );
  await db.execute(sql`CREATE TABLE IF NOT EXISTS cc_movement_tracking (
  account_movement_id varchar PRIMARY KEY REFERENCES account_movements(id),
  estado text NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','enviada','reclamada','pagada','cargada_extranet')),
  observaciones text,updated_by text,updated_at timestamptz NOT NULL DEFAULT now())`);
}
export async function addCcManualTracking(input: unknown, user: string | null) {
  const data = manualTrackingInput.parse(input);
  if (data.accountMovementId && data.salesInvoiceId)
    throw new Error("Elegí un cargo o una factura, no ambos");
  return withDatabaseTransaction(async () => {
    const retry = (
      await db.execute(
        sql`SELECT id FROM cc_manual_tracking WHERE request_id=${data.requestId}`,
      )
    ).rows[0];
    if (retry) return retry;
    let name = data.entityName,
      reference = data.reference,
      fecha = data.fecha,
      monto = data.monto,
      estado = data.estado,
      observaciones = data.observaciones;
    if (data.accountMovementId) {
      const cargo = (
        await db.execute(sql`SELECT m.*,COALESCE(NULLIF(regexp_replace(c.nombre_fantasia,'^[[:space:]]+|[[:space:]]+$','','g'),''),c.razon_social,NULLIF(regexp_replace(a.nombre_fantasia,'^[[:space:]]+|[[:space:]]+$','','g'),''),a.razon_social) titular
     FROM account_movements m LEFT JOIN companies c ON m.entity_type='company' AND c.id=m.entity_id
     LEFT JOIN agencies a ON m.entity_type='agency' AND a.id=m.entity_id
     WHERE m.id=${data.accountMovementId} AND m.type='cargo' AND m.entity_type IN ('company','agency') AND NOT m.voided
       AND ${activeSalesRecord("account_movement", sql`m.id`)} FOR SHARE OF m`)
      ).rows[0] as any;
      if (!cargo)
        throw new Error("Elegí un cargo vigente de empresa o agencia");
      name = cargo.titular || "Titular sin nombre";
      reference = cargo.reference || cargo.id;
      fecha = String(cargo.date);
      monto = Number(cargo.amount);
      const previous = (
        await db.execute(
          sql`SELECT estado,observaciones FROM cc_movement_tracking WHERE account_movement_id=${data.accountMovementId}`,
        )
      ).rows[0] as any;
      if (previous) {
        estado = previous.estado;
        if (!observaciones) observaciones = previous.observaciones;
      }
    }
    if (data.salesInvoiceId) {
      const inv = (
        await db.execute(
          sql`SELECT * FROM sales_invoices WHERE id=${data.salesInvoiceId} AND ${activeSalesRecord("invoice", sql`id`)} AND estado='emitida' AND tipo_comprobante LIKE 'F%' AND cash_forma_pago='cuenta_corriente' FOR SHARE`,
        )
      ).rows[0] as any;
      if (!inv)
        throw new Error("Elegí una factura vigente en cuenta corriente");
      const existing = (
        await db.execute(
          sql`SELECT estado,observaciones FROM cc_invoice_tracking WHERE sales_invoice_id=${data.salesInvoiceId}`,
        )
      ).rows[0] as any;
      if (existing) {
        estado = existing.estado;
        if (!observaciones) observaciones = existing.observaciones;
      }
      name = inv.cliente_razon_social;
      reference = `${inv.tipo_comprobante} ${String(inv.punto_venta).padStart(4, "0")}-${String(inv.numero).padStart(8, "0")}`;
      fecha = String(inv.fecha_emision);
      monto = Number(inv.monto_total);
    }
    const row = (
      await db.execute(sql`INSERT INTO cc_manual_tracking(request_id,sales_invoice_id,account_movement_id,entity_name,reference,fecha,motivo,monto,estado,observaciones,updated_by)
   VALUES(${data.requestId},${data.salesInvoiceId ?? null},${data.accountMovementId ?? null},${name},${reference},${fecha},${data.motivo},${monto},${estado},${observaciones},${user}) RETURNING id`)
    ).rows[0];
    await db.execute(
      sql`INSERT INTO audit_logs(action,module,entity_type,entity_id,description,details,user_name,timestamp) VALUES('create','admin','cc_manual_tracking',${String(row.id)},'Seguimiento manual agregado',${JSON.stringify(data)}::jsonb,${user},now())`,
    );
    return row;
  });
}
export async function getCcManualTrackingRows() {
  const result = await db.execute(
    sql`SELECT m.*,si.estado invoice_estado,COALESCE(am.entity_type,si.recipient_entity_type) recipient_entity_type,
      COALESCE(am.entity_id,si.recipient_entity_id) recipient_entity_id,
      COALESCE(NULLIF(regexp_replace(c.nombre_fantasia,'^[[:space:]]+|[[:space:]]+$','','g'),''),NULLIF(btrim(c.razon_social),''),
        NULLIF(regexp_replace(a.nombre_fantasia,'^[[:space:]]+|[[:space:]]+$','','g'),''),NULLIF(btrim(a.razon_social),'')) owner_name
      FROM cc_manual_tracking m LEFT JOIN sales_invoices si ON si.id=m.sales_invoice_id
      LEFT JOIN account_movements am ON am.id=m.account_movement_id
      LEFT JOIN companies c ON COALESCE(am.entity_type,si.recipient_entity_type)='company' AND c.id=COALESCE(am.entity_id,si.recipient_entity_id)
      LEFT JOIN agencies a ON COALESCE(am.entity_type,si.recipient_entity_type)='agency' AND a.id=COALESCE(am.entity_id,si.recipient_entity_id)
      WHERE ${activeSalesRecord("cc_manual", sql`m.id`)} AND (m.sales_invoice_id IS NULL OR
        (si.estado IN ('emitida','anulada') AND ${activeSalesRecord("invoice", sql`si.id`)})) ORDER BY m.fecha DESC,m.id DESC`,
  );
  return result.rows.map((r: any) => ({
    manualId: r.id,
    accountMovementId: r.account_movement_id,
    salesInvoiceId: r.sales_invoice_id ?? -r.id,
    numeroFactura: r.reference || "Sin referencia",
    tipoComprobante:
      r.invoice_estado === "anulada"
        ? "Gestión de factura anulada"
        : "Seguimiento",
    fecha: String(r.fecha),
    entityType: r.recipient_entity_type ?? "company",
    entityId: r.recipient_entity_id ?? "",
    entityName: r.owner_name || r.entity_name,
    motivo: r.motivo,
    monto: r.monto === null ? 0 : Number(r.monto),
    amountPending:
      r.monto === null ||
      (r.sales_invoice_id !== null && Number(r.monto) === 0),
    estado: r.estado,
    observaciones: r.observaciones,
    updatedAt:
      r.updated_at instanceof Date
        ? r.updated_at.toISOString()
        : String(r.updated_at),
  }));
}
