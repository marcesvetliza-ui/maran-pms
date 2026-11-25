import {
  render,
  screen,
  within,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import { GroupBlocksTable } from "./group-blocks-table";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const block = (id: string, date: string, quantity: number) => ({
  id,
  roomTypeId: "fixture-type",
  quantity,
  blockCheckInDate: date,
  blockCheckOutDate: date === "2026-01-01" ? "2026-01-02" : "2026-01-03",
  roomType: { name: "Fixture Premium", code: "FIX" },
});
const stay = (id: string, date: string) => ({
  id,
  roomId: id + "-room",
  roomTypeId: "fixture-type",
  checkInDate: date,
  checkOutDate: date === "2026-01-01" ? "2026-01-02" : "2026-01-03",
  status: "confirmed",
  guestId: id + "-guest",
  guest: { firstName: "Fixture", lastName: id },
  room: { roomNumber: id },
});
it("keeps each block's progress visible and reveals its rooms only when expanded", async () => {
  const g = {
    id: "fixture-group",
    checkInDate: "2026-01-01",
    checkOutDate: "2026-01-03",
    blocks: [
      block("later", "2026-01-02", 1),
      block("earlier", "2026-01-01", 2),
    ],
    reservations: [stay("9001", "2026-01-01"), stay("9002", "2026-01-02")],
  } as any;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GroupBlocksTable
        group={g}
        onAssign={vi.fn()}
        onDelete={vi.fn()}
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(
    within(screen.getByTestId("row-block-earlier")).getByText(
      "Falta asignar 1",
    ),
  ).toBeInTheDocument();
  expect(
    within(screen.getByTestId("row-block-later")).getByText("Completo"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByTestId("row-block-earlier")).queryByRole("link"),
  ).not.toBeInTheDocument();
  await userEvent.setup().click(within(screen.getByTestId("row-block-earlier")).getByRole("button", {
    name: "Habitaciones y pasajeros del bloque 2",
  }));
  expect(
    within(screen.getByTestId("row-block-earlier")).getByRole("link"),
  ).toHaveAttribute("href", "/reservations?view=9001");
  expect(within(screen.getByTestId("row-block-later")).queryByRole("link")).not.toBeInTheDocument();
});
it("identifies ambiguous metadata through its own endpoint without a room, payment or invoice write", async () => {
  const g = {
    id: "fixture-group",
    checkInDate: "2026-01-01",
    checkOutDate: "2026-01-02",
    blocks: [block("one", "2026-01-01", 1), block("two", "2026-01-01", 1)],
    reservations: [stay("9001", "2026-01-01")],
  } as any;
  const fetcher = vi.fn(async (_url?: any, _options?: any) =>
    Response.json({ ok: true }),
  );
  vi.stubGlobal("fetch", fetcher);
  const saved = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GroupBlocksTable
        group={g}
        onAssign={vi.fn()}
        onDelete={vi.fn()}
        onSaved={saved}
      />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  const toggle = screen.getByRole("button", { name: "1 asignación por ubicar en su bloque" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByLabelText("Bloque de la reserva 9001")).not.toBeInTheDocument();
  await user.click(toggle);
  await user.selectOptions(
    screen.getByLabelText("Bloque de la reserva 9001"),
    "two",
  );
  await user.click(toggle);
  await user.click(toggle);
  expect(screen.getByLabelText("Bloque de la reserva 9001")).toHaveValue("two");
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Ubicar en bloque" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledOnce();
  expect(String(fetcher.mock.calls[0][0])).toBe(
    "/api/groups/fixture-group/reservations/9001/block",
  );
});
it("uses surnames in the compact list while preserving the full identity and reservation link", async () => {
  const g = {
    id: "fixture-group", checkInDate: "2026-01-01", checkOutDate: "2026-01-02",
    blocks: [block("one", "2026-01-01", 1)],
    reservations: [{ ...stay("9010", "2026-01-01"), guest: { firstName: "Juan Carlos", lastName: "DE LA VEGA" } }],
  } as any;
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<QueryClientProvider client={new QueryClient()}><GroupBlocksTable group={g}
    onAssign={vi.fn()} onDelete={vi.fn()} onSaved={vi.fn()} /></QueryClientProvider>);
  const toggle = screen.getByRole("button", { name: "Habitaciones y pasajeros del bloque 1" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  const user = userEvent.setup(); await user.click(toggle);
  const link = screen.getByRole("link", { name: "Hab. 9010 · DE LA VEGA Juan Carlos" });
  expect(link).toHaveTextContent(/^Hab\. 9010 · DE LA VEGA$/);
  expect(link).toHaveAttribute("title", "Hab. 9010 · DE LA VEGA Juan Carlos");
  expect(link).toHaveAttribute("href", "/reservations?view=9010");
  await user.click(toggle);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});
