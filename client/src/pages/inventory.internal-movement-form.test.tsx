import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { InternalMovementForm } from "./inventory";
import { queryClient } from "@/lib/queryClient";

/**
 * Guarda el contrato de InternalMovementForm tras extraerlo de InventoryPage
 * (donde vivía embebido, compartiendo estado por clausura) para que también
 * pueda usarse desde el Centro de Comprobantes. La lógica de negocio (motivo,
 * carga de ítems, botón de confirmar deshabilitado sin ítems) es la misma que
 * tenía el diálogo original — este test no existía antes de la extracción.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

function renderForm(props: { embedded?: boolean; open: boolean; onClose: () => void }) {
  return render(
    <QueryClientProvider client={queryClient}>
      <InternalMovementForm {...props} />
    </QueryClientProvider>,
  );
}

describe("InternalMovementForm", () => {
  it("modo modal: se abre dentro de un Dialog real con su título", () => {
    renderForm({ open: true, onClose: vi.fn() });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Nuevo Movimiento Interno")).toBeInTheDocument();
    expect(screen.getByTestId("select-im-motivo")).toBeInTheDocument();
  });

  it("modo embebido: no hay chrome de Dialog, pero el mismo formulario está presente", () => {
    renderForm({ embedded: true, open: true, onClose: vi.fn() });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const embedded = screen.getByTestId("internal-movement-embedded");
    expect(within(embedded).getByText("Nuevo Movimiento Interno")).toBeInTheDocument();
    expect(within(embedded).getByTestId("select-im-motivo")).toBeInTheDocument();
  });

  it("el motivo por defecto es Desayuno y ofrece los cuatro motivos existentes", async () => {
    const user = userEvent.setup();
    renderForm({ embedded: true, open: true, onClose: vi.fn() });

    await user.click(screen.getByTestId("select-im-motivo"));
    for (const label of ["🍳 Desayuno", "🎉 Evento", "🗑️ Desperdicio", "📋 Otro"]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  it("el botón de confirmar arranca deshabilitado hasta agregar un ítem", async () => {
    const user = userEvent.setup();
    renderForm({ embedded: true, open: true, onClose: vi.fn() });

    expect(screen.getByTestId("btn-confirm-internal-mov")).toBeDisabled();

    await user.click(screen.getByTestId("btn-add-im-item"));
    expect(screen.getByTestId("select-im-item-0")).toBeInTheDocument();
    expect(screen.getByTestId("input-im-qty-0")).toBeInTheDocument();
    // Sigue deshabilitado: se agregó la fila pero todavía no se eligió artículo.
    expect(screen.getByTestId("btn-confirm-internal-mov")).toBeDisabled();
  });

  it("Cancelar llama a onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderForm({ embedded: true, open: true, onClose });

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
