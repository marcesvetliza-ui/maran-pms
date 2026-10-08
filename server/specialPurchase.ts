import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, withDatabaseTransaction } from "./db";
import {
  specialPurchaseTotals,
  specialPurchaseAccountCode,
} from "@shared/specialPurchase";
const invalid = (message: string) =>
  Object.assign(new Error(message), { statusCode: 400 });
const amount = z
  .number()
  .finite()
  .min(0)
  .max(999999999)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Máximo dos decimales",
  );
export const specialPurchaseInput = z.object({
  tipoComprobante: z.enum(["RETENCION", "RESUMEN-BANCO", "LIQ-TARJETA"]),
  numeroComprobante: z.string().trim().min(1).max(100),
  fechaEmision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  specialDetails: z.object({
    version: z.literal(1),
    issuerType: z.enum(["supplier", "company", "agency"]),
    issuerId: z.string().min(1).max(100),
    subtipo: z
      .enum(["iva", "ganancias", "iibb", "municipal", "suss"])
      .optional(),
    jurisdiction: z.string().trim().max(100).default(""),
    period: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    paymentMovementId: z.string().uuid().nullable().optional(),
    importe: amount.default(0),
    neto21: amount.default(0),
    neto105: amount.default(0),
    exento: amount.default(0),
    percepcionIva: amount.default(0),
    ley25413: amount.default(0),
    retencionIibb: amount.default(0),
    iva21Override: amount.nullable().optional(),
    iva105Override: amount.nullable().optional(),
    roundingReason: z.string().trim().max(500).default(""),
  }),
  observaciones: z.string().max(5000).optional(),
});
export async function createSpecialPurchase(
  input: unknown,
  actor: string | null,
) {
  const parsed = specialPurchaseInput.safeParse(input);
  if (!parsed.success)
    throw invalid(parsed.error.issues.map((i) => i.message).join("; "));
  const p = parsed.data,
    d = p.specialDetails;
  const date = new Date(p.fechaEmision + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== p.fechaEmision
  )
    throw invalid("Fecha inválida");
  const retention = p.tipoComprobante === "RETENCION";
  if (retention) {
    if (
      d.issuerType === "supplier" ||
      !d.subtipo ||
      d.neto21 ||
      d.neto105 ||
      d.exento ||
      d.percepcionIva ||
      d.ley25413 ||
      d.retencionIibb ||
      d.iva21Override != null ||
      d.iva105Override != null
    )
      throw invalid(
        "La retención requiere empresa/agencia, impuesto e importe final, sin IVA adicional",
      );
  } else if (
    d.issuerType !== "supplier" ||
    d.importe ||
    d.subtipo ||
    d.paymentMovementId
  )
    throw invalid("Elegí un banco o procesador del padrón de emisores");
  if (
    p.tipoComprobante === "RESUMEN-BANCO" &&
    (d.neto105 || d.retencionIibb || d.iva105Override != null)
  )
    throw invalid(
      "El resumen bancario utiliza IVA 21%, percepción IVA y Ley 25.413",
    );
  if (p.tipoComprobante === "LIQ-TARJETA" && d.ley25413)
    throw invalid("Ley 25.413 corresponde al resumen bancario");
  if (
    (d.iva21Override != null || d.iva105Override != null) &&
    !d.roundingReason
  )
    throw invalid("Indicá el motivo de la corrección del IVA");
  const totals = specialPurchaseTotals({ ...d, tipo: p.tipoComprobante });
  if (totals.total <= 0) throw invalid("El total debe ser positivo");
  return withDatabaseTransaction(async () => {
    const issuer =
      d.issuerType === "supplier"
        ? (
            await db.execute(
              sql`SELECT razon_social name,cuit FROM accounting_suppliers WHERE id::text=${d.issuerId} AND activo=true FOR SHARE`,
            )
          ).rows[0]
        : d.issuerType === "company"
          ? (
              await db.execute(
                sql`SELECT razon_social name,cuil_cuit cuit FROM companies WHERE id=${d.issuerId} FOR SHARE`,
              )
            ).rows[0]
          : (
              await db.execute(
                sql`SELECT razon_social name,cuil_cuit cuit FROM agencies WHERE id=${d.issuerId} FOR SHARE`,
              )
            ).rows[0];
    if (!issuer) throw invalid("Emisor inexistente o inactivo");
    const code = specialPurchaseAccountCode(p.tipoComprobante, d.subtipo);
    const account = (
      await db.execute(
        sql`SELECT id FROM accounting_accounts WHERE codigo=${code} AND activo=true`,
      )
    ).rows[0];
    if (!account)
      throw invalid(`Activá la cuenta ${code} en el plan de cuentas`);
    if (d.paymentMovementId) {
      const payment = (
        await db.execute(
          sql`SELECT id FROM account_movements WHERE id=${d.paymentMovementId} AND entity_type=${d.issuerType} AND entity_id=${d.issuerId} AND type='pago' AND voided=false FOR SHARE`,
        )
      ).rows[0];
      if (!payment)
        throw invalid(
          "El cobro no corresponde al agente seleccionado o está anulado",
        );
    }
    const identity = [
      p.tipoComprobante,
      d.issuerType,
      d.issuerId,
      d.subtipo ?? "",
      p.numeroComprobante,
      d.jurisdiction.toLowerCase(),
    ].join("|");
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity},0))`,
    );
    const duplicate = (
      await db.execute(
        sql`SELECT id FROM purchase_invoices WHERE tipo_comprobante=${p.tipoComprobante} AND numero_comprobante=${p.numeroComprobante} AND estado<>'anulado' AND (special_details->>'issuerType'=${d.issuerType} AND special_details->>'issuerId'=${d.issuerId} AND coalesce(special_details->>'subtipo','')=${d.subtipo ?? ""} AND lower(coalesce(special_details->>'jurisdiction',''))=${d.jurisdiction.toLowerCase()} OR (special_details IS NULL AND proveedor_cuit=${issuer.cuit})) LIMIT 1`,
      )
    ).rows[0];
    if (duplicate)
      throw Object.assign(
        new Error(
          "Ya existe ese comprobante para el emisor, impuesto y jurisdicción",
        ),
        { statusCode: 409 },
      );
    const result = (
      await db.execute(sql`INSERT INTO purchase_invoices(tipo_comprobante,supplier_id,proveedor_nombre,proveedor_cuit,numero_comprobante,fecha_emision,periodo,condicion_pago,monto_neto,monto_total,monto_iva21,monto_iva105,monto_exento,percepcion_iva,ley_25413,retencion_iibb,subtipo_retencion,cuenta_contable_id,estado,observaciones,special_details)
   VALUES(${p.tipoComprobante},${d.issuerType === "supplier" ? Number(d.issuerId) : null},${issuer.name},${issuer.cuit},${p.numeroComprobante},${p.fechaEmision},${p.fechaEmision.slice(5, 7) + "/" + p.fechaEmision.slice(0, 4)},'registro',${totals.neto},${totals.total},${totals.iva21},${totals.iva105},${d.exento},${d.percepcionIva},${d.ley25413},${d.retencionIibb},${d.subtipo ?? null},${account.id},'registrado',${p.observaciones ?? null},${JSON.stringify(d)}::jsonb) RETURNING *`)
    ).rows[0];
    await db.execute(
      sql`INSERT INTO audit_logs(action,module,entity_type,entity_id,user_name,description,details,timestamp) VALUES('create','admin','special_purchase',${String(result.id)},${actor},'Registro informativo con desglose impositivo',${JSON.stringify({ identity, totals })}::jsonb,now())`,
    );
    return result;
  });
}
