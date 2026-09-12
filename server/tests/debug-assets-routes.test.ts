import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDebugAssetsApiRoute, registerDebugPdfDownloadRoute } from "../debug-assets-routes";
import { authorizePilotExternalRole, PILOT_EXTERNAL_ROLE } from "../pilot-external-role";

// A propósito NO se mockea "../auth" ni "../pilot-external-role": este test
// tiene que confirmar que requireAuth y authorizePilotExternalRole (reales)
// efectivamente protegen estas dos rutas — antes de la Fase 9 (ronda 1)
// estaban registradas sin ningún guard, y la ronda 1 dejó pasar al rol
// piloto_externo igual (hallazgo de esta ronda 2).
// "../db" sí se mockea: solo hace falta para que "../auth" pueda importarse
// en este sandbox sin DATABASE_URL — requireAuth no lo usa.
vi.mock("../db", () => ({
  db: {},
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock("../utils/assetPath", () => ({
  assetPathDiagnostic: () => ({ ok: true }),
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

  it("con rol interno normal (reception) → 200, conserva el comportamiento actual", async () => {
    await withServer(buildApp("reception"), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/debug/assets`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
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

  it("con rol interno normal (reception) → ni 401 ni 403", async () => {
    await withServer(buildApp("reception"), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/descargar-colobig-pdf`);
      // El archivo puede no existir en este entorno de test (404 de
      // sendFile), pero nunca debe ser 401 ni 403 con un rol normal.
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  it("con rol piloto_externo → 403 (el caso que la ronda 1 dejaba pasar)", async () => {
    await withServer(buildApp(PILOT_EXTERNAL_ROLE), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/descargar-colobig-pdf`);
      expect(res.status).toBe(403);
    });
  });
});
