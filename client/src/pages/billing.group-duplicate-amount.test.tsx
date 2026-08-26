import { render, screen, waitFor } from "@testing-library/react";
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

const { EmitirFacturaDialog } = await import("./billing");

const groupInvoiceSources = [
  {
    id: "group-charge:dup-1",
    concept: "Duplicado Test",
    destination: "Grupo",
    eligible: 20,
    invoiced: 8,
    available: 12,
  },
];

function renderDialog(precioUnitario: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EmitirFacturaDialog
        open={true}
        onClose={vi.fn()}
        config={{ puntoVenta: 1 }}
        compactMode
        lockItems
        groupId="group-1"
        groupInvoiceSources={groupInvoiceSources}
        initialValues={{
          razonSocial: "Test Group",
          condicionIva: "Consumidor Final",
          items: [{ descripcion: "Duplicado Test", precioUnitario }],
        }}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue(
    new Response(JSON.stringify({ id: 99, tipo_comprobante: "FB", punto_venta: 1, numero: 1, cae: "123" }), { status: 201 }),
  );
  vi.stubGlobal("open", vi.fn());
});

const groupPaymentDestinations = [
  { id: "payment-a", concept: "Cobro grupal", destination: "Folio Maestro", eligible: 50, invoiced: 50, available: 0, invoiceId: 100 },
  { id: "payment-b", concept: "Cobro grupal", destination: "Folio Maestro", eligible: 30, invoiced: 15, available: 15, invoiceId: null },
];

function renderPaymentDialog(groupPaymentId: string, precioUnitario: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EmitirFacturaDialog
        open={true}
        onClose={vi.fn()}
        config={{ puntoVenta: 1 }}
        compactMode
        groupPaymentId={groupPaymentId}
        groupPaymentGroupId="group-1"
        groupPaymentDestinations={groupPaymentDestinations}
        initialValues={{
          razonSocial: "Test Group",
          condicionIva: "Consumidor Final",
          items: [{ descripcion: "Cobro grupal", precioUnitario }],
        }}
      />
    </QueryClientProvider>,
  );
}

describe("EmitirFacturaDialog — confirmación de importe duplicado (grupos)", () => {
  it("advierte antes de emitir cuando el importe coincide con uno ya facturado para el mismo concepto", async () => {
    const user = userEvent.setup();
    renderDialog(8); // matches the source's already-invoiced amount (8)

    const confirmBtn = await screen.findByTestId("btn-confirmar-emitir");
    await user.click(confirmBtn);

    expect(await screen.findByText(/Importe igual o muy cercano a uno ya facturado/i)).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("btn-confirmar-importe-duplicado"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/billing/invoices", expect.anything()));
  });

  it("no advierte cuando el importe no coincide con nada ya facturado", async () => {
    const user = userEvent.setup();
    renderDialog(12); // matches the full *available* balance, not the invoiced amount

    const confirmBtn = await screen.findByTestId("btn-confirmar-emitir");
    await user.click(confirmBtn);

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/billing/invoices", expect.anything()));
    expect(screen.queryByText(/Importe igual o muy cercano a uno ya facturado/i)).not.toBeInTheDocument();
  });

  it("compara contra el cobro grupal correcto por groupPaymentId, no contra el primero de la lista", async () => {
    const user = userEvent.setup();
    // "payment-b" is the second entry in groupPaymentDestinations and already
    // has $15 invoiced. Emitting $15 against it must warn even though the
    // first destination in the array ("payment-a") has a different amount.
    renderPaymentDialog("payment-b", 15);

    const confirmBtn = await screen.findByTestId("btn-confirmar-emitir");
    await user.click(confirmBtn);

    expect(await screen.findByText(/Importe igual o muy cercano a uno ya facturado/i)).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("no advierte para un cobro grupal cuyo importe no coincide con el ya facturado", async () => {
    const user = userEvent.setup();
    renderPaymentDialog("payment-b", 7); // unrelated to either destination's invoiced amount

    const confirmBtn = await screen.findByTestId("btn-confirmar-emitir");
    await user.click(confirmBtn);

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/billing/invoices", expect.anything()));
    expect(screen.queryByText(/Importe igual o muy cercano a uno ya facturado/i)).not.toBeInTheDocument();
  });
});
