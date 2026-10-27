import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HousekeepingTaskManager } from "./housekeeping-task-manager";
import { apiRequest, queryClient } from "@/lib/queryClient";
vi.mock("@/lib/queryClient", async (original) => ({
  ...(await original<typeof import("@/lib/queryClient")>()),
  apiRequest: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const rooms: any = [
  {
    id: "r1",
    roomNumber: "201",
    floor: 2,
    isActive: true,
    isVirtual: false,
    status: "available",
  },
  {
    id: "r2",
    roomNumber: "301",
    floor: 3,
    isActive: true,
    isVirtual: false,
    status: "dirty",
  },
];
const staff = [{ id: "worker", fullName: "Mucama de prueba" }],
  initial: string[] = [];
let tasks: any[] = [];
function Harness({initialDate, roomIds=initial, initialTask}:{initialDate?:string; roomIds?:string[]; initialTask?:any}={}) {
  const [open, setOpen] = useState(false);
  return (
    <QueryClientProvider client={queryClient}>
      <HousekeepingTaskManager
        rooms={rooms}
        staff={staff}
        open={open}
        onOpenChange={setOpen}
        initialRoomIds={roomIds}
        initialTask={initialTask}
        initialDate={initialDate}
      />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  queryClient.clear();
  tasks = [];
  vi.mocked(apiRequest)
    .mockReset()
    .mockImplementation(
      async (method) =>
        new Response(JSON.stringify(method === "GET" ? tasks : []), {
          status: method === "GET" ? 200 : 201,
          headers: { "Content-Type": "application/json" },
        }),
    );
});
describe("Creación y asignación de tareas", () => {
  it("envía habitaciones, fecha, responsable e instrucciones en una sola operación", async () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Crear y asignar tareas" }),
    );
    expect(
      screen.getByRole("button", { name: "Crear 0 tareas" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar las visibles" }),
    );
    fireEvent.change(screen.getByLabelText("Fecha de la tarea"), {
      target: { value: "2090-02-03" },
    });
    fireEvent.change(screen.getByLabelText("Responsable"), {
      target: { value: "worker" },
    });
    fireEvent.change(screen.getByLabelText("Instrucciones"), {
      target: { value: "Preparar ambas habitaciones" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear 2 tareas" }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "POST",
        "/api/housekeeping/bulk",
        expect.objectContaining({
          roomIds: ["r1", "r2"],
          scheduledDate: "2090-02-03",
          assignedTo: "worker",
          notes: "Preparar ambas habitaciones",
        }),
      ),
    );
  });
  it("cancelar no crea tareas y una nueva apertura no conserva la selección anterior", () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Crear y asignar tareas" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar las visibles" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      vi.mocked(apiRequest).mock.calls.every(([method]) => method === "GET"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Crear y asignar tareas" }),
    );
    expect(
      screen.getByRole("button", { name: "Crear 0 tareas" }),
    ).toBeDisabled();
  });
  it("edita una tarea pendiente sin recrearla ni perder sus datos", async () => {
    tasks = [
      {
        id: "task",
        roomId: "r1",
        room: rooms[0],
        status: "pending",
        taskType: "stayover_clean",
        priority: "high",
        scheduledDate: "2090-03-01",
        assignedTo: "worker",
        notes: "Conservar instrucciones",
      },
    ];
    render(<Harness />);
    fireEvent.click(screen.getByText("Consultar o reasignar tareas"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Editar o reasignar" }),
    );
    expect(screen.getByLabelText("Instrucciones")).toHaveValue(
      "Conservar instrucciones",
    );
    expect(screen.getByLabelText("Responsable")).toHaveValue("worker");
    fireEvent.click(screen.getByRole("button", { name: "Guardar tarea" }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "PATCH",
        "/api/housekeeping/task",
        expect.objectContaining({
          notes: "Conservar instrucciones",
          assignedTo: "worker",
        }),
      ),
    );
  });
  it("conserva el formulario y muestra el error legible cuando no se guarda", async () => {
    vi.mocked(apiRequest).mockImplementation(async (method) => {
      if (method === "POST")
        throw new Error('409: {"error":"Ya existe una tarea pendiente"}');
      return new Response("[]");
    });
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Crear y asignar tareas" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Seleccionar las visibles" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Crear 2 tareas" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya existe una tarea pendiente",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("solicita confirmación antes de registrar la verificación", async () => {
    tasks = [
      {
        id: "finished",
        roomId: "r1",
        room: rooms[0],
        status: "completed",
        taskType: "stayover_clean",
        priority: "normal",
        scheduledDate: "2026-10-20",
        assignedTo: "worker",
      },
    ];
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    try {
      render(<Harness />);
      fireEvent.click(screen.getByText("Consultar o reasignar tareas"));
      fireEvent.click(
        await screen.findByRole("button", { name: "Verificar habitación" }),
      );
      expect(
        vi
          .mocked(apiRequest)
          .mock.calls.some(([, path]) => path.endsWith("/inspect")),
      ).toBe(false);
      fireEvent.click(
        screen.getByRole("button", { name: "Verificar habitación" }),
      );
      await waitFor(() =>
        expect(apiRequest).toHaveBeenCalledWith(
          "POST",
          "/api/housekeeping/finished/inspect",
        ),
      );
    } finally {
      confirm.mockRestore();
    }
  });  it("uses the date selected in the planning view for a new task", () => {
    render(<Harness initialDate="2095-02-02"/>);
    fireEvent.click(screen.getByRole("button",{name:"Crear y asignar tareas"}));
    expect(screen.getByLabelText("Fecha de la tarea")).toHaveValue("2095-02-02");
  });

});

it("advierte franco al asignar sin ocultar la excepción", async () => {
  vi.mocked(apiRequest).mockImplementation(async (method, url) => new Response(JSON.stringify(String(url).includes('/availability?') ? [{userId:'worker',fullName:'Mucama de prueba',status:'day_off',shift:null,startTime:null,endTime:null,notes:'Franco acordado'}] : method==='GET' ? tasks : []),{status:200}));
  render(<Harness />);
  fireEvent.click(screen.getByRole('button',{name:'Crear y asignar tareas'}));
  await screen.findByRole('option',{name:/Mucama de prueba · Franco/});
  fireEvent.change(screen.getByLabelText('Responsable'),{target:{value:'worker'}});
  expect(screen.getByRole('alert')).toHaveTextContent('Franco');
  expect(screen.getByRole('alert')).toHaveTextContent('Franco acordado');
});

it("individual entry fixes the room and cannot add another room", async () => {
  render(<Harness roomIds={["r1"]} initialDate="2095-02-02" />);
  fireEvent.click(screen.getByRole("button", {name:"Crear y asignar tareas"}));
  expect(screen.getByRole("dialog")).toHaveTextContent("Crear tarea para esta habitación");
  expect(screen.queryByLabelText("Buscar habitación o piso")).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.getByRole("dialog")).toHaveTextContent("Hab. 201");
  expect(screen.getByRole("dialog")).not.toHaveTextContent("Hab. 301");
  fireEvent.click(screen.getByRole("button", {name:"Crear tarea"}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("POST", "/api/housekeeping/bulk", expect.objectContaining({roomIds:["r1"], scheduledDate:"2095-02-02"})));
});
it("opens an existing planning task with its values and updates its identity", async () => {
  render(<Harness initialTask={{id:"existing",roomId:"r2",scheduledDate:"2095-02-02",assignedTo:"worker",taskType:"deep_clean",priority:"urgent",notes:"Desde planificación"}} />);
  fireEvent.click(screen.getByRole("button", {name:"Crear y asignar tareas"}));
  expect(screen.getByLabelText("Instrucciones")).toHaveValue("Desde planificación");
  expect(screen.getByLabelText("Tipo de tarea")).toHaveValue("deep_clean");
  expect(screen.getByLabelText("Prioridad")).toHaveValue("urgent");
  fireEvent.click(screen.getByRole("button", {name:"Guardar tarea"}));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("PATCH", "/api/housekeeping/existing", expect.objectContaining({scheduledDate:"2095-02-02",priority:"urgent"})));
  expect(vi.mocked(apiRequest).mock.calls.some(([method])=>method==="POST")).toBe(false);
});
