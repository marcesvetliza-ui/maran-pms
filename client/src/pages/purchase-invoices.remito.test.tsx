import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

/**
 * Tests for InvoiceDialog — Remito (Centro de Comprobantes, unifiedLayout only)
 *
 * A remito registers mercadería that arrived without factura: only "Datos del
 * emisor" and "Artículos" apply — there's no IVA/total to load, so "Impuestos
 * y totales" doesn't show at all for this tipo. The standalone Facturas de
 * Compra wizard (unifiedLayout=false) never offers it — Remito only exists in
 * the Centro de Comprobantes.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { InvoiceDialog } = await import("./purchase-invoices");

const SUPPLIERS = [
  { id: 1, razonSocial: "Proveedor Uno SA", cuit: "30-11111111-1", condicionIva: "responsable_inscripto" },
];
const ACCOUNTS = [
  { id: 10, codigo: "5.1.01", nombre: "Compras de mercadería", tipo: "egreso" },
];

const FAKE_INVOICE = { id: 99, numero_comprobante_ext: "0001-00000123" };

function buildFetchMock(capture?: { body: any }) {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";
    if (strUrl.endsWith("/api/purchase-invoices") && method === "POST") {
      if (capture) capture.body = JSON.parse(String(options?.body ?? "{}"));
      return new Response(JSON.stringify(FAKE_INVOICE), { status: 200, headers: { "Content-Type": "application/json" } });
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

async function selectRemito(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("select-tipo-comprobante"));
  await user.click(await screen.findByRole("option", { name: "Remito" }));
}

describe("InvoiceDialog — Remito", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aparece como opción de Tipo de Comprobante en el layout unificado", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });
    await user.click(screen.getByTestId("select-tipo-comprobante"));
    expect(await screen.findByRole("option", { name: "Remito" })).toBeInTheDocument();
  });

  it("el asistente original (Facturas de Compra) no la ofrece al crear un comprobante nuevo", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: false });
    await user.click(screen.getByTestId("select-tipo-comprobante"));
    expect(screen.queryByRole("option", { name: "Remito" })).not.toBeInTheDocument();
  });

  it("al elegirla, oculta Impuestos y totales y muestra el aviso de que no aplica", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });
    expect(screen.getByText("Impuestos y totales")).toBeInTheDocument();

    await selectRemito(user);

    expect(screen.queryByText("Impuestos y totales")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-neto-line-0")).not.toBeInTheDocument();
    expect(screen.queryByText("Total Comprobante")).not.toBeInTheDocument();
    expect(screen.getByTestId("text-remito-sin-impuestos")).toBeInTheDocument();
  });

  it("Datos del emisor y Artículos siguen visibles", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });
    await selectRemito(user);

    expect(screen.getByText("Datos del emisor")).toBeInTheDocument();
    expect(screen.getByTestId("select-supplier")).toBeInTheDocument();
    expect(screen.getByTestId("input-numero-comprobante")).toBeInTheDocument();
    expect(screen.getByText("Artículos")).toBeInTheDocument();
    expect(screen.getByTestId("btn-add-inv-item")).toBeInTheDocument();
  });

  it('el botón de envío pasa a decir "Registrar remito"', async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });
    expect(screen.getByTestId("btn-submit-invoice")).toHaveTextContent("Factura completa");

    await selectRemito(user);
    expect(screen.getByTestId("btn-submit-invoice")).toHaveTextContent("Registrar remito");
  });

  it("enviarlo manda tipoComprobante REMITO sin montos, solo emisor y artículos", async () => {
    const capture: { body: any } = { body: undefined };
    vi.stubGlobal("fetch", buildFetchMock(capture));
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await selectRemito(user);

    await user.click(screen.getByTestId("select-supplier"));
    await user.click(await screen.findByText("Proveedor Uno SA"));
    await user.type(screen.getByTestId("input-numero-comprobante"), "R-00001");

    await user.click(screen.getByTestId("btn-submit-invoice"));

    await waitFor(() => expect(capture.body).toBeTruthy());
    expect(capture.body.tipoComprobante).toBe("REMITO");
    expect(capture.body.supplierId).toBe(1);
    expect(capture.body.numeroComprobante).toBe("R-00001");
    expect(capture.body.montoNeto).toBe("");
  });

  it("cambiar de un tipo con montos cargados a Remito limpia los importes ocultos", async () => {
    const capture: { body: any } = { body: undefined };
    vi.stubGlobal("fetch", buildFetchMock(capture));
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await user.type(screen.getByTestId("input-neto-line-0"), "1000");
    await selectRemito(user);

    await user.click(screen.getByTestId("select-supplier"));
    await user.click(await screen.findByText("Proveedor Uno SA"));
    await user.type(screen.getByTestId("input-numero-comprobante"), "R-00002");
    await user.click(screen.getByTestId("btn-submit-invoice"));

    await waitFor(() => expect(capture.body).toBeTruthy());
    expect(capture.body.montoNeto).toBe("");
    expect(capture.body.montoIva21).toBe("");
  });
});
