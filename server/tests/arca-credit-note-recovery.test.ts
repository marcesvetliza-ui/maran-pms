import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feCompConsultar } from "../billing/wsfevClient";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

const originalFetch = global.fetch;

describe("ARCA pending credit-note lookup", () => {
  // Este archivo ejercita el camino real de feCompConsultar (con fetch
  // mockeado a nivel de red) para probar la lógica de reconciliación de
  // notas de crédito pendientes — no la política de bloqueo por ambiente
  // (ver server/tests/arca-comms-block.test.ts para eso). El default
  // global de test es APP_ENV=test (fail-closed), así que acá se simula
  // production explícitamente para llegar al fetch mockeado.
  beforeEach(() => {
    resetAppEnvForTests();
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    resetAppEnvForTests();
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