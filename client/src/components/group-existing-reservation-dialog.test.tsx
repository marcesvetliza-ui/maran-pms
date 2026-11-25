import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, it, expect, vi } from "vitest";
import { GroupExistingReservationDialog } from "./group-existing-reservation-dialog";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
const group = {
  id: "fixture-group",
  checkInDate: "2026-01-01",
  checkOutDate: "2026-01-02",
  blocks: [{ id: "fixture-block", roomTypeId: "fixture-type", quantity: 1 }],
  reservations: [],
} as any;
const candidate = {
  id: "fixture-stay",
  code: "SYNTHETIC",
  guestName: "Fixture Person",
  roomNumber: "9001",
  roomTypeId: "fixture-type",
  checkInDate: "2026-01-01",
  checkOutDate: "2026-01-02",
  status: "confirmed",
};
const wrapper = (children: React.ReactNode) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);
it("requires a reviewed slot and reason, preserving the original reservation ID in the incorporation request", async () => {
  const fetcher = vi.fn(async (url: any, options?: any) => {
    if (String(url).includes("reservation-candidates"))
      return Response.json([candidate]);
    if (String(url).endsWith("/preview"))
      return Response.json({
        fingerprint: "verified-original-snapshot",
        canImport: true,
        blockers: [],
        reservation: { totalRoomAmount: 100 },
        historicalPayments: 40,
        invoiceCount: 1,
      });
    return Response.json({ reservationId: candidate.id });
  });
  vi.stubGlobal("fetch", fetcher);
  const saved = vi.fn(),
    user = userEvent.setup();
  render(
    wrapper(
      <GroupExistingReservationDialog
        group={group}
        open
        onOpenChange={vi.fn()}
        onSaved={saved}
      />,
    ),
  );
  await user.type(
    screen.getByLabelText("Huésped, habitación o código"),
    "Fixture",
  );
  await user.click(await screen.findByTestId("import-candidate-fixture-stay"));
  await user.selectOptions(
    screen.getByLabelText("Cupo del grupo"),
    "fixture-block",
  );
  await user.click(
    screen.getByRole("button", { name: "Revisar incorporación" }),
  );
  expect(await screen.findByTestId("group-import-preview")).toHaveTextContent(
    "Pagos registrados: $40",
  );
  expect(
    screen.getByRole("button", { name: "Incorporar reserva" }),
  ).toBeDisabled();
  await user.type(screen.getByLabelText("Motivo"), "Fixture grouping reason");
  await user.click(screen.getByRole("button", { name: "Incorporar reserva" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  const call = fetcher.mock.calls.find(([url]) =>
    String(url).endsWith("/import-reservation"),
  )!;
  const body = JSON.parse(call[1].body);
  expect(body).toMatchObject({
    reservationId: candidate.id,
    blockId: "fixture-block",
    fingerprint: "verified-original-snapshot",
    reason: "Fixture grouping reason",
  });
  expect(body).not.toHaveProperty("totalRoomAmount");
  expect(body).not.toHaveProperty("payments");
});
it("automatically verifies the exact saved incorporation after a lost response", async () => {
  const body = {
    reservationId: candidate.id,
    blockId: "fixture-block",
    operationId: "00000000-0000-4000-8000-000000000001",
    fingerprint: "original",
    reason: "Synthetic reason",
  };
  sessionStorage.setItem(
    "group-existing-reservation:fixture-group",
    JSON.stringify(body),
  );
  const fetcher = vi.fn(async (_url: any, _options?: any) =>
    Response.json({ replayed: true }),
  );
  vi.stubGlobal("fetch", fetcher);
  const saved = vi.fn();
  render(
    wrapper(
      <GroupExistingReservationDialog
        group={group}
        open
        onOpenChange={vi.fn()}
        onSaved={saved}
      />,
    ),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledOnce();
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(body);
  expect(
    sessionStorage.getItem("group-existing-reservation:fixture-group"),
  ).toBeNull();
});
