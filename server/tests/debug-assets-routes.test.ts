import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDebugAssetRoutes } from "../debug-assets-routes";

// A propósito NO se mockea "../auth": este test tiene que confirmar que
// requireAuth (real) efectivamente protege estas dos rutas — antes estaban
// registradas sin ningún guard.
// "../db" sí se mockea: solo hace falta para que "../auth" pueda importarse
// en este sandbox sin DATABASE_URL — requireAuth no lo usa.
vi.mock("../db", () => ({
  db: {},
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock("../utils/assetPath", () => ({
  assetPathDiagnostic: () => ({ ok: true }),
}));

async function withServer<T>(authenticated: boolean, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => authenticated;
    if (authenticated) {
      (req as any).user = { id: "u1", username: "u", email: "u@u.com", fullName: "U", role: "reception", department: null, phone: null, isActive: "true" };
    }
    next();
  });
  registerDebugAssetRoutes(app);
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe("registerDebugAssetRoutes — ya no son públicas", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/debug/assets exige sesión (401 sin autenticar)", async () => {
    await withServer(false, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/debug/assets`);
      expect(res.status).toBe(401);
    });
  });

  it("GET /api/debug/assets responde 200 autenticado", async () => {
    await withServer(true, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/debug/assets`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });
  });

  it("GET /descargar-colobig-pdf exige sesión (401 sin autenticar)", async () => {
    await withServer(false, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/descargar-colobig-pdf`);
      expect(res.status).toBe(401);
    });
  });

  it("GET /descargar-colobig-pdf autenticado intenta servir el archivo (no 401)", async () => {
    await withServer(true, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/descargar-colobig-pdf`);
      // El archivo puede no existir en este entorno de test (404 de
      // sendFile), pero nunca debe ser 401 una vez autenticado.
      expect(res.status).not.toBe(401);
    });
  });
});
