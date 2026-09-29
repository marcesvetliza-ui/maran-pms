import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 3 del ABM de usuarios: dos resourceKeys propios en server/routes/rooms.ts
 * — "api:rooms:write" (antes ROOMS_WRITE_ROLES) y "api:rates:write" (antes
 * RATES_WRITE_ROLES) — mismos arrays de roles de antes. (El tercer array de
 * este archivo, ROOM_TYPE_ADMIN_ROLES, reusa el resourceKey exacto del
 * sidebar y se prueba junto con el resto de room-type-integrity-routes.test.ts.)
 */

vi.mock("../db-storage", () => ({
  storage: {
    createRoom: () => Promise.resolve({ id: "room-1", number: "101" }),
    createRatePlan: () => Promise.resolve({ id: "rate-1", name: "Temporada Alta" }),
  },
  getArgentinaToday: () => "2026-09-01",
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));

async function startApp(role: string) {
  const { registerRoomsRoutes } = await import("../routes/rooms");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role, department: null, phone: null, isActive: "true" } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerRoomsRoutes(app);

  return await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((res, rej) => server.close((error) => error ? rej(error) : res())),
      });
    });
  });
}

describe("rooms routes — migradas a requirePermission", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  afterEach(async () => {
    await app?.close();
  });

  describe("api:rooms:write", () => {
    beforeEach(() => {
      permissionsState.granted = new Set(["resp_deposito:api:rooms:write"]);
    });

    it("permite a un rol con el permiso", async () => {
      app = await startApp("resp_deposito");
      const response = await fetch(`${app.baseUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: "101" }),
      });
      expect(response.status).toBe(201);
    });

    it("rechaza con 403 a un rol sin el permiso", async () => {
      app = await startApp("spa");
      const response = await fetch(`${app.baseUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: "101" }),
      });
      expect(response.status).toBe(403);
    });
  });

  describe("api:rates:write", () => {
    beforeEach(() => {
      permissionsState.granted = new Set(["jefe_recepcion:api:rates:write"]);
    });

    it("permite a jefe_recepcion (pedido explícito del hotel)", async () => {
      app = await startApp("jefe_recepcion");
      const response = await fetch(`${app.baseUrl}/api/rate-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Temporada Alta" }),
      });
      expect(response.status).toBe(201);
    });

    it("rechaza con 403 a un rol sin el permiso", async () => {
      app = await startApp("reception");
      const response = await fetch(`${app.baseUrl}/api/rate-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Temporada Alta" }),
      });
      expect(response.status).toBe(403);
    });
  });
});
