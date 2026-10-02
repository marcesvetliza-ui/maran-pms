import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import InventoryPage from "./inventory";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

function renderInventory() {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url.includes("/consumo-report")
      ? { items: [], totalCosto: 0 }
      : url.includes("/internal-movements/report")
        ? { items: [], totalCost: 0 }
        : [{
          id: "internal-test",
          date: "2026-10-02",
          motivo: "desayuno",
          descripcion: "Descarga de prueba",
          item_count: 1,
          total_cost: "5.00",
        }],
  }));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        queryFn: async ({ queryKey }) => queryKey[0] === "/api/inventory/movements"
          ? [{
            id: "movement-test",
            item: { name: "Azúcar de prueba" },
            movementType: "entrada",
            quantity: "1.000",
            previousStock: "0",
            newStock: "1.000",
            createdAt: "2026-10-02T12:00:00Z",
          }]
          : [],
      },
    },
  });
  render(<QueryClientProvider client={client}><InventoryPage /></QueryClientProvider>);
  return { client, fetchMock };
}

describe("Inventario: movimientos agrupados", () => {
  it("agrupa las tres vistas y conserva filtros, selección y funciones existentes", async () => {
    const user = userEvent.setup();
    const { client, fetchMock } = renderInventory();
    await screen.findByTestId("tab-items");
    const mainTabs = screen.getByRole("tablist", { name: "Secciones de inventario" });
    expect(within(mainTabs).getByRole("tab", { name: "Marcas" })).toBeInTheDocument();
    expect(screen.getByTestId("button-goto-suppliers").closest("a")).toHaveAttribute("href", "/accounting-suppliers");
    expect(within(mainTabs).queryByRole("tab", { name: "Consumos" })).not.toBeInTheDocument();
    expect(within(mainTabs).queryByRole("tab", { name: /Mov.*Internos/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-goto-purchase-invoices")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-internal-movement")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(mainTabs).getByRole("tab", { name: "Movimientos" }));
    const nestedTabs = screen.getByRole("tablist", { name: "Vistas de movimientos" });
    expect(within(nestedTabs).getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByTestId("tab-movements-general")).toHaveAttribute("aria-selected", "true");
    await screen.findByText("Azúcar de prueba");
    await user.type(screen.getByPlaceholderText("Buscar artículo..."), "Azúcar");

    await user.click(screen.getByTestId("tab-consumos"));
    await screen.findByTestId("text-consumo-empty");
    expect(screen.getByTestId("tab-movements")).toHaveAttribute("aria-selected", "true");
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/consumo-report"))).toBe(true);
    const consumoDate = (screen.getByTestId("input-consumo-from") as HTMLInputElement).value;
    expect(screen.getByTestId("btn-print-consumo")).toBeInTheDocument();

    await user.click(screen.getByTestId("tab-internos"));
    await screen.findByText("Descarga de prueba");
    expect(screen.getByTestId("btn-new-internal-mov")).toBeInTheDocument();
    expect(screen.getByTitle("Imprimir voucher")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/internal-movements/report"))).toBe(true);

    await user.click(screen.getByTestId("tab-items"));
    expect(screen.queryByRole("tablist", { name: "Vistas de movimientos" })).not.toBeInTheDocument();
    await waitFor(() => {
      const queries = client.getQueryCache().findAll({ queryKey: ["/api/inventory/internal-movements"] });
      expect(queries.length).toBeGreaterThan(0);
      expect(queries.every(query => !query.isActive())).toBe(true);
    });
    await user.click(screen.getByTestId("tab-movements"));
    expect(screen.getByTestId("tab-internos")).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByTestId("tab-consumos"));
    expect(screen.getByTestId("input-consumo-from")).toHaveValue(consumoDate);
    await user.click(screen.getByTestId("tab-movements-general"));
    expect(screen.getByPlaceholderText("Buscar artículo...")).toHaveValue("Azúcar");
    expect(screen.getByText("Azúcar de prueba")).toBeInTheDocument();
    client.clear();
  });
});