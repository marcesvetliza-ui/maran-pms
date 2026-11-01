import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import { getReservationFinancialSummary } from "@shared/reservationFolio";
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }) }));
import { ReservationDetailDialog } from "./reservations";

const reservation = {
  id: "time-supplement", reservationCode: "TIME-TEST", status: "confirmed",
  checkInDate: "2026-11-01", checkOutDate: "2026-11-02", nights: 1,
  totalRoomAmount: "85.00", numberOfGuests: 2,
  earlyCheckIn: true, earlyCheckInCharge: "21.25", earlyCheckInTime: "08:00",
  lateCheckOut: true, lateCheckOutCharge: "42.50", lateCheckOutTime: "18:00",
  guest: { id: "guest", firstName: "Prueba", lastName: "Horarios" },
  room: { id: "room", roomNumber: "202", roomType: { name: "Ejecutiva" } },
};
let chargeRows: any[];
beforeEach(() => {
  queryClient.clear();
  chargeRows = [{ id: "late", description: "Late Check-out 18:00", category: "otros", amount: "42.50", date: "2026-11-01", status: "active" }];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url === `/api/reservations/${reservation.id}` ? reservation
      : url.endsWith('/charges?includeAnulados=true') ? chargeRows
      : url.endsWith('/api/billing/config') ? {} : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });
async function openFolio() {
  render(<QueryClientProvider client={queryClient}><ReservationDetailDialog reservation={reservation as any} open onOpenChange={vi.fn()} onCancel={vi.fn()} /></QueryClientProvider>);
  const user = userEvent.setup();
  await user.click(await screen.findByTestId('tab-folio'));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/reservations/${reservation.id}/charges?includeAnulados=true`));
  return user;
}
it('counts a late checkout once and uses that total when opening a new collection', async () => {
  const user = await openFolio();
  await waitFor(() => expect(screen.getByTestId('text-balance')).toHaveTextContent('127,50'));
  expect(screen.queryByText('+ Late Check-out (18:00 hs)')).not.toBeInTheDocument();
  await user.click(screen.getByTestId('button-add-payment'));
  expect(screen.getByTestId('input-payment-amount-0')).toHaveValue(127.5);
});
it('counts both registered early and late charges once alongside unrelated consumption', async () => {
  chargeRows.push({ id: 'early', description: 'Early Check-in 08:00', category: 'otros', amount: '21.25', status: 'active' },
    { id: 'minibar', description: 'Agua', category: 'minibar', amount: '10.00', status: 'active' });
  await openFolio();
  const summary = getReservationFinancialSummary(85, chargeRows, [], []);
  await waitFor(() => expect(screen.getByTestId('text-balance')).toHaveTextContent('158,75'));
  expect(summary.operationalFolioBalance).toBe(158.75);
});
it('does not restore a voided late charge from stale reservation metadata', async () => {
  chargeRows[0].status = 'anulado';
  const user = await openFolio();
  await waitFor(() => expect(screen.getByTestId('text-balance')).toHaveTextContent('85,00'));
  await user.click(screen.getByTestId('button-add-payment'));
  expect(screen.getByTestId('input-payment-amount-0')).toHaveValue(85);
});
