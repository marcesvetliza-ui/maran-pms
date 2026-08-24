import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";

const apiRequestMock = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/queryClient")>();
  return {
    ...mod,
    apiRequest: apiRequestMock,
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
  };
});

const { NotaCreditoDialog } = await import("./billing");

const reservationInvoice = {
  id: 12,
  reserva_id: "reservation-1",
  tipo_comprobante: "FB",
  punto_venta: 7,
  numero: 8,
  fecha_emision: "2026-08-24",
  cliente_razon_social: "Hotel Demo SA",
  cliente_cuit: "30-12345678-9",
  cliente_condicion_iva: "Responsable Inscripto",
  cliente_domicilio: "Av. Siempre Viva 123",
  monto_total: "180.00",
  monto_acreditado: "0.00",
  estado: "emitida",
  cash_forma_pago: "transferencia",
  source_charge_ids: JSON.stringify(["accommodation", "restaurant", "parking"]),
  source_charge_amounts: JSON.stringify({
    accommodation: 100,
    restaurant: 50,
    parking: 30,
  }),
  credit_source_charge_amounts: [],
  items: JSON.stringify([
    { descripcion: "Alojamiento", subtotal: 100 },
    { descripcion: "Cena", subtotal: 50 },
    { descripcion: "Cochera", subtotal: 30 },
  ]),
};

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotaCreditoDialog invoiceId={reservationInvoice.id} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue(
    new Response(JSON.stringify({
      id: 90,
      tipo_comprobante: "NCB",
      punto_venta: 7,
      numero: 15,
      monto_total: "50.00",
    }), { status: 201 }),
  );
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify(reservationInvoice),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )));
  vi.stubGlobal("open", vi.fn());
});

describe("NotaCreditoDialog de Administración", () => {
  it("envía sólo los cargos seleccionados y conserva los datos heredados", async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => expect(screen.getByTestId("checkbox-nc-cargo-restaurant")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("checkbox-nc-cargo-restaurant"));
    expect(screen.getByTestId("checkbox-nc-cargo-restaurant")).toBeChecked();
    await user.type(screen.getByPlaceholderText("Error en facturación, devolución de servicio..."), "Corrección de cena");
    expect(screen.getByTestId("btn-nc-confirmar")).toBeEnabled();
    await user.click(screen.getByTestId("btn-nc-confirmar"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledOnce());
    expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      "/api/billing/invoices/12/nota-credito",
      {
        motivo: "Corrección de cena",
        items: [{ sourceId: "restaurant", amount: 50 }],
      },
    );
  });
});
