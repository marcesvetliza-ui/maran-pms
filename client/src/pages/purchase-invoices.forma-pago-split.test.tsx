import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

/**
 * Pago parcial al cargar una factura: "Monto a pagar ahora" precarga el
 * total (comportamiento de hoy, todo pagado), pero se puede bajar para
 * pagar una parte con una forma real y dejar el resto en cuenta corriente
 * — ver server/paymentOrder.ts y purchase-invoice-partial-pay.pg.test.ts.
 */

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { InvoiceDialog } = await import("./purchase-invoices");

const SUPPLIERS = [
  { id: 1, razonSocial: "Proveedor Uno SA", cuit: "30-11111111-1", condicionIva: "responsable_inscripto" },
];
const ACCOUNTS = [
  { id: 10, codigo: "5.1.01", nombre: "Compras de mercadería", tipo: "egreso" },
];
const FAKE_INVOICE = { id: 99, numero_comprobante_ext: "0001-00000123" };

function buildFetchMock(capture?: { body: any }) {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";
    if (strUrl.endsWith("/api/purchase-invoices") && method === "POST") {
      if (capture) capture.body = JSON.parse(String(options?.body ?? "{}"));
      return new Response(JSON.stringify(FAKE_INVOICE), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

function renderDialog() {
  return render(
    <QueryClientProvider client={queryClient}>
      <InvoiceDialog open onClose={vi.fn()} suppliers={SUPPLIERS as any} accounts={ACCOUNTS as any} embedded unifiedLayout />
    </QueryClientProvider>,
  );
}

async function fillMinimo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("select-supplier"));
  await user.click(await screen.findByText("Proveedor Uno SA"));
  await user.type(screen.getByTestId("input-numero-comprobante"), "00000123");
  await user.type(screen.getByTestId("input-neto-line-0"), "1000");
}

describe("InvoiceDialog — pago parcial al cargar el comprobante", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", buildFetchMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("al elegir una forma real, precarga el monto a pagar ahora con el total", async () => {
    const user = userEvent.setup();
    renderDialog();
    await fillMinimo(user);

    await user.click(screen.getByTestId("select-forma-pago-inmediata"));
    await user.click(await screen.findByRole("option", { name: "Efectivo" }));

    const input = screen.getByTestId("input-monto-pagado-ahora") as HTMLInputElement;
    expect(input.value).toBe("1210.00");
    expect(screen.getByText(/Se genera la Orden de Pago automáticamente/)).toBeInTheDocument();
  });

  it("bajar el monto muestra que el resto queda en cuenta corriente, y lo manda así al enviar", async () => {
    const capture: { body: any } = { body: undefined };
    vi.stubGlobal("fetch", buildFetchMock(capture));
    const user = userEvent.setup();
    renderDialog();
    await fillMinimo(user);

    await user.click(screen.getByTestId("select-forma-pago-inmediata"));
    await user.click(await screen.findByRole("option", { name: "Transferencia" }));

    const input = screen.getByTestId("input-monto-pagado-ahora");
    await user.clear(input);
    await user.type(input, "700");

    expect(screen.getByText(/resto \(\$510[.,]00\) queda pendiente en cuenta corriente/)).toBeInTheDocument();

    await user.click(screen.getByTestId("btn-submit-invoice"));

    await waitFor(() => expect(capture.body).toBeTruthy());
    expect(capture.body.formaPago).toBe("transferencia");
    expect(capture.body.montoPagadoAhora).toBe("700");
  });

  it("volver a Cuenta Corriente oculta el campo y no manda formaPago", async () => {
    const capture: { body: any } = { body: undefined };
    vi.stubGlobal("fetch", buildFetchMock(capture));
    const user = userEvent.setup();
    renderDialog();
    await fillMinimo(user);

    await user.click(screen.getByTestId("select-forma-pago-inmediata"));
    await user.click(await screen.findByRole("option", { name: "Efectivo" }));
    expect(screen.getByTestId("input-monto-pagado-ahora")).toBeInTheDocument();

    await user.click(screen.getByTestId("select-forma-pago-inmediata"));
    await user.click(await screen.findByRole("option", { name: "Cuenta Corriente" }));
    expect(screen.queryByTestId("input-monto-pagado-ahora")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("btn-submit-invoice"));
    await waitFor(() => expect(capture.body).toBeTruthy());
    expect(capture.body.formaPago).toBeNull();
    expect(capture.body.montoPagadoAhora).toBeNull();
  });

  it("bloquea el envío si el monto a pagar ahora supera el total", async () => {
    const capture: { body: any } = { body: undefined };
    vi.stubGlobal("fetch", buildFetchMock(capture));
    const user = userEvent.setup();
    renderDialog();
    await fillMinimo(user);

    await user.click(screen.getByTestId("select-forma-pago-inmediata"));
    await user.click(await screen.findByRole("option", { name: "Efectivo" }));

    const input = screen.getByTestId("input-monto-pagado-ahora");
    await user.clear(input);
    await user.type(input, "999999");

    await user.click(screen.getByTestId("btn-submit-invoice"));
    expect(capture.body).toBeUndefined();
  });
});
