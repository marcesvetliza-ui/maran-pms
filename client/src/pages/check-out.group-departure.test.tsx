import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));
vi.mock("@/components/PrefacturaDialog", () => ({
  PrefacturaDialog: ({ open }: { open: boolean }) => open ? <div data-testid="prefactura-open" /> : null,
}));

const { default: CheckOutPage } = await import("./check-out");

const groupedReservation = {
  id: "res-group-1",
  groupId: "group-42",
  groupCode: "GR-042",
  status: "checked_in",
  checkInDate: "2020-01-01",
  checkOutDate: "2020-01-02",
  numberOfGuests: 2,
  totalRoomAmount: "12000",
  guest: { firstName: "Ana", lastName: "Pérez" },
  room: { roomNumber: "206" },
};

describe("CheckOutPage — group departure", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.endsWith("/api/dashboard/departures") ? [groupedReservation] : [];
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("confirms group departure without opening Prefactura and posts the explicit no-charge flag", async () => {
    const user = userEvent.setup();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    render(<QueryClientProvider client={queryClient}><CheckOutPage /></QueryClientProvider>);

    expect(await screen.findByTestId("badge-group-res-group-1")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-checkout-res-group-1"));
    expect(await screen.findByRole("heading", { name: "Check-out grupal sin cobro" })).toBeInTheDocument();
    expect(screen.getAllByText(/GR-042/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Consultar folio grupal/)).toBeInTheDocument();
    expect(screen.queryByText(/Saldo provisional de habitación/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("prefactura-open")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("input-group-checkout-reason"), { target: { value: "Salida coordinada" } });
    await user.click(screen.getByTestId("button-confirm-group-checkout-no-charge"));

    await waitFor(() => {
      const request = fetchMock.mock.calls.find(([url, init]) =>
        String(url).endsWith("/api/reservations/res-group-1/check-out") && init?.method === "POST");
      expect(request).toBeDefined();
      expect(JSON.parse(String(request?.[1]?.body))).toEqual({ groupDeparture: true, reason: "Salida coordinada" });
    });
  });
});