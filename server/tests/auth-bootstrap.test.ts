import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  users: [] as Array<{ id: string; username: string; password: string | null }>,
}));

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: async () => state.users,
    }),
    insert: () => ({
      values: async (values: any) => {
        state.users.push(values);
      },
    }),
    update: () => ({
      set: (values: any) => ({
        where: async () => {
          Object.assign(state.users[0] ?? {}, values);
        },
      }),
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

const ORIGINAL_ENV = { ...process.env };

describe("registerAuthBootstrapRoute — sin contraseña hardcodeada", () => {
  beforeEach(() => {
    state.users = [];
    process.env.NODE_ENV = "development";
    process.env.ADMIN_BOOTSTRAP_SECRET = "correct-secret";
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("responde 503 si no hay ADMIN_BOOTSTRAP_SECRET configurada", async () => {
    delete process.env.ADMIN_BOOTSTRAP_SECRET;
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "anything", newPassword: "longenough1" }),
      });
      expect(res.status).toBe(503);
    });
  });

  it("responde 401 si el secreto no coincide", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "wrong-secret", newPassword: "longenough1" }),
      });
      expect(res.status).toBe(401);
    });
  });

  it("responde 400 si newPassword es demasiado corta", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "correct-secret", newPassword: "short" }),
      });
      expect(res.status).toBe(400);
    });
  });

  it("404 en producción, aunque el secreto sea correcto", async () => {
    process.env.NODE_ENV = "production";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "correct-secret", newPassword: "longenough1" }),
      });
      expect(res.status).toBe(404);
    });
  });

  it("con secreto y password válidos crea el admin con la contraseña hasheada, sin devolverla", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "correct-secret", newPassword: "longenough1" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(JSON.stringify(body)).not.toContain("longenough1");
      expect(JSON.stringify(body)).not.toContain("correct-secret");
      expect(hashPassword).toHaveBeenCalledWith("longenough1");
      expect(state.users[0]?.password).toBe("hashed:longenough1");
    });
  });

  it("no permite reutilización: 400 si ya existe un usuario con contraseña", async () => {
    state.users = [{ id: "existing", username: "admin", password: "already-set" }];
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapSecret: "correct-secret", newPassword: "longenough1" }),
      });
      expect(res.status).toBe(400);
    });
  });
});
