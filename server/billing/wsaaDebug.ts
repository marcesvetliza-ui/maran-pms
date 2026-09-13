/**
 * GET /api/billing/debug-wsaa — diagnóstico crudo de WSAA (login real a
 * AFIP). Extraído de server/billing/routes.ts a un módulo propio, liviano
 * (solo depende de billingConfig.ts, no de todo el grafo de invoiceService/
 * groupInvoiceScope/reservationCreditReconciliation), para poder testear el
 * bloqueo por ambiente sin tener que registrar todo billing/routes.ts.
 *
 * No cambia ningún comportamiento respecto del código original — es una
 * extracción verbatim.
 */
import type { Express } from "express";
import { getBillingConfig } from "./billingConfig";
import { requireAuth } from "../auth";
import { assertExternalCommAllowed } from "../external-comms-policy";

export function registerWsaaDebugRoute(app: Express): void {
  app.get("/api/billing/debug-wsaa", requireAuth, async (req, res) => {
    try {
      assertExternalCommAllowed({ integration: "arca", action: "debug-wsaa" });
      const config = await getBillingConfig();
      if (!config.arcaCert || !config.arcaKey) return res.json({ error: "Sin cert/key" });

      const forge = (await import("node-forge")).default;
      const certPem = config.arcaCert;
      const keyPem = config.arcaKey;

      const now = new Date();
      const exp = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      const toAR = (d: Date) => {
        const local = new Date(d.getTime() + -3 * 60 * 60 * 1000);
        return local.toISOString().slice(0, 19) + "-03:00";
      };
      const uniqueId = Math.floor(now.getTime() / 1000);
      const tra = `<?xml version="1.0" encoding="UTF-8"?>\n<loginTicketRequest version="1.0">\n  <header>\n    <uniqueId>${uniqueId}</uniqueId>\n    <generationTime>${toAR(now)}</generationTime>\n    <expirationTime>${toAR(exp)}</expirationTime>\n  </header>\n  <service>wsfe</service>\n</loginTicketRequest>`;

      const cert = forge.pki.certificateFromPem(certPem);
      const privateKey = forge.pki.privateKeyFromPem(keyPem);
      const p7 = (forge.pkcs7 as any).createSignedData();
      p7.content = forge.util.createBuffer(tra, "utf8");
      p7.addCertificate(cert);
      p7.addSigner({
        key: privateKey, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
          { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
          { type: forge.pki.oids.messageDigest },
          { type: forge.pki.oids.signingTime, value: new Date() },
        ],
      });
      p7.sign({ detached: false });
      const cms = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary").toString("base64");

      const envelope = `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;

      const resp = await fetch("https://wsaa.afip.gov.ar/ws/services/LoginCms", {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
        body: envelope,
      });

      const text = await resp.text();
      res.json({ httpStatus: resp.status, rawResponse: text.slice(0, 2000) });
    } catch (e: any) {
      res.json({ error: e.message });
    }
  });
}
