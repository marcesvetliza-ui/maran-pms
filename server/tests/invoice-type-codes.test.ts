import { describe, expect, it } from "vitest";
import { TIPOS_CBT_WSFE } from "../billing/invoiceService";

describe("ARCA comprobante type codes", () => {
  it("uses ARCA code 13 for a Nota de Crédito C", () => {
    expect(TIPOS_CBT_WSFE.FC).toBe(11);
    expect(TIPOS_CBT_WSFE.NCC).toBe(13);
  });
});