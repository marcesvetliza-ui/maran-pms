import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
vi.mock("@/App", () => ({ useAuth: () => ({ user: { role: "reception" } }) }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));
import { PrefacturaDialog } from "./PrefacturaDialog";
import { ReservationDetailDialog } from "@/pages/reservations";
const orderNumber = "ORD-20261119-2516";
const reservation = {
  id: "origin-stay",
  reservationCode: "SYNTHETIC-503",
  status: "checked_in",
  checkInDate: "2026-11-18",
  checkOutDate: "2026-11-20",
  nights: 2,
  totalRoomAmount: "294000.00",
  numberOfGuests: 1,
  guest: { id: "g", firstName: "Huésped", lastName: "Prueba" },
  room: { id: "room", roomNumber: "503", roomType: { name: "Ejecutiva" } },
};
const charge = {
  id: "restaurant-part",
  description: `Restaurante - Pedido ${orderNumber} (Parte 1)`,
  amount: "19500.00",
  category: "restaurant",
  date: "2026-11-19",
  status: "active",
};
const otherCharges = [
  {
    ...charge,
    id: "manual-restaurant",
    description: "Consumo manual sin pedido",
    amount: "1000.00",
  },
  {
    ...charge,
    id: "other",
    category: "otros",
    description: `Referencia Pedido ${orderNumber}`,
    amount: "1500.00",
  },
];
const detail = {
  orderNumber,
  total: "39000.00",
  waiterName: "Mozo de prueba",
  items: [
    {
      id: "item-1",
      menuItemName: "Menú del día",
      quantity: 2,
      subtotal: "39000.00",
      notes: "Sin sal",
    },
  ],
};
let invoiced: boolean,
  failed: boolean,
  malformed: boolean,
  requests: Array<{ url: string; method: string }>;
beforeEach(() => {
  queryClient.clear();
  sessionStorage.clear();
  invoiced = false;
  failed = false;
  malformed = false;
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, method: init?.method || "GET" });
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });
      if (url === `/api/restaurant/orders/by-number/${orderNumber}`)
        return malformed
          ? json({ orderNumber, items: {} })
          : failed
            ? json({ error: "Order not found" }, 404)
            : json(detail);
      if (url.endsWith("/manual-charge-actions"))
        return json({
          charges: [charge, ...otherCharges].map((c) => ({
            ...c,
            canEdit: false,
            eligible: false,
            reason: "Solo consulta",
          })),
        });
      if (url.endsWith("/folio"))
        return json({
          ...reservation,
          guestName: "Huésped Prueba",
          roomNumber: "503",
          roomTotal: 294000,
          charges: [charge, ...otherCharges],
          payments: [],
          totalPayments: 0,
          totalCharges: 22000,
          grandTotal: 316000,
          balance: 316000,
        });
      if (url.endsWith("/charges?includeAnulados=true"))
        return json([charge, ...otherCharges]);
      if (url.endsWith("/transfer-remaining"))
        return json({
          accommodation: 294000,
          charges: {
            "restaurant-part": 19500,
            "manual-restaurant": 1000,
            other: 1500,
          },
        });
      if (url === `/api/reservations/${reservation.id}`)
        return json(reservation);
      if (url.endsWith("/invoices"))
        return json(
          invoiced
            ? [
                {
                  id: 1,
                  estado: "emitida",
                  tipo_comprobante: "FB",
                  source_charge_ids: [charge.id],
                  source_charge_amounts: { [charge.id]: 19500 },
                  monto_total: "19500.00",
                },
              ]
            : [],
        );
      if (url === "/api/billing/config")
        return json({ puntoVenta: 1, arcaAmbiente: "ficticio" });
      return json([]);
    }),
  );
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});
async function open(mode: "checkout" | "billing" = "checkout") {
  const close = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <PrefacturaDialog
        reservationId={reservation.id}
        reservation={reservation as any}
        open
        onClose={close}
        mode={mode}
      />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: /Cargos de la habitación/ }),
  );
  return { user, close, view };
}
it.each(["checkout", "billing"] as const)(
  "opens the original split restaurant order read-only from %s and retains the prepared operation",
  async (mode) => {
    const { user, close } = await open(mode);
    const selection = await screen.findByRole("checkbox", {
      name: `Seleccionar ${charge.description}`,
    });
    const wasSelected = selection.getAttribute("data-state");
    const amount = screen.getByTestId("input-payment-amount-0");
    await user.clear(amount);
    await user.type(amount, "12345.67");
    await user.click(
      screen.getByTestId(
        "button-view-origin-prefactura-charge-restaurant-part",
      ),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Detalle de Consumo — Restaurante",
    });
    expect(await within(dialog).findByText("Menú del día")).toBeInTheDocument();
    expect(within(dialog).getByText("Sin sal")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Pedido #ORD-20261119-2516/),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText("$39.000,00")).toHaveLength(2);
    await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    expect(screen.getByTestId("input-payment-amount-0")).toBe(amount);
    expect(amount).toHaveValue(12345.67);
    expect(selection).toHaveAttribute("data-state", wasSelected!);
    expect(close).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: /Prefactura/ }),
    ).toBeInTheDocument();
    expect(requests.every((r) => r.method === "GET")).toBe(true);
  },
);
it("keeps origin inspection available for an already invoiced charge while its selection remains protected", async () => {
  invoiced = true;
  const { user } = await open();
  const selection = await screen.findByRole("checkbox", {
    name: `Seleccionar ${charge.description}`,
  });
  await waitFor(() => expect(selection).toBeDisabled());
  await user.click(
    screen.getByTestId("button-view-origin-prefactura-charge-restaurant-part"),
  );
  expect(await screen.findByText("Menú del día")).toBeInTheDocument();
  expect(requests.every((r) => r.method === "GET")).toBe(true);
});
it("does not offer origin inspection for manual consumption without an order or for another category", async () => {
  await open();
  expect(screen.getAllByRole("button", { name: "Ver origen" })).toHaveLength(1);
  expect(
    screen.queryByTestId(
      "button-view-origin-prefactura-charge-manual-restaurant",
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByTestId("button-view-origin-prefactura-charge-other"),
  ).not.toBeInTheDocument();
  expect(requests.some((r) => r.url.includes("/orders/by-number/"))).toBe(
    false,
  );
});
it("allows retrying a failed lookup and closing it without losing the payment draft", async () => {
  failed = true;
  const { user, close } = await open();
  const amount = screen.getByTestId("input-payment-amount-0");
  await user.clear(amount);
  await user.type(amount, "12000");
  await user.click(
    screen.getByTestId("button-view-origin-prefactura-charge-restaurant-part"),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudo consultar el detalle del pedido.",
  );
  failed = false;
  await user.click(screen.getByRole("button", { name: "Reintentar consulta" }));
  const dialog = screen.getByRole("dialog", {
    name: "Detalle de Consumo — Restaurante",
  });
  expect(await within(dialog).findByText("Menú del día")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
  expect(amount).toHaveValue(12000);
  expect(close).not.toHaveBeenCalled();
  expect(requests.every((r) => r.method === "GET")).toBe(true);
});
it("uses the same detail from the Planning reservation folio", async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <ReservationDetailDialog
        reservation={reservation as any}
        open
        onOpenChange={vi.fn()}
        onCancel={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByTestId("tab-folio"));
  await user.click(await screen.findByTestId("button-voucher-restaurant-part"));
  expect(await screen.findByText("Menú del día")).toBeInTheDocument();
  expect(
    requests.some(
      (r) => r.url === `/api/restaurant/orders/by-number/${orderNumber}`,
    ),
  ).toBe(true);
  expect(requests.every((r) => r.method === "GET")).toBe(true);
});
it("closes the source detail when switching to another reservation", async () => {
  const { user, view } = await open();
  await user.click(
    screen.getByTestId("button-view-origin-prefactura-charge-restaurant-part"),
  );
  await screen.findByText("Menú del día");
  const next = { ...reservation, id: "another-stay" };
  view.rerender(
    <QueryClientProvider client={queryClient}>
      <PrefacturaDialog
        reservationId={next.id}
        reservation={next as any}
        open
        onClose={vi.fn()}
        mode="checkout"
      />
    </QueryClientProvider>,
  );
  expect(
    screen.queryByRole("dialog", { name: "Detalle de Consumo — Restaurante" }),
  ).not.toBeInTheDocument();
});

it("handles a malformed successful lookup without crashing or closing the checkout account", async () => {
  malformed = true;
  const { user, close } = await open();
  await user.click(
    screen.getByTestId("button-view-origin-prefactura-charge-restaurant-part"),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudo consultar el detalle del pedido.",
  );
  const dialog = screen.getByRole("dialog", {
    name: "Detalle de Consumo — Restaurante",
  });
  await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
  expect(
    screen.getByRole("dialog", { name: /Prefactura/ }),
  ).toBeInTheDocument();
  expect(close).not.toHaveBeenCalled();
  expect(requests.every((r) => r.method === "GET")).toBe(true);
});

it("closes only the source detail on Escape and retains the checkout draft", async () => {
  const { user, close } = await open();
  const amount = screen.getByTestId("input-payment-amount-0");
  await user.clear(amount);
  await user.type(amount, "18000");
  await user.click(
    screen.getByTestId("button-view-origin-prefactura-charge-restaurant-part"),
  );
  await screen.findByText("Menú del día");
  await user.keyboard("{Escape}");
  expect(
    screen.queryByRole("dialog", { name: "Detalle de Consumo — Restaurante" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("dialog", { name: /Prefactura/ }),
  ).toBeInTheDocument();
  expect(amount).toHaveValue(18000);
  expect(close).not.toHaveBeenCalled();
});
