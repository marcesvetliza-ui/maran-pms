import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 3 del ABM de usuarios: los 15 endpoints de escritura de
 * server/routes/inventory.ts (categorías, artículos, depósitos,
 * movimientos, transferencias, conteos) pasan de
 * requireRole(INVENTORY_WRITE_ROLES) a requirePermission("api:inventory:write")
 * — resourceKey propio, mismo array de roles de antes.
 */

vi.mock("../db-storage", () => ({
  storage: {
    createItemCategory: () => Promise.resolve({ id: "cat-1", name: "Bebidas" }),
  },
  getArgentinaToday: () => "2026-09-01",
}));

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));

async function startApp(role: string) {
  const { registerInventoryRoutes } = await import("../routes/inventory");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role, department: null, phone: null, isActive: "true" } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerInventoryRoutes(app);

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

describe("inventory write routes — migradas a requirePermission(api:inventory:write)", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  beforeEach(() => {
    permissionsState.granted = new Set(["restaurant:api:inventory:write"]);
  });

  afterEach(async () => {
    await app?.close();
  });

  it("permite a un rol con el permiso", async () => {
    app = await startApp("restaurant");
    const response = await fetch(`${app.baseUrl}/api/inventory/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bebidas" }),
    });
    expect(response.status).toBe(201);
  });

  it("rechaza con 403 a un rol sin el permiso", async () => {
    app = await startApp("reception");
    const response = await fetch(`${app.baseUrl}/api/inventory/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bebidas" }),
    });
    expect(response.status).toBe(403);
  });
});
