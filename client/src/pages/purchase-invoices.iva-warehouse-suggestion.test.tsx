import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

/**
 * Tests for InvoiceDialog — sugerencia de alícuota de IVA a partir del
 * artículo elegido, y depósito por defecto ("Depósito General") en las
 * filas de Artículos.
 *
 * Confirmado con el usuario: la alícuota se guarda en el artículo (no en la
 * categoría, que puede mezclar tasas) y solo precarga el renglón — sigue
 * siendo editable por si esa factura puntual trae otra alícuota. El
 * depósito por defecto es "Depósito General" (case-insensitive), y también
 * queda editable.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { InvoiceDialog } = await import("./purchase-invoices");

const SUPPLIERS = [
  { id: 1, razonSocial: "Proveedor SA", cuit: "30-11111111-1", condicionIva: "Responsable Inscripto" },
];
const ACCOUNTS: any[] = [];
const CATEGORIES: any[] = [];
const EXISTING_ITEMS = [
  { id: "item-1", name: "Aceite de Oliva", currentStock: "5", unit: "unidad", ivaRate: "10.5" },
  { id: "item-2", name: "Vino Reserva", currentStock: "3", unit: "unidad", ivaRate: "21" },
  { id: "item-3", name: "Artículo Sin IVA Cargado", currentStock: "0", unit: "unidad" },
];
const WAREHOUSES = [
  { id: "wh-cocina", name: "Depósito Cocina", isActive: "true" },
  { id: "wh-general", name: "Depósito General", isActive: "true" },
];

function buildFetchMock() {
  return vi.fn(async (url: string) => {
    if (url.includes("/api/inventory/categories")) {
      return new Response(JSON.stringify(CATEGORIES), { status: 200 });
    }
    if (url.includes("/api/inventory/warehouses")) {
      return new Response(JSON.stringify(WAREHOUSES), { status: 200 });
    }
    if (url.includes("/api/inventory/items")) {
      return new Response(JSON.stringify(EXISTING_ITEMS), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

function renderDialog(props: { unifiedLayout?: boolean } = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <InvoiceDialog
        open
        onClose={vi.fn()}
        suppliers={SUPPLIERS as any}
        accounts={ACCOUNTS as any}
        embedded
        {...props}
      />
    </QueryClientProvider>,
  );
}

async function addItemRow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("btn-add-inv-item"));
}

async function selectItemOnRow(user: ReturnType<typeof userEvent.setup>, name: string, rowIndex = 0) {
  await user.click(await screen.findByTestId(`select-existing-item-${rowIndex}`));
  await user.click(await screen.findByText(name));
}

describe("InvoiceDialog — sugerencia de IVA por artículo y depósito por defecto", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sugiere la alícuota de IVA guardada en el artículo al elegirlo", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await addItemRow(user);
    await selectItemOnRow(user, "Aceite de Oliva");

    expect(screen.getByTestId("select-inv-vat-0")).toHaveTextContent("10,5%");
  });

  it("no sugiere nada si el artículo no tiene alícuota cargada", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await addItemRow(user);
    await selectItemOnRow(user, "Artículo Sin IVA Cargado");

    expect(screen.getByTestId("select-inv-vat-0")).toHaveTextContent("Elegir alícuota");
  });

  it("no pisa una alícuota ya elegida a mano al cambiar de artículo", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await addItemRow(user);
    await selectItemOnRow(user, "Artículo Sin IVA Cargado");

    await user.click(screen.getByTestId("select-inv-vat-0"));
    await user.click(await screen.findByRole("option", { name: "27%" }));
    expect(screen.getByTestId("select-inv-vat-0")).toHaveTextContent("27%");

    await selectItemOnRow(user, "Aceite de Oliva");
    expect(screen.getByTestId("select-inv-vat-0")).toHaveTextContent("27%");
  });

  it("preselecciona Depósito General en una fila nueva de artículo", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await addItemRow(user);
    expect(await screen.findByTestId("select-inv-warehouse-0")).toHaveTextContent("Depósito General");
  });

  it("el depósito precargado se puede cambiar a otro", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await addItemRow(user);
    await screen.findByText("Depósito General");

    await user.click(screen.getByTestId("select-inv-warehouse-0"));
    await user.click(await screen.findByRole("option", { name: "Depósito Cocina" }));
    expect(screen.getByTestId("select-inv-warehouse-0")).toHaveTextContent("Depósito Cocina");
  });
});
