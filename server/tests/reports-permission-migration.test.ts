import express from "express";
import * as http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etapa 3 del ABM de usuarios: los 17 informes de server/reports/routes.ts
 * pasan de requireRole(FINANCE_ROLES) / variantes .concat([...]) a un
 * resourceKey propio por informe ("api:reports:<nombre>") — mismo array de
 * roles que tenían antes, ahora controlable de forma independiente por
 * informe desde la pantalla de administración de permisos.
 */

vi.mock("../db", () => ({
  db: { execute: () => Promise.resolve({ rows: [] }) },
}));

const permissionsState = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("../permissions", () => ({
  hasPermission: (role: string, resourceKey: string) => permissionsState.granted.has(`${role}:${resourceKey}`),
}));

async function startApp(role: string) {
  const { registerReportsRoutes } = await import("../reports/routes");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "u1", username: "tester", email: "t@t.test", fullName: "Tester", role, department: null, phone: null, isActive: "true" } as any;
    req.isAuthenticated = () => true;
    next();
  });
  registerReportsRoutes(app);

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

const REPORT_ROUTES = [
  "/api/reports/estado-resultados",
  "/api/reports/kpis",
  "/api/reports/ocupacion",
  "/api/reports/ingresos",
  "/api/reports/costos",
  "/api/reports/proveedores",
  "/api/reports/comparativo",
  "/api/reports/spa",
  "/api/reports/spa/por-profesional",
  "/api/reports/events",
  "/api/reports/maintenance",
  "/api/reports/inventory",
  "/api/reports/restaurant-cmv",
  "/api/reports/housekeeping-productivity",
  "/api/reports/forecast",
  "/api/reports/export-pdf/estado-resultados",
  "/api/reports/export-excel/estado-resultados",
];

describe("reports routes — migrados a un resourceKey propio por informe", () => {
  let app: { baseUrl: string; close: () => Promise<void> };

  afterEach(async () => {
    await app?.close();
  });

  it("un rol sin ningún permiso de informes recibe 403 en los 17 endpoints", async () => {
    permissionsState.granted = new Set();
    app = await startApp("reception");
    for (const path of REPORT_ROUTES) {
      const response = await fetch(`${app.baseUrl}${path}`);
      expect(response.status, path).toBe(403);
    }
  });

  it("permite el informe de forecast a un rol con ese permiso puntual", async () => {
    permissionsState.granted = new Set(["jefe_recepcion:api:reports:forecast"]);
    app = await startApp("jefe_recepcion");
    const response = await fetch(`${app.baseUrl}/api/reports/forecast`);
    expect(response.status).toBe(200);
  });

  it("tener el permiso de un informe no da acceso a otro informe distinto", async () => {
    permissionsState.granted = new Set(["jefe_recepcion:api:reports:forecast"]);
    app = await startApp("jefe_recepcion");
    const response = await fetch(`${app.baseUrl}/api/reports/kpis`);
    expect(response.status).toBe(403);
  });
});
