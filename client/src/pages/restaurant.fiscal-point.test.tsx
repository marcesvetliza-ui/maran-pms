import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
vi.mock("@/App", () => ({ useAuth: () => ({ user: { role: "manager" }, hasPermission: () => true, selectedPosNumero: 24, selectedPosNombre: "Restaurant" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import RestaurantPage from "./restaurant";
let config: any, sent: any[];
beforeEach(() => {
  queryClient.clear(); sent = [];
  config = { arcaAmbiente: "homologacion", puntoVenta: 1, puntoVentaHomolog: 5 };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (url === "/api/billing/config") return json(config);
    if (url === "/api/pos-configs") return json([{ id: "restaurant", area: "restaurant", numero: 24, activo: true, tipo: "electronico", nombre: "Restaurant" }, { id: "spa", area: "spa", numero: 23, activo: true, tipo: "electronico" }]);
    if (url === "/api/billing/invoices" && init?.method === "POST") {
      sent.push(JSON.parse(String(init.body)));
      // Stop at the request boundary: never simulate or perform an issuance.
      return json({ error: "Solicitud interceptada para verificar el punto fiscal." }, 400);
    }
    return json([]);
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });
async function openForm() {
  const user = userEvent.setup();
  render(<QueryClientProvider client={queryClient}><RestaurantPage /></QueryClientProvider>);
  await user.click(await screen.findByTestId("button-emitir-comprobante"));
  await waitFor(() => expect(screen.getByTestId("comp-fiscal-point")).toHaveTextContent(/PV /));
  fireEvent.change(screen.getByPlaceholderText("Desayuno, consumición..."), { target: { value: "Consumo de prueba" } });
  fireEvent.change(within(screen.getByTestId("comp-item-row-0")).getAllByRole("spinbutton")[1], { target: { value: "100" } });
  return user;
}
it("shows and sends homologation point 5, never Restaurant point 24", async () => {
  const user = await openForm();
  expect(screen.getByTestId("comp-fiscal-point")).toHaveTextContent("PV 0005 — Homologación");
  expect(screen.queryByTestId("select-comp-pv")).not.toBeInTheDocument();
  await user.click(screen.getByTestId("btn-comp-emitir"));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toMatchObject({ tipoComprobante: "FB", puntoVenta: 5, cashArea: "restaurant" });
});
it("preserves the configured electronic Restaurant point in production", async () => {
  config.arcaAmbiente = "produccion";
  const user = await openForm();
  expect(screen.getByTestId("comp-fiscal-point")).toHaveTextContent("PV 0024");
  await user.click(screen.getByTestId("btn-comp-emitir"));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0].puntoVenta).toBe(24);
});
it("keeps operational point 24 for non-fiscal internal vouchers in homologation", async () => {
  const user = await openForm();
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getAllByRole("combobox")[0]);
  await user.click(await screen.findByRole("option", { name: "Voucher Justo" }));
  await user.click(screen.getByTestId("btn-comp-emitir"));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toMatchObject({ tipoComprobante: "voucher_justo", puntoVenta: 24 });
});
it("does not replace a missing homologation configuration with point 24", async () => {
  config.puntoVentaHomolog = null;
  const user = userEvent.setup();
  render(<QueryClientProvider client={queryClient}><RestaurantPage /></QueryClientProvider>);
  await user.click(await screen.findByTestId("button-emitir-comprobante"));
  await waitFor(() => expect(screen.getByTestId("comp-fiscal-point")).toHaveTextContent(/punto de venta no corresponde/));
  expect(screen.getByTestId("btn-comp-emitir")).toBeDisabled();
  expect(sent).toHaveLength(0);
});
