import forge from "node-forge";
import { db } from "../db";
import { billingConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { assertExternalCommAllowed } from "../external-comms-policy";

const WSAA_HOMOLOG = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
const WSAA_PROD    = "https://wsaa.afip.gov.ar/ws/services/LoginCms";

// Buffer: renovar 30 min antes de que expire
const RENEW_BEFORE_MS = 30 * 60 * 1000;

function toAR(d: Date): string {
  const offset = -3 * 60;
  const local = new Date(d.getTime() + offset * 60 * 1000);
  return local.toISOString().slice(0, 19) + "-03:00";
}

function buildTRA(): string {
  const now = new Date();
  const exp = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const uniqueId = Math.floor(now.getTime() / 1000);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<loginTicketRequest version="1.0">\n` +
    `  <header>\n` +
    `    <uniqueId>${uniqueId}</uniqueId>\n` +
    `    <generationTime>${toAR(now)}</generationTime>\n` +
    `    <expirationTime>${toAR(exp)}</expirationTime>\n` +
    `  </header>\n` +
    `  <service>wsfe</service>\n` +
    `</loginTicketRequest>`
  );
}

function signTRA(traXml: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const privateKey = forge.pki.privateKeyFromPem(keyPem);

  const p7 = (forge.pkcs7 as any).createSignedData();
  p7.content = forge.util.createBuffer(traXml, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: false });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Buffer.from(der, "binary").toString("base64");
}

async function soapPost(url: string, body: string): Promise<string> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`WSAA HTTP ${resp.status}: ${text.slice(0, 600)}`);
  return text;
}

/** Lee el token persistido en DB; devuelve null si no existe o está por vencer */
async function loadFromDb(ambiente: string): Promise<{ token: string; sign: string } | null> {
  try {
    const rows = await db.select({
      arcaTaToken: billingConfig.arcaTaToken,
      arcaTaSign: billingConfig.arcaTaSign,
      arcaTaExpiry: billingConfig.arcaTaExpiry,
      arcaTaAmbiente: billingConfig.arcaTaAmbiente,
    }).from(billingConfig).limit(1);

    const row = rows[0];
    if (!row?.arcaTaToken || !row?.arcaTaSign || !row?.arcaTaExpiry) return null;
    if (row.arcaTaAmbiente !== ambiente) return null;

    const expiry = new Date(row.arcaTaExpiry);
    if (expiry.getTime() - Date.now() < RENEW_BEFORE_MS) return null;

    return { token: row.arcaTaToken, sign: row.arcaTaSign };
  } catch {
    return null;
  }
}

/** Persiste el token en DB con expiración de 10 horas */
async function saveToDb(token: string, sign: string, ambiente: string): Promise<void> {
  try {
    const expiry = new Date(Date.now() + 10 * 60 * 60 * 1000);
    await db.update(billingConfig)
      .set({ arcaTaToken: token, arcaTaSign: sign, arcaTaExpiry: expiry, arcaTaAmbiente: ambiente })
      .where(eq(billingConfig.id, 1));
  } catch {
    // Silencioso: si falla el guardado, igual devolvemos el token
  }
}

export async function getTokenAuth(
  certPem: string,
  keyPem: string,
  ambiente: "homologacion" | "produccion"
): Promise<{ token: string; sign: string }> {
  assertExternalCommAllowed({ integration: "arca", action: `wsaa-login-${ambiente}` });

  // 1. Intentar desde DB (persiste entre restarts)
  const cached = await loadFromDb(ambiente);
  if (cached) return cached;

  // 2. Pedir nuevo token a WSAA
  const tra = buildTRA();
  const cms = signTRA(tra, certPem, keyPem);
  const url = ambiente === "homologacion" ? WSAA_HOMOLOG : WSAA_PROD;

  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
    `<soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body>` +
    `</soapenv:Envelope>`;

  let resp: string;
  try {
    resp = await soapPost(url, envelope);
  } catch (err: unknown) {
    const msg = (err as Error).message ?? "";
    // alreadyAuthenticated: AFIP dice que el token anterior sigue vigente pero lo perdimos.
    // El único remedio es esperar a que expire (~12h desde la última autenticación).
    if (msg.includes("alreadyAuthenticated")) {
      throw new Error(
        "AFIP indica que ya existe un TA válido para este certificado. " +
        "El token expirará automáticamente. Intentá de nuevo en unos minutos o esperá hasta que expire (máx. 12h)."
      );
    }
    throw err;
  }

  // Detectar faults en respuesta HTTP 200 (AFIP a veces devuelve faults con 200)
  const faultCheck = resp.match(/<faultstring>([^<]+)<\/faultstring>/);
  if (faultCheck) {
    const faultText = faultCheck[1];
    if (faultText.toLowerCase().includes("already") || resp.includes("alreadyAuthenticated")) {
      throw new Error(
        "AFIP indica que ya existe un TA válido para este certificado. " +
        "El token expirará automáticamente (máx. 12h desde la última autenticación)."
      );
    }
    throw new Error(`WSAA Fault: ${faultText}`);
  }

  // AFIP devuelve el loginTicketResponse HTML-encoded dentro de <loginCmsReturn>
  const returnM = resp.match(/<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/);
  const inner = returnM
    ? returnM[1]
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
    : resp;

  const tokenM = inner.match(/<token>([\s\S]+?)<\/token>/);
  const signM  = inner.match(/<sign>([\s\S]+?)<\/sign>/);
  if (!tokenM || !signM) {
    // Incluir porción de respuesta para diagnóstico
    const preview = resp.slice(0, 300).replace(/\s+/g, " ");
    throw new Error(`WSAA: respuesta inválida. HTTP 200 sin token/sign. Preview: ${preview}`);
  }

  const token = tokenM[1];
  const sign  = signM[1];

  // 3. Persistir en DB para próximos requests
  await saveToDb(token, sign, ambiente);

  return { token, sign };
}
