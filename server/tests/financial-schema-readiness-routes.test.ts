import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const unavailableError = Object.assign(
  new Error("Los cobros están temporalmente deshabilitados: falta una actualización de la base de datos."),
  { statusCode: 503 },
);

const mockStorage = {
  getEvent: vi.fn(),
  createEventPayment: vi.fn(),
  updateEvent: vi.fn(),
  registerCashMovement: vi.fn(),
  addFolioPayment: vi.fn(),
  createAccountMovement: vi.fn(),
  getRestaurantOrder: vi.fn(),
  updateRestaurantOrder: vi.fn(),
  updateOrderItem: vi.fn(),
};

const mockEmitirFactura = vi.fn();
const mockAssertFinancialSchemaReady = vi.fn(() => {
  throw unavailableError;
});

vi.mock("../db-storage", () => ({
  storage: mockStorage,
  getArgentinaToday: vi.fn(),
}));
vi.mock("../migrate", () => ({
  assertFinancialSchemaReady: mockAssertFinancialSchemaReady,
}));
vi.mock("../auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
  requireRole: () => (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../db", () => ({
  db: { execute: vi.fn(), select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  pool: { query: vi.fn(), connect: vi.fn() },
}));
vi.mock("../billing/invoiceService", () => ({
  emitirFactura: mockEmitirFactura,
  calcularMontos: vi.fn(),
}));
vi.mock("../billing/billingConfig", () => ({
  getBillingConfig: vi.fn(),
  updateBillingConfig: vi.fn(),
}));
vi.mock("../billing/invoicePdf", () => ({
  generarFacturaPDF: vi.fn(),
  generarVoucherHabitacionPDF: vi.fn(),
}));
vi.mock("../eventPdfs", () => ({
  generateHojaFuncionPdf: vi.fn(),
  generateConfirmacionEventoPdf: vi.fn(),
  generateTablesResumenPdf: vi.fn(),
  generateTableReceiptPdf: vi.fn(),
}));
vi.mock("../restaurantPdfs", () => ({ generateRestaurantOrderReceiptPdf: vi.fn() }));
vi.mock("../email-service", () => ({ sendEmailWithPdfAttachment: vi.fn() }));
vi.mock("../utils/assetPath", () => ({ assetPath: (value: string) => value }));
vi.mock("../billing/groupInvoiceScope", () => ({
  assertGroupInvoiceAllocation: vi.fn(),
  assertGroupPaymentInvoiceEligibility: vi.fn(),
}));
vi.mock("pdfkit", () => ({ default: class PDFDocument {} }));

const { registerEventsRoutes } = await import("../routes/events");
const { registerRestaurantRoutes } = await import("../routes/restaurant");
const { registerBillingRoutes } = await import("../billing/routes");

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: "admin-1", username: "admin", fullName: "Admin" };
    next();
  });
  registerEventsRoutes(app);
  registerRestaurantRoutes(app);
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

async function post(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as { error: string } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertFinancialSchemaReady.mockImplementation(() => { throw unavailableError; });
  mockStorage.getEvent.mockResolvedValue({ id: "event-1", status: "confirmed" });
  mockStorage.getRestaurantOrder.mockResolvedValue({
    id: "order-1",
    orderNumber: 12,
    status: "open",
    total: "100.00",
  });
});

afterEach(() => vi.clearAllMocks());

describe("financial schema readiness route guard", () => {
  it("returns 503 before any Cuenta Corriente payment, order, or invoice write", async () => {
    await withServer(async (baseUrl) => {
      const attempts = await Promise.all([
        post(baseUrl, "/api/events/event-1/payments", {
          amount: "100.00",
          method: "cuenta_corriente",
          ccEntityType: "company",
          ccEntityId: "company-1",
        }),
        post(baseUrl, "/api/restaurant/orders/order-1/close", {
          paymentMethod: "cuenta_corriente",
          ccEntityType: "company",
          ccEntityId: "company-1",
        }),
        post(baseUrl, "/api/restaurant/orders/order-1/pay-items", {
          itemIds: ["item-1"],
          method: "cuenta_corriente",
          ccEntityType: "company",
          ccEntityId: "company-1",
        }),
        post(baseUrl, "/api/billing/invoices", {
          tipoComprobante: "FB",
          cliente: { razonSocial: "Empresa", condicionIva: "consumidor_final" },
          items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 100, subtotal: 100 }],
          cashFormaPago: "cuenta_corriente",
          ccEntityType: "company",
          ccEntityId: "company-1",
        }),
      ]);

      for (const attempt of attempts) {
        expect(attempt.status).toBe(503);
        expect(attempt.body.error).toMatch(/temporalmente deshabilitados/i);
      }
    });

    expect(mockAssertFinancialSchemaReady).toHaveBeenCalledTimes(4);
    expect(mockStorage.createEventPayment).not.toHaveBeenCalled();
    expect(mockStorage.updateRestaurantOrder).not.toHaveBeenCalled();
    expect(mockStorage.updateOrderItem).not.toHaveBeenCalled();
    expect(mockStorage.createAccountMovement).not.toHaveBeenCalled();
    expect(mockEmitirFactura).not.toHaveBeenCalled();
  });
});