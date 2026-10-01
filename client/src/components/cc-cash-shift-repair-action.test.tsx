import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CcCashShiftRepairAction } from "./cc-cash-shift-repair-action";

const receipt = {
  id: "receipt-1",
  type: "pago",
  amount: "-1250.00",
  receiptNumber: "REC-2026-0001",
};

const repairablePreview = {
  receiptId: "receipt-1",
  receiptNumber: "REC-2026-0001",
  grossAmount: "1250.00",
  cashAmount: "1000.00",
  retentionAmount: "250.00",
  movementCount: 2,
  fromShifts: [{
    id: "source-shift",
    area: "recepcion",
    shiftNumber: 42,
    openedAt: "2026-09-23T12:00:00.000Z",
    status: "closed",
  }],
  targetShift: {
    id: "target-shift",
    area: "restaurant",
    shiftNumber: 8,
    openedAt: "2026-09-23T14:00:00.000Z",
    status: "open",
  },
  canRepair: true,
  status: "needs_repair" as const,
  message: "El recibo puede reasignarse al turno indicado.",
  previewToken: "preview-token-1",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderAction(
  movement: typeof receipt & {
    voided?: boolean;
    reservationId?: string;
    paymentId?: string;
    groupPaymentId?: string;
  } = receipt,
  canManage = true,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CcCashShiftRepairAction movement={movement} canManage={canManage} />
    </QueryClientProvider>,
  );
}

describe("CcCashShiftRepairAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/account-movements/receipt-1/cash-shift-repair") {
        return jsonResponse({ repaired: true });
      }
      if (String(input) === "/api/account-movements/receipt-1/cash-shift-repair-preview") {
        return jsonResponse(repairablePreview);
      }
      if (String(input) === "/api/account-movements/receipt-2/cash-shift-repair-preview") {
        return jsonResponse({ ...repairablePreview, receiptId: "receipt-2", receiptNumber: "REC-2026-0002" });
      }
      return jsonResponse({ error: `Solicitud inesperada: ${String(input)}` }, 404);
    }));
  });

  it("muestra y confirma la vista previa preservando importes y retenciones; abrir no confirma", async () => {
    const user = userEvent.setup();
    renderAction();

    await user.click(screen.getByRole("button", { name: "Vista previa de reparación de caja para recibo REC-2026-0001" }));

    expect(await screen.findByText("Importe bruto:")).toBeInTheDocument();
    expect(screen.getByText("$1.250,00")).toBeInTheDocument();
    expect(screen.getByText("$1.000,00")).toBeInTheDocument();
    expect(screen.getByText("$250,00")).toBeInTheDocument();
    expect(screen.getByText(/Retenciones informativas/)).toBeInTheDocument();
    expect(screen.getByText(/no se modifica el importe ni se genera un cobro nuevo/i)).toBeInTheDocument();
    expect(screen.getByText(/Recepción · Turno 42/)).toBeInTheDocument();
    expect(screen.getByText(/Restaurant · Turno 8/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/account-movements/receipt-1/cash-shift-repair-preview");
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/account-movements/receipt-1/cash-shift-repair",
      expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: "Confirmar reparación" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account-movements/receipt-1/cash-shift-repair",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ previewToken: "preview-token-1", targetShiftId: "target-shift" }),
      }),
    ));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("no ofrece confirmar en vistas bloqueadas o ya correctas y oculta recibos no elegibles", async () => {
    const user = userEvent.setup();
    const blocked = {
      ...repairablePreview,
      canRepair: false,
      targetShift: null,
      previewToken: null,
      status: "blocked" as const,
      message: "No existe un turno destino válido.",
    };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(blocked)));
    const { unmount } = renderAction();
    await user.click(screen.getByTestId("button-repair-cash-shift-receipt-1"));
    expect(await screen.findByText("No existe un turno destino válido.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar reparación" })).toBeDisabled();
    unmount();

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      ...repairablePreview,
      canRepair: false,
      status: "already_correct",
      message: "El turno ya es correcto.",
    })));
    const alreadyCorrect = renderAction();
    await user.click(screen.getByTestId("button-repair-cash-shift-receipt-1"));
    expect(await screen.findByText(/El recibo ya está asignado correctamente/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar reparación" })).toBeDisabled();
    alreadyCorrect.unmount();

    for (const [movement, canManage] of [
      [{ ...receipt, voided: true }, true],
      [{ ...receipt, reservationId: "reservation-1" }, true],
      [{ ...receipt, paymentId: "payment-1" }, true],
      [{ ...receipt, groupPaymentId: "group-payment-1" }, true],
      [receipt, false],
      [{ ...receipt, type: "cargo" }, true],
    ] as const) {
      const hidden = renderAction(movement, canManage);
      expect(screen.queryByTestId("button-repair-cash-shift-receipt-1")).not.toBeInTheDocument();
      hidden.unmount();
    }
  });

  it("impide doble confirmación mientras espera y refresca la vista previa ante conflicto obsoleto", async () => {
    const user = userEvent.setup();
    let rejectPost!: (response: Response) => void;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/cash-shift-repair-preview")) return jsonResponse(repairablePreview);
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => { rejectPost = resolve; });
      }
      return jsonResponse({ error: "unexpected" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAction();

    await user.click(screen.getByTestId("button-repair-cash-shift-receipt-1"));
    const confirm = await screen.findByRole("button", { name: "Confirmar reparación" });
    await user.click(confirm);
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);

    rejectPost(jsonResponse({ error: "La vista previa caducó." }, 409));
    expect(await screen.findByText("La vista previa caducó.")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith("/cash-shift-repair-preview"),
    )).toHaveLength(2));
    expect(confirm).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("borra la vista previa anterior al cerrar y abrir otro recibo", async () => {
    const user = userEvent.setup();
    const { rerender } = renderAction();
    await user.click(screen.getByTestId("button-repair-cash-shift-receipt-1"));
    expect(await screen.findByText("REC-2026-0001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CcCashShiftRepairAction movement={{ ...receipt, id: "receipt-2" }} canManage />
      </QueryClientProvider>,
    );
    await user.click(screen.getByTestId("button-repair-cash-shift-receipt-2"));
    expect(await screen.findByText("REC-2026-0002")).toBeInTheDocument();
    expect(screen.queryByText("REC-2026-0001")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/account-movements/receipt-2/cash-shift-repair-preview");
  });
});