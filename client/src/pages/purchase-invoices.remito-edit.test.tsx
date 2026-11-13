import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast, toasts: [], dismiss: vi.fn() }) }));
const { InvoiceDialog } = await import("./purchase-invoices");

const suppliers: any[] = [{ id: 1, razonSocial: "Proveedor sintético", cuit: "30-11111111-1", condicionIva: "responsable_inscripto" }];
const invoice: any = { id: 99, tipoComprobante: "REMITO", supplierId: 1, numeroComprobante: "123", fechaEmision: "2026-11-03", montoTotal: "0", estado: "registrado" };
const items = [{ id: "item1", name: "Artículo original", unit: "unidad", costPrice: "1200", isActive: "true", purchaseEnabled: true },
  { id: "item2", name: "Artículo agregado", unit: "kg", costPrice: "777", isActive: "true", purchaseEnabled: true }];
const warehouses = [{ id: "w1", name: "General", isActive: "true" }, { id: "w2", name: "Cocina", isActive: "true" }];
let snapshot: any;
let fetchMock: ReturnType<typeof vi.fn>;
let failLoad = false;
let failSave = false;
let bodies: any[];
function view(open = true, onClose = vi.fn()) {
  return <QueryClientProvider client={queryClient}><InvoiceDialog open={open} onClose={onClose}
    suppliers={suppliers} accounts={[]} editingInvoice={invoice} embedded unifiedLayout /></QueryClientProvider>;
}
beforeEach(() => {
  queryClient.clear();
  failLoad = false;
  failSave = false;
  bodies = [];
  snapshot = { id: 99, tipo_comprobante: "REMITO", supplier_id: 1, proveedor_nombre: "Proveedor sintético",
    numero_comprobante: "123", fecha_emision: "2026-11-03", periodo: "11/2026", estado: "registrado",
    monto_total: "0", monto_neto: "0", special_details: { remitoEditVersion: 0 }, ordenesPago: [],
    articleLines: [{ id: 11, item_id: "item1", item_name: "Artículo original", warehouse_id: "w1",
      quantity: "2.000", unit_price: "1200.00", line_total: "2400.00", input_unit: "unidad", stock_unit: "unidad", stock_quantity: "2.000" }] };
  fetchMock = vi.fn(async (url, options) => {
    const path = String(url);
    let body: any = [];
    let status = 200;
    if (path.startsWith("/api/inventory/items")) body = items;
    else if (path.startsWith("/api/inventory/warehouses")) body = warehouses;
    else if (path === "/api/purchase-invoices/99") {
      if (options?.method === "PATCH") {
        bodies.push(JSON.parse(String(options.body)));
        status = failSave ? 409 : 200;
        body = failSave ? { error: "El remito cambió mientras lo editabas." } : snapshot;
      } else {
        body = failLoad ? { error: "No disponible" } : snapshot;
        status = failLoad ? 500 : 200;
      }
    }
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("Editar remito de compra", () => {
  it("carga el detalle guardado y envía encabezado, cantidad y versión en un solo PATCH", async () => {
    const user = userEvent.setup();
    render(view());
    const quantity = await screen.findByRole("spinbutton", { name: "Cantidad 1" });
    expect(quantity).toHaveValue(2);
    await user.clear(quantity);
    await user.type(quantity, "5");
    await user.clear(screen.getByTestId("input-numero-comprobante"));
    await user.type(screen.getByTestId("input-numero-comprobante"), "456");
    await user.type(screen.getByTestId("input-observaciones"), "Corregido");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ numeroComprobante: "456", observaciones: "Corregido", expectedRemitoVersion: 0,
      stockItems: [{ originalLineId: 11, itemId: "item1", warehouseId: "w1", quantity: "5", unit: "unidad", unitCost: "1200.00" }] });
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });
  it("permite agregar otro artículo y depósito y quitar la línea anterior", async () => {
    const user = userEvent.setup();
    render(view());
    await screen.findByTestId("remito-stock-editor");
    await user.click(screen.getByRole("button", { name: "Agregar artículo al remito" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Artículo 2" }), "item2");
    await user.selectOptions(screen.getByRole("combobox", { name: "Depósito 2" }), "w2");
    await user.click(screen.getByRole("button", { name: "Quitar artículo 1" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].stockItems).toEqual([{ itemId: "item2", warehouseId: "w2", quantity: "1", unit: "kg", unitCost: "777" }]);
  });
  it("al reabrir relee el remito sin conservar una cantidad o versión vieja", async () => {
    const user = userEvent.setup();
    const rendered = render(view());
    await user.clear(await screen.findByRole("spinbutton", { name: "Cantidad 1" }));
    await user.type(screen.getByRole("spinbutton", { name: "Cantidad 1" }), "9");
    rendered.rerender(view(false));
    snapshot = { ...snapshot, numero_comprobante: "987", special_details: { remitoEditVersion: 3 },
      articleLines: [{ ...snapshot.articleLines[0], quantity: "7.000", stock_quantity: "7.000" }] };
    rendered.rerender(view());
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: "Cantidad 1" })).toHaveValue(7));
    expect(screen.getByTestId("input-numero-comprobante")).toHaveValue("987");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(bodies[0]?.expectedRemitoVersion).toBe(3));
  });
  it("en un remito sin trazabilidad permite encabezado pero no inventa artículos", async () => {
    snapshot.articleLines[0].stock_quantity = null;
    const user = userEvent.setup();
    render(view());
    await screen.findByText(/Este remito antiguo no tiene un detalle de stock completo/);
    expect(screen.queryByTestId("remito-stock-editor")).not.toBeInTheDocument();
    await user.type(screen.getByTestId("input-observaciones"), "Corregir datos");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty("stockItems");
    expect(bodies[0].observaciones).toBe("Corregir datos");
  });
  it("no habilita guardar si no pudo cargar el detalle actual", async () => {
    failLoad = true;
    render(view());
    await screen.findByText(/No se pudo cargar la versión actual/);
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(bodies).toHaveLength(0);
  });
  it("impide vaciar el remito y conserva la edición si otra persona lo modificó", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    failSave = true;
    render(view(true, close));
    const quantity = await screen.findByRole("spinbutton", { name: "Cantidad 1" });
    await user.clear(quantity);
    await user.type(quantity, "4");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Error al actualizar" })));
    expect(close).not.toHaveBeenCalled();
    expect(quantity).toHaveValue(4);
    await user.click(screen.getByRole("button", { name: "Quitar artículo 1" }));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });
});
