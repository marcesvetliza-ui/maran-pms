/**
 * Tests for the Check-out list — Notas de la reserva
 *
 * Recepción asked to see a reservation's notes (e.g. who's covering the
 * bill) at a glance on the check-out card, not just buried in Planning's
 * detail popup. /api/dashboard/departures already returns `notes` (it
 * spreads every reservation column) — this only adds the missing render.
 */

import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

const { default: CheckOutPage } = await import("./check-out");

const BASE_RESERVATION = {
  id: "res-1",
  status: "checked_in",
  checkInDate: "2020-01-01",
  checkOutDate: "2020-01-02",
  numberOfGuests: 2,
  totalRoomAmount: "0",
  guest: { firstName: "Nelson", lastName: "Ledesma" },
  room: { roomNumber: "206", roomType: { name: "Suite Panoramica" } },
};

function buildFetchMock(reservations: any[]) {
  return vi.fn(async (url: string | URL | Request) => {
    const strUrl = url.toString();
    if (strUrl.endsWith("/api/dashboard/departures")) {
      return new Response(JSON.stringify(reservations), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (strUrl.endsWith("/api/reservations/no-shows")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <CheckOutPage />
    </QueryClientProvider>,
  );
}

describe("CheckOutPage — Notas de la reserva", () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it("muestra las notas en la tarjeta de check-out cuando la reserva tiene notas", async () => {
    vi.stubGlobal("fetch", buildFetchMock([{ ...BASE_RESERVATION, notes: "PAGA ALOJA GERMAN DEL TORNEO" }]));
    renderPage();

    expect(await screen.findByTestId("checkout-notes-res-1")).toBeInTheDocument();
    expect(screen.getByText(/PAGA ALOJA GERMAN DEL TORNEO/)).toBeInTheDocument();
  });

  it("no muestra el bloque de notas cuando la reserva no tiene notas", async () => {
    vi.stubGlobal("fetch", buildFetchMock([{ ...BASE_RESERVATION, notes: null }]));
    renderPage();

    await screen.findByTestId(`checkout-card-${BASE_RESERVATION.id}`);
    expect(screen.queryByTestId("checkout-notes-res-1")).not.toBeInTheDocument();
  });
});
