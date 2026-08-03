/**
 * Task 202 — ND/NC guard: NC adjustment section must never appear on ND or NC PDFs
 *
 * The PDF route GET /api/billing/invoices/:id/pdf has a FACTURA_TIPOS allow-list:
 *
 *   const FACTURA_TIPOS = ["FA", "FB", "FC", "FT", "FM"];
 *   if (factura.nota_credito_id && FACTURA_TIPOS.includes(tipo)) { … }
 *
 * This means that even when a sales_invoice row of type NDA/NDB/NDC/NDT/NDM
 * (or NCA/NCB/NCC/NCT/NCM) has a nota_credito_id set — which can happen due to
 * a data anomaly — the route must call generarFacturaPDF WITHOUT a third
 * notaCreditoInfo argument, so no NC adjustment section is rendered.
 *
 * Tests:
 *  1. ND types (NDA, NDB, NDC, NDT, NDM) with nota_credito_id → no notaCreditoInfo passed
 *  2. NC types (NCA, NCB, NCC, NCT, NCM) with nota_credito_id → no notaCreditoInfo passed
 *  3. FA/FB/FC/FT/FM with nota_credito_id → notaCreditoInfo IS passed (regression guard)
 *  4. FA with nota_credito_id absent → notaCreditoInfo is undefined (baseline)
 */

import express from "express";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as http from "node:http";

// ─── Module mocks ─────────────────────────────────────────────────────────────

// db.execute is the only DB primitive used by the PDF route.
// We use mockOnce chains to feed: (1) invoice row, (2) optional NC row.
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

// Mock schema — drizzle tagged-template sql() is called at import time but only
// used as argument to db.execute which we stub above; the schema objects are
// only referenced inside route handlers, so a thin stub is enough.
vi.mock("@shared/schema", () => ({
  salesInvoices: {},
  invoiceCounters: {},
  folioMovements: {},
}));

// generarFacturaPDF is the function under test — spy to capture call args.
// It must return a Buffer so the HTTP response doesn't crash.
const mockGenerarFacturaPDF = vi.fn().mockResolvedValue(Buffer.from("PDF"));
const mockGenerarVoucherPDF  = vi.fn().mockResolvedValue(Buffer.from("VPDF"));

vi.mock("../billing/invoicePdf", () => ({
  generarFacturaPDF:         (...args: any[]) => mockGenerarFacturaPDF(...args),
  generarVoucherHabitacionPDF: (...args: any[]) => mockGenerarVoucherPDF(...args),
}));

// billingConfig — provide a minimal config so generarFacturaPDF (the mock) has
// something to receive; the actual content doesn't matter here.
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn().mockResolvedValue({
    razonSocial: "Hotel Test",
    cuit: "20-12345678-1",
    iibb: "",
    inicioActividades: "2020-01-01",
    condicionIva: "Responsable Inscripto",
    domicilioComercial: "Calle Falsa 123",
    arcaAmbiente: "ficticio",
  }),
  updateBillingConfig: vi.fn(),
}));

// invoiceService — not used by the PDF route but imported by routes.ts.
vi.mock("../billing/invoiceService", () => ({ emitirFactura: vi.fn() }));

// storage — getReservation / getCharges / getPayments are only used by the
// voucher-habitacion branch (tipo === "cierre_habitacion"), which none of our
// test invoices trigger.
vi.mock("../db-storage", () => ({
  storage: {
    getReservation:      vi.fn().mockResolvedValue(null),
    getCharges:          vi.fn().mockResolvedValue([]),
    getPayments:         vi.fn().mockResolvedValue([]),
    registerCashMovement: vi.fn(),
    createAccountMovement: vi.fn(),
  },
}));

// auth — let every request through.
vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));

// audit — not triggered by the read-only PDF route.
vi.mock("../audit", () => ({ audit: vi.fn() }));

// email-service — not used by PDF route.
vi.mock("../email-service", () => ({
  sendCheckoutEmail:     vi.fn(),
  sendConfirmationEmail: vi.fn(),
}));

// assetPath util.
vi.mock("../utils/assetPath", () => ({ assetPath: (p: string) => p }));

// PDFKit — only present to prevent binary load; never actually called because
// generarFacturaPDF is fully mocked above.
vi.mock("pdfkit", () => ({
  default: class PDFDocument {
    pipe()        { return this; }
    end()         {}
    on()          { return this; }
    text()        { return this; }
    moveDown()    { return this; }
    fontSize()    { return this; }
    font()        { return this; }
    fillColor()   { return this; }
    image()       { return this; }
    rect()        { return this; }
    stroke()      { return this; }
    save()        { return this; }
    restore()     { return this; }
    addPage()     { return this; }
    moveTo()      { return this; }
    lineTo()      { return this; }
    fillAndStroke(){ return this; }
    translate()   { return this; }
    dash()        { return this; }
    undash()      { return this; }
    lineWidth()   { return this; }
    lineCap()     { return this; }
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Start a fresh Express app with billing routes mounted. */
async function startApp() {
  const { registerBillingRoutes } = await import("../billing/routes");
  const app = express();
  app.use(express.json());
  registerBillingRoutes(app);

  return new Promise<{ baseUrl: string; close: () => void }>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve({ baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

/** Build a minimal sales_invoice row for the DB mock. */
function makeInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tipo_comprobante: "FA",
    punto_venta: 1,
    numero: 1,
    fecha_emision: "2026-01-01",
    cliente_razon_social: "Test Cliente",
    cliente_cuit: "20-11111111-1",
    monto_total: "1000.00",
    monto_acreditado: "0.00",
    nota_credito_id: null,
    reserva_id: null,
    estado: "emitida",
    ...overrides,
  };
}

/** Build a minimal NC row returned by the second db.execute call. */
const NC_ROW = {
  tipo_comprobante: "NCA",
  punto_venta: 1,
  numero: 5,
  fecha_emision: "2026-01-15",
  monto_total: "1000.00",
};

async function getPdf(baseUrl: string, invoiceId = 1) {
  const res = await fetch(`${baseUrl}/api/billing/invoices/${invoiceId}/pdf`);
  return { status: res.status };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ND/NC guard — generarFacturaPDF must not receive notaCreditoInfo for ND or NC documents", () => {
  let baseUrl: string;
  let close: () => void;

  beforeEach(async () => {
    // resetAllMocks clears call history AND the mockResolvedValueOnce queue so
    // unconsumed once-values from a previous test cannot bleed into the next.
    vi.resetAllMocks();
    // Restore default implementations that every test relies on.
    mockGenerarFacturaPDF.mockResolvedValue(Buffer.from("PDF"));
    const ctx = await startApp();
    baseUrl = ctx.baseUrl;
    close = ctx.close;
  });

  // ── ND types ───────────────────────────────────────────────────────────────

  const ND_TYPES = ["NDA", "NDB", "NDC", "NDT", "NDM"] as const;

  for (const tipo of ND_TYPES) {
    it(`[${tipo}] does NOT pass notaCreditoInfo even when nota_credito_id is set`, async () => {
      // Invoice row has nota_credito_id = 99 but tipo is ND → guard must block.
      mockDbExecute.mockResolvedValueOnce({
        rows: [makeInvoiceRow({ tipo_comprobante: tipo, nota_credito_id: 99 })],
      });
      // If the guard fires the NC lookup (it should not), return an NC row.
      // If it returns here it would be a test failure caught by the assertion below.
      mockDbExecute.mockResolvedValueOnce({ rows: [NC_ROW] });

      const { status } = await getPdf(baseUrl);

      expect(status).toBe(200);
      // The critical assertion: third argument must be undefined.
      expect(mockGenerarFacturaPDF).toHaveBeenCalledOnce();
      const thirdArg = mockGenerarFacturaPDF.mock.calls[0][2];
      expect(thirdArg).toBeUndefined();

      close();
    });
  }

  // ── NC types ───────────────────────────────────────────────────────────────

  const NC_TYPES = ["NCA", "NCB", "NCC", "NCT", "NCM"] as const;

  for (const tipo of NC_TYPES) {
    it(`[${tipo}] does NOT pass notaCreditoInfo even when nota_credito_id is set`, async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [makeInvoiceRow({ tipo_comprobante: tipo, nota_credito_id: 99 })],
      });
      mockDbExecute.mockResolvedValueOnce({ rows: [NC_ROW] });

      const { status } = await getPdf(baseUrl);

      expect(status).toBe(200);
      expect(mockGenerarFacturaPDF).toHaveBeenCalledOnce();
      const thirdArg = mockGenerarFacturaPDF.mock.calls[0][2];
      expect(thirdArg).toBeUndefined();

      close();
    });
  }

  // ── FA/FB/FC/FT/FM regression: NC info IS forwarded ───────────────────────

  const FACTURA_TIPOS = ["FA", "FB", "FC", "FT", "FM"] as const;

  for (const tipo of FACTURA_TIPOS) {
    it(`[${tipo}] DOES pass notaCreditoInfo when nota_credito_id is present (regression)`, async () => {
      // First call: fetch invoice; second call: fetch the linked NC row.
      mockDbExecute
        .mockResolvedValueOnce({
          rows: [makeInvoiceRow({ tipo_comprobante: tipo, nota_credito_id: 5 })],
        })
        .mockResolvedValueOnce({ rows: [NC_ROW] });

      const { status } = await getPdf(baseUrl);

      expect(status).toBe(200);
      expect(mockGenerarFacturaPDF).toHaveBeenCalledOnce();
      const thirdArg = mockGenerarFacturaPDF.mock.calls[0][2];
      expect(thirdArg).toBeDefined();
      expect(thirdArg).toMatchObject({
        tipoComprobante: NC_ROW.tipo_comprobante,
        puntoVenta:      NC_ROW.punto_venta,
        numero:          NC_ROW.numero,
        montoTotal:      parseFloat(NC_ROW.monto_total),
      });

      close();
    });
  }

  // ── Baseline: no nota_credito_id → notaCreditoInfo is always undefined ─────

  it("[FA] does NOT pass notaCreditoInfo when nota_credito_id is null", async () => {
    mockDbExecute.mockResolvedValueOnce({
      rows: [makeInvoiceRow({ tipo_comprobante: "FA", nota_credito_id: null })],
    });

    const { status } = await getPdf(baseUrl);

    expect(status).toBe(200);
    expect(mockGenerarFacturaPDF).toHaveBeenCalledOnce();
    const thirdArg = mockGenerarFacturaPDF.mock.calls[0][2];
    expect(thirdArg).toBeUndefined();

    close();
  });
});
