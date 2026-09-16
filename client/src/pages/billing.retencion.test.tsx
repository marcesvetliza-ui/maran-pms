/**
 * Tests for EmitirFacturaDialog — Retención impositiva
 *
 * Ports the "Retención impositiva" box PrefacturaDialog already has (Tipo
 * IIBB/Ganancias + Monto retenido) into the Centro de Comprobantes Venta
 * engine, which never had it. Always visible (not behind a toggle) — the
 * cajero fills it in only when it applies. It's informational — it doesn't
 * change the invoice total or the cash amount registered — but it does get
 * sent so it's recorded on the comprobante (cashFormaPagoDetalle, the same
 * already-persisted, informational-only field the invoice uses for a
 * payment-method breakdown) and shows up in the Caja/folio label.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { Toaster } from "@/components/ui/toaster";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/queryClient")>();
  return {
    ...mod,
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
  };
});

const { EmitirFacturaDialog } = await import("./billing");

const FAKE_CONFIG = { arcaAmbiente: "ficticio" };
const FAKE_INVOICE = {
  id: 42, tipo_comprobante: "FB", punto_venta: 1, numero: 1,
  cae: "12345678901234", cae_fecha_vto: "2026-08-01", estado: "emitida", monto_total: "1000.00",
};

function buildFetchMock(capture: { body: any }) {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";
    if (strUrl.includes("/api/billing/invoices") && method === "POST") {
      capture.body = JSON.parse(String(options?.body ?? "{}"));
      return new Response(JSON.stringify(FAKE_INVOICE), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof EmitirFacturaDialog>> = {}) {
  return render(
    <Wrapper>
      <EmitirFacturaDialog embedded open onClose={vi.fn()} config={FAKE_CONFIG} allowedTipos={["FB"]} cashArea="recepcion" showPaymentMethod {...overrides} />
    </Wrapper>,
  );
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  const razonInput = screen.getByTestId("input-razon-social");
  await user.clear(razonInput);
  await user.type(razonInput, "Cliente de Prueba");

  const descInput = screen.getByTestId("item-description-0");
  await user.clear(descInput);
  await user.type(descInput, "Servicio de prueba");

  const precioInput = screen.getByTestId("item-price-0");
  await user.clear(precioInput);
  await user.type(precioInput, "1000");

  await user.click(screen.getByTestId("btn-emitir-confirmar"));
  await user.click(screen.getByTestId("btn-confirmar-emitir"));
}

describe("EmitirFacturaDialog — Retención impositiva", () => {
  let capture: { body: any };

  beforeEach(() => {
    capture = { body: undefined };
    vi.stubGlobal("fetch", buildFetchMock(capture));
    vi.stubGlobal("open", vi.fn());
  });

  it("está siempre visible, sin necesidad de expandirla", async () => {
    renderDialog();
    expect(screen.getByText("Retención impositiva")).toBeInTheDocument();
    expect(screen.getByTestId("select-retencion-tipo")).toBeInTheDocument();
    expect(screen.getByTestId("input-retencion-monto")).toBeInTheDocument();
    // Sin monto cargado no hay botón para "quitar" — no hay nada que quitar.
    expect(screen.queryByTestId("btn-remove-retencion")).not.toBeInTheDocument();
  });

  it("cargar un monto se envía en cashFormaPagoDetalle sin tocar el total facturado", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("input-retencion-monto"), "150");

    await fillAndSubmit(user);

    await waitFor(() => expect(capture.body).toBeTruthy());
    expect(capture.body.cashFormaPagoDetalle).toEqual([{ method: "retencion_iibb", amount: 150 }]);
    // El total facturado sigue siendo el de los ítems cargados, no se le suma la retención.
    expect(capture.body.items[0].precioUnitario).toBe(1000);
    expect(capture.body.cashLabel).toMatch(/Ret\. IIBB \$150,00/);
  });

  it("Ganancias se envía con su propio method", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("select-retencion-tipo"));
    await user.click(await screen.findByRole("option", { name: "Ganancias" }));
    await user.type(screen.getByTestId("input-retencion-monto"), "80");

    await fillAndSubmit(user);

    await waitFor(() => expect(capture.body).toBeTruthy());
    expect(capture.body.cashFormaPagoDetalle).toEqual([{ method: "retencion_ganancias", amount: 80 }]);
  });

  it("quitarla (botón X) antes de emitir no manda cashFormaPagoDetalle", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByTestId("input-retencion-monto"), "150");
    await user.click(screen.getByTestId("btn-remove-retencion"));
    expect(screen.getByTestId("input-retencion-monto")).toHaveValue(null);

    await fillAndSubmit(user);

    await waitFor(() => expect(capture.body).toBeTruthy());
    expect(capture.body.cashFormaPagoDetalle).toBeUndefined();
  });

  it("dejarla vacía y emitir tampoco manda cashFormaPagoDetalle", async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillAndSubmit(user);

    await waitFor(() => expect(capture.body).toBeTruthy());
    expect(capture.body.cashFormaPagoDetalle).toBeUndefined();
  });

  it("no se ofrece cuando la forma de pago es Cuenta Corriente (no hay cobro real que retener)", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByTestId("select-cash-forma-pago"));
    await user.click(await screen.findByRole("option", { name: "Cuenta Corriente" }));

    expect(screen.queryByText("Retención impositiva")).not.toBeInTheDocument();
  });
});
