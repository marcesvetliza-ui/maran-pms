import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import type { RoomWithType } from "@shared/schema";
import { HousekeepingShift } from "./housekeeping-shift";
import { apiRequest, queryClient } from "@/lib/queryClient";

const state = vi.hoisted(() => ({
  today: "2026-06-18",
  staff: [
    { id: "staff-ana", fullName: "Ana Pérez", role: "housekeeping", kind: "permanent", serviceDate: null, source: "operational" },
    { id: "staff-luz", fullName: "Luz Díaz", role: "housekeeping", kind: "extra", serviceDate: "2026-06-18", source: "operational" },
  ] as Array<Record<string, unknown>>,
  tasks: [] as Array<Record<string, any>>,
}));

vi.mock("@/lib/date-utils", () => ({
  getArgentinaToday: () => state.today,
}));
vi.mock("@/lib/queryClient", async (original) => ({
  ...(await original<typeof import("@/lib/queryClient")>()),
  apiRequest: vi.fn(),
}));

function response(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeTask(id: string, roomNumber: string, assignedTo: string) {
  const roomId = `room-${roomNumber}`;
  return {
    id,
    roomId,
    taskType: "checkout_clean",
    priority: "normal",
    status: "pending",
    scheduledDate: state.today,
    assignedTo,
    notes: null,
    startedAt: null,
    completedAt: null,
    inspectedBy: null,
    inspectedAt: null,
    createdAt: new Date("2026-06-18T09:00:00.000Z"),
    room: { id: roomId, roomNumber, status: "dirty", housekeepingServiceDate: null },
  };
}

function room(roomNumber: string) {
  return {
    id: `room-${roomNumber}`,
    roomNumber,
    status: "dirty",
    housekeepingServiceDate: null,
  } as unknown as RoomWithType;
}

function mount(rooms: RoomWithType[]) {
  render(
    <QueryClientProvider client={queryClient}>
      <HousekeepingShift rooms={rooms} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient.clear();
  state.today = "2026-06-18";
  state.staff = [
    { id: "staff-ana", fullName: "Ana Pérez", role: "housekeeping", kind: "permanent", serviceDate: null, source: "operational" },
    { id: "staff-luz", fullName: "Luz Díaz", role: "housekeeping", kind: "extra", serviceDate: "2026-06-18", source: "operational" },
  ];
  state.tasks = [];
  vi.mocked(apiRequest).mockReset().mockImplementation(async (method, url, body) => {
    if (method === "POST" && url.includes("/finish-turn")) {
      const id = url.split("/").at(-2);
      state.tasks = state.tasks.map((task) =>
        task.id === id ? { ...task, status: "completed" } : task,
      );
      return new Response(null, { status: 200 });
    }
    if (url.startsWith("/api/housekeeping/staff/expired")) return response([]);
    const queryDate=url.split("date=")[1];
    const eligibleStaff=state.staff.filter(person=>person.kind==="permanent"||person.serviceDate===queryDate);
    if (url.startsWith("/api/housekeeping/staff?")) return response(eligibleStaff);
    if (url.startsWith("/api/housekeeping/availability?")) {
      return response(
        eligibleStaff.map((person) => ({
          userId: person.id,
          fullName: person.fullName,
          status: "working",
          shift: null,
          startTime: null,
          endTime: null,
          notes: "",
          taskCount: 0,
          kind: person.kind,
          serviceDate: person.serviceDate,
          source: person.source,
        })),
      );
    }
    if (url.startsWith("/api/housekeeping?")) return response(state.tasks);
    return response({ body });
  });
});

it("filters room assignment rows by selected person", async () => {
  const user = userEvent.setup();
  state.tasks = [
    makeTask("task-101", "101", "staff-ana"),
    makeTask("task-202", "202", "staff-luz"),
  ];
  mount([room("101"), room("202")]);

  const filter = await screen.findByRole("combobox", {
    name: "Filtrar habitaciones",
  });
  await user.click(filter);
  await user.click(await screen.findByRole("option", { name: "Luz Díaz" }));

  expect(screen.queryByRole("combobox", { name: "Asignar habitación 101" })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Asignar habitación 202" })).toBeInTheDocument();
});

it("finishes an active assignment, hides its completed pill, and sends the historical assignee", async () => {
  const user = userEvent.setup();
  state.tasks = [makeTask("task-101", "101", "staff-ana")];
  mount([room("101")]);

  await user.click(await screen.findByRole("button", { name: "Terminar" }));

  await waitFor(() =>
    expect(apiRequest).toHaveBeenCalledWith(
      "POST",
      "/api/housekeeping/task-101/finish-turn",
      { expectedAssignedTo: "staff-ana" },
    ),
  );
  await waitFor(() =>
    expect(screen.getAllByText("0 asignadas")).toHaveLength(2),
  );
  expect(state.tasks[0].status).toBe("completed");
  expect(state.tasks[0].assignedTo).toBe("staff-ana");
});

it("moves the active date to the next Argentina day on focus after midnight", async () => {
  mount([]);
  const availabilityDate = await screen.findByLabelText("Fecha de disponibilidad");
  expect(availabilityDate).toHaveValue("2026-06-18");

  state.today = "2026-06-19";
  fireEvent.focus(window);

  await waitFor(() =>
    expect(screen.getByLabelText("Fecha de disponibilidad")).toHaveValue("2026-06-19"),
  );
  expect(apiRequest).toHaveBeenCalledWith(
    "GET",
    "/api/housekeeping/availability?date=2026-06-19",
  );
  await waitFor(()=>expect(screen.queryByRole("heading",{name:"Luz Díaz"})).not.toBeInTheDocument());
  expect(state.staff.find(person=>person.id==="staff-luz")).toBeTruthy();
});
