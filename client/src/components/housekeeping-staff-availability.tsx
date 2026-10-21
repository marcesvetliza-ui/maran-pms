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
      <h3 className="font-semibold">Disponibilidad del personal</h3>
      <p className="text-sm text-muted-foreground">
        Completá quién trabaja cada día. Cambiar la disponibilidad no modifica
        ni cancela tareas asignadas.
      </p>
      <label className="block max-w-xs">
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.data?.map((row) => (
          <div className="rounded-md border p-4 space-y-2" key={row.userId}>
            <h4 className="font-medium">{row.fullName}</h4>
            <p>{row.status ? availabilityDescription(row) : "Sin completar"}</p>
            <p className="text-sm">{row.taskCount || 0} tareas asignadas</p>
            {row.status && row.status !== "working" && !!row.taskCount && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Tiene tareas asignadas: revisá si corresponde reasignarlas.
              </p>
            )}
            {row.notes && (
              <p className="text-sm whitespace-pre-wrap">{row.notes}</p>
            )}
            <Button variant="outline" onClick={() => edit(row)}>
              Completar · {row.fullName}
            </Button>
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
