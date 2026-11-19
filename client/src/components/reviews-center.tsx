import { SurveySectorLinks, PersonalSurveySharing } from "./survey-sharing";
import {
  surveySectors,
  permittedReviewSectors,
  surveySectorTargets,
  type SurveySector,
} from "@shared/survey-sectors";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SurveyScheduleSettings } from "./survey-schedule-settings";
import { useSearch } from "wouter";
import { ReviewInboxControls } from "./review-inbox-controls";
import { ReviewInboxTable, ReviewComment } from "./review-inbox-table";
import {
  reviewToday,
  moveReviewDay,
  reviewPeriod,
  type ReviewDayMode,
} from "@/lib/review-period";
import {
  Star,
  MessageSquare,
  Plus,
  Send,
  Settings2,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useAuth } from "@/App";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatHotelDateTime } from "@/lib/hotelTime";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  reviewStates,
  reviewSources,
  needsReviewFollowup,
  type ReviewItem,
  type ReviewArea,
} from "@shared/reviews";
import { formatDisplayDate } from "@shared/date-display";

type Filters = Record<string, string>;
const emptyFilters: Filters = {
  search: "",
  from: "",
  to: "",
  dateField: "response",
  source: "survey",
  sector: "",
  sectorMode: "all",
  surveyKind: "",
  area: "",
  actionArea: "",
  rating: "",
  sentiment: "",
  status: "",
  room: "",
  roomType: "",
  channel: "",
};
const selectClass =
  "box-border h-9 min-w-0 max-w-full w-full rounded-lg border bg-background px-3 text-sm";
function SelectField({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span>{label}</span>
      <select
        disabled={disabled}
        aria-label={label}
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
async function get<T>(url: string): Promise<T> {
  return (await apiRequest("GET", url)).json();
}
const invalidate = () =>
  queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
const stars = (n: number) => `${n} / 5 ★`;
const dispatchLabels: Record<string, string> = {
  queued: "Programada",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Falló el envío",
  unknown: "Envío sin confirmar",
  no_email: "Falta email",
  completed: "Finalizada",
};

export function ReviewsCenter() {
  const { hasPermission, user } = useAuth(),
    { toast } = useToast();
  const permittedSectors = permittedReviewSectors(hasPermission);
  const scopes = hasPermission("sidebar:/reviews")
    ? undefined
    : permittedSectors;
  const canManage =
      (hasPermission("api:reviews:manage") && (!scopes || scopes.length > 0)) ||
      permittedSectors.length > 0,
    canConfigure = hasPermission("api:reviews:configure");
  const canManageHotel =
    hasPermission("sidebar:/reviews") && hasPermission("api:reviews:manage");
  const [tab, setTab] = useState("opinions"),
    [filters, setFilters] = useState<Filters>(() => {
      const day = moveReviewDay(reviewToday(), -1);
      return { ...emptyFilters, from: day, to: day };
    }),
    [page, setPage] = useState(1);
  const [today, setToday] = useState(reviewToday);
  const [dayMode, setDayMode] = useState<ReviewDayMode>("yesterday");
  const [comment, setComment] = useState<ReviewItem | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setToday(reviewToday()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (dayMode !== "custom") setPage(1);
  }, [today, dayMode]);
  const period = reviewPeriod(dayMode, today, filters.from, filters.to);
  const chooseMode = (mode: ReviewDayMode) => {
    setDayMode(mode);
    setPage(1);
  };
  const chooseDates = (from: string, to: string) => {
    setDayMode("custom");
    setFilters((f) => ({ ...f, from, to }));
    setPage(1);
  };
  const [selected, setSelected] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("review"),
  );
  const search = useSearch();
  useEffect(() => {
    const id = new URLSearchParams(search).get("review");
    if (id) setSelected(id);
  }, [search]);
  const [manual, setManual] = useState(false),
    [editingArea, setEditingArea] = useState<ReviewArea | null>(null);
  const params = new URLSearchParams(
    Object.entries({ ...filters, ...period }).filter(([, v]) => v),
  );
  params.set("page", String(page));
  const urlParams = params.toString();
  const areas = useQuery<ReviewArea[]>({
    queryKey: ["/api/reviews", "areas"],
    queryFn: () => get("/api/reviews/areas"),
  });
  const options = useQuery<any>({
    queryKey: ["/api/reviews", "options"],
    queryFn: () => get("/api/reviews/options"),
  });
  const reviews = useQuery<{
    items: ReviewItem[];
    total: number;
    pageSize: number;
  }>({
    queryKey: ["/api/reviews", "list", urlParams],
    queryFn: () => get("/api/reviews?" + urlParams),
    refetchInterval: 30_000,
  });
  const analytics = useQuery<any>({
    queryKey: ["/api/reviews", "analytics", urlParams],
    queryFn: () => get("/api/reviews/analytics?" + urlParams),
    refetchInterval: 30_000,
  });
  const schedule = useQuery<any>({
    queryKey: ["/api/reviews", "schedule"],
    queryFn: () => get("/api/reviews/schedule"),
    enabled: tab === "areas",
  });
  const saveSchedule = useMutation({
    mutationFn: (data: any) =>
      apiRequest("PATCH", "/api/reviews/schedule", data),
    onSuccess: () => {
      void invalidate();
      toast({ title: "Horario de encuestas guardado" });
    },
    onError: (e: any) =>
      toast({
        title: "No se pudo guardar el horario",
        description: e.message,
        variant: "destructive",
      }),
  });
  const invitations = useQuery<any[]>({
    queryKey: ["/api/reviews", "invitations"],
    queryFn: () => get("/api/reviews/invitations"),
    enabled: tab === "invitations",
    refetchInterval: tab === "invitations" ? 30_000 : false,
  });
  const retry = useMutation({
    mutationFn: async (job: any) => {
      const uncertain = ["sent", "unknown"].includes(job.status);
      if (
        uncertain &&
        !window.confirm(
          "Este correo ya se envió o su envío no pudo confirmarse. ¿Querés reenviar la misma encuesta?",
        )
      )
        return false;
      await apiRequest(
        "POST",
        `/api/reservations/${job.reservationId}/survey-invitation`,
        { acknowledge: uncertain },
      );
      return true;
    },
    onSuccess: (sent) => {
      if (sent) {
        void invalidate();
        toast({
          title: "Encuesta programada para enviar en el próximo minuto",
        });
      }
    },
    onError: (e: any) =>
      toast({
        title: "No se pudo programar la encuesta",
        description: e.message,
        variant: "destructive",
      }),
  });
  const change = (key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const areaName = (key: string) =>
    areas.data?.find((a) => a.key === key)?.name || key;
  const inboxSectors = new Set(
    (reviews.data?.items || []).map((r) => r.sector || "hotel"),
  );
  const displaySector = (filters.sector ||
    (scopes?.length === 1 ? scopes[0] : undefined) ||
    (inboxSectors.size === 1 ? [...inboxSectors][0] : "hotel")) as SurveySector;
  const compactInbox =
    !filters.sector && (!scopes || scopes.length > 1) && inboxSectors.size > 1;
  const stats = analytics.data,
    monthData = Object.entries(stats?.months || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, value]: any) => ({ month, ...value }));
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 px-4 py-5 md:px-6 lg:py-6">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            Experiencia del huésped
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Reseñas y encuestas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Las respuestas de cada día, de un vistazo.
          </p>
        </div>
        {canManage && (
          <Button
            variant="outline"
            className="h-9 shrink-0 gap-2 rounded-lg bg-card"
            onClick={() => setManual(true)}
          >
            <Plus className="h-4 w-4" />
            Cargar opinión
          </Button>
        )}
      </header>
      <Tabs value={tab} onValueChange={setTab} className="min-w-0">
        <div className="max-w-full overflow-x-auto">
          <TabsList className="h-auto w-max min-w-full justify-start gap-5 rounded-none border-b bg-transparent p-0">
            {[
              ["opinions", "Encuestas recibidas"],
              ["overview", "Resumen"],
              ...(!scopes ? [["invitations", "Envíos"]] : []),
              ["links", "Enlaces para compartir"],
              ["areas", "Áreas y preguntas"],
            ].map(([key, label]) => (
              <TabsTrigger
                key={key}
                value={key}
                className="min-h-11 rounded-none border-b-2 border-transparent bg-transparent px-1 text-sm text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {["overview", "opinions"].includes(tab) && (
          <div className="mt-5 mb-5 min-w-0">
            <div
              className="mb-4 flex flex-wrap items-center gap-2"
              aria-label="Bandejas por sector"
            >
              <Button
                size="sm"
                variant={!filters.sector ? "default" : "outline"}
                onClick={() => change("sector", "")}
              >
                {scopes ? "Mi bandeja" : "Todas"}
              </Button>
              {Object.entries(surveySectors)
                .filter(
                  ([key]) => !scopes || scopes.includes(key as SurveySector),
                )
                .map(([key, label]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={filters.sector === key ? "default" : "outline"}
                    onClick={() => change("sector", key)}
                  >
                    {label}
                  </Button>
                ))}
              {filters.sector && (
                <select
                  aria-label="Opiniones del sector"
                  className="h-9 max-w-full rounded-lg border bg-background px-2 text-sm"
                  value={filters.sectorMode}
                  onChange={(e) => change("sectorMode", e.target.value)}
                >
                  <option value="all">Propias y derivadas</option>
                  <option value="origin">Del sector</option>
                  <option value="assigned">Derivadas de otros sectores</option>
                </select>
              )}
            </div>
            <ReviewInboxControls
              filters={filters}
              from={period.from}
              to={period.to}
              today={today}
              mode={dayMode}
              onMode={chooseMode}
              onDates={chooseDates}
              onChange={change}
              onClear={() => {
                setFilters({
                  ...emptyFilters,
                  from: period.from,
                  to: period.to,
                });
                setPage(1);
              }}
              areas={areas.data || []}
              options={options.data}
            />
          </div>
        )}
        <TabsContent value="overview" className="space-y-4">
          {analytics.isError && (
            <p role="alert">
              No se pudo cargar el resumen.{" "}
              <Button variant="ghost" onClick={() => analytics.refetch()}>
                Reintentar
              </Button>
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Opiniones", stats?.count],
              [
                "Calificación general",
                stats?.average == null
                  ? "Sin respuestas"
                  : `${stats.average} / 5`,
              ],
              ["Casos abiertos", stats?.pending],
              [
                "NPS",
                stats?.nps == null
                  ? "Sin respuestas"
                  : `${stats.nps} (${stats.npsCount} respuestas)`,
              ],
            ].map(([label, value]) => (
              <Card key={label as string}>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold">{value ?? "—"}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Resultados por sector de origen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th>Sector</th>
                    <th>Respuestas</th>
                    <th>Calificación general</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(surveySectors)
                    .filter(
                      ([key]) =>
                        !scopes ||
                        scopes.includes(key as SurveySector) ||
                        stats?.sectors?.[key]?.count > 0,
                    )
                    .map(([key, name]) => (
                      <tr key={key} className="border-t">
                        <td className="py-2">{name}</td>
                        <td>{stats?.sectors?.[key]?.count ?? 0}</td>
                        <td>
                          {stats?.sectors?.[key]?.average == null
                            ? "—"
                            : `${stats.sectors[key].average} / 5`}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                {stats?.personal ?? 0} encuestas vinculadas a una estadía ·{" "}
                {stats?.generic ?? 0} respuestas por enlace genérico. Los casos
                derivados conservan su sector de origen.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Puntajes por área</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th>Área</th>
                    <th>Promedio</th>
                    <th>Respuestas</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats?.areas || {}).map(
                    ([key, value]: any) => (
                      <tr key={key} className="border-t">
                        <td className="py-2">{areaName(key)}</td>
                        <td>{value.average} / 5</td>
                        <td>{value.count}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              {!Object.keys(stats?.areas || {}).length && (
                <p className="text-muted-foreground py-3">
                  Todavía no hay puntajes por área.
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                “No corresponde” no cuenta como cero. Una encuesta cuenta como
                una opinión.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Evolución mensual</CardTitle>
            </CardHeader>
            <CardContent>
              {monthData.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis domain={[1, 5]} />
                      <Tooltip />
                      <Line
                        isAnimationActive={false}
                        type="monotone"
                        dataKey="average"
                        name="Promedio"
                        stroke="#176099"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Se mostrará al recibir opiniones.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Encuestas enviadas y respondidas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl">
                {stats?.invitations?.sent ?? 0} enviadas ·{" "}
                {stats?.invitations?.responded ?? 0} respondidas ·{" "}
                {stats?.invitations?.responseRate == null
                  ? stats?.invitations?.applicable === false
                    ? "No aplica a esta bandeja"
                    : "Sin tasa todavía"
                  : `${stats.invitations.responseRate}% de respuesta`}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Solo invitaciones personales de Hotel por fecha de envío (correo
                o WhatsApp registrado), sin contar dos veces una misma estadía.
                No depende de los filtros de área, puntaje ni estado. “Enviada”
                confirma que el proveedor aceptó el correo, no su entrega.
                Copiar un enlace genérico no aumenta las invitaciones.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="opinions" className="min-w-0 space-y-4">
          <ReviewInboxTable
            items={reviews.data?.items || []}
            areas={(areas.data || []).filter((a) =>
              (a.sectors || ["hotel"]).includes(displaySector),
            )}
            compact={compactInbox}
            restrictToAreas={!!filters.sector || scopes?.length === 1}
            total={reviews.data?.total || 0}
            page={page}
            loading={reviews.isLoading}
            error={reviews.isError}
            stats={stats}
            onView={setSelected}
            onComment={setComment}
            onPage={setPage}
            onRetry={() => reviews.refetch()}
            onToday={() => chooseMode("today")}
            showToday={dayMode !== "today"}
            dateRange={period.from !== period.to}
          />
        </TabsContent>
        <TabsContent value="links">
          <SurveySectorLinks canConfigure={canConfigure} />
        </TabsContent>
        <TabsContent value="invitations" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Últimos 200 envíos. Los pendientes se conservan al reiniciar. Un
            resultado sin confirmar requiere revisión antes de reenviar.
          </p>
          {invitations.isError && (
            <p role="alert">No se pudieron cargar los envíos.</p>
          )}
          {invitations.isLoading && <p>Cargando envíos…</p>}
          {!invitations.isLoading && !invitations.data?.length && (
            <p>
              No hay encuestas programadas todavía. Se generarán con las
              próximas salidas.
            </p>
          )}
          {invitations.data?.map((j) => (
            <Card key={j.id}>
              <CardContent className="p-4 flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <strong>{j.guestName}</strong> · Hab. {j.roomNumber}
                  <p className="text-sm">
                    {dispatchLabels[j.status]} ·{" "}
                    {formatHotelDateTime(j.sentAt || j.scheduledFor)}
                  </p>
                  {j.lastError && (
                    <p className="text-sm text-destructive">{j.lastError}</p>
                  )}
                </div>
                {canManageHotel && j.status !== "completed" && (
                  <PersonalSurveySharing reservationId={j.reservationId} />
                )}
                {j.sharedAt && (
                  <p className="text-xs">
                    Compartida por WhatsApp: {formatHotelDateTime(j.sharedAt)}
                  </p>
                )}
                {canManageHotel &&
                  !["completed", "sending", "queued"].includes(j.status) && (
                    <Button
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(j)}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {j.status === "sent" ? "Reenviar encuesta" : "Reintentar"}
                    </Button>
                  )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="areas" className="space-y-3">
          <SurveyScheduleSettings
            cfg={schedule.data}
            onSave={(data) => saveSchedule.mutate(data)}
          />
          <p className="text-sm text-muted-foreground">
            Las áreas evaluadas y las que deben intervenir se eligen por
            separado. Desactivar una pregunta conserva sus respuestas
            anteriores.
          </p>
          {canConfigure && (
            <Button
              onClick={() =>
                setEditingArea({
                  key: "",
                  name: "",
                  question: "",
                  active: true,
                  inSurvey: true,
                  sortOrder: 10,
                  notificationArea: "reception",
                })
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar área
            </Button>
          )}
          {areas.data?.map((a) => (
            <Card key={a.key}>
              <CardContent className="p-4 flex justify-between gap-3">
                <div>
                  <strong>{a.name}</strong>
                  <p className="text-sm">{a.question}</p>
                  <p className="text-xs text-muted-foreground">
                    {!a.active
                      ? "Desactivada"
                      : a.inSurvey
                        ? "Visible en la encuesta"
                        : "Solo para seguimiento"}{" "}
                    ·{" "}
                    {(a.sectors || ["hotel"])
                      .map((k) => surveySectors[k])
                      .join(" · ")}{" "}
                    · Avisos: {a.notificationArea}
                  </p>
                </div>
                {canConfigure && (
                  <Button variant="outline" onClick={() => setEditingArea(a)}>
                    <Settings2 className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
      {comment && (
        <ReviewComment
          review={comment}
          onClose={() => setComment(null)}
          onDetail={() => {
            setSelected(comment.id);
            setComment(null);
          }}
        />
      )}
      {selected && (
        <ReviewDetail
          id={selected}
          areas={areas.data || []}
          canManage={canManage}
          onClose={() => {
            setSelected(null);
            const url = new URL(window.location.href);
            url.searchParams.delete("review");
            window.history.replaceState(
              window.history.state,
              "",
              url.pathname + url.search,
            );
          }}
        />
      )}
      {manual && (
        <ManualReview
          areas={areas.data || []}
          onClose={() => setManual(false)}
        />
      )}
      {editingArea && (
        <AreaEditor area={editingArea} onClose={() => setEditingArea(null)} />
      )}
    </div>
  );
}

function ReviewDetail({
  id,
  areas,
  canManage,
  onClose,
}: {
  id: string;
  areas: ReviewArea[];
  canManage: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const detail = useQuery<{ review: ReviewItem; events: any[] }>({
    queryKey: ["/api/reviews", "detail", id],
    queryFn: () => get("/api/reviews/" + id),
  });
  const [status, setStatus] = useState("new"),
    [assigned, setAssigned] = useState(""),
    [actionAreas, setActionAreas] = useState<string[]>([]),
    [note, setNote] = useState("");
  useEffect(() => {
    if (detail.data) {
      setStatus(detail.data.review.followupStatus);
      setAssigned(detail.data.review.assignedTo || "");
      setActionAreas(detail.data.review.actionAreas);
    }
  }, [detail.data]);
  const save = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/reviews/${id}/followup`, {
        status,
        assignedTo: assigned || null,
        actionAreas,
        note,
      }),
    onSuccess: () => {
      setNote("");
      void invalidate();
      toast({ title: "Seguimiento guardado" });
    },
    onError: (e: any) =>
      toast({
        title: "No se pudo guardar",
        description: e.message,
        variant: "destructive",
      }),
  });
  const r = detail.data?.review;
  const globallyManaged =
    hasPermission("sidebar:/reviews") && hasPermission("api:reviews:manage");
  const writable = permittedReviewSectors(hasPermission);
  const canEditCase =
    canManage &&
    (globallyManaged ||
      (!!r &&
        writable.some(
          (s) =>
            r.sector === s ||
            areas.some(
              (a) =>
                r.actionAreas.includes(a.key) &&
                a.notificationArea === surveySectorTargets[s],
            ),
        )));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Opinión y seguimiento</DialogTitle>
        </DialogHeader>
        {detail.isLoading && <p>Cargando…</p>}
        {detail.isError && <p role="alert">No se pudo abrir la opinión.</p>}
        {r && (
          <div className="space-y-5">
            <section className="space-y-2">
              <strong>
                {r.guestName} · {stars(r.rating)}
              </strong>
              <p className="text-sm text-muted-foreground">
                {reviewSources[r.source as keyof typeof reviewSources] ||
                  r.source}{" "}
                · {formatDisplayDate(r.reviewDate)} · Hab. {r.roomNumber || "—"}
              </p>
              <p className="text-sm">
                {r.sector ? surveySectors[r.sector] : "Sin sector"} ·{" "}
                {r.surveyKind === "generic"
                  ? "Enlace genérico"
                  : r.surveyKind === "personal"
                    ? "Vinculada a una estadía"
                    : "Opinión registrada"}
              </p>
              <p className="text-sm">
                {r.surveyKind === "generic"
                  ? `Visita: ${formatDisplayDate(r.visitDate)}`
                  : `Estadía: ${formatDisplayDate(r.checkIn)} al ${formatDisplayDate(r.checkOut)}`}
              </p>
              {r.eventName && <p className="text-sm">Evento: {r.eventName}</p>}
              {(r.contactEmail || r.contactPhone) && (
                <p className="text-sm break-words">
                  Contacto:{" "}
                  {[r.contactEmail, r.contactPhone].filter(Boolean).join(" · ")}
                </p>
              )}
              <h3 className="font-medium">Respuesta original del huésped</h3>
              <blockquote className="rounded bg-muted p-3 whitespace-pre-wrap">
                {r.content || "Sin comentario escrito."}
              </blockquote>
              <div className="flex flex-wrap gap-2">
                {Object.entries(r.areaRatings).map(([k, v]) => (
                  <Badge key={k} variant="outline">
                    {areas.find((a) => a.key === k)?.name || k}: {v}/5
                  </Badge>
                ))}
              </div>
              {r.nps !== null && <p>Recomendación: {r.nps}/10</p>}
              {r.contactRequested && (
                <p className="font-medium">
                  Solicitó que el hotel lo contacte.
                </p>
              )}
              {r.staffResponse && (
                <p>Respuesta previa del equipo: {r.staffResponse}</p>
              )}
            </section>
            {Object.keys(r.areaQuestions || {}).length > 0 && (
              <details>
                <summary className="text-sm cursor-pointer">
                  Preguntas que respondió el huésped
                </summary>
                {Object.entries(r.areaQuestions).map(([key, question]) => (
                  <p key={key} className="text-sm mt-2">
                    {question}: {r.areaRatings[key]}/5
                  </p>
                ))}
              </details>
            )}
            <section className="space-y-3 border-t pt-4">
              <h3 className="font-semibold">Gestión interna</h3>
              <p className="text-xs text-muted-foreground">
                Estas notas no modifican la opinión original y no se envían al
                huésped.
              </p>
              <SelectField
                label="Estado del caso"
                disabled={!canEditCase}
                value={status}
                onChange={setStatus}
              >
                {Object.entries(reviewStates).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </SelectField>
              <label className="block text-sm space-y-1">
                Responsable
                <Input
                  aria-label="Responsable"
                  disabled={!canEditCase}
                  value={assigned}
                  onChange={(e) => setAssigned(e.target.value)}
                  placeholder="Nombre o equipo responsable"
                  maxLength={160}
                />
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Áreas que deben intervenir
                </legend>
                <div className="flex flex-wrap gap-3">
                  {areas.map((a) => (
                    <label
                      key={a.key}
                      className="text-sm flex items-center gap-1"
                    >
                      <Checkbox
                        disabled={!canEditCase}
                        checked={actionAreas.includes(a.key)}
                        onCheckedChange={(v) =>
                          setActionAreas((p) =>
                            v === true
                              ? [...p, a.key]
                              : p.filter((k) => k !== a.key),
                          )
                        }
                      />
                      {a.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              {canEditCase && (
                <>
                  <label className="block text-sm space-y-1">
                    Nota interna
                    <Textarea
                      aria-label="Nota interna"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={5000}
                    />
                  </label>
                  <Button
                    disabled={save.isPending}
                    onClick={() => save.mutate()}
                  >
                    Guardar seguimiento
                  </Button>
                </>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="font-medium">Historial</h3>
              {detail.data?.events.map((e) => (
                <div key={e.id} className="border-l-2 pl-3 text-sm">
                  <p className="text-muted-foreground">
                    {formatHotelDateTime(e.createdAt)} · {e.actor}
                  </p>
                  <p>
                    {e.kind === "received"
                      ? "Encuesta recibida"
                      : e.kind === "created"
                        ? "Opinión registrada"
                        : `Seguimiento: ${reviewStates[e.details.status as keyof typeof reviewStates] || e.details.status}`}
                  </p>
                  {e.details.assignedTo && (
                    <p>Responsable: {e.details.assignedTo}</p>
                  )}
                  {e.details.note && (
                    <p className="whitespace-pre-wrap">{e.details.note}</p>
                  )}
                </div>
              ))}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManualReview({
  areas,
  onClose,
}: {
  areas: ReviewArea[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const managed = permittedReviewSectors(hasPermission);
  const scopes =
    hasPermission("sidebar:/reviews") && hasPermission("api:reviews:manage")
      ? undefined
      : managed;
  const [sector, setSector] = useState<SurveySector>(scopes?.[0] || "hotel");
  const [guestName, setGuestName] = useState("");
  const [search, setSearch] = useState(""),
    [delayed, setDelayed] = useState(""),
    [reservationId, setReservationId] = useState(""),
    [source, setSource] = useState("direct"),
    [rating, setRating] = useState(""),
    [content, setContent] = useState(""),
    [areaRatings, setAreaRatings] = useState<Record<string, number>>({});
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date()),
  );
  useEffect(() => {
    const t = setTimeout(() => setDelayed(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const stays = useQuery<any[]>({
    queryKey: ["/api/reviews", "stays", delayed],
    enabled: !scopes,
    queryFn: () =>
      get("/api/reviews/stays?search=" + encodeURIComponent(delayed)),
  });
  const save = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/reviews", {
        reservationId: reservationId || null,
        ...(guestName.trim() ? { guestName: guestName.trim() } : {}),
        source,
        sector,
        rating: Number(rating),
        reviewDate: date,
        content,
        areaRatings,
      }),
    onSuccess: () => {
      void invalidate();
      onClose();
      toast({ title: "Opinión registrada" });
    },
    onError: (e: any) =>
      toast({
        title: "No se pudo registrar",
        description: e.message,
        variant: "destructive",
      }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar opinión</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Google y Booking se registran manualmente. Esto no publica ni descarga
          opiniones de esos sitios.
        </p>
        {!scopes && (
          <>
            <label className="text-sm">
              Buscar huésped o reserva
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setReservationId("");
                }}
                placeholder="Apellido, habitación o reserva"
              />
            </label>
            <SelectField
              label="Estadía"
              value={reservationId}
              onChange={setReservationId}
            >
              <option value="">Sin estadía vinculada</option>
              {stays.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.guestName} · Hab. {r.roomNumber} ·{" "}
                  {formatDisplayDate(r.checkIn)} al{" "}
                  {formatDisplayDate(r.checkOut)}
                </option>
              ))}
            </SelectField>
          </>
        )}
        {!reservationId && (
          <label className="text-sm">
            {scopes ? "Nombre del cliente" : "Nombre del huésped"}
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={160}
              placeholder="Nombre tal como aparece en la opinión"
            />
          </label>
        )}
        <SelectField
          label="Sector de origen"
          value={sector}
          onChange={(value) => setSector(value as SurveySector)}
          disabled={scopes?.length === 1}
        >
          {Object.entries(surveySectors)
            .filter(([key]) => !scopes || scopes.includes(key as SurveySector))
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </SelectField>
        <SelectField
          label="Origen de la opinión"
          value={source}
          onChange={setSource}
        >
          {Object.entries(reviewSources)
            .filter(([k]) => k !== "survey")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </SelectField>
        <label className="text-sm">
          Fecha de la opinión
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <SelectField
          label="Puntaje general"
          value={rating}
          onChange={setRating}
        >
          <option value="">Elegir puntaje</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {stars(n)}
            </option>
          ))}
        </SelectField>
        <label className="text-sm">
          Comentario
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={5000}
          />
        </label>
        <details>
          <summary className="text-sm cursor-pointer">
            Puntajes por área (opcionales)
          </summary>
          <div className="space-y-2 mt-2">
            {areas
              .filter((a) => a.active)
              .map((a) => (
                <SelectField
                  key={a.key}
                  label={a.name}
                  value={String(areaRatings[a.key] || "")}
                  onChange={(v) =>
                    setAreaRatings((p) => {
                      const next = { ...p };
                      if (v) next[a.key] = Number(v);
                      else delete next[a.key];
                      return next;
                    })
                  }
                >
                  <option value="">Sin evaluar</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {stars(n)}
                    </option>
                  ))}
                </SelectField>
              ))}
          </div>
        </details>
        <Button
          disabled={
            save.isPending ||
            (!reservationId && guestName.trim().length < 2) ||
            !rating ||
            !content.trim() ||
            !date
          }
          onClick={() => save.mutate()}
        >
          Guardar opinión
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function AreaEditor({
  area,
  onClose,
}: {
  area: ReviewArea;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState({
    ...area,
    sectors: area.sectors || (["hotel"] as SurveySector[]),
  });
  const save = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reviews/areas", draft),
    onSuccess: () => {
      void invalidate();
      onClose();
      toast({ title: "Área guardada" });
    },
    onError: (e: any) =>
      toast({
        title: "No se pudo guardar el área",
        description: e.message,
        variant: "destructive",
      }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{area.key ? "Editar área" : "Agregar área"}</DialogTitle>
        </DialogHeader>
        <label className="text-sm">
          Nombre
          <Input
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            maxLength={80}
          />
        </label>
        {!area.key && (
          <label className="text-sm">
            Identificador (letras, números y guion bajo)
            <Input
              value={draft.key}
              onChange={(e) =>
                setDraft((p) => ({ ...p, key: e.target.value.toLowerCase() }))
              }
              placeholder="ejemplo: desayuno"
            />
          </label>
        )}
        <label className="text-sm">
          Pregunta
          <Input
            value={draft.question}
            onChange={(e) =>
              setDraft((p) => ({ ...p, question: e.target.value }))
            }
            maxLength={250}
          />
        </label>
        <label className="text-sm">
          Orden
          <Input
            type="number"
            min={0}
            max={100}
            value={draft.sortOrder}
            onChange={(e) =>
              setDraft((p) => ({ ...p, sortOrder: Number(e.target.value) }))
            }
          />
        </label>
        <SelectField
          label="Destino del aviso por puntaje bajo"
          value={draft.notificationArea}
          onChange={(v) => setDraft((p) => ({ ...p, notificationArea: v }))}
        >
          {[
            ["reception", "Recepción"],
            ["housekeeping", "Housekeeping"],
            ["maintenance", "Mantenimiento"],
            ["restaurant", "Restaurante"],
            ["spa", "Spa"],
            ["events", "Eventos"],
          ].map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Encuestas donde aparece
          </legend>
          <div className="flex flex-wrap gap-3">
            {Object.entries(surveySectors).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.sectors.includes(key as SurveySector)}
                  onCheckedChange={(value) =>
                    setDraft((p) => ({
                      ...p,
                      sectors:
                        value === true
                          ? [...p.sectors, key as SurveySector]
                          : p.sectors.filter((k) => k !== key),
                    }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex gap-2 text-sm">
          <Checkbox
            checked={draft.active}
            onCheckedChange={(v) =>
              setDraft((p) => ({ ...p, active: v === true }))
            }
          />
          Área activa
        </label>
        <label className="flex gap-2 text-sm">
          <Checkbox
            checked={draft.inSurvey}
            onCheckedChange={(v) =>
              setDraft((p) => ({ ...p, inSurvey: v === true }))
            }
          />
          Preguntar al huésped en la encuesta
        </label>
        <Button
          disabled={
            save.isPending ||
            !draft.name ||
            !draft.question ||
            !draft.key ||
            !draft.sectors.length
          }
          onClick={() => save.mutate()}
        >
          Guardar área
        </Button>
      </DialogContent>
    </Dialog>
  );
}
