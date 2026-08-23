declare module "node-forge" {
  interface SignedData {
    content: unknown;
    addCertificate(certificate: unknown): void;
    addSigner(options: {
      key: unknown;
      certificate: unknown;
      digestAlgorithm: string;
      authenticatedAttributes: Array<{ type: string; value?: string | Date }>;
    }): void;
    sign(options: { detached: boolean }): void;
    toAsn1(): unknown;
  }

  interface Forge {
    pki: {
      certificateFromPem(pem: string): unknown;
      privateKeyFromPem(pem: string): unknown;
      oids: Record<string, string>;
    };
    pkcs7: { createSignedData(): SignedData };
    util: { createBuffer(input: string, encoding: string): unknown };
    asn1: { toDer(value: unknown): { getBytes(): string } };
  }

  const forge: Forge;
  export default forge;
}