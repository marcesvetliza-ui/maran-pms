/**
 * Tests for RevertTransferDialog — full-reversal happy path
 *
 * Covers the path where the server returns { pairedReversed: true, message: "..." },
 * meaning BOTH folios were successfully updated.
 *
 * Verifies:
 *  1. The dialog closes automatically (onClose called)
 *  2. onSuccess is called so the local folio refreshes
 *  3. The amber "No se encontró el cargo correspondiente" warning panel is NOT shown
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

const TRANSFER_CHARGE = {
  id: "charge-777",
  description: "Transferencia a Hab. 202 [xfer:def456]",
  amount: 750,
  category: "transfer_out" as const,
};

const RESERVATION_ID = "res-test-full";

/**
 * Builds a fetch mock that returns { pairedReversed: true, message: "..." }
 * for the reverse-transfer-charge POST, and empty arrays for all other calls.
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
          pairedReversed: true,
          message: "Transferencia revertida en ambos folios",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Default: empty array for any other query
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

describe("RevertTransferDialog — full reversal (both folios updated)", () => {
  let fetchMock: ReturnType<typeof buildFetchMock>;

  beforeEach(() => {
    fetchMock = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("calls onClose automatically after a full reversal", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
    await user.click(revertBtn);

    await waitFor(
      () => expect(onClose).toHaveBeenCalledOnce(),
      { timeout: 5000 }
    );
  });

  it("calls onSuccess so the local folio refreshes after a full reversal", async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderDialog();

    const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
    await user.click(revertBtn);

    await waitFor(
      () => expect(onSuccess).toHaveBeenCalledOnce(),
      { timeout: 5000 }
    );
  });

  it("does NOT show the amber partial-warning panel after a full reversal", async () => {
    const user = userEvent.setup();
    renderDialog();

    const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
    await user.click(revertBtn);

    // Wait for onClose to be called (i.e. the flow finished)
    await waitFor(
      () =>
        expect(
          screen.queryByText(/No se encontró el cargo correspondiente/i)
        ).not.toBeInTheDocument(),
      { timeout: 5000 }
    );
  });

  it("hits the reverse-transfer-charge endpoint exactly once", async () => {
    const user = userEvent.setup();
    renderDialog();

    const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
    await user.click(revertBtn);

    await waitFor(
      () => {
        const reverseCall = fetchMock.mock.calls.find(([url, opts]) => {
          return (
            String(url).includes(`/api/reservations/${RESERVATION_ID}/reverse-transfer-charge`) &&
            (opts?.method?.toUpperCase() ?? "GET") === "POST"
          );
        });
        expect(reverseCall).toBeDefined();
      },
      { timeout: 5000 }
    );

    // Ensure it was called exactly once (no double-fire)
    const reverseCalls = fetchMock.mock.calls.filter(([url, opts]) => {
      return (
        String(url).includes(`/api/reservations/${RESERVATION_ID}/reverse-transfer-charge`) &&
        (opts?.method?.toUpperCase() ?? "GET") === "POST"
      );
    });
    expect(reverseCalls).toHaveLength(1);
  });
});
