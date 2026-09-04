/**
 * Tests for EmitirFacturaDialog — link-failure error banner
 *
 * Verifies that when PATCH /api/payments/:id/invoice returns a 500:
 *  1. The dialog stays open (does NOT close automatically)
 *  2. The error banner is visible with "Reintentar vínculo" and "Cerrar sin vincular" buttons
 *  3. Clicking the Radix close button (X) does NOT close the dialog
 *  4. Pressing Escape does NOT close the dialog
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { Toaster } from "@/components/ui/toaster";

// ── Module mocks must be declared before the dynamic import ──────────────────

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

// We import the real queryClient module but replace apiRequest per-test via
// vi.spyOn so that useQuery's default queryFn can still call it for GET
// requests while we control POST/PATCH outcomes.
vi.mock("@/lib/queryClient", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/queryClient")>();
  return {
    ...mod,
    // Provide a fresh QueryClient so test isolation is guaranteed
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
  };
});

// Lazy-import so mocks are registered first
const { EmitirFacturaDialog } = await import("./billing");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal billing config returned by GET /api/billing/config */
const FAKE_CONFIG = { arcaAmbiente: "ficticio" };

/** Fake invoice returned by POST /api/billing/invoices */
const FAKE_INVOICE = {
  id: 99,
  tipo_comprobante: "FB",
  punto_venta: 1,
  numero: 1,
  cae: "12345678901234",
  cae_fecha_vto: "2026-08-01",
  estado: "emitida",
  monto_total: "1000.00",
};

const PAYMENT_ID = "pay-test-42";

/**
 * Builds a mock fetch that returns success for the invoice POST and 500 for
 * the payment-link PATCH, while serving empty arrays for all other GETs.
 */
function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    // Invoice emission — must succeed so onSuccess runs and triggers the link
    if (strUrl.includes("/api/billing/invoices") && method === "POST") {
      return new Response(JSON.stringify(FAKE_INVOICE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Payment link — returns 500 to simulate the failure under test
    if (strUrl.includes(`/api/payments/${PAYMENT_ID}/invoice`) && method === "PATCH") {
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Flag-persistence call after link failure (fire-and-forget, result ignored)
    if (strUrl.includes("/invoice-link-failed")) {
      return new Response(JSON.stringify({}), { status: 200 });
    }

    // Default: empty array for list queries (pos-configs, companies, agencies …)
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
  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}

/** Renders the dialog open with a paymentId so the link flow is active. */
function renderDialog(overrides: Partial<React.ComponentProps<typeof EmitirFacturaDialog>> = {}) {
  const onClose = vi.fn();
  render(
    <Wrapper>
      <EmitirFacturaDialog
        open={true}
        onClose={onClose}
        config={FAKE_CONFIG}
        paymentId={PAYMENT_ID}
        {...overrides}
      />
    </Wrapper>
  );
  return { onClose };
}

/**
 * Fills the minimum required fields (Razón Social + item price) and advances
 * through the confirmation step to actually emit the invoice.
 */
async function fillAndSubmitForm(user: ReturnType<typeof userEvent.setup>) {
  // Fill Razón Social
  const razonInput = screen.getByTestId("input-razon-social");
  await user.clear(razonInput);
  await user.type(razonInput, "Cliente de Prueba");

  // Fill item description
  const descInput = screen.getAllByPlaceholderText(/Hospedaje habitación/i)[0];
  await user.clear(descInput);
  await user.type(descInput, "Servicio de prueba");

  // Fill item unit price
  const precioInput = screen.getAllByPlaceholderText("0.00")[0];
  await user.clear(precioInput);
  await user.type(precioInput, "1000");

  // Click "Revisar →" to open the confirmation panel
  await user.click(screen.getByTestId("btn-emitir-confirmar"));

  // Click "Confirmar y emitir PDF"
  await user.click(screen.getByTestId("btn-confirmar-emitir"));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("EmitirFacturaDialog — link-failure error banner", () => {
  let fetchMock: ReturnType<typeof buildFetchMock>;

  beforeEach(() => {
    fetchMock = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    // Suppress the automatic PDF popup triggered after invoice emission
    vi.stubGlobal("open", vi.fn());
  });

  it("keeps the dialog open after a 500 from the payment-link endpoint", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await fillAndSubmitForm(user);

    // Wait for the link attempt to complete and the error state to be set
    await waitFor(
      () => expect(screen.queryByText("Vínculo operativo pendiente")).toBeInTheDocument(),
      { timeout: 5000 }
    );

    // The dialog must still be in the DOM (open)
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // onClose callback must NOT have been called automatically
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps non-group link errors retry-only", async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillAndSubmitForm(user);

    await waitFor(
      () => expect(screen.queryByText("Vínculo operativo pendiente")).toBeInTheDocument(),
      { timeout: 5000 }
    );

    // Error banner text is visible
    expect(
      screen.getByText(/La factura ya fue emitida.*No emitas otra factura/i)
    ).toBeInTheDocument();

    // Only retry is offered without durable group draft recovery.
    expect(screen.getByTestId("btn-reintentar-vinculo")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-cerrar-sin-vincular")).not.toBeInTheDocument();
  });

  it("does not close non-group link errors via the Radix close button (X)", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await fillAndSubmitForm(user);

    await waitFor(
      () => expect(screen.queryByText("Vínculo operativo pendiente")).toBeInTheDocument(),
      { timeout: 5000 }
    );

    // Radix renders a visually-hidden close button with aria-label="Close"
    const closeBtn = screen.queryByRole("button", { name: /close/i });
    if (closeBtn) {
      await user.click(closeBtn);
    }

    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close non-group link errors with Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await fillAndSubmitForm(user);

    await waitFor(
      () => expect(screen.queryByText("Vínculo operativo pendiente")).toBeInTheDocument(),
      { timeout: 5000 }
    );

    // Press Escape
    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not expose a close action without durable group recovery", async () => {
    const { onClose } = renderDialog();

    await fillAndSubmitForm(userEvent.setup());

    await waitFor(
      () => expect(screen.queryByText("Vínculo operativo pendiente")).toBeInTheDocument(),
      { timeout: 5000 }
    );

    expect(screen.queryByTestId("btn-cerrar-sin-vincular")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
