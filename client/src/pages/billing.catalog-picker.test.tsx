/**
 * Tests for EmitirFacturaDialog — "Agregar desde catálogo"
 *
 * Instead of only free-text item rows, Venta now offers an optional catalog
 * picker next to "Agregar ítem", scoped by cashArea: a fixed "Alojamiento en
 * Hotel Maran" entry for recepción, the restaurant menu (Café Justo) for
 * restaurant, and spa treatments for spa. Picking an entry fills the
 * description + price; it's additive — manual entry still works exactly as
 * before, and areas without a catalog (or no cashArea at all) don't show the
 * button.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type React from "react";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { EmitirFacturaDialog } = await import("./billing");

const FAKE_CONFIG = { arcaAmbiente: "ficticio" };

const MENU_ITEMS = [
  { id: "mi-1", name: "Café Justo", price: "2500.00", isAvailable: "true", isActive: "true" },
  { id: "mi-2", name: "Medialunas (x3)", price: "1800.00", isAvailable: "true", isActive: "true" },
  { id: "mi-3", name: "Plato fuera de carta", price: "9999.00", isAvailable: "false", isActive: "true" },
];

const SPA_TREATMENTS = [
  { id: "tr-1", name: "Masaje Relajante 60min", price: "15000.00", isActive: "true" },
  { id: "tr-2", name: "Circuito Spa", price: "22000.00", isActive: "true" },
];

function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request) => {
    const strUrl = url.toString();
    if (strUrl.endsWith("/api/restaurant/menu/items")) {
      return new Response(JSON.stringify(MENU_ITEMS), { status: 200 });
    }
    if (strUrl.endsWith("/api/spa/treatments")) {
      return new Response(JSON.stringify(SPA_TREATMENTS), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

function renderDialog(props: Partial<React.ComponentProps<typeof EmitirFacturaDialog>> = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <EmitirFacturaDialog embedded open onClose={vi.fn()} config={FAKE_CONFIG} {...props} />
    </QueryClientProvider>,
  );
}

describe("EmitirFacturaDialog — Agregar desde catálogo", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recepción ofrece el ítem fijo de Alojamiento y lo carga en la primera fila vacía", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "recepcion" });

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await user.click(await screen.findByTestId("catalog-item-alojamiento"));

    const row = screen.getByTestId("item-row-0");
    expect(within(row).getByTestId("item-description-0")).toHaveValue("Alojamiento en Hotel Maran");
    // Sigue habiendo una sola fila — se completó la que ya estaba, no se agregó otra.
    expect(screen.queryByTestId("item-row-1")).not.toBeInTheDocument();
  });

  it("restaurant ofrece la carta (Café Justo) y precarga descripción y precio", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "restaurant" });

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await waitFor(() => expect(screen.getByTestId("catalog-item-mi-1")).toBeInTheDocument());
    // El ítem no disponible (isAvailable: "false") no aparece.
    expect(screen.queryByTestId("catalog-item-mi-3")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("catalog-item-mi-1"));

    const row = screen.getByTestId("item-row-0");
    expect(within(row).getByTestId("item-description-0")).toHaveValue("Café Justo");
    expect(within(row).getByTestId("item-price-0")).toHaveValue(2500);
  });

  it("spa ofrece los tratamientos activos", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "spa" });

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await user.click(await screen.findByTestId("catalog-item-tr-2"));

    const row = screen.getByTestId("item-row-0");
    expect(within(row).getByTestId("item-description-0")).toHaveValue("Circuito Spa");
    expect(within(row).getByTestId("item-price-0")).toHaveValue(22000);
  });

  it("elegir un segundo ítem del catálogo agrega una fila nueva en vez de pisar la ya cargada", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "restaurant" });

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await user.click(await screen.findByTestId("catalog-item-mi-1"));

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await user.click(await screen.findByTestId("catalog-item-mi-2"));

    expect(within(screen.getByTestId("item-row-0")).getByTestId("item-description-0")).toHaveValue("Café Justo");
    expect(within(screen.getByTestId("item-row-1")).getByTestId("item-description-1")).toHaveValue("Medialunas (x3)");
  });

  it("buscar filtra las opciones del catálogo por nombre", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "restaurant" });

    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await waitFor(() => expect(screen.getByTestId("catalog-item-mi-2")).toBeInTheDocument());

    await user.type(screen.getByTestId("input-catalog-search"), "café");

    await waitFor(() => {
      expect(screen.getByTestId("catalog-item-mi-1")).toBeInTheDocument();
      expect(screen.queryByTestId("catalog-item-mi-2")).not.toBeInTheDocument();
    });
  });

  it("no muestra el botón de catálogo para un área sin catálogo definido (eventos)", async () => {
    renderDialog({ allowedTipos: ["FA"], cashArea: "events" });
    await waitFor(() => expect(screen.getByTestId("emitir-factura-embedded")).toBeInTheDocument());
    expect(screen.queryByTestId("btn-add-item-from-catalog")).not.toBeInTheDocument();
  });

  it("no muestra el botón de catálogo cuando no hay cashArea (ítems libres, sin restricción de área)", async () => {
    renderDialog({ allowedTipos: ["FA", "FB"] });
    await waitFor(() => expect(screen.getByTestId("emitir-factura-embedded")).toBeInTheDocument());
    expect(screen.queryByTestId("btn-add-item-from-catalog")).not.toBeInTheDocument();
  });

  it("el botón de agregar ítem manual sigue funcionando igual que antes", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FA"], cashArea: "restaurant" });
    await waitFor(() => expect(screen.getByTestId("btn-add-item")).toBeInTheDocument());

    await user.click(screen.getByTestId("btn-add-item"));
    expect(screen.getByTestId("item-row-1")).toBeInTheDocument();
  });
});
