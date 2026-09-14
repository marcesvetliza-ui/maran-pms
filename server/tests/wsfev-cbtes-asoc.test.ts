import { afterEach, describe, expect, it, vi } from "vitest";
import { feCAESolicitar } from "../billing/wsfevClient";

/**
 * Guards RG 4540/19 (in force since 2021-04-01): ARCA rejects every Nota de
 * Crédito/Débito with error 10197 ("Si el comprobante es Débito o Crédito,
 * enviar estructura CbteAsoc o PeriodoAsoc") unless the request identifies
 * the original document it corrects. See server/billing/wsfevClient.ts
 * (buildCbtesAsocBlock) and server/billing/invoiceService.ts
 * (NewInvoiceData.comprobanteAsociado).
 */

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockArcaSuccess() {
  global.fetch = vi.fn(async () => new Response(
    `<soap:Envelope><Resultado>A</Resultado><CAE>71234567890123</CAE><CAEFchVto>20260930</CAEFchVto></soap:Envelope>`,
    { status: 200 },
  )) as any;
}

const baseRequest = {
  tipo: "NCB",
  puntoVenta: 1,
  numero: 15,
  cuitEmisor: "30-12345678-9",
  token: "token",
  sign: "sign",
  montoTotal: 100,
  montoNeto: 100,
  montoNeto21: 0,
  montoNeto105: 0,
  montoIva21: 0,
  montoIva105: 0,
  montoExento: 0,
  montoNoGravado: 100,
  clienteCondicionIva: "Consumidor Final",
  fecha: "20260901",
};

describe("WSFEv1 FECAESolicitar — CbtesAsoc en Notas de Crédito/Débito", () => {
  it("incluye CbtesAsoc, entre MonCotiz e Iva, cuando se informa el comprobante original", async () => {
    mockArcaSuccess();

    await feCAESolicitar({
      ...baseRequest,
      cbteAsoc: [{ tipo: "FB", puntoVenta: 1, numero: 98, cuit: "30-12345678-9", fecha: "20260810" }],
    }, "homologacion");

    const [, request] = (global.fetch as any).mock.calls[0];
    const body: string = request.body;
    expect(body).toContain(
      "<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>6</ar:Tipo><ar:PtoVta>1</ar:PtoVta><ar:Nro>98</ar:Nro>" +
      "<ar:Cuit>30123456789</ar:Cuit><ar:CbteFch>20260810</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>",
    );
    // ARCA's XSD requires MonCotiz → CbtesAsoc → Tributos → Iva, in that order.
    const monCotizIdx = body.indexOf("<ar:MonCotiz>");
    const cbtesAsocIdx = body.indexOf("<ar:CbtesAsoc>");
    expect(monCotizIdx).toBeGreaterThan(-1);
    expect(cbtesAsocIdx).toBeGreaterThan(monCotizIdx);
  });

  it("no incluye CbtesAsoc en una Factura regular (sin comprobante asociado)", async () => {
    mockArcaSuccess();

    await feCAESolicitar({ ...baseRequest, tipo: "FB" }, "homologacion");

    const [, request] = (global.fetch as any).mock.calls[0];
    expect(request.body as string).not.toContain("CbtesAsoc");
  });

  it("omite Cuit/CbteFch por comprobante asociado cuando no se los provee", async () => {
    mockArcaSuccess();

    await feCAESolicitar({
      ...baseRequest,
      cbteAsoc: [{ tipo: "FB", puntoVenta: 1, numero: 98 }],
    }, "homologacion");

    const [, request] = (global.fetch as any).mock.calls[0];
    const body: string = request.body;
    expect(body).toContain("<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>6</ar:Tipo><ar:PtoVta>1</ar:PtoVta><ar:Nro>98</ar:Nro></ar:CbteAsoc></ar:CbtesAsoc>");
  });
});
