import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";

// Regression coverage for the strict Condición IVA → comprobante split
// (Responsable Inscripto/Exento → FA/MiPyme A only; everyone else → FB
// only) directly in the shared EmitirFacturaDialog — this dialog is the
// single point of invoice emission for reservations, restaurant, spa,
// groups and events, so a mismatch here reaches every one of those flows,
// not just the group-payment selector.

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

function renderDialog(overrides: Partial<{ razonSocial: string; cuit: string; condicionIva: string }> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EmitirFacturaDialog
        open={true}
        onClose={vi.fn()}
        config={{ puntoVenta: 1 }}
        skipReview
        initialValues={{
          razonSocial: overrides.razonSocial ?? "Cliente de Prueba",
          cuit: overrides.cuit,
          condicionIva: overrides.condicionIva ?? "Consumidor Final",
          items: [{ descripcion: "Servicio de prueba", precioUnitario: 100 }],
        }}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue(
    new Response(JSON.stringify({ id: 1, tipo_comprobante: "FB", punto_venta: 1, numero: 1, cae: "123" }), { status: 201 }),
  );
});

describe("EmitirFacturaDialog — split Condición IVA / comprobante", () => {
  it("never lets a manual Factura A selection reach the server paired with a non-eligible condición", async () => {
    const user = userEvent.setup();
    renderDialog({ condicionIva: "Monotributista", cuit: "20123456789" });

    // Starts on FB (correct default for Monotributista). Selecting FA must
    // pull condicionIva along into an eligible value rather than allowing
    // "Factura A" + "Monotributista" to reach the server together.
    await user.click(screen.getByTestId("select-tipo-factura"));
    await user.click(screen.getByRole("option", { name: "Factura A" }));

    await waitFor(() => expect(screen.getByTestId("select-condicion-iva")).toHaveTextContent("Responsable Inscripto"));

    await user.click(screen.getByTestId("btn-emitir-confirmar"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      "/api/billing/invoices",
      expect.objectContaining({
        tipoComprobante: "FA",
        cliente: expect.objectContaining({ condicionIva: "Responsable Inscripto" }),
      }),
    ));
  });

  it("auto-corrects the comprobante away from Factura B when switching condición to Responsable Inscripto", async () => {
    const user = userEvent.setup();
    renderDialog({ condicionIva: "Consumidor Final", cuit: "20123456789" });

    expect(screen.getByTestId("select-tipo-factura")).toHaveTextContent("Factura B");

    await user.click(screen.getByTestId("select-condicion-iva"));
    await user.click(screen.getByRole("option", { name: "Responsable Inscripto" }));

    await waitFor(() => expect(screen.getByTestId("select-tipo-factura")).toHaveTextContent("Factura A"));

    await user.click(screen.getByTestId("btn-emitir-confirmar"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      "/api/billing/invoices",
      expect.objectContaining({ tipoComprobante: "FA" }),
    ));
  });

  it("never lets a manual Factura B selection reach the server paired with an Exento receptor", async () => {
    const user = userEvent.setup();
    renderDialog({ condicionIva: "Exento", cuit: "20123456789" });

    // Mount-time logic already selects FA for Exento. Selecting FB must pull
    // condicionIva along into an eligible value rather than allowing
    // "Factura B" + "Exento" to reach the server together.
    await user.click(screen.getByTestId("select-tipo-factura"));
    await user.click(screen.getByRole("option", { name: "Factura B" }));

    await waitFor(() => expect(screen.getByTestId("select-condicion-iva")).toHaveTextContent("Consumidor Final"));

    await user.click(screen.getByTestId("btn-emitir-confirmar"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      "/api/billing/invoices",
      expect.objectContaining({
        tipoComprobante: "FB",
        cliente: expect.objectContaining({ condicionIva: "Consumidor Final" }),
      }),
    ));
  });

  it("allows Factura A for an Exento receptor with a valid CUIT", async () => {
    const user = userEvent.setup();
    renderDialog({ condicionIva: "Exento", cuit: "20123456789" });

    expect(screen.getByTestId("select-tipo-factura")).toHaveTextContent("Factura A");

    await user.click(screen.getByTestId("btn-emitir-confirmar"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      "/api/billing/invoices",
      expect.objectContaining({ tipoComprobante: "FA" }),
    ));
  });
});
