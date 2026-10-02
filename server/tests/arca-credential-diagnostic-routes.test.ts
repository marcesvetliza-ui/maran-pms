import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerArcaCredentialDiagnosticRoutes } from "../billing/credentialDiagnosticRoutes";
import { syntheticCertificate, syntheticPrivateKey } from "./fixtures/arcaCredentials";

const state = vi.hoisted(() => ({
  rows: [] as any[], fail: false,
  select: vi.fn(), poolQuery: vi.fn(), insert: vi.fn(), update: vi.fn(),
}));
// Intentionally use real requireAuth and requireRole.
vi.mock("../db", () => ({
  db: {
    select: (...args: any[]) => {
      state.select(...args);
      return { from: () => ({ limit: async () => {
        if (state.fail) throw new Error("SENSITIVE_DATABASE_DETAIL");
        return state.rows;
      } }) };
    },
    insert: state.insert, update: state.update,
  },
  pool: { query: state.poolQuery, connect: vi.fn() },
}));

async function requestAs(role: string | null) {
  const app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => role !== null) as any;
    if (role) req.user = { id: "test-admin", role } as any;
    next();
  });
  registerArcaCredentialDiagnosticRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const address = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/api/billing/credential-diagnostic`);
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  state.fail = false;
  state.rows = [{
    arcaCert: syntheticCertificate(), arcaKey: syntheticPrivateKey,
    arcaAmbiente: "ficticio", puntoVenta: 1, puntoVentaHomolog: 5,
    arcaTaToken: "SENSITIVE_TOKEN", arcaTaSign: "SENSITIVE_SIGNATURE",
  }];
});
afterEach(() => vi.restoreAllMocks());

describe("ARCA diagnostics administrator-only read endpoint", () => {
  it("returns 401 before reading credentials without a session", async () => {
    expect((await requestAs(null)).status).toBe(401);
    expect(state.select).not.toHaveBeenCalled();
  });
  it.each(["manager", "reception", "resp_administracion", "spa", "comercial"])("returns 403 for %s before reading credentials", async role => {
    expect((await requestAs(role)).status).toBe(403);
    expect(state.select).not.toHaveBeenCalled();
  });
  it("returns safe metadata for an administrator with no writes, outbound requests or cacheable response", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const response = await requestAs("admin");
    expect(response.status).toBe(200);
    expect(response.cache).toBe("private, no-store");
    expect(response.body).toMatchObject({ ok: true, pairMatches: true, environment: "ficticio", homologationPointOfSale: 5, ticketRequested: false, arcaContacted: false });
    expect(Object.keys(state.select.mock.calls[0][0]).sort()).toEqual(["arcaAmbiente", "arcaCert", "arcaKey", "puntoVenta", "puntoVentaHomolog"].sort());
    expect(JSON.stringify(response.body)).not.toMatch(/SENSITIVE|BEGIN|SYNTHETIC_SUBJECT/);
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.poolQuery).not.toHaveBeenCalled();
    expect(network).toHaveBeenCalledTimes(1); // Only this test's incoming HTTP request.
  });
  it("does not initialize configuration when none is saved", async () => {
    state.rows = [];
    expect((await requestAs("admin")).body.ok).toBe(false);
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("does not expose database exceptions", async () => {
    state.fail = true;
    const response = await requestAs("admin");
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("SENSITIVE_DATABASE_DETAIL");
    expect(response.cache).toContain("no-store");
  });
});