import express from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDebugAssetsApiRoute, registerDebugPdfDownloadRoute } from "../debug-assets-routes";
import { authorizePilotExternalRole, PILOT_EXTERNAL_ROLE } from "../pilot-external-role";

const __dirname = dirname(fileURLToPath(import.meta.url));

// A propósito NO se mockea "../auth" ni "../pilot-external-role": este test
// tiene que confirmar que requireAuth y authorizePilotExternalRole (reales)
// efectivamente protegen estas dos rutas — antes de la Fase 9 (ronda 1)
// estaban registradas sin ningún guard, y la ronda 1 dejó pasar al rol
// piloto_externo igual (hallazgo de esta ronda 2). Tampoco se mockea
// "../utils/assetPath": /api/debug/assets se verifica con su diagnóstico
// real, no con un doble.
// "../db" sí se mockea: solo hace falta para que "../auth" pueda importarse
// en este sandbox sin DATABASE_URL — requireAuth no lo usa.
vi.mock("../db", () => ({
  db: {},
  pool: { query: vi.fn(), connect: vi.fn() },
}));

function fakeSession(role: string | null) {
  return (req: any, _res: any, next: any) => {
    req.isAuthenticated = () => role !== null;
    if (role !== null) {
      req.user = { id: "u1", username: "u", email: "u@u.com", fullName: "U", role, department: null, phone: null, isActive: "true" };
    }
    next();
  };
}

async function withServer<T>(app: express.Express, run: (baseUrl: string) => Promise<T>): Promise<T> {
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

describe("GET /api/debug/assets — Fase 9 (ronda 2): cubierta por authorizePilotExternalRole", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Réplica exacta del orden real en server/routes.ts: el middleware de
  // Fase 6 montado en "/api", y la ruta registrada DESPUÉS de él.
  function buildApp(role: string | null) {
    const app = express();
    app.use(fakeSession(role));
    app.use("/api", authorizePilotExternalRole);
    registerDebugAssetsApiRoute(app);
    return app;
  }

  it("sin sesión → 401", async () => {
    await withServer(buildApp(null), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/debug/assets`);
      expect(res.status).toBe(401);
    });
  });

  it("con rol interno normal (reception) → 200, con el diagnóstico real (sin mockear assetPath)", async () => {
    await withServer(buildApp("reception"), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/debug/assets`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ cwd: expect.any(String), NODE_ENV: expect.anything() });
    });
  });

  it("con rol piloto_externo → 403 (antes se colaba por estar registrada antes de registerRoutes)", async () => {
    await withServer(buildApp(PILOT_EXTERNAL_ROLE), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/debug/assets`);
      expect(res.status).toBe(403);
    });
  });
});

describe("GET /descargar-colobig-pdf — Fase 9 (ronda 2): chequeo de rol inline", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // No vive bajo /api: authorizePilotExternalRole nunca la cubriría sin
  // importar dónde se registre, así que este test NO monta ese middleware
  // — confirma específicamente el chequeo inline de la propia ruta.
  function buildApp(role: string | null) {
    const app = express();
    app.use(fakeSession(role));
    registerDebugPdfDownloadRoute(app);
    return app;
  }

  it("sin sesión → 401", async () => {
    await withServer(buildApp(null), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/descargar-colobig-pdf`);
      expect(res.status).toBe(401);
    });
  });

  it("con rol interno normal (reception) sirve el PDF real (200, no un resultado ambiguo)", async () => {
    // El archivo vive en attached_assets/ dentro del repo (confirmado antes
    // de escribir esta aserción) — un resultado autenticado con rol normal
    // siempre debe ser 200 en este checkout, no "cualquier cosa que no sea
    // 401/403".
    await withServer(buildApp("reception"), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/descargar-colobig-pdf`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
    });
  });

  it("con rol piloto_externo → 403 (el caso que la ronda 1 dejaba pasar)", async () => {
    await withServer(buildApp(PILOT_EXTERNAL_ROLE), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/descargar-colobig-pdf`);
      expect(res.status).toBe(403);
    });
  });
});

describe("server/index.ts y server/routes.ts registran las rutas en el orden real de arranque", () => {
  it("registerDebugPdfDownloadRoute se registra en index.ts después de setupAuth, y ninguna ruta queda inline sin guard", () => {
    const source = readFileSync(join(__dirname, "..", "index.ts"), "utf8");
    const setupAuthIndex = source.indexOf("setupAuth(app)");
    const registerIndex = source.indexOf("registerDebugPdfDownloadRoute(app)");
    expect(setupAuthIndex).toBeGreaterThan(-1);
    expect(registerIndex).toBeGreaterThan(setupAuthIndex);
    // Ninguna de las dos rutas debe volver a quedar definida inline, sin
    // pasar por requireAuth, directamente en server/index.ts.
    expect(source).not.toMatch(/app\.get\(\s*["']\/descargar-colobig-pdf["']\s*,\s*\(_req/);
    expect(source).not.toMatch(/app\.get\(\s*["']\/api\/debug\/assets["']\s*,\s*\(_req/);
  });

  it("registerDebugAssetsApiRoute se registra en routes.ts después de authorizePilotExternalRole", () => {
    const source = readFileSync(join(__dirname, "..", "routes.ts"), "utf8");
    const middlewareIndex = source.indexOf('app.use("/api", authorizePilotExternalRole)');
    const registerIndex = source.indexOf("registerDebugAssetsApiRoute(app)");
    expect(middlewareIndex).toBeGreaterThan(-1);
    expect(registerIndex).toBeGreaterThan(middlewareIndex);
  });
});
