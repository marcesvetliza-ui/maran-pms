import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { getArgentinaToday } from "@/lib/date-utils";
import { formatDisplayDate } from "@shared/date-display";
import type { RoomWithType, HousekeepingTaskWithRoom } from "@shared/schema";
import { isOperationalInventoryRoom } from "@shared/room-availability";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const types: Record<string, string> = {
  checkout_clean: "Limpieza de salida",
  stayover_clean: "Limpieza de estadía",
  deep_clean: "Limpieza profunda",
  inspection: "Inspección",
  turndown: "Repaso nocturno",
  maintenance_prep: "Preparación para mantenimiento",
};
const states: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Por verificar",
  inspected: "Verificada",
};
const priorities: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};
const input = "w-full rounded-md border bg-background p-2 text-sm";
export function HousekeepingTaskManager({
  rooms,
  staff,
  open,
  onOpenChange,
  initialRoomIds,
  initialDate,
}: {
  rooms: RoomWithType[];
  staff: { id: string; fullName: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRoomIds: string[];
  initialDate?: string;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState(getArgentinaToday),
    [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<HousekeepingTaskWithRoom | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState("");
  const [form, setForm] = useState({
    scheduledDate: getArgentinaToday(),
    assignedTo: "",
    taskType: "checkout_clean",
    priority: "normal",
    notes: "",
  });
  const [message, setMessage] = useState("");
  const requestedEdit = useRef<HousekeepingTaskWithRoom | null>(null);
  useEffect(() => {
    if (open) {
      const task = requestedEdit.current;
      requestedEdit.current = null;
      setEditing(task);
      setSelected(task ? [task.roomId] : initialRoomIds);
      setSearch("");
      setMessage("");
      setForm(
        task
          ? {
              scheduledDate: task.scheduledDate,
              assignedTo: task.assignedTo || "",
              taskType: task.taskType,
              priority: task.priority,
              notes: task.notes || "",
            }
          : {
              scheduledDate: initialDate || date,
              assignedTo: "",
              taskType: "checkout_clean",
              priority: "normal",
              notes: "",
            },
      );
    }
  }, [open]);
  const tasks = useQuery<HousekeepingTaskWithRoom[]>({
    queryKey: ["/api/housekeeping", "planning", date],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/housekeeping?date=${date}`,
      );
      return response.json();
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, assignedTo: form.assignedTo || null };
      return apiRequest(
        editing ? "PATCH" : "POST",
        editing ? `/api/housekeeping/${editing.id}` : "/api/housekeeping/bulk",
        editing ? payload : { ...payload, roomIds: selected },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });
      onOpenChange(false);
      toast({
        title: editing ? "Tarea actualizada" : "Tareas creadas",
        description: "Fecha, responsable e instrucciones guardados.",
      });
    },
    onError: (e) => setMessage(parseApiError(e)),
  });
  const verify = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/housekeeping/${id}/inspect`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Verificación registrada" });
    },
    onError: (e) =>
      toast({
        title: "No se pudo verificar",
        description: parseApiError(e),
        variant: "destructive",
      }),
  });
  const available = rooms
    .filter(isOperationalInventoryRoom)
    .filter((r) =>
      `${r.roomNumber} ${r.floor}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
    );
  const edit = (task: HousekeepingTaskWithRoom) => {
    requestedEdit.current = task;
    onOpenChange(true);
  };
  return (
    <section
      className="rounded-lg border p-3 space-y-3"
      aria-label="Planificación de tareas"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Tareas y asignaciones</h2>
          <p className="text-xs text-muted-foreground">
            Programá trabajo por fecha. El estado de las habitaciones muestra la
            situación actual.
          </p>
        </div>
        <Button onClick={() => onOpenChange(true)}>
          Crear y asignar tareas
        </Button>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">
          Consultar o reasignar tareas
        </summary>
        <div className="flex flex-wrap gap-3 my-3">
          <label className="text-sm">
            Fecha
            <input
              className={input}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Estado
            <select
              className={input}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              {Object.entries(states).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {tasks.isLoading ? (
          <p role="status">Cargando tareas…</p>
        ) : tasks.isError ? (
          <div role="alert">
            No se pudieron cargar las tareas.{" "}
            <Button variant="outline" onClick={() => void tasks.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="max-h-80 overflow-auto space-y-2">
            {!tasks.data?.filter((t) => filter === "all" || t.status === filter)
              .length && (
              <p className="text-sm text-muted-foreground">
                No hay tareas para esta fecha y estado.
              </p>
            )}
            {tasks.data
              ?.filter((t) => filter === "all" || t.status === filter)
              .map((t) => (
                <article key={t.id} className="rounded border p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <strong>
                      Hab. {t.room?.roomNumber} · {types[t.taskType]}
                    </strong>
                    <span>{states[t.status]}</span>
                  </div>
                  <p>
                    {staff.find((s) => s.id === t.assignedTo)?.fullName ||
                      "Sin asignar"}{" "}
                    · Prioridad {priorities[t.priority]}
                  </p>
                  {t.notes && (
                    <p className="whitespace-pre-wrap break-words mt-1">
                      {t.notes}
                    </p>
                  )}
                  {t.startedAt && (
                    <p className="text-xs mt-1">
                      Inicio {new Date(t.startedAt).toLocaleTimeString("es-AR")}{" "}
                      {t.completedAt && (
                        <>
                          · Fin{" "}
                          {new Date(t.completedAt).toLocaleTimeString("es-AR")}{" "}
                          · Duración{" "}
                          {Math.max(
                            0,
                            Math.round(
                              (new Date(t.completedAt).getTime() -
                                new Date(t.startedAt).getTime()) /
                                60000,
                            ),
                          )}{" "}
                          min
                        </>
                      )}
                    </p>
                  )}
                  {t.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => edit(t)}
                    >
                      Editar o reasignar
                    </Button>
                  )}
                  {t.status === "completed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={verify.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `¿Confirmar la verificación de la habitación ${t.room?.roomNumber}?`,
                          )
                        )
                          verify.mutate(t.id);
                      }}
                    >
                      Verificar habitación
                    </Button>
                  )}
                </article>
              ))}
          </div>
        )}
      </details>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!save.isPending) onOpenChange(value);
        }}
      >
        <DialogContent
          className="max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden"
          onInteractOutside={(e) => {
            if (save.isPending) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar tarea pendiente" : "Crear y asignar tareas"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Conserva el historial y cambia sólo los datos de la tarea pendiente."
                : "Se creará una tarea por habitación. Revisá la fecha y la selección antes de guardar."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto space-y-4 px-1">
            <div className="grid sm:grid-cols-2 gap-3">
              <label>
                Fecha de la tarea
                <input
                  className={input}
                  type="date"
                  value={form.scheduledDate}
                  onChange={(e) =>
                    setForm({ ...form, scheduledDate: e.target.value })
                  }
                />
              </label>
              <label>
                Responsable
                <select
                  className={input}
                  value={form.assignedTo}
                  onChange={(e) =>
                    setForm({ ...form, assignedTo: e.target.value })
                  }
                >
                  <option value="">Sin asignar</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo de tarea
                <select
                  className={input}
                  value={form.taskType}
                  onChange={(e) =>
                    setForm({ ...form, taskType: e.target.value })
                  }
                >
                  {Object.entries(types).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prioridad
                <select
                  className={input}
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: e.target.value })
                  }
                >
                  {Object.entries(priorities).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="border rounded p-3">
              <legend>Habitaciones · {selected.length} seleccionadas</legend>
              {!editing && (
                <>
                  <label>
                    Buscar habitación o piso
                    <input
                      className={input}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="my-2"
                    onClick={() =>
                      setSelected((previous) => [
                        ...new Set([
                          ...previous,
                          ...available.map((r) => r.id),
                        ]),
                      ])
                    }
                  >
                    Seleccionar las visibles
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelected([])}
                  >
                    Quitar selección
                  </Button>
                </>
              )}
              <div className="max-h-48 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
                {available
                  .filter((r) => !editing || selected.includes(r.id))
                  .map((r) => (
                    <label
                      key={r.id}
                      className="flex gap-2 items-center border rounded p-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        disabled={!!editing}
                        onChange={(e) =>
                          setSelected((previous) =>
                            e.target.checked
                              ? [...previous, r.id]
                              : previous.filter((id) => id !== r.id),
                          )
                        }
                      />
                      Hab. {r.roomNumber} · Piso {r.floor}
                    </label>
                  ))}
              </div>
            </fieldset>
            <label className="block">
              Instrucciones
              <textarea
                className={input}
                rows={3}
                maxLength={2000}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Indicaciones y pedidos especiales para estas habitaciones"
              />
            </label>
            <p className="text-sm text-muted-foreground">
              {formatDisplayDate(form.scheduledDate)} · {selected.length} tareas
              ·{" "}
              {staff.find((s) => s.id === form.assignedTo)?.fullName ||
                "Sin asignar"}
            </p>
            {message && (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={
                save.isPending || !selected.length || !form.scheduledDate
              }
              onClick={() => save.mutate()}
            >
              {save.isPending
                ? "Guardando…"
                : editing
                  ? "Guardar tarea"
                  : `Crear ${selected.length} tareas`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
