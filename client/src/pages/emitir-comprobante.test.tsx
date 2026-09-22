import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import EmitirComprobantePage from "./emitir-comprobante";
import { queryClient } from "@/lib/queryClient";

/**
 * Primera etapa del Centro de Comprobantes: solo resuelve la selección de
 * Área → Operación → Tipo, filtrada por rol. Guarda el contrato de esa
 * selección (áreas visibles por rol, área única bloqueada, tipos de voucher
 * no fiscales existentes en vez de un "Voucher" genérico) antes de que se
 * construyan los motores de Venta/Compra/Movimiento sobre esta base.
 */

let mockRole = "admin";
vi.mock("@/App", () => ({
  useAuth: () => ({ user: { id: "user-1", username: "tester", role: mockRole } }),
}));

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <EmitirComprobantePage />
    </QueryClientProvider>,
  );
}

describe("EmitirComprobantePage — selección Área / Operación / Tipo", () => {
  it("admin ve las seis áreas y puede armar Venta > Recepción > Factura B", async () => {
    mockRole = "admin";
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("select-area"));
    for (const label of ["Alojamiento", "Restaurant", "Spa", "Eventos", "Compras", "Inventario"]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
    await user.click(screen.getByRole("option", { name: "Alojamiento" }));

    await user.click(screen.getByTestId("select-operacion"));
    expect(screen.getByRole("option", { name: "Venta" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Compra" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Venta" }));

    await user.click(screen.getByTestId("select-tipo"));
    expect(screen.getByRole("option", { name: "Factura B" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Voucher Habitaciones" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Voucher SPA" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Factura B" }));

    // El motor de Venta reutiliza EmitirFacturaDialog embebido (sin chrome de
    // Dialog) — el tipo ya elegido en el paso anterior queda como única opción.
    const embedded = screen.getByTestId("emitir-factura-embedded");
    expect(within(embedded).getByTestId("select-tipo-factura")).toHaveTextContent("Factura B");
  });

  it("un rol de un área única (spa) arranca con esa área precargada y bloqueada", async () => {
    mockRole = "spa";
    renderPage();

    const areaSelect = screen.getByTestId("select-area");
    expect(within(areaSelect).getByText("Spa")).toBeInTheDocument();
    expect(areaSelect).toBeDisabled();
  });

  it("compra solo ofrece las áreas de compras/inventario, nunca venta por recepción", async () => {
    mockRole = "resp_deposito";
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("select-area"));
    expect(screen.getByRole("option", { name: "Compras" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Inventario" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Alojamiento" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Compras" }));
    await user.click(screen.getByTestId("select-operacion"));
    expect(screen.getByRole("option", { name: "Compra" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Venta" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Compra" }));
    await user.click(screen.getByTestId("select-tipo"));
    expect(screen.getByRole("option", { name: "Factura C" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Factura C" }));

    // El motor de Compra reutiliza InvoiceDialog embebido (sin chrome de Dialog).
    expect(screen.getByTestId("invoice-form-embedded")).toBeInTheDocument();
  });

  it("movimiento interno reutiliza InternalMovementForm embebido, con el motivo ya elegido", async () => {
    mockRole = "resp_deposito";
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("select-area"));
    await user.click(screen.getByRole("option", { name: "Inventario" }));
    await user.click(screen.getByTestId("select-operacion"));
    await user.click(screen.getByRole("option", { name: "Movimiento Interno" }));
    await user.click(screen.getByTestId("select-tipo"));
    await user.click(screen.getByRole("option", { name: "Desperdicio" }));

    const embedded = screen.getByTestId("internal-movement-embedded");
    expect(within(embedded).getByTestId("select-im-motivo")).toHaveTextContent("Desperdicio");
  });

  it("transferencia entre depósitos reutiliza TransferStockForm embebido", async () => {
    mockRole = "resp_deposito";
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("select-area"));
    await user.click(screen.getByRole("option", { name: "Inventario" }));
    await user.click(screen.getByTestId("select-operacion"));
    await user.click(screen.getByRole("option", { name: "Movimiento Interno" }));
    await user.click(screen.getByTestId("select-tipo"));
    await user.click(screen.getByRole("option", { name: "Transferencia entre depósitos" }));

    expect(screen.queryByTestId("internal-movement-embedded")).not.toBeInTheDocument();
    const embedded = screen.getByTestId("transfer-stock-embedded");
    expect(within(embedded).getByTestId("select-from-warehouse")).toBeInTheDocument();
    expect(within(embedded).getByTestId("select-to-warehouse")).toBeInTheDocument();
  });

  it("un rol sin ningún área habilitada ve el mensaje de acceso, no el selector", () => {
    mockRole = "housekeeping";
    renderPage();
    expect(screen.getByText(/no tiene ningún área habilitada/i)).toBeInTheDocument();
    expect(screen.queryByTestId("select-area")).not.toBeInTheDocument();
  });

  it("Venta > Spa ofrece los tres vouchers de SPA (general, Agustín I, Cortesía)", async () => {
    mockRole = "spa";
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("select-operacion"));
    await user.click(screen.getByRole("option", { name: "Venta" }));

    await user.click(screen.getByTestId("select-tipo"));
    expect(screen.getByRole("option", { name: "Voucher SPA" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Voucher SPA — Agustín I" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Voucher SPA — Cortesía" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Voucher SPA — Cortesía" }));

    const embedded = screen.getByTestId("emitir-factura-embedded");
    expect(within(embedded).getByTestId("select-tipo-factura")).toHaveTextContent("Voucher SPA — Cortesía — Comprobante interno");
  });

  it("Venta > Recepción ofrece Factura T y abre la búsqueda de reserva (no el diálogo genérico)", async () => {
    mockRole = "admin";
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("select-area"));
    await user.click(screen.getByRole("option", { name: "Alojamiento" }));
    await user.click(screen.getByTestId("select-operacion"));
    await user.click(screen.getByRole("option", { name: "Venta" }));

    await user.click(screen.getByTestId("select-tipo"));
    expect(screen.getByRole("option", { name: "Factura T (Turismo)" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Factura T (Turismo)" }));

    expect(screen.getByTestId("input-buscar-reserva-ft")).toBeInTheDocument();
    expect(screen.queryByTestId("emitir-factura-embedded")).not.toBeInTheDocument();
  });

  it("Factura T no aparece en Restaurant, Spa ni Eventos — solo alojamiento la ofrece", async () => {
    mockRole = "admin";
    const user = userEvent.setup();

    for (const area of ["Restaurant", "Spa", "Eventos"]) {
      const { unmount } = renderPage();
      await user.click(screen.getByTestId("select-area"));
      await user.click(screen.getByRole("option", { name: area }));
      await user.click(screen.getByTestId("select-operacion"));
      await user.click(screen.getByRole("option", { name: "Venta" }));
      await user.click(screen.getByTestId("select-tipo"));
      expect(screen.queryByRole("option", { name: "Factura T (Turismo)" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("Venta > Recepción ofrece Factura MiPyME B junto a la A", async () => {
    mockRole = "admin";
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("select-area"));
    await user.click(screen.getByRole("option", { name: "Alojamiento" }));
    await user.click(screen.getByTestId("select-operacion"));
    await user.click(screen.getByRole("option", { name: "Venta" }));

    await user.click(screen.getByTestId("select-tipo"));
    expect(screen.getByRole("option", { name: "Factura MiPyME A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Factura MiPyME B" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Factura MiPyME B" }));

    const embedded = screen.getByTestId("emitir-factura-embedded");
    expect(within(embedded).getByTestId("select-tipo-factura")).toHaveTextContent("Factura MiPyme B");
  });

  it("comercial ve todas las áreas, igual que admin", async () => {
    mockRole = "comercial";
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("select-area"));
    for (const label of ["Alojamiento", "Restaurant", "Spa", "Eventos", "Compras", "Inventario"]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  it("responsable_area y resp_administracion ven todas las áreas", async () => {
    for (const role of ["responsable_area", "resp_administracion"]) {
      mockRole = role;
      const user = userEvent.setup();
      const { unmount } = renderPage();

      await user.click(screen.getByTestId("select-area"));
      for (const label of ["Alojamiento", "Restaurant", "Spa", "Eventos", "Compras", "Inventario"]) {
        expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
      }
      unmount();
    }
  });

  it("un rol restringido a un área (reception, restaurant, events) no ve las demás", async () => {
    const cases: Array<[string, string]> = [
      ["reception", "Alojamiento"],
      ["restaurant", "Restaurant"],
      ["events", "Eventos"],
    ];
    for (const [role, label] of cases) {
      mockRole = role;
      const { unmount } = renderPage();
      const areaSelect = screen.getByTestId("select-area");
      expect(within(areaSelect).getByText(label)).toBeInTheDocument();
      expect(areaSelect).toBeDisabled();
      unmount();
    }
  });

  it("jefe_recepcion queda restringido solo a Alojamiento (no ve todo)", () => {
    mockRole = "jefe_recepcion";
    renderPage();
    const areaSelect = screen.getByTestId("select-area");
    expect(within(areaSelect).getByText("Alojamiento")).toBeInTheDocument();
    expect(areaSelect).toBeDisabled();
  });
});
