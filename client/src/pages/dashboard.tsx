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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ReservationWithDetails, RoomWithType } from "@shared/schema";

type DashboardStats = {
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  dirtyRooms: number;
  cleaningRooms: number;
  maintenanceRooms: number;
  oosRooms: number;
  todayCheckIns: number;
  todayCheckOuts: number;
  occupancyRate: number;
  totalGuests: number;
  pendingReservations: number;
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

export default function Dashboard() {
  const { toast } = useToast();

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
    onError: () => {
      toast({ title: "Error", description: "No se pudo realizar el check-in.", variant: "destructive" });
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
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
            <StatCard
              title="Huéspedes Activos"
              value={stats.totalGuests}
              description="registrados en el sistema"
              icon={Users}
              testId="stat-active-guests"
            />
          </>
        ) : null}
      </div>

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
                {arrivals.slice(0, 5).map((reservation) => (
                  <div
                    key={reservation.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-md border bg-green-50/50 dark:bg-green-900/10"
                    data-testid={`arrival-${reservation.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {reservation.guest?.firstName} {reservation.guest?.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Hab. {reservation.room?.roomNumber} | {reservation.nights} noche(s)
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => checkInMutation.mutate(reservation.id)}
                      disabled={checkInMutation.isPending}
                      data-testid={`checkin-btn-${reservation.id}`}
                    >
                      <LogIn className="h-4 w-4 mr-1" />
                      Check-in
                    </Button>
                  </div>
                ))}
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
                        {reservation.guest?.firstName} {reservation.guest?.lastName}
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
                        {reservation.guest?.firstName?.[0]}{reservation.guest?.lastName?.[0]}
                      </div>
                      <div>
                        <p className="font-medium">
                          {reservation.guest?.firstName} {reservation.guest?.lastName}
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
