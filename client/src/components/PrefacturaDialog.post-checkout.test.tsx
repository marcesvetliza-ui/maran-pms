import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import { PrefacturaDialog } from "./PrefacturaDialog";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", async original => ({ ...await original<typeof import("@/lib/queryClient")>(), queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }));
const id = "old-802-stay", chargeId = "post-checkout:9bbf8a42-0c06-40ae-9ab2-12e3a61edba7";
const reservation = { id, guestId: "old-guest", status: "checked_out", guest: { id: "old-guest", firstName: "Anterior", lastName: "Huésped", nationality: "Argentina", vatCondition: "consumidor_final" }, room: { roomNumber: "802", status: "occupied" } } as any;
let writes: any[], fail = false;
beforeEach(() => {
  sessionStorage.clear(); queryClient.clear(); writes = []; fail = false;
  vi.stubGlobal("fetch", vi.fn(async (url: any, options?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/recover")) return Response.json({error:"No operation"},{status:404});
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body || "{}")); writes.push({ path, body });
      if (fail && path === "/api/billing/invoices") return Response.json({ error: "Transitorio" }, { status: 503 });
      return Response.json({ id: path === "/api/billing/invoices" ? 222 : "new-payment", tipoComprobante: "FB", puntoVenta: 1, numero: 222, montoTotal: "121.00", estado: "emitida" });
    }
    if (path.endsWith("/folio")) return Response.json({ roomNumber: "802", nights: 1, roomTotal: 10000, roomRate: 10000, balance: 121, grandTotal: 11121, totalCharges: 1121, totalPayments: 11000,
      accommodationNights: [{ id: "accommodation:2026-11-16", date: "2026-11-16", amount: 10000 }],
      charges: [{ id: "historical-extra", description: "Consumo de la estadía", amount: "1000", date: "2026-11-16", category: "otros" }, { id: chargeId, description: "Cena posterior", amount: "121", date: "2026-11-17", category: "restaurant" }],
      payments: [{ id: "historical-payment", amount: "11000", status: "active", method: "efectivo", invoiceRef: JSON.stringify({ id: 111 }) }] });
    if (path.endsWith("/invoices")) return Response.json([{ id: 111, estado: "emitida", tipo_comprobante: "FB", monto_total: "11000", source_charge_ids: ["accommodation:2026-11-16", "historical-extra"], source_charge_amounts: { "accommodation:2026-11-16": 10000, "historical-extra": 1000 } }]);
    if (path === "/api/billing/config") return Response.json({ puntoVenta: 1, arcaAmbiente: "ficticio" });
    if (path.endsWith("/pending-operation")) return Response.json({ pending: null });
    return Response.json([]);
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });
function tree() { return <QueryClientProvider client={queryClient}><PrefacturaDialog open onClose={vi.fn()} reservationId={id} reservation={reservation} mode="billing" postCheckoutOnly /></QueryClientProvider>; }

it("limits the invoice to post-stay charges, defaults to CC and never calls checkout or repeats an old payment", async () => {
  render(tree()); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Cargos de la habitación/ }));
  expect(screen.queryByRole("row", { name: /Alojamiento Hab/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("row", { name: /Consumo de la estadía/ })).not.toBeInTheDocument();
  expect(within(screen.getByRole("row", { name: /Cena posterior/ })).getByRole("checkbox")).toBeChecked();
  expect(screen.queryByTestId("button-open-add-charge")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId("select-sale-condition")).toHaveTextContent("Cuenta Corriente"));
  await user.click(screen.getByTestId("button-registrar-emitir"));
  await waitFor(() => expect(writes.find(write => write.path === "/api/billing/invoices")).toBeTruthy());
  const request = writes.find(write => write.path === "/api/billing/invoices").body;
  expect(request).toMatchObject({ reservaId: id, sourceChargeIds: [chargeId], sourceChargeAmounts: { [chargeId]: 121 }, ccEntityType: "guest", ccEntityId: "old-guest", reservationSettlementMethod: "cuenta_corriente", ordinaryAdvanceApplications: [], creditReapplications: [] });
  expect(writes.filter(write => write.path === "/api/payments" || /check-out|undo-checkout/.test(write.path))).toHaveLength(0);
});
it("retries the frozen post-stay invoice without adding historical accommodation", async () => {
  fail = true; render(tree()); const user = userEvent.setup();
  await waitFor(() => expect(screen.getByTestId("select-sale-condition")).toHaveTextContent("Cuenta Corriente"));
  await user.click(screen.getByTestId("button-registrar-emitir"));
  await screen.findByTestId("billing-original-intent");
  const original = structuredClone(writes[0]); fail = false;
  await user.click(screen.getByRole("button", { name: "Completar operación pendiente" }));
  await waitFor(() => expect(writes.filter(write => write.path === "/api/billing/invoices")).toHaveLength(2));
  expect(writes[1]).toEqual(original);
});
