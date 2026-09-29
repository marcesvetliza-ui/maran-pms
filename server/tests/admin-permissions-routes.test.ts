import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 2 del ABM de usuarios: endpoints admin-only que envuelven
 * grantPermission/revokePermission (ya probados en permissions.test.ts) con
 * validación de entrada, auditoría y el listado combinado para la matriz.
 */

const auditMock = vi.fn();
vi.mock("../audit", () => ({ audit: (...args: unknown[]) => auditMock(...args) }));

const dbState = vi.hoisted(() => ({ rows: [] as Array<{ role: string; resourceKey: string }> }));

vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => Promise.resolve(dbState.rows),
    }),
    insert: () => ({
      values: (row: { role: string; resourceKey: string }) => ({
        onConflictDoNothing: () => {
          if (!dbState.rows.some((r) => r.role === row.role && r.resourceKey === row.resourceKey)) {
            dbState.rows.push(row);
          }
          return Promise.resolve();
        },
      }),
    }),
    delete: () => ({
      where: () => {
        // El helper real filtra por (role, resourceKey); acá alcanza con
        // saber que revoke() pasa por este camino — el filtrado real ya
        // está cubierto por permissions.test.ts. Se limpia todo lo del rol
        // objetivo consultado en el propio test.
        return Promise.resolve();
      },
    }),
  },
}));

async function startApp(role = "admin") {
  const { registerAdminPermissionsRoutes } = await import("../routes/admin-permissions");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: "user-1",
      username: "tester",
      email: "tester@example.test",
      fullName: "Tester",
      role,
      department: "administracion",
      phone: null,
      isActive: "true",
    } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerAdminPermissionsRoutes(app);

  return await new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((res, rej) => {
          server.close((error) => error ? rej(error) : res());
        }),
      });
    });
  });
}

describe("admin role-permissions routes", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows = [];
  });

  afterEach(async () => {
    await app?.close();
  });

  it("GET devuelve roles, catálogo con labels y los grants actuales", async () => {
    dbState.rows = [{ role: "reception", resourceKey: "sidebar:/reservations" }];
    app = await startApp();

    const response = await fetch(`${app.baseUrl}/api/admin/role-permissions`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.roles).toContain("admin");
    expect(body.catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceKey: "sidebar:/reservations", label: "Reservas", section: "PMS — Recepción" }),
      ]),
    );
    expect(body.grants).toEqual([{ role: "reception", resourceKey: "sidebar:/reservations" }]);
  });

  it("POST /grant agrega el permiso y audita el cambio", async () => {
    app = await startApp();

    const response = await fetch(`${app.baseUrl}/api/admin/role-permissions/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reception", resourceKey: "sidebar:/reviews" }),
    });

    expect(response.status).toBe(204);
    expect(dbState.rows).toContainEqual({ role: "reception", resourceKey: "sidebar:/reviews" });
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(), "update", "permisos",
      expect.stringContaining("reception"),
      expect.objectContaining({ entityType: "role_permission", entityId: "reception:sidebar:/reviews" }),
    );
  });

  it("POST /revoke audita el cambio", async () => {
    dbState.rows = [{ role: "reception", resourceKey: "sidebar:/reviews" }];
    app = await startApp();

    const response = await fetch(`${app.baseUrl}/api/admin/role-permissions/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reception", resourceKey: "sidebar:/reviews" }),
    });

    expect(response.status).toBe(204);
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(), "update", "permisos",
      expect.stringContaining("revocado"),
      expect.objectContaining({ entityType: "role_permission", entityId: "reception:sidebar:/reviews" }),
    );
  });

  it("rechaza un rol desconocido con 400 y sin tocar la base", async () => {
    app = await startApp();

    const response = await fetch(`${app.baseUrl}/api/admin/role-permissions/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "gobernanta", resourceKey: "sidebar:/reviews" }),
    });

    expect(response.status).toBe(400);
    expect(dbState.rows).toEqual([]);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rechaza un resourceKey desconocido con 400", async () => {
    app = await startApp();

    const response = await fetch(`${app.baseUrl}/api/admin/role-permissions/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reception", resourceKey: "sidebar:/no-existe" }),
    });

    expect(response.status).toBe(400);
    expect(dbState.rows).toEqual([]);
  });

  it("bloquea a un rol no admin con 403 en las 3 rutas", async () => {
    app = await startApp("reception");

    const getResponse = await fetch(`${app.baseUrl}/api/admin/role-permissions`);
    expect(getResponse.status).toBe(403);

    const grantResponse = await fetch(`${app.baseUrl}/api/admin/role-permissions/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reception", resourceKey: "sidebar:/reviews" }),
    });
    expect(grantResponse.status).toBe(403);

    const revokeResponse = await fetch(`${app.baseUrl}/api/admin/role-permissions/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reception", resourceKey: "sidebar:/reviews" }),
    });
    expect(revokeResponse.status).toBe(403);
  });
});
