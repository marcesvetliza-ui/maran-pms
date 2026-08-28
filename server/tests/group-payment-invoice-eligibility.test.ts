import express from "express";
import type { Server } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as any[],
  dbRows: null as any[][] | null,
}));

const mockEmitirFactura = vi.hoisted(() => vi.fn());
const mockAssertGroupInvoiceAllocation = vi.hoisted(() => vi.fn());
const mockGetGroup = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () => ({
      rows: state.dbRows ? (state.dbRows.shift() || []) : state.rows,
    })),
  },
  pool: {
    connect: vi.fn(async () => ({
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    })),
  },
}));

vi.mock("../billing/groupInvoiceScope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../billing/groupInvoiceScope")>();
  return {
    ...actual,
    assertGroupInvoiceAllocation: mockAssertGroupInvoiceAllocation,
  };
});

vi.mock("../billing/invoiceService", () => ({
  calcularMontos: vi.fn((items: Array<{ subtotal?: number }>) => ({
    montoTotal: items.reduce((total, item) => total + (Number(item.subtotal) || 0), 0),
  })),
  emitirFactura: mockEmitirFactura,
}));

vi.mock("../db-storage", () => ({
  storage: {
    getGroup: mockGetGroup,
  },
  getArgentinaToday: vi.fn(() => "2026-08-28"),
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
vi.mock("pdfkit", () => ({
  default: class PDFDocument {},
}));

const {
  assertGroupPaymentInvoiceEligibility,
  assertGroupPaymentInvoiceScope,
  assertMasterFacturaTAllowed,
} = await import("../billing/groupInvoiceScope");
const { registerBillingRoutes } = await import("../billing/routes");

const GROUP_ID = "group-factura-t-1";
const PAYMENT_ID = "group-payment-factura-t-1";
const GUEST_DOCUMENT = "P-123456";
const ACCOMMODATION_SOURCE = "reservation:reservation-1:accommodation";

function facturaTBody(overrides: Record<string, unknown> = {}) {
  return {
    tipoComprobante: "FT",
    cliente: {
      razonSocial: "Huésped Extranjero",
      dni: GUEST_DOCUMENT,
      condicionIva: "Consumidor Final",
    },
    items: [{
      descripcion: "Alojamiento",
      cantidad: 1,
      precioUnitario: 100,
      alicuotaIva: "exento",
      subtotalNeto: 100,
      subtotal: 100,
    }],
    groupId: GROUP_ID,
    groupPaymentId: PAYMENT_ID,
    sourceChargeIds: [ACCOMMODATION_SOURCE],
    sourceChargeAmounts: { [ACCOMMODATION_SOURCE]: 100 },
    // This context is client-controlled and must not be the source of truth
    // for the group guest's nationality.
    folioContext: {
      billingTarget: "guest",
      nationality: "Brasil",
      nationalityCode: "105",
      hasAccommodation: true,
    },
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
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function postInvoice(baseUrl: string, body: unknown) {
  const response = await fetch(`${baseUrl}/api/billing/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json() as { error?: string; modoFicticio?: boolean },
  };
}

describe("legacy group-payment invoice eligibility", () => {
  beforeEach(() => {
    state.rows = [];
    state.dbRows = null;
    mockGetGroup.mockReset();
    mockGetGroup.mockResolvedValue({
      id: GROUP_ID,
      masterFolioConfig: "accommodation",
    });
    mockAssertGroupInvoiceAllocation.mockReset();
    mockAssertGroupInvoiceAllocation.mockResolvedValue(undefined);
    mockEmitirFactura.mockReset();
    mockEmitirFactura.mockResolvedValue({
      id: 501,
      tipoComprobante: "FT",
      numero: 1,
      montoTotal: "100.00",
      modoFicticio: true,
    });
  });

  it("rejects a fiscal claim linked only through the legacy group_payments.invoice_id", async () => {
    // The query resolves this row as active when the historical invoice is
    // reachable by gp.invoice_id even though it has no group_payment_id.
    state.rows = [{
      amount: "100.00",
      invoice_id: 91,
      has_active_claim: true,
    }];

    await expect(assertGroupPaymentInvoiceEligibility("group-1", "payment-1", 100))
      .rejects.toMatchObject({ status: 409 });
  });

  it("does not require the fiscal document total to equal its linked collection", async () => {
    state.rows = [{
      amount: "120.00",
      invoice_id: null,
      has_active_claim: false,
    }];

    await expect(assertGroupPaymentInvoiceEligibility("group-1", "payment-1", 300))
      .resolves.toBeUndefined();
  });

  it("rejects manual linking when the emitted invoice has no group scope", () => {
    expect(() => assertGroupPaymentInvoiceScope(
      { id: 91, groupId: null, groupPaymentId: null },
      { id: "payment-1" },
      "group-1",
    )).toThrowError(expect.objectContaining({ statusCode: 409 }));
  });

  it("rejects Factura T on a Folio Maestro payment when the master folio also covers extras (config=all)", () => {
    expect(() => assertMasterFacturaTAllowed("factura_t", "all"))
      .toThrowError(expect.objectContaining({ statusCode: 400 }));
  });

  it("allows Factura T on a Folio Maestro payment when the master folio is accommodation-only", () => {
    expect(() => assertMasterFacturaTAllowed("factura_t", "accommodation")).not.toThrow();
  });

  it("does not restrict non-Factura T receipt types regardless of master folio config", () => {
    expect(() => assertMasterFacturaTAllowed("factura_b", "all")).not.toThrow();
    expect(() => assertMasterFacturaTAllowed(undefined, "all")).not.toThrow();
  });
});

describe("Factura T group invoice HTTP eligibility", () => {
  it("rejects forged foreign nationality context when the persisted group guest is Argentine", async () => {
    state.dbRows = [[{
      id: "guest-argentine",
      nationality: "Argentina",
      nationality_code: "200",
    }]];

    await withServer(async (baseUrl) => {
      const result = await postInvoice(baseUrl, facturaTBody());

      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(/huésped extranjero/i);
      expect(mockEmitirFactura).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["Argentine", []],
    ["cancelled", []],
    ["not a member of the group", []],
  ])("rejects a %s guest even when the client claims foreign nationality", async (_label, trustedGuestRows) => {
    // The trusted SQL query returns no row for an Argentine guest, a
    // cancelled reservation, or a reservation not linked to this group.
    state.dbRows = [trustedGuestRows];

    await withServer(async (baseUrl) => {
      const result = await postInvoice(baseUrl, facturaTBody());

      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(/huésped extranjero/i);
      expect(mockEmitirFactura).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["company", {
      destination: "master_folio",
      billing_entity_id: "company-1",
      receiver_details: { razonSocial: "Empresa SA", cuit: "30712345678" },
    }],
    ["agency", {
      destination: "master_folio",
      billing_entity_id: "agency-1",
      receiver_details: { razonSocial: "Agencia SRL", cuit: "30787654321" },
    }],
    ["distributed", {
      destination: "group_distribution",
      billing_entity_id: null,
      receiver_details: { dni: GUEST_DOCUMENT },
    }],
  ])("rejects a %s or distributed group payment", async (_label, payment) => {
    state.dbRows = [[{
      id: "guest-foreign",
      nationality: "Brasil",
      nationality_code: "105",
    }], [payment]];

    await withServer(async (baseUrl) => {
      const result = await postInvoice(baseUrl, facturaTBody());

      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(/cobro del Folio Maestro/i);
      expect(mockEmitirFactura).not.toHaveBeenCalled();
      expect(mockAssertGroupInvoiceAllocation).not.toHaveBeenCalled();
    });
  });

  it("accepts a foreign group guest on an accommodation-only Folio Maestro payment in fictitious ARCA mode", async () => {
    state.dbRows = [
      [{
        id: "guest-foreign",
        nationality: "Brasil",
        nationality_code: "105",
      }],
      [{
        destination: "master_folio",
        billing_entity_id: null,
        receiver_details: { dni: GUEST_DOCUMENT },
      }],
      [{
        amount: "100.00",
        invoice_id: null,
        has_active_claim: false,
      }],
    ];

    await withServer(async (baseUrl) => {
      const result = await postInvoice(baseUrl, facturaTBody());

      expect(result.status).toBe(201);
      expect(result.body.modoFicticio).toBe(true);
      expect(mockAssertGroupInvoiceAllocation).toHaveBeenCalledWith(
        GROUP_ID,
        { [ACCOMMODATION_SOURCE]: 100 },
        100,
      );
      expect(mockEmitirFactura).toHaveBeenCalledWith(expect.objectContaining({
        tipoComprobante: "FT",
        groupId: GROUP_ID,
        groupPaymentId: PAYMENT_ID,
        cliente: expect.objectContaining({ dni: GUEST_DOCUMENT }),
      }));
    });
  });
});