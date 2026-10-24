import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HousekeepingPlanningView } from "./housekeeping-planning";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { HousekeepingPlanning } from "@shared/housekeepingPlanning";
vi.mock("@/lib/queryClient", async (original) => ({
  ...(await original<typeof import("@/lib/queryClient")>()),
  apiRequest: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const future = "2095-02-02";
let mode: "past" | "today" | "future" = "future";
const request = {
  id: "reservation",
  roomId: "room",
  reservationCode: "TEST-ONLY",
  guestName: "Huésped de prueba",
  checkIn: future,
  checkOut: "2095-02-05",
  status: "confirmed",
  bedTypeId: "twn",
  bedTypeCode: "TWN",
  bedTypeName: "Twin",
  bedTypeNotes: null,
  numberOfGuests: 2,
  comparison: "different" as const,
  bedPreparation: null,
  preparationCurrent: false,
  noMove: {
    roomId: "room",
    state: "prepared" as const,
    note: "Cuna preparada",
    markedAt: "2095-02-01T12:00:00Z",
    markedBy: "Ana",
  },
  observations: [],
};
const fixture: HousekeepingPlanning = {
  date: future,
  today: "2026-10-21",
  mode: "future",
  asOf: "2026-10-21T14:00:00Z",
  totals: { arrivals: 1, departures: 0, stays: 0, tasks: 1, completed: 1 },
  unassigned: [],
  rooms: [
    {
      id: "room",
      roomNumber: "201",
      floor: 2,
      active: true,
      currentStatus: "dirty",
      currentBed: "MAT",
      currentBedRevision: 2,
      allowedBeds: ["MAT", "TWIN"],
      requests: [request],
      tasks: [
        {
          id: "task",
          roomId: "room",
          roomNumber: "201",
          taskType: "deep_clean",
          status: "completed",
          priority: "normal",
          assignedTo: "worker",
          staffName: "Mucama de prueba",
          notes: "Trabajo registrado",
          scheduledDate: future,
          startedAt: "2026-10-22T02:55:00Z",
          completedAt: "2026-10-22T03:05:12Z",
          inspectedAt: null,
        },
      ],
    },
  ],
};
beforeEach(() => {
  queryClient.clear();
  mode = "future";
  vi.mocked(apiRequest)
    .mockReset()
    .mockImplementation(
      async (method) =>
        new Response(
          JSON.stringify(method === "GET" ? { ...fixture, mode } : {}),
          { headers: { "Content-Type": "application/json" } },
        ),
    );
});
async function setup(callback = vi.fn()) {
  render(
    <QueryClientProvider client={queryClient}>
      <HousekeepingPlanningView onCreateTask={callback} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Fecha de planificación"), {
    target: { value: future },
  });
  await screen.findByRole("region", { name: "Habitación 201" });
  return callback;
}
describe("Planificación de Housekeeping", () => {
  it("separates future work from current physical state and preserves No mover", async () => {
    await setup();
    expect(await screen.findByText(/Trabajo previsto/)).toBeInTheDocument();
    expect(screen.getByText("Situación actual: Sucia")).toBeInTheDocument();
    expect(screen.getByText("Requiere cambio de camaje.")).toBeInTheDocument();
    expect(screen.getByText(/Limpia — No mover/)).toHaveTextContent(
      "Cuna preparada",
    );
    expect(screen.getByText(/10 min 12 s/)).toBeInTheDocument();
  });
  it("opens bulk scheduling once with the selected date", async () => {
    const callback = await setup();
    fireEvent.click(screen.getByRole("button", { name: "Crear y asignar tareas" }));
    expect(callback).toHaveBeenCalledWith(null, future);
  });
  it("shows historical records with no preparation or scheduling actions", async () => {
    mode = "past";
    await setup();
    expect(
      await screen.findByText(/Consulta de tareas registradas/),
    ).toBeInTheDocument();
    expect(screen.getByText(/no reconstruyen cómo estaba/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Crear y asignar tareas" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Confirmar camaje preparado" }),
    ).not.toBeInTheDocument();
  });
  it("confirms actual bed with stale-data checks without writing No mover or cleaning state", async () => {
    await setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar camaje preparado" }),
    );
    fireEvent.change(screen.getByLabelText("Camaje realmente preparado"), {
      target: { value: "TWIN" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Revisé el pedido/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar preparación realizada" }),
    );
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "POST",
        "/api/housekeeping/planning/reservation/bed-preparation",
        {
          acknowledgeRequest: true,
          roomId: "room",
          bedConfig: "TWIN",
          expectedCurrentBedConfig: "MAT",
          expectedBedConfigRevision: 2,
          expectedBedTypeId: "twn",
          expectedBedTypeNotes: null,
        },
      ),
    );
  });
  it("cancel leaves both the room and preparation unchanged", async () => {
    await setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar camaje preparado" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Cancelar" }),
    );
    expect(
      vi.mocked(apiRequest).mock.calls.every(([method]) => method === "GET"),
    ).toBe(true);
  });
});

it("edits only pending tasks from their planning card", async () => {
  const edit = vi.fn();
  const pending = {...fixture.rooms[0].tasks[0], id:"pending-task", status:"pending", priority:"high"};
  vi.mocked(apiRequest).mockImplementation(async () => new Response(JSON.stringify({...fixture, rooms:[{...fixture.rooms[0],tasks:[pending, fixture.rooms[0].tasks[0]]}]})));
  render(<QueryClientProvider client={queryClient}><HousekeepingPlanningView onCreateTask={vi.fn()} onEditTask={edit}/></QueryClientProvider>);
  const button = await screen.findByRole("button", {name:"Editar o reasignar tarea"});
  expect(screen.getAllByRole("button", {name:"Editar o reasignar tarea"})).toHaveLength(1);
  expect(screen.getByText(/Prioridad Alta/)).toBeInTheDocument();
  fireEvent.click(button);
  expect(edit).toHaveBeenCalledWith(pending);
});

it("shows late checkout time as a forecast and refreshes changed times", async () => {
  let time="15:00";
  vi.mocked(apiRequest).mockImplementation(async ()=> new Response(JSON.stringify({...fixture, rooms:[{...fixture.rooms[0],requests:[{...request,checkOut:future,lateCheckOut:true,lateCheckOutTime:time}]}]})));
  await setup();
  expect(screen.getByText(/Late check-out · 15:00/)).toBeInTheDocument();
  expect(screen.getByText(/no libera la habitación hasta el checkout efectivo/)).toBeInTheDocument();
  time="16:00";
  await queryClient.invalidateQueries({queryKey:["/api/housekeeping/planning"]});
  expect(await screen.findByText(/Late check-out · 16:00/)).toBeInTheDocument();
});
