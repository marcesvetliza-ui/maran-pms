import express from "express";
import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESERVATION_CHARGE_VOID_ROLES,
  canVoidReservationCharge,
} from "@shared/reservationChargePermissions";

const connect = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ db: {}, pool: { connect } }));

// Deliberately use the real authentication/role middleware, not an allow-all mock.
const { requireAuth, requireRole } = await import("../auth");
const { registerManualChargeActionRoutes } = await import("../routes/manual-charge-actions");
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.isAuthenticated = () => req.header("x-test-auth") !== "false";
    req.user = { id: "test-actor", username: "test-actor", role: req.header("x-test-role") };
    next();
  });
  registerManualChargeActionRoutes(app);
  // Same canonical gate used by the legacy charge-annulment endpoint.
  app.patch("/legacy-charge-void-gate", requireAuth, requireRole([...RESERVATION_CHARGE_VOID_ROLES]), (_req, res) => {
    res.json({ authorized: true });
  });
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  connect.mockReset();
  connect.mockRejectedValue(new Error("Test database deliberately unavailable"));
});

async function request(path: string, method: string, role?: string, authenticated = true) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-test-role": role } : {}),
      "x-test-auth": String(authenticated),
    },
    ...(method === "GET" ? {} : { body: JSON.stringify({}) }),
  });
  return { status: response.status, body: await response.json() };
}

describe("reservation charge annulment permissions", () => {
  it.each(["admin", "manager", "reception"])(
    "allows %s through the charge gate while still requiring a reason", async role => {
      expect(canVoidReservationCharge(role)).toBe(true);
      expect((await request("/legacy-charge-void-gate", "PATCH", role)).status).toBe(200);
      const result = await request("/api/reservations/r/manual-charges/c/anular", "POST", role);
      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(/motivo/i);
      expect(connect).not.toHaveBeenCalled();
    },
  );
  it("limits Reception Head annulment to restaurant room charges", async () => {
    expect(canVoidReservationCharge("jefe_recepcion")).toBe(false);
    expect(canVoidReservationCharge("jefe_recepcion", "manual")).toBe(false);
    expect(canVoidReservationCharge("jefe_recepcion", "restaurant")).toBe(true);
    expect((await request("/api/reservations/r/manual-charges/c/anular", "POST", "jefe_recepcion")).status).toBe(403);
    expect(connect).not.toHaveBeenCalled();
  });
  it.each(["restaurant", "housekeeping", "maintenance", "resp_administracion", "responsable_area", undefined])(
    "rejects unrelated or missing role %s before touching the database", async role => {
      expect(canVoidReservationCharge(role)).toBe(false);
      expect((await request("/legacy-charge-void-gate", "PATCH", role)).status).toBe(403);
      expect((await request("/api/reservations/r/manual-charges/c/anular", "POST", role)).status).toBe(403);
      expect((await request("/api/reservations/r/manual-charge-actions", "GET", role)).status).toBe(403);
      expect(connect).not.toHaveBeenCalled();
    },
  );
  it("rejects unsigned requests even when they claim an authorized role", async () => {
    expect((await request("/api/reservations/r/manual-charges/c/anular", "POST", "jefe_recepcion", false)).status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });
  it("preserves the published Reception Head manual-edit gate without performing a price edit", async () => {
    expect((await request("/api/reservations/r/manual-charges/c", "PATCH", "jefe_recepcion")).status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });
  it("allows Reception Head to request eligibility but fails closed without storage", async () => {
    const result = await request("/api/reservations/r/manual-charge-actions", "GET", "jefe_recepcion");
    expect(result.status).toBe(500);
    expect(connect).toHaveBeenCalledOnce();
  });
});
