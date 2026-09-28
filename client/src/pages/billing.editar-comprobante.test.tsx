import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Editar un comprobante ya emitido — el alcance depende del tipo:
 *  · ARCA cobrado desde el Centro de Comprobantes: solo forma de pago (real,
 *    con movimientos de Caja/Cta Cte).
 *  · ARCA de otro circuito (sin center_settlement_area): bloqueado.
 *  · Registrado (cargado a mano): solo forma de pago, informativa.
 *  · Voucher no fiscal: solo datos del cliente.
 * Ver PATCH /api/billing/invoices/:id en server/billing/routes.ts.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/queryClient")>();
  return {
    ...mod,
    apiRequest: apiRequestMock,
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  };
});

const { EditarComprobanteDialog } = await import("./billing");

const centroInvoice = {
  id: 10, tipo_comprobante: "FB", punto_venta: 21, numero: 55,
  cliente_razon_social: "Cliente Centro SA", cliente_condicion_iva: "Consumidor Final",
  monto_total: "1000.00", estado: "emitida",
  center_settlement_area: "recepcion", center_settlement_status: "settled",
  recipient_entity_type: "guest", recipient_entity_id: "guest-1",
  cash_forma_pago: "efectivo", cash_forma_pago_detalle: [{ method: "efectivo", amount: 1000 }],
};

const reservaInvoice = {
  ...centroInvoice, id: 11, center_settlement_area: null, center_settlement_status: null,
};

const reservationCashInvoice = {
  id: 14, tipo_comprobante: "FB", punto_venta: 21, numero: 60,
  cliente_razon_social: "Huésped Recepción", cliente_condicion_iva: "Consumidor Final",
  monto_total: "1000.00", estado: "emitida",
  center_settlement_area: null, center_settlement_status: null,
  reserva_id: "reserva-1",
  cash_forma_pago: "efectivo", cash_forma_pago_detalle: [{ method: "efectivo", amount: 1000 }],
};

const restaurantCashInvoice = {
  id: 15, tipo_comprobante: "FB", punto_venta: 15, numero: 30,
  cliente_razon_social: "Consumidor Final", cliente_condicion_iva: "Consumidor Final",
  monto_total: "500.00", estado: "emitida",
  center_settlement_area: null, center_settlement_status: null,
  restaurant_order_id: "order-1",
  cash_forma_pago: "efectivo", cash_forma_pago_detalle: [{ method: "efectivo", amount: 500 }],
};

const eventCashInvoice = {
  id: 16, tipo_comprobante: "FB", punto_venta: 5, numero: 12,
  cliente_razon_social: "Consumidor Final", cliente_condicion_iva: "Consumidor Final",
  monto_total: "800.00", estado: "emitida",
  center_settlement_area: null, center_settlement_status: null,
  event_id: "event-1", event_payment_method: "efectivo",
  cash_forma_pago: null, cash_forma_pago_detalle: null,
};

const spaCashInvoice = {
  id: 17, tipo_comprobante: "FB", punto_venta: 8, numero: 20,
  cliente_razon_social: "Consumidor Final", cliente_condicion_iva: "Consumidor Final",
  monto_total: "650.00", estado: "emitida",
  center_settlement_area: null, center_settlement_status: null,
  spa_account_id: "spa-1",
  cash_forma_pago: "efectivo", cash_forma_pago_detalle: [{ method: "efectivo", amount: 650 }],
};

const groupCashInvoice = {
  id: 18, tipo_comprobante: "FB", punto_venta: 3, numero: 40,
  cliente_razon_social: "Empresa de Grupo SA", cliente_condicion_iva: "Responsable Inscripto",
  monto_total: "900.00", estado: "emitida",
  center_settlement_area: null, center_settlement_status: null,
  group_payment_id: "group-payment-1", group_payment_method: "efectivo",
  cash_forma_pago: null, cash_forma_pago_detalle: null,
};

const registradaInvoice = {
  id: 12, tipo_comprobante: "FT", punto_venta: 20, numero: 5,
  cliente_razon_social: "Cliente Registrado", cliente_condicion_iva: "Consumidor Final",
  monto_total: "2000.00", estado: "registrada", cash_forma_pago: null, cash_forma_pago_detalle: null,
};

const ticketInvoice = {
  id: 13, tipo_comprobante: "ticket", punto_venta: 2, numero: 8,
  cliente_razon_social: "Consumidor Final", cliente_condicion_iva: "Consumidor Final",
  monto_total: "500.00", estado: "emitida",
};

function renderDialog(invoice: any) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify(invoice), { status: 200, headers: { "Content-Type": "application/json" } },
  )));
  return render(
    <QueryClientProvider client={queryClient}>
      <EditarComprobanteDialog invoiceId={invoice.id} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ json: async () => ({ ok: true }) });
});

describe("EditarComprobanteDialog — ARCA cobrado desde el Centro de Comprobantes", () => {
  it("permite corregir la forma de pago, precargada con la actual", async () => {
    const user = userEvent.setup();
    renderDialog(centroInvoice);

    await waitFor(() => expect(screen.getByTestId("edit-fp-amount-0")).toHaveValue(1000));
    await user.click(screen.getByTestId("edit-fp-method-0"));
    await user.click(screen.getByRole("option", { name: "Transferencia" }));
    await user.click(screen.getByTestId("btn-guardar-edicion-fp"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("PATCH", "/api/billing/invoices/10", {
      cashFormaPagoDetalle: [{ method: "transferencia", amount: 1000 }],
    }));
  });

  it("no deja guardar si la suma no coincide con el total", async () => {
    const user = userEvent.setup();
    renderDialog(centroInvoice);

    const amount = await screen.findByTestId("edit-fp-amount-0");
    await user.clear(amount);
    await user.type(amount, "500");

    expect(screen.getByTestId("edit-fp-error")).toBeInTheDocument();
    expect(screen.getByTestId("btn-guardar-edicion-fp")).toBeDisabled();
  });
});

describe("EditarComprobanteDialog — ARCA sin Centro de Comprobantes", () => {
  it("bloquea la edición de forma de pago con una aclaración", async () => {
    renderDialog(reservaInvoice);
    expect(await screen.findByText(/no se cobró desde el Centro de Comprobantes/)).toBeInTheDocument();
    expect(screen.queryByTestId("edit-fp-add")).not.toBeInTheDocument();
  });
});

describe("EditarComprobanteDialog — factura de reserva cobrada en Caja", () => {
  it("permite corregir entre medios reales de Caja, precargada con el actual", async () => {
    const user = userEvent.setup();
    renderDialog(reservationCashInvoice);

    const select = await screen.findByTestId("select-edit-reserva-fp");
    expect(select).toHaveTextContent("Efectivo");
    await user.click(select);
    await user.click(screen.getByRole("option", { name: "Transferencia" }));
    await user.click(screen.getByTestId("btn-guardar-edicion-fp-reserva"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("PATCH", "/api/billing/invoices/14", {
      cashFormaPago: "transferencia",
    }));
  });

  it("no ofrece Cuenta Corriente como opción", async () => {
    const user = userEvent.setup();
    renderDialog(reservationCashInvoice);

    await user.click(await screen.findByTestId("select-edit-reserva-fp"));
    expect(screen.queryByRole("option", { name: "Cuenta Corriente" })).not.toBeInTheDocument();
  });
});

describe("EditarComprobanteDialog — pedido de Restaurante cobrado en Caja", () => {
  it("permite corregir entre medios reales de Caja, precargada con el actual", async () => {
    const user = userEvent.setup();
    renderDialog(restaurantCashInvoice);

    const select = await screen.findByTestId("select-edit-restaurant-fp");
    expect(select).toHaveTextContent("Efectivo");
    await user.click(select);
    await user.click(screen.getByRole("option", { name: "Transferencia" }));
    await user.click(screen.getByTestId("btn-guardar-edicion-fp-restaurant"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("PATCH", "/api/billing/invoices/15", {
      cashFormaPago: "transferencia",
    }));
  });

  it("no ofrece Cuenta Corriente como opción", async () => {
    const user = userEvent.setup();
    renderDialog(restaurantCashInvoice);

    await user.click(await screen.findByTestId("select-edit-restaurant-fp"));
    expect(screen.queryByRole("option", { name: "Cuenta Corriente" })).not.toBeInTheDocument();
  });
});

describe("EditarComprobanteDialog — factura de Evento cobrada en Caja", () => {
  it("permite corregir entre medios reales de Caja, precargada con el pago real del evento", async () => {
    const user = userEvent.setup();
    renderDialog(eventCashInvoice);

    const select = await screen.findByTestId("select-edit-event-fp");
    expect(select).toHaveTextContent("Efectivo");
    await user.click(select);
    await user.click(screen.getByRole("option", { name: "Transferencia" }));
    await user.click(screen.getByTestId("btn-guardar-edicion-fp-event"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("PATCH", "/api/billing/invoices/16", {
      cashFormaPago: "transferencia",
    }));
  });

  it("no ofrece Cuenta Corriente como opción", async () => {
    const user = userEvent.setup();
    renderDialog(eventCashInvoice);

    await user.click(await screen.findByTestId("select-edit-event-fp"));
    expect(screen.queryByRole("option", { name: "Cuenta Corriente" })).not.toBeInTheDocument();
  });
});

describe("EditarComprobanteDialog — factura de SPA cobrada en Caja", () => {
  it("permite corregir entre medios reales de Caja, precargada con el actual", async () => {
    const user = userEvent.setup();
    renderDialog(spaCashInvoice);

    const select = await screen.findByTestId("select-edit-spa-fp");
    expect(select).toHaveTextContent("Efectivo");
    await user.click(select);
    await user.click(screen.getByRole("option", { name: "Transferencia" }));
    await user.click(screen.getByTestId("btn-guardar-edicion-fp-spa"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("PATCH", "/api/billing/invoices/17", {
      cashFormaPago: "transferencia",
    }));
  });

  it("no ofrece Cuenta Corriente como opción", async () => {
    const user = userEvent.setup();
    renderDialog(spaCashInvoice);

    await user.click(await screen.findByTestId("select-edit-spa-fp"));
    expect(screen.queryByRole("option", { name: "Cuenta Corriente" })).not.toBeInTheDocument();
  });
});

describe("EditarComprobanteDialog — factura de Grupo cobrada en Caja", () => {
  it("permite corregir entre medios reales de Caja, precargada con el actual", async () => {
    const user = userEvent.setup();
    renderDialog(groupCashInvoice);

    const select = await screen.findByTestId("select-edit-group-fp");
    expect(select).toHaveTextContent("Efectivo");
    await user.click(select);
    await user.click(screen.getByRole("option", { name: "Transferencia" }));
    await user.click(screen.getByTestId("btn-guardar-edicion-fp-group"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("PATCH", "/api/billing/invoices/18", {
      cashFormaPago: "transferencia",
    }));
  });

  it("no ofrece Cuenta Corriente como opción", async () => {
    const user = userEvent.setup();
    renderDialog(groupCashInvoice);

    await user.click(await screen.findByTestId("select-edit-group-fp"));
    expect(screen.queryByRole("option", { name: "Cuenta Corriente" })).not.toBeInTheDocument();
  });
});

describe("EditarComprobanteDialog — comprobante registrado", () => {
  it("permite corregir la forma de pago informativa, sin desglose", async () => {
    const user = userEvent.setup();
    renderDialog(registradaInvoice);

    await screen.findByTestId("select-edit-registrada-fp");
    await user.click(screen.getByTestId("select-edit-registrada-fp"));
    await user.click(screen.getByRole("option", { name: "Tarjeta Crédito" }));
    await user.click(screen.getByTestId("btn-guardar-edicion-fp-registrada"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("PATCH", "/api/billing/invoices/12", {
      cashFormaPago: "tarjeta_credito",
    }));
  });
});

describe("EditarComprobanteDialog — voucher no fiscal", () => {
  it("permite corregir los datos del cliente", async () => {
    const user = userEvent.setup();
    renderDialog(ticketInvoice);

    const razonSocial = await screen.findByTestId("input-edit-razon-social");
    expect(razonSocial).toHaveValue("Consumidor Final");
    await user.clear(razonSocial);
    await user.type(razonSocial, "Nuevo Cliente SA");
    await user.click(screen.getByTestId("btn-guardar-edicion-cliente"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("PATCH", "/api/billing/invoices/13", {
      cliente: { razonSocial: "Nuevo Cliente SA", cuit: undefined, dni: undefined, condicionIva: "Consumidor Final", domicilio: undefined },
    }));
  });

  it("no muestra el editor de forma de pago", async () => {
    renderDialog(ticketInvoice);
    await screen.findByTestId("input-edit-razon-social");
    expect(screen.queryByTestId("edit-fp-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId("select-edit-registrada-fp")).not.toBeInTheDocument();
  });
});
