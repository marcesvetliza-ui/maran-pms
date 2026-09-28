import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Una Nota de Crédito nunca toca los cobros ni el saldo de Cuenta Corriente
 * de la factura original (ver server/billing/routes.ts: "a credit note
 * deliberately leaves all payments untouched"). Confirmado con el usuario:
 * en vez de revertir esa decisión de diseño, la pantalla ahora muestra
 * cómo se cobró la factura y avisa explícitamente que hay que ajustar eso
 * aparte — antes solo mostraba "pago_dividido" sin desglose ni aviso.
 */

const apiRequestMock = vi.fn();

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

const { NotaCreditoDialog } = await import("./billing");

const splitPaymentInvoice = {
  id: 56,
  reserva_id: "reservation-2",
  tipo_comprobante: "FA",
  punto_venta: 21,
  numero: 56,
  fecha_emision: "2026-09-24",
  cliente_razon_social: "Aerolineas Argentinas SA",
  cliente_cuit: "30-64140555-4",
  monto_total: "1000000.00",
  monto_acreditado: "0.00",
  estado: "emitida",
  cash_forma_pago: "pago_dividido",
  cash_forma_pago_detalle: [
    { method: "cuenta_corriente", amount: 500000 },
    { method: "efectivo", amount: 500000 },
  ],
  source_charge_ids: JSON.stringify(["accommodation"]),
  source_charge_amounts: JSON.stringify({ accommodation: 1000000 }),
  credit_source_charge_amounts: [],
  items: JSON.stringify([{ descripcion: "Alojamiento", subtotal: 1000000 }]),
};

const singlePaymentInvoice = {
  ...splitPaymentInvoice,
  id: 57,
  cash_forma_pago: "transferencia",
  cash_forma_pago_detalle: undefined,
};

function renderDialog(invoiceId: number, invoice: any) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify(invoice),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )));
  return render(
    <QueryClientProvider client={queryClient}>
      <NotaCreditoDialog invoiceId={invoiceId} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiRequestMock.mockReset();
  vi.stubGlobal("open", vi.fn());
});

describe("NotaCreditoDialog — desglose de pago y aviso de Cuenta Corriente", () => {
  it("con pago dividido, muestra cada forma de pago con su importe", async () => {
    renderDialog(56, splitPaymentInvoice);

    await waitFor(() => expect(screen.getByText("Cómo se cobró")).toBeInTheDocument());
    expect(screen.getByText("Cuenta Corriente: $500.000,00")).toBeInTheDocument();
    expect(screen.getByText("Efectivo: $500.000,00")).toBeInTheDocument();
  });

  it("con pago dividido, avisa que la NC no toca los cobros ni la Cuenta Corriente", async () => {
    renderDialog(56, splitPaymentInvoice);

    const warning = await screen.findByTestId("nc-payment-untouched-warning");
    expect(warning).toHaveTextContent(/no modifica los cobros/i);
    expect(warning).toHaveTextContent(/Cuenta Corriente/);
  });

  it("con un solo método de pago (sin detalle), no muestra el desglose ni el aviso", async () => {
    renderDialog(57, singlePaymentInvoice);

    await waitFor(() => expect(screen.getByText("Cómo se cobró")).toBeInTheDocument());
    expect(screen.getByText("transferencia")).toBeInTheDocument();
    expect(screen.queryByTestId("nc-payment-untouched-warning")).not.toBeInTheDocument();
  });
});
