/** Review only: fresh synthetic certificate, fake WSAA, Unix-socket PostgreSQL. */
import { afterAll, expect, it, vi } from "vitest";
import pg from "pg";
import forge from "node-forge";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTokenAuth } from "../billing/wsaaClient";
import { createArcaTransport } from "../billing/funding/operational/arcaTransport";
import * as schema from "../../shared/schema";
vi.mock("../db", () => ({ db: {} }));
const pool = new pg.Pool({ host: "/tmp/folio-funding-isolated/socket", port: 55439, user: "runner",
  password: "", database: "folio_funding_synthetic", max: 2 });
afterAll(async () => { vi.unstubAllGlobals(); await pool.end(); });
it("REPRO: rolling back numbering also loses a newly issued WSAA ticket, and retry cannot use that valid ticket", async () => {
  const c = await pool.connect();
  const schemaName = `wsaa_review_${Date.now()}`;
  try {
    await c.query(`CREATE SCHEMA ${schemaName}`);
    await c.query(`SET search_path=${schemaName},public`);
    await c.query(`CREATE TABLE billing_config(id int PRIMARY KEY,arca_ta_token text,arca_ta_sign text,arca_ta_expiry timestamp,arca_ta_ambiente text);
      INSERT INTO billing_config(id) VALUES(1)`);
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey; cert.serialNumber = "01";
    cert.validity.notBefore = new Date("2026-01-01"); cert.validity.notAfter = new Date("2027-01-01");
    cert.setSubject([{name:"commonName",value:"Synthetic review only"}]); cert.setIssuer(cert.subject.attributes);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const certPem = forge.pki.certificateToPem(cert), keyPem = forge.pki.privateKeyToPem(keys.privateKey);
    let logins = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (!url.includes("wsaa")) return new Response("<Envelope><CbteNro>0</CbteNro></Envelope>", { status: 200 });
      logins++;
      return new Response(logins === 1
        ? "<Envelope><loginCmsReturn>&lt;loginTicketResponse&gt;&lt;credentials&gt;&lt;token&gt;synthetic-ticket&lt;/token&gt;&lt;sign&gt;synthetic-sign&lt;/sign&gt;&lt;/credentials&gt;&lt;/loginTicketResponse&gt;</loginCmsReturn></Envelope>"
        : "<Envelope><faultstring>coe.alreadyAuthenticated: valid ticket exists</faultstring></Envelope>", { status: 200 });
    }));
    const transport = createArcaTransport(async (_identity, client) =>
      getTokenAuth(certPem,keyPem,"homologacion",drizzle(client!,{schema})));
    const identity = { environment: "homologacion" as const, issuer: "20111111112", tipo: "FB" as const,
      puntoVenta: 99, fecha: "2026-10-15", snapshot: {} };
    await c.query("BEGIN");
    expect(await transport.lastNumber(identity,c)).toBe(0);
    expect((await c.query("SELECT arca_ta_token FROM billing_config")).rows[0].arca_ta_token).toBe("synthetic-ticket");
    // Fiscal numbering rejects a pending/conflicting draft AFTER lastNumber fetched WSAA.
    await c.query("ROLLBACK");
    expect((await c.query("SELECT arca_ta_token FROM billing_config")).rows[0].arca_ta_token).toBeNull();
    await expect(transport.lastNumber(identity,c)).rejects.toThrow(/TA válido/);
    expect(logins).toBe(2);
  } finally {
    await c.query("ROLLBACK");
    await c.query("SET search_path=public");
    await c.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    c.release();
  }
});
