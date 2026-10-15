import { afterEach, describe, expect, it, vi } from "vitest";
import { feCompConsultar } from "../billing/wsfevClient";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("ARCA pending credit-note lookup", () => {
  it("funding recovery verifies amount, recipient, date and currency before accepting a consulted CAE", async () => {
    global.fetch = vi.fn(async () => new Response(
      `<Envelope><CAE>12345678901234</CAE><CAEFchVto>20260831</CAEFchVto><ImpTotal>100.00</ImpTotal><CbteFch>20260801</CbteFch><DocTipo>96</DocTipo><DocNro>30111222</DocNro><MonId>PES</MonId><MonCotiz>1</MonCotiz></Envelope>`,
      {status:200},
    )) as any;
    const request={tipo:"FB",puntoVenta:99,numero:1,cuitEmisor:"20111111112",token:"synthetic",sign:"synthetic"};
    const expected={total:100,fecha:"20260801",docTipo:96,docNro:"30111222"};
    expect((await feCompConsultar(request,"homologacion",expected))?.cae).toBe("12345678901234");
    for(const wrong of [{total:99},{fecha:"20260802"},{docTipo:80},{docNro:"30111223"}]) {
      await expect(feCompConsultar(request,"homologacion",{...expected,...wrong})).rejects.toThrow(/no coincide/);
    }
  });
  it("recovers an authorized CAE by the persisted voucher number", async () => {
    global.fetch = vi.fn(async () => new Response(
      `<soap:Envelope><Resultado>A</Resultado><CAE>12345678901234</CAE><CAEFchVto>20260831</CAEFchVto></soap:Envelope>`,
      { status: 200 }
    )) as any;

    const result = await feCompConsultar({
      tipo: "NCB",
      puntoVenta: 1,
      numero: 15,
      cuitEmisor: "30-12345678-9",
      token: "token",
      sign: "sign",
    }, "homologacion");

    expect(result?.cae).toBe("12345678901234");
    expect(result?.caeFechaVto.toISOString()).toContain("2026-08-31");
    const [, request] = (global.fetch as any).mock.calls[0];
    expect(request.body).toContain("<ar:CbteTipo>8</ar:CbteTipo>");
    expect(request.body).toContain("<ar:PtoVta>1</ar:PtoVta>");
    expect(request.body).toContain("<ar:CbteNro>15</ar:CbteNro>");
  });

  it("only permits reauthorization after ARCA explicitly reports no voucher", async () => {
    global.fetch = vi.fn(async () => new Response(
      `<soap:Envelope><Resultado>R</Resultado><Err><Code>602</Code><Msg>Comprobante inexistente</Msg></Err></soap:Envelope>`,
      { status: 200 }
    )) as any;

    await expect(feCompConsultar({
      tipo: "NCB",
      puntoVenta: 1,
      numero: 15,
      cuitEmisor: "30-12345678-9",
      token: "token",
      sign: "sign",
    }, "produccion")).resolves.toBeNull();
  });

  it("rejects an ambiguous ARCA response rather than risking a duplicate NC", async () => {
    global.fetch = vi.fn(async () => new Response(
      `<soap:Envelope><Errors><Err><Code>999</Code><Msg>Error temporal</Msg></Err></Errors></soap:Envelope>`,
      { status: 200 }
    )) as any;

    await expect(feCompConsultar({
      tipo: "NCB",
      puntoVenta: 1,
      numero: 15,
      cuitEmisor: "30-12345678-9",
      token: "token",
      sign: "sign",
    }, "produccion")).rejects.toThrow(/estado verificable/i);
  });

  it("does not treat a generic ARCA rejection as a missing voucher", async () => {
    global.fetch = vi.fn(async () => new Response(
      `<soap:Envelope><Resultado>R</Resultado><Err><Code>10016</Code><Msg>Token vencido</Msg></Err></soap:Envelope>`,
      { status: 200 }
    )) as any;

    await expect(feCompConsultar({
      tipo: "NCB",
      puntoVenta: 1,
      numero: 15,
      cuitEmisor: "30-12345678-9",
      token: "token",
      sign: "sign",
    }, "produccion")).rejects.toThrow(/estado verificable/i);
  });
});