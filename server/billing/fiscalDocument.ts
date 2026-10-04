export type FiscalRecipientDocument = {
  tipo: 80 | 94 | 96 | 99;
  numero: string;
};

/**
 * AFIP DocTipo 94 = Pasaporte. Only relevant when the receptor has no CUIT
 * and their loaded document is explicitly a passport (Factura T — turismo,
 * receptores extranjeros); otherwise a non-numeric value would just fail
 * DNI's digit stripping below and fall through to "sin identificar".
 */
function isPassportDocumentType(documentType: unknown): boolean {
  const normalized = String(documentType ?? "").trim().toLowerCase();
  return normalized === "passport" || normalized === "pasaporte";
}

export function resolveFiscalRecipientDocument(input: {
  cuit?: unknown;
  dni?: unknown;
  documentType?: unknown;
}): FiscalRecipientDocument {
  const cuit = String(input.cuit ?? "").replace(/\D/g, "");
  if (cuit) return { tipo: 80, numero: cuit };
  // ARCA's DocNro is numeric (long) for every DocTipo, passport included —
  // a passport with letters (common outside Argentina) only ever submits its
  // digits here. It's a real, known limitation of ARCA's own schema, not
  // something this resolver can work around.
  if (isPassportDocumentType(input.documentType)) {
    const passportNumero = String(input.dni ?? "").replace(/\D/g, "");
    if (passportNumero) return { tipo: 94, numero: passportNumero };
  }
  const dni = String(input.dni ?? "").replace(/\D/g, "");
  if (dni) return { tipo: 96, numero: dni };
  return { tipo: 99, numero: "0" };
}

/**
 * ARCA's CondicionIVAReceptorId (AFIP table FEParamGetCondicionIvaReceptor),
 * mandatory on every FECAESolicitar since RG 5616. Accepts both the
 * snake_case IvaCondition codes (companies.condicionIva/agencies.condicionIva)
 * and the Title Case labels the billing dialog stores on
 * sales_invoices.cliente_condicion_iva (CONDICION_IVA_OPTIONS in billing.tsx)
 * — both reach here depending on which flow built the invoice.
 */
const CONDICION_IVA_RECEPTOR_ID: Record<string, number> = {
  responsable_inscripto: 1,
  exento: 4,
  consumidor_final: 5,
  no_responsable: 5,
  monotributo: 6,
  monotributista: 6,
  no_categorizado: 7,
};

export function resolveCondicionIvaReceptorId(condicionIva: unknown): number {
  const normalized = String(condicionIva ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CONDICION_IVA_RECEPTOR_ID[normalized] ?? 5; // Consumidor Final: la condición más permisiva (Factura B/C) si no se reconoce el valor.
}