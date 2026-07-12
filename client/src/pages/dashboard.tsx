import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getLocalToday } from "@/lib/utils";
import {
  DoorOpen,
  Users,
  CalendarCheck,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  AlertCircle,
  LogIn,
  LogOut,
  XCircle,
  Coffee,
  ChevronDown,
  ChevronUp,
  Hotel,
  Printer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ReservationWithDetails, RoomWithType } from "@shared/schema";
import { useState as useLocalState } from "react";

type DashboardStats = {
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  inHouseGuests: number;
  dirtyRooms: number;
  cleaningRooms: number;
  maintenanceRooms: number;
  oosRooms: number;
  todayCheckIns: number;
  todayCheckOuts: number;
  occupancyRate: number;
  totalGuests: number;
  pendingReservations: number;
  breakfastsTomorrow: number;
  roomsTonight: number;
  maintenanceBlockDetails: { roomNumber: string; blockFrom: string; blockTo: string; notes?: string | null }[];
};

const fmtDate = (d: string | null | undefined): string =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const fmtDateTime = (d: string | Date | null | undefined): string => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  trendValue,
  testId,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  trend?: "up" | "down";
  trendValue?: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
        {trend && trendValue && (
          <div className="flex items-center gap-1 mt-2">
            {trend === "up" ? (
              <ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-red-600 dark:text-red-400" />
            )}
            <span
              className={`text-sm font-medium ${
                trend === "up"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {trendValue}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActionCard({
  title,
  description,
  icon: Icon,
  href,
  variant = "default",
  testId,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  variant?: "default" | "primary";
  testId: string;
}) {
  return (
    <Link href={href} data-testid={testId}>
      <Card className={`hover-elevate active-elevate-2 cursor-pointer transition-colors ${
        variant === "primary" ? "bg-primary text-primary-foreground" : ""
      }`}>
        <CardContent className="flex items-center gap-4 p-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-md ${
            variant === "primary" 
              ? "bg-primary-foreground/20" 
              : "bg-muted"
          }`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className={`text-sm ${
              variant === "primary" ? "text-primary-foreground/80" : "text-muted-foreground"
            }`}>{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function ReservationStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    tentative: { label: "Tentativa", variant: "outline" },
    pending: { label: "Pendiente", variant: "secondary" },
    confirmed: { label: "Confirmada", variant: "default" },
    checked_in: { label: "Check-in", variant: "default" },
    checked_out: { label: "Check-out", variant: "outline" },
    cancelled: { label: "Cancelada", variant: "destructive" },
  };

  const config = statusConfig[status] || { label: status, variant: "secondary" as const };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function RoomStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    available: { label: "Disponible", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    occupied: { label: "Ocupada", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
    cleaning: { label: "Limpieza", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
    dirty: { label: "Sucia", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
    dirty_occupied: { label: "Sucia/Ocup.", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
    limpia_ocupada: { label: "Limpia/Ocup.", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
    maintenance: { label: "Mantenimiento", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
    oos: { label: "Fuera Servicio", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" },
  };

  const config = statusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };

  return <Badge className={config.className}>{config.label}</Badge>;
}

type BreakfastEntry = {
  reservationId: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  guestName: string;
};

type InHouseEntry = {
  reservationId: string;
  reservationNumber: string | null;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  numberOfGuests: number;
  guest: {
    id: string;
    firstName: string;
    lastName: string;
    documentType: string;
    documentNumber: string;
    nationality: string;
    dateOfBirth: string;
    phone: string;
    email: string;
    direccion: string | null;
    localidad: string | null;
    provincia: string | null;
    procedencia: string | null;
  };
  companions: {
    firstName: string;
    lastName: string;
    documentType: string;
    documentNumber: string;
    nationality: string;
    dateOfBirth: string;
  }[];
};

export default function Dashboard() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [inHouseOpen, setInHouseOpen] = useLocalState(false);
  const [breakfastOpen, setBreakfastOpen] = useLocalState(false);
  const [inHouseDate, setInHouseDate] = useLocalState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
  );

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentReservations, isLoading: reservationsLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations/recent"],
  });

  const { data: roomsOverview, isLoading: roomsLoading } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: arrivals = [], isLoading: arrivalsLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/dashboard/arrivals"],
  });

  const { data: departuresRaw = [], isLoading: departuresLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/dashboard/departures"],
  });
  const todayDash = getLocalToday();
  const departures = departuresRaw.filter((r) => r.checkOutDate <= todayDash);

  const { data: inHouseData = [], isLoading: inHouseLoading } = useQuery<InHouseEntry[]>({
    queryKey: ["/api/dashboard/inhouse", inHouseDate],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/inhouse?date=${inHouseDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando listado");
      return res.json();
    },
    enabled: inHouseOpen,
  });

  const { data: breakfastData = [], isLoading: breakfastLoading } = useQuery<BreakfastEntry[]>({
    queryKey: ["/api/dashboard/breakfasts"],
    enabled: breakfastOpen,
  });

  const totalInHouse = stats ? stats.inHouseGuests : 0;

  const printInHouseList = () => {
    const fmt = (d: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
    const selectedDateObj = new Date(inHouseDate + "T12:00:00");
    const dateStr = selectedDateObj.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    const totalPax = inHouseData.reduce((s, e) => s + (e.numberOfGuests || e.adults + e.children), 0);

    const rows = inHouseData.flatMap((entry) => {
      const g = entry.guest;
      const domicilio = [g.direccion, g.localidad, g.provincia].filter(Boolean).join(", ") || "—";
      const mainRow = `<tr>
        <td>${entry.roomNumber}</td>
        <td><b>${(g.lastName || "—").toUpperCase()}, ${g.firstName || "—"}</b></td>
        <td>${g.documentType?.toUpperCase() ?? "—"}</td>
        <td>${g.documentNumber ?? "—"}</td>
        <td>${g.nationality ?? "—"}</td>
        <td>${g.dateOfBirth ? fmt(g.dateOfBirth) : "—"}</td>
        <td>${domicilio}</td>
        <td>${fmt(entry.checkIn)}</td>
        <td>${fmt(entry.checkOut)}</td>
        <td>Titular</td>
      </tr>`;
      const compRows = entry.companions.map((c: any) => `<tr class="comp">
        <td>${entry.roomNumber}</td>
        <td style="padding-left:12px">${(c.lastName || "—").toUpperCase()}, ${c.firstName || "—"}</td>
        <td>${c.documentType?.toUpperCase() ?? "—"}</td>
        <td>${c.documentNumber ?? "—"}</td>
        <td>${c.nationality ?? "—"}</td>
        <td>${c.dateOfBirth ? fmt(c.dateOfBirth) : "—"}</td>
        <td>—</td>
        <td>${fmt(entry.checkIn)}</td>
        <td>${fmt(entry.checkOut)}</td>
        <td>Acomp.</td>
      </tr>`).join("");
      return mainRow + compRows;
    }).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Listado In House — ${dateStr}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 10px; margin: 15px; color: #111; }
      h1 { font-size: 14px; margin-bottom: 2px; }
      p.sub { font-size: 10px; color: #555; margin: 0 0 10px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #e8e8e8; border: 1px solid #aaa; padding: 4px 5px; text-align: left; font-size: 9px; text-transform: uppercase; }
      td { border: 1px solid #ccc; padding: 3px 5px; vertical-align: top; }
      tr.comp td { background: #f8f8f8; color: #444; }
      @media print { @page { margin: 12mm; size: landscape; } }
    </style></head><body>
    <h1>Listado In House — Maran Suites & Towers</h1>
    <p class="sub">${dateStr} &nbsp;·&nbsp; ${inHouseData.length} habitación(es) &nbsp;·&nbsp; ${totalPax} persona(s)</p>
    <table>
      <thead><tr>
        <th>Hab.</th><th>Apellido y Nombre</th><th>Tipo Doc.</th><th>N° Doc.</th>
        <th>Nac.</th><th>F. Nac.</th><th>Domicilio</th><th>Ingreso</th><th>Egreso</th><th>Rol</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const printBreakfastList = () => {
    const fmt = (d: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    const totalPax = breakfastData.reduce((s, e) => s + e.adults, 0);
    const rows = breakfastData.map((e) => `<tr>
      <td>${e.roomNumber}</td>
      <td>${e.guestName}</td>
      <td style="text-align:center">${e.adults}</td>
      <td>${fmt(e.checkIn)}</td>
      <td>${fmt(e.checkOut)}</td>
    </tr>`).join("");
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Listado Desayunos — ${tomorrowStr}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #111; }
      h1 { font-size: 15px; margin-bottom: 2px; }
      p.sub { font-size: 11px; color: #555; margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f0f0f0; border: 1px solid #ccc; padding: 5px 6px; text-align: left; font-size: 10px; text-transform: uppercase; }
      td { border: 1px solid #ddd; padding: 4px 6px; }
      tfoot td { background: #f0f0f0; font-weight: bold; }
      @media print { @page { margin: 15mm; } }
    </style></head><body>
    <h1>Listado de Desayunos — Maran Suites & Towers</h1>
    <p class="sub">${tomorrowStr} · ${breakfastData.length} habitación(es) · ${totalPax} persona(s)</p>
    <table>
      <thead><tr>
        <th>Hab.</th><th>Titular</th><th>Pax</th><th>Ingreso</th><th>Egreso</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="2">TOTAL</td>
        <td style="text-align:center">${totalPax}</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table>
    <script>window.onload=()=>{window.print();}</script>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  const { data: cancelledLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/cancelled-reservations"],
  });
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const todayCancelled = cancelledLogs.filter((log: any) => {
    const d = new Date(log.cancellationDate);
    const s = d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    return s === todayStr;
  });

  const checkInMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/reservations/${id}/check-in`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Check-in realizado", description: "El huesped ha sido registrado." });
    },
    onError: (error: any) => {
      const message = error?.data?.error || error?.message || "No se pudo realizar el check-in.";
      toast({ title: "Check-in no permitido", description: message, variant: "destructive" });
    },
  });



  const today = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground capitalize">{today}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {statsLoading ? (
          <>
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-4 w-32 mt-2" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : stats ? (
          <>
            <StatCard
              title="Habitaciones Disponibles"
              value={stats.availableRooms}
              description={`de ${stats.totalRooms} habitaciones`}
              icon={DoorOpen}
              testId="stat-available-rooms"
            />
            <StatCard
              title="Ocupación"
              value={`${stats.occupancyRate}%`}
              description={`${stats.occupiedRooms} habitaciones ocupadas`}
              icon={TrendingUp}
              trend={stats.occupancyRate > 70 ? "up" : "down"}
              trendValue={stats.occupancyRate > 70 ? "Alta demanda" : "Disponibilidad"}
              testId="stat-occupancy"
            />
            <StatCard
              title="Check-ins Hoy"
              value={stats.todayCheckIns}
              description="llegadas programadas"
              icon={CalendarCheck}
              testId="stat-checkins-today"
            />
            <Card
              className="cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
              onClick={() => setInHouseOpen((v) => !v)}
              data-testid="stat-inhouse-guests"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Huéspedes In House</CardTitle>
                <div className="flex items-center gap-1">
                  <Hotel className="h-5 w-5 text-muted-foreground" />
                  {inHouseOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalInHouse}</div>
                <p className="text-sm text-muted-foreground mt-1">personas alojadas ahora</p>
                <p className="text-xs text-primary mt-1">{inHouseOpen ? "Cerrar listado ↑" : "Ver listado policial ↓"}</p>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all"
              onClick={() => setBreakfastOpen((v) => !v)}
              data-testid="stat-breakfasts-tomorrow"
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Desayunos Mañana</CardTitle>
                <div className="flex items-center gap-1">
                  <Coffee className="h-5 w-5 text-muted-foreground" />
                  {breakfastOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.breakfastsTomorrow}</div>
                <p className="text-sm text-muted-foreground mt-1">{stats.roomsTonight} hab. esta noche</p>
                <p className="text-xs text-primary mt-1">{breakfastOpen ? "Cerrar listado ↑" : "Ver listado ↓"}</p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* In-House Panel */}
      {inHouseOpen && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Hotel className="h-5 w-5" />
                Listado In House
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Fecha:</label>
                  <input
                    type="date"
                    value={inHouseDate}
                    max={new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })}
                    onChange={(e) => setInHouseDate(e.target.value)}
                    data-testid="input-inhouse-date"
                    className="text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {!inHouseLoading && inHouseData.length > 0 && (
                  <Button variant="outline" size="sm" onClick={printInHouseList} data-testid="button-print-inhouse">
                    <Printer className="h-4 w-4 mr-1" />
                    Imprimir
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setInHouseOpen(false)}>Cerrar</Button>
              </div>
            </div>
            <CardDescription>
              {new Date(inHouseDate + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
              {" · "}{inHouseData.length} habitación(es) · {inHouseData.reduce((s, e) => s + (e.numberOfGuests || e.adults + e.children), 0)} persona(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inHouseLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : inHouseData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay huéspedes alojados en esa fecha.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs uppercase">
                      <th className="text-left py-2 px-2 font-medium">Hab.</th>
                      <th className="text-left py-2 px-2 font-medium">Apellido y Nombre</th>
                      <th className="text-left py-2 px-2 font-medium">Tipo Doc.</th>
                      <th className="text-left py-2 px-2 font-medium">N° Doc.</th>
                      <th className="text-left py-2 px-2 font-medium">Nac.</th>
                      <th className="text-left py-2 px-2 font-medium">F. Nac.</th>
                      <th className="text-left py-2 px-2 font-medium">Domicilio</th>
                      <th className="text-left py-2 px-2 font-medium">Ingreso</th>
                      <th className="text-left py-2 px-2 font-medium">Egreso</th>
                      <th className="text-left py-2 px-2 font-medium">Rol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inHouseData.flatMap((entry) => {
                      const fmt = (d: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
                      const g = entry.guest;
                      const domicilio = [g.direccion, g.localidad, g.provincia].filter(Boolean).join(", ") || "—";
                      const rows = [];
                      rows.push(
                        <tr key={`${entry.reservationId}-main`} className="border-b hover:bg-muted/40">
                          <td className="py-1.5 px-2 font-semibold">{entry.roomNumber}</td>
                          <td className="py-1.5 px-2 font-medium">{g.lastName ? g.lastName.toUpperCase() : "—"}, {g.firstName || "—"}</td>
                          <td className="py-1.5 px-2">{g.documentType?.toUpperCase() || "—"}</td>
                          <td className="py-1.5 px-2">{g.documentNumber || "—"}</td>
                          <td className="py-1.5 px-2">{g.nationality || "—"}</td>
                          <td className="py-1.5 px-2">{g.dateOfBirth ? fmt(g.dateOfBirth) : "—"}</td>
                          <td className="py-1.5 px-2 text-xs text-muted-foreground max-w-[150px] truncate" title={domicilio}>{domicilio}</td>
                          <td className="py-1.5 px-2">{fmt(entry.checkIn)}</td>
                          <td className="py-1.5 px-2">{fmt(entry.checkOut)}</td>
                          <td className="py-1.5 px-2"><Badge variant="outline" className="text-xs">Titular</Badge></td>
                        </tr>
                      );
                      entry.companions.forEach((c, ci) => {
                        rows.push(
                          <tr key={`${entry.reservationId}-comp-${ci}`} className="border-b bg-muted/20 hover:bg-muted/40">
                            <td className="py-1.5 px-2 text-muted-foreground">{entry.roomNumber}</td>
                            <td className="py-1.5 px-2 pl-4">{c.lastName ? c.lastName.toUpperCase() : "—"}, {c.firstName || "—"}</td>
                            <td className="py-1.5 px-2">{c.documentType?.toUpperCase() || "—"}</td>
                            <td className="py-1.5 px-2">{c.documentNumber || "—"}</td>
                            <td className="py-1.5 px-2">{c.nationality || "—"}</td>
                            <td className="py-1.5 px-2">{c.dateOfBirth ? fmt(c.dateOfBirth) : "—"}</td>
                            <td className="py-1.5 px-2">—</td>
                            <td className="py-1.5 px-2">{fmt(entry.checkIn)}</td>
                            <td className="py-1.5 px-2">{fmt(entry.checkOut)}</td>
                            <td className="py-1.5 px-2"><Badge variant="secondary" className="text-xs">Acomp.</Badge></td>
                          </tr>
                        );
                      });
                      return rows;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Breakfast Panel */}
      {breakfastOpen && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Coffee className="h-5 w-5" />
                Desayunos — {(() => {
                  const t = new Date(); t.setDate(t.getDate() + 1);
                  return t.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
                })()}
              </CardTitle>
              <div className="flex items-center gap-2">
                {!breakfastLoading && breakfastData.length > 0 && (
                  <Button variant="outline" size="sm" onClick={printBreakfastList} data-testid="button-print-breakfasts">
                    <Printer className="h-4 w-4 mr-1" />
                    Imprimir
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setBreakfastOpen(false)}>Cerrar</Button>
              </div>
            </div>
            <CardDescription>Habitaciones con desayuno incluido para mañana</CardDescription>
          </CardHeader>
          <CardContent>
            {breakfastLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : breakfastData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay reservas activas para mañana.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs uppercase">
                      <th className="text-left py-2 px-2 font-medium">Hab.</th>
                      <th className="text-left py-2 px-2 font-medium">Titular</th>
                      <th className="text-center py-2 px-2 font-medium">Pax</th>
                      <th className="text-left py-2 px-2 font-medium">Ingreso</th>
                      <th className="text-left py-2 px-2 font-medium">Egreso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakfastData.map((entry) => {
                      const fmt = (d: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
                      return (
                        <tr key={entry.reservationId} className="border-b hover:bg-muted/40">
                          <td className="py-1.5 px-2 font-semibold">{entry.roomNumber}</td>
                          <td className="py-1.5 px-2 font-medium">{entry.guestName}</td>
                          <td className="py-1.5 px-2 text-center font-semibold">{entry.adults}</td>
                          <td className="py-1.5 px-2">{fmt(entry.checkIn)}</td>
                          <td className="py-1.5 px-2">{fmt(entry.checkOut)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30">
                      <td colSpan={2} className="py-1.5 px-2 font-semibold text-xs uppercase text-muted-foreground">Total</td>
                      <td className="py-1.5 px-2 text-center font-bold">
                        {breakfastData.reduce((s, e) => s + e.adults, 0)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Acciones Rápidas</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard
            title="Nueva Reserva"
            description="Crear una nueva reservación"
            icon={CalendarCheck}
            href="/new-reservation"
            variant="primary"
            testId="action-new-reservation"
          />
          <QuickActionCard
            title="Check-in"
            description="Registrar llegada de huésped"
            icon={ArrowUpRight}
            href="/check-in"
            testId="action-check-in"
          />
          <QuickActionCard
            title="Check-out"
            description="Registrar salida de huésped"
            icon={ArrowDownRight}
            href="/check-out"
            testId="action-check-out"
          />
          <QuickActionCard
            title="Ver Habitaciones"
            description="Estado de todas las habitaciones"
            icon={DoorOpen}
            href="/rooms"
            testId="action-view-rooms"
          />
        </div>
      </div>

      {/* Arrivals & Departures */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Arrivals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5 text-green-600" />
                Llegadas del Dia
              </CardTitle>
              <CardDescription>{arrivals.length} check-ins pendientes</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {arrivalsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : arrivals.length > 0 ? (
              <div className="space-y-3">
                {arrivals.slice(0, 8).map((reservation) => {
                  const roomStatus = reservation.room?.status;
                  const isRoomReady = roomStatus === "available";
                  const roomStatusLabels: Record<string, string> = {
                    cleaning: "En limpieza",
                    dirty: "Sucia",
                    dirty_occupied: "Sucia/Ocupada",
                    limpia_ocupada: "Limpia/Ocupada",
                    maintenance: "En mantenimiento",
                    occupied: "Ocupada por otro huésped",
                    oos: "Fuera de servicio",
                  };
                  return (
                    <div
                      key={reservation.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-md border bg-green-50/50 dark:bg-green-900/10"
                      data-testid={`arrival-${reservation.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {reservation.guest?.lastName} {reservation.guest?.firstName}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                          <span>Hab. {reservation.room?.roomNumber}</span>
                          <span>·</span>
                          <span>{fmtDate(reservation.checkInDate)} → {fmtDate(reservation.checkOutDate)}</span>
                          {!isRoomReady && roomStatus && (
                            <Badge variant="secondary" className="text-xs">
                              {roomStatusLabels[roomStatus] ?? roomStatus}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => checkInMutation.mutate(reservation.id)}
                        disabled={checkInMutation.isPending || !isRoomReady}
                        variant={isRoomReady ? "default" : "secondary"}
                        data-testid={`checkin-btn-${reservation.id}`}
                      >
                        <LogIn className="h-4 w-4 mr-1" />
                        {isRoomReady ? "Check-in" : "No lista"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <LogIn className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No hay llegadas programadas</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Departures */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LogOut className="h-5 w-5 text-orange-600" />
                Salidas del Dia
              </CardTitle>
              <CardDescription>{departures.length} check-outs pendientes</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {departuresLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : departures.length > 0 ? (
              <div className="space-y-3">
                {departures.slice(0, 8).map((reservation) => (
                  <div
                    key={reservation.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-md border bg-orange-50/50 dark:bg-orange-900/10"
                    data-testid={`departure-${reservation.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {reservation.guest?.lastName} {reservation.guest?.firstName}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                        <span>Hab. {reservation.room?.roomNumber}</span>
                        <span>·</span>
                        <span>Ingresó: {fmtDate(reservation.checkInDate)}</span>
                        <span>·</span>
                        <span>Sale: {fmtDate(reservation.checkOutDate)}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setLocation("/check-out")}
                      data-testid={`checkout-btn-${reservation.id}`}
                    >
                      <LogOut className="h-4 w-4 mr-1" />
                      Check-out
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <LogOut className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">No hay salidas programadas</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancelled Today */}
      {todayCancelled.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Anulaciones del día
              <Badge variant="destructive" className="ml-auto">{todayCancelled.length}</Badge>
            </CardTitle>
            <CardDescription>Reservas canceladas hoy — registradas con motivo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {todayCancelled.map((log: any, i: number) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 rounded-md border border-destructive/20 bg-background">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{log.guestName} — Hab. {log.roomNumber}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {log.reservationCode} · {fmtDate(log.checkInDate)} → {fmtDate(log.checkOutDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Anulada: {fmtDateTime(log.cancellationDate)}
                      {log.cancelledBy ? ` · Por: ${log.cancelledBy}` : ""}
                    </p>
                    {log.reason && (
                      <p className="text-xs mt-1 text-destructive/80 italic">Motivo: {log.reason}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Reservations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Reservas Recientes</CardTitle>
              <CardDescription>Ultimas reservaciones registradas</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/reservations">Ver todas</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {reservationsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : recentReservations && recentReservations.length > 0 ? (
              <div className="space-y-4">
                {recentReservations.slice(0, 5).map((reservation) => (
                  <div
                    key={reservation.id}
                    className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
                    data-testid={`reservation-item-${reservation.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                        {reservation.guest?.lastName?.[0]}{reservation.guest?.firstName?.[0]}
                      </div>
                      <div>
                        <p className="font-medium">
                          {reservation.guest?.lastName} {reservation.guest?.firstName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Hab. {reservation.room?.roomNumber} · {fmtDate(reservation.checkInDate)} → {fmtDate(reservation.checkOutDate)}
                        </p>
                        {reservation.createdAt && (
                          <p className="text-xs text-muted-foreground/70">
                            Registrada: {fmtDateTime(reservation.createdAt)}
                          </p>
                        )}
                      </div>
                    </div>
                    <ReservationStatusBadge status={reservation.status} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CalendarCheck className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No hay reservas recientes</p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/reservations/new">Crear primera reserva</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Room Status Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Estado de Habitaciones</CardTitle>
              <CardDescription>Vista rápida del hotel</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/rooms">Ver todas</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {roomsLoading ? (
              <div className="grid grid-cols-4 gap-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-md" />
                ))}
              </div>
            ) : roomsOverview && roomsOverview.length > 0 ? (
              (() => {
                const roomStatusStyle: Record<string, { bg: string; label: string }> = {
                  available:    { bg: "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800",   label: "Libre" },
                  occupied:     { bg: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",       label: "Ocupada" },
                  cleaning:     { bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800", label: "Limpieza" },
                  dirty:        { bg: "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800", label: "Sucia" },
                  dirty_occupied: { bg: "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800", label: "Sucia/Ocup." },
                  limpia_ocupada: { bg: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",     label: "Limpia/Ocup." },
                  maintenance:  { bg: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",           label: "Mant." },
                  oos:          { bg: "bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700",       label: "Fuera Serv." },
                };
                const attentionStatuses = ["dirty", "cleaning", "maintenance", "occupied", "dirty_occupied", "limpia_ocupada", "oos"];
                const priorityRooms = [...roomsOverview]
                  .filter(r => attentionStatuses.includes(r.status))
                  .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
                const availableRoomsForDisplay = [...roomsOverview]
                  .filter(r => r.status === "available")
                  .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
                const displayRooms = [...priorityRooms, ...availableRoomsForDisplay].slice(0, 16);
                return (
                  <div className="grid grid-cols-4 gap-2">
                    {displayRooms.map((room) => {
                      const s = roomStatusStyle[room.status] ?? { bg: "bg-muted border-border", label: room.status };
                      return (
                        <div
                          key={room.id}
                          className={`flex flex-col items-center justify-center p-3 rounded-md border text-center ${s.bg}`}
                          data-testid={`room-tile-${room.id}`}
                        >
                          <span className="text-lg font-bold">{room.roomNumber}</span>
                          <span className="text-xs text-muted-foreground">{s.label}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <DoorOpen className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No hay habitaciones registradas</p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/rooms">Agregar habitaciones</Link>
                </Button>
              </div>
            )}

            {/* Room Status Legend */}
            {roomsOverview && roomsOverview.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t">
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-green-500" /><span className="text-xs text-muted-foreground">Libre</span></div>
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-blue-500" /><span className="text-xs text-muted-foreground">Ocupada</span></div>
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-yellow-500" /><span className="text-xs text-muted-foreground">Limpieza</span></div>
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-orange-500" /><span className="text-xs text-muted-foreground">Sucia</span></div>
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-red-500" /><span className="text-xs text-muted-foreground">Mantenimiento</span></div>
                <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-gray-400" /><span className="text-xs text-muted-foreground">Fuera Servicio</span></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      {stats && (stats.maintenanceRooms > 0 || stats.pendingReservations > 0) && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
              <AlertCircle className="h-5 w-5" />
              Alertas del Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.maintenanceRooms > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 font-medium">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>{stats.maintenanceRooms} habitación(es) bloqueada(s) por mantenimiento hoy</span>
                  </div>
                  {(stats.maintenanceBlockDetails ?? []).map((blk, i) => (
                    <div key={i} className="ml-6 text-sm text-yellow-700 dark:text-yellow-300">
                      Hab. <span className="font-semibold">{blk.roomNumber}</span>
                      {" — "}del {fmtDate(blk.blockFrom)} al {fmtDate(blk.blockTo)}
                      {blk.notes ? ` · ${blk.notes}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {stats.pendingReservations > 0 && (
                <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                  <CalendarCheck className="h-4 w-4" />
                  <span>{stats.pendingReservations} reserva(s) pendientes de confirmar</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
