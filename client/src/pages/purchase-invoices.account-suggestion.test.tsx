import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

/**
 * Tests for InvoiceDialog — sugerencia de Cuenta Contable de Gasto a partir
 * de la categoría de los artículos cargados.
 *
 * Confirmado con el usuario: la Cuenta Contable sigue siendo el campo real
 * (lo usa el asiento y el reporte "Costos por Departamento"); Centro de Costo
 * se eliminó de esta pantalla por ser puramente informativo. La sugerencia
 * por categoría convive con la sugerencia ya existente por proveedor — nunca
 * pisa un valor ya elegido.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { InvoiceDialog } = await import("./purchase-invoices");

const SUPPLIERS = [
  { id: 1, razonSocial: "Proveedor Sin Cuenta SA", cuit: "30-11111111-1", condicionIva: "Responsable Inscripto" },
];
const ACCOUNTS = [
  { id: 10, codigo: "4.2.1.08.23.03", nombre: "Housekeeping Áreas Públicas", tipo: "egreso" },
  { id: 11, codigo: "4.2.1.08.06.01", nombre: "Librería", tipo: "egreso" },
];
const CATEGORIES = [
  { id: "cat-areas-publicas", name: "Áreas Públicas", area: "housekeeping", isGroup: false, parentId: null, accountId: 10 },
  { id: "cat-administracion", name: "Administración", area: "admin", isGroup: false, parentId: null, accountId: 11 },
  { id: "cat-sin-cuenta", name: "Sin Mapear", area: "general", isGroup: false, parentId: null, accountId: null },
];
const EXISTING_ITEMS = [
  { id: "item-1", name: "Papel Higiénico", categoryId: "cat-areas-publicas", currentStock: "5", unit: "unidad" },
];

function buildFetchMock() {
  return vi.fn(async (url: string) => {
    if (url.includes("/api/inventory/categories")) {
      return new Response(JSON.stringify(CATEGORIES), { status: 200 });
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

async function addNewItemRow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("btn-add-inv-item"));
}

async function selectCategoryOnRow(user: ReturnType<typeof userEvent.setup>, categoryName: string, rowIndex = 0) {
  await user.click(await screen.findByTestId(`select-inv-category-${rowIndex}`));
  await user.click(await screen.findByText(categoryName));
}

describe("InvoiceDialog — sugerencia de Cuenta Contable por categoría de artículo", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ya no muestra el campo Centro de Costo", async () => {
    renderDialog({ unifiedLayout: true });
    expect(screen.queryByText("Centro de Costo")).not.toBeInTheDocument();
    expect(screen.queryByTestId("select-centro-costo")).not.toBeInTheDocument();
  });

  it("sugiere la cuenta contable al elegir la categoría de un artículo nuevo", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    expect(screen.getByTestId("select-cuenta-contable")).toHaveTextContent("— Sin clasificar —");

    await addNewItemRow(user);
    await selectCategoryOnRow(user, "Áreas Públicas");

    expect(screen.getByTestId("select-cuenta-contable")).toHaveTextContent("Housekeeping Áreas Públicas");
  });

  it("no sugiere nada si la categoría no tiene cuenta configurada", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await addNewItemRow(user);
    await selectCategoryOnRow(user, "Sin Mapear");

    expect(screen.getByTestId("select-cuenta-contable")).toHaveTextContent("— Sin clasificar —");
  });

  it("sugiere la cuenta contable al elegir un artículo existente con categoría mapeada", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await addNewItemRow(user);
    await user.click(screen.getByTestId("btn-mode-existing-0"));
    await user.click(screen.getByTestId("select-existing-item-0"));
    await user.click(await screen.findByText("Papel Higiénico"));

    expect(screen.getByTestId("select-cuenta-contable")).toHaveTextContent("Housekeeping Áreas Públicas");
  });

  it("no pisa una cuenta ya elegida a mano", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await user.click(screen.getByTestId("select-cuenta-contable"));
    await user.click(await screen.findByRole("option", { name: /Librería/ }));
    expect(screen.getByTestId("select-cuenta-contable")).toHaveTextContent("Librería");

    await addNewItemRow(user);
    await selectCategoryOnRow(user, "Áreas Públicas");

    expect(screen.getByTestId("select-cuenta-contable")).toHaveTextContent("Librería");
  });
});
