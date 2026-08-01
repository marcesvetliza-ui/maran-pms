/**
 * Tests for RevertTransferDialog — partial-reversal warning panel
 *
 * Covers the path where the server returns { pairedReversed: false, otherRoom: "101" },
 * meaning the charge in THIS folio was reversed but the paired folio could not be found.
 *
 * Verifies:
 *  1. The amber warning panel is visible and mentions "Hab. 101"
 *  2. The green "this folio reversed" panel is also shown
 *  3. The dialog stays open (does not auto-close)
 *  4. onSuccess is called (the local folio should be refreshed)
 *  5. onClose is NOT called automatically
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// ── Module mocks ──────────────────────────────────────────────────────────────

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
const { RevertTransferDialog } = await import("./PrefacturaDialog");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Transfer charge without a [corr:] tag — simulates the "no corr ID" path */
const TRANSFER_CHARGE = {
  id: "charge-999",
  description: "Transferencia a Hab. 101 [xfer:abc123]",
  amount: 500,
  category: "transfer_out" as const,
};

const RESERVATION_ID = "res-test-1";

/**
 * Builds a fetch mock that returns { pairedReversed: false, otherRoom: "101" }
 * for the reverse-transfer-charge POST, and empty arrays/objects for all other calls.
 */
function buildFetchMock() {
  return vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    if (
      strUrl.includes(`/api/reservations/${RESERVATION_ID}/reverse-transfer-charge`) &&
      method === "POST"
    ) {
      return new Response(
        JSON.stringify({
          pairedReversed: false,
          otherRoom: "101",
          message: "Cargo revertido en este folio. El folio destino no pudo ser actualizado.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Default: empty array / object for any other query
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

function renderDialog(overrides: Partial<React.ComponentProps<typeof RevertTransferDialog>> = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  render(
    <Wrapper>
      <RevertTransferDialog
        open={true}
        onClose={onClose}
        reservationId={RESERVATION_ID}
        charge={TRANSFER_CHARGE}
        onSuccess={onSuccess}
        {...overrides}
      />
    </Wrapper>
  );
  return { onClose, onSuccess };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RevertTransferDialog — partial-reversal warning", () => {
  let fetchMock: ReturnType<typeof buildFetchMock>;

  beforeEach(() => {
    fetchMock = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows the amber warning panel mentioning Hab. 101 after a partial reversal", async () => {
    const user = userEvent.setup();
    renderDialog();

    // Click the "Revertir transferencia" button to trigger the API call
    const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
    await user.click(revertBtn);

    // Wait for the partial-result view to appear
    await waitFor(
      () =>
        expect(
          screen.queryByText(/No se encontró el cargo correspondiente/i)
        ).toBeInTheDocument(),
      { timeout: 5000 }
    );

    // The amber warning must mention Hab. 101
    const warningText = screen.getByText(/No se encontró el cargo correspondiente/i);
    expect(warningText.textContent).toMatch(/Hab\. 101/);
  });

  it("shows the green 'this folio reversed' panel alongside the amber warning", async () => {
    const user = userEvent.setup();
    renderDialog();

    const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
    await user.click(revertBtn);

    // Wait for the amber warning (same condition as other tests — both panels appear together)
    await waitFor(
      () =>
        expect(
          screen.queryByText(/No se encontró el cargo correspondiente/i)
        ).toBeInTheDocument(),
      { timeout: 5000 }
    );

    // Green panel — the text spans a <strong> child so match on a stable partial substring
    expect(screen.getByText(/fue revertido correctamente/i)).toBeInTheDocument();

    // Amber panel must also be present at the same time
    expect(
      screen.getByText(/No se encontró el cargo correspondiente/i)
    ).toBeInTheDocument();
  });

  it("keeps the dialog open after a partial reversal (does not auto-close)", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
    await user.click(revertBtn);

    await waitFor(
      () =>
        expect(
          screen.queryByText(/No se encontró el cargo correspondiente/i)
        ).toBeInTheDocument(),
      { timeout: 5000 }
    );

    // Dialog must still be in the DOM
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // onClose must NOT have been called automatically
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onSuccess so the local folio refreshes after a partial reversal", async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();

    const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
    await user.click(revertBtn);

    await waitFor(
      () =>
        expect(
          screen.queryByText(/No se encontró el cargo correspondiente/i)
        ).toBeInTheDocument(),
      { timeout: 5000 }
    );

    // onSuccess must have been called to trigger folio invalidation
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("closes normally when staff clicks 'Entendido'", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
    await user.click(revertBtn);

    await waitFor(
      () => expect(screen.queryByRole("button", { name: /entendido/i })).toBeInTheDocument(),
      { timeout: 5000 }
    );

    await user.click(screen.getByRole("button", { name: /entendido/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
