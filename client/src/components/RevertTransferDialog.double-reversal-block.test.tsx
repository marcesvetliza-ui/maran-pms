/**
 * Tests: double-reversal block on POST /api/reservations/:id/reverse-transfer-charge
 *
 * The server enforces two description-based guards (server/routes/reservations.ts ~1751-1755):
 *   1. charge.description.startsWith("Reversa de transferencia")  → 400
 *   2. charge.description.includes("[rev:")                        → 400
 *
 * Plus an idempotency guard that queries the DB:
 *   3. existing [rev:chargeId] row found on this reservation        → 409
 *
 * These tests confirm that:
 *   a) Both description-prefix paths produce an error toast in RevertTransferDialog.
 *   b) The 409 idempotency path also produces an error toast.
 *   c) None of the blocked paths trigger onSuccess or auto-close.
 *
 * The endpoint (/api/reservations/:id/reverse-transfer-charge) is shared by all folio
 * areas — SPA, Eventos, and Restaurant all hit the same route, so the guard covers all
 * three without area-specific code.
 *
 * Client-side pre-filter (ChargeRow in PrefacturaDialog):
 *   The "Revertir" button is rendered only when:
 *     isTransfer && !isReversal && !alreadyReversed
 *   where:
 *     - isReversal      = description.includes("[rev:")
 *     - alreadyReversed = some sibling charge has [rev:thisChargeId] in its description
 *
 *   The server guard is the authoritative barrier; the client guard is a UX convenience.
 *
 * Note on error format: apiRequest() calls throwIfResNotOk() which throws
 *   new Error(`${status}: ${bodyText}`) before returning the Response.
 * The catch block in handleRevert() parses this status-prefixed string and extracts
 * the inner .error field, so the toast title equals the clean Spanish message exactly.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// ── Stable toast spy (must be hoisted before vi.mock calls) ───────────────────

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, toasts: [], dismiss: vi.fn() }),
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

const RESERVATION_ID = "res-double-reversal-test";

/**
 * Builds a fetch mock that returns the given status + JSON body for ANY request.
 */
function buildFetchMock(statusCode: number, body: object) {
  return vi.fn(async (_url: string | URL | Request, _options?: RequestInit) =>
    new Response(JSON.stringify(body), {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderDialog(
  charge: { id: string; description: string; amount: number; category: string },
  overrides: Partial<React.ComponentProps<typeof RevertTransferDialog>> = {}
) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  render(
    <Wrapper>
      <RevertTransferDialog
        open={true}
        onClose={onClose}
        reservationId={RESERVATION_ID}
        charge={charge}
        onSuccess={onSuccess}
        {...overrides}
      />
    </Wrapper>
  );
  return { onClose, onSuccess };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Double-reversal block — POST /api/reservations/:id/reverse-transfer-charge', () => {
  beforeEach(() => {
    toastSpy.mockClear();
  });

  // ── Guard 1: description prefix "Reversa de transferencia" ───────────────────
  describe('Guard 1: description starts with "Reversa de transferencia"', () => {
    /**
     * Server code (reservations.ts ~1751-1755):
     *   if (charge.description.startsWith("Reversa de transferencia") ||
     *       charge.description.includes("[rev:")) {
     *     return res.status(400).json({
     *       error: "Este cargo ya es una reversa — no se puede revertir nuevamente"
     *     });
     *   }
     */
    const reversalCharge = {
      id: "charge-reversal-prefix",
      description: "Reversa de transferencia (Hab. 201) [corr:abc123] [rev:orig-id]",
      amount: -500,
      category: "transfer_out" as const,
    };

    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        buildFetchMock(400, {
          error: "Este cargo ya es una reversa — no se puede revertir nuevamente",
        })
      );
    });

    it("shows a destructive error toast with the exact 400 error message", async () => {
      const user = userEvent.setup();
      renderDialog(reversalCharge);

      const btn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(btn);

      await waitFor(
        () =>
          expect(toastSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "Este cargo ya es una reversa — no se puede revertir nuevamente",
              variant: "destructive",
            })
          ),
        { timeout: 5000 }
      );
    });

    it("does NOT call onSuccess when the server blocks with 400", async () => {
      const user = userEvent.setup();
      const { onSuccess } = renderDialog(reversalCharge);

      const btn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(btn);

      // Wait for the error path to complete (toast must have fired)
      await waitFor(() => expect(toastSpy).toHaveBeenCalled(), { timeout: 5000 });
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("does NOT auto-close when the server blocks with 400", async () => {
      const user = userEvent.setup();
      const { onClose } = renderDialog(reversalCharge);

      const btn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(btn);

      await waitFor(() => expect(toastSpy).toHaveBeenCalled(), { timeout: 5000 });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ── Guard 2: description contains [rev:…] tag ─────────────────────────────
  describe('Guard 2: description contains [rev:…] tag', () => {
    /**
     * The [rev:X] tag embedded by the reversal engine marks a charge as a counter-entry.
     * The server checks description.includes("[rev:") and returns 400.
     * A charge that carries this tag is itself a reversal — reversing it again
     * would create a double-reversal and corrupt the folio balance.
     */
    const revTagCharge = {
      id: "charge-rev-tag",
      description: "Transferencia a Hab. 301 [xfer:xyz789] [rev:original-charge-id]",
      amount: 800,
      category: "transfer_in" as const,
    };

    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        buildFetchMock(400, {
          error: "Este cargo ya es una reversa — no se puede revertir nuevamente",
        })
      );
    });

    it("shows a destructive error toast with the exact 400 error message", async () => {
      const user = userEvent.setup();
      renderDialog(revTagCharge);

      const btn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(btn);

      await waitFor(
        () =>
          expect(toastSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "Este cargo ya es una reversa — no se puede revertir nuevamente",
              variant: "destructive",
            })
          ),
        { timeout: 5000 }
      );
    });

    it("does NOT call onSuccess when the server blocks with 400", async () => {
      const user = userEvent.setup();
      const { onSuccess } = renderDialog(revTagCharge);

      const btn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(btn);

      await waitFor(() => expect(toastSpy).toHaveBeenCalled(), { timeout: 5000 });
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("does NOT auto-close when the server blocks with 400", async () => {
      const user = userEvent.setup();
      const { onClose } = renderDialog(revTagCharge);

      const btn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(btn);

      await waitFor(() => expect(toastSpy).toHaveBeenCalled(), { timeout: 5000 });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ── Guard 3: idempotency — charge already reversed (409) ──────────────────
  describe('Guard 3: charge was already reversed — idempotency (409)', () => {
    /**
     * Server code (reservations.ts ~1760-1769):
     *   SELECT id FROM charges WHERE reservation_id = … AND description LIKE '%[rev:chargeId]%'
     *   → 409 "Esta transferencia ya fue revertida anteriormente"
     *
     * This is the case where the charge itself is NOT a reversal entry but a previous
     * reversal run already created a counter-charge embedding [rev:chargeId].
     * The DB query prevents double-reversal even if the client-side alreadyReversed
     * badge is somehow missed.
     */
    const normalTransferCharge = {
      id: "charge-already-reversed",
      description: "Transferencia a Hab. 102 [xfer:def456] [corr:corr123]",
      amount: 1200,
      category: "transfer_out" as const,
    };

    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        buildFetchMock(409, {
          error: "Esta transferencia ya fue revertida anteriormente",
        })
      );
    });

    it("shows a destructive error toast with the exact 409 error message", async () => {
      const user = userEvent.setup();
      renderDialog(normalTransferCharge);

      const btn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(btn);

      await waitFor(
        () =>
          expect(toastSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              title: "Esta transferencia ya fue revertida anteriormente",
              variant: "destructive",
            })
          ),
        { timeout: 5000 }
      );
    });

    it("does NOT call onSuccess when the server blocks with 409", async () => {
      const user = userEvent.setup();
      const { onSuccess } = renderDialog(normalTransferCharge);

      const btn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(btn);

      await waitFor(() => expect(toastSpy).toHaveBeenCalled(), { timeout: 5000 });
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it("does NOT auto-close when the server blocks with 409", async () => {
      const user = userEvent.setup();
      const { onClose } = renderDialog(normalTransferCharge);

      const btn = screen.getByRole("button", { name: /revertir transferencia/i });
      await user.click(btn);

      await waitFor(() => expect(toastSpy).toHaveBeenCalled(), { timeout: 5000 });
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
