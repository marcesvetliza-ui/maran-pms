import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { GroupOccupantDialog } from "./group-occupant-dialog";
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/queryClient", async () => ({
  ...(await vi.importActual<typeof import("@/lib/queryClient")>(
    "@/lib/queryClient",
  )),
  apiRequest,
}));
vi.mock("@/pages/guests", () => ({
  GuestFormDialog: ({ saveGuest, onSuccess }: any) => (
    <button
      onClick={async () => {
        const guest = await saveGuest({
          firstName: "Nueva",
          lastName: "Persona",
          documentNumber: "555",
          phone: "123",
        });
        onSuccess(guest.id);
      }}
    >
      Guardar ficha completa
    </button>
  ),
}));
const reservation = {
  id: "res",
  guestId: "original",
  guest: { codigo: "GROUP-group" },
  reservationCode: "GRP-1",
  room: { roomNumber: "201" },
} as any;
function setup(replacing = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onAssigned = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <GroupOccupantDialog
        groupId="group"
        reservation={
          replacing
            ? { ...reservation, guest: { codigo: "PERSON" } }
            : reservation
        }
        onClose={vi.fn()}
        onAssigned={onAssigned}
      />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onAssigned, client };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "existing",
          firstName: "Juan",
          lastName: "Pérez",
          documentNumber: "123456",
          active: true,
        },
      ],
    }),
  );
  apiRequest.mockImplementation(async (method) => ({
    json: async () =>
      method === "GET"
        ? {
            fingerprint: "checked",
            canReplace: true,
            replacementBlockers: [],
            personalAdvance: 0,
          }
        : { guest: { id: "created" } },
  }));
});
afterEach(() => vi.unstubAllGlobals());
describe("Selector de ocupante de grupo", () => {
  it("busca e identifica una ficha sin crear ni editar huéspedes", async () => {
    const { user, onAssigned } = setup();
    expect(
      screen.getByRole("button", { name: "Asignar huésped" }),
    ).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Buscar huésped" }),
      "Pérez",
    );
    await user.click(
      await screen.findByRole("button", { name: /Pérez, Juan/ }),
    );
    expect(screen.getByText(/123456/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Asignar huésped" }));
    await waitFor(() => expect(onAssigned).toHaveBeenCalledOnce());
    expect(apiRequest).toHaveBeenCalledWith(
      "PATCH",
      "/api/groups/group/reservations/res/occupant",
      {
        guestId: "existing",
        expectedGuestId: "original",
        fingerprint: "checked",
        confirmPersonalAdvances: false,
      },
    );
  });
  it("usa el alta completa y envía ficha y asignación en una operación", async () => {
    const { user, onAssigned } = setup();
    await user.click(screen.getByRole("button", { name: "Nuevo huésped" }));
    await user.click(
      screen.getByRole("button", { name: "Guardar ficha completa" }),
    );
    await waitFor(() => expect(onAssigned).toHaveBeenCalledOnce());
    expect(apiRequest).toHaveBeenCalledWith(
      "PATCH",
      "/api/groups/group/reservations/res/occupant",
      {
        expectedGuestId: "original",
        fingerprint: "checked",
        confirmPersonalAdvances: false,
        newGuest: {
          firstName: "Nueva",
          lastName: "Persona",
          documentNumber: "555",
          phone: "123",
        },
      },
    );
  });
  it("exige motivo y confirmación al reemplazar; conserva los pagos en el pedido", async () => {
    const { user, onAssigned } = setup(true);
    await user.type(
      screen.getByRole("textbox", { name: "Buscar huésped" }),
      "Juan",
    );
    await user.click(
      await screen.findByRole("button", { name: /Pérez, Juan/ }),
    );
    const submit = screen.getByRole("button", { name: "Reemplazar huésped" });
    expect(submit).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: "Motivo del reemplazo" }),
      "El pasajero original no viaja",
    );
    expect(submit).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", {
        name: /Confirmo que la estadía y sus pagos/,
      }),
    );
    expect(submit).toBeEnabled();
    await user.type(
      screen.getByRole("textbox", { name: "Motivo del reemplazo" }),
      ".",
    );
    expect(submit).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", {
        name: /Confirmo que la estadía y sus pagos/,
      }),
    );
    await user.click(submit);
    await waitFor(() => expect(onAssigned).toHaveBeenCalledOnce());
    expect(apiRequest).toHaveBeenCalledWith(
      "PATCH",
      "/api/groups/group/reservations/res/occupant",
      expect.objectContaining({
        guestId: "existing",
        reason: "El pasajero original no viaja.",
        confirmPreserveStay: true,
        fingerprint: "checked",
      }),
    );
  });
  it("exige confirmar otra vez cuando cambian la reserva o sus anticipos", async () => {
    const { user, client } = setup(true);
    await user.type(
      screen.getByRole("textbox", { name: "Buscar huésped" }),
      "Juan",
    );
    await user.click(
      await screen.findByRole("button", { name: /Pérez, Juan/ }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Motivo del reemplazo" }),
      "El pasajero original no viaja",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /Confirmo que la estadía y sus pagos/,
      }),
    );
    const submit = screen.getByRole("button", { name: "Reemplazar huésped" });
    expect(submit).toBeEnabled();
    apiRequest.mockImplementation(async () => ({
      json: async () => ({
        fingerprint: "changed",
        canReplace: true,
        replacementBlockers: [],
        personalAdvance: 0,
      }),
    }));
    await client.invalidateQueries({
      queryKey: ["/api/groups/group/reservations/res/assignment-preview"],
    });
    await waitFor(() => expect(submit).toBeDisabled());
    expect(
      screen.getByRole("checkbox", {
        name: /Confirmo que la estadía y sus pagos/,
      }),
    ).not.toBeChecked();
    expect(
      apiRequest.mock.calls.filter(([method]) => method === "PATCH"),
    ).toHaveLength(0);
  });
  it("conserva el motivo y la confirmación al dar de alta al reemplazo", async () => {
    const { user, onAssigned } = setup(true);
    await user.type(
      screen.getByRole("textbox", { name: "Motivo del reemplazo" }),
      "Se reemplaza porque no puede viajar",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /Confirmo que la estadía y sus pagos/,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Nuevo huésped" }));
    await user.click(
      screen.getByRole("button", { name: "Guardar ficha completa" }),
    );
    await waitFor(() => expect(onAssigned).toHaveBeenCalledOnce());
    expect(apiRequest).toHaveBeenCalledWith(
      "PATCH",
      "/api/groups/group/reservations/res/occupant",
      expect.objectContaining({
        newGuest: expect.objectContaining({ firstName: "Nueva" }),
        reason: "Se reemplaza porque no puede viajar",
        confirmPreserveStay: true,
      }),
    );
  });
  it("conserva el selector y muestra el error cuando la asignación falla", async () => {
    apiRequest.mockImplementation(async (method) => {
      if (method === "PATCH")
        throw new Error('409: {"error":"No se pudo asignar"}');
      return {
        json: async () => ({
          fingerprint: "checked",
          canReplace: true,
          replacementBlockers: [],
          personalAdvance: 0,
        }),
      };
    });
    const { user, onAssigned } = setup();
    await user.type(
      screen.getByRole("textbox", { name: "Buscar huésped" }),
      "Juan",
    );
    await user.click(
      await screen.findByRole("button", { name: /Pérez, Juan/ }),
    );
    await user.click(screen.getByRole("button", { name: "Asignar huésped" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo asignar",
    );
    expect(onAssigned).not.toHaveBeenCalled();
  });
});
