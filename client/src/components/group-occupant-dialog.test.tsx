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
  reservationCode: "GRP-1",
  room: { roomNumber: "201" },
} as any;
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onAssigned = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <GroupOccupantDialog
        groupId="group"
        reservation={reservation}
        onClose={vi.fn()}
        onAssigned={onAssigned}
      />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onAssigned };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
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
  apiRequest.mockResolvedValue({
    json: async () => ({ guest: { id: "created" } }),
  });
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
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      "PATCH",
      "/api/groups/group/reservations/res/occupant",
      { guestId: "existing" },
    );
  });
  it("usa el alta completa y envía ficha y asignación en una operación", async () => {
    const { user, onAssigned } = setup();
    await user.click(screen.getByRole("button", { name: "Nuevo huésped" }));
    await user.click(
      screen.getByRole("button", { name: "Guardar ficha completa" }),
    );
    await waitFor(() => expect(onAssigned).toHaveBeenCalledOnce());
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      "PATCH",
      "/api/groups/group/reservations/res/occupant",
      {
        newGuest: {
          firstName: "Nueva",
          lastName: "Persona",
          documentNumber: "555",
          phone: "123",
        },
      },
    );
  });
  it("conserva el selector y muestra el error cuando la asignación falla", async () => {
    apiRequest.mockRejectedValue(
      new Error('409: {"error":"No se pudo asignar"}'),
    );
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
