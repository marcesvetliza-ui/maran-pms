import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";
import { ExternalCommsBlockedError } from "../external-comms-policy";
import { feCAESolicitar, feCompConsultar } from "../billing/wsfevClient";

// wsaaClient.ts importa "../db" a nivel de módulo (para cachear el token de
// ARCA). No hay una base real en este entorno de test, así que se mockea
// para poder importar el módulo y, además, para poder espiar que el
// bloqueo por ambiente ocurre ANTES de tocar la DB (no solo antes del fetch).
vi.mock("../db", () => ({
  db: { select: vi.fn(), update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })) },
  pool: {},
}));

const originalFetch = global.fetch;

const FECOMP_REQ = {
  tipo: "NCB",
  puntoVenta: 1,
  numero: 15,
  cuitEmisor: "30-12345678-9",
  token: "token",
  sign: "sign",
};

const FECAE_REQ = {
  tipo: "FB",
  puntoVenta: 1,
  numero: 20,
  cuitEmisor: "30-12345678-9",
  token: "token",
  sign: "sign",
  montoTotal: 100,
  montoNeto: 82.64,
  montoNeto21: 82.64,
  montoNeto105: 0,
  montoIva21: 17.36,
  montoIva105: 0,
  montoExento: 0,
  montoNoGravado: 0,
  clienteCuit: "30-12345678-9",
  clienteCondicionIva: "RI",
  fecha: "20260901",
};

describe("ARCA real (wsfevClient) — bloqueo por ambiente antes de cualquier fetch", () => {
  beforeEach(() => {
    resetAppEnvForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    resetAppEnvForTests();
  });

  it.each(["pilot", "development", "test"] as const)(
    "feCompConsultar: APP_ENV=%s bloquea sin invocar fetch",
    async (appEnv) => {
      initAppEnv({ APP_ENV: appEnv, NODE_ENV: appEnv === "pilot" ? "production" : appEnv === "test" ? "test" : "development" });
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;

      await expect(feCompConsultar(FECOMP_REQ, "homologacion")).rejects.toBeInstanceOf(ExternalCommsBlockedError);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each(["pilot", "development", "test"] as const)(
    "feCAESolicitar: APP_ENV=%s bloquea sin invocar fetch ni construir el envelope de ARCA",
    async (appEnv) => {
      initAppEnv({ APP_ENV: appEnv, NODE_ENV: appEnv === "pilot" ? "production" : appEnv === "test" ? "test" : "development" });
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;

      await expect(feCAESolicitar(FECAE_REQ, "produccion")).rejects.toBeInstanceOf(ExternalCommsBlockedError);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("feCompConsultar: APP_ENV=production preserva el comportamiento actual (sí invoca fetch)", async () => {
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    global.fetch = vi.fn(async () => new Response(
      `<soap:Envelope><Resultado>A</Resultado><CAE>12345678901234</CAE><CAEFchVto>20260831</CAEFchVto></soap:Envelope>`,
      { status: 200 },
    )) as any;

    const result = await feCompConsultar(FECOMP_REQ, "homologacion");

    expect(result?.cae).toBe("12345678901234");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("feCAESolicitar: APP_ENV=production preserva el comportamiento actual (sí invoca fetch)", async () => {
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    global.fetch = vi.fn(async () => new Response(
      `<soap:Envelope><Resultado>A</Resultado><CAE>98765432109876</CAE><CAEFchVto>20260930</CAEFchVto></soap:Envelope>`,
      { status: 200 },
    )) as any;

    const result = await feCAESolicitar(FECAE_REQ, "produccion");

    expect(result.cae).toBe("98765432109876");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("ARCA real (wsaaClient.getTokenAuth) — bloqueo por ambiente antes de cualquier fetch o lectura de DB", () => {
  beforeEach(() => {
    resetAppEnvForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    resetAppEnvForTests();
  });

  it("APP_ENV=pilot bloquea sin invocar fetch ni leer/escribir billingConfig en DB", async () => {
    initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as any;
    const { db } = await import("../db");
    const { getTokenAuth } = await import("../billing/wsaaClient");

    await expect(getTokenAuth("cert", "key", "homologacion")).rejects.toBeInstanceOf(ExternalCommsBlockedError);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });
});
