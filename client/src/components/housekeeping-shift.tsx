import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Clock3, Users } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { HousekeepingTaskWithRoom, RoomWithType } from "@shared/schema";
import type { ExpiredShiftStaff, ShiftStaff } from "@shared/housekeepingShift";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { isOperationalInventoryRoom } from "@shared/room-availability";
import { hasDailyHousekeepingPending } from "@shared/housekeepingService";
import { useHousekeepingDay } from "@/hooks/use-housekeeping-day";
import { HousekeepingStaffAvailability } from "@/components/housekeeping-staff-availability";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ShiftTask = HousekeepingTaskWithRoom & {
  expiredStaff?: ExpiredShiftStaff | string | null;
};
type FilterValue = "all" | "unassigned" | string;

const activeStatus = (status: string) =>
  status === "pending" || status === "in_progress";
const cleaningTaskTypes = new Set([
  "checkout_clean",
  "stayover_clean",
  "deep_clean",
  "turndown",
]);
const isCleaningTask = (task: ShiftTask) =>
  cleaningTaskTypes.has(task.taskType);
const roomStatusLabel: Record<string, string> = {
  dirty: "Sucia",
  cleaning: "Limpiando",
  occupied: "Ocupada",
};
const roomStatusStyle: Record<string, string> = {
  dirty: "bg-amber-100 text-amber-900",
  cleaning: "bg-sky-100 text-sky-900",
  occupied: "bg-primary/10 text-primary",
};
const taskTypeLabels: Record<string, string> = {
  checkout_clean: "Limpieza de checkout",
  stayover_clean: "Limpieza de estadía",
  deep_clean: "Limpieza profunda",
  turndown: "Turno noche",
  inspection: "Inspección",
  maintenance_prep: "Preparación de mantenimiento",
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

function expiredName(task: ShiftTask, expired: ExpiredShiftStaff[]) {
  const reference = task.expiredStaff;
  if (typeof reference === "string") return reference;
  if (reference && typeof reference === "object" && "fullName" in reference) {
    return reference.fullName;
  }
  return expired.find((person) => person.id === task.assignedTo)?.fullName;
}

export function HousekeepingShift({ rooms }: { rooms: RoomWithType[] }) {
  const today = useHousekeepingDay();
  const [date, setDate] = useState(today);
  const [followsToday, setFollowsToday] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [mutationError, setMutationError] = useState("");

  useEffect(() => {
    if (followsToday) setDate(today);
  }, [today, followsToday]);

  const tasksQuery = useQuery<ShiftTask[]>({
    queryKey: ["/api/housekeeping", date, "includeActive"],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/housekeeping?date=${encodeURIComponent(date)}&includeActive=true`,
      ).then((response) => response.json()),
    refetchInterval: 30000,
  });
  const staffQuery = useQuery<ShiftStaff[]>({
    queryKey: ["/api/housekeeping/staff", date],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/housekeeping/staff?date=${encodeURIComponent(date)}`,
      ).then((response) => response.json()),
    refetchInterval: 30000,
  });
  const expiredQuery = useQuery<ExpiredShiftStaff[]>({
    queryKey: ["/api/housekeeping/staff/expired", date],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/housekeeping/staff/expired?date=${encodeURIComponent(date)}`,
      ).then((response) => response.json()),
    refetchInterval: 30000,
  });

  const invalidateShiftData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/planning"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/housekeeping/staff/expired"] }),
      queryClient.invalidateQueries({
        queryKey: ["/api/housekeeping/planning"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["/api/housekeeping/availability"],
      }),
    ]);
  };
  const assign = useMutation({
    mutationFn: async ({
      roomId,
      assignedTo,
    }: {
      roomId: string;
      assignedTo: string | null;
    }) =>
      apiRequest("POST", "/api/housekeeping/assign", {
        roomId,
        assignedTo,
        date,
      }),
    onMutate: () => setMutationError(""),
    onSuccess: invalidateShiftData,
    onError: (error) => setMutationError(parseApiError(error)),
  });
  const finish = useMutation({
    mutationFn: async (task: ShiftTask) => {
      if (!task.assignedTo) throw new Error("La tarea ya no tiene personal asignado.");
      return apiRequest(
        "POST",
        `/api/housekeeping/${encodeURIComponent(task.id)}/finish-turn`,
        { expectedAssignedTo: task.assignedTo },
      );
    },
    onMutate: () => setMutationError(""),
    onSuccess: invalidateShiftData,
    onError: (error) => setMutationError(parseApiError(error)),
  });
  const saving = assign.isPending || finish.isPending;

  const tasks = useMemo(
    () => (tasksQuery.data ?? []).filter((task) => activeStatus(task.status)),
    [tasksQuery.data],
  );
  const staff = staffQuery.data ?? [];
  const expired = expiredQuery.data ?? [];
  const eligibleRooms = useMemo(
    () =>
      rooms
        .filter((room) => isOperationalInventoryRoom(room) &&
          (["dirty", "cleaning", "occupied"].includes(room.status) || tasks.some(task=>task.roomId===room.id)))
        .sort((a, b) =>
          a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
        ),
    [rooms,tasks],
  );
  const currentTaskForRoom = (roomId: string) =>
    tasks.find((task) => task.roomId === roomId && task.status==="in_progress") ??
    tasks.find((task) => task.roomId === roomId && isCleaningTask(task)) ??
    tasks.find((task) => task.roomId === roomId);
  const expiredTasks = tasks.filter(
    (task) =>
      task.assignedTo &&
      !staff.some((person) => person.id === task.assignedTo) &&
      Boolean(expiredName(task, expired)),
  );
  const rosterTasks = (staffId: string) =>
    tasks.filter(
      (task) =>
        task.assignedTo === staffId &&
        !expiredTasks.some((expiredTask) => expiredTask.id === task.id),
    );
  const visibleRooms = eligibleRooms.filter((room) => {
    const task = currentTaskForRoom(room.id);
    if (filter === "unassigned") return !task?.assignedTo;
    if (filter === "all") return true;
    return task?.assignedTo === filter;
  });
  const canFinish = (task: ShiftTask) =>
    date <= today && task.scheduledDate <= today && Boolean(task.assignedTo);
  const handleDateChange = (nextDate: string) => {
    setDate(nextDate);
    setFollowsToday(nextDate === today);
    setFilter("all");
  };

  return (
    <div className="space-y-4">
      <HousekeepingStaffAvailability
        date={date}
        onDateChange={handleDateChange}
      />
      <section className="space-y-4" aria-labelledby="housekeeping-shift-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <ClipboardList className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Operación diaria
            </span>
          </div>
          <h2 id="housekeeping-shift-heading" className="mt-1 text-lg font-semibold">
            Asignación de habitaciones
          </h2>
        </div>
        {date !== today && (
          <Button
            variant="outline"
            className="h-10"
            onClick={() => handleDateChange(today)}
          >
            Hoy
          </Button>
        )}
      </div>

      {(tasksQuery.isError || staffQuery.isError || expiredQuery.isError) && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
        >
          <span>No se pudo cargar toda la información del turno.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void tasksQuery.refetch();
              void staffQuery.refetch();
              void expiredQuery.refetch();
            }}
          >
            Reintentar
          </Button>
        </div>
      )}
      {mutationError && (
        <p role="alert" className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {mutationError}
        </p>
      )}

      {expiredTasks.length > 0 && (
        <aside className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
          <div className="flex items-start gap-2">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                Personal extra de jornadas anteriores · {expiredTasks.length}{" "}
                {expiredTasks.length === 1 ? "tarea pendiente" : "tareas pendientes"}
              </p>
              <ul className="mt-2 space-y-2">
                {expiredTasks.map((task) => {
                  const name = expiredName(task, expired) ?? "Personal anterior";
                  const allowed = canFinish(task) && isCleaningTask(task);
                  return (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200 pt-2 text-sm"
                    >
                      <span>
                        Hab. {task.room?.roomNumber} · {name}
                        {task.scheduledDate < today ? " · jornada anterior" : ""}
                      </span>
                      {allowed && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-amber-400 bg-amber-50"
                          disabled={saving}
                          onClick={() => finish.mutate(task)}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          Terminar
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </aside>
      )}

      {tasksQuery.isLoading || staffQuery.isLoading ? (
        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border p-4">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-14 animate-pulse rounded-md bg-muted/70" />
              ))}
            </div>
          </div>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="h-5 w-48 animate-pulse rounded bg-muted" />
            <div className="grid gap-2 md:grid-cols-2">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="h-14 animate-pulse rounded-md bg-muted/70" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Personal del turno</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                {staff.length} {staff.length === 1 ? "persona" : "personas"}
              </span>
            </div>
            <div className="grid gap-2 p-2 sm:grid-cols-2 xl:grid-cols-3">
              {staff.length === 0 ? (
                <div className="px-4 py-8 text-center sm:col-span-2 xl:col-span-3">
                  <Users className="mx-auto h-6 w-6 text-muted-foreground/70" />
                  <p className="mt-2 text-sm font-medium">Todavía no hay personal</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Agregá personal desde Disponibilidad para comenzar a asignar.
                  </p>
                </div>
              ) : (
                staff.map((person) => {
                  const personTasks = rosterTasks(person.id);
                  return (
                    <article key={person.id} className="rounded-md border px-3 py-2.5">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(person.fullName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <h4 className="truncate text-sm font-semibold">
                              {person.fullName}
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              {personTasks.length} asignada{personTasks.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {person.kind === "extra" ? "Personal extra" : "Personal fijo"}
                          </p>
                          {personTasks.length > 0 && (
                            <ul className="mt-2 space-y-1.5">
                              {personTasks.map((task) => (
                                <li
                                  key={task.id}
                                  className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-2"
                                >
                                  <span className="min-w-0 text-xs font-medium">
                                    Hab. {task.room?.roomNumber}
                                    <span className="ml-1.5 font-normal text-muted-foreground">
                                      · {taskTypeLabels[task.taskType] ?? task.taskType}
                                      {task.status === "in_progress" ? " · En curso" : ""}
                                    </span>
                                  </span>
                                  {isCleaningTask(task) ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 shrink-0 px-2.5"
                                      disabled={saving || !canFinish(task)}
                                      title={
                                        date > today
                                          ? "Las tareas futuras no se pueden terminar"
                                          : undefined
                                      }
                                      onClick={() => finish.mutate(task)}
                                    >
                                      <Check className="mr-1 h-3.5 w-3.5" />
                                      Terminar
                                    </Button>
                                  ) : (
                                    <span className="shrink-0 text-[11px] text-muted-foreground">
                                      No se finaliza en Turno
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">Habitaciones del turno</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Asigná una persona o dejá la habitación sin asignar.
                </p>
              </div>
              <Select value={filter} onValueChange={(value) => setFilter(value)}>
                <SelectTrigger aria-label="Filtrar habitaciones" className="h-9 w-[190px] bg-background text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo el personal</SelectItem>
                  <SelectItem value="unassigned">Sin asignar</SelectItem>
                  {staff.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {eligibleRooms.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <ClipboardList className="mx-auto h-6 w-6 text-muted-foreground/70" />
                <p className="mt-2 text-sm font-medium">No hay habitaciones para asignar</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Las habitaciones limpias y No mover quedan fuera del turno.
                </p>
              </div>
            ) : visibleRooms.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No hay habitaciones para este filtro.
              </p>
            ) : (
              <ul className="grid md:grid-cols-2">
                {visibleRooms.map((room) => {
                  const task = currentTaskForRoom(room.id);
                  const assignable = !task || isCleaningTask(task);
                  const selected = task?.assignedTo ?? "__none__";
                  const assignedName = staff.find((person) => person.id === task?.assignedTo)?.fullName
                    ?? (task ? expiredName(task, expired) : undefined);
                  return (
                    <li
                      key={room.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 md:odd:border-r"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            Hab. {room.roomNumber}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${roomStatusStyle[room.status] ?? "bg-muted text-muted-foreground"}`}
                          >
                            {hasDailyHousekeepingPending(
                              room.status,
                              room.housekeepingServiceDate,
                              today,
                            )
                              ? "Ocupada · limpieza pendiente"
                              : roomStatusLabel[room.status] ?? room.status}
                          </span>
                          {task?.status === "in_progress" && (
                            <span className="text-[11px] text-muted-foreground">
                              En curso
                            </span>
                          )}
                        </div>
                        {assignedName && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            Asignada a {assignedName}
                          </p>
                        )}
                        {!assignable && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Esta tarea no corresponde a limpieza.
                          </p>
                        )}
                      </div>
                      <Select
                        value={selected}
                        disabled={saving || !assignable || task?.status==="in_progress" || !!task && task.scheduledDate!==date}
                        onValueChange={(value) => {
                          if (value === selected) return;
                          setMutationError("");
                          assign.mutate({
                            roomId: room.id,
                            assignedTo: value === "__none__" ? null : value,
                          });
                        }}
                      >
                        <SelectTrigger
                          aria-label={`Asignar habitación ${room.roomNumber}`}
                          className="h-9 w-[180px] shrink-0 bg-background text-xs"
                        >
                          <SelectValue placeholder="Asignar a…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin asignar</SelectItem>
                          {task?.assignedTo &&
                            !staff.some((person) => person.id === task.assignedTo) && (
                              <SelectItem value={task.assignedTo} disabled>
                                {assignedName ?? "Personal anterior"}
                              </SelectItem>
                            )}
                          {staff.map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                              {person.fullName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-9"
                        aria-label={`Terminar habitación ${room.roomNumber}`}
                        disabled={saving || !task || !isCleaningTask(task) || !canFinish(task)}
                        onClick={()=>task && finish.mutate(task)}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Terminar
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
      </section>
    </div>
  );
}
