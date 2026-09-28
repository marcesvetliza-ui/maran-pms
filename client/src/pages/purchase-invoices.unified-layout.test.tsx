import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

/**
 * Tests for InvoiceDialog — unifiedLayout
 *
 * The Centro de Comprobantes' Compra engine used to keep the original 5-step
 * wizard (Encabezado → Montos → Retenciones → Clasificación → Inventario)
 * untouched — a completely different shape than the Venta engine right next
 * to it. This ports the wizard's exact same fields (same state, validation,
 * submit — nothing recalculated differently) into one continuous page
 * matching EmitirFacturaDialog's layout: Tipo/Condición → Datos del emisor
 * (now including Punto de Venta/Número/Fecha/Período/Cuenta Contable/Centro
 * de Costo, which used to live in separate wizard steps) → Artículos →
 * Impuestos y totales. The standalone Facturas de Compra page keeps passing
 * no `unifiedLayout` prop, so it still renders the original wizard unchanged.
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

function renderDialog(props: { unifiedLayout?: boolean; embedded?: boolean; editingInvoice?: any } = {}) {
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

describe("InvoiceDialog — unifiedLayout", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no muestra la navegación por pasos (pills) que sí tiene el asistente original", async () => {
    renderDialog({ unifiedLayout: true });
    await waitFor(() => expect(screen.getByTestId("select-tipo-comprobante")).toBeInTheDocument());
    expect(screen.queryByTestId("btn-next-step")).not.toBeInTheDocument();
    expect(screen.queryByText("1. Encabezado")).not.toBeInTheDocument();
  });

  it("las facturas ofrecen forma de pago (Cuenta Corriente por defecto) y no ofrecen contado al cargarlas", async () => {
    renderDialog({ unifiedLayout: true });
    expect(screen.getByTestId("select-tipo-comprobante")).toBeInTheDocument();
    expect(screen.getByTestId("select-forma-pago-inmediata")).toHaveTextContent("Cuenta Corriente");
    expect(screen.queryByTestId("select-condicion-pago")).not.toBeInTheDocument();
    expect(screen.getByText("Pendiente de pago en cuenta corriente")).toBeInTheDocument();
  });

  it('agrupa Proveedor, Punto de Venta, Número, Fecha, Período y Cuenta Contable bajo "Datos del emisor", todo visible a la vez', async () => {
    renderDialog({ unifiedLayout: true });
    expect(screen.getByText("Datos del emisor")).toBeInTheDocument();
    // Estos campos vivían en pasos separados (1 y 4) del asistente — ahora están
    // todos presentes sin tener que avanzar con "Siguiente".
    expect(screen.getByTestId("select-supplier")).toBeInTheDocument();
    expect(screen.getByTestId("input-punto-venta")).toBeInTheDocument();
    expect(screen.getByTestId("input-numero-comprobante")).toBeInTheDocument();
    expect(screen.getByTestId("input-fecha-emision")).toBeInTheDocument();
    expect(screen.getByTestId("input-periodo")).toBeInTheDocument();
    expect(screen.getByTestId("select-cuenta-contable")).toBeInTheDocument();
    // Centro de Costo se eliminó: era puramente informativo y no lo usaba
    // ningún reporte ni el asiento contable (ver InvoiceDialog).
    expect(screen.queryByTestId("select-centro-costo")).not.toBeInTheDocument();
  });

  it("la sección Artículos solo ofrece elegir un artículo existente", async () => {
    renderDialog({ unifiedLayout: true });
    expect(screen.getByText("Artículos")).toBeInTheDocument();
    expect(screen.getByTestId("btn-add-inv-item")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("btn-add-inv-item"));
    expect(screen.getByTestId("select-existing-item-0")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-mode-new-0")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-inv-name-0")).not.toBeInTheDocument();
  });

  it('muestra netos y percepciones, pero reserva las retenciones para Liquidación de Tarjeta', async () => {
    renderDialog({ unifiedLayout: true });
    expect(screen.getByText("Impuestos y totales")).toBeInTheDocument();
    expect(screen.getByTestId("input-neto-line-0")).toBeInTheDocument();
    expect(screen.getByTestId("input-percep-iibb")).toBeInTheDocument();
    expect(screen.queryByTestId("input-ret-iibb")).not.toBeInTheDocument();
    expect(screen.getByText("Total Comprobante")).toBeInTheDocument();
  });

  it("tiene un solo botón de envío (Factura completa), sin Anterior/Siguiente", async () => {
    renderDialog({ unifiedLayout: true });
    expect(screen.getByTestId("btn-submit-invoice")).toHaveTextContent("Factura completa");
    expect(screen.queryByRole("button", { name: "Anterior" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Siguiente" })).not.toBeInTheDocument();
  });

  it("completar el mínimo (proveedor + número) y enviar llama a POST /api/purchase-invoices con esos datos", async () => {
    const capture: { body: any } = { body: undefined };
    vi.stubGlobal("fetch", buildFetchMock(capture));
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await user.click(screen.getByTestId("select-supplier"));
    await user.click(await screen.findByText("Proveedor Uno SA"));

    await user.type(screen.getByTestId("input-numero-comprobante"), "00000123");
    await user.type(screen.getByTestId("input-neto-line-0"), "1000");

    await user.click(screen.getByTestId("btn-submit-invoice"));

    await waitFor(() => expect(capture.body).toBeTruthy());
    expect(capture.body.supplierId).toBe(1);
    expect(capture.body.numeroComprobante).toBe("00000123");
    expect(capture.body.tipoComprobante).toBe("FACT-A");
  });

  it("la retención municipal sufrida en una Liquidación de Tarjeta se envía y suma al total", async () => {
    const capture: { body: any } = { body: undefined };
    vi.stubGlobal("fetch", buildFetchMock(capture));
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await user.click(screen.getByTestId("select-supplier"));
    await user.click(await screen.findByText("Proveedor Uno SA"));
    await user.click(screen.getByTestId("select-tipo-comprobante"));
    await user.click(await screen.findByRole("option", { name: "Liquidación Tarjeta" }));
    expect(screen.getByTestId("input-ret-municipal")).toBeInTheDocument();
    await user.type(screen.getByTestId("input-numero-comprobante"), "00000124");
    await user.type(screen.getByTestId("input-neto-line-0"), "1000");
    await user.type(screen.getByTestId("input-ret-municipal"), "50");

    // Neto 1000 + IVA 21% automático (210) + retención sufrida (50) = 1260.
    expect(screen.getByText(/1\.260,00/)).toBeInTheDocument();

    await user.click(screen.getByTestId("btn-submit-invoice"));

    await waitFor(() => expect(capture.body).toBeTruthy());
    expect(capture.body.retencionMunicipal).toBe("50");
  });

  it.each([true, false])("mantiene sólo en la liquidación los cinco campos, en layout unificado: %s", async (unifiedLayout) => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout });
    await user.click(screen.getByTestId("select-tipo-comprobante"));
    await user.click(await screen.findByRole("option", { name: "Liquidación Tarjeta" }));
    if (!unifiedLayout) {
      await user.click(screen.getByTestId("btn-next-step"));
      await user.click(screen.getByTestId("btn-next-step"));
    }
    for (const key of ["iibb", "ganancias", "iva", "suss", "municipal"]) {
      expect(screen.getByTestId(`input-ret-${key}`)).toBeInTheDocument();
    }
    expect(screen.getByText(/Retenciones sufridas/)).toBeInTheDocument();
  });

  it("al cambiar de Liquidación de Tarjeta a Factura A borra las retenciones ocultas", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });
    await user.click(screen.getByTestId("select-tipo-comprobante"));
    await user.click(await screen.findByRole("option", { name: "Liquidación Tarjeta" }));
    await user.type(screen.getByTestId("input-ret-iibb"), "50");
    await user.click(screen.getByTestId("select-tipo-comprobante"));
    await user.click(await screen.findByRole("option", { name: "Factura A" }));
    expect(screen.queryByTestId("input-ret-iibb")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("select-tipo-comprobante"));
    await user.click(await screen.findByRole("option", { name: "Liquidación Tarjeta" }));
    expect(screen.getByTestId("input-ret-iibb")).toHaveValue(null);
  });

  it("la retención recibida conserva su mensaje en el formulario existente", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });
    await user.click(screen.getByTestId("select-tipo-comprobante"));
    await user.click(await screen.findByRole("option", { name: "Retención Recibida" }));
    expect(screen.getByText(/Una retención recibida ya representa el crédito fiscal final/)).toBeInTheDocument();
    expect(screen.queryByTestId("input-ret-iibb")).not.toBeInTheDocument();
    expect(screen.queryByTestId("input-percep-iibb")).not.toBeInTheDocument();
  });

  it("el asistente original ya no permite crear gastos bancarios ni retenciones", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: false });
    await user.click(screen.getByTestId("select-tipo-comprobante"));
    expect(screen.queryByRole("option", { name: "Resumen Bancario" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Retención Recibida" })).not.toBeInTheDocument();
  });

  it("conserva y señala las retenciones históricas al editar una factura común", () => {
    renderDialog({ unifiedLayout: true, editingInvoice: {
      id: 15, tipoComprobante: "FACT-A", numeroComprobante: "123", fechaEmision: "2026-09-20",
      condicionPago: "cuenta_corriente", montoNeto: "100", retencionIibb: "10",
      estado: "pendiente",
    } });
    expect(screen.queryByTestId("input-ret-iibb")).not.toBeInTheDocument();
    expect(screen.getByTestId("historical-purchase-retentions")).toHaveTextContent("conserva retenciones");
    expect(screen.getByText(/90,00/)).toBeInTheDocument();
  });

  it("el asistente original (sin unifiedLayout) sigue mostrando los pasos de a uno, sin cambios", async () => {
    renderDialog({ unifiedLayout: false });
    expect(screen.getByText("1. Encabezado")).toBeInTheDocument();
    expect(screen.getByTestId("select-tipo-comprobante")).toBeInTheDocument();
    // Los campos de otros pasos (Inventario, Clasificación) no están montados todavía.
    expect(screen.queryByTestId("btn-add-inv-item")).not.toBeInTheDocument();
    expect(screen.queryByTestId("select-cuenta-contable")).not.toBeInTheDocument();
    expect(screen.getByTestId("btn-next-step")).toBeInTheDocument();
  });
});
