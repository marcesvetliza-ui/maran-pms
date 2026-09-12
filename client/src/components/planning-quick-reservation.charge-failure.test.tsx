/**
 * Tests for QuickReservationDialog — charge-failure path
 *
 * Task #68: Prevent a silent reservation loss when charge creation fails
 * during Quick Reservation on mobile.
 *
 * Covers two scenarios:
 *
 * A) POST /api/reservations → 201, POST /api/charges → 500
 *    - The reservation is saved (planning queries invalidated, dialog closes)
 *    - A warning toast is shown ("Reserva creada — cargos pendientes")
 *
 * B) POST /api/reservations → 500
 *    - The reservation is NOT saved (planning queries NOT invalidated)
 *    - An error toast is shown, the dialog stays open
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// ── Module mocks ──────────────────────────────────────────────────────────────

// Capture toast calls so we can assert on them
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
}));

// Keep a fresh queryClient for each test (avoids cross-test cache pollution)
vi.mock("@/lib/queryClient", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/queryClient")>();
  return {
    ...mod,
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
  };
});

// GuestFormDialog pulls in many heavy deps; stub it out
vi.mock("@/pages/guests", () => ({
  GuestFormDialog: () => null,
}));

// entity-selector stubs
vi.mock("@/components/entity-selector", () => ({
  CompanySelector: () => null,
  AgencySelector: () => null,
}));

// Lazy import after mocks are registered
const {
  QuickReservationDialog,
  getQuickReservationRateState,
  getQuickReservationErrorToast,
} = await import("./planning-quick-reservation");

// ── Constants ─────────────────────────────────────────────────────────────────

const RESERVATION_RESPONSE = {
  id: "res-abc-123",
  guestId: "guest-1",
  roomId: "room-1",
  checkInDate: "2026-09-01",
  checkOutDate: "2026-09-02",
  status: "confirmed",
};

const RESERVATION_DATA = {
  roomId: "room-1",
  roomNumber: "101",
  roomTypeName: "Standard",
  roomTypeId: "rt-1",
  bedConfig: "Doble",
  checkInDate: "2026-09-01",
};

const GUESTS = [
  { id: "guest-1", firstName: "Ana", lastName: "García", documentNumber: "12345678" } as any,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * A fetch mock where reservation creation succeeds (201) and charge creation
 * fails (500).
 */
function buildFetchMock_reservationOk_chargeFail() {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    // Reservation creation — success
    if (strUrl.includes("/api/reservations") && method === "POST") {
      return new Response(JSON.stringify(RESERVATION_RESPONSE), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Charge creation — server error
    if (strUrl.includes("/api/charges") && method === "POST") {
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // All other GETs (charge-types, rate-plans, packages, bed-types, etc.)
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

/**
 * A fetch mock where reservation creation itself fails (500).
 */
function buildFetchMock_reservationFail() {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    // Reservation creation — server error
    if (strUrl.includes("/api/reservations") && method === "POST") {
      return new Response(JSON.stringify({ error: "Ingresá el motivo de la tarifa $0 para guardar la reserva." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // All other requests
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/**
 * Renders the dialog pre-filled so the submit button is usable:
 * - A guest is selected
 * - Check-out date is set (day after check-in)
 * If `withCharge` is true, a pending charge is added via the UI.
 */
async function renderAndFill(withCharge: boolean) {
  const onOpenChange = vi.fn();
  const user = userEvent.setup();

  render(
    <Wrapper>
      <QuickReservationDialog
        open={true}
        onOpenChange={onOpenChange}
        reservationData={RESERVATION_DATA}
        guests={GUESTS}
      />
    </Wrapper>
  );

  // Select guest
  const guestSearch = screen.getByTestId("input-guest-search");
  await user.click(guestSearch);
  const guestOption = screen.getByTestId("guest-option-guest-1");
  await user.click(guestOption);

  // Set check-out date (one day after check-in)
  const checkoutInput = screen.getByTestId("input-checkout-quick");
  fireEvent.change(checkoutInput, { target: { value: "2026-09-02" } });

  if (withCharge) {
    // Open charge form
    await user.click(screen.getByTestId("button-toggle-quick-charge"));

    // Fill charge fields
    const descInput = screen.getByTestId("input-quick-charge-desc");
    const amountInput = screen.getByTestId("input-quick-charge-amount");
    await user.clear(descInput);
    await user.type(descInput, "Desayuno");
    await user.clear(amountInput);
    await user.type(amountInput, "500");

    // Confirm charge
    await user.click(screen.getByTestId("button-confirm-quick-charge"));
  }

  return { onOpenChange, user };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("QuickReservationDialog — charge creation failure path", () => {
  beforeEach(() => {
    toastSpy.mockClear();
  });

  // ── Scenario A: reservation OK, charges fail ────────────────────────────────

  describe("when /api/reservations returns 201 but /api/charges returns 500", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", buildFetchMock_reservationOk_chargeFail());
    });

    it("shows the 'Reserva creada' success toast (reservation was saved)", async () => {
      const { user } = await renderAndFill(true);

      await user.click(screen.getByTestId("button-create-quick"));

      await waitFor(
        () =>
          expect(toastSpy).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Reserva creada" })
          ),
        { timeout: 5000 }
      );
    });

    it("closes the dialog after the reservation is saved (planning board will refresh)", async () => {
      const { user, onOpenChange } = await renderAndFill(true);

      await user.click(screen.getByTestId("button-create-quick"));

      await waitFor(
        () => expect(onOpenChange).toHaveBeenCalledWith(false),
        { timeout: 5000 }
      );
    });

    it("shows the warning toast about pending charges when charge POST fails", async () => {
      const { user } = await renderAndFill(true);

      await user.click(screen.getByTestId("button-create-quick"));

      await waitFor(
        () =>
          expect(toastSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "Reserva creada — cargos pendientes",
              variant: "destructive",
            })
          ),
        { timeout: 5000 }
      );
    });

    it("does NOT show an error toast claiming the entire reservation failed", async () => {
      const { user } = await renderAndFill(true);

      await user.click(screen.getByTestId("button-create-quick"));

      // Wait for the warning toast to confirm the async flow completed
      await waitFor(
        () =>
          expect(toastSpy).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Reserva creada — cargos pendientes" })
          ),
        { timeout: 5000 }
      );

      // The "Error / No se pudo crear la reserva" toast must NOT have been called
      const allToastTitles = toastSpy.mock.calls.map((call: any[]) => call[0]?.title);
      expect(allToastTitles).not.toContain("Error");
    });

    it("works correctly even when there are no pending charges (no charge POST is made)", async () => {
      const fetchMock = buildFetchMock_reservationOk_chargeFail();
      vi.stubGlobal("fetch", fetchMock);

      const { user, onOpenChange } = await renderAndFill(false); // no charges

      await user.click(screen.getByTestId("button-create-quick"));

      await waitFor(
        () => expect(onOpenChange).toHaveBeenCalledWith(false),
        { timeout: 5000 }
      );

      // Confirm the charges endpoint was never called
      const chargeCalls = fetchMock.mock.calls.filter((args: any[]) =>
        args[0]?.toString().includes("/api/charges") &&
        (args[1]?.method ?? "GET").toUpperCase() === "POST"
      );
      expect(chargeCalls).toHaveLength(0);
    });
  });

  // ── Scenario B: reservation itself fails ────────────────────────────────────

  describe("when /api/reservations itself returns 500", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", buildFetchMock_reservationFail());
    });

    it("shows an error toast — not a success toast", async () => {
      const { user } = await renderAndFill(true);

      await user.click(screen.getByTestId("button-create-quick"));

      await waitFor(
        () =>
          expect(toastSpy).toHaveBeenCalledWith(
            expect.objectContaining({ variant: "destructive" })
          ),
        { timeout: 5000 }
      );

      // Must NOT show the success toast
      const allToastTitles = toastSpy.mock.calls.map((call: any[]) => call[0]?.title);
      expect(allToastTitles).not.toContain("Reserva creada");
    });

    it("shows the real server validation message without the navigation fallback", async () => {
      const { user } = await renderAndFill(true);

      await user.click(screen.getByTestId("button-create-quick"));

      await waitFor(() => {
        const errorToast = toastSpy.mock.calls.find((call: any[]) => call[0]?.variant === "destructive");
        expect(errorToast?.[0]).toEqual(expect.objectContaining({
          description: "Ingresá el motivo de la tarifa $0 para guardar la reserva.",
        }));
        expect(errorToast?.[0]?.action).toBeUndefined();
      });
    });

    it("does NOT close the dialog when the reservation POST fails", async () => {
      const { user, onOpenChange } = await renderAndFill(true);

      await user.click(screen.getByTestId("button-create-quick"));

      await waitFor(
        () =>
          expect(toastSpy).toHaveBeenCalledWith(
            expect.objectContaining({ variant: "destructive" })
          ),
        { timeout: 5000 }
      );

      // onOpenChange(false) must NOT have been called
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it("does NOT call the charges endpoint when the reservation itself fails", async () => {
      const fetchMock = buildFetchMock_reservationFail();
      vi.stubGlobal("fetch", fetchMock);

      const { user } = await renderAndFill(true);

      await user.click(screen.getByTestId("button-create-quick"));

      await waitFor(
        () =>
          expect(toastSpy).toHaveBeenCalledWith(
            expect.objectContaining({ variant: "destructive" })
          ),
        { timeout: 5000 }
      );

      const chargeCalls = fetchMock.mock.calls.filter((args: any[]) =>
        args[0]?.toString().includes("/api/charges") &&
        (args[1]?.method ?? "GET").toUpperCase() === "POST"
      );
      expect(chargeCalls).toHaveLength(0);
    });
  });
});

describe("QuickReservationDialog — effective zero-rate reason", () => {
  it("requires and trims a reason for a normal plan whose rate is zero", () => {
    const state = getQuickReservationRateState({
      manualRate: "",
      packageRate: "",
      planRate: "0",
      ratePlanId: "plan-zero",
      specialRateReason: "  cortesía  ",
    });
    expect(state.effectiveRate).toBe("0.00");
    expect(state.requiresRateReason).toBe(true);
    expect(state.payloadReason).toBe("cortesía");
  });

  it("requires a reason for a zero package", () => {
    const state = getQuickReservationRateState({
      manualRate: "",
      packageRate: "0.00",
      planRate: "1200",
      ratePlanId: "",
      specialRateReason: " paquete promocional ",
    });
    expect(state.requiresRateReason).toBe(true);
    expect(state.payloadReason).toBe("paquete promocional");
  });

  it("keeps manual special rates nonnegative and requires a reason even when positive", () => {
    const state = getQuickReservationRateState({
      manualRate: "1500",
      ratePlanId: "__special__",
    });
    expect(state.manualSpecialRateValid).toBe(true);
    expect(state.requiresRateReason).toBe(true);
    expect(state.payloadReason).toBe("");
  });

  it("uses the generic fallback and navigation action for opaque errors", () => {
    expect(getQuickReservationErrorToast(new Error("Error inesperado"))).toEqual({
      description: "No se pudo crear la reserva. Intente nuevamente.",
      showNavigateAction: true,
    });
    expect(getQuickReservationErrorToast(new Error('500: {"error":"Internal Server Error"}'))).toEqual({
      description: "No se pudo crear la reserva. Intente nuevamente.",
      showNavigateAction: true,
    });
  });
});
