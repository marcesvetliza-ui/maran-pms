import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { InvoiceDialog } = await import("./purchase-invoices");
const suppliers = [{ id: 1, razonSocial: "Proveedor Uno SA", cuit: "30-11111111-1", condicionIva: "Responsable Inscripto" }];

function renderDialog(unifiedLayout = true) {
  return render(
    <QueryClientProvider client={queryClient}>
      <InvoiceDialog open onClose={vi.fn()} suppliers={suppliers} accounts={[]} embedded unifiedLayout={unifiedLayout} />
    </QueryClientProvider>,
  );
}

describe("Compras: proveedores, artículos e importe", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([true, false])("usa el ABM en vez de altas rápidas o artículos nuevos (layout unificado: %s)", async (unified) => {
    const user = userEvent.setup();
    renderDialog(unified);
    expect(screen.queryByTestId("btn-quick-create-supplier")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cargar proveedor en el ABM" })).toHaveAttribute("href", "/accounting-suppliers");
    await user.click(screen.getByTestId("select-supplier"));
    expect(screen.queryByText("— Ingresar manual —")).not.toBeInTheDocument();
    await user.click(await screen.findByText("Proveedor Uno SA"));
    expect(screen.getByTestId("input-proveedor-nombre")).toHaveValue("Proveedor Uno SA");
    expect(screen.getByTestId("input-proveedor-cuit")).toHaveValue("30-11111111-1");
    expect(screen.getByTestId("input-proveedor-nombre")).toHaveAttribute("readonly");
    expect(screen.getByTestId("input-proveedor-cuit")).toHaveAttribute("readonly");

    if (!unified) {
      for (let step = 0; step < 4; step++) await user.click(screen.getByTestId("btn-next-step"));
    }
    await user.click(screen.getByTestId("btn-add-inv-item"));
    expect(screen.getByTestId("select-existing-item-0")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-mode-new-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-inv-name-0")).not.toBeInTheDocument();
  });

  it("impide guardar una factura en cero y conserva la carga de servicios sin stock", async () => {
    const captured: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/api/purchase-invoices") && options?.method === "POST") {
        captured.push(JSON.parse(String(options.body)));
        return new Response(JSON.stringify({ id: 99, numero_comprobante: "123" }), { status: 201 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("select-supplier"));
    await user.click(await screen.findByText("Proveedor Uno SA"));
    await user.type(screen.getByTestId("input-numero-comprobante"), "123");
    expect(screen.getByTestId("btn-submit-invoice")).toBeDisabled();
    await user.type(screen.getByTestId("input-neto-line-0"), "100");
    expect(screen.getByTestId("btn-submit-invoice")).toBeEnabled();
    expect(screen.queryAllByTestId(/^row-inv-item-/)).toHaveLength(0);
    await user.click(screen.getByTestId("btn-submit-invoice"));
    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0]).toMatchObject({ tipoComprobante: "FACT-A", supplierId: 1, montoNeto: "100.00" });
    expect(vi.mocked(fetch).mock.calls.some(([url, options]) => String(url).endsWith("/api/inventory/items") && options?.method === "POST")).toBe(false);
  });

  it("un Remito sin importe mantiene habilitado el guardado cuando ya se eligió proveedor", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("select-tipo-comprobante"));
    await user.click(await screen.findByRole("option", { name: "Remito" }));
    expect(screen.getByTestId("btn-submit-invoice")).toBeDisabled();
    await user.click(screen.getByTestId("select-supplier"));
    await user.click(await screen.findByText("Proveedor Uno SA"));
    expect(screen.getByTestId("btn-submit-invoice")).toBeEnabled();
  });

  it("envía los artículos dentro del mismo POST y no hace altas de stock posteriores", async () => {
    const captured: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/api/inventory/items") && !options?.method) {
        return new Response(JSON.stringify([{ id: "item-1", name: "Filtro", unit: "unidad", currentStock: "1" }]), { status: 200 });
      }
      if (url.endsWith("/api/purchase-invoices") && options?.method === "POST") {
        captured.push(JSON.parse(String(options.body)));
        return new Response(JSON.stringify({ id: 99 }), { status: 201 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("select-tipo-comprobante"));
    await user.click(await screen.findByRole("option", { name: "Remito" }));
    await user.click(screen.getByTestId("select-supplier"));
    await user.click(await screen.findByText("Proveedor Uno SA"));
    await user.type(screen.getByTestId("input-numero-comprobante"), "R-123");
    await user.click(screen.getByTestId("btn-add-inv-item"));
    await user.click(screen.getByTestId("select-existing-item-0"));
    await user.click(await screen.findByText("Filtro"));
    await user.clear(screen.getByTestId("input-inv-qty-0"));
    await user.type(screen.getByTestId("input-inv-qty-0"), "2");
    await user.click(screen.getByTestId("btn-submit-invoice"));
    await waitFor(() => expect(captured).toHaveLength(1));
    expect(captured[0].stockItems).toEqual([{ itemId: "item-1", warehouseId: null, quantity: "2", unitCost: "0" }]);
    expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });
});
