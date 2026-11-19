import {
  render,
  screen,
  cleanup,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
vi.mock("@/App", () => ({
  useAuth: () => ({
    user: { id: "entry-test", role: "reception" },
    hasPermission: () => true,
    permissionsReady: true,
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [] }),
}));
import ReservationsPage from "./reservations";
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const r = await fetch(String(queryKey[0]));
          return r.json();
        },
      },
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  history.replaceState({}, "", "/");
});
function mount() {
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ReservationsPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
it("opens the standard form once from the dashboard/retired entry and performs no writes", async () => {
  history.replaceState({}, "", "/reservations?new=1");
  mount();
  const dialog = await screen.findByRole("dialog", { name: "Nueva Reserva" });
  expect(
    within(dialog).getByRole("button", { name: "Crear Reserva" }),
  ).toBeInTheDocument();
  await waitFor(() => expect(location.search).toBe(""));
  await userEvent.click(within(dialog).getByRole("button", { name: "Volver" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Nueva Reserva" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    vi
      .mocked(fetch)
      .mock.calls.every(([, init]) => !init?.method || init.method === "GET"),
  ).toBe(true);
  await userEvent.click(screen.getByTestId("button-new-reservation"));
  expect(
    await screen.findByRole("dialog", { name: "Nueva Reserva" }),
  ).toBeInTheDocument();
});
it("normal visits still wait for the user to choose New Reservation", async () => {
  history.replaceState({}, "", "/reservations");
  mount();
  await screen.findByTestId("button-new-reservation");
  expect(
    screen.queryByRole("dialog", { name: "Nueva Reserva" }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByTestId("button-new-reservation"));
  expect(
    await screen.findByRole("dialog", { name: "Nueva Reserva" }),
  ).toBeInTheDocument();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.every(([, init]) => !init?.method || init.method === "GET"),
  ).toBe(true);
});
