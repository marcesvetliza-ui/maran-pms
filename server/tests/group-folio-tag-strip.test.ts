/**
 * Group master-folio tag-stripping
 *
 * The GET /api/groups/:groupId/master-folio route strips internal routing tags
 * ([xfer:…], [corr:…], [res:…]) from per-reservation charge descriptions before
 * returning the data to the caller.
 *
 * This suite verifies:
 *  1. A charge description that contains an [xfer:…] tag is returned clean.
 *  2. A charge description that contains a [corr:…] tag is returned clean.
 *  3. A charge description that contains a [res:…] tag is returned clean.
 *  4. Multiple tags in a single description are all stripped.
 *  5. A description with no tags is returned unchanged.
 *  6. The original description stored in the DB is never mutated — only the
 *     API response is sanitised.
 */

import express from "express";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as http from "node:http";

// ─── Module mocks (must be declared before dynamic imports) ──────────────────

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

const mockStorage = {
  getGroup: vi.fn(),
  getGroups: vi.fn().mockResolvedValue([]),
  getGroupCharges: vi.fn().mockResolvedValue([]),
  getGroupPayments: vi.fn().mockResolvedValue([]),
  getGroupReservationLedger: vi.fn().mockResolvedValue([]),
  getCharges: vi.fn().mockResolvedValue([]),
  getPayments: vi.fn().mockResolvedValue([]),
  createGroupCharge: vi.fn(),
  deleteGroupCharge: vi.fn().mockResolvedValue(true),
  transferChargeToGroup: vi.fn(),
  deleteCharge: vi.fn(),
  createCharge: vi.fn().mockResolvedValue({ id: "new-charge-001" }),
  createGroupPayment: vi.fn(),
  distributeGroupPayment: vi.fn().mockResolvedValue({}),
  getReservation: vi.fn(),
  getReservations: vi.fn().mockResolvedValue([]),
  updateReservation: vi.fn(),
  getCharge: vi.fn(),
  createPayment: vi.fn(),
  getOrCreateFolio: vi.fn().mockResolvedValue({ id: "folio-1" }),
  addFolioAdjustment: vi.fn().mockResolvedValue(undefined),
  registerCashMovement: vi.fn().mockResolvedValue(undefined),
  addFolioPayment: vi.fn().mockResolvedValue(undefined),
  addFolioCharge: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../db-storage", () => ({
  storage: mockStorage,
  getArgentinaToday: () => "2026-08-04",
}));

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("../audit", () => ({ audit: vi.fn() }));

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

async function getMasterFolio(baseUrl: string, groupId: string) {
  const res = await fetch(`${baseUrl}/api/groups/${groupId}/master-folio`);
  return { status: res.status, body: (await res.json()) as any };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const GROUP_ID = "group-tag-test-001";

/** A minimal group fixture with a single active reservation */
function makeGroup(overrides: Record<string, any> = {}) {
  return {
    id: GROUP_ID,
    name: "Grupo Test",
    groupCode: "GT001",
    checkInDate: "2026-08-10",
    checkOutDate: "2026-08-13",
    status: "confirmed",
    masterFolioConfig: "all",
    reservations: [
      {
        id: "res-001",
        status: "confirmed",
        nights: 3,
        totalRoomAmount: "300.00",
        room: { roomNumber: "101" },
        guest: { firstName: "María", lastName: "García", tipoPersona: "fisica" },
      },
    ],
    ...overrides,
  };
}

/** Build a charge with the given description, as storage would return it */
function makeCharge(id: string, description: string, amount = "50.00") {
  return {
    id,
    reservationId: "res-001",
    description,
    amount,
    date: "2026-08-10",
    category: "extra",
    status: "active",
  };
}

/**
 * The /master-folio route builds its `rooms` array from
 * storage.getGroupReservationLedger (the shared per-reservation ledger also
 * used by /folio and /invoice), not from storage.getCharges directly. Build
 * a minimal ledger line carrying the given charges so these tests still
 * exercise the route's own tag-stripping of `charges[].description`.
 */
function makeLedgerLine(charges: ReturnType<typeof makeCharge>[]) {
  return {
    reservationId: "res-001",
    guestName: "María García",
    roomNumber: "101",
    status: "confirmed",
    nights: 3,
    accommodationTotal: 300,
    extrasTotal: charges.reduce((s, c) => s + parseFloat(c.amount), 0),
    paymentsTotal: 0,
    payments: [],
    charges,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("master-folio tag-stripping — GET /api/groups/:groupId/master-folio", () => {
  let baseUrl: string;
  let close: () => void;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockStorage.getGroupCharges.mockResolvedValue([]);
    mockStorage.getGroupPayments.mockResolvedValue([]);
    mockStorage.getPayments.mockResolvedValue([]);

    const ctx = await startApp();
    baseUrl = ctx.baseUrl;
    close = ctx.close;
  });

  // ── [xfer:…] tag ─────────────────────────────────────────────────────────

  it("strips an [xfer:…] tag from a charge description", async () => {
    mockStorage.getGroup.mockResolvedValue(makeGroup());
    mockStorage.getGroupReservationLedger.mockResolvedValue([
      makeLedgerLine([makeCharge("c-001", "Minibar [xfer:abc123]")]),
    ]);

    const { status, body } = await getMasterFolio(baseUrl, GROUP_ID);

    expect(status).toBe(200);
    const charge = body.rooms[0].charges[0];
    expect(charge.description).toBe("Minibar");
    expect(charge.description).not.toMatch(/\[xfer:/);

    close();
  });

  // ── [corr:…] tag ─────────────────────────────────────────────────────────

  it("strips a [corr:…] tag from a charge description", async () => {
    mockStorage.getGroup.mockResolvedValue(makeGroup());
    mockStorage.getGroupReservationLedger.mockResolvedValue([
      makeLedgerLine([makeCharge("c-002", "Lavandería [corr:corr-xyz]")]),
    ]);

    const { status, body } = await getMasterFolio(baseUrl, GROUP_ID);

    expect(status).toBe(200);
    const charge = body.rooms[0].charges[0];
    expect(charge.description).toBe("Lavandería");
    expect(charge.description).not.toMatch(/\[corr:/);

    close();
  });

  // ── [res:…] tag ──────────────────────────────────────────────────────────

  it("strips a [res:…] tag from a charge description", async () => {
    mockStorage.getGroup.mockResolvedValue(makeGroup());
    mockStorage.getGroupReservationLedger.mockResolvedValue([
      makeLedgerLine([makeCharge("c-003", "Desayuno [res:res-001]")]),
    ]);

    const { status, body } = await getMasterFolio(baseUrl, GROUP_ID);

    expect(status).toBe(200);
    const charge = body.rooms[0].charges[0];
    expect(charge.description).toBe("Desayuno");
    expect(charge.description).not.toMatch(/\[res:/);

    close();
  });

  // ── Multiple tags in one description ─────────────────────────────────────

  it("strips multiple bracket tags from a single description", async () => {
    mockStorage.getGroup.mockResolvedValue(makeGroup());
    mockStorage.getGroupReservationLedger.mockResolvedValue([
      makeLedgerLine([makeCharge("c-004", "Servicio de habitación [xfer:xf-99] [res:res-001]")]),
    ]);

    const { status, body } = await getMasterFolio(baseUrl, GROUP_ID);

    expect(status).toBe(200);
    const charge = body.rooms[0].charges[0];
    expect(charge.description).toBe("Servicio de habitación");
    expect(charge.description).not.toMatch(/\[xfer:/);
    expect(charge.description).not.toMatch(/\[res:/);

    close();
  });

  // ── Plain description — no tags ──────────────────────────────────────────

  it("returns an untagged description unchanged", async () => {
    mockStorage.getGroup.mockResolvedValue(makeGroup());
    mockStorage.getGroupReservationLedger.mockResolvedValue([
      makeLedgerLine([makeCharge("c-005", "Estacionamiento")]),
    ]);

    const { status, body } = await getMasterFolio(baseUrl, GROUP_ID);

    expect(status).toBe(200);
    const charge = body.rooms[0].charges[0];
    expect(charge.description).toBe("Estacionamiento");

    close();
  });

  // ── Original DB value is never mutated ───────────────────────────────────

  it("does not mutate the original charge object returned by storage", async () => {
    mockStorage.getGroup.mockResolvedValue(makeGroup());
    const originalCharge = makeCharge("c-006", "Spa [xfer:sp-007]");
    mockStorage.getGroupReservationLedger.mockResolvedValue([makeLedgerLine([originalCharge])]);

    const { status, body } = await getMasterFolio(baseUrl, GROUP_ID);

    expect(status).toBe(200);
    // API response is clean
    expect(body.rooms[0].charges[0].description).toBe("Spa");
    // The object that storage returned is untouched
    expect(originalCharge.description).toBe("Spa [xfer:sp-007]");

    close();
  });

  // ── 404 when group does not exist ─────────────────────────────────────────

  it("returns 404 when the group is not found", async () => {
    mockStorage.getGroup.mockResolvedValue(null);

    const { status } = await getMasterFolio(baseUrl, "nonexistent-group");

    expect(status).toBe(404);

    close();
  });
});
