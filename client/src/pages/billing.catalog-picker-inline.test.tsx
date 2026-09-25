/**
 * Buscador de catálogo propio de cada renglón (Centro de Comprobantes,
 * requireLinkedRecipient=true) — antes, la única forma de elegir un
 * concepto era el botón único "Agregar desde catálogo" arriba de la
 * lista, que además solo completa la primera fila vacía. Para cambiar el
 * concepto de una fila ya cargada había que quitarla y volver a agregarla
 * desde ese botón, lejos de la fila que se quería editar — más difícil
 * cuantos más ítems tiene la factura.
 *
 * La fila entera es ahora un combobox — igual al patrón ya usado en
 * Compras (PurchaseInventoryPicker, purchase-invoices.tsx): un solo botón
 * a lo ancho del renglón que abre la búsqueda al tocarlo en cualquier
 * parte, no un input de solo lectura con un ícono aparte al costado (esa
 * primera versión no reaccionaba al tocar el cuadro en sí, solo el ícono).
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

  it("la fila entera del Centro de Comprobantes es un combobox clickeable, no un input de solo lectura", async () => {
    renderDialog({ allowedTipos: ["FB"], requireLinkedRecipient: true });
    const trigger = await screen.findByTestId("item-description-0");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveTextContent("Elegí un concepto del catálogo");
  });

  it("tocar la fila (en cualquier parte del cuadro) abre la búsqueda y elegir un concepto lo carga en esa misma fila", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FB"], requireLinkedRecipient: true });

    await user.click(await screen.findByTestId("item-description-0"));
    await user.click(await screen.findByTestId("item-catalog-option-0-mi-1"));

    const row = screen.getByTestId("item-row-0");
    expect(within(row).getByTestId("item-description-0")).toHaveTextContent("Café Justo");
    expect(within(row).getByTestId("item-price-0")).toHaveValue(2500);
    expect(screen.queryByTestId("item-row-1")).not.toBeInTheDocument();
  });

  it("cambiar el concepto de una fila ya cargada la reemplaza en el lugar, sin tocar otras filas", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FB"], requireLinkedRecipient: true });

    // Cargar dos filas distintas primero.
    await user.click(await screen.findByTestId("item-description-0"));
    await user.click(await screen.findByTestId("item-catalog-option-0-mi-1"));
    await user.click(await screen.findByTestId("btn-add-item-from-catalog"));
    await user.click(await screen.findByTestId("catalog-item-tr-1"));

    expect(within(screen.getByTestId("item-row-0")).getByTestId("item-description-0")).toHaveTextContent("Café Justo");
    expect(within(screen.getByTestId("item-row-1")).getByTestId("item-description-1")).toHaveTextContent("Masaje Relajante 60min");

    // Cambiar el concepto de la fila 0 tocando esa misma fila — no debe
    // tocar la fila 1 ni agregar una fila nueva.
    await user.click(screen.getByTestId("item-description-0"));
    await user.click(await screen.findByTestId("item-catalog-option-0-mi-2"));

    expect(within(screen.getByTestId("item-row-0")).getByTestId("item-description-0")).toHaveTextContent("Medialunas (x3)");
    expect(within(screen.getByTestId("item-row-1")).getByTestId("item-description-1")).toHaveTextContent("Masaje Relajante 60min");
    expect(screen.queryByTestId("item-row-2")).not.toBeInTheDocument();
  });

  it("el buscador de la fila filtra por nombre igual que el botón general", async () => {
    const user = userEvent.setup();
    renderDialog({ allowedTipos: ["FB"], requireLinkedRecipient: true });

    await user.click(await screen.findByTestId("item-description-0"));
    await waitFor(() => expect(screen.getByTestId("item-catalog-option-0-mi-2")).toBeInTheDocument());

    await user.type(screen.getByTestId("input-item-catalog-search-0"), "café");

    await waitFor(() => {
      expect(screen.getByTestId("item-catalog-option-0-mi-1")).toBeInTheDocument();
      expect(screen.queryByTestId("item-catalog-option-0-mi-2")).not.toBeInTheDocument();
    });
  });

  it("fuera del Centro de Comprobantes, la descripción sigue siendo texto libre (sin combobox)", async () => {
    renderDialog({ allowedTipos: ["FA"], cashArea: "restaurant" });
    await waitFor(() => expect(screen.getByTestId("btn-add-item-from-catalog")).toBeInTheDocument());
    const description = screen.getByTestId("item-description-0");
    expect(description.tagName).toBe("INPUT");
  });
});
