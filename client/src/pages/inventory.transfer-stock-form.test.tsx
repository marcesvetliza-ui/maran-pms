import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

/**
 * Guarda el contrato de TransferStockForm, el envoltorio autosuficiente de
 * TransferForm (mismo /api/inventory/transfer y misma validación que ya usa
 * el diálogo de la pestaña Depósitos) que ahora también se usa como motor de
 * Transferencia entre depósitos dentro del Centro de Comprobantes.
 *
 * TransferForm permite cargar más de un artículo por transferencia (misma
 * fila de depósito origen/destino, varias filas de artículo+cantidad), que
 * se mandan en un solo POST batch para que muevan todos o ninguno.
 *
 * Usa el queryClient real (no uno recién creado) porque su queryFn por
 * defecto es la que sabe convertir un queryKey en un fetch GET — sin ella
 * useQuery no tiene con qué resolver /api/inventory/warehouses ni /items.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { TransferStockForm } = await import("./inventory");

const WAREHOUSES = [
  { id: "wh-a", name: "Depósito Central", description: null, area: "general", is_active: "true", created_at: "" },
  { id: "wh-b", name: "Depósito Cocina", description: null, area: "cocina", is_active: "true", created_at: "" },
];
const ITEMS = [
  { id: "item-1", name: "Papel Higiénico", sku: "PH-01", isActive: "true" },
  { id: "item-2", name: "Jabón Líquido", sku: "JL-01", isActive: "true" },
];
const ITEM_WAREHOUSE_STOCK: Record<string, { warehouse_id: string; current_stock: string }[]> = {
  "item-1": [
    { warehouse_id: "wh-a", current_stock: "5" },
    { warehouse_id: "wh-b", current_stock: "0" },
  ],
  "item-2": [
    { warehouse_id: "wh-a", current_stock: "8" },
    { warehouse_id: "wh-b", current_stock: "0" },
  ],
};

function buildFetchMock(onPost?: (body: any) => void) {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    if (strUrl.includes("/api/inventory/transfer") && method === "POST") {
      onPost?.(JSON.parse(String(options?.body ?? "{}")));
      return new Response(JSON.stringify({ success: true, items: [] }), { status: 200 });
    }
    if (strUrl.endsWith("/api/inventory/warehouses")) {
      return new Response(JSON.stringify(WAREHOUSES), { status: 200 });
    }
    if (strUrl.endsWith("/api/inventory/items")) {
      return new Response(JSON.stringify(ITEMS), { status: 200 });
    }
    for (const [itemId, stock] of Object.entries(ITEM_WAREHOUSE_STOCK)) {
      if (strUrl.includes(`/api/inventory/items/${itemId}/warehouses`)) {
        return new Response(JSON.stringify(stock), { status: 200 });
      }
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

function renderForm(props: { embedded?: boolean; open: boolean; onClose: () => void }, onPost?: (body: any) => void) {
  vi.stubGlobal("fetch", buildFetchMock(onPost));
  return render(
    <QueryClientProvider client={queryClient}>
      <TransferStockForm {...props} />
    </QueryClientProvider>,
  );
}

describe("TransferStockForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", buildFetchMock());
  });

  it("modo modal: se abre dentro de un Dialog real con sus selects de depósito", async () => {
    renderForm({ open: true, onClose: vi.fn() });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("select-from-warehouse")).toBeInTheDocument());
    expect(screen.getByTestId("select-to-warehouse")).toBeInTheDocument();
  });

  it("modo embebido: no hay chrome de Dialog, pero el mismo formulario está presente", async () => {
    renderForm({ embedded: true, open: true, onClose: vi.fn() });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const embedded = screen.getByTestId("transfer-stock-embedded");
    await waitFor(() => expect(within(embedded).getByTestId("select-from-warehouse")).toBeInTheDocument());
    expect(within(embedded).getByTestId("select-to-warehouse")).toBeInTheDocument();
  });

  it("un mismo depósito no puede elegirse como origen y destino a la vez", async () => {
    const user = userEvent.setup();
    renderForm({ embedded: true, open: true, onClose: vi.fn() });
    await waitFor(() => expect(screen.getByTestId("select-from-warehouse")).toBeInTheDocument());

    await user.click(screen.getByTestId("select-from-warehouse"));
    await user.click(await screen.findByRole("option", { name: "Depósito Central" }));

    await user.click(screen.getByTestId("select-to-warehouse"));
    expect(await screen.findByRole("option", { name: "Depósito Central" })).toHaveAttribute("aria-disabled", "true");
  });

  it("muestra el stock disponible del depósito origen y bloquea confirmar si la cantidad lo supera", async () => {
    const user = userEvent.setup();
    renderForm({ embedded: true, open: true, onClose: vi.fn() });
    await waitFor(() => expect(screen.getByTestId("select-from-warehouse")).toBeInTheDocument());

    await user.click(screen.getByTestId("select-transfer-item-0"));
    await user.click(await screen.findByRole("option", { name: /Papel Higiénico/ }));

    await user.click(screen.getByTestId("select-from-warehouse"));
    await user.click(await screen.findByRole("option", { name: "Depósito Central" }));

    await waitFor(() => expect(screen.getByTestId("text-stock-disponible-0")).toHaveTextContent("Disponible: 5"));

    const qtyInput = screen.getByTestId("input-transfer-qty-0");
    await user.clear(qtyInput);
    await user.type(qtyInput, "50");

    await user.click(screen.getByTestId("select-to-warehouse"));
    await user.click(await screen.findByRole("option", { name: "Depósito Cocina" }));

    expect(screen.getByTestId("btn-confirm-transfer")).toBeDisabled();
  });

  it("confirma la transferencia y llama a onClose cuando la cantidad es válida", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderForm({ embedded: true, open: true, onClose });
    await waitFor(() => expect(screen.getByTestId("select-from-warehouse")).toBeInTheDocument());

    await user.click(screen.getByTestId("select-transfer-item-0"));
    await user.click(await screen.findByRole("option", { name: /Papel Higiénico/ }));
    await user.click(screen.getByTestId("select-from-warehouse"));
    await user.click(await screen.findByRole("option", { name: "Depósito Central" }));
    await user.click(screen.getByTestId("select-to-warehouse"));
    await user.click(await screen.findByRole("option", { name: "Depósito Cocina" }));

    const qtyInput = screen.getByTestId("input-transfer-qty-0");
    await user.clear(qtyInput);
    await user.type(qtyInput, "2");

    expect(screen.getByTestId("btn-confirm-transfer")).not.toBeDisabled();
    await user.click(screen.getByTestId("btn-confirm-transfer"));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("Cancelar llama a onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderForm({ embedded: true, open: true, onClose });
    await waitFor(() => expect(screen.getByTestId("select-from-warehouse")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("permite agregar una segunda fila de artículo y las manda juntas en un solo POST", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let postBody: any = null;
    renderForm({ embedded: true, open: true, onClose }, (body) => { postBody = body; });
    await waitFor(() => expect(screen.getByTestId("select-from-warehouse")).toBeInTheDocument());

    await user.click(screen.getByTestId("select-from-warehouse"));
    await user.click(await screen.findByRole("option", { name: "Depósito Central" }));
    await user.click(screen.getByTestId("select-to-warehouse"));
    await user.click(await screen.findByRole("option", { name: "Depósito Cocina" }));

    await user.click(screen.getByTestId("select-transfer-item-0"));
    await user.click(await screen.findByRole("option", { name: /Papel Higiénico/ }));
    const qty0 = screen.getByTestId("input-transfer-qty-0");
    await user.clear(qty0);
    await user.type(qty0, "2");

    await user.click(screen.getByTestId("btn-add-transfer-row"));
    expect(screen.getByTestId("row-transfer-item-1")).toBeInTheDocument();

    await user.click(screen.getByTestId("select-transfer-item-1"));
    await user.click(await screen.findByRole("option", { name: /Jabón Líquido/ }));
    const qty1 = screen.getByTestId("input-transfer-qty-1");
    await user.clear(qty1);
    await user.type(qty1, "3");

    expect(screen.getByTestId("btn-confirm-transfer")).not.toBeDisabled();
    await user.click(screen.getByTestId("btn-confirm-transfer"));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(postBody.fromWarehouseId).toBe("wh-a");
    expect(postBody.toWarehouseId).toBe("wh-b");
    expect(postBody.items).toEqual([
      { itemId: "item-1", quantity: 2 },
      { itemId: "item-2", quantity: 3 },
    ]);
  });

  it("no deja elegir el mismo artículo en dos filas y bloquea confirmar", async () => {
    const user = userEvent.setup();
    renderForm({ embedded: true, open: true, onClose: vi.fn() });
    await waitFor(() => expect(screen.getByTestId("select-from-warehouse")).toBeInTheDocument());

    await user.click(screen.getByTestId("select-transfer-item-0"));
    await user.click(await screen.findByRole("option", { name: /Papel Higiénico/ }));

    await user.click(screen.getByTestId("btn-add-transfer-row"));
    await user.click(screen.getByTestId("select-transfer-item-1"));
    // El artículo ya elegido en la fila 0 no aparece como opción en la fila 1.
    expect(screen.queryByTestId("select-transfer-item-1-option-item-1")).not.toBeInTheDocument();
  });

  it("se puede quitar una fila agregada", async () => {
    const user = userEvent.setup();
    renderForm({ embedded: true, open: true, onClose: vi.fn() });
    await waitFor(() => expect(screen.getByTestId("select-from-warehouse")).toBeInTheDocument());

    await user.click(screen.getByTestId("btn-add-transfer-row"));
    expect(screen.getByTestId("row-transfer-item-1")).toBeInTheDocument();

    await user.click(screen.getByTestId("btn-remove-transfer-row-1"));
    expect(screen.queryByTestId("row-transfer-item-1")).not.toBeInTheDocument();
  });
});
