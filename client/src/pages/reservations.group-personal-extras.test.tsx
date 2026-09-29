import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

import { ReservationDetailDialog } from "./reservations";

const GROUP_RESERVATION = {
  id: "res-extras-1",
  reservationCode: "RES-EXTRAS-1",
  groupId: "group-extras-1",
  groupCode: "GR-EXTRAS",
  status: "checked_in",
  checkInDate: "2026-01-01",
  checkOutDate: "2026-01-03",
  totalRoomAmount: "90000",
  numberOfGuests: 1,
  guest: { id: "guest-extras-1", firstName: "Alicia", lastName: "Pérez" },
  room: { id: "room-extras-1", roomNumber: "101", roomType: { name: "Doble" } },
};

describe("Reservation detail — group personal extras payment", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/charges?includeAnulados=true")) {
        return new Response(JSON.stringify([
          { id: "charge-extra-1", description: "Minibar", category: "minibar", amount: "75", status: "pending" },
          { id: "charge-room-1", description: "Alojamiento", category: "room", amount: "90000", status: "pending" },
        ]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/payments?includeAnulados=true")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/payments" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "payment-extras-1" }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      const body = url.endsWith("/api/billing/config") ? {} : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers only direct personal-extra collection and tags the payment purpose", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <ReservationDetailDialog reservation={GROUP_RESERVATION as any} open onOpenChange={vi.fn()} onCancel={vi.fn()} />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByTestId("tab-folio"));
    expect(await screen.findByTestId("group-personal-extras-warning")).toHaveTextContent("no se aceptan pagos de alojamiento");
    await user.click(screen.getByTestId("button-add-payment"));
    expect(screen.getByTestId("input-payment-amount-0")).toHaveValue(75);

    await user.click(screen.getByTestId("select-payment-method-0"));
    expect(screen.queryByText("Cta. Cte.")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("button-confirm-payment"));

    await waitFor(() => {
      const request = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url, init]) =>
        String(url) === "/api/payments" && init?.method === "POST");
      expect(request).toBeDefined();
      expect(JSON.parse(String(request?.[1]?.body))).toEqual(expect.objectContaining({
        reservationId: GROUP_RESERVATION.id,
        amount: "75.00",
        billingTarget: "guest",
        paymentPurpose: "personal_extras",
      }));
      expect(JSON.parse(String(request?.[1]?.body)).method).not.toBe("cuenta_corriente");
    });
  });
});