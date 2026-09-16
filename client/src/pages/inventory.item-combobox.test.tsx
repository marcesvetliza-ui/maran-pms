import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { InternalMovementForm } from "./inventory";
import { queryClient } from "@/lib/queryClient";

/**
 * ItemCombobox (module-private in inventory.tsx) replaced the plain <Select>
 * for artículo pickers — with dozens/hundreds of items, scrolling a native
 * dropdown to find one was impractical. This exercises the actual search
 * behavior through InternalMovementForm's item row: typing a couple of
 * letters should narrow the list by name or SKU, not just show everything.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const ITEMS = [
  { id: "item-cafe", sku: "CAF-01", name: "Café en grano", isActive: "true", unit: "kg" },
  { id: "item-coca", sku: "COC-01", name: "Coca-Cola 500ml", isActive: "true", unit: "caja" },
  { id: "item-detergente", sku: "DET-01", name: "Detergente Industrial", isActive: "true", unit: "unidad" },
];

function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request) => {
    const strUrl = url.toString();
    if (strUrl.endsWith("/api/inventory/items")) {
      return new Response(JSON.stringify(ITEMS), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

function renderForm() {
  return render(
    <QueryClientProvider client={queryClient}>
      <InternalMovementForm embedded open onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("ItemCombobox — buscador de artículos", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("escribir dos letras filtra por nombre, sin tener que scrollear todo el catálogo", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByTestId("btn-add-im-item"));
    await user.click(screen.getByTestId("select-im-item-0"));

    // Antes de escribir, están los tres artículos.
    await waitFor(() => expect(screen.getByText("Café en grano (CAF-01)")).toBeInTheDocument());
    expect(screen.getByText("Coca-Cola 500ml (COC-01)")).toBeInTheDocument();
    expect(screen.getByText("Detergente Industrial (DET-01)")).toBeInTheDocument();

    const search = screen.getByTestId("select-im-item-0-search");
    await user.type(search, "co");

    await waitFor(() => {
      expect(screen.getByText("Coca-Cola 500ml (COC-01)")).toBeInTheDocument();
      expect(screen.queryByText("Detergente Industrial (DET-01)")).not.toBeInTheDocument();
    });
  });

  it("también filtra por SKU", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByTestId("btn-add-im-item"));
    await user.click(screen.getByTestId("select-im-item-0"));
    await waitFor(() => expect(screen.getByText("Café en grano (CAF-01)")).toBeInTheDocument());

    const search = screen.getByTestId("select-im-item-0-search");
    await user.type(search, "det-01");

    await waitFor(() => {
      expect(screen.getByText("Detergente Industrial (DET-01)")).toBeInTheDocument();
      expect(screen.queryByText("Café en grano (CAF-01)")).not.toBeInTheDocument();
    });
  });

  it("elegir un resultado cierra el buscador y deja el artículo seleccionado en el trigger", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByTestId("btn-add-im-item"));
    await user.click(screen.getByTestId("select-im-item-0"));
    await waitFor(() => expect(screen.getByText("Coca-Cola 500ml (COC-01)")).toBeInTheDocument());

    await user.click(screen.getByText("Coca-Cola 500ml (COC-01)"));

    const trigger = screen.getByTestId("select-im-item-0");
    await waitFor(() => expect(within(trigger).getByText("Coca-Cola 500ml (COC-01)")).toBeInTheDocument());
    expect(screen.queryByTestId("select-im-item-0-search")).not.toBeInTheDocument();
  });
});
