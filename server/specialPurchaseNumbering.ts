import { z } from "zod";
import { sql, type SQL } from "drizzle-orm";
import { canonicalPurchaseColumn, canonicalPurchaseNumber } from "./purchase-invoice-duplicates";

export const specialPurchasePointInput = z.preprocess(
  value => value == null || (typeof value === "string" && !value.trim())
    ? undefined : typeof value === "number" ? String(value) : value,
  z.string().trim().regex(/^\d{1,5}$/, "El punto de venta debe tener entre 1 y 5 dígitos").optional(),
);

export function specialPurchaseReference(point: string | undefined, number: string) {
  if (point == null) return null;
  return `${point.padStart(5, "0")}-${/^\d+$/.test(number) ? number.padStart(8, "0") : number}`;
}

type Executor = { execute: (query: SQL) => Promise<any> };
type Numbering = {
  tipoComprobante: string;
  puntoVenta?: string;
  numeroComprobante: string;
  issuerType: string;
  issuerId: string;
  subtipo?: string;
  jurisdiction?: string;
  sameIssuer: SQL;
};

/** Shared by the current form and the compatibility entry point. No writes. */
export async function assertSpecialPurchaseNumberAvailable(tx: Executor, input: Numbering) {
  const jurisdiction = (input.jurisdiction || "").toLowerCase();
  const scope = [input.tipoComprobante, input.issuerType, input.issuerId, input.subtipo || "", jurisdiction];
  // Serialize number/series representations, retaining the previous lock for
  // identical requests during rollout. Always call inside the insert transaction.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`special-purchase:${scope.join("|")}`},0))`);
  const legacyIdentity = [...scope.slice(0, 4), input.numeroComprobante, jurisdiction].join("|");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${legacyIdentity},0))`);

  const suppliedNumber = canonicalPurchaseNumber(input.numeroComprobante);
  const combined = input.puntoVenta == null ? /^(\d{1,5})-(\d{1,8})$/.exec(suppliedNumber) : null;
  const point = canonicalPurchaseNumber(input.puntoVenta ?? combined?.[1], "0");
  const number = canonicalPurchaseNumber(combined?.[2] || input.numeroComprobante);
  const pointKnown = input.puntoVenta != null || combined != null;
  const compact = sql`regexp_replace(btrim(numero_comprobante),'[[:space:]]','','g')`;
  const storedCombined = sql`(coalesce(btrim(punto_venta),'')='' AND ${compact} ~ '^[0-9]{1,5}-[0-9]{1,8}$')`;
  const storedNumber = sql`CASE WHEN ${storedCombined} THEN split_part(${compact},'-',2) ELSE numero_comprobante END`;
  const storedPoint = sql`CASE WHEN ${storedCombined} THEN split_part(${compact},'-',1) ELSE punto_venta END`;
  const storedPointKnown = sql`(coalesce(btrim(punto_venta),'')<>'' OR ${storedCombined})`;
  const duplicate = (await tx.execute(sql`
    SELECT id FROM purchase_invoices WHERE tipo_comprobante=${input.tipoComprobante}
      AND ${canonicalPurchaseColumn(storedNumber)}=${number}
      AND (${canonicalPurchaseColumn(storedPoint, "0")}=${point} OR NOT ${storedPointKnown} OR ${!pointKnown})
      AND estado<>'anulado' AND (${input.sameIssuer}) LIMIT 1
  `)).rows[0];
  if (duplicate) throw Object.assign(new Error(
    "Ya existe ese comprobante para el emisor, impuesto y jurisdicción. Revisá el punto de venta y el número del registro existente.",
  ), { statusCode: 409 });
}
