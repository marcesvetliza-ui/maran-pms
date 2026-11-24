import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import { ReservationHolderCorrection } from "./reservation-holder-correction";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("./entity-selector", () => ({
  GuestSelector: ({ onSelect, onCreateNew, selectedGuest }: any) => (
    <div>
      <p>{selectedGuest?.firstName || "Sin selección"}</p>
      <button
        onClick={() =>
          onSelect({ id: "new", firstName: "Correcto", lastName: "Prueba" })
        }
      >
        Elegir huésped correcto
      </button>
      <button
        onClick={() =>
          onSelect({ id: "old", firstName: "Original", lastName: "Prueba" })
        }
      >
        Elegir titular actual
      </button>
      <button
        onClick={() => onCreateNew({ firstName: "Creado", lastName: "Prueba" })}
      >
        Crear ficha
      </button>
    </div>
  ),
}));
let writes: { path: string; body: any }[],
  blocked: boolean,
  rejectSave: boolean;
beforeEach(() => {
  queryClient.clear();
  writes = [];
  blocked = false;
  rejectSave = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      const response = (body: any, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (init?.method === "POST") {
        writes.push({ path, body: JSON.parse(String(init.body)) });
        if (path === "/api/guests")
          return response({
            id: "created",
            firstName: "Creado",
            lastName: "Prueba",
          });
        return rejectSave
          ? response(
              {
                error: "El titular cambió mientras tenías abierta la ventana.",
              },
              409,
            )
          : response({ reservationId: "reservation", guestId: "new" });
      }
      return response({
        reservationId: "reservation",
        status: "checked_in",
        guest: { id: "old", firstName: "Original", lastName: "Prueba" },
        groupLinked: true,
        companionCount: 0,
        canCorrect: !blocked,
        blockers: blocked ? ["Hay una operación fiscal en curso."] : [],
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});
function show() {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ReservationHolderCorrection
        reservationId="reservation"
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return onClose;
}
it("requires a different guest, reason and explicit confirmation, then sends only a correction and refreshes the reservation views", async () => {
  const onClose = show(),
    user = userEvent.setup();
  await screen.findByText("Prueba Original");
  const save = screen.getByRole("button", {
    name: "Confirmar cambio de titular",
  });
  expect(save).toBeDisabled();
  expect(writes).toHaveLength(0);
  await user.click(
    screen.getByRole("button", { name: "Elegir titular actual" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("persona distinta");
  await user.click(
    screen.getByRole("button", { name: "Elegir huésped correcto" }),
  );
  await user.type(
    screen.getByLabelText("Motivo del cambio"),
    "Otra persona se alojó desde el ingreso.",
  );
  expect(save).toBeDisabled();
  await user.click(screen.getByRole("checkbox"));
  expect(save).toBeEnabled();
  await user.click(save);
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(writes).toEqual([
    {
      path: "/api/reservations/reservation/holder-correction",
      body: {
        guestId: "new",
        expectedGuestId: "old",
        reason: "Otra persona se alojó desde el ingreso.",
        confirmed: true,
      },
    },
  ]);
});
it("resets confirmation when the reason changes and retains the original holder on rejection", async () => {
  rejectSave = true;
  const onClose = show(),
    user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Elegir huésped correcto" }),
  );
  const reason = screen.getByLabelText("Motivo del cambio");
  await user.type(reason, "Error al registrar el ingreso.");
  await user.click(screen.getByRole("checkbox"));
  await user.type(reason, " Se verificó la identidad.");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Confirmar cambio de titular" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "El titular cambió",
  );
  expect(screen.getByText("Prueba Original")).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});
it("blocks unavailable corrections without offering a guest change", async () => {
  blocked = true;
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "operación fiscal",
  );
  expect(
    screen.queryByRole("button", { name: "Elegir huésped correcto" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Confirmar cambio de titular" }),
  ).toBeDisabled();
  expect(writes).toHaveLength(0);
});
it("can create a separate guest profile without editing the original or changing the reservation before confirmation", async () => {
  show();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Crear ficha" }));
  await screen.findByText("Creado");
  expect(writes).toEqual([
    { path: "/api/guests", body: { firstName: "Creado", lastName: "Prueba" } },
  ]);
  expect(
    screen.getByRole("button", { name: "Confirmar cambio de titular" }),
  ).toBeDisabled();
});
