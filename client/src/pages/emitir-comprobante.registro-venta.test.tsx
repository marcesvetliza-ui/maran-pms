import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

/**
 * "Registrar (ya emitido afuera)" — copiar a mano en el sistema un
 * comprobante de venta que ya se emitió por fuera (p. ej. una Factura T sin
 * reserva asociada), sin pasar por ARCA. Confirmado con el usuario: debe ser
 * un formulario simple contra el Punto de Venta manual del área, sin tocar
 * el flujo de "Emitir ahora" existente (ver RegistrarComprobanteVenta en
 * emitir-comprobante.tsx).
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock("@/App", () => ({
  useAuth: () => ({ user: { id: "user-1", username: "tester", role: "admin" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/queryClient")>();
  return { ...mod, apiRequest: apiRequestMock };
});

const { default: EmitirComprobantePage } = await import("./emitir-comprobante");

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <EmitirComprobantePage />
    </QueryClientProvider>,
  );
}

async function goToVentaTipo(user: ReturnType<typeof userEvent.setup>, areaLabel: string, tipoLabel: string) {
  await user.click(screen.getByTestId("select-area"));
  await user.click(screen.getByRole("option", { name: areaLabel }));
  await user.click(screen.getByTestId("select-operacion"));
  await user.click(screen.getByRole("option", { name: "Venta" }));
  await user.click(screen.getByTestId("select-tipo"));
  await user.click(screen.getByRole("option", { name: tipoLabel }));
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ json: async () => ({ id: 999 }) });
  queryClient.clear();
});

describe("Centro de Comprobantes — registrar venta emitida afuera", () => {
  it("Factura B en Recepción ofrece el toggle Emitir ahora / Registrar, arrancando en Emitir ahora", async () => {
    const user = userEvent.setup();
    renderPage();
    await goToVentaTipo(user, "Alojamiento", "Factura B");

    expect(screen.getByTestId("btn-modo-emitir")).toBeInTheDocument();
    expect(screen.getByTestId("btn-modo-registrar")).toBeInTheDocument();
    expect(screen.getByTestId("emitir-factura-embedded")).toBeInTheDocument();
    expect(screen.queryByTestId("registro-venta")).not.toBeInTheDocument();
  });

  it("una NC/ND nunca ofrece el toggle de registro (siempre requiere factura original)", async () => {
    const user = userEvent.setup();
    renderPage();
    await goToVentaTipo(user, "Alojamiento", "Nota de Crédito B");

    expect(screen.queryByTestId("btn-modo-registrar")).not.toBeInTheDocument();
  });

  it("con un único Punto de Venta manual en el área, lo muestra de una y permite registrar", async () => {
    queryClient.setQueryData(["/api/pos-configs"], [
      { id: 1, nombre: "Recepción", numero: 1, area: "recepcion", tipo: "electronico", activo: true },
      { id: 5, nombre: "PV Manual Recepción", numero: 20, area: "recepcion", tipo: "manual", activo: true },
    ]);
    const user = userEvent.setup();
    renderPage();
    await goToVentaTipo(user, "Alojamiento", "Factura B");
    await user.click(screen.getByTestId("btn-modo-registrar"));

    const form = screen.getByTestId("registro-venta");
    expect(within(form).getByText(/PV Manual Recepción/)).toBeInTheDocument();
    expect(within(form).getByText(/0020/)).toBeInTheDocument();
    expect(screen.queryByTestId("emitir-factura-embedded")).not.toBeInTheDocument();

    expect(screen.getByTestId("btn-registrar-venta")).toBeDisabled();
    await user.type(screen.getByTestId("input-numero-registro"), "123");
    await user.type(screen.getByTestId("input-razon-social-registro"), "Cliente de Prueba");
    await user.type(screen.getByTestId("input-descripcion-registro-0"), "Alojamiento");
    await user.type(screen.getByTestId("input-importe-registro-0"), "1000");
    expect(screen.getByTestId("btn-registrar-venta")).not.toBeDisabled();

    await user.click(screen.getByTestId("btn-registrar-venta"));
    expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/billing/invoices/registrar", expect.objectContaining({
      tipoComprobante: "FB",
      puntoVenta: 20,
      numero: "123",
      cliente: expect.objectContaining({ razonSocial: "Cliente de Prueba", condicionIva: "Consumidor Final" }),
      items: [expect.objectContaining({ descripcion: "Alojamiento", subtotal: 1000, alicuotaIva: "21" })],
    }));
  });

  it("sin ningún Punto de Venta manual en el área, avisa y no deja cargar nada", async () => {
    queryClient.setQueryData(["/api/pos-configs"], [
      { id: 1, nombre: "Recepción", numero: 1, area: "recepcion", tipo: "electronico", activo: true },
    ]);
    const user = userEvent.setup();
    renderPage();
    await goToVentaTipo(user, "Alojamiento", "Factura B");
    await user.click(screen.getByTestId("btn-modo-registrar"));

    expect(screen.getByText(/No hay un Punto de Venta manual activo/)).toBeInTheDocument();
    expect(screen.queryByTestId("input-numero-registro")).toBeInTheDocument();
    expect(screen.getByTestId("btn-registrar-venta")).toBeDisabled();
  });

  it("Factura T registrada no pide alícuota de IVA por renglón (no discrimina)", async () => {
    queryClient.setQueryData(["/api/pos-configs"], [
      { id: 5, nombre: "PV Manual Recepción", numero: 20, area: "recepcion", tipo: "manual", activo: true },
    ]);
    const user = userEvent.setup();
    renderPage();
    await goToVentaTipo(user, "Alojamiento", "Factura T (Turismo)");
    await user.click(screen.getByTestId("btn-modo-registrar"));

    const row = screen.getByTestId("registro-item-0");
    expect(within(row).queryByText("Alícuota IVA")).not.toBeInTheDocument();

    await user.type(screen.getByTestId("input-numero-registro"), "50");
    await user.type(screen.getByTestId("input-razon-social-registro"), "Huésped Extranjero");
    await user.type(screen.getByTestId("input-descripcion-registro-0"), "Alojamiento");
    await user.type(screen.getByTestId("input-importe-registro-0"), "2000");
    await user.click(screen.getByTestId("btn-registrar-venta"));

    expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/billing/invoices/registrar", expect.objectContaining({
      tipoComprobante: "FT",
      items: [expect.objectContaining({ alicuotaIva: "no_gravado" })],
    }));
  });
});
