import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReubicarDialog } from "./reubicar-dialog";
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/App", () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
let client: QueryClient,
  posts: any[],
  data: any,
  onClose: any,
  postHandler: any;
function mount(initialReservationId: string | undefined = "r") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReubicarDialog
        open
        onOpenChange={onClose}
        initialReservationId={
          initialReservationId === "search" ? undefined : initialReservationId
        }
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  posts = [];
  onClose = vi.fn();
  postHandler = () => ({ status: 200, body: { id: "r", roomId: "target" } });
  data = {
    reservation: {
      id: "r",
      code: "RES-SYNTHETIC",
      guest: "Huésped de prueba",
      room: "301",
      category: "Ejecutiva",
      status: "checked_in",
      guests: 2,
      requestedBed: "Matrimonial",
      bedNotes: null,
      preparation: null,
      from: "2026-11-24",
      to: "2026-11-27",
      token: "a".repeat(64),
    },
    rooms: [
      {
        id: "target",
        roomNumber: "303",
        roomTypeId: "t",
        category: "Ejecutiva",
        categoryOrder: 1,
        floor: 3,
        status: "available",
        bed: "Matrimonial",
        capacity: 2,
        bedComparison: "same",
        ready: true,
        selectable: true,
        unavailableReason: null,
        token: "b".repeat(64),
      },
      {
        id: "dirty",
        roomNumber: "305",
        roomTypeId: "t",
        category: "Ejecutiva",
        categoryOrder: 1,
        floor: 3,
        status: "dirty",
        bed: "Matrimonial",
        capacity: 2,
        bedComparison: "same",
        ready: false,
        selectable: false,
        unavailableReason: "Pendiente de preparación por Housekeeping",
        token: "c".repeat(64),
      },
      {
        id: "upgrade",
        roomNumber: "607",
        roomTypeId: "p",
        category: "Premium",
        categoryOrder: 2,
        floor: 6,
        status: "inspected",
        bed: "Twin",
        capacity: 2,
        bedComparison: "different",
        ready: true,
        selectable: true,
        unavailableReason: null,
        token: "d".repeat(64),
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any, init: any) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(init.body));
        const result = postHandler();
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify(
          String(input).includes("/search")
            ? [
                {
                  id: "r",
                  code: "RES-SYNTHETIC",
                  guest: "Huésped de prueba",
                  room: "REUB",
                  checkIn: "2026-11-24",
                  checkOut: "2026-11-27",
                },
              ]
            : data,
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("shows the whole period and separates a free dirty room from a ready one", async () => {
  mount();
  await screen.findByRole("radio", { name: /Hab. 303/ });
  expect(screen.getByRole("radio", { name: /Hab. 305/ })).toBeDisabled();
  expect(
    screen.getByText(/Desde 24\/11\/2026 hasta 27\/11\/2026/),
  ).toBeVisible();
  expect(screen.getByText(/no garantizan preparación futura/)).toBeVisible();
  expect(posts).toHaveLength(0);
});
it("filters by category, preparation and floor without moving a reservation", async () => {
  mount();
  await screen.findByRole("radio", { name: /Hab. 607/ });
  const user = userEvent.setup();
  fireEvent.click(screen.getByLabelText("Misma categoría"));
  expect(screen.queryByRole("radio", { name: /Hab. 607/ })).toBeNull();
  fireEvent.click(screen.getByLabelText("Listas para ingresar"));
  expect(screen.queryByRole("radio", { name: /Hab. 305/ })).toBeNull();
  expect(posts).toHaveLength(0);
});
it("requires a trimmed reason of five characters and submits only the selected room and acknowledgements", async () => {
  mount();
  await screen.findByRole("radio", { name: /Hab. 303/ });
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: /Hab. 303/ }));
  await user.type(screen.getByLabelText("Motivo del cambio"), "   abcd   ");
  expect(
    screen.getByRole("button", { name: "Confirmar cambio" }),
  ).toBeDisabled();
  await user.clear(screen.getByLabelText("Motivo del cambio"));
  await user.type(screen.getByLabelText("Motivo del cambio"), "  Error  ");
  await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toMatchObject({
    roomId: "target",
    reason: "Error",
    reservationToken: "a".repeat(64),
    destinationToken: "b".repeat(64),
  });
  expect(posts[0]).not.toHaveProperty("totalRoomAmount");
  expect(posts[0]).not.toHaveProperty("checkInDate");
  await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
});
it("requires separate confirmation of bed changes and special Housekeeping preparation", async () => {
  data.reservation.preparation = "Cama preparada — no mover";
  mount();
  await screen.findByRole("radio", { name: /Hab. 607/ });
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: /Hab. 607/ }));
  await user.type(screen.getByLabelText("Motivo del cambio"), "Pedido huésped");
  expect(
    screen.getByRole("button", { name: "Confirmar cambio" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/Housekeeping pidió NO MOVER/));
  expect(
    screen.getByRole("button", { name: "Confirmar cambio" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/Revisé el camaje solicitado/));
  expect(
    screen.getByRole("button", { name: "Confirmar cambio" }),
  ).toBeEnabled();
});
it("cancels without writing or sending the guest through REUB", async () => {
  mount();
  await screen.findByRole("radio", { name: /Hab. 303/ });
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Cancelar" }));
  expect(posts).toHaveLength(0);
  expect(onClose).toHaveBeenCalledWith(false);
});
it("lets reception search and select a reservation already in REUB", async () => {
  mount("search");
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Reserva a reubicar"), "REUB");
  const result = await screen.findByRole("button", {
    name: /Huésped de prueba · Hab. REUB/,
  });
  await user.click(result);
  await screen.findByRole("radio", { name: /Hab. 303/ });
  expect(posts).toHaveLength(0);
});
it("preserves the attempt identity when retrying an ambiguous response", async () => {
  let attempts = 0;
  postHandler = () =>
    ++attempts === 1
      ? { status: 503, body: { error: "Respuesta interrumpida. Reintentá." } }
      : { status: 200, body: { id: "r" } };
  mount();
  await screen.findByRole("radio", { name: /Hab. 303/ });
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: /Hab. 303/ }));
  await user.type(screen.getByLabelText("Motivo del cambio"), "Pedido huésped");
  await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1].operationId).toBe(posts[0].operationId);
});
it("resets confirmations and selection when refreshing stale options", async () => {
  mount();
  await screen.findByRole("radio", { name: /Hab. 607/ });
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: /Hab. 607/ }));
  fireEvent.click(screen.getByLabelText(/Revisé el camaje solicitado/));
  await user.click(screen.getByRole("button", { name: "Actualizar opciones" }));
  expect(screen.getByRole("radio", { name: /Hab. 607/ })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  expect(
    screen.getByRole("button", { name: "Confirmar cambio" }),
  ).toBeDisabled();
});

it("blocks the write while the current session is being verified", async () => {
  const { holdSessionWrites } = await import("@/lib/session-write-guard");
  const owner = Symbol("reubicar test");
  mount();
  await screen.findByRole("radio", { name: /Hab. 303/ });
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: /Hab. 303/ }));
  await user.type(screen.getByLabelText("Motivo del cambio"), "Pedido huésped");
  holdSessionWrites(owner, true);
  try {
    await user.click(screen.getByRole("button", { name: "Confirmar cambio" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "verificando la conexión",
    );
    expect(posts).toHaveLength(0);
  } finally {
    holdSessionWrites(owner, false);
  }
});
