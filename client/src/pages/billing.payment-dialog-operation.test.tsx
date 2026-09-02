import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

type Operation = {
  id: string;
  receptor: string;
  concepto: string;
  total: number;
};

const operationA: Operation = {
  id: "payment-a",
  receptor: "Operación Alfa",
  concepto: "Sin desglose — Grupo Alfa",
  total: 120,
};

const operationB: Operation = {
  id: "payment-b",
  receptor: "Operación Beta",
  concepto: "Detallado — Habitación 204",
  total: 275,
};

function dialog(operation: Operation, open: boolean, onClose: () => void) {
  return (
    <EmitirFacturaDialog
      open={open}
      onClose={onClose}
      config={{ puntoVenta: 1 }}
      compactMode
      groupPaymentId={operation.id}
      groupPaymentGroupId="group-1"
      initialValues={{
        razonSocial: operation.receptor,
        condicionIva: "Consumidor Final",
        items: [{ descripcion: operation.concepto, precioUnitario: operation.total }],
      }}
    />
  );
}

describe("EmitirFacturaDialog — identidad de la operación", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    vi.stubGlobal("open", vi.fn());
  });

  it("cambia de operación sin conservar la revisión ni las ediciones anteriores", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        {dialog(operationA, true, onClose)}
      </QueryClientProvider>,
    );

    expect(await screen.findByText(operationA.receptor)).toBeInTheDocument();
    expect(screen.getByText(operationA.concepto)).toBeInTheDocument();
    await user.click(screen.getByTestId("button-invoice-edit"));
    await user.clear(screen.getByTestId("input-razon-social"));
    await user.type(screen.getByTestId("input-razon-social"), "Edición temporal");

    view.rerender(
      <QueryClientProvider client={queryClient}>
        {dialog(operationB, true, onClose)}
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText(operationB.receptor)).toBeInTheDocument());
    expect(screen.getByText(operationB.concepto)).toBeInTheDocument();
    expect(screen.queryByText(operationA.concepto)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Edición temporal")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("button-invoice-edit"));
    expect(screen.getByTestId("input-razon-social")).toHaveValue(operationB.receptor);
  });

  it("cancelar, cerrar y reabrir carga sólo los datos de la nueva operación", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        {dialog(operationA, true, onClose)}
      </QueryClientProvider>,
    );

    await user.click(await screen.findByTestId("button-invoice-edit"));
    await user.click(screen.getByTestId("button-invoice-cancel"));
    expect(onClose).toHaveBeenCalledOnce();

    view.rerender(
      <QueryClientProvider client={queryClient}>
        {dialog(operationA, false, onClose)}
      </QueryClientProvider>,
    );
    view.rerender(
      <QueryClientProvider client={queryClient}>
        {dialog(operationB, true, onClose)}
      </QueryClientProvider>,
    );

    expect(await screen.findByText(operationB.receptor)).toBeInTheDocument();
    expect(screen.getByText(operationB.concepto)).toBeInTheDocument();
    expect(screen.queryByText(operationA.concepto)).not.toBeInTheDocument();
  });
});