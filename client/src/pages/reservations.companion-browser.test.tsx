/**
 * Browser-level component test for ReservationFormDialog — companion POST failure path
 *
 * Task #119: Confirm the companion warning toast appears in a real browser flow
 * when a companion POST fails during reservation creation.
 *
 * Unlike the companion-failure.test.tsx unit tests (which extract the loop logic
 * in isolation), this test renders the full ReservationFormDialog component with
 * React Testing Library, drives real UI interactions (add companion via form,
 * submit), and asserts that the Toaster actually renders the warning toast that
 * staff would see.
 *
 * Scenarios covered:
 *
 * A) Happy path guard — no warning toast when companion POST succeeds
 * B) Warning toast appears when companion POST returns 500
 *    - Toast title: "Reserva creada — acompañantes pendientes"
 *    - Toast description mentions the companion's name
 *    - Dialog closes (onOpenChange called with false)
 *    - onSuccess is still called (reservation is not lost)
 * C) Multiple companions — both are attempted; only failed names appear in toast
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

/**
 * Mock apiRequest so we don't need a real server.
 * The real queryClient singleton is preserved so invalidateQueries() doesn't
 * throw inside onSuccess.
 */
vi.mock("@/lib/queryClient", async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return { ...orig, apiRequest: vi.fn() };
});

/**
 * Replace GuestSelector with a minimal stub that immediately reports a
 * pre-selected guest via onSelect (bypassing the 300 ms search debounce
 * and jsdom Radix combobox flow) while still exercising the real
 * formData.guestId wiring inside ReservationFormDialog.
 */
vi.mock("@/components/entity-selector", async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    GuestSelector: ({ onSelect }: { onSelect: (g: any) => void; [k: string]: any }) => {
      React.useEffect(() => {
        onSelect({ id: "guest-119", firstName: "Ana", lastName: "García" });
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return <div data-testid="mock-guest-selector">Ana García (mocked)</div>;
    },
    CompanySelector: ({ cardClassName: _c, ...rest }: any) => (
      <div data-testid="mock-company-selector" {...rest} />
    ),
    AgencySelector: ({ cardClassName: _c, ...rest }: any) => (
      <div data-testid="mock-agency-selector" {...rest} />
    ),
    NationalityCombobox: ({ onChange }: { onChange: (v: string) => void }) => (
      <input
        data-testid="mock-nationality-input"
        placeholder="Nacionalidad"
        onChange={(e) => onChange(e.target.value)}
      />
    ),
  };
});

// ── Import after mocks ────────────────────────────────────────────────────────

import { ReservationFormDialog } from "./reservations";
import { Toaster } from "@/components/ui/toaster";
import { apiRequest } from "@/lib/queryClient";

const mockedApiRequest = vi.mocked(apiRequest);

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TEST_RESERVATION = {
  id: "res-119",
  guestId: "guest-119",
  roomId: "room-1",
  checkInDate: "2026-09-01",
  checkOutDate: "2026-09-02",
  status: "confirmed",
  reservationCode: "RES-119",
};

const TEST_ROOMS = [
  {
    id: "room-1",
    number: "101",
    roomTypeId: "type-1",
    roomType: { id: "type-1", name: "Estándar", baseRate: "5000" },
  },
] as any[];

const TEST_ROOM_TYPES = [
  { id: "type-1", name: "Estándar", baseRate: "5000" },
] as any[];

const TEST_GUESTS = [
  { id: "guest-119", firstName: "Ana", lastName: "García", documentNumber: "30111222" },
] as any[];

/** A Response whose .json() returns the given data. */
function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Build a QueryClient suitable for tests: no retries, infinite staleTime,
 * and a default queryFn that returns [] so the component's internal queries
 * don't cause network errors in jsdom.
 */
function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: async () => [] as unknown[],
        retry: false,
        staleTime: Infinity,
        gcTime: 0,
      },
      mutations: { retry: false },
    },
  });
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(makeTestQueryClient);
  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}

// ── Render helper ─────────────────────────────────────────────────────────────

/**
 * Render a fresh ReservationFormDialog (create-mode) with minimal props.
 * Returns the spied callbacks.
 */
function renderDialog() {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  render(
    <Wrapper>
      <ReservationFormDialog
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
        guests={TEST_GUESTS}
        rooms={TEST_ROOMS}
        roomTypes={TEST_ROOM_TYPES}
        defaultValues={{
          roomId: "room-1",
          roomTypeId: "type-1",
          checkInDate: "2026-09-01",
        }}
      />
    </Wrapper>,
  );

  return { onOpenChange, onSuccess };
}

// ── UI helpers ────────────────────────────────────────────────────────────────

/**
 * Wait for the GuestSelector mock's useEffect to have fired and wired
 * formData.guestId inside the component.  The mock renders immediately but
 * the onSelect callback runs in an effect (async in React 18).
 */
async function waitForGuestSelected() {
  await waitFor(() => expect(screen.getByTestId("mock-guest-selector")).toBeTruthy());
  // Let React flush the useEffect that calls onSelect → setFormData
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/**
 * Open the companion form, switch to "Nuevo", fill the required fields,
 * and confirm — adding one pending companion to the list.
 */
async function addCompanionViaUI(firstName: string, lastName: string) {
  // Open the companion add panel
  fireEvent.click(screen.getByTestId("button-add-companion-form"));

  // Switch to "Nuevo" mode (the second tab button)
  const nuevoBtn = await waitFor(() =>
    screen.getByText("Nuevo"),
  );
  fireEvent.click(nuevoBtn);

  // Fill in the required name fields
  const firstNameInput = await waitFor(() =>
    screen.getByTestId("input-new-comp-firstname"),
  );
  fireEvent.change(firstNameInput, { target: { value: firstName } });

  const lastNameInput = screen.getByTestId("input-new-comp-lastname");
  fireEvent.change(lastNameInput, { target: { value: lastName } });

  // Confirm the addition
  const saveBtn = screen.getByTestId("button-save-new-comp");
  fireEvent.click(saveBtn);

  // Wait until the row appears in the pending-companions list
  await waitFor(() => screen.getByTestId("pending-companion-row-0"));
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  mockedApiRequest.mockReset();

  // jsdom doesn't implement matchMedia — shim it so Radix doesn't crash
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ReservationFormDialog — companion failure in full component render", () => {
  // ── Scenario A: no warning toast when companions succeed ──────────────────

  describe("Scenario A: companion POST succeeds — no warning toast", () => {
    it("calls onSuccess and closes the dialog when all companion POSTs succeed", async () => {
      mockedApiRequest
        // POST /api/reservations → 201
        .mockResolvedValueOnce(makeJsonResponse(TEST_RESERVATION, 201))
        // POST .../companions → 201
        .mockResolvedValueOnce(makeJsonResponse({ id: "comp-ok" }, 201));

      const { onOpenChange, onSuccess } = renderDialog();

      await waitForGuestSelected();
      await addCompanionViaUI("Carlos", "Lopez");

      fireEvent.click(screen.getByTestId("button-submit-reservation"));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });

      // The warning toast must NOT be visible
      expect(
        screen.queryByText("Reserva creada — acompañantes pendientes"),
      ).toBeNull();
    });
  });

  // ── Scenario B: warning toast when companion POST returns 500 ─────────────

  describe("Scenario B: companion POST returns 500 — warning toast is visible", () => {
    /**
     * Set up apiRequest: reservation succeeds, companion call throws (mirroring
     * what throwIfResNotOk does when the server returns 500).
     */
    function setupCompanionFail() {
      mockedApiRequest
        .mockResolvedValueOnce(makeJsonResponse(TEST_RESERVATION, 201))
        .mockRejectedValueOnce(new Error("500: Internal Server Error"));
    }

    it("renders the 'Reserva creada — acompañantes pendientes' toast title", async () => {
      setupCompanionFail();
      renderDialog();

      await waitForGuestSelected();
      await addCompanionViaUI("Carlos", "Lopez");

      fireEvent.click(screen.getByTestId("button-submit-reservation"));

      await waitFor(() => {
        expect(
          screen.getByText("Reserva creada — acompañantes pendientes"),
        ).toBeTruthy();
      });
    });

    it("toast description includes the failed companion's full name", async () => {
      setupCompanionFail();
      renderDialog();

      await waitForGuestSelected();
      await addCompanionViaUI("Carlos", "Lopez");

      fireEvent.click(screen.getByTestId("button-submit-reservation"));

      await waitFor(() => {
        expect(screen.getByText(/Carlos Lopez/)).toBeTruthy();
      });
    });

    it("toast description directs staff to add companions from the reservation", async () => {
      setupCompanionFail();
      renderDialog();

      await waitForGuestSelected();
      await addCompanionViaUI("Carlos", "Lopez");

      fireEvent.click(screen.getByTestId("button-submit-reservation"));

      await waitFor(() => {
        expect(
          screen.getByText(/Podés agregarlos desde la reserva/),
        ).toBeTruthy();
      });
    });

    it("dialog closes and onSuccess fires even when a companion POST fails", async () => {
      setupCompanionFail();
      const { onOpenChange, onSuccess } = renderDialog();

      await waitForGuestSelected();
      await addCompanionViaUI("Carlos", "Lopez");

      fireEvent.click(screen.getByTestId("button-submit-reservation"));

      await waitFor(() => {
        // Toast is visible
        expect(
          screen.getByText("Reserva creada — acompañantes pendientes"),
        ).toBeTruthy();
        // Dialog still closes — reservation is not lost
        expect(onOpenChange).toHaveBeenCalledWith(false);
        // onSuccess called — reservation was saved
        expect(onSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it("companion POST is called with the correct reservationId", async () => {
      setupCompanionFail();
      renderDialog();

      await waitForGuestSelected();
      await addCompanionViaUI("Carlos", "Lopez");

      fireEvent.click(screen.getByTestId("button-submit-reservation"));

      await waitFor(() =>
        screen.getByText("Reserva creada — acompañantes pendientes"),
      );

      // Second call is the companions endpoint
      const companionCall = mockedApiRequest.mock.calls[1];
      expect(companionCall[0]).toBe("POST");
      expect(companionCall[1]).toContain(`/reservations/${TEST_RESERVATION.id}/companions`);
      expect((companionCall[2] as any).reservationId).toBe(TEST_RESERVATION.id);
    });
  });

  // ── Scenario C: multiple companions ───────────────────────────────────────

  describe("Scenario C: multiple companions — loop does not abort, only failures listed", () => {
    it("attempts both companion POSTs even when the first one fails", async () => {
      mockedApiRequest
        .mockResolvedValueOnce(makeJsonResponse(TEST_RESERVATION, 201))
        .mockRejectedValueOnce(new Error("500: Server Error"))  // companion 1 fails
        .mockRejectedValueOnce(new Error("500: Server Error")); // companion 2 fails

      renderDialog();
      await waitForGuestSelected();

      await addCompanionViaUI("Carlos", "Lopez");

      // Add second companion: the panel closes after first save, reopen it
      fireEvent.click(screen.getByTestId("button-add-companion-form"));
      fireEvent.click(screen.getByText("Nuevo"));
      fireEvent.change(screen.getByTestId("input-new-comp-firstname"), {
        target: { value: "Maria" },
      });
      fireEvent.change(screen.getByTestId("input-new-comp-lastname"), {
        target: { value: "Gomez" },
      });
      fireEvent.click(screen.getByTestId("button-save-new-comp"));
      await waitFor(() => screen.getByTestId("pending-companion-row-1"));

      fireEvent.click(screen.getByTestId("button-submit-reservation"));

      await waitFor(() =>
        screen.getByText("Reserva creada — acompañantes pendientes"),
      );

      // Both companion POSTs were attempted (calls 1 and 2 after the reservation)
      const companionCalls = mockedApiRequest.mock.calls.filter(
        ([, url]) => typeof url === "string" && url.includes("/companions"),
      );
      expect(companionCalls).toHaveLength(2);
    });

    it("toast lists both failed companion names", async () => {
      mockedApiRequest
        .mockResolvedValueOnce(makeJsonResponse(TEST_RESERVATION, 201))
        .mockRejectedValueOnce(new Error("500: Server Error"))
        .mockRejectedValueOnce(new Error("500: Server Error"));

      renderDialog();
      await waitForGuestSelected();

      await addCompanionViaUI("Carlos", "Lopez");

      fireEvent.click(screen.getByTestId("button-add-companion-form"));
      fireEvent.click(screen.getByText("Nuevo"));
      fireEvent.change(screen.getByTestId("input-new-comp-firstname"), {
        target: { value: "Maria" },
      });
      fireEvent.change(screen.getByTestId("input-new-comp-lastname"), {
        target: { value: "Gomez" },
      });
      fireEvent.click(screen.getByTestId("button-save-new-comp"));
      await waitFor(() => screen.getByTestId("pending-companion-row-1"));

      fireEvent.click(screen.getByTestId("button-submit-reservation"));

      await waitFor(() => {
        expect(screen.getByText(/Carlos Lopez/)).toBeTruthy();
        expect(screen.getByText(/Maria Gomez/)).toBeTruthy();
      });
    });

    it("only the failed companion name appears when the second POST succeeds", async () => {
      mockedApiRequest
        .mockResolvedValueOnce(makeJsonResponse(TEST_RESERVATION, 201))
        .mockRejectedValueOnce(new Error("500: Server Error"))        // Carlos fails
        .mockResolvedValueOnce(makeJsonResponse({ id: "comp-2" }, 201)); // Maria succeeds

      renderDialog();
      await waitForGuestSelected();

      await addCompanionViaUI("Carlos", "Lopez");

      fireEvent.click(screen.getByTestId("button-add-companion-form"));
      fireEvent.click(screen.getByText("Nuevo"));
      fireEvent.change(screen.getByTestId("input-new-comp-firstname"), {
        target: { value: "Maria" },
      });
      fireEvent.change(screen.getByTestId("input-new-comp-lastname"), {
        target: { value: "Gomez" },
      });
      fireEvent.click(screen.getByTestId("button-save-new-comp"));
      await waitFor(() => screen.getByTestId("pending-companion-row-1"));

      fireEvent.click(screen.getByTestId("button-submit-reservation"));

      await waitFor(() => {
        // Carlos failed → in the toast
        expect(screen.getByText(/Carlos Lopez/)).toBeTruthy();
      });

      // Maria succeeded → must NOT appear in the failure description
      const toastDesc = screen.queryByText(/Maria Gomez/);
      expect(toastDesc).toBeNull();
    });
  });
});
