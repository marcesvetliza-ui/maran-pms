import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import { InvoiceDialog } from "./purchase-invoices";
beforeEach(() => {
  queryClient.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.includes("/items")
          ? [
              {
                id: "returned-item",
                name: "Artículo devuelto",
                unit: "unidad",
                currentStock: "10",
                costPrice: "100",
                ivaRate: "21",
              },
            ]
          : url.includes("/warehouses")
            ? [{ id: "wh", name: "Depósito General", is_active: "true" }]
            : [],
      ),
    ),
  );
});
afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});
it.each([
  ["NC-A", "242,00"],
  ["NC-M", "242,00"],
  ["NC-B", "200,00"],
  ["NC-C", "200,00"],
])(
  "includes articles in the %s total and labels them as a return",
  async (tipo, expected) => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <InvoiceDialog
          open
          embedded
          unifiedLayout
          initialTipo={tipo}
          onClose={vi.fn()}
          suppliers={[]}
          accounts={[]}
        />
      </QueryClientProvider>,
    );
    expect(
      screen.getByText(/Elegí los artículos devueltos al proveedor/),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("btn-add-inv-item"));
    await user.click(await screen.findByTestId("select-existing-item-0"));
    await user.click(await screen.findByText("Artículo devuelto"));
    const qty = screen.getByTestId("input-inv-qty-0"),
      cost = screen.getByTestId("input-inv-cost-0");
    await user.clear(qty);
    await user.type(qty, "2");
    await user.clear(cost);
    await user.type(cost, "100");
    await waitFor(() =>
      expect(screen.getByTestId("article-amount-comparison")).toHaveTextContent(
        `Artículos: $${expected} · Total comprobante: $${expected}`,
      ),
    );
  },
);
