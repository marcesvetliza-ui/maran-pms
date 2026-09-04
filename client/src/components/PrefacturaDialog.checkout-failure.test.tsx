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
 * A folio with one outstanding charge. The test must persist an actual invoice
 * and linked payment before the checkout request fails.
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
  charges: [{
    id: "charge-checkout",
    description: "Cargo para check-out",
    amount: "100.00",
    category: "otros",
    date: "2026-08-01",
  }],
  totalCharges: 100,
  payments: [],
  totalPayments: 0,
  grandTotal: 100,
  balance: 100,
};

const CONFLICT_FOLIO = {
  ...FAKE_FOLIO,
  roomTotal: 0,
  charges: [{
    id: "charge-concurrent",
    description: "Cargo concurrente",
    amount: "100.00",
    category: "otros",
    date: "2026-08-01",
  }],
  totalCharges: 100,
  grandTotal: 100,
  balance: 100,
};

const CONFLICT_RESERVATION = {
  id: RESERVATION_ID,
  status: "checked_in",
  checkOutDate: "2026-08-02",
  guest: {
    firstName: "Test",
    lastName: "Guest",
    vatCondition: "consumidor_final",
    documentNumber: "12345678",
  },
  room: { roomNumber: "101" },
} as any;

// ── Fetch mock ────────────────────────────────────────────────────────────────

/**
 * Builds a fetch mock that emits a successful invoice and payment, then returns
 * 500 for checkout. This exercises the real recovery state rather than the
 * zero-movement shortcut.
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

    if (strUrl.includes("/api/billing/config")) {
      return new Response(JSON.stringify({ puntoVenta: 1, arcaAmbiente: "ficticio" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (strUrl.includes("/api/billing/invoices") && method === "POST") {
      return new Response(JSON.stringify({
        id: 800,
        tipoComprobante: "FB",
        puntoVenta: 1,
        numero: 800,
        cae: "CAE-TEST-800",
        montoTotal: "100.00",
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (strUrl.includes("/api/payments") && method === "POST") {
      return new Response(JSON.stringify({ id: "payment-checkout-1" }), {
        status: 201,
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

/**
 * Simulates another browser tab winning the reservation-scoped invoice lock.
 * The test asserts that a 409 from billing happens before any payment POST.
 */
function buildInvoiceConflictFetchMock() {
  const mock = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/folio`)) {
      return new Response(JSON.stringify(CONFLICT_FOLIO), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes("/api/billing/config")) {
      return new Response(JSON.stringify({ puntoVenta: 1, arcaAmbiente: "ficticio" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes("/api/billing/invoices") && method === "POST") {
      return new Response(JSON.stringify({
        error: "El cargo seleccionado ya no tiene saldo suficiente para facturar ($0.00 disponible)",
      }), {
        status: 409, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes("/api/payments") && method === "POST") {
      return new Response(JSON.stringify({ id: "should-not-exist" }), {
        status: 201, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify([]), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  });
  return mock;
}

function buildPartiallyCreditedAdvanceFetchMock() {
  let reissued = false;
  const originalInvoice = {
    id: 700,
    tipo_comprobante: "FB",
    punto_venta: 1,
    numero: 86,
    monto_total: "100.00",
    monto_acreditado: "40.00",
    estado: "parcial",
    source_charge_amounts: { "charge-partial": 100 },
    credit_source_charge_amounts: [{ "charge-partial": 40 }],
  };
  const mock = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/folio`)) {
      return new Response(JSON.stringify({
        ...FAKE_FOLIO,
        charges: [
          { id: "charge-partial", description: "Cargo parcial", amount: "100.00", category: "otros", date: "2026-08-31" },
          { id: "nc-adjustment", description: "Ajuste por NC [nc:701:charge-partial]", amount: "-40.00", category: "adjustment", date: "2026-08-31" },
        ],
        payments: [{
          id: "payment-original",
          amount: "100.00",
          method: "transferencia",
          status: "active",
          invoiceRef: JSON.stringify({ id: 700, tipoComprobante: "FB", puntoVenta: 1, numero: 86 }),
        }],
        totalPayments: 100,
        balance: 0,
      }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes(`/api/reservations/${RESERVATION_ID}/invoices`)) {
      return new Response(JSON.stringify(reissued
        ? [originalInvoice, {
          id: 800,
          tipo_comprobante: "FB",
          punto_venta: 1,
          numero: 87,
          monto_total: "40.00",
          monto_acreditado: "0.00",
          estado: "emitida",
          source_charge_amounts: { "charge-partial": 40 },
          credit_source_charge_amounts: [],
        }]
        : [originalInvoice]), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes("/api/billing/config")) {
      return new Response(JSON.stringify({ puntoVenta: 1, arcaAmbiente: "ficticio" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (strUrl.includes("/api/billing/invoices") && method === "POST") {
      reissued = true;
      return new Response(JSON.stringify({
        id: 800,
        tipoComprobante: "FB",
        puntoVenta: 1,
        numero: 87,
        cae: "CAE-TEST-800",
        montoTotal: "40.00",
      }), {
        status: 201, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify([]), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  });
  return mock;
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
        reservation={CONFLICT_RESERVATION}
        mode="checkout"
        onCheckoutComplete={onCheckoutComplete}
        {...overrides}
      />
    </Wrapper>
  );
  return { onClose, onCheckoutComplete };
}

/**
 * Emits and pays the outstanding charge, then waits for the recovery state
 * shown when checkout itself fails.
 */
async function advanceAndSubmit(user: ReturnType<typeof userEvent.setup>) {
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

  it("resets the checkout option when the dialog is closed and reopened", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const props = {
      onClose,
      reservationId: RESERVATION_ID,
      reservation: CONFLICT_RESERVATION,
      mode: "checkout" as const,
      onCheckoutComplete: vi.fn(),
    };
    const view = render(
      <Wrapper>
        <PrefacturaDialog open {...props} />
      </Wrapper>,
    );

    const checkoutCheckbox = await screen.findByRole("checkbox", {
      name: /hacer check-out al confirmar/i,
    });
    expect(checkoutCheckbox).toBeChecked();
    await user.click(checkoutCheckbox);
    expect(checkoutCheckbox).not.toBeChecked();

    view.rerender(
      <Wrapper>
        <PrefacturaDialog open={false} {...props} />
      </Wrapper>,
    );
    view.rerender(
      <Wrapper>
        <PrefacturaDialog open {...props} />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByRole("checkbox", {
      name: /hacer check-out al confirmar/i,
    })).toBeChecked());
  });

  it("does NOT call onCheckoutComplete when checkout fails", async () => {
    const user = userEvent.setup();
    const { onCheckoutComplete } = renderDialog();

    await advanceAndSubmit(user);

    expect(onCheckoutComplete).not.toHaveBeenCalled();
  });

  it("creates the payment with the emitted invoice reference before checkout fails", async () => {
    const user = userEvent.setup();
    renderDialog();

    await advanceAndSubmit(user);

    const paymentCall = fetchMock.mock.calls.find(([url, options]) =>
      String(url).includes("/api/payments") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "POST"
    );
    expect(paymentCall).toBeDefined();
    const paymentBody = JSON.parse(String((paymentCall?.[1] as RequestInit).body));
    expect(paymentBody.invoiceData).toMatchObject({
      id: 800,
      tipoComprobante: "FB",
      puntoVenta: 1,
      numero: 800,
      total: "100.00",
    });
  });

  it("does not create a payment when invoice emission is rejected with 409", async () => {
    const conflictFetchMock = buildInvoiceConflictFetchMock();
    vi.stubGlobal("fetch", conflictFetchMock);
    const user = userEvent.setup();
    renderDialog({
      mode: "billing",
      reservation: CONFLICT_RESERVATION,
    });

    const submitButton = await screen.findByTestId("button-registrar-emitir");
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    await screen.findByText(/ya no tiene saldo suficiente para facturar/i);

    const calledPaymentPost = conflictFetchMock.mock.calls.some(([url, options]) =>
      String(url).includes("/api/payments") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "POST"
    );
    expect(calledPaymentPost).toBe(false);
  });

  it("reuses a partially released advance without overwriting its original invoice reference", async () => {
    const partialFetchMock = buildPartiallyCreditedAdvanceFetchMock();
    vi.stubGlobal("fetch", partialFetchMock);
    const user = userEvent.setup();
    renderDialog({
      mode: "billing",
      reservation: CONFLICT_RESERVATION,
    });

    const submitButton = await screen.findByTestId("button-registrar-emitir");
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);
    await waitFor(() => {
      expect(partialFetchMock.mock.calls.some(([url, options]) =>
        String(url).includes("/api/billing/invoices") &&
        String((options as RequestInit | undefined)?.method).toUpperCase() === "POST"
      )).toBe(true);
    });

    const invoicePost = partialFetchMock.mock.calls.find(([url, options]) =>
      String(url).includes("/api/billing/invoices") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "POST"
    );
    const invoiceBody = JSON.parse(String((invoicePost?.[1] as RequestInit).body));
    expect(invoiceBody.sourceChargeAmounts).toEqual({ "charge-partial": 40 });
    expect(partialFetchMock.mock.calls.some(([url, options]) =>
      String(url).includes("/api/payments/payment-original/invoice") &&
      !String(url).includes("/invoice-reapplication") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "PATCH"
    )).toBe(false);
    const reapplicationCall = partialFetchMock.mock.calls.find(([url, options]) =>
      String(url).includes("/api/payments/payment-original/invoice-reapplication") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "PATCH"
    );
    expect(reapplicationCall).toBeDefined();
    expect(JSON.parse(String((reapplicationCall?.[1] as RequestInit).body))).toMatchObject({
      amount: 40,
      invoiceData: { id: 800, tipoComprobante: "FB", numero: 87 },
    });
    expect(partialFetchMock.mock.calls.some(([url, options]) =>
      String(url).includes("/api/payments") &&
      String((options as RequestInit | undefined)?.method).toUpperCase() === "POST"
    )).toBe(false);
  });
});
