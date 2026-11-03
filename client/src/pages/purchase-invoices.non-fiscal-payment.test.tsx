import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }) }));
import { PaymentOrderDialog } from "./purchase-invoices";
const documents = [
  { id: 9, tipo_comprobante: "REMITO-NF", numero_comprobante: "NF9", fecha_emision: "2026-11-03", monto_neto: "2400", monto_total: "2400", saldo_pendiente: "1400", estado: "parcial" },
  { id: 10, tipo_comprobante: "FACT-A", numero_comprobante: "F10", fecha_emision: "2026-11-03", monto_neto: "100", monto_total: "121", saldo_pendiente: "121", estado: "pendiente" },
];
describe("Orden de pago de compra no fiscal", () => {
  let payload: any;
  beforeEach(() => {
    payload = undefined; queryClient.clear();
    vi.stubGlobal("fetch", vi.fn(async (_url: any, options?: RequestInit) => {
      if (options?.method === "POST") { payload = JSON.parse(String(options.body)); return new Response(JSON.stringify({ id: 4, numero: "OP4" }), { status: 201 }); }
      return new Response(JSON.stringify({ facturasPendientes: documents }), { status: 200 });
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  const show = () => render(<QueryClientProvider client={queryClient}><PaymentOrderDialog open supplier={{ id: 1, razonSocial: "Proveedor", cuit: "30111111111", totalSaldo: "1521", facturasPendientes: 2, alicuotaIibb: 3, alicuotaGanancias: 2 }} onClose={vi.fn()} /></QueryClientProvider>);
  it("obliga efectivo, elimina retenciones automáticas y permite pagar una parte", async () => {
    const user = userEvent.setup(); show();
    await user.click(await screen.findByTestId("chk-invoice-9"));
    expect(screen.getByTestId("non-fiscal-payment-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("input-op-ret-iibb")).not.toBeInTheDocument();
    expect(screen.getByTestId("input-dep-bancario")).toBeDisabled();
    await user.type(screen.getByTestId("input-op-partial"), "400");
    await waitFor(() => expect(screen.getByTestId("input-efectivo-op")).toHaveValue(400));
    await user.click(screen.getByTestId("btn-submit-payment-order"));
    await waitFor(() => expect(payload).toMatchObject({ facturaIds: [9], formaPago: "efectivo", efectivo: "400.00", montoParcial: 400, retencionIibb: 0, retencionGanancias: 0, depBancario: 0, compensacion: 0 }));
  });
  it("separa la selección fiscal de la no fiscal", async () => {
    const user = userEvent.setup(); show();
    await user.click(await screen.findByTestId("chk-invoice-9"));
    await user.click(screen.getByTestId("chk-invoice-10"));
    expect(screen.getByTestId("chk-invoice-9")).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByTestId("chk-invoice-10")).toHaveAttribute("data-state", "checked");
    expect(screen.queryByTestId("non-fiscal-payment-notice")).not.toBeInTheDocument();
  });
});
