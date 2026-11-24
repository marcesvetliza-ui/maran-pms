import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Heart, CalendarClock, Check, Eye } from "lucide-react";
import { useAuth } from "@/App";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { InclusionRulesEditor } from "./inclusion-rules-editor";
import {
  allowedInclusionAreas,
  inclusionAreaLabels,
  inclusionRulesSchema,
  type IncludedService,
  type InclusionRule,
} from "@shared/hospitalityInclusions";

type Result = {
  items: IncludedService[];
  pendingToday: number;
  unseenToday?: number;
  hasMore: boolean;
  page: number;
  canCoordinate: boolean;
  areas: string[];
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
const displayDate = (value: string) =>
  value ? value.split("-").reverse().join("/") : "A coordinar";
const invalidate = () =>
  queryClient.invalidateQueries({
    predicate: (q) =>
      String(q.queryKey[0]).startsWith("/api/hospitality/included-services"),
  });
function queryUrl(
  area?: string,
  view = "today",
  reservationId?: string,
  page = 1,
) {
  const p = new URLSearchParams({ view, page: String(page) });
  if (area) p.set("area", area);
  if (reservationId) p.set("reservationId", reservationId);
  return `/api/hospitality/included-services?${p}`;
}

function ServiceAction({
  service,
  action,
  onClose,
}: {
  service: IncludedService;
  action: "schedule" | "fulfill" | "events";
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [requestId] = useState(() => crypto.randomUUID());
  const [quantity, setQuantity] = useState(1),
    [note, setNote] = useState(""),
    [date, setDate] = useState(`${service.serviceDate || today()}T12:00`);
  const history = useQuery<any[]>({
    queryKey: [`/api/hospitality/included-services/${service.id}/events`],
    enabled: action === "events",
  });
  const save = useMutation({
    mutationFn: () =>
      apiRequest(
        "POST",
        `/api/hospitality/included-services/${service.id}/actions`,
        {
          action,
          version: service.version,
          requestId,
          ...(action === "schedule"
            ? { date: new Date(date + ":00-03:00").toISOString(), note }
            : { quantity, note }),
        },
      ),
    onSuccess: async () => {
      await invalidate();
      toast({
        title:
          action === "fulfill" ? "Atención registrada" : "Horario coordinado",
      });
      onClose();
    },
    onError: async (e) => {
      toast({
        title: "No se pudo guardar",
        description: parseApiError(e),
        variant: "destructive",
      });
      await invalidate();
      if (/^409:/.test(String((e as Error)?.message))) onClose();
    },
  });
  const title =
    action === "fulfill"
      ? "Registrar atención"
      : action === "schedule"
        ? "Coordinar servicio"
        : "Historial de atención";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b p-5 pr-12 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {service.person} · {service.service}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain space-y-4 p-5">
          {action === "events" ? (
            <>
              {history.isLoading && <p>Cargando historial…</p>}
              {history.error && (
                <p role="alert">{parseApiError(history.error)}</p>
              )}
              {history.data?.length === 0 && <p>Sin acciones registradas.</p>}
              {history.data?.map((e, i) => (
                <div key={i} className="border-b pb-3 text-sm">
                  <strong>
                    {e.action === "fulfill"
                      ? `Atendido: ${e.quantity}`
                      : e.action === "schedule"
                        ? "Horario coordinado"
                        : e.action === "cancel"
                          ? "Pendientes retirados"
                          : e.action === "create"
                            ? "Propuesta registrada"
                            : "Aviso visto"}
                  </strong>
                  {e.scheduledAt && (
                    <p>
                      {new Intl.DateTimeFormat("es-AR", {
                        timeZone: "America/Argentina/Buenos_Aires",
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(e.scheduledAt))}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{e.note}</p>
                  <p className="text-muted-foreground">
                    {e.actorName} ·{" "}
                    {new Intl.DateTimeFormat("es-AR", {
                      timeZone: "America/Argentina/Buenos_Aires",
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(e.createdAt))}
                  </p>
                </div>
              ))}
            </>
          ) : (
            <>
              <p className="rounded-lg bg-muted p-3 text-sm">
                {service.remaining} disponibles de {service.quantity}.{" "}
                {service.conditions}
              </p>
              {action === "fulfill" ? (
                <label className="block text-sm">
                  Cantidad atendida
                  <Input
                    aria-label="Cantidad atendida"
                    type="number"
                    min={1}
                    max={service.remaining}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  />
                </label>
              ) : (
                <label className="block text-sm">
                  Fecha y hora de Argentina
                  <Input
                    aria-label="Fecha y hora del servicio"
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              )}
              <label className="block text-sm">
                {action === "fulfill"
                  ? "Detalle de la atención"
                  : "Detalle de coordinación"}
                <Textarea
                  aria-label="Detalle de la acción"
                  maxLength={600}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Indicá persona, horario o referencia de la atención"
                />
              </label>
              <p className="text-sm text-muted-foreground">
                {action === "fulfill"
                  ? "Se descuenta del incluido y queda registrado quién lo atendió. La comanda, los insumos, los adicionales y la facturación se gestionan en el circuito habitual del área."
                  : "Coordinar aquí informa el horario de la próxima atención pendiente. Los horarios anteriores se conservan en el historial. La reserva de mesa, gabinete o habitación se realiza en su agenda habitual."}
              </p>
            </>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t p-4">
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={onClose}
          >
            Cerrar
          </Button>
          {action !== "events" && (
            <Button
              disabled={
                save.isPending ||
                note.trim().length < 3 ||
                (action === "fulfill"
                  ? !Number.isInteger(quantity) ||
                    quantity < 1 ||
                    quantity > service.remaining
                  : !date)
              }
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Guardando…" : "Confirmar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelSupplement({
  service,
  onClose,
}: {
  service: IncludedService;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const save = useMutation({
    mutationFn: () =>
      apiRequest(
        "POST",
        `/api/hospitality/included-services/supplements/${encodeURIComponent(service.sourceId)}/cancel`,
        { reason, requestId },
      ),
    onSuccess: async () => {
      await invalidate();
      toast({
        title: "Pendientes retirados",
        description: "Las atenciones anteriores se conservan en el historial.",
      });
      onClose();
    },
    onError: (e) =>
      toast({
        title: "No se pudieron retirar los pendientes",
        description: parseApiError(e),
        variant: "destructive",
      }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retirar incluidos de la propuesta</DialogTitle>
          <DialogDescription>
            {service.sourceTitle} · {service.person}. Se retiran todos los
            servicios pendientes de esta propuesta, en todas sus áreas. Lo
            utilizado y su historial se conservan. Los importes del folio se
            revisan por separado.
          </DialogDescription>
        </DialogHeader>
        <label className="block text-sm">
          Motivo
          <Textarea
            aria-label="Motivo para retirar incluidos"
            maxLength={600}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Volver
          </Button>
          <Button
            variant="destructive"
            disabled={save.isPending || reason.trim().length < 10}
            onClick={() => save.mutate()}
          >
            Retirar pendientes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddSupplement({
  reservationId,
  onClose,
}: {
  reservationId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("Media pensión"),
    [reason, setReason] = useState(""),
    [rules, setRules] = useState<InclusionRule[]>([]);
  const [requestId] = useState(() => crypto.randomUUID());
  const save = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/hospitality/included-services/supplements", {
        reservationId,
        title,
        reason,
        rules,
        requestId,
      }),
    onSuccess: async () => {
      await invalidate();
      toast({ title: "Incluidos registrados para la estadía" });
      onClose();
    },
    onError: (e) =>
      toast({
        title: "No se pudieron registrar",
        description: parseApiError(e),
        variant: "destructive",
      }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b p-5 pr-12 text-left">
          <DialogTitle>Agregar incluidos a esta estadía</DialogTitle>
          <DialogDescription>
            Registrá media pensión u otros servicios de una venta ya acordada.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain space-y-4 p-5">
          <label className="block text-sm">
            Nombre de la propuesta
            <Input
              aria-label="Nombre de los incluidos"
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <InclusionRulesEditor
            value={rules}
            onChange={setRules}
            disabled={save.isPending}
          />
          <label className="block text-sm">
            Motivo y referencia de la venta
            <Textarea
              aria-label="Motivo de los incluidos"
              maxLength={600}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="rounded-lg bg-muted p-3 text-sm">
            Este registro avisa a las áreas. El importe de la media pensión o
            del adicional debe estar registrado en el folio por el circuito
            habitual; aquí no se agrega un cobro.
          </p>
        </div>
        <DialogFooter className="shrink-0 border-t p-4">
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={
              save.isPending ||
              title.trim().length < 3 ||
              reason.trim().length < 10 ||
              !rules.length ||
              !inclusionRulesSchema.safeParse(rules).success
            }
            onClick={() => save.mutate()}
          >
            Registrar incluidos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IncludedServicesPanel({
  area,
  reservationId,
}: {
  area?: "restaurant" | "spa" | "reception";
  reservationId?: string;
}) {
  const [view, setView] = useState(reservationId ? "pending" : "today"),
    [page, setPage] = useState(1),
    [selectedArea, setArea] = useState(area || "");
  const [action, setAction] = useState<{
      service: IncludedService;
      action: "schedule" | "fulfill" | "events";
    } | null>(null),
    [adding, setAdding] = useState(false);
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState<IncludedService | null>(null);
  const url = queryUrl(selectedArea || undefined, view, reservationId, page);
  const data = useQuery<Result>({
    queryKey: [url],
    queryFn: async () => (await apiRequest("GET", url)).json(),
    refetchInterval: 30000,
    retry: false,
  });
  const seen = useMutation({
    mutationFn: (s: IncludedService) =>
      apiRequest("POST", `/api/hospitality/included-services/${s.id}/actions`, {
        action: "acknowledge",
        version: s.version,
        requestId: crypto.randomUUID(),
      }),
    onSuccess: () => void invalidate(),
    onError: async (e) => {
      toast({
        title: "No se pudo marcar el aviso",
        description: parseApiError(e),
        variant: "destructive",
      });
      await invalidate();
    },
  });
  return (
    <section
      className="space-y-4 min-w-0"
      data-testid="included-services-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Servicios incluidos</h2>
          <p className="text-sm text-muted-foreground">
            {data.data
              ? `${data.data.pendingToday} servicios pendientes de hoy`
              : "Incluidos, coordinación y atención por área"}
          </p>
        </div>
        {reservationId && data.data?.canCoordinate && (
          <Button onClick={() => setAdding(true)}>
            Agregar incluidos / media pensión
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries({
          today: "Hoy",
          upcoming: "Próximos",
          pending: "Todos los pendientes",
          history: "Historial",
        }).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={view === key ? "default" : "outline"}
            onClick={() => {
              setView(key);
              setPage(1);
            }}
          >
            {label}
          </Button>
        ))}
        {!area && data.data && data.data.areas.length > 1 && (
          <select
            aria-label="Área de los incluidos"
            className="h-9 rounded-md border bg-background px-2"
            value={selectedArea}
            onChange={(e) => {
              setArea(e.target.value as any);
              setPage(1);
            }}
          >
            <option value="">Todas mis áreas</option>
            {data.data.areas.map((a) => (
              <option key={a} value={a}>
                {inclusionAreaLabels[a as keyof typeof inclusionAreaLabels]}
              </option>
            ))}
          </select>
        )}
      </div>
      {data.isLoading && <p role="status">Cargando incluidos…</p>}
      {data.error && (
        <div role="alert">
          <p>{parseApiError(data.error)}</p>
          <Button variant="outline" onClick={() => void data.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {data.data?.items.length === 0 && (
        <div className="rounded-lg border p-6 text-center text-muted-foreground">
          No hay servicios en esta vista.
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.data?.items.map((s) => (
          <article
            key={s.id}
            className="min-w-0 rounded-xl border bg-card p-4 space-y-3"
            data-testid="included-service-card"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {inclusionAreaLabels[s.area]} ·{" "}
                  {s.room
                    ? `Hab. ${s.room}`
                    : s.sourceKind === "spa_sale"
                      ? "Venta anticipada SPA"
                      : "Cliente SPA"}
                </p>
                <h3 className="font-semibold break-words">
                  {s.person || "Beneficiario a confirmar"}
                </h3>
                <p className="text-sm text-muted-foreground break-words">
                  {s.sourceTitle}
                </p>
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-xs">
                {s.cancelled
                  ? s.sourceStatus === "vencido"
                    ? "Vencido"
                    : "Cancelado"
                  : s.used >= s.quantity
                    ? "Utilizado"
                    : s.ready
                      ? s.readyWhen === "spa_completed"
                        ? "SPA completado · coordinar atención"
                        : "Listo para atender"
                      : s.present
                        ? "Persona presente"
                        : s.scheduledAt
                          ? "Programado"
                          : "Previsto"}
              </span>
            </div>
            <div>
              <p className="font-medium break-words">{s.service}</p>
              {s.conditions && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                  {s.conditions}
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center text-sm">
              <div>
                <strong>{s.quantity}</strong>
                <p>Incluidos</p>
              </div>
              <div>
                <strong>{s.used}</strong>
                <p>Utilizados</p>
              </div>
              <div>
                <strong>{s.remaining}</strong>
                <p>Pendientes</p>
              </div>
            </div>
            <p className="text-sm">
              {s.scheduledAt
                ? new Intl.DateTimeFormat("es-AR", {
                    timeZone: "America/Argentina/Buenos_Aires",
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(s.scheduledAt))
                : displayDate(s.serviceDate)}
              {s.validUntil && s.validUntil !== s.serviceDate
                ? ` · Hasta ${displayDate(s.validUntil)}`
                : ""}
            </p>
            {s.sourceKind === "spa_sale" && (
              <p className="text-xs text-muted-foreground">
                A nombre del comprador. Coordiná beneficiarios y horarios de la
                venta; agendar un turno no agrega otro incluido.
              </p>
            )}
            {s.needsReview && (
              <p
                role="alert"
                className="rounded-md border border-amber-500 p-2 text-sm"
              >
                Revisar: hubo cambios de la reserva después de registrar
                atención. El historial se conserva.
              </p>
            )}
            {s.note && (
              <p className="text-sm whitespace-pre-wrap break-words">
                {s.note}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {!s.cancelled && s.remaining > 0 && (
                <>
                  {!s.acknowledgedAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={seen.isPending}
                      onClick={() => seen.mutate(s)}
                    >
                      <Eye className="mr-1 h-4 w-4" />
                      Visto
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setAction({ service: s, action: "schedule" })
                    }
                  >
                    <CalendarClock className="mr-1 h-4 w-4" />
                    Coordinar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setAction({ service: s, action: "fulfill" })}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Registrar atención
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAction({ service: s, action: "events" })}
              >
                Historial
              </Button>
              {!s.cancelled &&
                s.sourceKind === "supplement" &&
                data.data?.canCoordinate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCancelling(s)}
                  >
                    Retirar incluidos
                  </Button>
                )}
            </div>
          </article>
        ))}
      </div>
      <div className="flex justify-end items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page === 1 || data.isFetching}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span className="text-sm">Página {page}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={!data.data?.hasMore || data.isFetching}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </Button>
      </div>
      {action && <ServiceAction {...action} onClose={() => setAction(null)} />}{" "}
      {cancelling && (
        <CancelSupplement
          service={cancelling}
          onClose={() => setCancelling(null)}
        />
      )}
      {adding && reservationId && (
        <AddSupplement
          reservationId={reservationId}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}

export function ReservationIncludedServices({
  reservationId,
}: {
  reservationId: string;
}) {
  const { user, hasPermission } = useAuth();
  const [expanded, setExpanded] = useState(false);
  if (
    !user ||
    hasPermission?.("sidebar:/hospitality") !== true ||
    allowedInclusionAreas(user.role).length === 0
  )
    return null;
  return (
    <details
      className="rounded-lg border p-4"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">
        Hospitalidad · Servicios incluidos
      </summary>
      {expanded && (
        <div className="pt-4">
          <IncludedServicesPanel reservationId={reservationId} />
        </div>
      )}
    </details>
  );
}

export function IncludedServicesButton({
  area,
}: {
  area?: "restaurant" | "spa" | "reception";
}) {
  const { user, hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const enabled =
    !!user &&
    hasPermission?.("sidebar:/hospitality") === true &&
    allowedInclusionAreas(user.role).length > 0 &&
    (!area || allowedInclusionAreas(user.role).includes(area as never));
  const url = queryUrl(area);
  const data = useQuery<Result>({
    queryKey: [url],
    queryFn: async () => (await apiRequest("GET", url)).json(),
    enabled,
    refetchInterval: 30000,
    retry: false,
  });
  if (!enabled) return null;
  return (
    <>
      <Button
        variant="outline"
        className="gap-2"
        onClick={() => setOpen(true)}
        data-testid="button-included-hospitality"
      >
        <Heart className="h-4 w-4" />
        Hospitalidad
        {data.data && data.data.pendingToday > 0 && (
          <span
            aria-label={`${data.data.pendingToday} servicios pendientes de hoy`}
            className="rounded-full bg-amber-100 px-2 text-amber-900"
          >
            {data.data.pendingToday}
          </span>
        )}
        {!!data.data?.unseenToday && (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
            Por ver
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b p-5 pr-12 text-left">
            <DialogTitle>
              Hospitalidad{area ? ` · ${inclusionAreaLabels[area]}` : ""}
            </DialogTitle>
            <DialogDescription>
              Servicios incluidos y pendientes de atención
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
            {open && <IncludedServicesPanel area={area} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
