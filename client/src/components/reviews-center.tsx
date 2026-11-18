import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
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
  source: "",
  area: "",
  actionArea: "",
  rating: "",
  sentiment: "",
  status: "",
  room: "",
  roomType: "",
  channel: "",
};
const selectClass = "h-10 rounded-md border bg-background px-3 text-sm w-full";
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
    <label className="space-y-1 text-sm">
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
  const { hasPermission } = useAuth(),
    { toast } = useToast();
  const canManage = hasPermission("api:reviews:manage"),
    canConfigure = hasPermission("api:reviews:configure");
  const [tab, setTab] = useState("overview"),
    [filters, setFilters] = useState<Filters>(emptyFilters),
    [page, setPage] = useState(1);
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
    Object.entries(filters).filter(([, v]) => v),
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
  const stats = analytics.data,
    monthData = Object.entries(stats?.months || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, value]: any) => ({ month, ...value }));
  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageSquare />
            Reseñas y encuestas
          </h1>
          <p className="text-muted-foreground">
            La experiencia del huésped y su seguimiento en un solo lugar.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setManual(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Cargar opinión
          </Button>
        )}
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="opinions">Opiniones y encuestas</TabsTrigger>
          <TabsTrigger value="invitations">Envíos</TabsTrigger>
          <TabsTrigger value="areas">Áreas y preguntas</TabsTrigger>
        </TabsList>
        {["overview", "opinions"].includes(tab) && (
          <Card className="mt-4">
            <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-sm">
                Buscar
                <Input
                  aria-label="Buscar opiniones"
                  placeholder="Huésped, comentario o reserva"
                  value={filters.search}
                  onChange={(e) => change("search", e.target.value)}
                />
              </label>
              <SelectField
                label="Fecha a filtrar"
                value={filters.dateField}
                onChange={(v) => change("dateField", v)}
              >
                <option value="response">Fecha de respuesta</option>
                <option value="stay">Fecha de salida</option>
              </SelectField>
              <label className="space-y-1 text-sm">
                Desde
                <Input
                  type="date"
                  aria-label="Desde"
                  value={filters.from}
                  onChange={(e) => change("from", e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                Hasta
                <Input
                  type="date"
                  aria-label="Hasta"
                  value={filters.to}
                  onChange={(e) => change("to", e.target.value)}
                />
              </label>
              <SelectField
                label="Origen"
                value={filters.source}
                onChange={(v) => change("source", v)}
              >
                <option value="">Todos</option>
                {Object.entries(reviewSources).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Área evaluada"
                value={filters.area}
                onChange={(v) => change("area", v)}
              >
                <option value="">Todas</option>
                {areas.data?.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Calificación general"
                value={filters.rating}
                onChange={(v) => change("rating", v)}
              >
                <option value="">Todas</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {stars(n)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Seguimiento"
                value={filters.status}
                onChange={(v) => change("status", v)}
              >
                <option value="">Todos</option>
                {Object.entries(reviewStates).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Área que interviene"
                value={filters.actionArea}
                onChange={(v) => change("actionArea", v)}
              >
                <option value="">Todas</option>
                {areas.data?.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Valoración"
                value={filters.sentiment}
                onChange={(v) => change("sentiment", v)}
              >
                <option value="">Todas</option>
                <option value="positive">Positiva</option>
                <option value="neutral">Neutra</option>
                <option value="negative">Negativa</option>
              </SelectField>
              <SelectField
                label="Habitación"
                value={filters.room}
                onChange={(v) => change("room", v)}
              >
                <option value="">Todas</option>
                {options.data?.rooms?.map((r: any) => (
                  <option key={r.number}>{r.number}</option>
                ))}
              </SelectField>
              <SelectField
                label="Tipo de habitación"
                value={filters.roomType}
                onChange={(v) => change("roomType", v)}
              >
                <option value="">Todos</option>
                {options.data?.roomTypes?.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Canal de la reserva"
                value={filters.channel}
                onChange={(v) => change("channel", v)}
              >
                <option value="">Todos</option>
                {options.data?.channels?.map((r: any) => (
                  <option key={r.source}>{r.source}</option>
                ))}
              </SelectField>
              <Button
                variant="ghost"
                onClick={() => {
                  setFilters(emptyFilters);
                  setPage(1);
                }}
              >
                Limpiar filtros
              </Button>
            </CardContent>
          </Card>
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
                  ? "Sin tasa todavía"
                  : `${stats.invitations.responseRate}% de respuesta`}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Por fecha de envío, entre las fechas elegidas. No depende de los
                filtros de área, puntaje ni estado. “Enviada” confirma que el
                proveedor aceptó el correo, no su entrega.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="opinions" className="space-y-3">
          {reviews.isLoading && <p>Cargando opiniones…</p>}
          {reviews.isError && (
            <p role="alert">
              No se pudieron cargar las opiniones.{" "}
              <Button onClick={() => reviews.refetch()}>Reintentar</Button>
            </p>
          )}
          {!reviews.isLoading &&
            !reviews.isError &&
            !reviews.data?.items.length && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No hay opiniones para estos filtros.
                </CardContent>
              </Card>
            )}
          {reviews.data?.items.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{r.guestName}</strong>
                    <Badge variant="outline">
                      {reviewSources[r.source as keyof typeof reviewSources] ||
                        r.source}
                    </Badge>
                    <Badge
                      variant={
                        needsReviewFollowup(
                          r.rating,
                          r.areaRatings,
                          r.contactRequested,
                        ) && r.followupStatus !== "resolved"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {reviewStates[r.followupStatus]}
                    </Badge>
                  </div>
                  <span className="text-amber-600 font-medium">
                    {stars(r.rating)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDisplayDate(r.reviewDate)}
                  {r.roomNumber && ` · Hab. ${r.roomNumber}`}
                  {r.checkIn &&
                    ` · Estadía ${formatDisplayDate(r.checkIn)} al ${formatDisplayDate(r.checkOut)}`}
                </p>
                {r.content ? (
                  <p className="line-clamp-3 whitespace-pre-wrap">
                    {r.content}
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Encuesta sin comentario escrito.
                  </p>
                )}
                {r.contactRequested && (
                  <p className="text-sm flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    El huésped pidió que lo contacten.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(r.areaRatings).map(([key, value]) => (
                    <Badge key={key} variant="outline">
                      {areaName(key)}: {value}/5
                    </Badge>
                  ))}
                </div>
                <Button variant="outline" onClick={() => setSelected(r.id)}>
                  Ver opinión y seguimiento
                </Button>
              </CardContent>
            </Card>
          ))}
          {!!reviews.data?.total && (
            <div className="flex items-center justify-between">
              <span className="text-sm">
                {reviews.data.total} opiniones · Página {page}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  disabled={page * 50 >= reviews.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
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
                {canManage &&
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
                Estadía: {formatDisplayDate(r.checkIn)} al{" "}
                {formatDisplayDate(r.checkOut)}
              </p>
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
                disabled={!canManage}
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
                  disabled={!canManage}
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
                        disabled={!canManage}
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
              {canManage && (
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
    queryFn: () =>
      get("/api/reviews/stays?search=" + encodeURIComponent(delayed)),
  });
  const save = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/reviews", {
        reservationId: reservationId || null,
        ...(guestName.trim() ? { guestName: guestName.trim() } : {}),
        source,
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
              {formatDisplayDate(r.checkIn)} al {formatDisplayDate(r.checkOut)}
            </option>
          ))}
        </SelectField>
        {!reservationId && (
          <label className="text-sm">
            Nombre del huésped
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={160}
              placeholder="Nombre tal como aparece en la opinión"
            />
          </label>
        )}
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
  const [draft, setDraft] = useState(area);
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
          ].map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
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
            save.isPending || !draft.name || !draft.question || !draft.key
          }
          onClick={() => save.mutate()}
        >
          Guardar área
        </Button>
      </DialogContent>
    </Dialog>
  );
}
