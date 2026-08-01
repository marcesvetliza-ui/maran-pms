/**
 * Task 80 — Double-reversal guard for area folios (SPA, Eventos, Restaurant)
 *
 * The reverse-transfer-charge route lives at:
 *   POST /api/reservations/:id/reverse-transfer-charge
 *
 * It is the single shared endpoint used by the SPA, Eventos, and Restaurant
 * folio viewers when staff click "Revertir transferencia". This test suite
 * exercises the idempotency guard to confirm that a second attempt on an
 * already-reversed charge is rejected with a clear 409 error — not silently
 * duplicated.
 *
 * Guard layers tested (see server/routes/reservations.ts ~line 1744):
 *   1. charge.status !== "active"         → 400 "El cargo ya fue revertido o cancelado"
 *   2. description starts with "Reversa…" → 400 "Este cargo ya es una reversa"
 *   3. db query finds existing [rev:id]   → 409 "Esta transferencia ya fue revertida anteriormente"
 *   4. Happy path (first reversal)        → 200 { success: true }
 */

import express from "express";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as http from "node:http";

// ─── Module mocks (must be declared before any dynamic imports) ───────────────

// Mock db — controls raw SQL results for the idempotency guard.
const mockDbExecute = vi.fn();
vi.mock("../db", () => ({
  db: {
    execute: (...args: any[]) => mockDbExecute(...args),
    select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }),
    update: () => ({ set: () => ({ where: () => [] }) }),
    insert: () => ({ values: () => ({ returning: () => [] }) }),
  },
  pool: { query: vi.fn() },
}));

// Mock storage — controls charge lookups, reservation lookups, and folio writes.
const mockStorage = {
  getCharge: vi.fn(),
  getReservation: vi.fn(),
  createCharge: vi.fn(),
  getCharges: vi.fn().mockResolvedValue([]),
  getOrCreateFolio: vi.fn().mockResolvedValue({ id: "folio-1" }),
  addFolioAdjustment: vi.fn().mockResolvedValue(undefined),
  registerCashMovement: vi.fn().mockResolvedValue(undefined),
  addFolioPayment: vi.fn().mockResolvedValue(undefined),
  addFolioCharge: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../db-storage", () => ({ storage: mockStorage }));

// Auth — requireAuth passes every request through (no session needed in tests).
vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));

// Billing / PDF — not exercised by the reversal path.
vi.mock("../billing/invoiceService", () => ({ emitirFactura: vi.fn() }));
vi.mock("../billing/invoicePdf", () => ({ generarResumenCuentaPDF: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn().mockResolvedValue({ arcaAmbiente: "ficticio" }),
}));

// Misc server utilities.
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../email-service", () => ({
  sendCheckoutEmail: vi.fn(),
  sendConfirmationEmail: vi.fn(),
}));
vi.mock("../utils/assetPath", () => ({
  assetPath: (p: string) => p,
}));

// PDFKit — the route imports it at module level; stub it to avoid binary load.
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

/** Start the express app and return { baseUrl, close() } */
async function startApp() {
  const { registerReservationsRoutes } = await import("../routes/reservations");
  const app = express();
  app.use(express.json());
  registerReservationsRoutes(app);

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

async function postReversal(
  baseUrl: string,
  reservationId: string,
  chargeId: string
) {
  const res = await fetch(
    `${baseUrl}/api/reservations/${reservationId}/reverse-transfer-charge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chargeId }),
    }
  );
  return { status: res.status, body: (await res.json()) as any };
}

// ─── Base charge fixture (an active transfer_out from area folio) ─────────────
const ACTIVE_TRANSFER_OUT = {
  id: "charge-spa-1",
  reservationId: "res-100",
  category: "transfer_out" as const,
  amount: "-50.00",
  description: "Cargo SPA → Hab.101 [corr:uuid-abc] [xfer:abc]",
  status: "active",
  date: "2026-01-15",
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("double-reversal guard — /api/reservations/:id/reverse-transfer-charge", () => {
  let baseUrl: string;
  let close: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: reservation is open (not locked).
    mockStorage.getReservation.mockResolvedValue({
      id: "res-100",
      status: "checked_in",
    });

    // Default: createCharge returns the new reversal row.
    mockStorage.createCharge.mockResolvedValue({
      id: "charge-rev-1",
      reservationId: "res-100",
      category: "transfer_in",
      amount: "50.00",
      description: `Reversa de transferencia (...) [rev:${ACTIVE_TRANSFER_OUT.id}]`,
      status: "active",
    });

    // Start a fresh server for each test to avoid route registration collisions.
    const ctx = await startApp();
    baseUrl = ctx.baseUrl;
    close = ctx.close;
  });

  // Tear down after each test.
  // Using `afterEach` is not imported — call close inline via try/finally in
  // each test, or just call it here using a finalizer approach.

  // ── Guard layer 1: charge.status !== "active" ──────────────────────────────
  it("returns 400 when the charge has already been cancelled/reversed (status !== active)", async () => {
    mockStorage.getCharge.mockResolvedValue({
      ...ACTIVE_TRANSFER_OUT,
      status: "reversed",
    });
    // db.execute should not be reached — mock it safe but unused.
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-100", ACTIVE_TRANSFER_OUT.id);

    expect(status).toBe(400);
    expect(body.error).toMatch(/revertido o cancelado/i);

    close();
  });

  // ── Guard layer 2: description starts with "Reversa de transferencia" ───────
  it("returns 400 when staff tries to reverse a reversal counter-charge", async () => {
    mockStorage.getCharge.mockResolvedValue({
      ...ACTIVE_TRANSFER_OUT,
      id: "charge-rev-99",
      description: `Reversa de transferencia (Cargo SPA) [rev:charge-spa-1]`,
      category: "transfer_in",
      amount: "50.00",
    });
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-100", "charge-rev-99");

    expect(status).toBe(400);
    expect(body.error).toMatch(/ya es una reversa/i);

    close();
  });

  // ── Guard layer 2b: description contains [rev:...] ──────────────────────────
  it("returns 400 when the charge description embeds [rev:…] (double-reversal attempt via description tag)", async () => {
    mockStorage.getCharge.mockResolvedValue({
      ...ACTIVE_TRANSFER_OUT,
      id: "charge-rev-88",
      description: `Transferencia SPA [rev:some-other-charge] — extra text`,
      status: "active",
    });
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-100", "charge-rev-88");

    expect(status).toBe(400);
    expect(body.error).toMatch(/ya es una reversa/i);

    close();
  });

  // ── Guard layer 3: DB query finds an existing [rev:chargeId] row ─────────────
  it("returns 409 when a reversal for this charge already exists in the DB — the double-reversal guard", async () => {
    mockStorage.getCharge.mockResolvedValue(ACTIVE_TRANSFER_OUT);

    // Simulate: the charge was already reversed (a row with [rev:charge-spa-1] exists).
    mockDbExecute.mockResolvedValue({ rows: [{ id: "charge-rev-already-done" }] });

    const { status, body } = await postReversal(baseUrl, "res-100", ACTIVE_TRANSFER_OUT.id);

    expect(status).toBe(409);
    expect(body.error).toMatch(/ya fue revertida anteriormente/i);

    close();
  });

  // ── Happy path: first reversal succeeds ──────────────────────────────────────
  it("returns 200 for a valid first reversal of an active SPA transfer charge", async () => {
    mockStorage.getCharge.mockResolvedValue(ACTIVE_TRANSFER_OUT);

    // No existing reversal row → guard passes.
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-100", ACTIVE_TRANSFER_OUT.id);

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    close();
  });

  // ── Guard also blocks non-transfer categories ─────────────────────────────────
  it("returns 400 when the charge category is not a transfer (e.g. 'spa')", async () => {
    mockStorage.getCharge.mockResolvedValue({
      ...ACTIVE_TRANSFER_OUT,
      category: "spa",
      description: "Cargo SPA normal",
    });
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-100", ACTIVE_TRANSFER_OUT.id);

    expect(status).toBe(400);
    expect(body.error).toMatch(/solo se pueden revertir cargos de transferencia/i);

    close();
  });
});
