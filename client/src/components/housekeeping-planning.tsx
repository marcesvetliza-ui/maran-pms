import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { getArgentinaToday } from "@/lib/date-utils";
import { formatHotelDateTime } from "@/lib/hotelTime";
import { formatDisplayDate } from "@shared/date-display";
import {
  compareBeds,
  durationLabel,
  physicalBedLabels,
  taskDuration,
  type HousekeepingPlanning,
  type PlanningRequest,
  type PlanningRoom,
} from "@shared/housekeepingPlanning";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
const input = "rounded-md border bg-background p-2 text-sm";
const taskLabels: Record<string, string> = {
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
const roomStates: Record<string, string> = {
  available: "Limpia / disponible",
  occupied: "Ocupada",
  dirty: "Sucia",
  cleaning: "En limpieza",
  maintenance: "Mantenimiento",
  oos: "Fuera de servicio",
  inspected: "Inspeccionada",
  limpia_ocupada: "Limpia ocupada",
  no_molestar: "No molestar",
};
export function HousekeepingPlanningView({
  onCreateTask,
}: {
  onCreateTask: (roomId: string, date: string) => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState(getArgentinaToday),
    [floor, setFloor] = useState("all"),
    [filter, setFilter] = useState("all");
  const [reviewed, setReviewed] = useState(false);
  const [now, setNow] = useState(Date.now),
    [confirmation, setConfirmation] = useState<{
      room: PlanningRoom;
      request: PlanningRequest;
    } | null>(null),
    [bed, setBed] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery<HousekeepingPlanning>({
    queryKey: ["/api/housekeeping/planning", date],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/housekeeping/planning?date=${date}`,
      );
      return response.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30000,
  });
  const save = useMutation({
    mutationFn: async () => {
      const { room, request } = confirmation!;
      return apiRequest(
        "POST",
        `/api/housekeeping/planning/${request.id}/bed-preparation`,
        {
          acknowledgeRequest: true,
          roomId: room.id,
          bedConfig: bed,
          expectedCurrentBedConfig: room.currentBed,
          expectedBedConfigRevision: room.currentBedRevision,
          expectedBedTypeId: request.bedTypeId,
          expectedBedTypeNotes: request.bedTypeNotes,
        },
      );
    },
    onSuccess: () => {
      setConfirmation(null);
      for (const key of [
        "/api/housekeeping/planning",
        "/api/rooms",
        "/api/planning",
        "/api/reservations",
      ])
        void queryClient.invalidateQueries({ queryKey: [key] });
      toast({
        title: "Camaje confirmado",
        description:
          "Quedó registrado quién confirmó la preparación. No se modificó No mover ni el estado de limpieza.",
      });
    },
    onError: (e) => setMessage(parseApiError(e)),
  });
  const data = query.data;
  const renderRequest = (r: PlanningRequest, room?: PlanningRoom) => (
    <article
      key={r.id}
      className="rounded-md border p-3 text-sm space-y-1"
      aria-label={`Reserva ${r.reservationCode}`}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <strong>{r.guestName}</strong>
        <span className="font-medium">
          {r.checkIn === date
            ? "Ingreso"
            : r.checkOut === date
              ? "Salida"
              : "Continúa estadía"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {r.reservationCode} · {formatDisplayDate(r.checkIn)} →{" "}
        {formatDisplayDate(r.checkOut)} · {r.numberOfGuests ?? "—"} personas
      </p>
      <p>
        <span className="font-medium">Camaje requerido:</span>{" "}
        {r.bedTypeName || "Sin especificar"}
        {r.bedTypeNotes && <> · {r.bedTypeNotes}</>}
      </p>
      <p
        className={
          r.comparison === "different"
            ? "font-semibold text-amber-700 dark:text-amber-300"
            : "text-muted-foreground"
        }
      >
        {
          {
            same: "El camaje base coincide; revisá los pedidos especiales.",
            different: "Requiere cambio de camaje.",
            review:
              "Revisar camaje e indicaciones; no se puede confirmar equivalencia automática.",
            unspecified: "La reserva no tiene un camaje solicitado.",
          }[r.comparison]
        }
      </p>
      {r.noMove && (
        <p className="font-semibold text-amber-800 dark:text-amber-300">
          {r.noMove.state === "prepared"
            ? "Limpia — No mover"
            : "Revisar preparación"}
          {r.noMove.note && <> · {r.noMove.note}</>}
        </p>
      )}
      {r.observations.map((o, index) => (
        <p key={index} className="whitespace-pre-wrap break-words">
          {o.text}
        </p>
      ))}
      {r.bedPreparation && (
        <p
          className={
            r.preparationCurrent
              ? "text-green-700 dark:text-green-300"
              : "text-amber-700 dark:text-amber-300"
          }
        >
          {r.preparationCurrent
            ? "Preparación confirmada"
            : "Confirmación anterior: requiere revisión"}{" "}
          · {formatHotelDateTime(r.bedPreparation.confirmedAt)}
        </p>
      )}
      {room && room.active && data?.mode !== "past" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setConfirmation({ room, request: r });
            setBed(room.currentBed || "");
            setReviewed(false);
            setMessage("");
          }}
        >
          Confirmar camaje preparado
        </Button>
      )}
    </article>
  );
  return (
    <section className="space-y-4 pt-3" aria-label="Planificación por fecha">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm font-medium">
          Fecha de planificación
          <input
            type="date"
            className={`${input} block mt-1`}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setConfirmation(null);
            }}
          />
        </label>
        <Button variant="outline" onClick={() => setDate(getArgentinaToday())}>
          Hoy
        </Button>
        <label className="text-sm">
          Piso
          <select
            className={`${input} block mt-1`}
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          >
            <option value="all">Todos</option>
            {[
              ...new Set(
                data?.rooms.map((r) => r.floor).filter((f) => f !== null),
              ),
            ]
              .sort((a, b) => a! - b!)
              .map((f) => (
                <option key={f} value={String(f)}>
                  Piso {f}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Mostrar
          <select
            className={`${input} block mt-1`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todas las habitaciones</option>
            <option value="arrivals">Con ingresos</option>
            <option value="departures">Con salidas</option>
            <option value="tasks">Con tareas</option>
            <option value="bed">Camaje a revisar</option>
          </select>
        </label>
      </div>
      {query.isLoading ? (
        <p role="status">Cargando planificación…</p>
      ) : query.isError ? (
        <div role="alert">
          No se pudo cargar la planificación.{" "}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        data && (
          <>
            <div className="rounded border p-3 text-sm bg-muted/30">
              <strong>
                {data.mode === "future"
                  ? "Trabajo previsto"
                  : data.mode === "past"
                    ? "Consulta de tareas registradas"
                    : "Jornada de hoy"}{" "}
                · {formatDisplayDate(date)}
              </strong>
              <p>
                {data.mode === "past"
                  ? "Los horarios son registros de tareas. Las reservas y el camaje actual no reconstruyen cómo estaba la habitación ese día."
                  : data.mode === "future"
                    ? "Las reservas indican trabajo previsto. La limpieza y el camaje físico muestran la situación actual, no un estado futuro."
                    : "La salida prevista no libera la habitación: la ocupación se conserva hasta el checkout."}
              </p>
              <small>
                Consulta actualizada {formatHotelDateTime(data.asOf)}
              </small>
            </div>
            <p className="text-xs text-muted-foreground">
              Totales generales de la fecha, antes de aplicar los filtros de la
              grilla.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                [
                  data.mode === "past"
                    ? "Ingresos según reservas"
                    : "Ingresos previstos",
                  data.totals.arrivals,
                ],
                [
                  data.mode === "past"
                    ? "Salidas según reservas"
                    : "Salidas previstas",
                  data.totals.departures,
                ],
                ["Continúan estadía", data.totals.stays],
                [
                  "Tareas finalizadas / programadas",
                  `${data.totals.completed} / ${data.totals.tasks}`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="border rounded p-3">
                  <p className="text-xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {!!data.unassigned.length && (
              <section className="border rounded p-3 space-y-2">
                <h3 className="font-semibold">
                  Reservas sin habitación operativa asignada
                </h3>
                {data.unassigned.map((r) => renderRequest(r))}
              </section>
            )}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.rooms
                .filter(
                  (r) =>
                    (floor === "all" || String(r.floor) === floor) &&
                    (filter === "all" ||
                      (filter === "arrivals" &&
                        r.requests.some((q) => q.checkIn === date)) ||
                      (filter === "departures" &&
                        r.requests.some((q) => q.checkOut === date)) ||
                      (filter === "tasks" && r.tasks.length > 0) ||
                      (filter === "bed" &&
                        r.requests.some(
                          (q) =>
                            ["different", "review"].includes(q.comparison) &&
                            !q.preparationCurrent,
                        ))),
                )
                .map((room) => (
                  <section
                    key={room.id}
                    className="rounded-lg border p-3 space-y-3"
                    aria-label={`Habitación ${room.roomNumber}`}
                  >
                    <header>
                      <h3 className="font-bold text-lg">
                        Hab. {room.roomNumber}{" "}
                        {room.floor !== null && (
                          <small className="text-xs font-normal">
                            · Piso {room.floor}
                          </small>
                        )}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Situación actual:{" "}
                        {roomStates[room.currentStatus || ""] || "Sin dato"}
                        {!room.active && " · Desactivada"}
                      </p>
                      <p className="text-sm">
                        Camaje físico actual:{" "}
                        <strong>
                          {physicalBedLabels[room.currentBed || ""] ||
                            room.currentBed ||
                            "Sin registrar"}
                        </strong>
                      </p>
                    </header>
                    {room.requests.map((r) => renderRequest(r, room))}
                    {!room.requests.length && (
                      <p className="text-xs text-muted-foreground">
                        Sin movimientos de reserva para esta fecha.
                      </p>
                    )}
                    {room.tasks.map((t) => (
                      <article key={t.id} className="border-t pt-2 text-sm">
                        <div className="flex flex-wrap justify-between gap-1">
                          <strong>
                            {taskLabels[t.taskType] || t.taskType}
                          </strong>
                          <span>{states[t.status] || t.status}</span>
                        </div>
                        <p>{t.staffName || "Sin asignar"}</p>
                        {t.notes && (
                          <p className="whitespace-pre-wrap break-words">
                            {t.notes}
                          </p>
                        )}
                        <p className="text-xs mt-1">
                          Inicio:{" "}
                          {t.startedAt
                            ? formatHotelDateTime(t.startedAt, {
                                includeSeconds: true,
                              })
                            : "Sin iniciar"}
                          <br />
                          Fin:{" "}
                          {t.completedAt
                            ? formatHotelDateTime(t.completedAt, {
                                includeSeconds: true,
                              })
                            : "Sin finalizar"}
                          <br />
                          {t.completedAt
                            ? "Duración real"
                            : "Tiempo transcurrido"}
                          :{" "}
                          {durationLabel(
                            taskDuration(t.startedAt, t.completedAt, now),
                          )}
                        </p>
                        {t.inspectedAt && (
                          <p className="text-xs">
                            Verificada {formatHotelDateTime(t.inspectedAt)}
                          </p>
                        )}
                      </article>
                    ))}
                    {data.mode !== "past" && room.active && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onCreateTask(room.id, date)}
                      >
                        Programar tarea · {formatDisplayDate(date)}
                      </Button>
                    )}
                  </section>
                ))}
            </div>
          </>
        )
      )}
      <Dialog
        open={!!confirmation}
        onOpenChange={(value) => {
          if (!save.isPending && !value) setConfirmation(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar camaje físico</DialogTitle>
            <DialogDescription>
              Confirmá sólo lo que ya preparaste en la habitación. Esta acción
              registra el camaje actual y la reserva revisada; no programa un
              cambio futuro.
            </DialogDescription>
          </DialogHeader>
          {confirmation && (
            <>
              <p className="text-sm">
                Hab. {confirmation.room.roomNumber} ·{" "}
                {confirmation.request.guestName}
                <br />
                Pedido: {confirmation.request.bedTypeName ||
                  "Sin especificar"}{" "}
                {confirmation.request.bedTypeNotes}
              </p>
              <label className="text-sm">
                Camaje realmente preparado
                <select
                  className={`${input} w-full mt-1`}
                  value={bed}
                  onChange={(e) => setBed(e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  {Object.entries(physicalBedLabels)
                    .filter(
                      ([key]) =>
                        !confirmation.room.allowedBeds?.length ||
                        confirmation.room.allowedBeds.includes(key),
                    )
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                Revisé el pedido y las observaciones de esta reserva, y este es
                el camaje que quedó preparado.
              </label>
              <p className="text-xs text-muted-foreground">
                No cambia “Limpia — No mover”, la ocupación ni la limpieza. Se
                registra quién confirma.
              </p>
              {message && (
                <p role="alert" className="text-sm text-destructive">
                  {message}
                </p>
              )}
            </>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => setConfirmation(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={
                save.isPending ||
                !bed ||
                !reviewed ||
                (!!confirmation &&
                  compareBeds(
                    bed,
                    confirmation.request.bedTypeCode,
                    confirmation.request.bedTypeNotes,
                  ) === "different")
              }
              onClick={() => save.mutate()}
            >
              Confirmar preparación realizada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
