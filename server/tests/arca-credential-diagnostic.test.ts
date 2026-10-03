import { createHash, createPrivateKey, generateKeyPairSync, X509Certificate } from "node:crypto";
import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { diagnoseArcaCredentials } from "../billing/credentialDiagnostic";
import { syntheticCertificate, syntheticPrivateKey } from "./fixtures/arcaCredentials";

const now = new Date("2026-10-02T15:00:00Z");
const config = {
  arcaCert: syntheticCertificate(), arcaKey: syntheticPrivateKey,
  arcaAmbiente: "ficticio", puntoVenta: 1, puntoVentaHomolog: 5,
};

describe("local ARCA credential diagnosis", () => {
  it("checks a matching RSA pair in ficticio without switching environment or leaking credentials", () => {
    const before = JSON.stringify(config);
    const report = diagnoseArcaCredentials(config, now);
    expect(report).toMatchObject({
      ok: true, pairMatches: true, signerCompatible: true, environment: "ficticio",
      arcaContacted: false, ticketRequested: false, scope: "local-only",
      productionPointOfSale: 1, homologationPointOfSale: 5,
      certificate: { parseable: true, validity: "valid", rsaBits: 2048, issuerCommonName: "Computadores Testing", suggestedEnvironment: "homologacion" },
    });
    const output = JSON.stringify(report);
    for (const forbidden of ["-----BEGIN", syntheticPrivateKey, config.arcaCert, "SYNTHETIC_SUBJECT_MUST_NOT_ESCAPE", "serialNumber", "arcaTaToken", "arcaTaSign"]) {
      expect(output.includes(forbidden)).toBe(false);
    }
    expect(JSON.stringify(config)).toBe(before);
  });

  it("detects a different private key", () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const report = diagnoseArcaCredentials({ ...config, arcaKey: other.privateKey.export({ type: "pkcs8", format: "pem" }).toString() }, now);
    expect(report.pairMatches).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.issues).toContain("El certificado y la clave privada no corresponden al mismo par.");
    expect(report.certificate.publicKeyFingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.privateKey.publicKeyFingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.privateKey.publicKeyFingerprintSha256).not.toBe(report.certificate.publicKeyFingerprintSha256);
  });

  it("identifies only the public SPKI and stays stable across private-key PEM encodings", () => {
    const expected = createHash("sha256")
      .update(new X509Certificate(config.arcaCert).publicKey.export({ type: "spki", format: "der" }))
      .digest("hex");
    const privateKey = createPrivateKey(syntheticPrivateKey);
    for (const type of ["pkcs1", "pkcs8"] as const) {
      const key = privateKey.export({ type, format: "pem" }).toString();
      const input = { ...config, arcaKey: key };
      const before = JSON.stringify(input);
      const report = diagnoseArcaCredentials(input, now);
      expect(report.certificate.publicKeyFingerprintSha256).toBe(expected);
      expect(report.privateKey.publicKeyFingerprintSha256).toBe(expected);
      expect(report.pairMatches).toBe(true);
      expect(report.arcaContacted).toBe(false);
      expect(report.ticketRequested).toBe(false);
      expect(JSON.stringify(input)).toBe(before);
      expect(JSON.stringify(report)).not.toContain(key);
      expect(expected).not.toBe(createHash("sha256").update(key).digest("hex"));
    }
  });

  it("can identify the public half of a readable key when the certificate is absent", () => {
    const report = diagnoseArcaCredentials({ arcaKey: syntheticPrivateKey }, now);
    expect(report.certificate.publicKeyFingerprintSha256).toBeNull();
    expect(report.privateKey.publicKeyFingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.pairMatches).toBeNull();
  });

  it.each([
    ["2020-01-01", "2021-01-01", "expired"],
    ["2027-01-01", "2030-01-01", "not-yet-valid"],
  ])("detects validity limits %s to %s", (from, to, validity) => {
    const report = diagnoseArcaCredentials({ ...config, arcaCert: syntheticCertificate("Computadores Testing", from, to) }, now);
    expect(report.certificate.validity).toBe(validity);
    expect(report.pairMatches).toBe(true);
    expect(report.ok).toBe(false);
  });

  it("reports absent settings without creating defaults", () => {
    const report = diagnoseArcaCredentials(undefined, now);
    expect(report.ok).toBe(false);
    expect(report.certificate.validity).toBe("missing");
    expect(report.privateKey.present).toBe(false);
    expect(report.pairMatches).toBeNull();
    expect(report.issues).toHaveLength(3);
    expect(report.certificate.publicKeyFingerprintSha256).toBeNull();
    expect(report.privateKey.publicKeyFingerprintSha256).toBeNull();
  });

  it("does not expose malformed credential input or parser errors", () => {
    const report = diagnoseArcaCredentials({ ...config, arcaCert: "SENSITIVE_CERT", arcaKey: "SENSITIVE_KEY" }, now);
    expect(report.certificate.validity).toBe("invalid");
    expect(report.privateKey.parseable).toBe(false);
    expect(report.pairMatches).toBeNull();
    expect(report.certificate.publicKeyFingerprintSha256).toBeNull();
    expect(report.privateKey.publicKeyFingerprintSha256).toBeNull();
    expect(JSON.stringify(report)).not.toMatch(/SENSITIVE|error:|openssl|PEM routines/);
  });

  it("rejects encrypted private keys without displaying exception details", () => {
    const privateKey = forge.pki.privateKeyFromPem(syntheticPrivateKey);
    const encrypted = forge.pki.encryptRsaPrivateKey(privateKey, "SYNTHETIC_PASSWORD");
    const report = diagnoseArcaCredentials({ ...config, arcaKey: encrypted }, now);
    expect(report.ok).toBe(false);
    expect(report.privateKey.parseable).toBe(false);
    expect(report.privateKey.publicKeyFingerprintSha256).toBeNull();
    expect(JSON.stringify(report)).not.toMatch(/SYNTHETIC_PASSWORD|BEGIN|bad decrypt/);
  });

  it("detects incompatible EC keys", () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const report = diagnoseArcaCredentials({ ...config, arcaKey: ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString() }, now);
    expect(report.privateKey.parseable).toBe(true);
    expect(report.signerCompatible).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("reports issuer-based environment inference as a warning, not ARCA validation", () => {
    const report = diagnoseArcaCredentials({ ...config, arcaAmbiente: "homologacion", arcaCert: syntheticCertificate("Computadores") }, now);
    expect(report.certificate.suggestedEnvironment).toBe("produccion");
    expect(report.warnings.some(w => w.includes("ambiente distinto"))).toBe(true);
    expect(report.arcaContacted).toBe(false);
  });

  it("does not disclose arbitrary issuer text or assert its environment", () => {
    const report = diagnoseArcaCredentials({ ...config, arcaCert: syntheticCertificate("PRIVATE_ISSUER_MUST_NOT_ESCAPE") }, now);
    expect(report.certificate.issuerCommonName).toBeNull();
    expect(report.certificate.suggestedEnvironment).toBeNull();
    expect(JSON.stringify(report)).not.toContain("PRIVATE_ISSUER_MUST_NOT_ESCAPE");
  });
});