import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));
import { EmitirFacturaDialog } from "./billing";
const presets = [
  {
    id: "parking",
    label: "Cochera por día",
    description: "Cochera",
    defaultAmount: "7500.00",
    category: "otros",
    sortOrder: 1,
    active: true,
    allowPriceEdit: false,
  },
  {
    id: "laundry",
    label: "Lavandería",
    description: "Servicio de lavandería",
    defaultAmount: "10000.00",
    category: "otros",
    sortOrder: 2,
    active: true,
    allowPriceEdit: true,
  },
  {
    id: "disabled",
    label: "Cargo desactivado",
    description: "No usar",
    defaultAmount: "123.00",
    category: "otros",
    sortOrder: 0,
    active: false,
    allowPriceEdit: false,
  },
];
const config = { arcaAmbiente: "ficticio" };
let writes: string[];
beforeEach(() => {
  queryClient.clear();
  writes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method && init.method !== "GET") writes.push(url);
      let body: unknown = [];
      if (url === "/api/charge-types") body = presets;
      else if (url === "/api/restaurant/menu/items")
        body = [
          {
            id: "coffee",
            name: "Café Justo",
            price: "3500.00",
            isActive: "true",
            isAvailable: "true",
          },
        ];
      else if (url === "/api/spa/treatments")
        body = [
          {
            id: "massage",
            name: "Masaje de prueba",
            price: "22000.00",
            isActive: "true",
          },
        ];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});
afterEach(() => {
  expect(writes).toEqual([]);
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});
function props(area?: string, tipo = "FB") {
  return {
    embedded: true,
    open: true,
    onClose: vi.fn(),
    config,
    requireLinkedRecipient: true,
    cashArea: area,
    allowedTipos: [tipo],
  };
}
function show(area?: string, tipo = "FB") {
  const initial = props(area, tipo);
  return {
    initial,
    view: render(
      <QueryClientProvider client={queryClient}>
        <EmitirFacturaDialog {...initial} />
      </QueryClientProvider>,
    ),
  };
}
const areaButton = (name: string) =>
  within(screen.getByRole("group", { name: "Área del catálogo" })).getByRole(
    "button",
    { name },
  );
async function open() {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
  return user;
}
it("defaults Reception to accommodation followed by active room presets", async () => {
  show("recepcion");
  await open();
  expect(areaButton("Recepción")).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByTestId("catalog-item-parking")).toHaveTextContent(
    "Cochera por día",
  );
  expect(screen.getByTestId("catalog-item-parking")).toHaveTextContent(
    "Cochera",
  );
  expect(
    screen
      .getByText("Alojamiento")
      .compareDocumentPosition(screen.getByText("Cargos de habitación")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByTestId("catalog-item-coffee")).not.toBeInTheDocument();
  expect(screen.queryByTestId("catalog-item-massage")).not.toBeInTheDocument();
  expect(screen.queryByTestId("catalog-item-disabled")).not.toBeInTheDocument();
});
it.each([
  ["restaurant", "Restaurante", "coffee"],
  ["spa", "SPA", "massage"],
] as const)(
  "defaults %s to its area and keeps other sectors reachable",
  async (area, label, id) => {
    show(area);
    const user = await open();
    expect(areaButton(label)).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByTestId("catalog-item-" + id)).toBeInTheDocument();
    expect(
      screen.queryByTestId("catalog-item-parking"),
    ).not.toBeInTheDocument();
    await user.click(areaButton("Todos"));
    expect(
      await screen.findByTestId("catalog-item-parking"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("catalog-item-coffee")).toBeInTheDocument();
    expect(screen.getByTestId("catalog-item-massage")).toBeInTheDocument();
  },
);
it("Todos preserves the complete catalog with room charges before Restaurant and SPA", async () => {
  show("recepcion");
  const user = await open();
  await user.click(areaButton("Todos"));
  await screen.findByTestId("catalog-item-coffee");
  expect(
    screen
      .getByText("Cargos de habitación")
      .compareDocumentPosition(screen.getByText("Restaurant (Café Justo)")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    screen
      .getByText("Restaurant (Café Justo)")
      .compareDocumentPosition(screen.getByText("Spa", { exact: true })) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
it.each(["FA", "FB"])(
  "selects the room charge at its final price without adding VAT again in %s",
  async (tipo) => {
    show("recepcion", tipo);
    const user = await open();
    await user.click(await screen.findByTestId("catalog-item-parking"));
    expect(screen.getByTestId("item-description-0")).toHaveTextContent(
      "Cochera",
    );
    expect(screen.getByTestId("item-price-0")).toHaveValue(7500);
    expect(screen.getByText("TOTAL:").parentElement).toHaveTextContent(
      "$7.500,00",
    );
    expect(
      screen.getByText("Ingrese precios con IVA incluido"),
    ).toBeInTheDocument();
  },
);
it("requires a real amount for a variable preset instead of billing its reference value", async () => {
  show("recepcion");
  const user = await open();
  expect(await screen.findByTestId("catalog-item-laundry")).toHaveTextContent(
    "Variable",
  );
  expect(screen.getByTestId("catalog-item-laundry")).toHaveTextContent(
    "ref. $10.000,00",
  );
  await user.click(screen.getByTestId("catalog-item-laundry"));
  expect(screen.getByTestId("item-price-0")).toHaveValue(null);
  await user.click(screen.getByTestId("button-consumidor-final"));
  await user.click(screen.getByTestId("btn-emitir-confirmar"));
  expect(screen.getByText("Precio debe ser distinto de 0")).toBeInTheDocument();
  await user.type(screen.getByTestId("item-price-0"), "12000");
  expect(screen.getByText("TOTAL:").parentElement).toHaveTextContent(
    "$12.000,00",
  );
});
it("searches labels without accents from the per-row picker and fills the same row", async () => {
  show("recepcion");
  const user = userEvent.setup();
  await user.click(await screen.findByTestId("item-description-0"));
  await user.type(
    screen.getByTestId("input-item-catalog-search-0"),
    "lavanderia",
  );
  await user.click(await screen.findByTestId("item-catalog-option-0-laundry"));
  expect(screen.getByTestId("item-description-0")).toHaveTextContent(
    "Servicio de lavandería",
  );
  expect(screen.queryByTestId("item-row-1")).not.toBeInTheDocument();
});
it("can search all areas when a Reception search has no matching service", async () => {
  show("recepcion");
  const user = await open();
  await user.type(screen.getByTestId("input-catalog-search"), "masaje");
  await user.click(
    await screen.findByRole("button", { name: "Buscar en todas las áreas" }),
  );
  await user.click(await screen.findByTestId("catalog-item-massage"));
  expect(screen.getByTestId("item-description-0")).toHaveTextContent(
    "Masaje de prueba",
  );
  expect(screen.getByTestId("item-price-0")).toHaveValue(22000);
});
it("changing catalog filters preserves already selected invoice lines and prices", async () => {
  show("recepcion");
  const user = await open();
  await user.click(await screen.findByTestId("catalog-item-parking"));
  await user.click(screen.getByTestId("btn-add-item-from-catalog"));
  await user.click(areaButton("SPA"));
  await user.click(await screen.findByTestId("catalog-item-massage"));
  expect(screen.getByTestId("item-description-0")).toHaveTextContent("Cochera");
  expect(screen.getByTestId("item-price-0")).toHaveValue(7500);
  expect(screen.getByTestId("item-description-1")).toHaveTextContent(
    "Masaje de prueba",
  );
  expect(screen.getByText("TOTAL:").parentElement).toHaveTextContent(
    "$29.500,00",
  );
});
it("updates the default when the operating area changes without resetting invoice drafts", async () => {
  const { initial, view } = show("recepcion");
  const user = await open();
  await user.click(await screen.findByTestId("catalog-item-parking"));
  view.rerender(
    <QueryClientProvider client={queryClient}>
      <EmitirFacturaDialog {...initial} cashArea="spa" />
    </QueryClientProvider>,
  );
  await user.click(screen.getByTestId("btn-add-item-from-catalog"));
  expect(areaButton("SPA")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("item-price-0")).toHaveValue(7500);
});
it("keeps Todos as a safe default when no matching operating area was provided", async () => {
  show("events");
  await open();
  expect(areaButton("Todos")).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByTestId("catalog-item-parking")).toBeInTheDocument();
});
