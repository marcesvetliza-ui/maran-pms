import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import { TransferStockForm } from "@/pages/inventory";
import { InvoiceDialog } from "@/pages/purchase-invoices";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const suppliers = [{ id: 1, razonSocial: "Proveedor Prueba", cuit: "30-00000000-0", condicionIva: "responsable_inscripto" }];
beforeEach(() => {
  queryClient.clear();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const data = String(url).endsWith("/inventory/warehouses")
      ? [{ id: "test-a", name: "Central", isActive: true }, { id: "test-b", name: "Cocina", isActive: true }] : [];
    return new Response(JSON.stringify(data), { status: 200 });
  }));
});
afterEach(async () => {
  cleanup(); queryClient.clear(); vi.unstubAllGlobals();
  await new Promise(resolve => setTimeout(resolve, 20));
});

describe("Integración de teclado en formularios reales", () => {
  it.each([false, true])("transferencia: sale del depósito sin elegir ni transferir, modal=%s", async modal => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={queryClient}><TransferStockForm embedded={!modal} open onClose={vi.fn()} /></QueryClientProvider>);
    const from = await screen.findByTestId("select-from-warehouse");
    await user.click(from);
    await screen.findByRole("option", { name: "Central" });
    await user.keyboard("{ArrowDown}");
    await user.tab();
    await waitFor(() => expect(screen.getByTestId("select-to-warehouse")).toHaveFocus());
    expect(from).toHaveTextContent("Depósito origen");
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
  });
  it("transferencia: agregar y quitar filas conserva el foco y los valores", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={queryClient}><TransferStockForm embedded open onClose={vi.fn()} /></QueryClientProvider>);
    await screen.findByTestId("select-from-warehouse");
    await user.clear(screen.getByTestId("input-transfer-qty-0"));
    await user.type(screen.getByTestId("input-transfer-qty-0"), "7");
    await user.click(screen.getByTestId("btn-add-transfer-row"));
    const row = screen.getByTestId("row-transfer-item-1");
    expect(within(row).getByRole("combobox")).toHaveFocus();
    await user.click(screen.getByTestId("btn-remove-transfer-row-1"));
    expect(within(screen.getByTestId("row-transfer-item-0")).getByRole("combobox")).toHaveFocus();
    expect(screen.getByTestId("input-transfer-qty-0")).toHaveValue(7);
  });
  it("compras: TAB sale del proveedor sin confirmar y flechas/Enter sí seleccionan", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={queryClient}><InvoiceDialog embedded unifiedLayout open
      suppliers={suppliers} accounts={[]} onClose={vi.fn()} /></QueryClientProvider>);
    const input = screen.getByTestId("select-supplier");
    await user.type(input, "Prueba");
    await user.tab();
    await waitFor(() => expect(screen.getByTestId("input-proveedor-nombre")).toHaveFocus());
    expect(input).toHaveValue("Prueba");
    await user.click(input);
    // Up selects the last actual supplier; issuer creation stays in the ABM.
    await user.keyboard("{ArrowUp}{Enter}");
    expect(input).toHaveValue("Proveedor Prueba");
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
  });
});
