import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalToday } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/components/PrefacturaDialog", () => ({
  PrefacturaDialog: ({ open, reservation, reservationId, mode }: any) => open ? (
    <div data-testid="prefactura-mock">
      {mode}:{reservationId}:{reservation?.company?.razonSocial}:{reservation?.status}
    </div>
  ) : null,
}));

const { default: CheckInPage } = await import("./check-in");

const today = getLocalToday();
const reservation = {
  id: "reservation-checkin-billing",
  reservationCode: "RES-COBRO",
  guestId: "guest-1",
  companyId: "company-1",
  agencyId: null,
  roomTypeId: "type-1",
  roomId: "room-207",
  ratePlanId: null,
  checkInDate: today,
  checkOutDate: today,
  nights: 2,
  finalRatePerNight: "153000",
  totalRoomAmount: "306000",
  numberOfGuests: 1,
  status: "confirmed",
  source: "empresa",
  notes: "Factura a empresa",
  guest: { id: "guest-1", firstName: "Gabriel", lastName: "Grabobi" },
  company: { id: "company-1", razonSocial: "PAPELERA ER SA", cuit: "30-12345678-9" },
  room: { id: "room-207", roomNumber: "207", status: "clean", roomType: { name: "Premium" } },
};

describe("Check-in con cobro", () => {
  beforeEach(() => {
    queryClient.clear();
    queryClient.setQueryData(["/api/reservations/check-in"], [reservation]);
    queryClient.setQueryData(["/api/room-types"], []);
    queryClient.setQueryData(["/api/rooms"], []);
    queryClient.setQueryData(["/api/rate-plans"], []);
    queryClient.setQueryData(["/api/maintenance/blocks"], []);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/api/reservations/${reservation.id}/check-in`) && init?.method === "POST") {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("confirma el ingreso y abre Prefactura en modo billing con la reserva completa", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <CheckInPage />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /realizar check-in/i }));
    await user.click(screen.getByRole("button", { name: /confirmar check-in y cobrar/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/reservations/${reservation.id}/check-in`,
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByTestId("prefactura-mock")).toHaveTextContent(
      `billing:${reservation.id}:PAPELERA ER SA:checked_in`,
    );
  });
});
