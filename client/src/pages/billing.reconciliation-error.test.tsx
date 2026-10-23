import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { queryClient } from "@/lib/queryClient";

const toastMock = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock, toasts: [], dismiss: vi.fn() }),
}));

const { default: BillingPage } = await import("./billing");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("cola de reintentos ARCA", () => {
  beforeEach(() => {
    queryClient.clear();
    toastMock.mockReset();
  });

  it.each([false,true])("muestra y actualiza el error exacto de NC pendiente (grupo=%s)", async (group) => {
    const firstError = "ARCA: servicio temporalmente no disponible";
    const retryError = "ARCA: fecha del comprobante fuera del período permitido";
    let pendingRequestCount = 0;

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/billing/invoices?")) return jsonResponse([]);
      if (url === "/api/billing/config") return jsonResponse({ arcaAmbiente: "homologacion" });
      if (url === "/api/billing/credit-note-reconciliations/pending") {
        pendingRequestCount++;
        return jsonResponse([{
          id: 90,
          tipo_comprobante: "NCB",
          punto_venta: 1,
          numero: 15,
          reserva_id: group ? null : "reservation-1",
          group_id: group ? "group-1" : null,
          monto_total: "100.00",
          original_tipo_comprobante: "FB",
          original_punto_venta: 1,
          original_numero: 8,
          reconciliation_status: "pendiente",
          reconciliation_error: pendingRequestCount === 1 ? firstError : retryError,
        }]);
      }
      if (url === "/api/billing/credit-notes/90/reconcile" && init?.method === "POST") {
        return jsonResponse({
          error: retryError,
          reconciliation_error: retryError,
          reconciliationError: retryError,
          pendingCreditNoteId: 90,
          reconciliationStatus: "pendiente",
        }, 409);
      }
      return jsonResponse({ error: `Solicitud inesperada: ${url}` }, 404);
    }));

    render(
      <QueryClientProvider client={queryClient}>
        <BillingPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(firstError)).toBeInTheDocument();
    expect(screen.getByText(group ? /Grupo #group-1/ : /Reserva #reservation-1/)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByTestId("btn-reconcile-credit-note-90"));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: retryError,
      variant: "destructive",
    })));
    expect(await screen.findByText(retryError)).toBeInTheDocument();
    expect(pendingRequestCount).toBeGreaterThanOrEqual(2);
  });
});
it("no presenta una factura directa pendiente como una nota de crédito", async () => {
  queryClient.clear();
  vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
    const url=String(input);
    if(url.startsWith('/api/billing/invoices?'))return jsonResponse([
      {id:701,tipo_comprobante:'FA',punto_venta:5,numero:37,estado:'emitida',group_id:'synthetic',monto_total:'121.00',reconciliation_status:'pendiente'},
      {id:702,tipo_comprobante:'NCA',punto_venta:5,numero:1,estado:'emitida',group_id:'synthetic',monto_total:'121.00',reconciliation_status:'pendiente'},
    ]);
    if(url==='/api/billing/config')return jsonResponse({arcaAmbiente:'homologacion'});
    return jsonResponse([]);
  }));
  render(<QueryClientProvider client={queryClient}><BillingPage/></QueryClientProvider>);
  expect(await screen.findByText('Vinculación con el grupo pendiente')).toBeInTheDocument();
  expect(screen.getAllByText('No emitir otra NC')).toHaveLength(1);
});

it("recupera únicamente el registro de Caja y permite reintentar un fallo", async () => {
  queryClient.clear(); toastMock.mockClear();
  let pending=true, attempts=0;
  const document={id:703,tipo_comprobante:'FA',punto_venta:5,numero:37,group_name:'Grupo sintético',monto_total:'121.00'};
  const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if(url==='/api/billing/group-cash-information/pending')return jsonResponse(pending?[document]:[]);
    if(url==='/api/billing/invoices/703/complete-cash-information'&&init?.method==='POST'){
      attempts++;
      if(attempts===1)return jsonResponse({error:'Falla temporal de Caja'},503);
      pending=false;return jsonResponse({invoiceId:703,alreadyRecorded:false});
    }
    if(url==='/api/billing/config')return jsonResponse({arcaAmbiente:'homologacion'});
    return jsonResponse([]);
  });
  vi.stubGlobal('fetch',fetchMock);
  render(<QueryClientProvider client={queryClient}><BillingPage/></QueryClientProvider>);
  const button=await screen.findByTestId('btn-complete-cash-information-703');
  await userEvent.setup().click(button);
  await waitFor(()=>expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({title:'Falla temporal de Caja',variant:'destructive'})));
  expect(screen.getByTestId('btn-complete-cash-information-703')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByTestId('btn-complete-cash-information-703'));
  await waitFor(()=>expect(screen.queryByTestId('btn-complete-cash-information-703')).not.toBeInTheDocument());
  expect(attempts).toBe(2);
  const posts=fetchMock.mock.calls.filter(([,init])=>init?.method==='POST');
  expect(posts.map(([url])=>url)).toEqual(['/api/billing/invoices/703/complete-cash-information','/api/billing/invoices/703/complete-cash-information']);
});
