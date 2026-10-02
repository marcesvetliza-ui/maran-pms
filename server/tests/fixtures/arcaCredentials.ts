import forge from "node-forge";

// The project's narrow forge declaration covers the production signer only.
type FixtureCertificate = {
  publicKey: unknown;
  serialNumber: string;
  validity: { notBefore: Date; notAfter: Date };
  setSubject(attributes: { name: string; value: string }[]): void;
  setIssuer(attributes: { name: string; value: string }[]): void;
  sign(key: unknown, digest: unknown): void;
};
const fixtureForge = forge as unknown as {
  pki: {
    rsa: { generateKeyPair(options: { bits: number }): { publicKey: unknown; privateKey: unknown } };
    privateKeyToPem(key: unknown): string;
    createCertificate(): FixtureCertificate;
    certificateToPem(certificate: FixtureCertificate): string;
  };
  md: { sha256: { create(): unknown } };
};

// Synthetic test material only. Never use configured or uploaded credentials.
const keys = fixtureForge.pki.rsa.generateKeyPair({ bits: 2048 });
export const syntheticPrivateKey = fixtureForge.pki.privateKeyToPem(keys.privateKey);

export function syntheticCertificate(issuer = "Computadores Testing", from = "2025-01-01", to = "2030-01-01") {
  const certificate = fixtureForge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date(`${from}T00:00:00Z`);
  certificate.validity.notAfter = new Date(`${to}T00:00:00Z`);
  certificate.setSubject([{ name: "commonName", value: "SYNTHETIC_SUBJECT_MUST_NOT_ESCAPE" }]);
  certificate.setIssuer([{ name: "commonName", value: issuer }]);
  certificate.sign(keys.privateKey, fixtureForge.md.sha256.create());
  return fixtureForge.pki.certificateToPem(certificate);
}