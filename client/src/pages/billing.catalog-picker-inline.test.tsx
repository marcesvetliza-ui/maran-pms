/**
 * Buscador de catálogo propio de cada renglón (Centro de Comprobantes,
 * requireLinkedRecipient=true) — antes, la única forma de elegir un
 * concepto era el botón único "Agregar desde catálogo" arriba de la
 * lista, que además solo completa la primera fila vacía. Para cambiar el
 * concepto de una fila ya cargada había que quitarla y volver a agregarla
 * desde ese botón, lejos de la fila que se quería editar — más difícil
 * cuantos más ítems tiene la factura. Ahora cada fila tiene su propio
 * botón de búsqueda que reemplaza esa fila puntual, sin tocar el resto.
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
];

const SPA_TREATMENTS = [
  { id: "tr-1", name: "Masaje Relajante 60min", price: "15000.00", isActive: "true" },
];

function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request) => {
    const strUrl = url.toString();
    if (strUrl.endsWith("/api/restaurant/menu/items")) return new Response(JSON.stringify(MENU_ITEMS), { status: 200 });
    if (strUrl.endsWith("/api/spa/treatments")) return new Response(JSON.stringify(SPA_TREATMENTS), { status: 200 });
    if (strUrl.endsWith("/api/inventory/items")) return new Response(JSON.stringify([]), { status: 200 });
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

describe("EmitirFacturaDialog — buscador de catálogo inline por renglón", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cada fila del Centro de Comprobantes tiene su propio botón de búsqueda", async () => {
    renderDialog({ allowedTipos: ["FB"], requireLinkedRecipient: true });
    await waitFor(() => expect(screen.getByTestId("btn-item-catalog-0")).toBeInTheDocument());
  });

  it("elegir un concepto desde el botón de la fila lo carga en esa misma fila", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FB"], requireLinkedRecipient: true });

    await user.click(await screen.findByTestId("btn-item-catalog-0"));
    await user.click(await screen.findByTestId("item-catalog-option-0-mi-1"));

    const row = screen.getByTestId("item-row-0");
    expect(within(row).getByTestId("item-description-0")).toHaveValue("Café Justo");
    expect(within(row).getByTestId("item-price-0")).toHaveValue(2500);
    expect(screen.queryByTestId("item-row-1")).not.toBeInTheDocument();
  });

  it("cambiar el concepto de una fila ya cargada la reemplaza en el lugar, sin tocar otras filas", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FB"], requireLinkedRecipient: true });

    // Cargar dos filas distintas primero.
    await user.click(await screen.findByTestId("btn-item-catalog-0"));
    await user.click(await screen.findByTestId("item-catalog-option-0-mi-1"));
    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await user.click(await screen.findByTestId("catalog-item-tr-1"));

    expect(within(screen.getByTestId("item-row-0")).getByTestId("item-description-0")).toHaveValue("Café Justo");
    expect(within(screen.getByTestId("item-row-1")).getByTestId("item-description-1")).toHaveValue("Masaje Relajante 60min");

    // Cambiar el concepto de la fila 0 usando su propio buscador — no debe
    // tocar la fila 1 ni agregar una fila nueva.
    await user.click(screen.getByTestId("btn-item-catalog-0"));
    await user.click(await screen.findByTestId("item-catalog-option-0-mi-2"));

    expect(within(screen.getByTestId("item-row-0")).getByTestId("item-description-0")).toHaveValue("Medialunas (x3)");
    expect(within(screen.getByTestId("item-row-1")).getByTestId("item-description-1")).toHaveValue("Masaje Relajante 60min");
    expect(screen.queryByTestId("item-row-2")).not.toBeInTheDocument();
  });

  it("el buscador de la fila filtra por nombre igual que el botón general", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FB"], requireLinkedRecipient: true });

    await user.click(await screen.findByTestId("btn-item-catalog-0"));
    await waitFor(() => expect(screen.getByTestId("item-catalog-option-0-mi-2")).toBeInTheDocument());

    await user.type(screen.getByTestId("input-item-catalog-search-0"), "café");

    await waitFor(() => {
      expect(screen.getByTestId("item-catalog-option-0-mi-1")).toBeInTheDocument();
      expect(screen.queryByTestId("item-catalog-option-0-mi-2")).not.toBeInTheDocument();
    });
  });

  it("no aparece el buscador por fila fuera del Centro de Comprobantes (texto libre)", async () => {
    renderDialog({ allowedTipos: ["FA"], cashArea: "restaurant" });
    await waitFor(() => expect(screen.getByTestId("btn-add-item-from-catalog")).toBeInTheDocument());
    expect(screen.queryByTestId("btn-item-catalog-0")).not.toBeInTheDocument();
  });
});
