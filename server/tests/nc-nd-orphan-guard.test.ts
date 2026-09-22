import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

/**
 * "Notas de Crédito/Débito huérfanas": POST /api/billing/invoices es el
 * endpoint genérico que usa, entre otros, el Centro de Comprobantes — a
 * diferencia de POST /invoices/:id/nota-credito y /nota-debito (que exigen
 * la factura origen en la URL por diseño), este endpoint no tenía ningún
 * guard contra tipoComprobante = NCA/NDB/etc., así que aceptaba crear una
 * Nota de Crédito/Débito sin ninguna factura asociada — algo que ARCA
 * siempre rechaza. Este test cubre el guard agregado en server/billing/routes.ts.
 */

const state = vi.hoisted(() => ({ invoices: [] as any[] }));

vi.mock("../db", () => ({
  db: { execute: vi.fn(async () => ({ rows: state.invoices })) },
  pool: { connect: vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [] })), release: vi.fn() })) },
}));

vi.mock("@shared/schema", () => ({
  salesInvoices: {},
  invoiceCounters: {},
  folioMovements: {},
}));

vi.mock("../billing/invoiceService", () => ({
  calcularMontos: vi.fn((items: any[]) => ({
    montoTotal: items.reduce((sum: number, item: any) => sum + Number(item.subtotal ?? item.precioUnitario * item.cantidad), 0),
  })),
  emitirFactura: vi.fn(async (data: any) => ({
    id: 1,
    tipoComprobante: data.tipoComprobante,
    puntoVenta: 1,
    numero: 1,
    montoTotal: "100.00",
  })),
  buildComprobanteAsociado: vi.fn(() => ({ tipo: "", puntoVenta: 0, numero: 0, fecha: "" })),
}));

vi.mock("../db-storage", () => ({
  storage: {
    getReservation: vi.fn(async () => null),
    getCharges: vi.fn(async () => []),
    getPayments: vi.fn(async () => []),
    createAccountMovement: vi.fn(),
    registerCashMovement: vi.fn(),
  },
}));

vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../audit", () => ({ audit: vi.fn() }));
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(),
  updateBillingConfig: vi.fn(),
}));
vi.mock("../billing/invoicePdf", () => ({
  generarFacturaPDF: vi.fn(),
  generarVoucherHabitacionPDF: vi.fn(),
}));
vi.mock("../utils/assetPath", () => ({ assetPath: (value: string) => value }));
vi.mock("pdfkit", () => ({ default: class PDFDocument {} }));

const { registerBillingRoutes } = await import("../billing/routes");

function invoiceBody(overrides: Record<string, unknown> = {}) {
  return {
    tipoComprobante: "FB",
    cliente: { razonSocial: "Consumidor Final", condicionIva: "Consumidor Final" },
    items: [{
      descripcion: "Cargo de prueba",
      cantidad: 1,
      precioUnitario: 100,
      alicuotaIva: "21",
      subtotalNeto: 82.64,
      subtotal: 100,
    }],
    ...overrides,
  };
}

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "admin-1", username: "admin", fullName: "Admin" };
    next();
  });
  registerBillingRoutes(app);
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

beforeEach(() => {
  state.invoices = [];
});

describe("guard contra Notas de Crédito/Débito huérfanas en POST /api/billing/invoices", () => {
  const ncNdTipos = ["NCA", "NCB", "NCC", "NCT", "NCM", "NDA", "NDB", "NDC", "NDT", "NDM"];

  for (const tipo of ncNdTipos) {
    it(`rechaza tipoComprobante=${tipo} sin factura asociada`, async () => {
      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/billing/invoices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(invoiceBody({ tipoComprobante: tipo })),
        });
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toMatch(/deben emitirse desde la factura original/i);
      });
    });
  }

  it("no bloquea una Factura B normal (control)", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/billing/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceBody({ tipoComprobante: "FB" })),
      });
      const body = await response.json();
      expect(body.error ?? "").not.toMatch(/deben emitirse desde la factura original/i);
    });
  });
});
