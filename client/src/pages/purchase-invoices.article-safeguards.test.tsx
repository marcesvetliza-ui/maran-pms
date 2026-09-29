import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

/**
 * Feedback del programador sobre Compras (documento "Emisión de
 * comprobantes"): permitía cargar el mismo artículo dos veces en un mismo
 * comprobante (correcto en Ventas, no en Compras/stock) y dejaba cambiar
 * libremente la alícuota de IVA a una distinta de la configurada en el
 * artículo sin ningún aviso ni traba, con riesgo de un error fiscal por
 * descuido.
 *
 * Confirmado con el usuario: la alícuota sigue siendo editable (no se quita
 * la posibilidad, ver purchase-invoices.iva-warehouse-suggestion.test.tsx),
 * pero ahora arranca bloqueada y hace falta un clic extra deliberado para
 * habilitarla.
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

function buildFetchMock() {
  return vi.fn(async (url: string) => {
    if (url.includes("/api/inventory/categories")) {
      return new Response(JSON.stringify(CATEGORIES), { status: 200 });
    }
    if (url.includes("/api/inventory/warehouses")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (url.includes("/api/inventory/items")) {
      return new Response(JSON.stringify(EXISTING_ITEMS), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

function renderDialog() {
  return render(
    <QueryClientProvider client={queryClient}>
      <InvoiceDialog open onClose={vi.fn()} suppliers={SUPPLIERS as any} accounts={ACCOUNTS as any} embedded unifiedLayout />
    </QueryClientProvider>,
  );
}

async function addItemRow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("btn-add-inv-item"));
}

async function selectItemOnRow(user: ReturnType<typeof userEvent.setup>, name: string, rowIndex: number) {
  await user.click(await screen.findByTestId(`select-existing-item-${rowIndex}`));
  await user.click(await screen.findByText(name));
}

describe("InvoiceDialog — no permite repetir un artículo en el mismo comprobante", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("excluye del segundo picker el artículo ya elegido en el primer renglón", async () => {
    const user = userEvent.setup();
    renderDialog();

    await addItemRow(user);
    await selectItemOnRow(user, "Aceite de Oliva", 0);

    await addItemRow(user);
    await user.click(await screen.findByTestId("select-existing-item-1"));
    // El trigger del renglón 0 sigue mostrando "Aceite de Oliva" como
    // elegido — lo que no debe aparecer es una SEGUNDA aparición (la opción
    // dentro de la lista recién abierta del renglón 1).
    expect(await screen.findByText("Vino Reserva")).toBeInTheDocument();
    expect(screen.getAllByText("Aceite de Oliva")).toHaveLength(1);
  });

  it("no excluye el artículo del propio renglón (se puede reabrir y confirmar el mismo)", async () => {
    const user = userEvent.setup();
    renderDialog();

    await addItemRow(user);
    await selectItemOnRow(user, "Aceite de Oliva", 0);

    await user.click(screen.getByTestId("select-existing-item-0"));
    await screen.findByText("Vino Reserva");
    // Reabrir el mismo renglón: "Aceite de Oliva" aparece dos veces (el
    // trigger que ya lo muestra elegido + la opción dentro de su propia
    // lista, que no debe excluirse a sí misma).
    expect(screen.getAllByText("Aceite de Oliva")).toHaveLength(2);
  });

  it("si se saca el artículo del primer renglón, vuelve a estar disponible en el segundo", async () => {
    const user = userEvent.setup();
    renderDialog();

    await addItemRow(user);
    await selectItemOnRow(user, "Aceite de Oliva", 0);
    await addItemRow(user);

    await user.click(screen.getByTestId("btn-remove-inv-0"));

    await user.click(await screen.findByTestId("select-existing-item-0"));
    expect(await screen.findByText("Aceite de Oliva")).toBeInTheDocument();
  });
});

describe("InvoiceDialog — la alícuota del artículo arranca bloqueada", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queda deshabilitada al elegir un artículo con IVA configurado", async () => {
    const user = userEvent.setup();
    renderDialog();

    await addItemRow(user);
    await selectItemOnRow(user, "Aceite de Oliva", 0);

    expect(screen.getByTestId("select-inv-vat-0")).toBeDisabled();
    expect(screen.getByTestId("btn-unlock-vat-0")).toBeInTheDocument();
  });

  it("un clic en \"¿es distinta?\" la habilita para ese renglón puntual", async () => {
    const user = userEvent.setup();
    renderDialog();

    await addItemRow(user);
    await selectItemOnRow(user, "Aceite de Oliva", 0);

    await user.click(screen.getByTestId("btn-unlock-vat-0"));
    expect(screen.getByTestId("select-inv-vat-0")).not.toBeDisabled();

    await user.click(screen.getByTestId("select-inv-vat-0"));
    await user.click(await screen.findByRole("option", { name: "27%" }));
    expect(screen.getByTestId("select-inv-vat-0")).toHaveTextContent("27%");
  });

  it("no queda bloqueada para un artículo sin IVA configurado", async () => {
    const user = userEvent.setup();
    renderDialog();

    await addItemRow(user);
    await selectItemOnRow(user, "Artículo Sin IVA Cargado", 0);

    expect(screen.getByTestId("select-inv-vat-0")).not.toBeDisabled();
    expect(screen.queryByTestId("btn-unlock-vat-0")).not.toBeInTheDocument();
  });
});

describe("InvoiceDialog — \"IVA desagregado por alícuota\" solo con más de una alícuota", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no se muestra con una sola alícuota — repetiría lo que ya dice esa misma línea", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("input-neto-line-0"), "1000");

    expect(screen.queryByText("IVA desagregado por alícuota")).not.toBeInTheDocument();
  });

  it("se muestra al combinar dos alícuotas distintas en el mismo comprobante", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("input-neto-line-0"), "1000");

    await user.click(screen.getByTestId("btn-add-neto-line"));
    await user.type(screen.getByTestId("input-neto-line-1"), "500");
    await user.click(screen.getByTestId("select-alicuota-line-1"));
    await user.click(await screen.findByRole("option", { name: "10.5%" }));

    expect(await screen.findByText("IVA desagregado por alícuota")).toBeInTheDocument();
  });
});
