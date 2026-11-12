import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast, toasts: [], dismiss: vi.fn() }) }));
import BillingPage from "./billing";

let invoice: any;
let rejectRecovery = false;
const renderPage = () => render(<QueryClientProvider client={queryClient}><BillingPage /></QueryClientProvider>);

describe("center invoice authorization and CC are separate states", () => {
  beforeEach(() => {
    queryClient.clear(); toast.mockReset(); rejectRecovery = false;
    invoice = { id:245, tipo_comprobante:"FB", punto_venta:5, numero:245, fecha_emision:"2026-11-12", cliente_razon_social:"Synthetic Bureau", monto_total:"2406000", estado:"autorizacion_pendiente", cae:null, modo_ficticio:false,
      center_settlement_area:"recepcion", center_settlement_status:"pending", cash_forma_pago:"cuenta_corriente", cash_forma_pago_detalle:[{method:"cuenta_corriente",amount:2406000}], reconciliation_status:"pendiente", reconciliation_error:"ARCA: respuesta no recibida" };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/billing/invoices?")) return Response.json([invoice]);
      if (url === "/api/billing/config") return Response.json({ arcaAmbiente:"homologacion" });
      if (init?.method === "POST" && url === "/api/billing/invoices/245/recover-center") {
        if (rejectRecovery) return Response.json({error:"ARCA rechazó el intento original: fecha inválida"},{status:409});
        invoice = {...invoice, estado:"emitida",cae:"71234567890123",center_settlement_status:"settled",reconciliation_status:"conciliada",reconciliation_error:null};
        return Response.json(invoice,{status:201});
      }
      if (init?.method === "POST" && url === "/api/billing/invoices/245/settle-center") {
        invoice = {...invoice,center_settlement_status:"settled",reconciliation_status:"conciliada",reconciliation_error:null};
        return Response.json({ok:true,invoiceId:245});
      }
      return Response.json([]);
    }));
  });
  afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });

  it("requires confirmation to recover the same number and never offers collection or PDF for an unauthorized invoice", async () => {
    renderPage();
    expect(await screen.findByText("Autorización ARCA pendiente")).toBeInTheDocument();
    expect(screen.getByText("ARCA: respuesta no recibida")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-retry-center-245")).not.toBeInTheDocument();
    expect(screen.getByTestId("btn-pdf-245")).toBeDisabled();
    expect(screen.queryByTestId("btn-editar-245")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("btn-recover-center-245"));
    expect(await screen.findByText(/sin ingresar dinero en Caja/)).toBeInTheDocument();
    expect((fetch as any).mock.calls.filter(([,init]:any)=>init?.method==="POST")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button",{name:"Confirmar recuperación"}));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({title:"Deuda registrada en Cuenta Corriente"})));
    const writes = (fetch as any).mock.calls.filter(([,init]:any)=>init?.method==="POST");
    expect(writes).toHaveLength(1); expect(writes[0][0]).toBe("/api/billing/invoices/245/recover-center");
    expect(await screen.findByText("Emitida")).toBeInTheDocument();
  });

  it("labels a missing CC registration as debt, without offering another authorization or a new payment", async () => {
    invoice.estado="emitida"; invoice.cae="71234567890123";
    renderPage();
    expect(await screen.findByText("Registro en Cuenta Corriente pendiente")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-recover-center-245")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button",{name:"Registrar en Cuenta Corriente"}));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({title:"Deuda registrada en Cuenta Corriente"})));
    const writes = (fetch as any).mock.calls.filter(([,init]:any)=>init?.method==="POST");
    expect(writes).toHaveLength(1); expect(writes[0][0]).toBe("/api/billing/invoices/245/settle-center");
  });

  it("keeps an ARCA rejection visible and does not fall back to another invoice or collection", async () => {
    rejectRecovery=true; renderPage();
    await userEvent.click(await screen.findByTestId("btn-recover-center-245"));
    await userEvent.click(screen.getByRole("button",{name:"Confirmar recuperación"}));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({description:"ARCA rechazó el intento original: fecha inválida",variant:"destructive"})));
    expect((fetch as any).mock.calls.filter(([,init]:any)=>init?.method==="POST")).toHaveLength(1);
    expect(invoice.estado).toBe("autorizacion_pendiente");
  });
});
