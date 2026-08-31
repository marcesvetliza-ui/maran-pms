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

  it("muestra el reconciliation_error exacto y lo refresca después de otro fallo", async () => {
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
          reserva_id: "reservation-1",
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

    await userEvent.setup().click(screen.getByTestId("btn-reconcile-credit-note-90"));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: retryError,
      variant: "destructive",
    })));
    expect(await screen.findByText(retryError)).toBeInTheDocument();
    expect(pendingRequestCount).toBeGreaterThanOrEqual(2);
  });
});