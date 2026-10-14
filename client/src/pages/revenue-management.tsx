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
  occupancyPct: number;
  directRoomRevenue: number;
  groupChargesRevenue: number;
  totalRevenue: number;
  adr: number;
  revpar: number;
};

type RevenueDayDetail = RevenueDayMetrics & {
  reservations: Array<{ reservationId: string; roomId: string; roomNumber: string; status: string; nightlyRate: number; rateSource: string }>;
  groupCharges: Array<{ id: string; groupId: string; description: string; amount: number; category: string }>;
};

type DemandEvent = {
  id: string; name: string; startDate: string; endDate: string;
  category: "feriado" | "evento_ciudad" | "otro"; impact: "alto" | "medio" | "bajo"; notes: string | null;
};

type CompetitorRate = {
  id: string; competitorName: string; roomTypeId: string | null; stayDate: string;
  rate: string; currency: string; sourceNote: string | null;
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
        <TabsList>
          <TabsTrigger value="tablero" data-testid="tab-tablero">Tablero</TabsTrigger>
          <TabsTrigger value="pace" data-testid="tab-pace">Pace</TabsTrigger>
          <TabsTrigger value="demanda" data-testid="tab-demanda">Calendario de demanda</TabsTrigger>
          <TabsTrigger value="competencia" data-testid="tab-competencia">Tarifas de competencia</TabsTrigger>
          <TabsTrigger value="sugerencias" data-testid="tab-sugerencias">Sugerencias</TabsTrigger>
        </TabsList>

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
    const totalAvailable = days.reduce((s, d) => s + d.roomsAvailable, 0);
    return {
      occupancyPct: totalAvailable > 0 ? (totalSold / totalAvailable) * 100 : 0,
      totalRevenue,
      adr: totalSold > 0 ? totalRevenue / totalSold : 0,
      revpar: totalAvailable > 0 ? totalRevenue / totalAvailable : 0,
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
                  <TableCell>{day.occupancyPct.toFixed(0)}%</TableCell>
                  <TableCell>{day.roomsSold}/{day.roomsAvailable}</TableCell>
                  <TableCell>{formatCurrency(day.adr)}</TableCell>
                  <TableCell>{formatCurrency(day.revpar)}</TableCell>
                  <TableCell>
                    {formatCurrency(day.totalRevenue)}
                    {day.groupChargesRevenue > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">(incl. {formatCurrency(day.groupChargesRevenue)} de grupos)</span>
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
            <div>ADR: <strong>{formatCurrency(data.adr)}</strong></div>
            <div>Ingreso directo de habitaciones: <strong>{formatCurrency(data.directRoomRevenue)}</strong></div>
            <div>RevPAR: <strong>{formatCurrency(data.revpar)}</strong></div>
          </div>

          <div>
            <h4 className="font-medium text-sm mb-2">Reservas que ocupan este día ({data.reservations.length})</h4>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Habitación</TableHead><TableHead>Estado</TableHead><TableHead>Tarifa</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.reservations.map(r => (
                  <TableRow key={r.reservationId}>
                    <TableCell>{r.roomNumber}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell>{formatCurrency(r.nightlyRate)}{r.nightlyRate === 0 && <span className="text-xs text-muted-foreground ml-1">(ver cargos de grupo)</span>}</TableCell>
                  </TableRow>
                ))}
                {data.reservations.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sin reservas este día</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {data.groupCharges.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2">
                Cargos de grupo este día ({formatCurrency(data.groupChargesRevenue)})
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Habitaciones de un grupo con tarifa pactada suelen cargarse en $0 a nivel de reserva; la plata real queda
                registrada acá, no se descarta como "regalada".
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
  const [form, setForm] = useState({ competitorName: "", roomTypeId: "", stayDate: from, rate: "", currency: "ARS", sourceNote: "" });

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
    })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revenue/competitor-rates"] });
      setOpen(false);
      setForm({ competitorName: "", roomTypeId: "", stayDate: from, rate: "", currency: "ARS", sourceNote: "" });
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
              <TableRow><TableHead>Competidor</TableHead><TableHead>Tipo de hab.</TableHead><TableHead>Fecha</TableHead><TableHead>Tarifa</TableHead><TableHead>Fuente</TableHead>{canWrite && <TableHead></TableHead>}</TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6}><Skeleton className="h-6" /></TableCell></TableRow>
              ) : (data || []).map(rate => (
                <TableRow key={rate.id} data-testid={`row-competitor-rate-${rate.id}`}>
                  <TableCell>{rate.competitorName}</TableCell>
                  <TableCell>{roomTypeName(rate.roomTypeId)}</TableCell>
                  <TableCell>{formatDisplayDate(rate.stayDate)}</TableCell>
                  <TableCell>{formatCurrency(Number(rate.rate))}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{rate.sourceNote}</TableCell>
                  {canWrite && (
                    <TableCell><Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(rate.id)}>Eliminar</Button></TableCell>
                  )}
                </TableRow>
              ))}
              {!isLoading && (data || []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sin tarifas de competencia cargadas en este rango</TableCell></TableRow>
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
