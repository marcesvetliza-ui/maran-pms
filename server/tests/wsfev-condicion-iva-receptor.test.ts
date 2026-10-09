import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { feCAESolicitar } from "../billing/wsfevClient";
import { resolveCondicionIvaReceptorId } from "../billing/fiscalDocument";

/**
 * RG 5616 (en vigencia): ARCA rechaza FECAESolicitar sin
 * CondicionIVAReceptorId ("Campo Condicion Frente al IVA del receptor es
 * obligatorio..."). wsfevClient.ts armaba el XML con clienteCondicionIva en
 * el tipo pero nunca lo volcaba en el request — faltaba el tag.
 */

import {initAppEnv,resetAppEnvForTests} from "../app-env";
const originalFetch = global.fetch;
beforeEach(()=>initAppEnv({APP_ENV:"production",NODE_ENV:"production"}));

afterEach(() => {
  resetAppEnvForTests();
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
  tipo: "FB",
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

describe("resolveCondicionIvaReceptorId — mapeo a la tabla de ARCA", () => {
  it.each([
    ["Responsable Inscripto", 1],
    ["responsable_inscripto", 1],
    ["Exento", 4],
    ["exento", 4],
    ["Consumidor Final", 5],
    ["consumidor_final", 5],
    ["no_responsable", 5],
    ["Monotributista", 6],
    ["monotributo", 6],
    ["No Categorizado", 7],
    ["no_categorizado", 7],
  ])("%s -> %i", (input, expected) => {
    expect(resolveCondicionIvaReceptorId(input)).toBe(expected);
  });

  it("valores desconocidos caen a Consumidor Final (5)", () => {
    expect(resolveCondicionIvaReceptorId("")).toBe(5);
    expect(resolveCondicionIvaReceptorId(undefined)).toBe(5);
    expect(resolveCondicionIvaReceptorId("algo-raro")).toBe(5);
  });
});

describe("WSFEv1 FECAESolicitar — CondicionIVAReceptorId", () => {
  it("incluye CondicionIVAReceptorId en el request a ARCA", async () => {
    mockArcaSuccess();
    await feCAESolicitar({ ...baseRequest, clienteCondicionIva: "Consumidor Final" }, "homologacion");
    const [, request] = (global.fetch as any).mock.calls[0];
    expect(request.body as string).toContain("<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>");
  });

  it("mapea Responsable Inscripto a 1 en una Factura A", async () => {
    mockArcaSuccess();
    await feCAESolicitar({ ...baseRequest, tipo: "FA", clienteCondicionIva: "Responsable Inscripto" }, "homologacion");
    const [, request] = (global.fetch as any).mock.calls[0];
    expect(request.body as string).toContain("<ar:CondicionIVAReceptorId>1</ar:CondicionIVAReceptorId>");
  });
});
