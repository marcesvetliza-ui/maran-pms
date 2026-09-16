/**
 * Regression coverage for two bugs found when embedding EmitirFacturaDialog
 * inside the Centro de Comprobantes with a single locked tipo (allowedTipos):
 *
 *  1. resetForm() used to hardcode setTipo("FB") on every open, even when
 *     "FB" wasn't in the caller's allowedTipos — leaving the Select's value
 *     matching no SelectItem, so "Tipo de comprobante" rendered blank and
 *     the user had to pick it again despite already choosing it upstream.
 *  2. "Punto de Venta (ARCA)" never considered cashArea at all, always
 *     showing the generic placeholder — now it auto-selects the área's PV
 *     when there's exactly one active electronic PV configured for it.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type React from "react";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

// /api/pos-configs returns different fixtures per test below — the shared
// queryClient singleton caches by queryKey across tests in this file, so
// each test needs a clean cache or it'd see a previous test's stale data.
beforeEach(() => {
  queryClient.clear();
});

const { EmitirFacturaDialog } = await import("./billing");

const FAKE_CONFIG = { arcaAmbiente: "ficticio" };

const POS_CONFIGS_SINGLE_MATCH = [
  { id: 1, nombre: "Recepción", numero: 21, area: "recepcion", tipo: "electronico", activo: true },
  { id: 2, nombre: "Restaurant", numero: 22, area: "restaurant", tipo: "electronico", activo: true },
];

const POS_CONFIGS_AMBIGUOUS = [
  { id: 1, nombre: "Recepción 1", numero: 21, area: "recepcion", tipo: "electronico", activo: true },
  { id: 2, nombre: "Recepción 2", numero: 23, area: "recepcion", tipo: "electronico", activo: true },
];

function buildFetchMock(posConfigs: unknown[]) {
  return vi.fn(async (url: string | URL | Request) => {
    const strUrl = url.toString();
    if (strUrl.endsWith("/api/pos-configs")) {
      return new Response(JSON.stringify(posConfigs), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

function renderDialog(props: Partial<React.ComponentProps<typeof EmitirFacturaDialog>> = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <EmitirFacturaDialog
        embedded
        open
        onClose={vi.fn()}
        config={FAKE_CONFIG}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("EmitirFacturaDialog — tipo bloqueado y Punto de Venta por área", () => {
  it('muestra el tipo ya elegido (p. ej. "Factura A") en vez de vaciar el select a FB', async () => {
    vi.stubGlobal("fetch", buildFetchMock([]));
    renderDialog({ allowedTipos: ["FA"], cashArea: "recepcion" });

    const embedded = screen.getByTestId("emitir-factura-embedded");
    await waitFor(() =>
      expect(within(embedded).getByTestId("select-tipo-factura")).toHaveTextContent("Factura A"),
    );
  });

  it("no fuerza FB cuando el único tipo permitido es un voucher no fiscal", async () => {
    vi.stubGlobal("fetch", buildFetchMock([]));
    renderDialog({ allowedTipos: ["cierre_habitacion"], cashArea: "recepcion" });

    const embedded = screen.getByTestId("emitir-factura-embedded");
    await waitFor(() =>
      expect(within(embedded).getByTestId("select-tipo-factura")).toHaveTextContent("Voucher Habitaciones"),
    );
  });

  it("preselecciona el Punto de Venta cuando hay un único PV electrónico activo para el área", async () => {
    vi.stubGlobal("fetch", buildFetchMock(POS_CONFIGS_SINGLE_MATCH));
    renderDialog({ allowedTipos: ["FA"], cashArea: "recepcion", showPaymentMethod: true });

    await waitFor(() =>
      expect(screen.getByTestId("select-punto-venta")).toHaveTextContent("PV 0021"),
    );
  });

  it("deja el Punto de Venta sin elegir cuando el área tiene más de un PV activo", async () => {
    vi.stubGlobal("fetch", buildFetchMock(POS_CONFIGS_AMBIGUOUS));
    renderDialog({ allowedTipos: ["FA"], cashArea: "recepcion", showPaymentMethod: true });

    await waitFor(() => expect(screen.getByTestId("select-punto-venta")).toBeInTheDocument());
    expect(screen.getByTestId("select-punto-venta")).toHaveTextContent("PV por defecto (configuración)");
  });

  it('mapea el área "events" del Centro de Comprobantes al "eventos" de pos_configs', async () => {
    const posConfigs = [
      { id: 1, nombre: "Eventos", numero: 24, area: "eventos", tipo: "electronico", activo: true },
    ];
    vi.stubGlobal("fetch", buildFetchMock(posConfigs));
    renderDialog({ allowedTipos: ["FA"], cashArea: "events", showPaymentMethod: true });

    await waitFor(() =>
      expect(screen.getByTestId("select-punto-venta")).toHaveTextContent("PV 0024"),
    );
  });
});
