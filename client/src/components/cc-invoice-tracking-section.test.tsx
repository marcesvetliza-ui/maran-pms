import {
  render,
  screen,
  within,
  cleanup,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CcInvoiceTrackingSection } from "./cc-invoice-tracking-section";
vi.mock("@/App", () => ({ useAuth: () => ({ user: { role: "admin" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const common = {
  entityType: "company",
  entityId: "company",
  entityName: "Caja de Previsión Social Médicos y Bioquímicos",
  motivo: "BASTERRA, JAIME — habitación 807",
  fecha: "2026-11-19",
  estado: "pendiente",
  observaciones: null,
  referencia: "RES-BASTERRA",
  updatedAt: null,
};
let calls: Array<{ url: string; body: any }>,
  fail: boolean,
  rows: any[],
  summary: any;
function mount() {
  const q = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        queryFn: async ({ queryKey }) => {
          const r = await fetch(queryKey.join("/"));
          return r.json();
        },
      },
    },
  });
  return render(
    <QueryClientProvider client={q}>
      <CcInvoiceTrackingSection />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  calls = [];
  fail = false;
  rows = [
    {
      ...common,
      recordId: "invoice:1739",
      salesInvoiceId: 1739,
      accountMovementIds: ["lodging"],
      numeroFactura: "00005-00000252",
      tipoComprobante: "FA",
      documentStatus: "facturada",
      monto: 585000,
      saldoPendiente: 585000,
      importeFacturado: 585000,
      importeSinFactura: 0,
    },
    {
      ...common,
      recordId: "movement:extras",
      salesInvoiceId: 0,
      accountMovementIds: ["extras"],
      numeroFactura: "Sin factura vinculada",
      tipoComprobante: "Cargo CC",
      documentStatus: "sin_factura",
      monto: 108500,
      saldoPendiente: 100000,
      importeSinFactura: 108500,
      importeFacturado: 0,
    },
  ];
  summary = {
    totalFacturas: 0,
    totalFacturado: 0,
    totalSinFactura: 108500,
    totalSaldoPendiente: 100000,
    totalGestionesManuales: 0,
    saldosSinVerificar: 0,
    porEstado: [],
    porEmpresa: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: any, init?: RequestInit) => {
      const path = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: path, body });
      if (fail)
        return new Response(JSON.stringify({ error: "Sin conexión" }), {
          status: 503,
        });
      return new Response(
        JSON.stringify(
          body ? { ok: true } : path.includes("/month/") ? summary : rows,
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("identifies the company first, preserves guest/room references and separates the unbilled amount from the actual outstanding balance", async () => {
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Mostrar" }));
  const billed = await screen.findByTestId("cc-tracking-row-invoice:1739"),
    unbilled = screen.getByTestId("cc-tracking-row-movement:extras");
  expect(within(billed).getByText(common.entityName)).toBeInTheDocument();
  expect(
    within(billed).getByText("Referencia: " + common.motivo),
  ).toBeInTheDocument();
  expect(within(billed).getByText("FA 00005-00000252")).toBeInTheDocument();
  expect(
    within(unbilled).getByText("Sin factura vinculada"),
  ).toBeInTheDocument();
  expect(within(unbilled).getByText("$108.500,00")).toBeInTheDocument();
  expect(within(unbilled).getByText("$100.000,00")).toBeInTheDocument();
  expect(
    screen.getByText("Facturado vigente (neto de NC)"),
  ).toBeInTheDocument();
  expect(calls.filter((c) => c.body)).toHaveLength(0);
});
it("searches by reservation context using the same backend filter", async () => {
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Mostrar" }));
  await userEvent.type(
    screen.getByTestId("input-cc-tracking-search"),
    "BASTERRA",
  );
  await waitFor(() =>
    expect(calls.some((c) => c.url.includes("search=BASTERRA"))).toBe(true),
  );
});
it("edits only follow-up metadata for an unbilled charge, using its durable identity", async () => {
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Mostrar" }));
  const row = await screen.findByTestId("cc-tracking-row-movement:extras");
  await userEvent.click(
    within(row).getByRole("button", { name: "Editar seguimiento" }),
  );
  await userEvent.type(within(row).getByRole("textbox"), "Pedir la factura");
  await userEvent.click(within(row).getByRole("button", { name: "Guardar" }));
  await waitFor(() =>
    expect(calls.filter((c) => c.body)).toEqual([
      {
        url: "/api/cc-invoice-tracking/movement/extras",
        body: { estado: "pendiente", observaciones: "Pedir la factura" },
      },
    ]),
  );
});
it("shows a failed query as an error rather than claiming there is no debt", async () => {
  fail = true;
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Mostrar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudo consultar el seguimiento",
  );
  expect(
    screen.queryByText(
      "No hay facturas, cargos ni gestiones en los filtros elegidos.",
    ),
  ).not.toBeInTheDocument();
});
it("the monthly report shows unbilled debt even when there are no issued invoices", async () => {
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Mostrar" }));
  await userEvent.click(screen.getByRole("tab", { name: "Informe mensual" }));
  expect(
    await screen.findByText("Total facturado vigente (neto de NC)"),
  ).toBeInTheDocument();
  expect(screen.getByText("Cargos sin factura vinculada")).toBeInTheDocument();
  expect(screen.getByText("$108.500,00")).toBeInTheDocument();
  expect(screen.getByText("$0,00")).toBeInTheDocument();
});

it("links manual follow-up to a real charge instead of adding another debt", async () => {
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Mostrar" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Agregar seguimiento" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Cargo de CC" }),
  );
  await userEvent.click(within(dialog).getByRole("combobox"));
  await userEvent.click(await screen.findByRole("option", { name: /108.500/ }));
  await userEvent.type(
    within(dialog).getAllByRole("textbox")[0],
    "Esperar documento",
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Agregar seguimiento" }),
  );
  await waitFor(() => expect(calls.filter((c) => c.body)).toHaveLength(1));
  expect(calls.find((c) => c.body)).toMatchObject({
    url: "/api/cc-invoice-tracking/manual",
    body: {
      accountMovementId: "extras",
      salesInvoiceId: null,
      entityName: common.entityName,
      motivo: "Esperar documento",
      monto: null,
    },
  });
});
