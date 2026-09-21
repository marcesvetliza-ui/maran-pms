/**
 * Tests for EmitirFacturaDialog — Condición IVA autocompletada al buscar
 * empresa/agencia.
 *
 * companies.condicionIva / agencies.condicionIva store the machine IvaCondition
 * code (e.g. "responsable_inscripto"), but the Condición IVA Select uses Title
 * Case labels as both value and display text. Setting the raw DB value
 * straight into state left the Select matching no SelectItem — blank, forcing
 * the user to pick it manually even though "cada empresa lo tiene cargada".
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { EmitirFacturaDialog } = await import("./billing");

const FAKE_CONFIG = { arcaAmbiente: "ficticio" };

const COMPANIES = [
  { id: "c-1", razonSocial: "Empresa RI SA", cuilCuit: "30-12345678-9", condicionIva: "responsable_inscripto", domicilio: "Av. Siempre Viva 123" },
];
const AGENCIES = [
  { id: "a-1", razonSocial: "Agencia Monotributo", cuilCuit: "20-98765432-1", condicionIva: "monotributo", domicilio: "" },
];

function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request) => {
    const strUrl = url.toString();
    if (strUrl.endsWith("/api/companies")) return new Response(JSON.stringify(COMPANIES), { status: 200 });
    if (strUrl.endsWith("/api/agencies")) return new Response(JSON.stringify(AGENCIES), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

function renderDialog() {
  return render(
    <QueryClientProvider client={queryClient}>
      <EmitirFacturaDialog embedded open onClose={vi.fn()} config={FAKE_CONFIG} allowedTipos={["FA", "FB"]} />
    </QueryClientProvider>,
  );
}

describe("EmitirFacturaDialog — Condición IVA al elegir empresa/agencia del buscador", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('una empresa Responsable Inscripto autocompleta "Responsable Inscripto", no queda en blanco', async () => {
    const user = userEvent.setup();
    renderDialog();

    const search = screen.getByTestId("input-entity-search");
    await user.type(search, "Empresa RI");
    await user.click(await screen.findByText("Empresa RI SA"));

    await waitFor(() => expect(screen.getByTestId("select-condicion-iva")).toHaveTextContent("Responsable Inscripto"));
    // RI fuerza Factura A, confirmando que el resto de la cadena reacciona bien al valor ya normalizado.
    expect(screen.getByTestId("select-tipo-factura")).toHaveTextContent("Factura A");
  });

  it('una agencia Monotributo autocompleta "Monotributista"', async () => {
    const user = userEvent.setup();
    renderDialog();

    const search = screen.getByTestId("input-entity-search");
    await user.type(search, "Agencia Mono");
    await user.click(await screen.findByText("Agencia Monotributo"));

    await waitFor(() => expect(screen.getByTestId("select-condicion-iva")).toHaveTextContent("Monotributista"));
  });
});
