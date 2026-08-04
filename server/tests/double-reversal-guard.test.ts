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

async function postReversalWithBody(
  baseUrl: string,
  reservationId: string,
  body: Record<string, unknown>
) {
  const res = await fetch(
    `${baseUrl}/api/reservations/${reservationId}/reverse-transfer-charge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

const ACTIVE_EVENTOS_TRANSFER_OUT = {
  id: "charge-eventos-1",
  reservationId: "res-200",
  category: "transfer_out" as const,
  amount: "-120.00",
  description: "Cargo Eventos → Hab.205 [corr:uuid-eventos] [xfer:ev1]",
  status: "active",
  date: "2026-01-20",
};

const ACTIVE_RESTAURANT_TRANSFER_OUT = {
  id: "charge-restaurant-1",
  reservationId: "res-300",
  category: "transfer_out" as const,
  amount: "-75.50",
  description: "Cargo Restaurante → Hab.310 [corr:uuid-rest] [xfer:rst1]",
  status: "active",
  date: "2026-01-22",
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

  // ── Guard layer 0: chargeId missing from request body ────────────────────
  it("returns 400 with a clear message when chargeId is absent from the request body", async () => {
    // No storage mocks needed — the route must reject before touching the DB.
    const { status, body } = await postReversalWithBody(baseUrl, "res-100", {});

    expect(status).toBe(400);
    expect(body.error).toMatch(/chargeId|se requiere/i);

    close();
  });

  it("returns 400 when chargeId is explicitly null in the request body", async () => {
    const { status, body } = await postReversalWithBody(baseUrl, "res-100", { chargeId: null });

    expect(status).toBe(400);
    expect(body.error).toMatch(/chargeId|se requiere/i);

    close();
  });

  it("returns 400 when chargeId is an empty string in the request body", async () => {
    const { status, body } = await postReversalWithBody(baseUrl, "res-100", { chargeId: "" });

    expect(status).toBe(400);
    expect(body.error).toMatch(/chargeId|se requiere/i);

    close();
  });

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

  // ─── Eventos area transfer charges ───────────────────────────────────────────

  it("[Eventos] returns 409 when a reversal for this eventos charge already exists in the DB", async () => {
    mockStorage.getReservation.mockResolvedValue({
      id: "res-200",
      status: "checked_in",
    });
    mockStorage.getCharge.mockResolvedValue(ACTIVE_EVENTOS_TRANSFER_OUT);

    // Simulate: a reversal row with [rev:charge-eventos-1] was already created.
    mockDbExecute.mockResolvedValue({ rows: [{ id: "charge-rev-eventos-done" }] });

    const { status, body } = await postReversal(baseUrl, "res-200", ACTIVE_EVENTOS_TRANSFER_OUT.id);

    expect(status).toBe(409);
    expect(body.error).toMatch(/ya fue revertida anteriormente/i);

    close();
  });

  it("[Eventos] returns 200 for a valid first reversal of an active eventos transfer charge", async () => {
    mockStorage.getReservation.mockResolvedValue({
      id: "res-200",
      status: "checked_in",
    });
    mockStorage.getCharge.mockResolvedValue(ACTIVE_EVENTOS_TRANSFER_OUT);
    mockStorage.createCharge.mockResolvedValue({
      id: "charge-rev-eventos-1",
      reservationId: "res-200",
      category: "transfer_in",
      amount: "120.00",
      description: `Reversa de transferencia (Cargo Eventos) [rev:${ACTIVE_EVENTOS_TRANSFER_OUT.id}]`,
      status: "active",
    });

    // No existing reversal row → guard passes.
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-200", ACTIVE_EVENTOS_TRANSFER_OUT.id);

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    close();
  });

  it("[Eventos] returns 400 when the eventos charge status is already reversed", async () => {
    mockStorage.getReservation.mockResolvedValue({
      id: "res-200",
      status: "checked_in",
    });
    mockStorage.getCharge.mockResolvedValue({
      ...ACTIVE_EVENTOS_TRANSFER_OUT,
      status: "reversed",
    });
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-200", ACTIVE_EVENTOS_TRANSFER_OUT.id);

    expect(status).toBe(400);
    expect(body.error).toMatch(/revertido o cancelado/i);

    close();
  });

  it("[Eventos] returns 400 when staff tries to reverse an eventos reversal counter-charge", async () => {
    mockStorage.getReservation.mockResolvedValue({
      id: "res-200",
      status: "checked_in",
    });
    mockStorage.getCharge.mockResolvedValue({
      ...ACTIVE_EVENTOS_TRANSFER_OUT,
      id: "charge-rev-eventos-99",
      description: `Reversa de transferencia (Cargo Eventos) [rev:charge-eventos-1]`,
      category: "transfer_in",
      amount: "120.00",
    });
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-200", "charge-rev-eventos-99");

    expect(status).toBe(400);
    expect(body.error).toMatch(/ya es una reversa/i);

    close();
  });

  // ─── Restaurant area transfer charges ─────────────────────────────────────────

  it("[Restaurant] returns 409 when a reversal for this restaurant charge already exists in the DB", async () => {
    mockStorage.getReservation.mockResolvedValue({
      id: "res-300",
      status: "checked_in",
    });
    mockStorage.getCharge.mockResolvedValue(ACTIVE_RESTAURANT_TRANSFER_OUT);

    // Simulate: a reversal row with [rev:charge-restaurant-1] was already created.
    mockDbExecute.mockResolvedValue({ rows: [{ id: "charge-rev-restaurant-done" }] });

    const { status, body } = await postReversal(baseUrl, "res-300", ACTIVE_RESTAURANT_TRANSFER_OUT.id);

    expect(status).toBe(409);
    expect(body.error).toMatch(/ya fue revertida anteriormente/i);

    close();
  });

  it("[Restaurant] returns 200 for a valid first reversal of an active restaurant transfer charge", async () => {
    mockStorage.getReservation.mockResolvedValue({
      id: "res-300",
      status: "checked_in",
    });
    mockStorage.getCharge.mockResolvedValue(ACTIVE_RESTAURANT_TRANSFER_OUT);
    mockStorage.createCharge.mockResolvedValue({
      id: "charge-rev-restaurant-1",
      reservationId: "res-300",
      category: "transfer_in",
      amount: "75.50",
      description: `Reversa de transferencia (Cargo Restaurante) [rev:${ACTIVE_RESTAURANT_TRANSFER_OUT.id}]`,
      status: "active",
    });

    // No existing reversal row → guard passes.
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-300", ACTIVE_RESTAURANT_TRANSFER_OUT.id);

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    close();
  });

  it("[Restaurant] returns 400 when the restaurant charge status is already reversed", async () => {
    mockStorage.getReservation.mockResolvedValue({
      id: "res-300",
      status: "checked_in",
    });
    mockStorage.getCharge.mockResolvedValue({
      ...ACTIVE_RESTAURANT_TRANSFER_OUT,
      status: "reversed",
    });
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-300", ACTIVE_RESTAURANT_TRANSFER_OUT.id);

    expect(status).toBe(400);
    expect(body.error).toMatch(/revertido o cancelado/i);

    close();
  });

  it("[Restaurant] returns 400 when staff tries to reverse a restaurant reversal counter-charge", async () => {
    mockStorage.getReservation.mockResolvedValue({
      id: "res-300",
      status: "checked_in",
    });
    mockStorage.getCharge.mockResolvedValue({
      ...ACTIVE_RESTAURANT_TRANSFER_OUT,
      id: "charge-rev-restaurant-99",
      description: `Reversa de transferencia (Cargo Restaurante) [rev:charge-restaurant-1]`,
      category: "transfer_in",
      amount: "75.50",
    });
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-300", "charge-rev-restaurant-99");

    expect(status).toBe(400);
    expect(body.error).toMatch(/ya es una reversa/i);

    close();
  });

  // ─── Locked-reservation guard (isReservationLocked) ───────────────────────

  /**
   * Guard layer 5 (server/routes/reservations.ts ~line 1866):
   *   isReservationLocked(thisRes) → 403 "No se puede revertir un cargo de una reserva cerrada"
   *
   * When the reservation that owns the charge is checked_out, the endpoint must
   * refuse with 403 regardless of whether the charge itself is still "active".
   */
  it("returns 403 when the reservation is checked_out (this folio is locked)", async () => {
    mockStorage.getCharge.mockResolvedValue(ACTIVE_TRANSFER_OUT);

    // Override: this reservation is checked_out.
    mockStorage.getReservation.mockResolvedValue({
      id: "res-100",
      status: "checked_out",
    });

    // Step 2 idempotency guard → no prior reversal.
    // Step 3 corr lookup (charge description has [corr:uuid-abc]) → no paired charge found.
    mockDbExecute.mockResolvedValue({ rows: [] });

    const { status, body } = await postReversal(baseUrl, "res-100", ACTIVE_TRANSFER_OUT.id);

    expect(status).toBe(403);
    expect(body.error).toMatch(/reserva cerrada/i);

    close();
  });

  /**
   * Guard layer 4 (server/routes/reservations.ts ~line 1856):
   *   isReservationLocked(pairedRes) → 400
   *   "No se puede revertir: la reserva del otro folio ya está cerrada o cancelada"
   *
   * When the paired reservation (the transfer counterpart) is checked_out the
   * endpoint must refuse with 400 to avoid creating an orphaned reversal.
   */
  it("returns 400 when the paired reservation is checked_out (paired folio is locked)", async () => {
    // Charge has [corr:uuid-abc] so the deterministic corr-lookup path is used.
    mockStorage.getCharge.mockResolvedValue(ACTIVE_TRANSFER_OUT);

    // This reservation is open; the paired one is locked.
    mockStorage.getReservation.mockImplementation(async (id: string) => {
      if (id === "res-paired") return { id: "res-paired", status: "checked_out" };
      return { id, status: "checked_in" };
    });

    // db.execute calls in order:
    //   1. Idempotency guard (step 2) → no prior reversal.
    //   2. Corr lookup (step 3)       → one paired charge on "res-paired".
    mockDbExecute
      .mockResolvedValueOnce({ rows: [] }) // step 2 — idempotency guard
      .mockResolvedValueOnce({             // step 3 — corr lookup
        rows: [
          {
            id: "charge-paired-1",
            reservation_id: "res-paired",
            amount: "50.00",
            description: "Cargo HAB.101 desde SPA [corr:uuid-abc]",
            category: "transfer_in",
            status: "active",
          },
        ],
      });

    const { status, body } = await postReversal(baseUrl, "res-100", ACTIVE_TRANSFER_OUT.id);

    expect(status).toBe(400);
    expect(body.error).toMatch(/otro folio.*cerrada|cerrada.*otro folio/i);

    close();
  });

  // ── Duplicate-guard: source counter-charge already exists on the source reservation ──

  /**
   * Guard (step 6): before creating the counter-charge on the SOURCE reservation,
   * the route must check whether an active charge with the same reservationId,
   * amount, and description already exists (e.g. the previous attempt created it
   * but crashed before finishing). If it does, skip recreation and continue to
   * attempt the paired side normally.
   */
  it("skips source counter-charge creation but still creates the paired counter-charge when source duplicate already exists (retry scenario)", async () => {
    mockStorage.getCharge.mockResolvedValue(ACTIVE_TRANSFER_OUT);

    // Both reservations are open.
    mockStorage.getReservation.mockImplementation(async (id: string) => ({
      id,
      status: "checked_in",
    }));

    // db.execute calls:
    //   1. Idempotency guard (step 2) → no prior reversal token found.
    //   2. Corr lookup (step 3)       → paired charge found on "res-paired".
    const PAIRED_CHARGE_DESC = "Cargo HAB.101 desde SPA [corr:uuid-abc]";
    mockDbExecute
      .mockResolvedValueOnce({ rows: [] }) // step 2 — idempotency guard
      .mockResolvedValueOnce({             // step 3 — corr lookup finds the paired charge
        rows: [
          {
            id: "charge-paired-1",
            reservation_id: "res-paired",
            amount: "50.00",
            description: PAIRED_CHARGE_DESC,
            category: "transfer_in",
            status: "active",
          },
        ],
      });

    // The source counter-charge that was already created on a prior attempt:
    //   cleanDesc = "Cargo SPA → Hab.101"  (after stripping [corr:…] [xfer:…])
    //   thisCounterDesc = "Reversa de transferencia (Cargo SPA → Hab.101) [rev:charge-spa-1] [res:res-paired]"
    //   thisCounterAmount = 50 → String: "50"
    const expectedSourceDesc =
      "Reversa de transferencia (Cargo SPA → Hab.101) [rev:charge-spa-1] [res:res-paired]";

    // Source reservation already has the counter-charge; paired does not.
    mockStorage.getCharges.mockImplementation(async (resId: string) => {
      if (resId === "res-100") {
        return [
          {
            id: "charge-source-counter-existing",
            reservationId: "res-100",
            description: expectedSourceDesc,
            amount: "50",
            status: "active",
          },
        ];
      }
      return [];
    });

    const { status, body } = await postReversal(baseUrl, "res-100", ACTIVE_TRANSFER_OUT.id);

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    // createCharge must have been called exactly once — for the PAIRED reservation,
    // not the source (which already has the counter-charge).
    expect(mockStorage.createCharge).toHaveBeenCalledOnce();
    const created = mockStorage.createCharge.mock.calls[0][0];
    expect(created.reservationId).toBe("res-paired");

    close();
  });

  // ── Duplicate-guard: paired counter-charge already exists on the paired reservation ──

  /**
   * Guard: before recreating the counter-charge on the paired reservation, the
   * route must check whether an active charge with the same reservationId,
   * amount, and description already exists (e.g. from a previous partial
   * failure). If it does, skip recreation and return alreadyExists: true so the
   * caller knows the folio is already in the correct state.
   */
  it("skips paired counter-charge creation and returns alreadyExists:true when a matching active charge already exists on the paired reservation", async () => {
    mockStorage.getCharge.mockResolvedValue(ACTIVE_TRANSFER_OUT);

    // Both reservations are open.
    mockStorage.getReservation.mockImplementation(async (id: string) => ({
      id,
      status: "checked_in",
    }));

    // db.execute calls in order:
    //   1. Idempotency guard (step 2) → no prior reversal on this reservation.
    //   2. Corr lookup (step 3)       → paired charge found on "res-paired".
    const PAIRED_CHARGE_DESC = "Cargo HAB.101 desde SPA [corr:uuid-abc]";
    mockDbExecute
      .mockResolvedValueOnce({ rows: [] }) // step 2 — no existing reversal
      .mockResolvedValueOnce({             // step 3 — corr lookup finds the paired charge
        rows: [
          {
            id: "charge-paired-1",
            reservation_id: "res-paired",
            amount: "50.00",
            description: PAIRED_CHARGE_DESC,
            category: "transfer_in",
            status: "active",
          },
        ],
      });

    // The counter-charge that would be created has:
    //   pairedCleanDesc = "Cargo HAB.101 desde SPA"  (after stripping [corr:…])
    //   pairedCounterDesc = "Reversa de transferencia (Cargo HAB.101 desde SPA) [rev:charge-paired-1] [res:res-100]"
    //   pairedCounterAmount = -50  → String: "-50"
    const expectedDesc =
      "Reversa de transferencia (Cargo HAB.101 desde SPA) [rev:charge-paired-1] [res:res-100]";

    // Simulate: the counter-charge was already created on "res-paired" during a
    // prior (partially failed) reversal attempt — it must NOT be duplicated.
    mockStorage.getCharges.mockImplementation(async (resId: string) => {
      if (resId === "res-paired") {
        return [
          {
            id: "charge-paired-counter-existing",
            reservationId: "res-paired",
            description: expectedDesc,
            amount: "-50",
            status: "active",
          },
        ];
      }
      return [];
    });

    const { status, body } = await postReversal(baseUrl, "res-100", ACTIVE_TRANSFER_OUT.id);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.alreadyExists).toBe(true);

    // The counter-charge on the this (source) reservation must still be created.
    expect(mockStorage.createCharge).toHaveBeenCalledOnce();
    const created = mockStorage.createCharge.mock.calls[0][0];
    expect(created.reservationId).toBe("res-100");

    close();
  });
});
