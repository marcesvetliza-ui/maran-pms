import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/App", () => ({ useAuth: () => ({ user: { id: "admin", role: "admin" } }) }));
vi.mock("@/components/entity-selector", async original => ({ ...await original<any>(), GuestSelector: ({ selectedGuest, onSelect, onClear }: any) => <div>
  <span>{selectedGuest?.firstName || "Sin selección"}</span>
  <button type="button" onClick={() => onSelect(next)}>Elegir titular correcto</button>
  {onClear && <button type="button" onClick={onClear}>Quitar selección</button>}
</div> }));
import { ReservationFormDialog } from "./reservations";
const guest: any = { id: "guest-original", firstName: "Original", lastName: "Prueba" };
const next: any = { id: "guest-correct", firstName: "Correcto", lastName: "Prueba", companyId: "otra-empresa" };
const room: any = { id: "room", roomNumber: "605", roomTypeId: "type", status: "occupied" };
const original: any = { id: "group-inhouse", groupId: "group-test", guestId: guest.id, guest, companyId: "empresa-original", roomId: room.id, room, roomTypeId: "type", ratePlanId: "plan", reservationCode: "GRP-TEST", status: "checked_in", checkInDate: "2026-11-25", checkOutDate: "2026-11-29", numberOfGuests: 2, nights: 4, pricingScheme: "nightly_v1", pricingRevision: 1, baseRatePerNight: "147000.00", finalRatePerNight: "147000.00", totalRoomAmount: "588000.00", discountType: "none", discountValue: "0", notes: "Nota original" };
let writes: { url: string; method: string; body: any }[], saved: any, rejectCorrection: boolean;
const onClose = vi.fn();
beforeEach(() => {
  queryClient.clear(); toast.mockReset(); onClose.mockReset(); writes = []; saved = { ...original }; rejectCorrection = false;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const response = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (method !== "GET") {
      const body = JSON.parse(String(init?.body)); writes.push({ url, method, body });
      if (url.endsWith("/holder-correction")) {
        if (rejectCorrection) return response({ error: "El titular cambió mientras tenías abierta la ventana." }, 409);
        saved = { ...saved, guestId: next.id, guest: next };
        return response({ reservationId: original.id, guestId: next.id });
      }
      saved = { ...saved, ...body }; return response(saved);
    }
    if (url.endsWith("/holder-correction")) return response({ reservationId: original.id, status: "checked_in", guest: saved.guest, groupLinked: true, companionCount: 1, canCorrect: true, blockers: [] });
    if (url.endsWith("/api/reservation-edit-permission")) return response({ canEdit: true });
    if (url.endsWith("/nightly-pricing")) return response({ reservation: saved, blocked: null, fiscal: { state: "pendiente", coveredCents: 0, pendingCents: 58800000 } });
    if (url.endsWith("/api/rate-plans")) return response([{ id: "plan", name: "BAR", roomTypeId: "type", baseRate: "147000.00", rate2pax: "147000.00" }]);
    return response([]);
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });
function mount(reservation = original) { render(<QueryClientProvider client={queryClient}><ReservationFormDialog reservation={reservation} guests={[guest, next]} rooms={[room]} roomTypes={[{ id: "type", name: "Ejecutiva" } as any]} open onOpenChange={onClose} onSuccess={vi.fn()} /></QueryClientProvider>); }
async function correct() {
  fireEvent.click(screen.getByTestId("button-edit-reservation-holder"));
  const dialog = await screen.findByRole("dialog", { name: "Cambiar titular de la estadía" });
  await within(dialog).findByText("Prueba Original");
  fireEvent.click(within(dialog).getByRole("button", { name: "Elegir titular correcto" }));
  fireEvent.change(within(dialog).getByLabelText("Motivo del cambio"), { target: { value: "Se verificó la identidad al ingreso" } });
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar cambio de titular" }));
  return dialog;
}
it("permite corregir al titular del grupo desde Editar Reserva sin guardar ni perder otros campos", async () => {
  mount(); fireEvent.change(screen.getByTestId("input-reservation-notes"), { target: { value: "Nota sin guardar" } });
  const dialog = await correct();
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(screen.getByTestId("input-reservation-notes")).toHaveValue("Nota sin guardar");
  expect(screen.getByTestId("reservation-current-holder")).toHaveTextContent("Prueba Correcto");
  expect(onClose).not.toHaveBeenCalled();
  expect(writes).toEqual([{ url: "/api/reservations/group-inhouse/holder-correction", method: "POST", body: { guestId: next.id, expectedGuestId: guest.id, reason: "Se verificó la identidad al ingreso", confirmed: true } }]);
  fireEvent.click(screen.getByTestId("button-submit-reservation"));
  await waitFor(() => expect(writes).toHaveLength(2));
  const patch = writes[1];
  expect(patch).toMatchObject({ method: "PATCH", body: { notes: "Nota sin guardar", companyId: "empresa-original" } });
  expect(patch.body).not.toHaveProperty("guestId");
  expect(patch.body).not.toHaveProperty("totalRoomAmount");
  expect(saved.guestId).toBe(next.id);
});
it("cancelar la corrección conserva el titular y las notas sin enviar cambios", async () => {
  mount(); fireEvent.change(screen.getByTestId("input-reservation-notes"), { target: { value: "Nota sin guardar" } });
  fireEvent.click(screen.getByTestId("button-edit-reservation-holder"));
  const dialog = await screen.findByRole("dialog", { name: "Cambiar titular de la estadía" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(screen.getByTestId("reservation-current-holder")).toHaveTextContent("Prueba Original");
  expect(screen.getByTestId("input-reservation-notes")).toHaveValue("Nota sin guardar");
  expect(writes).toHaveLength(0);
});
it("un rechazo conserva el formulario y no cambia al titular ni guarda otros datos", async () => {
  rejectCorrection = true; mount();
  const dialog = await correct();
  await within(dialog).findByText(/El titular cambió mientras/);
  expect(screen.getByTestId("reservation-current-holder")).toHaveTextContent("Prueba Original");
  expect(onClose).not.toHaveBeenCalled(); expect(writes).toHaveLength(1);
});
it("guardar notas de una reserva de grupo en casa no reenvía al titular antiguo", async () => {
  mount(); fireEvent.change(screen.getByTestId("input-reservation-notes"), { target: { value: "Recepción revisó la reserva" } });
  fireEvent.click(screen.getByTestId("button-submit-reservation"));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].body).not.toHaveProperty("guestId");
});
it.each([{ ...original, status: "confirmed" }, { ...original, groupId: undefined }])("conserva el selector habitual fuera de un grupo en casa", reservation => {
  mount(reservation);
  expect(screen.queryByTestId("button-edit-reservation-holder")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Quitar selección" })).toBeInTheDocument();
});
