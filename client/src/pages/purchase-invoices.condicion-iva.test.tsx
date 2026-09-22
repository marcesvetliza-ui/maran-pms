import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

/**
 * Tests for InvoiceDialog — sugerencia de letra por condición IVA del proveedor
 *
 * Confirmado con el usuario: es una sugerencia (auto-completa, no bloquea),
 * porque hay proveedores Responsable Inscripto cuyo concepto real es exento.
 * Aplica a Factura, Nota de Crédito y Recibo (todo lo "con letra"); no toca
 * Factura M, Remito, Resumen Bancario, Liquidación de Tarjeta ni Retención.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { InvoiceDialog } = await import("./purchase-invoices");

const SUPPLIERS = [
  { id: 1, razonSocial: "Proveedor RI SA", cuit: "30-11111111-1", condicionIva: "Responsable Inscripto" },
  { id: 2, razonSocial: "Proveedor Mono SRL", cuit: "30-22222222-2", condicionIva: "Monotributo" },
  { id: 3, razonSocial: "Proveedor Exento SA", cuit: "30-33333333-3", condicionIva: "Exento" },
];
const ACCOUNTS = [
  { id: 10, codigo: "5.1.01", nombre: "Compras de mercadería", tipo: "egreso" },
];

function buildFetchMock() {
  return vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
}

function renderDialog(props: { unifiedLayout?: boolean } = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <InvoiceDialog
        open
        onClose={vi.fn()}
        suppliers={SUPPLIERS as any}
        accounts={ACCOUNTS as any}
        embedded
        {...props}
      />
    </QueryClientProvider>,
  );
}

async function selectTipo(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByTestId("select-tipo-comprobante"));
  await user.click(await screen.findByRole("option", { name: label }));
}

async function selectSupplier(user: ReturnType<typeof userEvent.setup>, razonSocial: string) {
  await user.click(screen.getByTestId("select-supplier"));
  await user.click(await screen.findByText(razonSocial));
}

describe("InvoiceDialog — sugerencia de letra por condición IVA", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proveedor Responsable Inscripto sugiere la letra A", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await selectTipo(user, "Factura B");
    await selectSupplier(user, "Proveedor RI SA");

    expect(screen.getByTestId("select-tipo-comprobante")).toHaveTextContent("Factura A");
  });

  it("proveedor Monotributo sugiere la letra C", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await selectSupplier(user, "Proveedor Mono SRL");

    expect(screen.getByTestId("select-tipo-comprobante")).toHaveTextContent("Factura C");
  });

  it("proveedor Exento sugiere la letra B", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await selectSupplier(user, "Proveedor Exento SA");

    expect(screen.getByTestId("select-tipo-comprobante")).toHaveTextContent("Factura B");
  });

  it("la sugerencia se puede sobreescribir a mano y no se revierte sola", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await selectSupplier(user, "Proveedor Mono SRL");
    expect(screen.getByTestId("select-tipo-comprobante")).toHaveTextContent("Factura C");

    await selectTipo(user, "Factura B");
    expect(screen.getByTestId("select-tipo-comprobante")).toHaveTextContent("Factura B");
  });

  it("también aplica a Notas de Crédito", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await selectTipo(user, "Nota de Crédito B");
    await selectSupplier(user, "Proveedor RI SA");

    expect(screen.getByTestId("select-tipo-comprobante")).toHaveTextContent("Nota de Crédito A");
  });

  it("no afecta a comprobantes sin letra (Factura M, Remito)", async () => {
    const user = userEvent.setup();
    renderDialog({ unifiedLayout: true });

    await selectTipo(user, "Factura M");
    await selectSupplier(user, "Proveedor Exento SA");
    expect(screen.getByTestId("select-tipo-comprobante")).toHaveTextContent("Factura M");

    await selectTipo(user, "Remito");
    await selectSupplier(user, "Proveedor Mono SRL");
    expect(screen.getByTestId("select-tipo-comprobante")).toHaveTextContent("Remito");
  });
});
