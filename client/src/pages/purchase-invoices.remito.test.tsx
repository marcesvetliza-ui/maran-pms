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

function renderDialog(props: { unifiedLayout?: boolean; editingInvoice?: any; sourceRemito?: any } = {}) {
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

  it("arranca con un renglón vacío para completar, igual que Transferir Stock entre Depósitos — sin tener que apretar 'Agregar artículo' primero", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });
    // Antes de elegir Remito, una Factura arranca sin renglones (0 artículos es válido — servicio sin stock).
    expect(screen.queryByTestId("row-inv-item-0")).not.toBeInTheDocument();

    await selectRemito(user);

    expect(screen.getByTestId("row-inv-item-0")).toBeInTheDocument();
    expect(screen.getByTestId("input-inv-qty-0")).toHaveValue(1);
    expect(screen.queryByText("Sin artículos — el comprobante se registrará sin modificar el inventario.")).not.toBeInTheDocument();
  });

  it('el botón de envío pasa a decir "Registrar remito"', async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });
    expect(screen.getByTestId("btn-submit-invoice")).toHaveTextContent("Factura completa");

    await selectRemito(user);
    expect(screen.getByTestId("btn-submit-invoice")).toHaveTextContent("Registrar remito");
  });

  it("permite elegir compra no fiscal y volver a pendiente de factura", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });
    await selectRemito(user);
    await user.click(screen.getByTestId("select-uso-remito"));
    await user.click(await screen.findByRole("option", { name: "Compra no fiscal" }));
    expect(screen.getByTestId("non-fiscal-total")).toHaveTextContent("Total Comprobante");
    expect(screen.getByTestId("btn-submit-invoice")).toHaveTextContent("Registrar compra no fiscal");
    expect(screen.queryByText("Impuestos y totales")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("select-uso-remito"));
    await user.click(await screen.findByRole("option", { name: "Pendiente de factura" }));
    expect(screen.queryByTestId("non-fiscal-total")).not.toBeInTheDocument();
    expect(screen.getByTestId("btn-submit-invoice")).toHaveTextContent("Registrar remito");
  });

  it("suma cantidad por costo y envía el importe a cuenta corriente sin IVA", async () => {
    const capture: { body: any } = { body: undefined };
    const fallback = buildFetchMock(capture);
    vi.stubGlobal("fetch", vi.fn(async (url: any, options?: RequestInit) => {
      if (String(url).endsWith("/api/inventory/items")) return new Response(JSON.stringify([{ id: "item-nf", name: "Mercadería NF", unit: "unidad", costPrice: "1200", ivaRate: "21" }]), { status: 200 });
      if (String(url).endsWith("/api/inventory/warehouses")) return new Response(JSON.stringify([{ id: "wh-nf", name: "Depósito General", is_active: "true" }]), { status: 200 });
      return fallback(url, options);
    }));
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });
    await selectRemito(user);
    await user.click(screen.getByTestId("select-uso-remito"));
    await user.click(await screen.findByRole("option", { name: "Compra no fiscal" }));
    await user.click(await screen.findByTestId("select-existing-item-0"));
    await user.click(await screen.findByText("Mercadería NF"));
    await user.clear(screen.getByTestId("input-inv-qty-0"));
    await user.type(screen.getByTestId("input-inv-qty-0"), "2");
    await user.clear(screen.getByTestId("input-inv-cost-0"));
    await user.type(screen.getByTestId("input-inv-cost-0"), "1200");
    expect(screen.getByTestId("non-fiscal-total")).toHaveTextContent("2.400,00");
    await user.click(screen.getByTestId("select-supplier"));
    await user.click(await screen.findByText("Proveedor Uno SA"));
    await user.type(screen.getByTestId("input-numero-comprobante"), "NF-00001");
    await user.click(screen.getByTestId("btn-submit-invoice"));
    await waitFor(() => expect(capture.body).toBeTruthy());
    expect(capture.body).toMatchObject({ tipoComprobante: "REMITO-NF", montoNeto: "2400.00", condicionPago: "cuenta_corriente", montoIva21: "", formasPago: [] });
    expect(capture.body.stockItems[0]).toMatchObject({ itemId: "item-nf", quantity: "2", unitCost: "1200" });
  });

  it("edita el uso de un remito existente sin enviar artículos nuevos", async () => {
    let payload: any;
    vi.stubGlobal("fetch", vi.fn(async (url: any, options?: RequestInit) => {
      if (options?.method === "PATCH") { payload = JSON.parse(String(options.body)); return new Response(JSON.stringify({ id: 99 }), { status: 200 }); }
      if (String(url).endsWith("/api/purchase-invoices/99")) return new Response(JSON.stringify({
        id: 99, tipo_comprobante: "REMITO", numero_comprobante: "R99", fecha_emision: "2026-11-03",
        supplier_id: 1, estado: "registrado",
        articleLines: [{ id: 1, item_name: "Artículo recibido", quantity: "2", unit_price: "1200", line_total: "2400" }], ordenesPago: [],
      }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    }));
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true, editingInvoice: { id: 99, tipoComprobante: "REMITO", numeroComprobante: "R99", fechaEmision: "2026-11-03", condicionPago: "contado", supplierId: 1, montoTotal: "0", montoNeto: "0", estado: "pagado" } });
    await screen.findByText(/Artículo recibido/);
    await user.click(screen.getByTestId("select-uso-remito"));
    await user.click(await screen.findByRole("option", { name: "Compra no fiscal" }));
    expect(screen.getByTestId("non-fiscal-total")).toHaveTextContent("2.400,00");
    await user.click(screen.getByTestId("btn-submit-invoice"));
    await waitFor(() => expect(payload?.tipoComprobante).toBe("REMITO-NF"));
    expect(payload.stockItems).toBeUndefined();
  });

  it("vincula la factura al remito y no vuelve a enviar stock ni cobros", async () => {
    let payload: any;
    vi.stubGlobal("fetch", vi.fn(async (url: any, options?: RequestInit) => {
      if (options?.method === "POST") { payload = JSON.parse(String(options.body)); return new Response(JSON.stringify({ id: 99 }), { status: 201 }); }
      if (String(url).endsWith("/api/purchase-invoices/99")) return new Response(JSON.stringify({ articleLines: [{ id: 1, item_name: "Artículo recibido", quantity: "2", unit_price: "1200", line_total: "2400" }], ordenesPago: [{ importe_cancelado: "1000" }] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    }));
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true, sourceRemito: { id: 99, tipoComprobante: "REMITO-NF", numeroComprobante: "R99", supplierId: 1, proveedorNombre: "Proveedor Uno SA", montoTotal: "2400", estado: "parcial" } });
    await screen.findByText(/Artículo recibido/);
    expect(screen.getByTestId("select-supplier")).toBeDisabled();
    expect(screen.queryByTestId("btn-add-inv-item")).not.toBeInTheDocument();
    await user.type(screen.getByTestId("input-numero-comprobante"), "123");
    await user.type(screen.getByTestId("input-neto-line-0"), "2000");
    await user.click(screen.getByTestId("btn-submit-invoice"));
    await waitFor(() => expect(payload?.sourceRemitoId).toBe(99));
    expect(payload.tipoComprobante).toBe("FACT-A");
    expect(payload.stockItems).toEqual([]);
    expect(payload.formasPago).toEqual([]);
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
