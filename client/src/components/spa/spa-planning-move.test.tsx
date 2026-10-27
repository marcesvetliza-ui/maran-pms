import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, it, expect, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import { useSpaPlanningMove } from "./use-spa-planning-move";
const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: notify }) }));
const appointment = {
  id: "a-1",
  cabinId: "c-1",
  treatmentId: "t-1",
  appointmentDate: "2095-01-10",
  startTime: "10:00",
  endTime: "11:00",
  status: "confirmed",
  guestName: "Ana",
};
function Harness({
  canEdit = true,
  circuit = false,
  status = "confirmed",
  resources = false,
}: {
  canEdit?: boolean;
  circuit?: boolean;
  status?: string;
  resources?: boolean;
}) {
  const move = useSpaPlanningMove({
    planningDate: appointment.appointmentDate,
    canEdit,
    isSimple: () => !circuit,
    cabinName: (id) => (id === "c-1" ? "Gabinete 1" : "Gabinete 2"),
  });
  return (
    <>
      <div
        data-testid="source"
        {...move.dragProps({
          ...appointment,
          status,
          resourceReservations: resources ? [{}] : [],
        })}
      >
        Turno
      </div>
      <div data-testid="target" {...move.dropProps("c-2", "12:00")}>
        Destino
      </div>
      {move.dialog}
    </>
  );
}
const transfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() };
function drop() {
  fireEvent.dragStart(screen.getByTestId("source"), {
    dataTransfer: transfer,
    clientX: 0,
  });
  fireEvent.dragOver(screen.getByTestId("target"), { dataTransfer: transfer });
  fireEvent.drop(screen.getByTestId("target"), {
    dataTransfer: transfer,
    clientX: 0,
  });
}
beforeEach(() => {
  queryClient.clear();
  notify.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
});
function show(props = {}) {
  render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}
it("confirma horario y gabinete, conserva duración y envía únicamente el movimiento", async () => {
  show();
  drop();
  expect(screen.getByText("De Gabinete 1 · 10:00–11:00")).toBeInTheDocument();
  expect(screen.getByText("A Gabinete 2 · 12:00–13:00")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar movimiento" }),
  );
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith({ title: "Turno reprogramado" }),
  );
  const [url, init] = (fetch as any).mock.calls[0];
  expect(url).toBe("/api/spa/appointments/a-1/move");
  expect(JSON.parse(init.body)).toEqual({
    cabinId: "c-2",
    startTime: "12:00",
    expected: {
      cabinId: "c-1",
      treatmentId: "t-1",
      appointmentDate: "2095-01-10",
      startTime: "10:00",
      endTime: "11:00",
      status: "confirmed",
    },
  });
});
it("cancelar no llama al servidor", async () => {
  show();
  drop();
  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("muestra conflicto sin cambiar el turno ni volver a guardar", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Gabinete ocupado" }), {
          status: 409,
        }),
    ),
  );
  show();
  drop();
  await userEvent.click(
    screen.getByRole("button", { name: "Confirmar movimiento" }),
  );
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith({
      title: "Gabinete ocupado",
      variant: "destructive",
    }),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("source")).toHaveTextContent("Turno");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it.each([
  { canEdit: false },
  { circuit: true },
  { resources: true },
  { status: "completed" },
  { status: "cancelled" },
  { status: "in_progress" },
  { status: "no_show" },
])("no arrastra un turno bloqueado %j", (props) => {
  show(props);
  expect(screen.getByTestId("source")).toHaveAttribute("draggable", "false");
  drop();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
