import { describe, expect, it } from "vitest";
import { TIPOS_CBT_WSFE } from "../billing/invoiceService";

describe("ARCA comprobante type codes", () => {
  it("uses ARCA code 13 for a Nota de Crédito C", () => {
    expect(TIPOS_CBT_WSFE.FC).toBe(11);
    expect(TIPOS_CBT_WSFE.NCC).toBe(13);
  });

  it("uses the FCE MiPyME B codes (201-family, shifted +5 from FCE A)", () => {
    expect(TIPOS_CBT_WSFE.FM).toBe(201);
    expect(TIPOS_CBT_WSFE.NDM).toBe(202);
    expect(TIPOS_CBT_WSFE.NCM).toBe(203);
    expect(TIPOS_CBT_WSFE.FMB).toBe(206);
    expect(TIPOS_CBT_WSFE.NDMB).toBe(207);
    expect(TIPOS_CBT_WSFE.NCMB).toBe(208);
  });
});