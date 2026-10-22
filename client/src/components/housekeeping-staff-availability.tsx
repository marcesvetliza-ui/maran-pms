import {
  Users,
  Clock,
  ClipboardList,
  UserCheck,
  CalendarOff,
  UserX,
  Pencil,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { getArgentinaToday } from "@/lib/date-utils";
import {
  availabilitySchema,
  availabilityDescription,
  availabilityLabels,
  shiftLabels,
  type StaffAvailability,
} from "@shared/housekeepingAvailability";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
const input = "w-full rounded-md border bg-background p-2 text-sm";
export function useStaffAvailability(date: string) {
  return useQuery<StaffAvailability[]>({
    queryKey: ["/api/housekeeping/availability", date],
    queryFn: async () =>
      (
        await apiRequest("GET", `/api/housekeeping/availability?date=${date}`)
      ).json(),
  });
}
export function HousekeepingStaffAvailability() {
  const [date, setDate] = useState(getArgentinaToday),
    [editing, setEditing] = useState<StaffAvailability | null>(null),
    [message, setMessage] = useState("");
  const [form, setForm] = useState({
    status: "working",
    shift: "",
    startTime: "",
    endTime: "",
    notes: "",
  });
  const data = useStaffAvailability(date);
  const payload = {
    ...form,
    shift: form.shift || null,
    startTime: form.startTime || null,
    endTime: form.endTime || null,
  };
  const save = useMutation({
    mutationFn: async () =>
      apiRequest(
        "PUT",
        `/api/housekeeping/availability/${editing!.userId}/${date}`,
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/housekeeping/availability"],
      });
      setEditing(null);
    },
    onError: (e) => setMessage(parseApiError(e)),
  });
  function edit(row: StaffAvailability) {
    setMessage("");
    setForm({
      status: row.status || "working",
      shift: row.shift || "",
      startTime: row.startTime || "",
      endTime: row.endTime || "",
      notes: row.notes || "",
    });
    setEditing(row);
  }
  return (
    <section className="space-y-4 mt-4">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-primary/10 p-3 text-primary">
          <Users className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-lg font-semibold">Disponibilidad del personal</h3>
          <p className="text-sm text-muted-foreground">
            Organizá el equipo y los horarios de cada jornada.
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Completá quién trabaja cada día. Cambiar la disponibilidad no modifica
        ni cancela tareas asignadas.
      </p>
      <label className="block max-w-xs text-sm font-medium">
        Fecha
        <input
          aria-label="Fecha de disponibilidad"
          className={input}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      {data.isLoading && <p>Cargando disponibilidad…</p>}
      {data.isError && (
        <p role="alert">
          No se pudo consultar la disponibilidad.{" "}
          <Button variant="outline" onClick={() => data.refetch()}>
            Reintentar
          </Button>
        </p>
      )}
      {data.data?.length === 0 && (
        <p>No hay personal activo de Housekeeping.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {data.data?.map((row) => (
          <div
            className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col"
            key={row.userId}
          >
            <div
              className={`h-1 ${row.status === "working" ? "bg-emerald-500" : row.status === "day_off" ? "bg-sky-500" : row.status === "absent" ? "bg-rose-500" : "bg-slate-300 dark:bg-slate-600"}`}
            />
            <div className="p-4 space-y-3 flex flex-col flex-1">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                  {row.fullName
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")}
                </span>
                <div className="min-w-0">
                  <h4 className="font-semibold break-words">{row.fullName}</h4>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${row.status === "working" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : row.status === "day_off" ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" : row.status === "absent" ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" : "bg-muted text-muted-foreground"}`}
                  >
                    {row.status === "working" ? (
                      <UserCheck className="h-3 w-3" />
                    ) : row.status === "day_off" ? (
                      <CalendarOff className="h-3 w-3" />
                    ) : row.status === "absent" ? (
                      <UserX className="h-3 w-3" />
                    ) : null}
                    {row.status
                      ? availabilityLabels[row.status]
                      : "Sin completar"}
                  </span>
                </div>
              </div>
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                {row.status
                  ? availabilityDescription(row)
                  : "Turno y horario pendientes"}
              </p>
              <p className="flex items-center gap-2 text-sm">
                <ClipboardList className="h-4 w-4 text-primary" />
                {row.taskCount || 0} tareas asignadas
              </p>
              {row.status && row.status !== "working" && !!row.taskCount && (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Tiene tareas asignadas: revisá si corresponde reasignarlas.
                </p>
              )}
              {row.notes && (
                <p className="text-sm whitespace-pre-wrap">{row.notes}</p>
              )}
              <Button
                variant="outline"
                className="w-full mt-auto gap-2"
                onClick={() => edit(row)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Completar · {row.fullName}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!save.isPending && !v) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Disponibilidad · {editing?.fullName}</DialogTitle>
          </DialogHeader>
          <label>
            Estado
            <select
              className={input}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {Object.entries(availabilityLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {form.status === "working" && (
            <>
              <label>
                Turno
                <select
                  className={input}
                  value={form.shift}
                  onChange={(e) => setForm({ ...form, shift: e.target.value })}
                >
                  <option value="">Sin especificar</option>
                  {Object.entries(shiftLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  Desde
                  <input
                    className={input}
                    type="time"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm({ ...form, startTime: e.target.value })
                    }
                  />
                </label>
                <label>
                  Hasta
                  <input
                    className={input}
                    type="time"
                    value={form.endTime}
                    onChange={(e) =>
                      setForm({ ...form, endTime: e.target.value })
                    }
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Horarios opcionales. Si el final es anterior al inicio, termina
                al día siguiente. Para turno cortado, detallá los tramos en
                observaciones.
              </p>
            </>
          )}
          <label>
            Observaciones
            <textarea
              className={input}
              maxLength={500}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          {!availabilitySchema.safeParse(payload).success && (
            <p role="alert">
              Completá ambos horarios y verificá que sean distintos.
            </p>
          )}
          {message && <p role="alert">{message}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={
                save.isPending || !availabilitySchema.safeParse(payload).success
              }
              onClick={() => save.mutate()}
            >
              Guardar disponibilidad
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
