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

    expect(screen.getByText(/todavía no está construido/i)).toBeInTheDocument();
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
  });

  it("un rol sin ningún área habilitada ve el mensaje de acceso, no el selector", () => {
    mockRole = "housekeeping";
    renderPage();
    expect(screen.getByText(/no tiene ningún área habilitada/i)).toBeInTheDocument();
    expect(screen.queryByTestId("select-area")).not.toBeInTheDocument();
  });
});
