import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RestaurantEvents } from "./restaurant-events";
import { getArgentinaToday } from "@/lib/utils";
vi.mock("@/App", () => ({
  useAuth: () => ({ user: { id: "synthetic-user" } }),
}));
const notices = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: notices }) }));
let requests: any[],
  failWrite: boolean,
  client: QueryClient,
  onOpenOrder: (id: string) => Promise<void>;
const e = {
  id: "event",
  name: "Navidad",
  date: getArgentinaToday(),
  endDate: getArgentinaToday(),
  time: "20:00",
  endTime: "23:59",
  area_id: "area",
  areaName: "Salón",
  capacity: 40,
  persons: 6,
  bookingCount: 1,
  adult_price: "100",
  child_price: "50",
  includes: "Cena con bebida",
  status: "confirmed",
};
const booking = {
  reservation_id: "booking",
  guestName: "Familia Prueba",
  phone: "123456",
  adults: 5,
  children: 1,
  status: "confirmed",
  tables: [],
  contracted_total: "550",
  advances: "150",
  payments: [
    {
      id: "a",
      amount: "100",
      method: "efectivo",
      date: "2026-12-01T01:00:00.000Z",
      documentStatus: "completed",
      receipt: "ER-1",
      invoiceId: 1,
    },
    {
      id: "b",
      amount: "50",
      method: "transferencia",
      date: getArgentinaToday(),
      documentStatus: "completed",
      receipt: "ER-2",
      invoiceId: 2,
    },
  ],
};
beforeEach(() => {
  requests = [];
  failWrite = false;
  notices.mockClear();
  sessionStorage.clear();
  onOpenOrder = vi.fn().mockResolvedValue(undefined);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, options: any = {}) => {
      const url = String(input);
      const result = (data: any, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (options.method && options.method !== "GET") {
        const body = JSON.parse(options.body || "{}");
        requests.push({ url, body });
        if (failWrite) return result({ error: "Resultado desconocido" }, 504);
        return result(
          url.endsWith("/start") ? { orderId: "order" } : { id: "booking" },
        );
      }
      if (url.endsWith("/catalog"))
        return result({
          areas: [
            { id: "area", name: "Salón", capacity: 40, isActive: "true" },
          ],
          items: [{ id: "product", name: "Menú de prueba", isActive: "true" }],
        });
      if (url === "/api/restaurant/events/event")
        return result({
          event: e,
          bookings: [booking],
          tables: [
            { id: "one", number: "1", capacity: 4 },
            { id: "two", number: "2", capacity: 4 },
          ],
        });
      return result([e]);
    }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
const show = () =>
  render(
    <QueryClientProvider client={client}>
      <RestaurantEvents onOpenOrder={onOpenOrder} />
    </QueryClientProvider>,
  );
async function openEvent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Navidad/ }));
  await screen.findByText("Familia Prueba");
}
it("shows the event date, accumulated advances and the remaining menu balance", async () => {
  const user = userEvent.setup();
  show();
  await openEvent(user);
  expect(screen.getByText("Sin mesa asignada")).toBeInTheDocument();
  expect(screen.getByText(/400,00/)).toBeInTheDocument();
  await user.click(screen.getByText("Ver 2 anticipos y comprobantes"));
  expect(screen.getByText("ER-1")).toBeInTheDocument();
  expect(screen.getByText(/30\/11\/2026/)).toBeInTheDocument();
  expect(screen.getByText("ER-2")).toBeInTheDocument();
  expect(requests).toHaveLength(0);
});
it("creates a reservation without assigning a physical table", async () => {
  const user = userEvent.setup();
  show();
  await openEvent(user);
  await user.click(screen.getByRole("button", { name: "Nueva reserva" }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Titular"), "Cliente nuevo");
  await user.type(within(dialog).getByLabelText("Teléfono"), "123456");
  await user.click(
    within(dialog).getByRole("button", { name: "Crear reserva" }),
  );
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].body).toMatchObject({
    guestName: "Cliente nuevo",
    adults: 2,
    children: 0,
  });
  expect(requests[0].body).not.toHaveProperty("tableId");
});
it("saves several tables in one assignment without touching any payment", async () => {
  const user = userEvent.setup();
  show();
  await openEvent(user);
  await user.click(screen.getByRole("button", { name: "Asignar mesas" }));
  const dialog = screen.getByRole("dialog");
  for (const checkbox of within(dialog).getAllByRole("checkbox")) {
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  }
  await user.click(
    within(dialog).getByRole("button", { name: "Guardar mesas" }),
  );
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]).toMatchObject({
    url: "/api/restaurant/events/bookings/booking/tables",
    body: { tableIds: ["one", "two"] },
  });
});
it("retains an ambiguous collection attempt across a reload and retries the original operation", async () => {
  const user = userEvent.setup();
  const view = show();
  await openEvent(user);
  await user.click(screen.getByRole("button", { name: "Agregar anticipo" }));
  await user.type(screen.getByLabelText("Importe del anticipo"), "50");
  failWrite = true;
  await user.click(screen.getByRole("button", { name: "Registrar anticipo" }));
  await waitFor(() => expect(requests).toHaveLength(1));
  const first = requests[0].body.operationId;
  await waitFor(() =>
    expect(
      sessionStorage.getItem("restaurant-event-pending:synthetic-user"),
    ).not.toBeNull(),
  );
  view.unmount();
  client.clear();
  show();
  failWrite = false;
  await user.click(
    await screen.findByRole("button", { name: "Verificar intento pendiente" }),
  );
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1].body.operationId).toBe(first);
  expect(requests[1].body.amount).toBe("50");
  await waitFor(() =>
    expect(
      sessionStorage.getItem("restaurant-event-pending:synthetic-user"),
    ).toBeNull(),
  );
});
