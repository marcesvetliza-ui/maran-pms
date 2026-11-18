import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import { PURCHASE_INVOICE_EDIT_ALL_PERMISSION } from "@shared/purchase-invoice-edit";
const state = vi.hoisted(() => ({ permissions: new Set<string>() }));
vi.mock("@/App", () => ({ useAuth: () => ({ user: { role: "resp_administracion" }, hasPermission: (key: string) => state.permissions.has(key) }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import PurchaseInvoices, { InvoiceDialog } from "./purchase-invoices";
beforeEach(() => {
  queryClient.clear(); window.history.replaceState({}, "", "/purchase-invoices");
  state.permissions = new Set(["api:purchase-invoices:write"]);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
    url === "/api/purchase-invoices" ? ["pendiente", "parcial", "pagado", "registrado", "anulado"].map((estado, i) => ({
      id: i + 1, tipo_comprobante: "FACT-A", numero_comprobante: `${i + 1}`, estado,
      proveedor_nombre: "Proveedor de prueba", fecha_emision: "2026-11-18", periodo: "11/2026", monto_neto: "100", monto_total: "100", saldo_pendiente: estado === "pagado" ? "0" : "50",
    })) : [],
  ), { status: 200, headers: { "content-type": "application/json" } })));
});
afterEach(() => { queryClient.clear(); vi.unstubAllGlobals(); });
function open() { render(<QueryClientProvider client={queryClient}><PurchaseInvoices /></QueryClientProvider>); }
it("keeps complete editing restricted to pending documents without the extra permission, even for the administration lead", async () => {
  open(); expect(await screen.findByTestId("btn-edit-invoice-1")).toBeInTheDocument();
  for (const id of [2, 3, 4, 5]) expect(screen.queryByTestId(`btn-edit-invoice-${id}`)).not.toBeInTheDocument();
  expect(screen.getByTestId("btn-correct-invoice-3")).toBeInTheDocument();
});
it("offers editing in every state when granted, with a clear explanation for paid invoices", async () => {
  state.permissions.add(PURCHASE_INVOICE_EDIT_ALL_PERMISSION); open();
  await screen.findByTestId("btn-edit-invoice-1");
  for (const id of [2, 3, 4, 5]) expect(screen.getByTestId(`btn-edit-invoice-${id}`)).toBeInTheDocument();
  await userEvent.click(screen.getByTestId("btn-edit-invoice-3"));
  expect(await screen.findByTestId("settled-invoice-edit-notice")).toHaveTextContent("Los pagos y las órdenes de pago se conservan");
  await userEvent.click(screen.getByRole("button", { name: /Encabezado/ }));
  expect(screen.getByTestId("input-fecha-emision")).toBeDisabled();
});
it("does not grant write access through the extra permission alone", async () => {
  state.permissions = new Set([PURCHASE_INVOICE_EDIT_ALL_PERMISSION]); open();
  await screen.findByTestId("row-invoice-1");
  expect(screen.queryByTestId(/^btn-edit-invoice-/)).not.toBeInTheDocument();
});

it("preserves the separate documentary editing of a paid non-fiscal purchase", async () => {
  render(<QueryClientProvider client={queryClient}><InvoiceDialog open embedded unifiedLayout onClose={vi.fn()} suppliers={[]} accounts={[]}
    editingInvoice={{ id: 999, tipoComprobante: "REMITO-NF", estado: "pagado", numeroComprobante: "999", fechaEmision: "2026-11-18", montoTotal: "100" } as any} /></QueryClientProvider>);
  expect(await screen.findByTestId("input-fecha-emision")).toBeEnabled();
  expect(screen.queryByTestId("settled-invoice-edit-notice")).not.toBeInTheDocument();
});
