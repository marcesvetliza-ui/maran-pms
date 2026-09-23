import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CcVoidReceiptAction } from "./cc-void-receipt-action";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const directPayment = {
  id: "payment-1",
  type: "pago",
  amount: "-110.00",
  date: "2026-09-23",
  entityId: "company-1",
  receiptNumber: "REC-2026-0001",
};

function renderAction(movement = directPayment) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CcVoidReceiptAction movement={movement} entityLabel="Hotel Test" />
    </QueryClientProvider>,
  );
}

describe("CcVoidReceiptAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  it.each([
    ["active direct payment", directPayment, true],
    ["cargo", { ...directPayment, type: "cargo" }, false],
    ["voided payment", { ...directPayment, voided: true }, false],
    ["reservation payment", { ...directPayment, reservationId: "reservation-1" }, false],
    ["group payment", { ...directPayment, groupPaymentId: "group-1" }, false],
  ])("shows only for %s", (_label, movement, visible) => {
    renderAction(movement);
    if (visible) expect(screen.getByTestId("button-void-receipt-payment-1")).toBeInTheDocument();
    else expect(screen.queryByTestId("button-void-receipt-payment-1")).not.toBeInTheDocument();
  });

  it("requires a reason, posts once, disables duplicate submit and marks success", async () => {
    const user = userEvent.setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderAction();
    await user.click(screen.getByTestId("button-void-receipt-payment-1"));
    const confirm = screen.getByRole("button", { name: /confirmar anulación/i });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("Motivo obligatorio"), "Importe incorrecto");
    expect(confirm).toBeEnabled();
    let resolveRequest!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; })));
    await user.click(confirm);
    expect(confirm).toBeDisabled();
    expect(fetch).toHaveBeenCalledWith("/api/account-movements/payment-1/void", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ reason: "Importe incorrecto" }),
    }));
    resolveRequest(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalled();
  });
});
