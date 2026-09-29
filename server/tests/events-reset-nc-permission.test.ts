import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 3 del ABM de usuarios: los 2 endpoints de reset de NC de
 * server/routes/events.ts (evento y mesa) pasan de un chequeo inline
 * `role !== "admin"` a hasPermission(role, "api:events:reset-nc") — mismo
 * comportamiento (admin-only), ahora administrable desde la pantalla de
 * permisos.
 */

vi.mock("../db", () => ({
  db: { execute: () => Promise.resolve({ rows: [] }) },
}));
vi.mock("../db-storage", () => ({
  storage: {},
  getArgentinaToday: () => "2026-09-01",
}));

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));

async function startApp(role: string) {
  const { registerEventsRoutes } = await import("../routes/events");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role, department: null, phone: null, isActive: "true" } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerEventsRoutes(app);

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

describe("events reset-nc routes — migradas a hasPermission(api:events:reset-nc)", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  beforeEach(() => {
    permissionsState.granted = new Set(["admin:api:events:reset-nc"]);
  });

  afterEach(async () => {
    await app?.close();
  });

  it("PATCH reset-nc de evento rechaza con 403 a un rol sin el permiso", async () => {
    app = await startApp("manager");
    const response = await fetch(`${app.baseUrl}/api/events/event-1/reset-nc`, { method: "PATCH" });
    expect(response.status).toBe(403);
  });

  it("PATCH reset-nc de mesa rechaza con 403 a un rol sin el permiso", async () => {
    app = await startApp("manager");
    const response = await fetch(`${app.baseUrl}/api/events/event-1/tables/table-1/reset-nc`, { method: "PATCH" });
    expect(response.status).toBe(403);
  });
});
