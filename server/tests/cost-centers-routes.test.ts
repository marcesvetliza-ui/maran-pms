import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 3 del ABM de usuarios: Centros de Costo es el primer módulo
 * migrado de requireRole(array hardcodeado) a requirePermission(resourceKey)
 * — reutiliza "sidebar:/admin/cost-centers", el mismo resourceKey que ya
 * controla la visibilidad de este módulo en el sidebar (antes tenían un
 * array de roles duplicado a mano en este archivo).
 */

const dbState = vi.hoisted(() => ({
  rows: [{ id: 1, nombre: "Eventos", activo: true }, { id: 2, nombre: "Legacy", activo: false }],
}));

vi.mock("../db", () => ({
  db: {
    select: () => ({ from: () => ({ orderBy: () => Promise.resolve(dbState.rows) }) }),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 3, nombre: "Nuevo", activo: true }]) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([{ id: 1, nombre: "Editado", activo: true }]) }) }) }),
  },
}));

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));

async function startApp(role: string) {
  const { registerCostCentersRoutes } = await import("../routes/cost-centers");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role, department: null, phone: null, isActive: "true" } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerCostCentersRoutes(app);

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

describe("cost-centers routes — migradas a requirePermission", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  beforeEach(() => {
    permissionsState.granted = new Set(["admin:sidebar:/admin/cost-centers", "resp_administracion:sidebar:/admin/cost-centers"]);
  });

  afterEach(async () => {
    await app?.close();
  });

  it("GET sin ?all devuelve solo los activos para cualquier rol autenticado, sin permiso especial", async () => {
    app = await startApp("reception");
    const response = await fetch(`${app.baseUrl}/api/cost-centers`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 1, nombre: "Eventos", activo: true }]);
  });

  it("GET ?all=1 permite a un rol con el permiso ver también los inactivos", async () => {
    app = await startApp("resp_administracion");
    const response = await fetch(`${app.baseUrl}/api/cost-centers?all=1`);
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(2);
  });

  it("GET ?all=1 rechaza con 403 a un rol sin el permiso", async () => {
    app = await startApp("reception");
    const response = await fetch(`${app.baseUrl}/api/cost-centers?all=1`);
    expect(response.status).toBe(403);
  });

  it("POST permite crear a un rol con el permiso", async () => {
    app = await startApp("admin");
    const response = await fetch(`${app.baseUrl}/api/cost-centers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Nuevo" }),
    });
    expect(response.status).toBe(201);
  });

  it("POST rechaza con 403 a un rol sin el permiso", async () => {
    app = await startApp("reception");
    const response = await fetch(`${app.baseUrl}/api/cost-centers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Nuevo" }),
    });
    expect(response.status).toBe(403);
  });

  it("PATCH rechaza con 403 a un rol sin el permiso", async () => {
    app = await startApp("housekeeping");
    const response = await fetch(`${app.baseUrl}/api/cost-centers/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: false }),
    });
    expect(response.status).toBe(403);
  });

  it("PATCH permite editar a un rol con el permiso", async () => {
    app = await startApp("admin");
    const response = await fetch(`${app.baseUrl}/api/cost-centers/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Editado" }),
    });
    expect(response.status).toBe(200);
  });
});
