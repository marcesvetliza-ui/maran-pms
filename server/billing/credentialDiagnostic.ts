import { createHash, createPrivateKey, createPublicKey, X509Certificate, type KeyObject } from "node:crypto";
import type { ArcaCredentialDiagnostic } from "@shared/arcaCredentialDiagnostic";

type CredentialConfig = {
  arcaCert?: string | null;
  arcaKey?: string | null;
  arcaAmbiente?: string | null;
  puntoVenta?: number | null;
  puntoVentaHomolog?: number | null;
};

// Only public SPKI bytes are hashed. PKCS#1/PKCS#8 private encodings give
// the same identifier without exporting or hashing the private key itself.
function publicKeyFingerprint(key: KeyObject): string {
  return createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
}

// Deliberately local: no WSAA client, network, persistence or ticket cache.
// Never return parser exceptions, PEMs, subjects, serials, tokens or signatures.
export function diagnoseArcaCredentials(
  config: CredentialConfig | undefined,
  now = new Date(),
): ArcaCredentialDiagnostic {
  const result: ArcaCredentialDiagnostic = {
    scope: "local-only",
    arcaContacted: false,
    ticketRequested: false,
    checkedAt: now.toISOString(),
    ok: false,
    environment: config?.arcaAmbiente ?? "ficticio",
    productionPointOfSale: config?.puntoVenta ?? null,
    homologationPointOfSale: config?.puntoVentaHomolog ?? null,
    certificate: {
      present: Boolean(config?.arcaCert), parseable: false, validity: "missing",
      validFrom: null, validTo: null, issuerCommonName: null,
      suggestedEnvironment: null, publicKeyType: null, rsaBits: null,
      publicKeyFingerprintSha256: null,
    },
    privateKey: { present: Boolean(config?.arcaKey), parseable: false, publicKeyFingerprintSha256: null },
    pairMatches: null,
    signerCompatible: null,
    issues: [],
    warnings: [
      "Esta revisión no valida la cadena de confianza, la autorización WSFE ni la habilitación del punto de venta en ARCA.",
    ],
  };

  if (!config) result.issues.push("No hay configuración fiscal guardada.");
  let certificate: X509Certificate | undefined;
  if (!result.certificate.present) {
    result.issues.push("Falta el certificado guardado.");
  } else {
    try {
      certificate = new X509Certificate(config!.arcaCert!);
      const from = new Date(certificate.validFrom);
      const to = new Date(certificate.validTo);
      result.certificate.parseable = true;
      result.certificate.validFrom = from.toISOString();
      result.certificate.validTo = to.toISOString();
      result.certificate.validity = now < from ? "not-yet-valid" : now > to ? "expired" : "valid";
      if (result.certificate.validity === "not-yet-valid") result.issues.push("El certificado todavía no está vigente.");
      if (result.certificate.validity === "expired") result.issues.push("El certificado está vencido.");
      const cn = certificate.toLegacyObject().issuer.CN;
      const issuer = typeof cn === "string" ? cn : Array.isArray(cn) ? cn[0] : null;
      // Only disclose recognized public CA names, never arbitrary issuer text.
      if (issuer && /^computadores(?:\s+(?:testing|test|homologacion|homologación))?$/i.test(issuer.trim())) {
        result.certificate.issuerCommonName = issuer.trim();
        result.certificate.suggestedEnvironment = /^computadores$/i.test(issuer.trim()) ? "produccion" : "homologacion";
      } else {
        result.warnings.push("El nombre del emisor no corresponde a una autoridad ARCA reconocida por esta comprobación.");
      }
      result.certificate.publicKeyType = certificate.publicKey.asymmetricKeyType ?? null;
      result.certificate.rsaBits = certificate.publicKey.asymmetricKeyDetails?.modulusLength ?? null;
      result.certificate.publicKeyFingerprintSha256 = publicKeyFingerprint(certificate.publicKey);
    } catch {
      certificate = undefined;
      result.certificate.validity = "invalid";
      result.issues.push("No se pudo interpretar el certificado guardado.");
    }
  }

  if (!result.privateKey.present) {
    result.issues.push("Falta la clave privada guardada.");
  } else {
    try {
      const key = createPrivateKey(config!.arcaKey!);
      result.privateKey.parseable = true;
      result.privateKey.publicKeyFingerprintSha256 = publicKeyFingerprint(createPublicKey(key));
      if (certificate) {
        result.pairMatches = certificate.checkPrivateKey(key);
        result.signerCompatible = key.asymmetricKeyType === "rsa" && certificate.publicKey.asymmetricKeyType === "rsa";
        if (!result.pairMatches) result.issues.push("El certificado y la clave privada no corresponden al mismo par.");
        if (!result.signerCompatible) result.issues.push("El firmador actual requiere un certificado y una clave RSA.");
      }
    } catch {
      result.issues.push("No se pudo interpretar la clave privada guardada; debe estar en formato PEM sin contraseña para el firmador actual.");
    }
  }

  const suggested = result.certificate.suggestedEnvironment;
  if (suggested && ["homologacion", "produccion"].includes(result.environment) && suggested !== result.environment) {
    result.warnings.push("El nombre declarado del emisor sugiere un ambiente distinto del configurado. Esta inferencia no reemplaza la validación de ARCA.");
  }
  result.ok = result.issues.length === 0 && result.pairMatches === true && result.signerCompatible === true;
  return result;
}