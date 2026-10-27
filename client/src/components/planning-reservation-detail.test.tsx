import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { api, detail } = vi.hoisted(() => ({ api: vi.fn(), detail: vi.fn() }));
vi.mock("@/pages/reservations", () => ({
  ReservationDetailDialog: (props: any) => {
    detail(props);
    return (
      <section aria-label="Detalle compartido">
        <button onClick={props.onEdit}>Editar datos</button>
        {props.operationalActions}
      </section>
    );
  },
}));
vi.mock("@/components/PrefacturaDialog", () => ({
  PrefacturaDialog: ({ open }: any) =>
    open ? <p>Prefactura de checkout</p> : null,
}));
vi.mock("@/App", () => ({
  useAuth: () => ({ user: { id: "u", username: "Recepción", role: "admin" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/queryClient", async () => ({
  ...(await vi.importActual("@/lib/queryClient")),
  apiRequest: api,
}));
vi.mock("@/lib/utils", async () => ({
  ...(await vi.importActual("@/lib/utils")),
  getLocalToday: () => "2026-10-27",
}));
import { ReservationDetailModal } from "./planning-reservation-detail";

let reservation: any;
function mount(onEdit = vi.fn()) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ReservationDetailModal
        open
        reservationId="r"
        onOpenChange={vi.fn()}
        onNavigate={vi.fn()}
        onEdit={onEdit}
      />
    </QueryClientProvider>,
  );
}
describe("Planning uses the shared detail and preserves operational actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reservation = {
      id: "r",
      status: "confirmed",
      checkInDate: "2026-10-27",
      checkOutDate: "2026-10-28",
      room: { status: "available", roomNumber: "303" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(reservation), {
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    api.mockResolvedValue(new Response("{}"));
  });
  it("delegates editing to the existing reservation form", async () => {
    const edit = vi.fn();
    mount(edit);
    await userEvent.click(
      await screen.findByRole("button", { name: "Editar datos" }),
    );
    expect(edit).toHaveBeenCalledWith(reservation);
    expect(detail.mock.lastCall?.[0].allowCancel).toBe(true);
    expect(api).not.toHaveBeenCalled();
  });
  it("requires confirmation before checking into a dirty room", async () => {
    reservation.room.status = "dirty";
    mount();
    await userEvent.click(await screen.findByTestId("button-checkin-quick"));
    expect(
      await screen.findByText("Habitación no disponible"),
    ).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByTestId("button-confirm-dirty-checkin-planning"),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "POST",
        "/api/reservations/r/check-in",
        {},
      ),
    );
  });
  it("preserves the mandatory reason for retroactive check-in", async () => {
    reservation.checkInDate = "2026-10-26";
    api.mockRejectedValueOnce(
      new Error('409: {"error":"CHECK_IN_RETROACTIVO"}'),
    );
    mount();
    await userEvent.click(await screen.findByTestId("button-checkin-quick"));
    const confirm = await screen.findByTestId(
      "button-confirm-retro-checkin-planning",
    );
    expect(confirm).toBeDisabled();
    await userEvent.type(
      screen.getByTestId("input-retro-motivo-planning"),
      "Llegada registrada tarde",
    );
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(api).toHaveBeenLastCalledWith(
        "POST",
        "/api/reservations/r/check-in",
        { motivo: "Llegada registrada tarde" },
      ),
    );
  });
  it("opens the checkout circuit and preserves the cancel restriction for an occupied stay", async () => {
    reservation.status = "checked_in";
    mount();
    await userEvent.click(await screen.findByTestId("button-checkout-quick"));
    expect(screen.getByText("Prefactura de checkout")).toBeInTheDocument();
    expect(detail.mock.lastCall?.[0].allowCancel).toBe(false);
    expect(api).not.toHaveBeenCalled();
  });
});
