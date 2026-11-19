import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, it, expect, vi } from "vitest";
import { CancelledCollectionCorrection } from "./cancelled-collection-correction";
const plan = {
  fingerprint: "exact-source",
  invoiceLabel: "FA 0005-00000248",
  total: 399000,
  payments: [
    {
      id: "original-payment",
      amount: 399000,
      method: "efectivo",
      shiftClosed: true,
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount(role = "admin") {
  const saved = vi.fn(),
    fetcher = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) =>
      Response.json({ closedCancelled: true, collectionReversed: true }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <CancelledCollectionCorrection
        reservationId="406-stay"
        operationId="original-operation"
        plan={plan}
        role={role}
        disabled={false}
        onCompleted={saved}
      />
    </QueryClientProvider>,
  );
  return { fetcher, saved };
}
it("shows the exact original cash and closed shift before explicitly confirming; issues no invoice or collection", async () => {
  const { fetcher, saved } = mount(),
    user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Anular cobro y refacturar" }),
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveTextContent("0005-00000248");
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "El turno original está cerrado",
  );
  await user.clear(screen.getByLabelText("Motivo de la corrección"));
  expect(
    screen.getByRole("button", { name: "Confirmar anulación" }),
  ).toBeDisabled();
  await user.type(
    screen.getByLabelText("Motivo de la corrección"),
    "Se cargó efectivo por error. Corresponde cuenta corriente.",
  );
  await user.click(screen.getByRole("button", { name: "Confirmar anulación" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledOnce();
  expect(String(fetcher.mock.calls[0][0])).toBe(
    "/api/billing/reservations/406-stay/operations/original-operation/cancel-collection",
  );
  expect(
    JSON.parse(String((fetcher.mock.calls[0][1] as RequestInit).body)),
  ).toMatchObject({ fingerprint: "exact-source", acknowledge: true });
});
it("cancel leaves the original collection untouched", async () => {
  const { fetcher } = mount(),
    user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Anular cobro y refacturar" }),
  );
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("shows the required supervisor without enabling writes for reception", () => {
  const { fetcher } = mount("reception");
  expect(
    screen.queryByRole("button", { name: "Anular cobro y refacturar" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Un supervisor de recepción/)).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});
