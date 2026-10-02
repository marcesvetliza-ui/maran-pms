export type ArcaCredentialDiagnostic = {
  scope: "local-only";
  arcaContacted: false;
  ticketRequested: false;
  checkedAt: string;
  ok: boolean;
  environment: string;
  productionPointOfSale: number | null;
  homologationPointOfSale: number | null;
  certificate: {
    present: boolean;
    parseable: boolean;
    validity: "missing" | "invalid" | "not-yet-valid" | "expired" | "valid";
    validFrom: string | null;
    validTo: string | null;
    issuerCommonName: string | null;
    suggestedEnvironment: "homologacion" | "produccion" | null;
    publicKeyType: string | null;
    rsaBits: number | null;
  };
  privateKey: { present: boolean; parseable: boolean };
  pairMatches: boolean | null;
  signerCompatible: boolean | null;
  issues: string[];
  warnings: string[];
};