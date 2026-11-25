import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import { GroupRoomInvoiceDialog } from "./group-room-invoice-dialog";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
const group = {
  id: "fixture-group",
  reservations: [
    {
      id: "fixture-room",
      status: "confirmed",
      guest: { firstName: "Fixture", lastName: "Person" },
      room: { roomNumber: "9001" },
    },
  ],
} as any;
const path = "/api/groups/fixture-group/room-invoice-batches";
const invoice = {
  reservationId: "fixture-room",
  roomNumber: "9001",
  amount: 100,
  body: {
    reservaId: "fixture-room",
    creditOperationId: "original-invoice-operation",
    groupDocumentationOnly: true,
  },
};
it("verifies an acknowledged receipt after a lost response and issues only the remaining original invoice on reopening", async () => {
  const paymentBody = {
    paymentRequestId: "original-payment-operation",
    paymentRows: [
      {
        method: "efectivo",
        amount: "100.00",
        reference: "Synthetic reference",
      },
    ],
  };
  let collected = false,
    issued = false;
  const batch = () => ({
    id: "fixture-batch",
    status: issued ? "completed" : "active",
    total: 100,
    canCollect: true,
    collection: { done: collected, review: false },
    paymentBody,
    invoices: [
      {
        ...invoice,
        done: issued,
        invoice: issued ? { id: 1, type: "FB", point: 1, number: 1 } : null,
      },
    ],
  });
  const fetcher = vi.fn(async (url: any, options?: any) => {
    const method = options?.method || "GET";
    if (String(url) === path && method === "GET") return Response.json([]);
    if (String(url) === path + "/preview")
      return Response.json({
        fingerprint: "original-review",
        canPrepare: true,
        blockers: [],
        total: 100,
        point: 1,
        payer: { razonSocial: "Fixture Person", dni: "00000000" },
        rows: [
          {
            reservationId: "fixture-room",
            roomNumber: "9001",
            guestName: "Fixture Person",
            paid: 40,
            balance: 100,
            invoiceAmount: 140,
            type: "FB",
            client: { razonSocial: "Fixture Person" },
          },
        ],
      });
    if (String(url) === path && method === "POST")
      return Response.json(batch());
    if (String(url).endsWith("/payment")) {
      collected = true;
      throw Error("Synthetic lost response");
    }
    if (String(url) === "/api/billing/invoices") {
      issued = true;
      return Response.json({ id: 1 });
    }
    return Response.json(batch());
  });
  vi.stubGlobal("fetch", fetcher);
  const saved = vi.fn(),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    user = userEvent.setup();
  const component = (open: boolean) => (
    <QueryClientProvider client={client}>
      <GroupRoomInvoiceDialog
        group={group}
        open={open}
        onOpenChange={vi.fn()}
        onSaved={saved}
      />
    </QueryClientProvider>
  );
  const view = render(component(true));
  await user.click(
    screen.getByRole("button", { name: "Revisar saldos y facturas" }),
  );
  await screen.findByText("Cobro nuevo total: $100,00");
  await user.type(screen.getByLabelText("Referencia 1"), "Synthetic reference");
  await user.click(
    screen.getByRole("button", {
      name: "Cobrar, cerrar y facturar por habitación",
    }),
  );
  await screen.findByRole("alert");
  expect(
    fetcher.mock.calls.filter(([url]) => String(url).endsWith("/payment")),
  ).toHaveLength(1);
  expect(issued).toBe(false);
  view.rerender(component(false));
  view.rerender(component(true));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(screen.getByText("Cierre documentado.")).toBeInTheDocument();
  const paymentCalls = fetcher.mock.calls.filter(([url]) =>
    String(url).endsWith("/payment"),
  );
  expect(paymentCalls).toHaveLength(1);
  expect(JSON.parse(paymentCalls[0][1].body)).toEqual(paymentBody);
  const invoices = fetcher.mock.calls.filter(
    ([url]) => String(url) === "/api/billing/invoices",
  );
  expect(invoices).toHaveLength(1);
  expect(JSON.parse(invoices[0][1].body)).toEqual(invoice.body);
});
