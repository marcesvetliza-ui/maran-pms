import { useQuery, useMutation } from "@tanstack/react-query";
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
    maintenance: { label: "Mantenimiento", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  };

  const config = statusConfig[status] || { label: status, className: "" };

  return <Badge className={config.className}>{config.label}</Badge>;
}

type InHouseEntry = {
  reservationId: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
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
  const [inHouseOpen, setInHouseOpen] = useLocalState(false);

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

  const { data: departures = [], isLoading: departuresLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/dashboard/departures"],
  });

  const { data: inHouseData = [], isLoading: inHouseLoading } = useQuery<InHouseEntry[]>({
    queryKey: ["/api/dashboard/inhouse"],
    enabled: inHouseOpen,
  });

  const totalInHouse = stats ? stats.inHouseGuests : 0;

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

  const checkOutMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/reservations/${id}/check-out`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/arrivals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Check-out realizado", description: "El huesped ha sido despedido." });
    },
    onError: (error: any) => {
      const message = error?.data?.error || error?.message || "No se pudo realizar el check-out.";
      if (message.includes("saldo pendiente") || message.includes("balance")) {
        toast({ title: "Saldo Pendiente", description: message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: message, variant: "destructive" });
      }
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
            <StatCard
              title="Desayunos Mañana"
              value={stats.breakfastsTomorrow}
              description={`${stats.roomsTonight} hab. esta noche`}
              icon={Coffee}
              testId="stat-breakfasts-tomorrow"
            />
          </>
        ) : null}
      </div>

      {/* In-House Panel */}
      {inHouseOpen && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Hotel className="h-5 w-5" />
                Listado In House — {new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setInHouseOpen(false)}>Cerrar</Button>
            </div>
            <CardDescription>Huéspedes principales y acompañantes alojados en este momento</CardDescription>
          </CardHeader>
          <CardContent>
            {inHouseLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : inHouseData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay huéspedes con check-in activo.</p>
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
                      <th className="text-left py-2 px-2 font-medium">Ingreso</th>
                      <th className="text-left py-2 px-2 font-medium">Egreso</th>
                      <th className="text-left py-2 px-2 font-medium">Rol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inHouseData.flatMap((entry) => {
                      const fmt = (d: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
                      const rows = [];
                      rows.push(
                        <tr key={`${entry.reservationId}-main`} className="border-b hover:bg-muted/40">
                          <td className="py-1.5 px-2 font-semibold">{entry.roomNumber}</td>
                          <td className="py-1.5 px-2 font-medium">{entry.guest.lastName}, {entry.guest.firstName}</td>
                          <td className="py-1.5 px-2">{entry.guest.documentType?.toUpperCase() || "—"}</td>
                          <td className="py-1.5 px-2">{entry.guest.documentNumber || "—"}</td>
                          <td className="py-1.5 px-2">{entry.guest.nationality || "—"}</td>
                          <td className="py-1.5 px-2">{entry.guest.dateOfBirth ? fmt(entry.guest.dateOfBirth) : "—"}</td>
                          <td className="py-1.5 px-2">{fmt(entry.checkIn)}</td>
                          <td className="py-1.5 px-2">{fmt(entry.checkOut)}</td>
                          <td className="py-1.5 px-2"><Badge variant="outline" className="text-xs">Titular</Badge></td>
                        </tr>
                      );
                      entry.companions.forEach((c, ci) => {
                        rows.push(
                          <tr key={`${entry.reservationId}-comp-${ci}`} className="border-b bg-muted/20 hover:bg-muted/40">
                            <td className="py-1.5 px-2 text-muted-foreground">{entry.roomNumber}</td>
                            <td className="py-1.5 px-2 pl-4">{c.lastName}, {c.firstName}</td>
                            <td className="py-1.5 px-2">{c.documentType?.toUpperCase() || "—"}</td>
                            <td className="py-1.5 px-2">{c.documentNumber || "—"}</td>
                            <td className="py-1.5 px-2">{c.nationality || "—"}</td>
                            <td className="py-1.5 px-2">{c.dateOfBirth ? fmt(c.dateOfBirth) : "—"}</td>
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
                {arrivals.slice(0, 5).map((reservation) => {
                  const roomStatus = reservation.room?.status;
                  const isRoomReady = roomStatus === "available";
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
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Hab. {reservation.room?.roomNumber}</span>
                          {!isRoomReady && (
                            <Badge variant="secondary" className="text-xs">
                              {roomStatus === "cleaning" ? "En limpieza" : 
                               roomStatus === "maintenance" ? "Mantenimiento" : 
                               roomStatus === "occupied" ? "Ocupada" : roomStatus}
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
                {departures.slice(0, 5).map((reservation) => (
                  <div
                    key={reservation.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-md border bg-orange-50/50 dark:bg-orange-900/10"
                    data-testid={`departure-${reservation.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {reservation.guest?.lastName} {reservation.guest?.firstName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Hab. {reservation.room?.roomNumber} | ${reservation.totalRoomAmount}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => checkOutMutation.mutate(reservation.id)}
                      disabled={checkOutMutation.isPending}
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
                    <p className="font-medium text-sm">{log.guestName} — Hab. {log.roomNumber}</p>
                    <p className="text-xs text-muted-foreground">{log.reservationCode} · {log.checkInDate} → {log.checkOutDate}</p>
                    {log.reason && (
                      <p className="text-xs mt-1 text-destructive/80 italic">Motivo: {log.reason}</p>
                    )}
                    {log.cancelledBy && (
                      <p className="text-xs text-muted-foreground">Por: {log.cancelledBy}</p>
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
                          Hab. {reservation.room?.roomNumber} | {reservation.checkInDate} - {reservation.checkOutDate}
                        </p>
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
              <div className="grid grid-cols-4 gap-2">
                {roomsOverview.slice(0, 12).map((room) => (
                  <div
                    key={room.id}
                    className={`flex flex-col items-center justify-center p-3 rounded-md border text-center ${
                      room.status === "available"
                        ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                        : room.status === "occupied"
                        ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
                        : room.status === "cleaning"
                        ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800"
                        : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
                    }`}
                    data-testid={`room-tile-${room.id}`}
                  >
                    <span className="text-lg font-bold">{room.roomNumber}</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {room.status === "available" ? "Libre" : 
                       room.status === "occupied" ? "Ocupada" : 
                       room.status === "cleaning" ? "Limpieza" : "Mant."}
                    </span>
                  </div>
                ))}
              </div>
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
              <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-sm text-muted-foreground">Disponible</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-sm text-muted-foreground">Ocupada</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <span className="text-sm text-muted-foreground">Limpieza</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="text-sm text-muted-foreground">Mantenimiento</span>
                </div>
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
                <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                  <Clock className="h-4 w-4" />
                  <span>{stats.maintenanceRooms} habitación(es) en mantenimiento</span>
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
