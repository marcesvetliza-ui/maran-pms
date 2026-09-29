import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 3 del ABM de usuarios: requirePermission es el equivalente de
 * requireRole que consulta role_permissions (hasPermission) en vez de un
 * array de roles hardcodeado. Se prueba el middleware en aislamiento —
 * cada módulo migrado ya prueba su propio uso concreto por separado.
 */

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));

async function startApp(options: { authenticated?: boolean; pending2FA?: boolean; role?: string } = {}) {
  const { authenticated = true, pending2FA = false, role = "admin" } = options;
  const { requirePermission } = await import("../auth");
  const app = express();
  app.use((req, _res, next) => {
    req.isAuthenticated = () => authenticated;
    req.session = { pending2FA } as any;
    if (authenticated) {
      req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role, department: null, phone: null, isActive: "true" } as any;
    }
    next();
  });
  app.get("/protected", requirePermission("sidebar:/test-resource"), (_req, res) => res.json({ ok: true }));

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

describe("requirePermission middleware", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  beforeEach(() => {
    permissionsState.granted = new Set(["admin:sidebar:/test-resource"]);
  });

  afterEach(async () => {
    await app?.close();
  });

  it("deja pasar a un rol con el permiso otorgado", async () => {
    app = await startApp({ role: "admin" });
    const response = await fetch(`${app.baseUrl}/protected`);
    expect(response.status).toBe(200);
  });

  it("responde 403 a un rol sin el permiso", async () => {
    app = await startApp({ role: "reception" });
    const response = await fetch(`${app.baseUrl}/protected`);
    expect(response.status).toBe(403);
  });

  it("responde 401 si no está autenticado", async () => {
    app = await startApp({ authenticated: false });
    const response = await fetch(`${app.baseUrl}/protected`);
    expect(response.status).toBe(401);
  });

  it("responde 401 si el 2FA sigue pendiente, aunque el rol tenga el permiso", async () => {
    app = await startApp({ role: "admin", pending2FA: true });
    const response = await fetch(`${app.baseUrl}/protected`);
    expect(response.status).toBe(401);
  });
});
