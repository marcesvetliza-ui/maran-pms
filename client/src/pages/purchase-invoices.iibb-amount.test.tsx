import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }) }));
import { PaymentOrderDialog } from "./purchase-invoices";
const documents = [
 {id:10,tipo_comprobante:'FACT-A',numero_comprobante:'F10',fecha_emision:'2026-11-03',monto_neto:'100000',monto_total:'121000',saldo_pendiente:'121000',estado:'pendiente'},
 {id:11,tipo_comprobante:'FACT-A',numero_comprobante:'F11',fecha_emision:'2026-11-03',monto_neto:'100000',monto_total:'121000',saldo_pendiente:'121000',estado:'pendiente'},
];
describe("IIBB por importe en OP", () => {
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
  it('deduces the percentage when pesos are entered, updates it when the base changes and submits both',async()=>{
   const user=userEvent.setup();show();
   await user.click(await screen.findByTestId('chk-invoice-10'));
   const amount=screen.getByTestId('input-op-ret-iibb');
   await user.clear(amount);await user.type(amount,'3500');
   await waitFor(()=>expect(screen.getByTestId('input-op-alicuota-iibb')).toHaveValue(3.5));
   await user.click(screen.getByTestId('chk-invoice-11'));
   await waitFor(()=>expect(screen.getByTestId('input-op-alicuota-iibb')).toHaveValue(1.75));
   expect(amount).toHaveValue(3500);
   await user.click(screen.getByTestId('btn-submit-payment-order'));
   await waitFor(()=>expect(payload).toMatchObject({facturaIds:[10,11],retencionIibb:'3500',alicuotaIibb:1.75}));
  });
  it('clears the derived rate when the retained amount is removed',async()=>{
   const user=userEvent.setup();show();await user.click(await screen.findByTestId('chk-invoice-10'));
   const amount=screen.getByTestId('input-op-ret-iibb');await user.clear(amount);await user.type(amount,'3500');
   await waitFor(()=>expect(screen.getByTestId('input-op-alicuota-iibb')).toHaveValue(3.5));
   await user.clear(amount);await waitFor(()=>expect(screen.getByTestId('input-op-alicuota-iibb')).toHaveValue(null));
  });
});
