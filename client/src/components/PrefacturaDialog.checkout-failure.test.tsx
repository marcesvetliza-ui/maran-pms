/**
 * Tests for PrefacturaDialog — checkout-failure mid-flow path
 *
 * Covers the split-failure path added by Task 84:
 *   payment + invoice succeed but POST /api/reservations/:id/check-out returns 500.
 *
 * Verifies:
 *  1. The dialog still reaches step 3 (does NOT stay blocked on step 2)
 *  2. The amber "Cobro e factura registrados — check-out pendiente" banner is visible
 *  3. The amber explanatory paragraph (El cobro y el comprobante ya fueron registrados) is visible
 *  4. The green "Check-out completado" banner is NOT shown
 *  5. onCheckoutComplete is NOT called (checkout did not succeed)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// ── Module mocks (must precede the lazy import) ───────────────────────────────

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

vi.mock("@/lib/queryClient", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/queryClient")>();
  return {
    ...mod,
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
  };
});

// Lazy-import after mocks are registered
const { PrefacturaDialog } = await import("./PrefacturaDialog");

// ── Constants ─────────────────────────────────────────────────────────────────

const RESERVATION_ID = "res-co-test-1";

/**
 * A folio with zero balance and zero roomTotal so that:
 *  - No payment row is required (balance = 0 bypasses the amount guard)
 *  - No invoice items are built (roomTotal = 0 + no charges)
 *    → the invoice POST is skipped entirely
 *  - The checkout POST is still attempted (mode=checkout + doCheckout=true)
 *
 * This isolates the test to the checkout-failure path without needing to stub
 * the payment or invoice endpoints.
 */
const FAKE_FOLIO = {
  reservationCode: "R-001",
  guestName: "Test Guest",
  roomNumber: "101",
  checkInDate: "2026-07-28",
  checkOutDate: "2026-08-02",
  nights: 5,
  roomRate: "0.00",
  roomTotal: 0,
  charges: [],
  totalCharges: 0,
  payments: [],
  totalPayments: 0,
  grandTotal: 0,
  balance: 0,
};

// ── Fetch mock ────────────────────────────────────────────────────────────────

/**
 * Builds a fetch mock that:
 *  - Returns FAKE_FOLIO for GET …/folio
 *  - Returns 500 for POST …/check-out  (the failure under test)
 *  - Returns empty arrays for all other requests
 */
function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    // Folio data (GET, also re-fetched after submit)
    if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/folio`)) {
      return new Response(JSON.stringify(FAKE_FOLIO), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Checkout — returns 500 to trigger the amber-warning path
    if (
      strUrl.includes(`/api/reservations/${RESERVATION_ID}/check-out`) &&
      method === "POST"
    ) {
      return new Response(JSON.stringify({ error: "Checkout failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Default: empty list for pos-configs, companies, agencies, invoices, etc.
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof PrefacturaDialog>> = {}
) {
  const onClose = vi.fn();
  const onCheckoutComplete = vi.fn();
  render(
    <Wrapper>
      <PrefacturaDialog
        open={true}
        onClose={onClose}
        reservationId={RESERVATION_ID}
        mode="checkout"
        onCheckoutComplete={onCheckoutComplete}
        {...overrides}
      />
    </Wrapper>
  );
  return { onClose, onCheckoutComplete };
}

/**
 * Advances the dialog from step 1 → step 2 → submit, then waits for step 3
 * to appear (either the amber warning or the green success banner).
 *
 * Uses a generous timeout because the folio query must resolve before the
 * "Siguiente" button is enabled.
 */
async function advanceAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  // Wait for the "Siguiente — Cobro" button to become enabled (folio loaded)
  const siguienteBtn = await screen.findByRole("button", {
    name: /siguiente.*cobro/i,
  });
  await user.click(siguienteBtn);

  // Now on step 2 — click the primary submit button
  const submitBtn = await screen.findByTestId("button-registrar-emitir");
  await user.click(submitBtn);

  // Wait for step 3 to appear (success or failure banner in the result card)
  await waitFor(
    () =>
      expect(
        screen.queryByText(/check-out completado|check-out pendiente/i)
      ).toBeInTheDocument(),
    { timeout: 8000 }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PrefacturaDialog — checkout-failure mid-flow", () => {
  let fetchMock: ReturnType<typeof buildFetchMock>;

  beforeEach(() => {
    fetchMock = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    // Suppress PDF popup that fires after invoice emission
    vi.stubGlobal("open", vi.fn());
  });

  it("reaches step 3 even when the checkout API returns 500", async () => {
    const user = userEvent.setup();
    renderDialog();

    await advanceAndSubmit(user);

    // Step 3 must be active — the result heading uses CircleCheck icon + "Resultado"
    expect(screen.getByText(/resultado/i)).toBeInTheDocument();
  });

  it("shows the amber 'check-out pendiente' banner (not the green success banner)", async () => {
    const user = userEvent.setup();
    renderDialog();

    await advanceAndSubmit(user);

    // Amber heading in the result card
    expect(
      screen.getByText(/cobro e factura registrados.*check-out pendiente/i)
    ).toBeInTheDocument();
  });

  it("shows the explanatory amber paragraph about manual checkout", async () => {
    const user = userEvent.setup();
    renderDialog();

    await advanceAndSubmit(user);

    // Detailed explanation paragraph inside the amber warning box
    expect(
      screen.getByText(/el cobro y el comprobante ya fueron registrados correctamente/i)
    ).toBeInTheDocument();
  });

  it("does NOT show the green 'Check-out completado' banner", async () => {
    const user = userEvent.setup();
    renderDialog();

    await advanceAndSubmit(user);

    // Green success text must be absent
    expect(screen.queryByText(/check-out completado/i)).not.toBeInTheDocument();
  });

  it("does NOT call onCheckoutComplete when checkout fails", async () => {
    const user = userEvent.setup();
    const { onCheckoutComplete } = renderDialog();

    await advanceAndSubmit(user);

    expect(onCheckoutComplete).not.toHaveBeenCalled();
  });
});
