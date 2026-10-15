import revenueGuideUrl from "@/assets/guias/tutorial-revenue-management.pdf?url";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/App";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getArgentinaToday } from "@/lib/date-utils";
import { addCalendarDays } from "@shared/nightAuditDate";
import { formatDisplayDate } from "@shared/date-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value || 0);
}

type RevenueDayMetrics = {
  date: string;
  isForecast: boolean;
  roomsAvailable: number;
  roomsSold: number;
  ratedRoomNights: number;
  roomsWithMissingRate: number;
  occupancyPct: number;
  directRoomRevenue: number;
  otherGroupChargesRevenue: number;
  totalRevenue: number;
  adr: number;
  revpar: number;
};

const RATE_SOURCE_LABELS: Record<string, string> = {
  final_rate_per_night: "Tarifa directa",
  total_room_amount_prorated: "Prorrateada (monto total / noches)",
  group_block_agreed_rate: "Tarifa pactada de grupo (por noche)",
  zero_with_reason: "$0 confirmado (cortesía/canje)",
  missing_rate: "Sin tarifa — dato faltante",
};

type RevenueDayDetail = RevenueDayMetrics & {
  reservations: Array<{ reservationId: string; roomId: string; roomNumber: string; status: string; nightlyRate: number; rateSource: string; countsForAdr: boolean }>;
  groupCharges: Array<{ id: string; groupId: string; description: string; amount: number; category: string }>;
};

type DemandEvent = {
  id: string; name: string; startDate: string; endDate: string;
  category: "feriado" | "evento_ciudad" | "otro"; impact: "alto" | "medio" | "bajo"; notes: string | null;
};

type CompetitorRate = {
  id: string; competitorName: string; roomTypeId: string | null; stayDate: string;
  rate: string; currency: string; refundable: boolean | null; occupancy: number | null;
  breakfastIncluded: boolean | null; taxesIncluded: boolean | null; sourceNote: string | null;
};

type RoomType = { id: string; name: string };

type RateSuggestion = {
  date: string; direction: "subir" | "bajar" | "mantener"; suggestedChangePct: number;
  reasons: string[]; disclaimer: string;
};

type SuggestionConfig = {
  id: number; highOccupancyThresholdPct: string; lowOccupancyThresholdPct: string;
  increaseSuggestionPct: string; decreaseSuggestionPct: string;
  considerDemandEvents: boolean; considerCompetitorRates: boolean;
};

const CATEGORY_LABELS: Record<string, string> = { feriado: "Feriado", evento_ciudad: "Evento de ciudad", otro: "Otro" };
const IMPACT_LABELS: Record<string, string> = { alto: "Alto", medio: "Medio", bajo: "Bajo" };
const DIRECTION_LABELS: Record<string, string> = { subir: "Subir", bajar: "Bajar", mantener: "Mantener" };

export default function RevenueManagementPage() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const canWriteEvents = hasPermission("api:revenue:events-write");
  const canWriteCompetitor = hasPermission("api:revenue:competitor-write");
  const canConfigure = hasPermission("api:revenue:configure");

  const today = getArgentinaToday();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addCalendarDays(today, 90));

  function resetNext90() {
    setFrom(today);
    setTo(addCalendarDays(today, 90));
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-revenue-management">
      <div>
        <h1 className="text-2xl font-bold">Revenue Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tablero de ocupación/ADR/RevPAR, pace report, calendario de demanda y tarifas de competencia cargadas a mano.
          Las sugerencias de tarifa son siempre informativas: no se aplican solas.
        </p>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label htmlFor="rm-from">Desde</Label>
          <Input id="rm-from" type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label htmlFor="rm-to">Hasta</Label>
          <Input id="rm-to" type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" onClick={resetNext90} data-testid="button-next-90-days">Próximos 90 días</Button>
      </div>

      <Tabs defaultValue="tablero">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="tablero" data-testid="tab-tablero">Tablero</TabsTrigger>
            <TabsTrigger value="pace" data-testid="tab-pace">Pace</TabsTrigger>
            <TabsTrigger value="demanda" data-testid="tab-demanda">Calendario de demanda</TabsTrigger>
            <TabsTrigger value="competencia" data-testid="tab-competencia">Tarifas de competencia</TabsTrigger>
            <TabsTrigger value="sugerencias" data-testid="tab-sugerencias">Sugerencias</TabsTrigger>
          </TabsList>
          <Button asChild variant="outline" size="sm">
            <a href={revenueGuideUrl} target="_blank" rel="noopener noreferrer" data-testid="button-revenue-guide" aria-label="Abrir guía de uso de Revenue Management en PDF (nueva pestaña)">
              Guía de uso PDF
            </a>
          </Button>
        </div>

        <TabsContent value="tablero">
          <BoardTab from={from} to={to} />
        </TabsContent>
        <TabsContent value="pace">
          <PaceTab defaultDate={addCalendarDays(today, 30)} />
        </TabsContent>
        <TabsContent value="demanda">
          <DemandEventsTab from={from} to={to} canWrite={canWriteEvents} toast={toast} />
        </TabsContent>
        <TabsContent value="competencia">
          <CompetitorRatesTab from={from} to={to} canWrite={canWriteCompetitor} toast={toast} />
        </TabsContent>
        <TabsContent value="sugerencias">
          <SuggestionsTab from={from} to={to} canConfigure={canConfigure} toast={toast} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== TABLERO ====================

function BoardTab({ from, to }: { from: string; to: string }) {
  const [detailDate, setDetailDate] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ from: string; to: string; days: RevenueDayMetrics[] }>({
    queryKey: ["/api/revenue/board", from, to],
    queryFn: async () => (await apiRequest("GET", `/api/revenue/board?from=${from}&to=${to}`)).json(),
  });

  const summary = useMemo(() => {
    const days = data?.days || [];
    if (days.length === 0) return null;
    const totalRevenue = days.reduce((s, d) => s + d.totalRevenue, 0);
    const totalSold = days.reduce((s, d) => s + d.roomsSold, 0);
    const totalRated = days.reduce((s, d) => s + d.ratedRoomNights, 0);
    const totalMissingRate = days.reduce((s, d) => s + d.roomsWithMissingRate, 0);
    const totalAvailable = days.reduce((s, d) => s + d.roomsAvailable, 0);
    return {
      occupancyPct: totalAvailable > 0 ? (totalSold / totalAvailable) * 100 : 0,
      totalRevenue,
      adr: totalRated > 0 ? totalRevenue / totalRated : 0,
      revpar: totalAvailable > 0 ? totalRevenue / totalAvailable : 0,
      totalMissingRate,
    };
  }, [data]);

  return (
    <div className="space-y-4 mt-4">
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Ocupación promedio</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{summary.occupancyPct.toFixed(1)}%</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Ingreso total del período</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{formatCurrency(summary.totalRevenue)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">ADR promedio</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{formatCurrency(summary.adr)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">RevPAR promedio</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{formatCurrency(summary.revpar)}</div></CardContent>
          </Card>
        </div>
      ) : null}

      {summary && summary.totalMissingRate > 0 && (
        <Card className="border-amber-300">
          <CardContent className="pt-4 text-sm text-muted-foreground">
            {summary.totalMissingRate} habitación-noche(s) en este rango no tienen tarifa determinable (ni tarifa directa, ni monto
            total, ni tarifa pactada de grupo, ni motivo de $0) — cuentan para ocupación pero se excluyen del cálculo de ADR para no
            diluirlo con un dato desconocido. Revisá el detalle de cada día para identificarlas.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Ocupación</TableHead>
                <TableHead>Vendidas/Disp.</TableHead>
                <TableHead>ADR</TableHead>
                <TableHead>RevPAR</TableHead>
                <TableHead>Ingreso total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.days || []).map(day => (
                <TableRow key={day.date} data-testid={`row-board-${day.date}`}>
                  <TableCell>
                    {formatDisplayDate(day.date)}
                    {day.isForecast && <Badge variant="outline" className="ml-2">forecast</Badge>}
                  </TableCell>
                  <TableCell>
                    {day.occupancyPct.toFixed(0)}%
                    {day.roomsWithMissingRate > 0 && (
                      <Badge variant="outline" className="ml-2 text-amber-700 border-amber-400">{day.roomsWithMissingRate} sin tarifa</Badge>
                    )}
                  </TableCell>
                  <TableCell>{day.roomsSold}/{day.roomsAvailable}</TableCell>
                  <TableCell>{formatCurrency(day.adr)}</TableCell>
                  <TableCell>{formatCurrency(day.revpar)}</TableCell>
                  <TableCell>
                    {formatCurrency(day.totalRevenue)}
                    {day.otherGroupChargesRevenue > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">(+ {formatCurrency(day.otherGroupChargesRevenue)} de extras de grupo, no incluido)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setDetailDate(day.date)} data-testid={`button-detail-${day.date}`}>Ver detalle</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={detailDate !== null} onOpenChange={open => !open && setDetailDate(null)}>
        <DialogContent className="max-w-2xl">
          {detailDate && <DayDetailContent date={detailDate} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DayDetailContent({ date }: { date: string }) {
  const { data, isLoading } = useQuery<RevenueDayDetail>({
    queryKey: ["/api/revenue/board", date, "detail"],
    queryFn: async () => (await apiRequest("GET", `/api/revenue/board/${date}`)).json(),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Detalle del {formatDisplayDate(date)}</DialogTitle>
      </DialogHeader>
      {isLoading || !data ? <Skeleton className="h-40" /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Ocupación: <strong>{data.occupancyPct.toFixed(0)}%</strong> ({data.roomsSold}/{data.roomsAvailable})</div>
            <div>ADR: <strong>{formatCurrency(data.adr)}</strong> ({data.ratedRoomNights} habitación-noche con tarifa determinable)</div>
            <div>Ingreso de alojamiento: <strong>{formatCurrency(data.directRoomRevenue)}</strong></div>
            <div>RevPAR: <strong>{formatCurrency(data.revpar)}</strong></div>
          </div>

          <div>
            <h4 className="font-medium text-sm mb-2">
              Reservas que ocupan este día ({data.reservations.length})
              {data.roomsWithMissingRate > 0 && (
                <Badge variant="outline" className="ml-2 text-amber-700 border-amber-400">{data.roomsWithMissingRate} sin tarifa determinable</Badge>
              )}
            </h4>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Habitación</TableHead><TableHead>Estado</TableHead><TableHead>Tarifa</TableHead><TableHead>Origen del dato</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.reservations.map(r => (
                  <TableRow key={r.reservationId}>
                    <TableCell>{r.roomNumber}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell>{formatCurrency(r.nightlyRate)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {RATE_SOURCE_LABELS[r.rateSource] || r.rateSource}
                      {!r.countsForAdr && <span className="text-amber-700"> · excluida del ADR</span>}
                    </TableCell>
                  </TableRow>
                ))}
                {data.reservations.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sin reservas este día</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {data.groupCharges.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2">
                Otros cargos de grupo este día — no son alojamiento ({formatCurrency(data.otherGroupChargesRevenue)})
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Alimentos, bebidas, eventos, transporte, spa, lavandería u otros cargados al folio grupal. Nunca se suman al
                ingreso de alojamiento ni a ADR/RevPAR — se muestran acá solo como contexto.
              </p>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Descripción</TableHead><TableHead>Categoría</TableHead><TableHead>Monto</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {data.groupCharges.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>{c.description}</TableCell>
                      <TableCell>{c.category}</TableCell>
                      <TableCell>{formatCurrency(c.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ==================== PACE ====================

function PaceTab({ defaultDate }: { defaultDate: string }) {
  const [stayDate, setStayDate] = useState(defaultDate);

  const { data, isLoading } = useQuery<{
    stayDate: string;
    currentYear: Array<{ snapshotDate: string; leadDays: number; roomsSold: number; roomRevenue: number }>;
    previousYear: Array<{ snapshotDate: string; leadDays: number; roomsSold: number; roomRevenue: number }>;
    yoyAvailable: boolean;
    message: string | null;
    trackingStartDate: string | null;
    missingSnapshotDates: string[];
  }>({
    queryKey: ["/api/revenue/pace", stayDate],
    queryFn: async () => (await apiRequest("GET", `/api/revenue/pace/${stayDate}`)).json(),
  });

  return (
    <div className="space-y-4 mt-4">
      <div>
        <Label htmlFor="rm-pace-date">Fecha de estadía a analizar</Label>
        <Input id="rm-pace-date" type="date" value={stayDate} onChange={e => setStayDate(e.target.value)} className="w-40" />
      </div>

      {isLoading ? <Skeleton className="h-40" /> : data && (
        <>
          {!data.yoyAvailable && (
            <Card><CardContent className="pt-6 text-sm text-muted-foreground">{data.message}</CardContent></Card>
          )}

          {data.missingSnapshotDates.length > 0 && (
            <Card className="border-amber-300">
              <CardContent className="pt-4 text-sm text-muted-foreground">
                Hay {data.missingSnapshotDates.length} día(s) sin captura de snapshot desde que arrancó el seguimiento
                ({data.trackingStartDate ? formatDisplayDate(data.trackingStartDate) : "—"}): {data.missingSnapshotDates.slice(0, 10).map(formatDisplayDate).join(", ")}
                {data.missingSnapshotDates.length > 10 ? "…" : ""}. Son huecos reales de historial (el módulo no corrió ese día), no datos en $0.
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Curva de pickup — este año ({data.currentYear.length} snapshots)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Lead (días)</TableHead><TableHead>Vendidas</TableHead><TableHead>Ingreso</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.currentYear.map(p => (
                      <TableRow key={p.snapshotDate}>
                        <TableCell>{p.leadDays}</TableCell>
                        <TableCell>{p.roomsSold}</TableCell>
                        <TableCell>{formatCurrency(p.roomRevenue)}</TableCell>
                      </TableRow>
                    ))}
                    {data.currentYear.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Todavía no hay snapshots para esta fecha</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Curva de pickup — mismo lead time, año pasado</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Lead (días)</TableHead><TableHead>Vendidas</TableHead><TableHead>Ingreso</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.previousYear.map(p => (
                      <TableRow key={p.snapshotDate}>
                        <TableCell>{p.leadDays}</TableCell>
                        <TableCell>{p.roomsSold}</TableCell>
                        <TableCell>{formatCurrency(p.roomRevenue)}</TableCell>
                      </TableRow>
                    ))}
                    {data.previousYear.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sin historial de hace un año</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ==================== CALENDARIO DE DEMANDA ====================

function DemandEventsTab({ from, to, canWrite, toast }: { from: string; to: string; canWrite: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", startDate: from, endDate: from, category: "otro", impact: "medio", notes: "" });

  const { data, isLoading } = useQuery<DemandEvent[]>({
    queryKey: ["/api/revenue/demand-events", from, to],
    queryFn: async () => (await apiRequest("GET", `/api/revenue/demand-events?from=${from}&to=${to}`)).json(),
  });

  const createMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/revenue/demand-events", form)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/demand-events"] });
      setOpen(false);
      setForm({ name: "", startDate: from, endDate: from, category: "otro", impact: "medio", notes: "" });
      toast({ title: "Evento de demanda cargado" });
    },
    onError: (e: any) => toast({ title: "No se pudo cargar el evento", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/revenue/demand-events/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/revenue/demand-events"] }),
  });

  return (
    <div className="space-y-4 mt-4">
      {canWrite && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="button-add-demand-event">Agregar evento de demanda</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo evento de demanda</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nombre</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-event-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Desde</Label><Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
                <div><Label>Hasta</Label><Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoría</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feriado">Feriado</SelectItem>
                      <SelectItem value="evento_ciudad">Evento de ciudad</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Impacto esperado</Label>
                  <Select value={form.impact} onValueChange={v => setForm({ ...form, impact: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alto">Alto</SelectItem>
                      <SelectItem value="medio">Medio</SelectItem>
                      <SelectItem value="bajo">Bajo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Notas</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending} data-testid="button-save-demand-event">Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nombre</TableHead><TableHead>Fechas</TableHead><TableHead>Categoría</TableHead><TableHead>Impacto</TableHead>{canWrite && <TableHead></TableHead>}</TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5}><Skeleton className="h-6" /></TableCell></TableRow>
              ) : (data || []).map(ev => (
                <TableRow key={ev.id} data-testid={`row-demand-event-${ev.id}`}>
                  <TableCell>{ev.name}</TableCell>
                  <TableCell>{formatDisplayDate(ev.startDate)} – {formatDisplayDate(ev.endDate)}</TableCell>
                  <TableCell>{CATEGORY_LABELS[ev.category]}</TableCell>
                  <TableCell><Badge variant={ev.impact === "alto" ? "default" : "outline"}>{IMPACT_LABELS[ev.impact]}</Badge></TableCell>
                  {canWrite && (
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(ev.id)}>Eliminar</Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!isLoading && (data || []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin eventos cargados en este rango</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== TARIFAS DE COMPETENCIA ====================

function CompetitorRatesTab({ from, to, canWrite, toast }: { from: string; to: string; canWrite: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    competitorName: "", roomTypeId: "", stayDate: from, rate: "", currency: "ARS",
    refundable: "", occupancy: "", breakfastIncluded: "", taxesIncluded: "", sourceNote: "",
  });

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
    queryFn: async () => (await apiRequest("GET", "/api/room-types")).json(),
  });

  const { data, isLoading } = useQuery<CompetitorRate[]>({
    queryKey: ["/api/revenue/competitor-rates", from, to],
    queryFn: async () => (await apiRequest("GET", `/api/revenue/competitor-rates?from=${from}&to=${to}`)).json(),
  });

  const createMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/revenue/competitor-rates", {
      ...form,
      roomTypeId: form.roomTypeId || null,
      rate: form.rate,
      refundable: form.refundable === "" ? null : form.refundable === "true",
      occupancy: form.occupancy === "" ? null : Number(form.occupancy),
      breakfastIncluded: form.breakfastIncluded === "" ? null : form.breakfastIncluded === "true",
      taxesIncluded: form.taxesIncluded === "" ? null : form.taxesIncluded === "true",
    })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/competitor-rates"] });
      setOpen(false);
      setForm({ competitorName: "", roomTypeId: "", stayDate: from, rate: "", currency: "ARS", refundable: "", occupancy: "", breakfastIncluded: "", taxesIncluded: "", sourceNote: "" });
      toast({ title: "Tarifa de competencia cargada" });
    },
    onError: (e: any) => toast({ title: "No se pudo cargar la tarifa", description: e?.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/revenue/competitor-rates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/revenue/competitor-rates"] }),
  });

  const roomTypeName = (id: string | null) => roomTypes?.find(rt => rt.id === id)?.name || "Todas";

  return (
    <div className="space-y-4 mt-4">
      <p className="text-xs text-muted-foreground">
        Carga manual: no hay scraping automático de tarifas de otros hoteles. Alguien revisa la OTA/web de la competencia y anota el dato acá.
      </p>
      {canWrite && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="button-add-competitor-rate">Cargar tarifa de competencia</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva tarifa de competencia</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Competidor</Label><Input value={form.competitorName} onChange={e => setForm({ ...form, competitorName: e.target.value })} data-testid="input-competitor-name" /></div>
              <div>
                <Label>Tipo de habitación (opcional)</Label>
                <Select value={form.roomTypeId || "__all__"} onValueChange={v => setForm({ ...form, roomTypeId: v === "__all__" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas</SelectItem>
                    {(roomTypes || []).map(rt => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Fecha de estadía</Label><Input type="date" value={form.stayDate} onChange={e => setForm({ ...form, stayDate: e.target.value })} /></div>
                <div><Label>Tarifa</Label><Input type="number" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} data-testid="input-competitor-rate" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>¿Reembolsable?</Label>
                  <Select value={form.refundable || "__unknown__"} onValueChange={v => setForm({ ...form, refundable: v === "__unknown__" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unknown__">No sé / no cargar</SelectItem>
                      <SelectItem value="true">Sí</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ocupación (pax)</Label>
                  <Select value={form.occupancy || "__unknown__"} onValueChange={v => setForm({ ...form, occupancy: v === "__unknown__" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unknown__">No sé / no cargar</SelectItem>
                      <SelectItem value="1">1 pax</SelectItem>
                      <SelectItem value="2">2 pax</SelectItem>
                      <SelectItem value="3">3 pax</SelectItem>
                      <SelectItem value="4">4 pax</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>¿Incluye desayuno?</Label>
                  <Select value={form.breakfastIncluded || "__unknown__"} onValueChange={v => setForm({ ...form, breakfastIncluded: v === "__unknown__" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unknown__">No sé / no cargar</SelectItem>
                      <SelectItem value="true">Sí</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>¿Impuestos incluidos?</Label>
                  <Select value={form.taxesIncluded || "__unknown__"} onValueChange={v => setForm({ ...form, taxesIncluded: v === "__unknown__" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unknown__">No sé / no cargar</SelectItem>
                      <SelectItem value="true">Sí</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Reembolso, ocupación, desayuno e impuestos incluidos son las condiciones que el motor de sugerencias necesita para comparar de forma justa.
                Si no las cargás, esta tarifa queda igual guardada acá como referencia manual, pero el motor no la va a usar.
              </p>
              <div><Label>Fuente / notas</Label><Textarea value={form.sourceNote} onChange={e => setForm({ ...form, sourceNote: e.target.value })} placeholder="Ej: visto en Booking el 10/10" /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={!form.competitorName || !form.rate || createMutation.isPending} data-testid="button-save-competitor-rate">Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competidor</TableHead><TableHead>Tipo de hab.</TableHead><TableHead>Fecha</TableHead>
                <TableHead>Tarifa</TableHead><TableHead>Reemb.</TableHead><TableHead>Pax</TableHead>
                <TableHead>Desayuno</TableHead><TableHead>Impuestos</TableHead>
                <TableHead>Fuente</TableHead>{canWrite && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10}><Skeleton className="h-6" /></TableCell></TableRow>
              ) : (data || []).map(rate => (
                <TableRow key={rate.id} data-testid={`row-competitor-rate-${rate.id}`}>
                  <TableCell>{rate.competitorName}</TableCell>
                  <TableCell>{roomTypeName(rate.roomTypeId)}</TableCell>
                  <TableCell>{formatDisplayDate(rate.stayDate)}</TableCell>
                  <TableCell>{formatCurrency(Number(rate.rate))}</TableCell>
                  <TableCell>{rate.refundable === null ? <span className="text-amber-700 text-xs">sin cargar</span> : rate.refundable ? "Sí" : "No"}</TableCell>
                  <TableCell>{rate.occupancy === null ? <span className="text-amber-700 text-xs">sin cargar</span> : `${rate.occupancy} pax`}</TableCell>
                  <TableCell>{rate.breakfastIncluded === null ? <span className="text-amber-700 text-xs">sin cargar</span> : rate.breakfastIncluded ? "Sí" : "No"}</TableCell>
                  <TableCell>{rate.taxesIncluded === null ? <span className="text-amber-700 text-xs">sin cargar</span> : rate.taxesIncluded ? "Sí" : "No"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{rate.sourceNote}</TableCell>
                  {canWrite && (
                    <TableCell><Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(rate.id)}>Eliminar</Button></TableCell>
                  )}
                </TableRow>
              ))}
              {!isLoading && (data || []).length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Sin tarifas de competencia cargadas en este rango</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== SUGERENCIAS ====================

function SuggestionsTab({ from, to, canConfigure, toast }: { from: string; to: string; canConfigure: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const { data, isLoading } = useQuery<{ from: string; to: string; suggestions: RateSuggestion[] }>({
    queryKey: ["/api/revenue/suggestions", from, to],
    queryFn: async () => (await apiRequest("GET", `/api/revenue/suggestions?from=${from}&to=${to}`)).json(),
  });

  const { data: config } = useQuery<SuggestionConfig>({
    queryKey: ["/api/revenue/suggestion-config"],
    queryFn: async () => (await apiRequest("GET", "/api/revenue/suggestion-config")).json(),
  });

  const [configDraft, setConfigDraft] = useState<SuggestionConfig | null>(null);
  const activeConfig = configDraft ?? config ?? null;

  const saveConfigMutation = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", "/api/revenue/suggestion-config", activeConfig)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/suggestion-config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/suggestions"] });
      setConfigDraft(null);
      toast({ title: "Configuración actualizada" });
    },
    onError: (e: any) => toast({ title: "No se pudo guardar la configuración", description: e?.message, variant: "destructive" }),
  });

  const nonNeutral = (data?.suggestions || []).filter(s => s.direction !== "mantener");

  return (
    <div className="space-y-4 mt-4">
      <Card className="border-amber-300">
        <CardContent className="pt-4 text-sm">
          {data?.suggestions[0]?.disclaimer || "Sugerencia informativa: nunca se aplica sola. Hay que cargarla a mano en Planes Tarifarios si se está de acuerdo."}
        </CardContent>
      </Card>

      {canConfigure && activeConfig && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Configuración del motor</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>Umbral ocupación alta (%)</Label>
              <Input type="number" value={activeConfig.highOccupancyThresholdPct}
                onChange={e => setConfigDraft({ ...activeConfig, highOccupancyThresholdPct: e.target.value })} />
            </div>
            <div>
              <Label>Umbral ocupación baja (%)</Label>
              <Input type="number" value={activeConfig.lowOccupancyThresholdPct}
                onChange={e => setConfigDraft({ ...activeConfig, lowOccupancyThresholdPct: e.target.value })} />
            </div>
            <div>
              <Label>Suba sugerida (%)</Label>
              <Input type="number" value={activeConfig.increaseSuggestionPct}
                onChange={e => setConfigDraft({ ...activeConfig, increaseSuggestionPct: e.target.value })} />
            </div>
            <div>
              <Label>Baja sugerida (%)</Label>
              <Input type="number" value={activeConfig.decreaseSuggestionPct}
                onChange={e => setConfigDraft({ ...activeConfig, decreaseSuggestionPct: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <Switch checked={activeConfig.considerDemandEvents}
                onCheckedChange={v => setConfigDraft({ ...activeConfig, considerDemandEvents: v })} />
              <Label>Considerar calendario de demanda</Label>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <Switch checked={activeConfig.considerCompetitorRates}
                onCheckedChange={v => setConfigDraft({ ...activeConfig, considerCompetitorRates: v })} />
              <Label>Considerar tarifas de competencia</Label>
            </div>
            <div className="col-span-full">
              <Button size="sm" disabled={!configDraft || saveConfigMutation.isPending} onClick={() => saveConfigMutation.mutate()} data-testid="button-save-suggestion-config">
                Guardar configuración
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ReferenceRatePlansCard canConfigure={canConfigure} toast={toast} />

      <Card>
        <CardHeader><CardTitle className="text-sm">Sugerencias con movimiento ({nonNeutral.length} de {data?.suggestions.length || 0} días)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Fecha</TableHead><TableHead>Dirección</TableHead><TableHead>%</TableHead><TableHead>Razones</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4}><Skeleton className="h-6" /></TableCell></TableRow>
              ) : nonNeutral.map(s => (
                <TableRow key={s.date} data-testid={`row-suggestion-${s.date}`}>
                  <TableCell>{formatDisplayDate(s.date)}</TableCell>
                  <TableCell>
                    <Badge variant={s.direction === "subir" ? "default" : "secondary"}>{DIRECTION_LABELS[s.direction]}</Badge>
                  </TableCell>
                  <TableCell>{s.suggestedChangePct}%</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <ul className="list-disc pl-4">
                      {s.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && nonNeutral.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sin sugerencias de movimiento en este rango</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== PLAN TARIFARIO DE REFERENCIA ====================

type ReferenceRatePlanRow = {
  roomTypeId: string;
  roomTypeName: string;
  configuredRatePlanId: string | null;
  includesBreakfast: boolean;
  availablePlans: Array<{ id: string; name: string }>;
};

function ReferenceRatePlansCard({ canConfigure, toast }: { canConfigure: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const { data, isLoading } = useQuery<ReferenceRatePlanRow[]>({
    queryKey: ["/api/revenue/reference-rate-plans"],
    queryFn: async () => (await apiRequest("GET", "/api/revenue/reference-rate-plans")).json(),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ roomTypeId, ratePlanId, includesBreakfast }: { roomTypeId: string; ratePlanId: string | null; includesBreakfast: boolean }) =>
      (await apiRequest("PUT", `/api/revenue/reference-rate-plans/${roomTypeId}`, { ratePlanId, includesBreakfast })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/reference-rate-plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/suggestions"] });
      toast({ title: "Plan de referencia actualizado" });
    },
    onError: (e: any) => toast({ title: "No se pudo guardar el plan de referencia", description: e?.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Plan tarifario de referencia por tipo de habitación</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          El motor de sugerencias nunca elige un plan automáticamente: compara contra el plan que se configure acá. Mientras un
          tipo de habitación no tenga uno configurado, sus tarifas de competencia quedan excluidas de la comparación (igual se
          ven en la pestaña de Tarifas de Competencia como referencia manual).
        </p>
        {isLoading ? <Skeleton className="h-20" /> : (
          <div className="space-y-2">
            {(data || []).map(row => (
              <div key={row.roomTypeId} className="flex items-center gap-3" data-testid={`row-reference-plan-${row.roomTypeId}`}>
                <span className="text-sm w-48">{row.roomTypeName}</span>
                <Select
                  value={row.configuredRatePlanId || "__none__"}
                  onValueChange={v => saveMutation.mutate({ roomTypeId: row.roomTypeId, ratePlanId: v === "__none__" ? null : v, includesBreakfast: row.includesBreakfast })}
                  disabled={!canConfigure}
                >
                  <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin configurar (excluido del motor)</SelectItem>
                    {row.availablePlans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!row.configuredRatePlanId && <Badge variant="outline" className="text-amber-700 border-amber-400">sin configurar</Badge>}
                {row.configuredRatePlanId && (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={row.includesBreakfast}
                      disabled={!canConfigure}
                      onCheckedChange={checked => saveMutation.mutate({ roomTypeId: row.roomTypeId, ratePlanId: row.configuredRatePlanId, includesBreakfast: checked === true })}
                      data-testid={`switch-includes-breakfast-${row.roomTypeId}`}
                    />
                    <Label className="text-sm">Incluye desayuno</Label>
                  </div>
                )}
              </div>
            ))}
            {!isLoading && (data || []).length === 0 && (
              <p className="text-sm text-muted-foreground">No hay tipos de habitación cargados.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
