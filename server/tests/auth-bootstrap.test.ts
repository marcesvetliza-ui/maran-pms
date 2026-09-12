import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAppEnv, resetAppEnvForTests } from "../app-env";

const state = vi.hoisted(() => ({
  users: [] as Array<{ id: string; username: string; password: string | null }>,
}));

vi.mock("../db", () => ({
  db: {
    select: () => ({ from: async () => state.users }),
    update: () => ({
      set: (patch: any) => ({
        where: async () => {
          state.users = state.users.map((u) => ({ ...u, ...patch }));
        },
      }),
    }),
    insert: () => ({
      values: async (row: any) => {
        state.users.push(row);
      },
    }),
  },
}));

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

describe("POST /api/auth/setup — bootstrap gestionado por secreto (Fase 9)", () => {
  beforeEach(() => {
    state.users = [];
    delete process.env.ADMIN_BOOTSTRAP_SECRET;
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetAppEnvForTests();
    delete process.env.ADMIN_BOOTSTRAP_SECRET;
  });

  it("responde 503 si no hay ADMIN_BOOTSTRAP_SECRET configurado, incluso en development", async () => {
    initAppEnv({ APP_ENV: "development", NODE_ENV: "development" });
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "cualquiera", newPassword: "unaClaveLarga1" }),
      });
      expect(res.status).toBe(503);
    });
  });

  it("responde 401 si el secreto no coincide", async () => {
    initAppEnv({ APP_ENV: "development", NODE_ENV: "development" });
    process.env.ADMIN_BOOTSTRAP_SECRET = "secreto-correcto";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "secreto-incorrecto", newPassword: "unaClaveLarga1" }),
      });
      expect(res.status).toBe(401);
    });
  });

  it("responde 400 si newPassword es demasiado corta", async () => {
    initAppEnv({ APP_ENV: "development", NODE_ENV: "development" });
    process.env.ADMIN_BOOTSTRAP_SECRET = "secreto-correcto";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "secreto-correcto", newPassword: "corta" }),
      });
      expect(res.status).toBe(400);
    });
  });

  it("404 en producción (APP_ENV=production), aunque el secreto sea correcto", async () => {
    initAppEnv({ APP_ENV: "production", NODE_ENV: "production" });
    process.env.ADMIN_BOOTSTRAP_SECRET = "secreto-correcto";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "secreto-correcto", newPassword: "unaClaveLarga1" }),
      });
      expect(res.status).toBe(404);
    });
  });

  it("404 en el ambiente piloto (APP_ENV=pilot), aunque el secreto sea correcto — no funciona en piloto", async () => {
    initAppEnv({ APP_ENV: "pilot", NODE_ENV: "production" });
    process.env.ADMIN_BOOTSTRAP_SECRET = "secreto-correcto";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "secreto-correcto", newPassword: "unaClaveLarga1" }),
      });
      expect(res.status).toBe(404);
    });
  });

  it("con secreto y password válidos crea el admin con la contraseña hasheada, sin devolverla", async () => {
    initAppEnv({ APP_ENV: "development", NODE_ENV: "development" });
    process.env.ADMIN_BOOTSTRAP_SECRET = "secreto-correcto";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "secreto-correcto", newPassword: "unaClaveLarga1" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(JSON.stringify(body)).not.toContain("unaClaveLarga1");
      expect(JSON.stringify(body)).not.toContain("secreto-correcto");
      expect(hashPassword).toHaveBeenCalledWith("unaClaveLarga1");
      expect(state.users[0].password).toBe("hashed:unaClaveLarga1");
    });
  });

  it("no permite reutilización: 400 si ya existe un usuario con contraseña", async () => {
    initAppEnv({ APP_ENV: "development", NODE_ENV: "development" });
    process.env.ADMIN_BOOTSTRAP_SECRET = "secreto-correcto";
    state.users = [{ id: "u1", username: "admin", password: "ya-tiene-password" }];
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "secreto-correcto", newPassword: "otraClaveLarga1" }),
      });
      expect(res.status).toBe(400);
    });
  });
});
