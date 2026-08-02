/**
 * Tests for RevertTransferDialog — button disabled while API call is in-flight
 *
 * Verifies that `isSubmitting` correctly disables the "Revertir transferencia"
 * button (and the "Cancelar" button) while the POST is still pending, for both
 * the full-reversal and partial-reversal response paths.
 *
 * Uses a delayed fetch mock (resolved via an externally-controlled promise) so
 * the test can assert the button state *between* click and response.
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
  id: "charge-inf-1",
  description: "Transferencia a Hab. 303 [xfer:abc999]",
  amount: 1200,
  category: "transfer_out" as const,
};

const RESERVATION_ID = "res-inflight-1";

/**
 * Builds a fetch mock whose POST to reverse-transfer-charge does NOT resolve
 * until `resolve()` is called externally.  Every other call returns `[]`
 * immediately.
 *
 * Returns:
 *  - fetchMock  – the vitest spy (passed to vi.stubGlobal)
 *  - resolve    – call with the desired body object to complete the POST
 *  - reject     – call to fail the POST (optional, not used in these tests)
 */
function buildDelayedFetchMock(responseBody: object) {
  let resolvePost!: (value: Response) => void;
  let rejectPost!: (reason?: any) => void;

  const postPromise = new Promise<Response>((res, rej) => {
    resolvePost = res;
    rejectPost = rej;
  });

  const fetchMock = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const strUrl = url.toString();
    const method = options?.method?.toUpperCase() ?? "GET";

    if (
      strUrl.includes(`/api/reservations/${RESERVATION_ID}/reverse-transfer-charge`) &&
      method === "POST"
    ) {
      return postPromise;
    }

    // All other requests (queries) respond immediately with empty arrays
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  function resolve() {
    resolvePost(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  function reject(msg = "Server error") {
    rejectPost(new Error(msg));
  }

  return { fetchMock, resolve, reject };
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

describe("RevertTransferDialog — button disabled while API call is in-flight", () => {
  describe("full-reversal response path", () => {
    let fetchControl: ReturnType<typeof buildDelayedFetchMock>;

    beforeEach(() => {
      fetchControl = buildDelayedFetchMock({
        pairedReversed: true,
        message: "Transferencia revertida en ambos folios",
      });
      vi.stubGlobal("fetch", fetchControl.fetchMock);
    });

    it("disables the 'Revertir transferencia' button immediately after click (before response)", async () => {
      const user = userEvent.setup();
      renderDialog();

      const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });

      // Button is enabled before clicking
      expect(revertBtn).not.toBeDisabled();

      // Click — the POST is now pending (fetchControl.resolve not yet called)
      await user.click(revertBtn);

      // Button must be disabled while the API call is in-flight
      expect(revertBtn).toBeDisabled();

      // Complete the request so React can settle
      fetchControl.resolve();
    });

    it("disables the 'Cancelar' button immediately after click (before response)", async () => {
      const user = userEvent.setup();
      renderDialog();

      const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
      const cancelBtn = screen.getByRole("button", { name: /cancelar/i });

      expect(cancelBtn).not.toBeDisabled();

      await user.click(revertBtn);

      // Cancel must also be disabled while submitting
      expect(cancelBtn).toBeDisabled();

      fetchControl.resolve();
    });

    it("re-enables the button (or closes) after the full-reversal response arrives", async () => {
      const user = userEvent.setup();
      const { onClose } = renderDialog();

      const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(revertBtn);

      // Confirm disabled while in-flight
      expect(revertBtn).toBeDisabled();

      // Resolve the pending POST
      fetchControl.resolve();

      // After a full reversal the dialog closes — onClose is the signal
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce(), { timeout: 5000 });
    });

    it("fires the POST endpoint exactly once even when the button is clicked rapidly", async () => {
      const user = userEvent.setup();
      renderDialog();

      const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });

      // First click triggers the call; button becomes disabled immediately
      await user.click(revertBtn);

      // Attempt a second click while still disabled — should be a no-op
      await user.click(revertBtn);

      // Count POST calls to reverse-transfer-charge
      const posts = fetchControl.fetchMock.mock.calls.filter(
        ([url, opts]) =>
          String(url).includes(
            `/api/reservations/${RESERVATION_ID}/reverse-transfer-charge`
          ) && (opts?.method?.toUpperCase() ?? "GET") === "POST"
      );
      expect(posts).toHaveLength(1);

      fetchControl.resolve();
    });
  });

  describe("partial-reversal response path", () => {
    let fetchControl: ReturnType<typeof buildDelayedFetchMock>;

    beforeEach(() => {
      fetchControl = buildDelayedFetchMock({
        pairedReversed: false,
        otherRoom: "303",
        message: "Cargo revertido en este folio. El folio destino no pudo ser actualizado.",
      });
      vi.stubGlobal("fetch", fetchControl.fetchMock);
    });

    it("disables the 'Revertir transferencia' button immediately after click (before partial response)", async () => {
      const user = userEvent.setup();
      renderDialog();

      const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });

      expect(revertBtn).not.toBeDisabled();

      await user.click(revertBtn);

      // Still in-flight — must be disabled
      expect(revertBtn).toBeDisabled();

      fetchControl.resolve();
    });

    it("disables the 'Cancelar' button immediately after click (before partial response)", async () => {
      const user = userEvent.setup();
      renderDialog();

      const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
      const cancelBtn = screen.getByRole("button", { name: /cancelar/i });

      expect(cancelBtn).not.toBeDisabled();

      await user.click(revertBtn);

      expect(cancelBtn).toBeDisabled();

      fetchControl.resolve();
    });

    it("shows the amber partial-warning panel after the partial response arrives", async () => {
      const user = userEvent.setup();
      renderDialog();

      const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(revertBtn);

      // Confirm disabled while in-flight
      expect(revertBtn).toBeDisabled();

      // Resolve with partial result
      fetchControl.resolve();

      // Warning panel should appear
      await waitFor(
        () =>
          expect(
            screen.queryByText(/No se encontró el cargo correspondiente/i)
          ).toBeInTheDocument(),
        { timeout: 5000 }
      );
    });

    it("fires the POST endpoint exactly once on the partial-reversal path", async () => {
      const user = userEvent.setup();
      renderDialog();

      const revertBtn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(revertBtn);
      await user.click(revertBtn); // second click while disabled — no-op

      const posts = fetchControl.fetchMock.mock.calls.filter(
        ([url, opts]) =>
          String(url).includes(
            `/api/reservations/${RESERVATION_ID}/reverse-transfer-charge`
          ) && (opts?.method?.toUpperCase() ?? "GET") === "POST"
      );
      expect(posts).toHaveLength(1);

      fetchControl.resolve();
    });
  });
});
