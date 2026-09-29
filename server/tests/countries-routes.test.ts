import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 3 del ABM de usuarios: POST/PATCH/DELETE de Países (ARCA) pasan de
 * requireRole(["admin"]) a requirePermission("sidebar:/admin/countries") —
 * mismo resourceKey que el ítem del sidebar, mismo rol único ["admin"]. El
 * GET de listado completo (antes requireRole(["admin","manager"])) pasa a
 * su propio resourceKey "api:admin:countries-list" — no reusa el del
 * sidebar porque ese es admin-only y le hubiera sacado acceso a manager.
 */

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => Promise.resolve([]) }),
        orderBy: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: "AR", name: "Argentina" }]) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([{ id: "AR", name: "Editado" }]) }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  },
}));

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));

async function startApp(role: string) {
  const { registerCountriesRoutes } = await import("../routes/countries");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role, department: null, phone: null, isActive: "true" } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerCountriesRoutes(app);

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

describe("countries routes — POST/PATCH/DELETE migradas a requirePermission", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  beforeEach(() => {
    permissionsState.granted = new Set([
      "admin:sidebar:/admin/countries",
      "manager:api:admin:countries-list",
    ]);
  });

  afterEach(async () => {
    await app?.close();
  });

  it("GET /api/admin/countries permite a manager (tiene api:admin:countries-list)", async () => {
    app = await startApp("manager");
    const response = await fetch(`${app.baseUrl}/api/admin/countries`);
    expect(response.status).toBe(200);
  });

  it("GET /api/admin/countries rechaza con 403 a un rol sin el permiso", async () => {
    app = await startApp("reception");
    const response = await fetch(`${app.baseUrl}/api/admin/countries`);
    expect(response.status).toBe(403);
  });

  it("POST rechaza con 403 a manager (ya no alcanza con requireRole, ahora exige el permiso admin-only)", async () => {
    app = await startApp("manager");
    const response = await fetch(`${app.baseUrl}/api/admin/countries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "AR", name: "Argentina", afipCode: "200" }),
    });
    expect(response.status).toBe(403);
  });

  it("POST permite a admin (tiene el permiso)", async () => {
    app = await startApp("admin");
    const response = await fetch(`${app.baseUrl}/api/admin/countries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Argentina", afipCode: 200 }),
    });
    expect(response.status).toBe(201);
  });

  it("PATCH rechaza con 403 sin el permiso", async () => {
    app = await startApp("reception");
    const response = await fetch(`${app.baseUrl}/api/admin/countries/AR`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Editado" }),
    });
    expect(response.status).toBe(403);
  });

  it("DELETE rechaza con 403 sin el permiso", async () => {
    app = await startApp("reception");
    const response = await fetch(`${app.baseUrl}/api/admin/countries/AR`, { method: "DELETE" });
    expect(response.status).toBe(403);
  });
});
