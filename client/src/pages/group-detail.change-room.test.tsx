import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GroupDetailPage from "./group-detail";
import { queryClient } from "@/lib/queryClient";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/App", () => ({ useAuth: () => ({ hasPermission: () => false }) }));
vi.mock("wouter", async original => ({ ...await original<typeof import("wouter")>(), useParams: () => ({ id: "johnson" }), useLocation: () => ["/groups/johnson", vi.fn()] }));

const originalStay = { id: "reservation-807", reservationCode: "GGRP-JOHNSON-807", groupId: "johnson", roomTypeId: "premium", roomId: "room-807", room: { id: "room-807", roomNumber: "807", roomTypeId: "premium" }, guestId: "guest", guest: { firstName: "Pasajero", lastName: "JOHNSON ACERO" }, checkInDate: "2026-11-23", checkOutDate: "2026-11-25", status: "confirmed", finalRatePerNight: "133000.00", totalRoomAmount: "266000.00", nights: 2 };
const room = { id: "room-901", roomNumber: "901", floor: 9, roomTypeId: "premium", roomType: { id: "premium", name: "Premium", code: "PREM" }, status: "available", isActive: true };
const warning = { code: "GROUP_BLOCK_WARNING", canOverride: true, error: "La categoría Premium ya está al límite de su inventario operativo, pero la habitación elegida está libre.", warning: { warnings: [], roomTypeName: "Premium", date: "2026-11-24", hardDemand: 20, operationalInventory: 19 } };
let stay: any, writes: any[], mode: "warning" | "overlap" | "available";

beforeEach(() => {
  queryClient.clear(); stay = structuredClone(originalStay); writes = []; mode = "warning";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    if (options?.method === "PATCH") {
      const body = JSON.parse(String(options.body)); writes.push({ url, body });
      if (mode === "overlap") return Response.json({ code: "PHYSICAL_ROOM_OVERLAP", canOverride: false, error: "La habitación 901 ya tiene una reserva en esas fechas" }, { status: 409 });
      if (mode === "warning" && !body.overrideTentativeGroupWarning) return Response.json(warning, { status: 409 });
      stay = { ...stay, roomId: body.roomId, roomTypeId: body.roomTypeId, room }; return Response.json(stay);
    }
    if (url.startsWith("/api/rooms/available")) return Response.json([room]);
    if (url.endsWith("/api/groups/johnson")) return Response.json({ id: "johnson", name: "JOHNSON ACERO", groupCode: "GRP-JOHNSON", status: "blocked", checkInDate: "2026-11-23", checkOutDate: "2026-11-25", blocks: [], reservations: [stay], masterFolioConfig: "none" });
    if (url.endsWith("/folio")) return Response.json({ groupCharges: [], groupChargesTotal: 0, reservations: [], groupPayments: [], groupPaymentsTotal: 0, voidMovements: [], voidMovementsTotal: 0, totals: { accommodation: 266000, groupCharges: 0, extras: 0, payments: 0, voids: 0, balance: 266000 }, billing: { sources: [], totals: { eligible: 0, invoiced: 0, available: 0 }, paymentDestinations: [] } });
    if (url.endsWith("/master-folio")) return Response.json({ config: "none", rooms: [], groupCharges: [], groupPayments: [], masterAccommodation: 0, masterExtras: 0, groupChargesTotal: 0, masterTotal: 0, masterPaid: 0, masterBalance: 0 });
    if (url.endsWith("/invoice-snapshot")) return Response.json({ sources: [], totals: { eligible: 0, invoiced: 0, available: 0 }, financial: { operationalBalance: 266000 } });
    if (url.endsWith("/api/billing/config")) return Response.json({});
    return Response.json([]);
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function openMove() {
  const user = userEvent.setup();
  render(<QueryClientProvider client={queryClient}><GroupDetailPage /></QueryClientProvider>);
  await user.click(await screen.findByRole("tab", { name: /^Reservas/ }));
  await user.click(await screen.findByTestId("button-change-room-reservation-807"));
  await user.click(screen.getByTestId("select-change-room"));
  await user.click(await screen.findByRole("option", { name: /Hab\. 901/ }));
  return user;
}

it("muestra el aviso de categoría y respeta Aceptar al cambiar 807 a 901 desde el grupo", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true), user = await openMove();
  await user.click(screen.getByTestId("button-confirm-change-room"));
  await waitFor(() => expect(stay.roomId).toBe("room-901"));
  expect(confirm).toHaveBeenCalledTimes(1); expect(confirm.mock.calls[0][0]).toContain("Premium"); expect(confirm.mock.calls[0][0]).toContain("La habitación elegida está libre");
  expect(writes).toEqual([{ url: "/api/reservations/reservation-807", body: { roomId: "room-901", roomTypeId: "premium", contextGroupId: "johnson" } }, { url: "/api/reservations/reservation-807", body: { roomId: "room-901", roomTypeId: "premium", contextGroupId: "johnson", overrideTentativeGroupWarning: true } }]);
  expect(stay.finalRatePerNight).toBe("133000.00"); expect(stay.totalRoomAmount).toBe("266000.00");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Habitación cambiada" }));
});
it("cancelar el aviso conserva la habitación original y no reintenta", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false), user = await openMove();
  await user.click(screen.getByTestId("button-confirm-change-room"));
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(writes).toHaveLength(1); expect(stay).toEqual(originalStay); expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("no ofrece aceptar una habitación que se ocupó entre seleccionar y guardar", async () => {
  mode = "overlap"; const confirm = vi.spyOn(window, "confirm"), user = await openMove();
  await user.click(screen.getByTestId("button-confirm-change-room"));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Error al cambiar habitación", description: expect.stringContaining("ya tiene una reserva") })));
  expect(confirm).not.toHaveBeenCalled(); expect(writes).toHaveLength(1); expect(stay).toEqual(originalStay);
});
it("mantiene el cambio directo sin aviso cuando la categoría tiene disponibilidad", async () => {
  mode = "available"; const confirm = vi.spyOn(window, "confirm"), user = await openMove();
  await user.click(screen.getByTestId("button-confirm-change-room"));
  await waitFor(() => expect(stay.roomId).toBe("room-901"));
  expect(confirm).not.toHaveBeenCalled(); expect(writes).toHaveLength(1);
});
