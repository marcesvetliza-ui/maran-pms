import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

/**
 * NotaCreditoDebitoSearch (buscador de "factura original" para NC/ND en el
 * Centro de Comprobantes) — antes traía todas las letras mezcladas (FA/FB/FT/
 * FM/FMB) sin filtrar por el tipo de NC/ND elegido, y el servidor terminaba
 * emitiendo el comprobante con la letra de la factura elegida en vez de la
 * que el usuario había apretado (ver server/billing/routes.ts, tipoNC se
 * calcula desde original.tipo_comprobante). También mostraba siempre el
 * monto total de la factura, aunque ya tuviera una NC parcial encima.
 *
 * Confirmado con el usuario: filtrar por letra + mostrar el saldo pendiente
 * real (monto_total - monto_acreditado), no el total original.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { NotaCreditoDebitoSearch } = await import("./emitir-comprobante");

const INVOICES = [
  { id: 1, tipo_comprobante: "FA", punto_venta: 21, numero: 56, cliente_razon_social: "Aerolineas Argentinas SA", monto_total: "1000000.00", monto_acreditado: "0", estado: "emitida" },
  { id: 2, tipo_comprobante: "FB", punto_venta: 21, numero: 170, cliente_razon_social: "Milanovich Ruben", monto_total: "161000.00", monto_acreditado: "0", estado: "emitida" },
  { id: 3, tipo_comprobante: "FA", punto_venta: 21, numero: 60, cliente_razon_social: "Otro Cliente SA", monto_total: "500000.00", monto_acreditado: "500000.00", estado: "emitida" },
  { id: 4, tipo_comprobante: "FA", punto_venta: 21, numero: 61, cliente_razon_social: "Cliente Parcial SA", monto_total: "1000000.00", monto_acreditado: "500000.00", estado: "emitida" },
];

function buildFetchMock() {
  return vi.fn(async (url: string) => {
    if (url.includes("/api/billing/invoices")) {
      return new Response(JSON.stringify(INVOICES), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

function renderSearch(tipo: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <NotaCreditoDebitoSearch area="recepcion" tipo={tipo} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("NotaCreditoDebitoSearch — filtra por letra y muestra el saldo real", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("para Nota de Crédito A solo muestra facturas A, nunca B", async () => {
    const user = userEvent.setup();
    renderSearch("NCA");
    await user.type(screen.getByTestId("input-buscar-comprobante-nc-nd"), "a");

    expect(await screen.findByTestId("row-invoice-nc-nd-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-invoice-nc-nd-4")).toBeInTheDocument();
    expect(screen.queryByTestId("row-invoice-nc-nd-2")).not.toBeInTheDocument();
  });

  it("para Nota de Crédito B solo muestra facturas B, nunca A", async () => {
    const user = userEvent.setup();
    renderSearch("NCB");
    await user.type(screen.getByTestId("input-buscar-comprobante-nc-nd"), "a");

    expect(await screen.findByTestId("row-invoice-nc-nd-2")).toBeInTheDocument();
    expect(screen.queryByTestId("row-invoice-nc-nd-1")).not.toBeInTheDocument();
  });

  it("no ofrece una factura ya acreditada en su totalidad", async () => {
    const user = userEvent.setup();
    renderSearch("NCA");
    await user.type(screen.getByTestId("input-buscar-comprobante-nc-nd"), "a");

    await screen.findByTestId("row-invoice-nc-nd-1");
    expect(screen.queryByTestId("row-invoice-nc-nd-3")).not.toBeInTheDocument();
  });

  it("muestra el saldo pendiente, no el total, para una factura con NC parcial previa", async () => {
    const user = userEvent.setup();
    renderSearch("NCA");
    await user.type(screen.getByTestId("input-buscar-comprobante-nc-nd"), "a");

    const row = await screen.findByTestId("row-invoice-nc-nd-4");
    expect(row).toHaveTextContent("$500.000,00");
    // El total original aparece solo como aclaración en la leyenda de saldo
    // parcial, no como el importe principal del renglón.
    expect(screen.getByTestId("saldo-parcial-4")).toHaveTextContent("total $1.000.000,00");
  });

  it("una factura sin NC previa no muestra la leyenda de saldo parcial", async () => {
    const user = userEvent.setup();
    renderSearch("NCA");
    await user.type(screen.getByTestId("input-buscar-comprobante-nc-nd"), "a");

    await screen.findByTestId("row-invoice-nc-nd-1");
    expect(screen.queryByTestId("saldo-parcial-1")).not.toBeInTheDocument();
  });
});
