import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SpaVoucherConfirmation } from "./spa-voucher-confirmation";
let calls: any[], lose: boolean;
const settings = {
  receiptType: "cierre_spa" as const,
  recipientKind: "client" as const,
  discount: null,
  notes: "",
};
function mount() {
  return render(
    <SpaVoucherConfirmation
      accountId="account"
      userId="user"
      canWrite
      valid
      selectionKey="fixed"
      settings={settings}
      expectedVersion={"a".repeat(64)}
      collections={[
        {
          rowId: "cash",
          method: "efectivo",
          amountCents: 6000000,
          shiftId: "shift",
        },
      ]}
      form={<p>Formulario</p>}
      review={<p>Revisión no fiscal</p>}
      onPending={vi.fn()}
      onBusy={vi.fn()}
      onCompleted={vi.fn()}
    />,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  calls = [];
  lose = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      calls.push(JSON.parse(init.body));
      if (lose) {
        lose = false;
        throw new TypeError("Respuesta perdida");
      }
      return new Response(
        JSON.stringify({
          ok: true,
          data: { invoiceId: "1", totalCents: 6000000 },
        }),
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("a lost response recovers the identical voucher after reopening, without a new request ID or collection", async () => {
  const first = mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Revisar comprobante" }),
  );
  expect(calls).toHaveLength(0);
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar cobro y emitir voucher" }),
  );
  await screen.findByText("Respuesta perdida");
  first.unmount();
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Consultar el mismo voucher" }),
  );
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[1]).toEqual(calls[0]);
  expect(sessionStorage.getItem("spa-voucher:user:account")).toBeNull();
});
it("a damaged recovery journal blocks another issue instead of inventing an identity", async () => {
  sessionStorage.setItem("spa-voucher:user:account", "broken");
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "intento pendiente",
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(calls).toHaveLength(0);
});
