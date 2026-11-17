import type { Express } from "express";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getEvent: vi.fn(), createEventPayment: vi.fn(), updateEvent: vi.fn(),
  addFolioPayment: vi.fn(), createAccountMovement: vi.fn(),
}));
vi.mock("../db-storage", () => ({ storage }));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../auth", () => ({ requireAuth: vi.fn() }));
vi.mock("../migrate", () => ({ assertFinancialSchemaReady: vi.fn() }));
vi.mock("../eventPdfs", () => ({ generateHojaFuncionPdf: vi.fn(), generateConfirmacionEventoPdf: vi.fn(), generateTablesResumenPdf: vi.fn(), generateTableReceiptPdf: vi.fn() }));
vi.mock("../billing/invoiceService", () => ({ emitirFactura: vi.fn(), buildComprobanteAsociado: vi.fn() }));
vi.mock("../email-service", () => ({ sendEmailWithPdfAttachment: vi.fn() }));

beforeEach(() => {
  storage.getEvent.mockResolvedValue({ id: "event", name: "Evento", status: "confirmed", companyId: "company", payments: [{ amount: "5000" }] });
  storage.createEventPayment.mockResolvedValue({ id: "payment", amount: "5000" });
  storage.updateEvent.mockResolvedValue({});
  storage.createAccountMovement.mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

it.each(["cuenta_corriente", "efectivo"])("espera el folio antes de responder 201 a un pago %s", async method => {
  const { registerEventsRoutes } = await import("../routes/events");
  let paymentHandler: any;
  const app = {
    get: vi.fn(), patch: vi.fn(), delete: vi.fn(),
    post: (path: string, handler: unknown) => { if (path === "/api/events/:eventId/payments") paymentHandler = handler; },
  };
  registerEventsRoutes(app as unknown as Express);

  let finishFolio!: () => void;
  const folioPending = new Promise<void>(resolve => { finishFolio = resolve; });
  storage.addFolioPayment.mockReturnValue(folioPending);
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const request = { params: { eventId: "event" }, body: { amount: 5000, method }, user: { username: "recepcion" } };
  const handling = paymentHandler(request, response);
  try {
    // Drain resolved storage calls; the folio remains deliberately pending.
    // There is no network, database timing, polling or fixed delay here.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(storage.addFolioPayment).toHaveBeenCalledTimes(1);
    expect(response.json).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
  } finally {
    finishFolio();
    await handling;
  }
  expect(response.status).toHaveBeenCalledWith(201);
  expect(response.json).toHaveBeenCalledWith({ id: "payment", amount: "5000" });
  expect(storage.createEventPayment).toHaveBeenCalledTimes(1);
  expect(storage.updateEvent).toHaveBeenCalledWith("event", { totalPaid: "5000.00" });
  expect(storage.addFolioPayment).toHaveBeenCalledWith("event", "event", 5000, "Pago Evento", method, "event_payment", "payment", undefined, "recepcion");
  expect(storage.createAccountMovement).toHaveBeenCalledTimes(method === "cuenta_corriente" ? 1 : 0);
});
