/**
 * Task 272 — Table NC reset guard
 *
 * Routes under test:
 *   POST  /api/events/:eventId/tables/:tableId/nc        — emit NC for a table invoice
 *   PATCH /api/events/:eventId/tables/:tableId/reset-nc  — admin clears ncId so NC can be re-emitted
 *
 * Scenarios covered:
 *   1. POST /nc when table already has ncId → 400 (double-emission guard)
 *   2. PATCH /reset-nc by a non-admin user → 403
 *   3. PATCH /reset-nc when the table has no ncId → 400
 *   4. PATCH /reset-nc by admin → 200, ncId cleared
 *   5. Full reset+re-emit cycle: emit → guard blocks → admin reset → re-emit succeeds
 */

import express from "express";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as http from "node:http";

// ─── Module mocks (must be declared before dynamic imports) ──────────────────

// Mock db — controls the salesInvoices lookup inside POST /nc.
const mockDbSelectResult: any[] = [];
vi.mock("../db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(mockDbSelectResult),
      }),
    }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => [] }) }) }),
    insert: () => ({ values: () => ({ returning: () => [] }) }),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
  pool: { query: vi.fn() },
}));

// Mock storage — the key methods are getEventTable and updateEventTable.
let mockTable: Record<string, any> = {};
const mockStorage = {
  getEventTable: vi.fn(async (id: string) => mockTable[id] ?? null),
  updateEventTable: vi.fn(async (id: string, patch: any) => {
    mockTable[id] = { ...(mockTable[id] ?? {}), ...patch };
    return mockTable[id];
  }),
  // The following are called by other routes loaded via registerEventsRoutes;
  // provide no-op stubs so the module loads cleanly.
  getEvent: vi.fn().mockResolvedValue(null),
  getEvents: vi.fn().mockResolvedValue([]),
  getEventRooms: vi.fn().mockResolvedValue([]),
  getEventRoom: vi.fn().mockResolvedValue(null),
  createEventRoom: vi.fn().mockResolvedValue({}),
  updateEventRoom: vi.fn().mockResolvedValue({}),
  deleteEventRoom: vi.fn().mockResolvedValue(true),
  getEventChargeTypes: vi.fn().mockResolvedValue([]),
  createEventChargeType: vi.fn().mockResolvedValue({}),
  updateEventChargeType: vi.fn().mockResolvedValue({}),
  deleteEventChargeType: vi.fn().mockResolvedValue(true),
  getEventCharges: vi.fn().mockResolvedValue([]),
  createEventCharge: vi.fn().mockResolvedValue({}),
  updateEventCharge: vi.fn().mockResolvedValue({}),
  deleteEventCharge: vi.fn().mockResolvedValue(true),
  getEventPayments: vi.fn().mockResolvedValue([]),
  createEventPayment: vi.fn().mockResolvedValue({}),
  deleteEventPayment: vi.fn().mockResolvedValue(true),
  updateEvent: vi.fn().mockResolvedValue({}),
  createEvent: vi.fn().mockResolvedValue({}),
  deleteEvent: vi.fn().mockResolvedValue(true),
  getEventsByDateRange: vi.fn().mockResolvedValue([]),
  generateEventCode: vi.fn().mockReturnValue("EVT-TEST"),
  getEventPlanningData: vi.fn().mockResolvedValue({ rooms: [], days: [], events: {}, cellEvents: {} }),
  getEventTables: vi.fn().mockResolvedValue([]),
  createEventTable: vi.fn().mockResolvedValue({}),
  deleteEventTable: vi.fn().mockResolvedValue(true),
  getEventTableCharges: vi.fn().mockResolvedValue([]),
  createEventTableCharge: vi.fn().mockResolvedValue({}),
  deleteEventTableCharge: vi.fn().mockResolvedValue(true),
  getEventTablePayments: vi.fn().mockResolvedValue([]),
  createEventTablePayment: vi.fn().mockResolvedValue({}),
  deleteEventTablePayment: vi.fn().mockResolvedValue(true),
  addFolioCharge: vi.fn().mockResolvedValue(undefined),
  addFolioPayment: vi.fn().mockResolvedValue(undefined),
  addFolioAdjustment: vi.fn().mockResolvedValue(undefined),
  registerCashMovement: vi.fn().mockResolvedValue(undefined),
  getOrCreateFolio: vi.fn().mockResolvedValue({ id: "folio-1" }),
  getFolioWithMovements: vi.fn().mockResolvedValue({ id: "folio-1", movements: [] }),
  createAccountMovement: vi.fn().mockResolvedValue({}),
  getEventTablesSummary: vi.fn().mockResolvedValue([]),
};
vi.mock("../db-storage", () => ({ storage: mockStorage }));

// requireAuth — passes every request through; user is injected by the test
// helper middleware registered before the routes.
vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));

// Billing service — emitirFactura returns a fake NC invoice.
const mockEmitirFactura = vi.fn().mockResolvedValue({ id: 99, tipo: "NCA" });
vi.mock("../billing/invoiceService", () => ({ emitirFactura: mockEmitirFactura }));

// PDF generators — not exercised by these routes.
vi.mock("../eventPdfs", () => ({
  generateHojaFuncionPdf: vi.fn().mockResolvedValue(Buffer.from("")),
  generateConfirmacionEventoPdf: vi.fn().mockResolvedValue(Buffer.from("")),
  generateTablesResumenPdf: vi.fn().mockResolvedValue(Buffer.from("")),
  generateTableReceiptPdf: vi.fn().mockResolvedValue(Buffer.from("")),
}));

vi.mock("../email-service", () => ({
  sendEmailWithPdfAttachment: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../billing/invoicePdf", () => ({ generarResumenCuentaPDF: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn().mockResolvedValue({ arcaAmbiente: "ficticio" }),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../utils/assetPath", () => ({ assetPath: (p: string) => p }));

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

type TestUser = { id: string; username: string; role: "admin" | "staff" };

/**
 * Build and start an express app with the events routes registered.
 * The optional `user` is injected as `req.user` so the admin guard can be
 * tested without a real session.
 */
async function startApp(user?: TestUser) {
  const { registerEventsRoutes } = await import("../routes/events");
  const app = express();
  app.use(express.json());

  // Inject test user before routes so requireAuth (which just calls next()) passes
  // and the admin guard can read (req as any).user.
  if (user) {
    app.use((_req: any, _res: any, next: () => void) => {
      (_req as any).user = user;
      next();
    });
  }

  registerEventsRoutes(app);

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

async function postNc(baseUrl: string, eventId: string, tableId: string) {
  const res = await fetch(`${baseUrl}/api/events/${eventId}/tables/${tableId}/nc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function patchResetNc(baseUrl: string, eventId: string, tableId: string) {
  const res = await fetch(`${baseUrl}/api/events/${eventId}/tables/${tableId}/reset-nc`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return { status: res.status, body: (await res.json()) as any };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const EVENT_ID = "evt-001";
const TABLE_ID = "tbl-001";

/** A closed table that has an AFIP invoice but no NC yet (the "ready to anular" state). */
const TABLE_WITH_INVOICE = {
  id: TABLE_ID,
  eventId: EVENT_ID,
  tableNumber: 3,
  status: "closed",
  invoiceId: 42,
  ncId: null,
  charges: [],
  payments: [],
};

/** Same table after an NC has been emitted. */
const TABLE_WITH_INVOICE_AND_NC = {
  ...TABLE_WITH_INVOICE,
  ncId: 99,
};

/** A fake AFIP invoice returned by the db.select mock. */
const FAKE_INVOICE = {
  id: 42,
  tipoComprobante: "FA",
  clienteRazonSocial: "TEST CLIENT",
  clienteCuit: "20-12345678-9",
  clienteDni: null,
  clienteCondicionIva: "iva_responsable_inscripto",
  montoTotal: "121.00",
  items: [
    {
      descripcion: "Consumición Mesa 3",
      cantidad: 1,
      precioUnitario: 100,
      alicuotaIva: "21",
      subtotalNeto: 100,
      subtotal: 121,
    },
  ],
};

const ADMIN_USER: TestUser = { id: "u1", username: "admin1", role: "admin" };
const STAFF_USER: TestUser = { id: "u2", username: "staff1", role: "staff" };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Table NC reset guard — /api/events/:eventId/tables/:tableId/nc + /reset-nc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the in-memory table store.
    mockTable = {};
    // Reset the db select result.
    mockDbSelectResult.length = 0;
    mockDbSelectResult.push(FAKE_INVOICE);
    // Default emitirFactura returns a new NC.
    mockEmitirFactura.mockResolvedValue({ id: 99, tipo: "NCA" });
  });

  // ── 1. Double-emission guard ──────────────────────────────────────────────

  it("POST /nc returns 400 when the table already has ncId set", async () => {
    mockTable[TABLE_ID] = { ...TABLE_WITH_INVOICE_AND_NC };
    const { baseUrl, close } = await startApp(STAFF_USER);

    const { status, body } = await postNc(baseUrl, EVENT_ID, TABLE_ID);

    expect(status).toBe(400);
    expect(body.error).toMatch(/ya tiene una Nota de Crédito/i);

    close();
  });

  // ── 2. Non-admin reset returns 403 ────────────────────────────────────────

  it("PATCH /reset-nc returns 403 when called by a non-admin user", async () => {
    mockTable[TABLE_ID] = { ...TABLE_WITH_INVOICE_AND_NC };
    const { baseUrl, close } = await startApp(STAFF_USER);

    const { status, body } = await patchResetNc(baseUrl, EVENT_ID, TABLE_ID);

    expect(status).toBe(403);
    expect(body.error).toMatch(/administrador/i);

    close();
  });

  it("PATCH /reset-nc returns 403 when no user is authenticated", async () => {
    mockTable[TABLE_ID] = { ...TABLE_WITH_INVOICE_AND_NC };
    // No user injected — (req as any).user will be undefined.
    const { baseUrl, close } = await startApp(undefined);

    const { status, body } = await patchResetNc(baseUrl, EVENT_ID, TABLE_ID);

    expect(status).toBe(403);
    expect(body.error).toMatch(/administrador/i);

    close();
  });

  // ── 3. Reset when table has no ncId returns 400 ───────────────────────────

  it("PATCH /reset-nc returns 400 when the table does not have an ncId", async () => {
    mockTable[TABLE_ID] = { ...TABLE_WITH_INVOICE }; // ncId is null
    const { baseUrl, close } = await startApp(ADMIN_USER);

    const { status, body } = await patchResetNc(baseUrl, EVENT_ID, TABLE_ID);

    expect(status).toBe(400);
    expect(body.error).toMatch(/no tiene una NC emitida/i);

    close();
  });

  // ── 4. Admin reset clears ncId ────────────────────────────────────────────

  it("PATCH /reset-nc by admin returns 200 and clears ncId on the table", async () => {
    mockTable[TABLE_ID] = { ...TABLE_WITH_INVOICE_AND_NC };
    const { baseUrl, close } = await startApp(ADMIN_USER);

    const { status, body } = await patchResetNc(baseUrl, EVENT_ID, TABLE_ID);

    expect(status).toBe(200);
    // The reset route returns the updated table; ncId must be null.
    expect(body.ncId).toBeNull();
    // updateEventTable must have been called with { ncId: null }.
    expect(mockStorage.updateEventTable).toHaveBeenCalledWith(TABLE_ID, { ncId: null });

    close();
  });

  // ── 5. Full reset+re-emit cycle ───────────────────────────────────────────

  it("full cycle: emit NC → double-emit blocked → admin reset → re-emit succeeds", async () => {
    // ── Step 1: table has invoice, no NC yet ────────────────────────────────
    mockTable[TABLE_ID] = { ...TABLE_WITH_INVOICE };
    const { baseUrl: baseStaff, close: closeStaff } = await startApp(STAFF_USER);

    // First emission succeeds.
    const firstEmit = await postNc(baseStaff, EVENT_ID, TABLE_ID);
    expect(firstEmit.status).toBe(200);
    expect(firstEmit.body.ncId).toBe(99);
    // The mock table should now reflect ncId = 99 (updateEventTable was called).
    expect(mockTable[TABLE_ID].ncId).toBe(99);

    closeStaff();

    // ── Step 2: second emission attempt is blocked by the guard ─────────────
    // mockTable[TABLE_ID].ncId is now 99 (set in step 1).
    const { baseUrl: baseStaff2, close: closeStaff2 } = await startApp(STAFF_USER);

    const secondEmit = await postNc(baseStaff2, EVENT_ID, TABLE_ID);
    expect(secondEmit.status).toBe(400);
    expect(secondEmit.body.error).toMatch(/ya tiene una Nota de Crédito/i);

    closeStaff2();

    // ── Step 3: admin resets ncId ───────────────────────────────────────────
    const { baseUrl: baseAdmin, close: closeAdmin } = await startApp(ADMIN_USER);

    const reset = await patchResetNc(baseAdmin, EVENT_ID, TABLE_ID);
    expect(reset.status).toBe(200);
    expect(reset.body.ncId).toBeNull();
    expect(mockTable[TABLE_ID].ncId).toBeNull();

    closeAdmin();

    // ── Step 4: re-emission now succeeds ────────────────────────────────────
    // Give the next NC a new id to distinguish it from the first.
    mockEmitirFactura.mockResolvedValue({ id: 100, tipo: "NCA" });

    const { baseUrl: baseStaff3, close: closeStaff3 } = await startApp(STAFF_USER);

    const thirdEmit = await postNc(baseStaff3, EVENT_ID, TABLE_ID);
    expect(thirdEmit.status).toBe(200);
    expect(thirdEmit.body.ncId).toBe(100);
    expect(mockTable[TABLE_ID].ncId).toBe(100);

    closeStaff3();
  });

  // ── 6. POST /nc returns 404 when the table does not exist ────────────────

  it("POST /nc returns 404 when the table is not found", async () => {
    // mockTable has no entry for TABLE_ID
    const { baseUrl, close } = await startApp(STAFF_USER);

    const { status, body } = await postNc(baseUrl, EVENT_ID, TABLE_ID);

    expect(status).toBe(404);
    expect(body.error).toMatch(/mesa no encontrada/i);

    close();
  });

  // ── 7. POST /nc returns 400 when table has no invoiceId ──────────────────

  it("POST /nc returns 400 when the table has no AFIP invoice", async () => {
    mockTable[TABLE_ID] = { ...TABLE_WITH_INVOICE, invoiceId: null };
    const { baseUrl, close } = await startApp(STAFF_USER);

    const { status, body } = await postNc(baseUrl, EVENT_ID, TABLE_ID);

    expect(status).toBe(400);
    expect(body.error).toMatch(/no tiene una factura AFIP/i);

    close();
  });

  // ── 8. PATCH /reset-nc returns 404 when table does not exist ─────────────

  it("PATCH /reset-nc returns 404 when the table is not found", async () => {
    // mockTable has no entry for TABLE_ID
    const { baseUrl, close } = await startApp(ADMIN_USER);

    const { status, body } = await patchResetNc(baseUrl, EVENT_ID, TABLE_ID);

    expect(status).toBe(404);
    expect(body.error).toMatch(/mesa no encontrada/i);

    close();
  });
});
