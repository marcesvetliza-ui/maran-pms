/**
 * Group-folio reversal guard
 *
 * The reverse-transfer-charge route for group folios lives at:
 *   POST /api/groups/:groupId/reverse-transfer-charge
 *
 * This suite verifies that a missing (or empty/null) chargeId in the request
 * body is rejected immediately with a 400 — before any DB or storage call —
 * so a frontend bug never produces a confusing downstream error.
 *
 * Guard tested (see server/routes/groups.ts):
 *   if (!chargeId) → 400 "Se requiere chargeId"
 */

import express from "express";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as http from "node:http";

// ─── Module mocks (must be declared before dynamic imports) ──────────────────

// Mock db — controls raw SQL / select results.
const mockDbSelect = vi.fn();
vi.mock("../db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: () => [] }) }),
    insert: () => ({ values: () => ({ returning: () => [] }) }),
    delete: () => ({ where: () => ({ rowCount: 1 }) }),
  },
  pool: { query: vi.fn() },
}));

// Mock storage
const mockStorage = {
  getGroup: vi.fn(),
  getGroups: vi.fn().mockResolvedValue([]),
  getGroupCharges: vi.fn().mockResolvedValue([]),
  createGroupCharge: vi.fn(),
  deleteGroupCharge: vi.fn().mockResolvedValue(true),
  transferChargeToGroup: vi.fn(),
  deleteCharge: vi.fn(),
  getGroupPayments: vi.fn().mockResolvedValue([]),
  createGroupPayment: vi.fn(),
  distributeGroupPayment: vi.fn().mockResolvedValue({}),
  getArgentinaToday: vi.fn().mockReturnValue("2026-08-03"),
  getReservation: vi.fn(),
  getReservations: vi.fn().mockResolvedValue([]),
  updateReservation: vi.fn(),
  getCharge: vi.fn(),
  getCharges: vi.fn().mockResolvedValue([]),
  getPayments: vi.fn().mockResolvedValue([]),
  createPayment: vi.fn(),
  getOrCreateFolio: vi.fn().mockResolvedValue({ id: "folio-1" }),
  addFolioAdjustment: vi.fn().mockResolvedValue(undefined),
  registerCashMovement: vi.fn().mockResolvedValue(undefined),
  addFolioPayment: vi.fn().mockResolvedValue(undefined),
  addFolioCharge: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../db-storage", () => ({
  storage: mockStorage,
  getArgentinaToday: () => "2026-08-03",
}));

// Auth — pass every request through.
vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));

// Audit — no-op.
vi.mock("../audit", () => ({ audit: vi.fn() }));

// Billing / PDF — not exercised by this path.
vi.mock("../billing/invoiceService", () => ({ emitirFactura: vi.fn() }));
vi.mock("../billing/invoicePdf", () => ({ generarResumenCuentaPDF: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn().mockResolvedValue({ arcaAmbiente: "ficticio" }),
}));
vi.mock("../email-service", () => ({
  sendCheckoutEmail: vi.fn(),
  sendConfirmationEmail: vi.fn(),
}));
vi.mock("../utils/assetPath", () => ({
  assetPath: (p: string) => p,
}));

// PDFKit — stub to avoid binary load.
vi.mock("pdfkit", () => ({
  default: class PDFDocument {
    pipe() { return this; }
    end() {}
    on() { return this; }
    text() { return this; }
    moveDown() { return this; }
    fontSize() { return this; }
    font() { return this; }
    fillColor() { return this; }
    image() { return this; }
    rect() { return this; }
    stroke() { return this; }
    save() { return this; }
    restore() { return this; }
    addPage() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    fillAndStroke() { return this; }
    translate() { return this; }
    dash() { return this; }
    undash() { return this; }
    lineWidth() { return this; }
    lineCap() { return this; }
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function startApp() {
  const { registerGroupsRoutes } = await import("../routes/groups");
  const app = express();
  app.use(express.json());
  registerGroupsRoutes(app);

  return new Promise<{ baseUrl: string; close: () => void }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

async function postGroupReversal(
  baseUrl: string,
  groupId: string,
  body: Record<string, unknown>
) {
  const res = await fetch(
    `${baseUrl}/api/groups/${groupId}/reverse-transfer-charge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return { status: res.status, body: (await res.json()) as any };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const GROUP_ID = "group-abc-123";

const ACTIVE_GROUP_CHARGE = {
  id: "gc-001",
  groupId: GROUP_ID,
  description: "Cargo de transferencia SPA → Grupo",
  amount: "150.00",
  date: "2026-08-01",
  category: "transfer_in",
  billingTarget: "group",
  reservationId: "res-001",
  createdBy: "operador",
  createdAt: new Date("2026-08-01T10:00:00Z"),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("group-folio reversal guard — POST /api/groups/:groupId/reverse-transfer-charge", () => {
  let baseUrl: string;
  let close: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: group exists.
    mockStorage.getGroup.mockResolvedValue({
      id: GROUP_ID,
      name: "Grupo Test",
      reservations: [],
    });

    const ctx = await startApp();
    baseUrl = ctx.baseUrl;
    close = ctx.close;
  });

  // ── Guard: chargeId missing from request body ─────────────────────────────

  it("returns 400 with a clear message when chargeId is absent from the request body", async () => {
    // No storage calls should be made — the route must reject before touching the DB.
    const { status, body } = await postGroupReversal(baseUrl, GROUP_ID, {});

    expect(status).toBe(400);
    expect(body.error).toMatch(/chargeId|se requiere/i);

    // Confirm the DB/storage was never consulted
    expect(mockStorage.getGroup).not.toHaveBeenCalled();
    expect(mockStorage.deleteGroupCharge).not.toHaveBeenCalled();

    close();
  });

  it("returns 400 when chargeId is explicitly null", async () => {
    const { status, body } = await postGroupReversal(baseUrl, GROUP_ID, { chargeId: null });

    expect(status).toBe(400);
    expect(body.error).toMatch(/chargeId|se requiere/i);

    expect(mockStorage.deleteGroupCharge).not.toHaveBeenCalled();

    close();
  });

  it("returns 400 when chargeId is an empty string", async () => {
    const { status, body } = await postGroupReversal(baseUrl, GROUP_ID, { chargeId: "" });

    expect(status).toBe(400);
    expect(body.error).toMatch(/chargeId|se requiere/i);

    expect(mockStorage.deleteGroupCharge).not.toHaveBeenCalled();

    close();
  });

  // ── 404 when group does not exist ─────────────────────────────────────────

  it("returns 404 when the group does not exist", async () => {
    mockStorage.getGroup.mockResolvedValue(null);

    const { status, body } = await postGroupReversal(baseUrl, "nonexistent-group", {
      chargeId: ACTIVE_GROUP_CHARGE.id,
    });

    expect(status).toBe(404);
    expect(body.error).toMatch(/grupo no encontrado/i);

    close();
  });

  // ── 404 when charge does not exist ───────────────────────────────────────

  it("returns 404 when the charge does not exist", async () => {
    // db.select().from().where().limit() returns empty array → charge not found
    const { status, body } = await postGroupReversal(baseUrl, GROUP_ID, {
      chargeId: "nonexistent-charge",
    });

    expect(status).toBe(404);
    expect(body.error).toMatch(/cargo no encontrado/i);

    expect(mockStorage.deleteGroupCharge).not.toHaveBeenCalled();

    close();
  });
});
