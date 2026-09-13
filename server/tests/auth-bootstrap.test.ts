import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

const state = vi.hoisted(() => ({
  users: [] as Array<{ id: string; username: string; password: string | null }>,
  failInsert: false,
}));

// Simula lo suficiente de la API de drizzle (select/insert/update, y
// db.transaction pasando un `tx` con la misma forma) para probar la lógica
// de la ruta sin una base real. La prueba de la condición de carrera real
// bajo el advisory lock vive aparte, en auth-bootstrap-concurrency.pg.test.ts
// (requiere PostgreSQL real — el advisory lock no tiene sentido contra un
// mock, solo contra conexiones concurrentes de verdad).
vi.mock("../db", () => {
  const queries = {
    select: () => ({ from: async () => state.users }),
    insert: () => ({
      values: async (values: any) => {
        if (state.failInsert) throw new Error("relation \"system_users\" violates constraint \"fake_pg_detail\"");
        state.users.push(values);
      },
    }),
    update: () => ({
      set: (values: any) => ({
        where: async () => {
          if (state.users[0]) Object.assign(state.users[0], values);
        },
      }),
    }),
    execute: async () => undefined,
  };
  return {
    db: {
      ...queries,
      transaction: async (cb: (tx: typeof queries) => Promise<any>) => cb(queries),
    },
  };
});

vi.mock("../auth", () => ({
  hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
}));

const { registerAuthBootstrapRoute } = await import("../auth-bootstrap");
const { hashPassword } = await import("../auth");

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  registerAuthBootstrapRoute(app);
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

function postSetup(baseUrl: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ORIGINAL_ENV = { ...process.env };
const VALID_SECRET = "correct-secret-with-20-plus-chars";

describe("registerAuthBootstrapRoute — sin contraseña hardcodeada (Fase 9)", () => {
  beforeEach(() => {
    state.users = [];
    state.failInsert = false;
    process.env.NODE_ENV = "development";
    process.env.ADMIN_BOOTSTRAP_ENABLED = "true";
    process.env.ADMIN_BOOTSTRAP_SECRET = VALID_SECRET;
    // isBootstrapEnabled() también consulta isProductionDataEnv()/isPilotEnv()
    // (APP_ENV, independiente de NODE_ENV) — hace falta inicializarlo en cada
    // test, salvo en los que verifican el veto por NODE_ENV=production, que
    // corta antes de llegar a consultarlo.
    initAppEnv({ APP_ENV: "development", NODE_ENV: "development" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    resetAppEnvForTests();
  });

  it("responde 404 si ADMIN_BOOTSTRAP_ENABLED no está en 'true', aunque NODE_ENV no sea production", async () => {
    delete process.env.ADMIN_BOOTSTRAP_ENABLED;
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: VALID_SECRET, newPassword: "longenough1" });
      expect(res.status).toBe(404);
    });
  });

  it("responde 404 con ADMIN_BOOTSTRAP_ENABLED en un valor que no es exactamente 'true'", async () => {
    process.env.ADMIN_BOOTSTRAP_ENABLED = "1";
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: VALID_SECRET, newPassword: "longenough1" });
      expect(res.status).toBe(404);
    });
  });

  it("responde 503 si no hay ADMIN_BOOTSTRAP_SECRET configurada", async () => {
    delete process.env.ADMIN_BOOTSTRAP_SECRET;
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: "anything", newPassword: "longenough1" });
      expect(res.status).toBe(503);
    });
  });

  it("responde 503 si el secreto configurado es más corto que el mínimo", async () => {
    process.env.ADMIN_BOOTSTRAP_SECRET = "short-secret";
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: "short-secret", newPassword: "longenough1" });
      expect(res.status).toBe(503);
    });
  });

  it("responde 401 si el secreto no coincide", async () => {
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: "wrong-secret", newPassword: "longenough1" });
      expect(res.status).toBe(401);
    });
  });

  it("responde 400 si newPassword es demasiado corta", async () => {
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: VALID_SECRET, newPassword: "short" });
      expect(res.status).toBe(400);
    });
  });

  it("404 en producción (NODE_ENV=production), aunque el flag y el secreto sean correctos", async () => {
    process.env.NODE_ENV = "production";
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: VALID_SECRET, newPassword: "longenough1" });
      expect(res.status).toBe(404);
    });
  });

  it("404 en producción (APP_ENV=production), aunque el flag y el secreto sean correctos", async () => {
    // APP_ENV=production exige NODE_ENV=production (ver resolveAppEnv) — acá
    // ambos coinciden con producción real, a diferencia del test de arriba
    // que verifica el veto por NODE_ENV solo.
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: VALID_SECRET, newPassword: "longenough1" });
      expect(res.status).toBe(404);
    });
  });

  it("404 en el ambiente piloto (APP_ENV=pilot), aunque el flag y el secreto sean correctos — no funciona en piloto", async () => {
    // APP_ENV=pilot también exige NODE_ENV=production (el piloto corre con
    // las mismas protecciones que producción real).
    initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: VALID_SECRET, newPassword: "longenough1" });
      expect(res.status).toBe(404);
    });
  });

  it("con secreto y password válidos crea el admin con la contraseña hasheada, sin devolverla", async () => {
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: VALID_SECRET, newPassword: "longenough1" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(JSON.stringify(body)).not.toContain("longenough1");
      expect(JSON.stringify(body)).not.toContain(VALID_SECRET);
      expect(hashPassword).toHaveBeenCalledWith("longenough1");
      expect(state.users[0]?.password).toBe("hashed:longenough1");
    });
  });

  it("actualiza el password cuando ya existe un admin con password null", async () => {
    state.users = [{ id: "existing-admin", username: "admin", password: null }];
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: VALID_SECRET, newPassword: "longenough1" });
      expect(res.status).toBe(200);
      expect(state.users[0]?.password).toBe("hashed:longenough1");
    });
  });

  it("no permite reutilización: 400 si ya existe un usuario con contraseña", async () => {
    state.users = [{ id: "existing", username: "admin", password: "already-set" }];
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: VALID_SECRET, newPassword: "longenough1" });
      expect(res.status).toBe(400);
    });
  });

  it("responde 500 con mensaje genérico y nunca expone el error real de la base", async () => {
    state.failInsert = true;
    await withServer(async (baseUrl) => {
      const res = await postSetup(baseUrl, { bootstrapSecret: VALID_SECRET, newPassword: "longenough1" });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(JSON.stringify(body)).not.toContain("fake_pg_detail");
      expect(JSON.stringify(body)).not.toContain("system_users");
    });
  });
});
