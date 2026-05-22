import forge from "node-forge";

const WSAA_HOMOLOG = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
const WSAA_PROD    = "https://wsaa.afip.gov.ar/ws/services/LoginCms";

interface CachedTA {
  token: string;
  sign: string;
  expiration: Date;
}

const taCache = new Map<string, CachedTA>();

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
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`WSAA HTTP ${resp.status}: ${text.slice(0, 400)}`);
  return text;
}

export async function getTokenAuth(
  certPem: string,
  keyPem: string,
  ambiente: "homologacion" | "produccion"
): Promise<{ token: string; sign: string }> {
  const cacheKey = `${ambiente}:${certPem.slice(-40)}`;
  const cached = taCache.get(cacheKey);
  if (cached && cached.expiration > new Date(Date.now() + 10 * 60 * 1000)) {
    return { token: cached.token, sign: cached.sign };
  }

  const tra = buildTRA();
  const cms = signTRA(tra, certPem, keyPem);
  const url = ambiente === "homologacion" ? WSAA_HOMOLOG : WSAA_PROD;

  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
    `<soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body>` +
    `</soapenv:Envelope>`;

  const resp = await soapPost(url, envelope);

  const tokenM = resp.match(/<token>([^<]+)<\/token>/);
  const signM  = resp.match(/<sign>([^<]+)<\/sign>/);
  if (!tokenM || !signM) {
    const faultM = resp.match(/<faultstring>([^<]+)<\/faultstring>/);
    throw new Error(`WSAA: respuesta inválida${faultM ? " — " + faultM[1] : ""}`);
  }

  const ta: CachedTA = {
    token: tokenM[1],
    sign: signM[1],
    expiration: new Date(Date.now() + 10 * 60 * 60 * 1000),
  };
  taCache.set(cacheKey, ta);
  return { token: ta.token, sign: ta.sign };
}
