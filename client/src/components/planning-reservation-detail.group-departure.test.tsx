import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/App", () => ({
  useAuth: () => ({ user: { id: "reception-test", role: "reception" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/utils", async (original) => ({
  ...(await original<any>()),
  getLocalToday: () => "2026-11-12",
}));
vi.mock("@/components/PrefacturaDialog", async () => {
  const { Dialog, DialogContent, DialogDescription, DialogTitle } = await import("@/components/ui/dialog");
  return {
    PrefacturaDialog: ({ open, onCheckoutComplete }: any) => (
      <Dialog open={open}>
        <DialogContent data-testid="prefactura-checkout">
          <DialogTitle>Prefactura de prueba</DialogTitle>
          <DialogDescription>Continuación del checkout individual</DialogDescription>
          <button onClick={onCheckoutComplete}>Completar checkout de prueba</button>
        </DialogContent>
      </Dialog>
    ),
  };
});

import { ReservationDetailModal } from "./planning-reservation-detail";

let reservation: any;
const closed = vi.fn();

function mount() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ReservationDetailModal open reservationId="group-room-802" onOpenChange={closed} onNavigate={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("Planning checkout through the real shared reservation detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    reservation = {
      id: "group-room-802", reservationCode: "GRP-802", status: "checked_in",
      groupId: "existing-group", groupCode: "GR-802", isGroup: false,
      createdAt: "2020-01-01T00:00:00Z", checkInDate: "2026-11-10", checkOutDate: "2026-11-12",
      totalRoomAmount: "300000", numberOfGuests: 1,
      guest: { id: "guest-802", firstName: "Marcela", lastName: "Test" },
      room: { id: "room-802", roomNumber: "802", roomType: { name: "Ejecutiva" } },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/reservations/${reservation.id}`) return Response.json(reservation);
      if (url.endsWith("/group-account")) return Response.json({
        groupId: reservation.groupId, reservationId: reservation.id, charges: 300000, paid: 0,
        balance: 300000, pendingInvoice: 300000, groupCoverage: {}, advances: [], reviewReceipts: [], unassigned: 0,
      });
      if (url === "/api/reservation-edit-permission") return Response.json({ canEdit: false });
      if (url.endsWith("/check-out")) return Response.json({ success: true });
      return Response.json(url.endsWith("/api/billing/config") ? {} : []);
    }));
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(["2020-01-01T00:00:00Z", "2026-11-12T10:00:00Z"])("offers departure without billing for a group room created on %s", async (createdAt) => {
    reservation.createdAt = createdAt;
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    mount();
    await userEvent.click(await screen.findByTestId("button-checkout-quick"));
    expect(await screen.findByRole("heading", { name: "Resolver salida de la habitación" })).toBeInTheDocument();
    expect(screen.queryByTestId("prefactura-checkout")).not.toBeInTheDocument();
    expect(closed).not.toHaveBeenCalled();
    expect((fetch as any).mock.calls.filter(([, init]: any) => init?.method === "POST")).toHaveLength(0);

    await userEvent.type(screen.getByLabelText("Motivo (opcional)"), "Se retira antes que el resto del grupo");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar salida sin cobro" }));
    await waitFor(() => expect(closed).toHaveBeenCalledWith(false));
    const writes = (fetch as any).mock.calls.filter(([, init]: any) => init?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe("/api/reservations/group-room-802/check-out");
    expect(JSON.parse(writes[0][1].body)).toEqual({ groupDeparture: true, reason: "Se retira antes que el resto del grupo" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["/api/planning"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["/api/groups", "existing-group"] });
    expect(screen.queryByTestId("prefactura-checkout")).not.toBeInTheDocument();
  });

  it("opens Prefactura only when reception explicitly chooses to collect or invoice the group room", async () => {
    mount();
    await userEvent.click(await screen.findByTestId("button-checkout-quick"));
    await userEvent.click(screen.getByRole("button", { name: "Cobrar o facturar esta habitación" }));
    expect(await screen.findByTestId("prefactura-checkout")).toBeInTheDocument();
    expect((fetch as any).mock.calls.filter(([, init]: any) => init?.method === "POST")).toHaveLength(0);
  });

  it("keeps ordinary individual checkout on Prefactura", async () => {
    delete reservation.groupId;
    delete reservation.groupCode;
    mount();
    await userEvent.click(await screen.findByTestId("button-checkout-quick"));
    expect(await screen.findByTestId("prefactura-checkout")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Resolver salida de la habitación" })).not.toBeInTheDocument();
    expect((fetch as any).mock.calls.filter(([, init]: any) => init?.method === "POST")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Completar checkout de prueba" }));
    expect(closed).toHaveBeenCalledWith(false);
  });
});
