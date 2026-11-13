import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import { PrefacturaDialog } from "./PrefacturaDialog";
import { readPrefacturaSelection } from "@/lib/prefactura-selection";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/queryClient")>(),
  queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
}));
const id = "selection-room-202";
const nightId = "accommodation:2026-11-12";
const reservation = { id, status: "checked_in", guest: { firstName: "Prueba", lastName: "Selección", nationality: "Argentina", vatCondition: "consumidor_final" }, room: { roomNumber: "202" } } as any;
let invoices: any[], charges: any[], writes: Array<{ path: string; body: any }>, failInvoice: boolean;
let numberConflict = false;
let closed = vi.fn<() => void>(), complete = vi.fn<() => void>();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  queryClient.clear(); sessionStorage.clear(); invoices = []; writes = []; failInvoice = false; numberConflict = false;
  closed = vi.fn<() => void>(); complete = vi.fn<() => void>();
  charges = [{ id: "extra-1000", description: "Cargo de prueba", amount: "1000", category: "otros", date: "2026-11-12" }];
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: RequestInit) => {
    const path = String(url), method = init?.method || "GET";
    if (method === "POST") {
      const body = JSON.parse(String(init?.body || "{}")); writes.push({ path, body });
      if (path === "/api/charges") {
        const created = { ...body, id: "new-charge" }; charges.push(created); return json(created);
      }
      if (path === "/api/billing/invoices") {
        if (numberConflict) return json({ error: "Numeración ocupada por el comprobante interno #1539", code: "BILLING_NUMBER_CONFLICT" }, 409);
        if (failInvoice) return json({ error: "Fallo transitorio" }, 503);
        const invoice = { id: 248, reservaId: id, estado: "emitida", tipo_comprobante: "FB",
          monto_total: body.items.reduce((sum: number, item: any) => sum + item.subtotal, 0),
          source_charge_ids: body.sourceChargeIds, source_charge_amounts: body.sourceChargeAmounts, items: body.items };
        invoices.push(invoice); return json(invoice);
      }
      return json({ id: "payment" });
    }
    if (path.endsWith("/folio")) return json({ groupId: "fixture-group", reservationCode: "PRUEBA", guestName: "Prueba Selección", roomNumber: "202",
      nights: 1, roomRate: "150000", roomTotal: 150000,
      accommodationNights: [{ id: nightId, date: "2026-11-12", amount: 150000 }], charges: [...charges], payments: [],
      totalCharges: 1000, totalPayments: 0, grandTotal: 151000, balance: 151000 });
    if (path.endsWith("/group-account")) return json({ groupId: "fixture-group", charges: 151000, paid: 0, balance: 151000, pendingInvoice: 151000, groupCoverage: {}, advances: [], reviewReceipts: [], unassigned: 0 });
    if (path.endsWith("/pending-operation")) return json({ pending: null });
    if (path.endsWith("/reception-status")) return json({ stage: numberConflict ? "blocked" : "prepared", safeToCorrect: false, canRetryNumberConflict: numberConflict });
    if (path.endsWith("/invoices")) return json(invoices);
    if (path.endsWith("/billing/config")) return json({ puntoVenta: 5, arcaAmbiente: "ficticio" });
    if (path.endsWith("/transfer-remaining")) return json({ accommodation: 150000, charges: { "extra-1000": 1000 } });
    if (path === `/api/reservations/${id}`) return json(reservation);
    return json([]);
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function tree(open = true) {
  return <QueryClientProvider client={queryClient}><PrefacturaDialog open={open} onClose={closed} onCheckoutComplete={complete} reservationId={id} reservation={reservation} mode="billing" /></QueryClientProvider>;
}
async function openDialog() {
  const user = userEvent.setup();
  const view = render(tree());
  await waitFor(() => expect(screen.getByTestId("input-payment-amount-0")).toHaveValue(151000));
  await user.click(screen.getByRole("button", { name: /Cargos de la habitación/ }));
  return { user, view };
}
function lodgingCheckbox() { return within(screen.getByRole("row", { name: /Alojamiento Hab/ })).getByRole("checkbox"); }
async function emit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("button-registrar-emitir"));
}
describe("Prefactura conserva exclusivamente los conceptos elegidos", () => {
  it("reintenta un conflicto de número con los mismos conceptos e identificadores de pago", async () => {
    const { user } = await openDialog();
    await user.click(lodgingCheckbox());
    numberConflict = true;
    await emit(user);
    const retry = await screen.findByTestId("button-retry-prefactura");
    await waitFor(() => expect(retry).toBeEnabled());
    const original = structuredClone(writes.find(write => write.path === "/api/billing/invoices")!.body);
    numberConflict = false;
    await user.click(retry);
    await waitFor(() => expect(writes.filter(write => write.path === "/api/billing/invoices")).toHaveLength(2));
    const retried = writes.filter(write => write.path === "/api/billing/invoices")[1].body;
    expect(retried).toEqual(original);
    expect(retried.sourceChargeIds).toEqual(["extra-1000"]);
    expect(retried.prefacturaRecovery.payments[0].paymentRequestId).toBe(original.prefacturaRecovery.payments[0].paymentRequestId);
  });
  it("mantiene la noche excluida tras refrescar, cerrar y reabrir, y emite sólo $1.000", async () => {
    const { user, view } = await openDialog();
    await user.click(lodgingCheckbox());
    await waitFor(() => expect(screen.getByTestId("input-payment-amount-0")).toHaveValue(1000));
    await queryClient.invalidateQueries({ queryKey: ["/api/reservations", id, "folio"] });
    expect(lodgingCheckbox()).not.toBeChecked();
    view.rerender(tree(false)); view.rerender(tree(true));
    await waitFor(() => expect(screen.getByTestId("input-payment-amount-0")).toHaveValue(1000));
    await user.click(screen.getByRole("button", { name: /Cargos de la habitación/ }));
    expect(lodgingCheckbox()).not.toBeChecked();
    await emit(user);
    await waitFor(() => expect(writes.some(write => write.path === "/api/billing/invoices")).toBe(true));
    expect(writes.find(write => write.path === "/api/billing/invoices")!.body).toMatchObject({
      sourceChargeIds: ["extra-1000"], sourceChargeAmounts: { "extra-1000": 1000 },
      items: [{ subtotal: 1000 }],
    });
    await waitFor(() => expect(sessionStorage.getItem(`prefactura-pending:${id}`)).toBeNull());
    expect([...readPrefacturaSelection(sessionStorage, id)!]).toEqual([]);
    expect(lodgingCheckbox()).not.toBeChecked();
    expect(closed).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
  });
  it("conserva una selección vacía incluso al desmontar y volver a cargar la pantalla", async () => {
    const { user, view } = await openDialog();
    await user.click(screen.getByRole("button", { name: "Desmarcar todos" }));
    view.unmount(); queryClient.clear();
    render(tree());
    await user.click(await screen.findByRole("button", { name: /Cargos de la habitación/ }));
    await waitFor(() => expect(lodgingCheckbox()).not.toBeChecked());
    expect([...readPrefacturaSelection(sessionStorage, id)!]).toEqual([]);
    expect(writes).toEqual([]);
  });
  it("muestra el total y conceptos congelados de $151.000 antes de un reintento", async () => {
    const { user } = await openDialog();
    failInvoice = true;
    await emit(user);
    const panel = await screen.findByTestId("billing-original-intent");
    expect(within(panel).getByText(/Alojamiento Hab.*150/)).toBeInTheDocument();
    expect(within(panel).getByText(/Cargo de prueba.*1/)).toBeInTheDocument();
    expect(screen.getByTestId("billing-original-total")).toHaveTextContent(/151/);
    const original = structuredClone(writes.find(write => write.path === "/api/billing/invoices")!.body);
    failInvoice = false;
    await user.click(screen.getByRole("button", { name: "Completar operación pendiente" }));
    await waitFor(() => expect(writes.filter(write => write.path === "/api/billing/invoices")).toHaveLength(2));
    expect(writes.filter(write => write.path === "/api/billing/invoices")[1].body).toEqual(original);
  });
  it("no emite cuando no puede guardar la selección", async () => {
    const { user } = await openDialog();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("Quota"); });
    await user.click(lodgingCheckbox());
    await emit(user);
    expect(await screen.findByTestId("prefactura-selection-error")).toHaveTextContent("No se emitió ni cobró");
    expect(writes).toEqual([]);
  });
  it("selecciona sólo el cargo recién agregado y no restaura la noche excluida", async () => {
    const { user } = await openDialog();
    await user.click(lodgingCheckbox());
    await user.click(screen.getByTestId("button-open-add-charge"));
    await user.type(screen.getByTestId("input-add-charge-description"), "Cargo nuevo");
    await user.type(screen.getByTestId("input-add-charge-amount"), "500");
    await user.click(screen.getByTestId("button-confirm-add-charge"));
    await waitFor(() => expect(screen.getByTestId("input-payment-amount-0")).toHaveValue(1500));
    expect(lodgingCheckbox()).not.toBeChecked();
    expect(new Set(readPrefacturaSelection(sessionStorage, id))).toEqual(new Set(["extra-1000", "new-charge"]));
  });
  it("reabre y reintenta sólo los $1.000 originales después de un fallo transitorio", async () => {
    const { user, view } = await openDialog();
    await user.click(lodgingCheckbox()); failInvoice = true;
    await emit(user); await screen.findByTestId("billing-original-intent");
    const original = structuredClone(writes.find(write => write.path === "/api/billing/invoices")!.body);
    view.rerender(tree(false)); view.rerender(tree(true));
    await screen.findByTestId("billing-original-intent");
    expect(screen.getByTestId("billing-original-total")).toHaveTextContent("1.000");
    failInvoice = false;
    await user.click(screen.getByRole("button", { name: "Completar operación pendiente" }));
    await waitFor(() => expect(writes.filter(write => write.path === "/api/billing/invoices")).toHaveLength(2));
    expect(writes.filter(write => write.path === "/api/billing/invoices")[1].body).toEqual(original);
    expect(original.items).toHaveLength(1); expect(original.items[0].subtotal).toBe(1000);
  });
});
