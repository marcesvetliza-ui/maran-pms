import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const apiRequestMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }) }));
vi.mock("@/lib/queryClient", async importOriginal => {
  const mod = await importOriginal<typeof import("@/lib/queryClient")>();
  return { ...mod, apiRequest: apiRequestMock, queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) };
});
const { EmitirFacturaDialog } = await import("./billing");
const { GroupRoomAdvanceInvoice } = await import("@/components/group-room-advance-invoice");

describe("EmitirFacturaDialog — existing Cuenta Corriente advance", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue(new Response(JSON.stringify({ id: 88, tipoComprobante: "FB", puntoVenta: 1, numero: 1, montoTotal: "144000" }), { status: 201 }));
  });

  it("locks payment controls and links the edited invoice without a generic payment update", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EmitirFacturaDialog
        open onClose={vi.fn()} config={{ puntoVenta: 1 }} skipReview showPaymentMethod lockItems
        paymentId="pay-cc" reservationId="res-1"
        initialValues={{
          razonSocial: "ESCO", condicionIva: "Consumidor Final", paymentMethod: "cuenta_corriente",
          ccEntityType: "company", ccEntityId: "company-1",
          items: [{ descripcion: "Alojamiento", precioUnitario: 144000 }],
        }}
      />
    </QueryClientProvider>);

    expect(screen.getByTestId("select-cash-forma-pago")).toBeDisabled();
    expect(screen.getByTestId("select-cc-entity-type")).toBeDisabled();
    expect(screen.getByTestId("select-cc-entity-id")).toBeDisabled();
    expect(screen.getByTestId("item-description-0")).not.toBeDisabled();
    expect(screen.getByTestId("item-quantity-0")).toBeDisabled();
    expect(screen.getByTestId("item-price-0")).toBeDisabled();
    expect(screen.getByTestId("item-iva-0")).toBeDisabled();
    await user.clear(screen.getByTestId("item-description-0"));
    await user.type(screen.getByTestId("item-description-0"), "Alojamiento editado");
    await user.click(screen.getByTestId("btn-emitir-confirmar"));

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/billing/invoices", expect.objectContaining({
      cashFormaPago: "cuenta_corriente", ccEntityType: "company", ccEntityId: "company-1",
      cashFormaPagoDetalle: [{ method: "cuenta_corriente", amount: 144000 }],
      items: [expect.objectContaining({ descripcion: "Alojamiento editado" })],
    })));
    expect(apiRequestMock.mock.calls.some(([method, path]) => method === "PATCH" && path === "/api/payments/pay-cc")).toBe(false);
    expect(apiRequestMock).toHaveBeenCalledWith("PATCH", "/api/payments/pay-cc/invoice", expect.anything());
  });

  it("sends the recorded cash advance as invoice metadata, without requesting another cash collection", async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EmitirFacturaDialog
        open onClose={vi.fn()} config={{ puntoVenta: 1 }} skipReview showPaymentMethod lockItems
        paymentId="pay-cash" reservationId="res-706"
        initialValues={{
          razonSocial: "Huésped", condicionIva: "Consumidor Final", paymentMethod: "efectivo",
          items: [{ descripcion: "Anticipo — Reserva", precioUnitario: 77000 }],
        }}
      />
    </QueryClientProvider>);

    expect(screen.getByTestId("select-cash-forma-pago")).toBeDisabled();
    await user.click(screen.getByTestId("btn-emitir-confirmar"));
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/billing/invoices", expect.objectContaining({
      reservaId: "res-706",
      paymentId: "pay-cash",
      cashFormaPago: "efectivo",
      cashFormaPagoDetalle: [{ method: "efectivo", amount: 77000 }],
    })));
    const invoiceBody = apiRequestMock.mock.calls.find(([method, path]) =>
      method === "POST" && path === "/api/billing/invoices")?.[2];
    expect(invoiceBody).not.toHaveProperty("cashArea");
  });
  it("loads a group receipt, locks the original instrument and invoices its shared sources without another collection", async () => {
    const user=userEvent.setup();
    apiRequestMock.mockImplementation(async(method,path)=>new Response(JSON.stringify(method==='GET' ? {
      groupId:'group-801',paymentId:'advance-801',amount:166000,method:'transferencia',
      sourceChargeAmounts:{accommodation:166000},sources:[{id:'accommodation',label:'Alojamiento',amount:166000}],
    } : {id:88,tipoComprobante:'FB',puntoVenta:5,numero:200,montoTotal:166000}),{status:200}));
    render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
      <GroupRoomAdvanceInvoice open onClose={vi.fn()} config={{puntoVenta:5}} skipReview showPaymentMethod lockItems
        paymentId="advance-801" reservationId="res-801"
        initialValues={{razonSocial:'Synthetic RODRIGUEZ',condicionIva:'Consumidor Final',paymentMethod:'cash',items:[{descripcion:'Anticipo',precioUnitario:1}]}}
      />
    </QueryClientProvider>);
    expect(await screen.findByTestId('group-advance-invoice-preview')).toHaveTextContent('166.000,00');
    expect(screen.getByTestId('item-price-0')).toHaveValue(166000);
    expect(screen.getByTestId('select-cash-forma-pago')).toBeDisabled();
    expect(screen.getByTestId('select-cash-forma-pago')).toHaveTextContent('Transferencia');
    expect(screen.queryByTestId('input-retencion-monto')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('btn-emitir-confirmar'));
    await waitFor(()=>expect(apiRequestMock).toHaveBeenCalledWith('POST','/api/billing/invoices',expect.objectContaining({
      paymentId:'advance-801',reservaId:'res-801',sourceChargeIds:['accommodation'],sourceChargeAmounts:{accommodation:166000},
      cashFormaPago:'transferencia',cashFormaPagoDetalle:[{method:'transferencia',amount:166000}],
    })));
    expect(apiRequestMock.mock.calls.some(([method,path])=>method==='POST'&&path==='/api/payments')).toBe(false);
  });

});