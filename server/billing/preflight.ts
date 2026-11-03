import { sql } from "drizzle-orm";
import { billingPointError, validPointNumber, type BillingPointConfig, type BillingPoint } from "@shared/billing-point-of-sale";

export class BillingPreflightError extends Error {
  readonly code = "BILLING_PREFLIGHT_REJECTED";
  readonly statusCode = 400;
  readonly authorizationRequested = false;
}
export async function assertBillingPoint(config: BillingPointConfig, override: unknown, database: { execute: (query: any) => Promise<any> }): Promise<number> {
  const selected = override ?? (config.arcaAmbiente === "homologacion" ? config.puntoVentaHomolog : config.puntoVenta);
  // Homologation has a dedicated point; operational POS preferences never apply.
  const points: BillingPoint[] = config.arcaAmbiente === "homologacion" ? [] :
    (await database.execute(sql`SELECT numero,activo,tipo FROM pos_configs`)).rows;
  const error = billingPointError(config, points, selected);
  if (error) throw new BillingPreflightError(error);
  return validPointNumber(selected)!;
}

export function fiscalRecipientError(type: string, recipient: { razonSocial?: string; cuit?: string; dni?: string; condicionIva?: string }): string | null {
  const condition = String(recipient.condicionIva || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const cuit = String(recipient.cuit || "").replace(/\D/g, "");
  if (!recipient.razonSocial?.trim()) return "Completá el nombre o razón social del receptor.";
  if (!["responsable_inscripto", "exento", "consumidor_final", "no_responsable", "monotributo", "monotributista", "no_categorizado"].includes(condition)) return "Revisá la condición de IVA del receptor.";
  if (cuit && cuit.length !== 11) return "El CUIT del receptor debe tener 11 dígitos.";
  if (["FA", "FM", "NCA", "NCM", "NDA", "NDM"].includes(type) && (condition !== "responsable_inscripto" || cuit.length !== 11)) return "Factura A requiere CUIT y condición Responsable Inscripto. Un receptor IVA exento corresponde a Factura B.";
  if (["FB", "FMB", "NCB", "NCMB", "NDB", "NDMB"].includes(type) && condition === "responsable_inscripto") return "Factura B no corresponde a un receptor Responsable Inscripto.";
  return null;
}
