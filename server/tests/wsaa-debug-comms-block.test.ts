import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

const state = vi.hoisted(() => ({
  configRow: {
    id: 1,
    arcaCert: "-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----",
    arcaKey: "-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----",
  } as any,
}));

vi.mock("../db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([state.configRow])) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([state.configRow])) })) })),
  },
}));

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));

const nodeForgeSpy = vi.hoisted(() => ({ certificateFromPem: vi.fn() }));
vi.mock("node-forge", () => ({
  default: {
    pki: {
      certificateFromPem: (...args: any[]) => {
        nodeForgeSpy.certificateFromPem(...args);
        return {};
      },
      privateKeyFromPem: () => ({}),
      oids: { contentType: "1", data: "2", messageDigest: "3", signingTime: "4", sha256: "5" },
    },
    pkcs7: {
      createSignedData: () => ({
        content: undefined,
        addCertificate: () => {},
        addSigner: () => {},
        sign: () => {},
        toAsn1: () => ({}),
      }),
    },
    asn1: { toDer: () => ({ getBytes: () => "" }) },
    util: { createBuffer: () => "" },
  },
}));

const { registerWsaaDebugRoute } = await import("../billing/wsaaDebug");
const { db } = await import("../db");

const originalFetch = global.fetch;

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  registerWsaaDebugRoute(app);
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

describe("GET /api/billing/debug-wsaa — bloqueo por ambiente antes de leer cert/generar XML/llamar a AFIP", () => {
  beforeEach(() => {
    resetAppEnvForTests();
    (db.select as any).mockClear();
    nodeForgeSpy.certificateFromPem.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    resetAppEnvForTests();
  });

  it.each(["pilot", "development", "test"] as const)(
    "APP_ENV=%s bloquea antes de leer el certificado, generar el XML o llamar a fetch",
    async (appEnv) => {
      initAppEnv({ APP_ENV: appEnv, NODE_ENV: appEnv === "pilot" ? "production" : appEnv === "test" ? "test" : "development" });
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy as any;

      await withServer(async (baseUrl) => {
        const res = await originalFetch(`${baseUrl}/api/billing/debug-wsaa`);
        const body = await res.json();
        expect(body.error).toMatch(/bloqueada/i);
      });

      expect(db.select).not.toHaveBeenCalled();
      expect(nodeForgeSpy.certificateFromPem).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("APP_ENV=production preserva el comportamiento actual (sí invoca fetch)", async () => {
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    global.fetch = vi.fn(async () => new Response("<xml/>", { status: 200 })) as any;

    await withServer(async (baseUrl) => {
      const res = await originalFetch(`${baseUrl}/api/billing/debug-wsaa`);
      const body = await res.json();
      expect(body.httpStatus).toBe(200);
    });

    expect(db.select).toHaveBeenCalled();
    expect(nodeForgeSpy.certificateFromPem).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as any).mock.calls[0][0]).toBe("https://wsaa.afip.gov.ar/ws/services/LoginCms");
  });
});
