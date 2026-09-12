import express from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDebugAssetRoutes } from "../debug-assets-routes";

const __dirname = dirname(fileURLToPath(import.meta.url));

// A propósito NO se mockea "../auth": este test tiene que confirmar que
// requireAuth (real) efectivamente protege estas dos rutas — antes estaban
// registradas sin ningún guard.
// "../db" sí se mockea: solo hace falta para que "../auth" pueda importarse
// en este sandbox sin DATABASE_URL — requireAuth no lo usa.
vi.mock("../db", () => ({
  db: {},
  pool: { query: vi.fn(), connect: vi.fn() },
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

  it("GET /api/debug/assets responde 200 autenticado, con el diagnóstico real (sin mockear assetPath)", async () => {
    await withServer(true, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/debug/assets`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ cwd: expect.any(String), NODE_ENV: expect.anything() });
    });
  });

  it("GET /descargar-colobig-pdf exige sesión (401 sin autenticar)", async () => {
    await withServer(false, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/descargar-colobig-pdf`);
      expect(res.status).toBe(401);
    });
  });

  it("GET /descargar-colobig-pdf autenticado sirve el PDF real (200, no un resultado ambiguo)", async () => {
    // El archivo vive en attached_assets/ dentro del repo (confirmado antes
    // de escribir esta aserción) — un resultado autenticado siempre debe
    // ser 200 en este checkout, no "cualquier cosa que no sea 401".
    await withServer(true, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/descargar-colobig-pdf`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
    });
  });

  it("server/index.ts registra registerDebugAssetRoutes después de setupAuth, en el orden real de arranque", () => {
    const source = readFileSync(join(__dirname, "..", "index.ts"), "utf8");
    const setupAuthIndex = source.indexOf("setupAuth(app)");
    const registerIndex = source.indexOf("registerDebugAssetRoutes(app)");
    expect(setupAuthIndex).toBeGreaterThan(-1);
    expect(registerIndex).toBeGreaterThan(setupAuthIndex);
    // Ninguna de las dos rutas debe volver a quedar definida inline, sin
    // pasar por requireAuth, directamente en server/index.ts.
    expect(source).not.toMatch(/app\.get\(\s*["']\/descargar-colobig-pdf["']\s*,\s*\(_req/);
    expect(source).not.toMatch(/app\.get\(\s*["']\/api\/debug\/assets["']\s*,\s*\(_req/);
  });
});
