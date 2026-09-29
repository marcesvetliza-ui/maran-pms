import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 3 del ABM de usuarios: config de conexiones/mapeos de Channex pasa
 * de requireRole(CHANNEX_CONFIG_ROLES) a requirePermission("api:channex:config")
 * — resourceKey propio (no ligado al sidebar), mismo array de roles de antes.
 */

vi.mock("../db", () => ({
  db: {
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: "conn-1", label: "Booking.com" }]) }) }),
  },
}));

vi.mock("../channex/client", () => ({
  fetchChannexProperties: () => Promise.resolve([{ id: "prop-1", attributes: { title: "Hotel Demo" } }]),
}));

vi.mock("../channex/credentials", () => ({
  encryptChannexApiKey: (key: string) => `encrypted:${key}`,
}));

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));

async function startApp(role: string) {
  const { registerChannexRoutes } = await import("../routes/channex");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role, department: null, phone: null, isActive: "true" } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerChannexRoutes(app);

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

describe("channex config routes — migradas a requirePermission(api:channex:config)", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  beforeEach(() => {
    permissionsState.granted = new Set(["manager:api:channex:config"]);
  });

  afterEach(async () => {
    await app?.close();
  });

  it("POST permite a un rol con el permiso", async () => {
    app = await startApp("manager");
    const response = await fetch(`${app.baseUrl}/api/channex/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Booking.com", channexPropertyId: "prop-1", apiKey: "secret" }),
    });
    expect(response.status).toBe(201);
  });

  it("POST rechaza con 403 a un rol sin el permiso", async () => {
    app = await startApp("reception");
    const response = await fetch(`${app.baseUrl}/api/channex/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Booking.com", channexPropertyId: "prop-1", apiKey: "secret" }),
    });
    expect(response.status).toBe(403);
  });
});
