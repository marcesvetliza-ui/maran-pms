import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() }),
}));

import { ReservationDetailDialog } from "./reservations";

const GROUP_RESERVATION = {
  id: "res-extras-1",
  reservationCode: "RES-EXTRAS-1",
  groupId: "group-extras-1",
  groupCode: "GR-EXTRAS",
  status: "checked_in",
  checkInDate: "2026-01-01",
  checkOutDate: "2026-01-03",
  totalRoomAmount: "90000",
  numberOfGuests: 1,
  guest: { id: "guest-extras-1", firstName: "Alicia", lastName: "Pérez" },
  room: { id: "room-extras-1", roomNumber: "101", roomType: { name: "Doble" } },
};
let previousPayments:any[]=[];

describe("Reservation detail — independent group room collection", () => {
  beforeEach(() => {
    previousPayments=[];
    queryClient.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/reservations/${GROUP_RESERVATION.id}`) {
        return new Response(JSON.stringify(GROUP_RESERVATION), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      if(url.endsWith('/group-account'))return Response.json({groupId:GROUP_RESERVATION.groupId,reservationId:GROUP_RESERVATION.id,charges:90075,paid:previousPayments.reduce((n,p)=>n+Number(p.amount),0),balance:90075-previousPayments.reduce((n,p)=>n+Number(p.amount),0),pendingInvoice:90075,groupCoverage:{},advances:[],reviewReceipts:[],unassigned:0});
      if (url === "/api/reservation-edit-permission") {
        return new Response(JSON.stringify({ canEdit: false }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/charges?includeAnulados=true")) {
        return new Response(JSON.stringify([
          { id: "charge-extra-1", description: "Minibar", category: "minibar", amount: "75", status: "pending" },
          { id: "charge-room-1", description: "Alojamiento", category: "room", amount: "90000", status: "pending" },
        ]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/payments?includeAnulados=true")) {
        return new Response(JSON.stringify(previousPayments), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/payments" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "payment-extras-1" }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      const body = url.endsWith("/api/billing/config") ? {} : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("records direct room money from the same folio without forcing group navigation or an invoice", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <ReservationDetailDialog reservation={GROUP_RESERVATION as any} open onOpenChange={vi.fn()} onCancel={vi.fn()} />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByTestId("tab-folio"));
    expect(await screen.findByTestId("group-personal-extras-warning")).toHaveTextContent("acciones independientes");
    expect(fetch).toHaveBeenCalledWith(`/api/reservations/${GROUP_RESERVATION.id}`, { credentials: "include" });
    await user.type(await screen.findByLabelText('Importe para la cuenta grupal'),'75');
    expect(screen.getByRole('combobox',{name:'Medio del nuevo cobro'})).not.toHaveTextContent('Cuenta Corriente');
    await user.click(screen.getByRole('button',{name:'Registrar pago sin facturar'}));

    await waitFor(() => {
      const request = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(([url, init]) =>
        String(url) === "/api/payments" && init?.method === "POST");
      expect(request).toBeDefined();
      expect(JSON.parse(String(request?.[1]?.body))).toEqual(expect.objectContaining({
        reservationId: GROUP_RESERVATION.id,
        amount: "75",
        receiptType: "none",
        paymentPurpose: "group_room_collection",
      }));
      expect(JSON.parse(String(request?.[1]?.body)).method).not.toBe("cuenta_corriente");
    });
  });
  it('does not deduct paid lodging from extras and still deducts an explicit extras receipt',async()=>{
    previousPayments=[{id:'lodging',amount:'90000',status:'active'},{id:'extra',amount:'25',status:'active',notes:'[personal_extras]'}];
    const user=userEvent.setup();
    render(<QueryClientProvider client={queryClient}><ReservationDetailDialog reservation={GROUP_RESERVATION as any} open onOpenChange={vi.fn()} onCancel={vi.fn()}/></QueryClientProvider>);
    await user.click(await screen.findByTestId('tab-folio'));
    const section=await screen.findByRole('region',{name:'Cuenta de la habitación en el grupo'});
    expect(section).toHaveTextContent('50,00');
    await user.type(screen.getByLabelText('Importe para la cuenta grupal'),'50');
    expect(screen.getByRole('button',{name:'Registrar pago sin facturar'})).toBeEnabled();
  });
});
