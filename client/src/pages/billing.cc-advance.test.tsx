import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const apiRequestMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }) }));
vi.mock("@/lib/queryClient", async importOriginal => {
  const mod = await importOriginal<typeof import("@/lib/queryClient")>();
  return { ...mod, apiRequest: apiRequestMock, queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) };
});
const { EmitirFacturaDialog } = await import("./billing");

describe("EmitirFacturaDialog — existing Cuenta Corriente advance", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue(new Response(JSON.stringify({ id: 88, tipoComprobante: "FB", puntoVenta: 1, numero: 1, montoTotal: "144000" }), { status: 201 }));
  });

  it("locks payment controls and links the edited invoice without a generic payment update", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EmitirFacturaDialog
        open onClose={vi.fn()} config={{ puntoVenta: 1 }} skipReview showPaymentMethod lockItems
        paymentId="pay-cc" reservationId="res-1"
        initialValues={{
          razonSocial: "ESCO", condicionIva: "Consumidor Final", paymentMethod: "cuenta_corriente",
          ccEntityType: "company", ccEntityId: "company-1",
          items: [{ descripcion: "Alojamiento", precioUnitario: 144000 }],
        }}
      />
    </QueryClientProvider>);

    expect(screen.getByTestId("select-cash-forma-pago")).toBeDisabled();
    expect(screen.getByTestId("select-cc-entity-type")).toBeDisabled();
    expect(screen.getByTestId("select-cc-entity-id")).toBeDisabled();
    expect(screen.getByTestId("item-description-0")).not.toBeDisabled();
    expect(screen.getByTestId("item-quantity-0")).toBeDisabled();
    expect(screen.getByTestId("item-price-0")).toBeDisabled();
    expect(screen.getByTestId("item-iva-0")).toBeDisabled();
    await user.clear(screen.getByTestId("item-description-0"));
    await user.type(screen.getByTestId("item-description-0"), "Alojamiento editado");
    await user.click(screen.getByTestId("btn-emitir-confirmar"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/billing/invoices", expect.objectContaining({
      cashFormaPago: "cuenta_corriente", ccEntityType: "company", ccEntityId: "company-1",
      items: [expect.objectContaining({ descripcion: "Alojamiento editado" })],
    })));
    expect(apiRequestMock.mock.calls.some(([method, path]) => method === "PATCH" && path === "/api/payments/pay-cc")).toBe(false);
    expect(apiRequestMock).toHaveBeenCalledWith("PATCH", "/api/payments/pay-cc/invoice", expect.anything());
  });
});