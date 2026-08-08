import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getLocalToday, formatDateAR, fmtMoney } from "@/lib/utils";
import {
  LogOut,
  Search,
  Calendar,
  User,
  DoorOpen,
  Clock,
  CreditCard,
  AlertCircle,
  Loader2,
  ListChecks,
  UserX,
  BanknoteIcon,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ReservationWithDetails } from "@shared/schema";
import { PrefacturaDialog } from "@/components/PrefacturaDialog";

// ─── helpers ────────────────────────────────────────────────────────────────
function daysSince(dateStr: string, today: string) {
  return Math.floor(
    (new Date(today).getTime() - new Date(dateStr).getTime()) / 86400000
  );
}

// ─── No-show card ────────────────────────────────────────────────────────────
function NoShowCard({
  reservation,
  today,
  onWithCharge,
  onWithoutCharge,
}: {
  reservation: any;
  today: string;
  onWithCharge: (r: any) => void;
  onWithoutCharge: (r: any) => void;
}) {
  const days = daysSince(reservation.check_in_date ?? reservation.checkInDate, today);
  const guest = reservation.guest ?? {};
  const room  = reservation.room ?? {};

  return (
    <Card className="border-amber-200 dark:border-amber-800" data-testid={`noshow-card-${reservation.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-semibold">
              {guest.lastName?.[0]}{guest.firstName?.[0]}
            </div>
            <div>
              <CardTitle className="text-base">
                {guest.lastName} {guest.firstName}
              </CardTitle>
              <CardDescription className="text-xs">{guest.phone || guest.email || "Sin contacto"}</CardDescription>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">No Show</Badge>
            <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {days === 1 ? "Hace 1 día" : `Hace ${days} días`}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <DoorOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-2xl font-bold text-primary tracking-tight">{room.room_number ?? room.roomNumber}</span>
          <span className="text-xs text-muted-foreground">{room.room_type?.name ?? ""}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Check-in: {formatDateAR(reservation.check_in_date ?? reservation.checkInDate)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Check-out: {formatDateAR(reservation.check_out_date ?? reservation.checkOutDate)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{reservation.number_of_guests ?? reservation.numberOfGuests ?? 1} huésped(es)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold">${fmtMoney(reservation.total_room_amount ?? reservation.totalRoomAmount ?? "0")}</span>
          </div>
        </div>
        {reservation.reservation_code && (
          <p className="text-xs text-muted-foreground font-mono">{reservation.reservation_code}</p>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
            onClick={() => onWithCharge(reservation)}
            data-testid={`noshow-with-charge-${reservation.id}`}
          >
            <BanknoteIcon className="h-3.5 w-3.5 mr-1.5" />
            Cerrar con cobro
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
            onClick={() => onWithoutCharge(reservation)}
            data-testid={`noshow-without-charge-${reservation.id}`}
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Cerrar sin cobro
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function CheckOutPage() {
  const { toast } = useToast();
  const today = getLocalToday();

  // ── checkout state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [showOverdueDialog, setShowOverdueDialog] = useState(false);
  const [bulkClosing, setBulkClosing] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | null>(null);
  const [prefacturaOpen, setPrefacturaOpen] = useState(false);

  // ── no-show state ──
  const [selectedNoShow, setSelectedNoShow] = useState<any>(null);
  const [noShowWithChargeOpen, setNoShowWithChargeOpen] = useState(false);
  const [noShowWithoutChargeOpen, setNoShowWithoutChargeOpen] = useState(false);
  // tracks whether billing was opened for a no-show (so we mark it on close)
  const [pendingNoShowId, setPendingNoShowId] = useState<string | null>(null);

  // ── queries ──
  const { data: reservations, isLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/dashboard/departures"],
  });

  const { data: noShows = [], isLoading: loadingNoShows, refetch: refetchNoShows } = useQuery<any[]>({
    queryKey: ["/api/reservations/no-shows"],
  });

  // ── checkout mutations ──
  const bulkCheckoutOverdueMutation = useMutation({
    mutationFn: async (force: boolean = false) => {
      return apiRequest("POST", `/api/reservations/bulk-checkout-overdue`, { force });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-out"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setBulkClosing(false);
      setShowOverdueDialog(false);
      toast({
        title: "Cierre masivo completado",
        description: `${data.closed} salidas registradas. ${data.skipped > 0 ? `${data.skipped} con saldo pendiente (requieren revisión manual).` : ""}`,
      });
    },
    onError: () => {
      setBulkClosing(false);
      toast({ title: "Error", description: "No se pudo completar el cierre masivo.", variant: "destructive" });
    },
  });

  // ── no-show mutations ──
  const closeNoShowMutation = useMutation({
    mutationFn: async ({ id, withCharge }: { id: string; withCharge: boolean }) => {
      const res = await apiRequest("POST", `/api/reservations/${id}/no-show`, { withCharge });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/no-shows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setNoShowWithoutChargeOpen(false);
      setSelectedNoShow(null);
      toast({
        title: vars.withCharge ? "No-show cerrado con cobro" : "No-show cerrado sin cobro",
        description: "La habitación quedó disponible para limpieza.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Error al cerrar no-show", description: String(err?.message || err), variant: "destructive" });
    },
  });

  // ── checkout helpers ──
  const overdueReservations = reservations?.filter((res) => res.checkOutDate < today) ?? [];
  const filteredReservations = reservations?.filter((res) => {
    if (res.checkOutDate > today) return false;
    const guestName = `${res.guest?.lastName} ${res.guest?.firstName}`.toLowerCase();
    return (
      guestName.includes(searchQuery.toLowerCase()) ||
      res.room?.roomNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const startCheckout = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setPrefacturaOpen(true);
  };

  // ── no-show handlers ──
  const handleNoShowWithCharge = (r: any) => {
    setSelectedNoShow(r);
    setPendingNoShowId(r.id);
    setNoShowWithChargeOpen(true);
  };

  const handleNoShowWithoutCharge = (r: any) => {
    setSelectedNoShow(r);
    setNoShowWithoutChargeOpen(true);
  };

  // After billing dialog closes, mark reservation as no_show
  const handleBillingDialogClose = () => {
    setNoShowWithChargeOpen(false);
    if (pendingNoShowId) {
      closeNoShowMutation.mutate({ id: pendingNoShowId, withCharge: true });
      setPendingNoShowId(null);
    }
    setSelectedNoShow(null);
  };

  const todayDisplay = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-checkout-title">
          Check-out
        </h1>
        <p className="text-muted-foreground capitalize">{todayDisplay}</p>
      </div>

      <Tabs defaultValue="salidas">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="salidas" className="flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            Salidas
            {(filteredReservations?.length ?? 0) > 0 && (
              <Badge className="ml-1 bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400 text-xs px-1.5 py-0">
                {filteredReservations?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="no-shows" className="flex items-center gap-2">
            <UserX className="h-4 w-4" />
            No Shows
            {noShows.length > 0 && (
              <Badge className="ml-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-xs px-1.5 py-0">
                {noShows.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ══════════ TAB SALIDAS ══════════ */}
        <TabsContent value="salidas" className="mt-4 flex flex-col gap-4">
          <Card className="bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
                <LogOut className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h3 className="font-semibold">Registro de Salidas</h3>
                <p className="text-sm text-muted-foreground">Huéspedes activos listos para check-out</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {overdueReservations.length > 0 && (
                  <button
                    onClick={() => setShowOverdueDialog(true)}
                    className="flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors"
                    data-testid="button-overdue-checkouts"
                  >
                    <ListChecks className="h-4 w-4" />
                    Cierre masivo
                  </button>
                )}
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400" data-testid="badge-active-count">
                  {filteredReservations?.length || 0} pendientes
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre de huésped o número de habitación..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-checkout"
                />
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48" />)}
            </div>
          ) : filteredReservations && filteredReservations.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredReservations
                .slice()
                .sort((a, b) => parseInt(a.room?.roomNumber || "0") - parseInt(b.room?.roomNumber || "0"))
                .map((reservation) => (
                  <Card key={reservation.id} className="hover-elevate" data-testid={`checkout-card-${reservation.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 font-semibold">
                            {reservation.guest?.lastName?.[0]}{reservation.guest?.firstName?.[0]}
                          </div>
                          <div>
                            <CardTitle className="text-lg">
                              {reservation.guest?.lastName} {reservation.guest?.firstName}
                            </CardTitle>
                            <CardDescription>{reservation.guest?.phone || reservation.guest?.email}</CardDescription>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {reservation.status === "checked_in" ? (
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400">Alojado</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400" data-testid={`badge-no-checkin-${reservation.id}`}>Sin check-in</Badge>
                          )}
                          {reservation.checkOutDate === today ? (
                            <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400" data-testid={`badge-today-${reservation.id}`}>Hoy</Badge>
                          ) : reservation.checkOutDate < today ? (
                            <Badge className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400" data-testid={`badge-overdue-${reservation.id}`}>Vencido</Badge>
                          ) : (
                            <Badge className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400" data-testid={`badge-early-${reservation.id}`}>Salida {formatDateAR(reservation.checkOutDate)}</Badge>
                          )}
                          {(reservation as any).lateCheckOut && (
                            <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700" data-testid={`badge-late-checkout-${reservation.id}`}>
                              🕐 Late Check-out{(reservation as any).lateCheckOutTime ? ` · ${(reservation as any).lateCheckOutTime} hs` : ""}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <DoorOpen className="h-4 w-4 text-muted-foreground" />
                        <span className="text-2xl font-bold text-primary tracking-tight">{reservation.room?.roomNumber}</span>
                        <span className="text-xs text-muted-foreground">{(reservation.room as any)?.roomType?.name || ""}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{reservation.numberOfGuests} huésped(es)</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Desde: {formatDateAR(reservation.checkInDate)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>Hasta: {formatDateAR(reservation.checkOutDate)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Total habitación</span>
                        </div>
                        <span className="text-lg font-bold">${fmtMoney(reservation.totalRoomAmount || "0")}</span>
                      </div>
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          className="w-full border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
                          onClick={() => startCheckout(reservation)}
                          data-testid={`button-checkout-${reservation.id}`}
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          Realizar Check-out
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <LogOut className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay check-outs pendientes</h3>
                <p className="text-muted-foreground">
                  {searchQuery
                    ? "No se encontraron huéspedes con los criterios de búsqueda."
                    : "No hay check-outs programados para hoy ni vencidos."}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════ TAB NO SHOWS ══════════ */}
        <TabsContent value="no-shows" className="mt-4 flex flex-col gap-4">
          <Card className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                <UserX className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold">No Shows</h3>
                <p className="text-sm text-muted-foreground">
                  Reservas con check-in pasado sin presentarse
                </p>
              </div>
              <Badge className="ml-auto bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                {noShows.length} pendiente{noShows.length !== 1 ? "s" : ""}
              </Badge>
            </CardContent>
          </Card>

          {loadingNoShows ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-52" />)}
            </div>
          ) : noShows.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {noShows.map((r) => (
                <NoShowCard
                  key={r.id}
                  reservation={r}
                  today={today}
                  onWithCharge={handleNoShowWithCharge}
                  onWithoutCharge={handleNoShowWithoutCharge}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <UserX className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin no-shows pendientes</h3>
                <p className="text-muted-foreground">
                  No hay reservas con check-in pasado sin procesar.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ══════════ DIALOGS SALIDAS ══════════ */}
      <Dialog open={showOverdueDialog} onOpenChange={setShowOverdueDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              Habitaciones no cerradas ({overdueReservations.length})
            </DialogTitle>
            <DialogDescription>
              Estas reservas superaron su fecha de check-out sin haber sido procesadas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {overdueReservations.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No hay habitaciones pendientes de cierre.</p>
            ) : (
              overdueReservations.map((reservation) => {
                const daysDiff = daysSince(reservation.checkOutDate, today);
                return (
                  <div
                    key={reservation.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
                    data-testid={`overdue-row-${reservation.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 font-semibold text-sm shrink-0">
                        {reservation.guest?.lastName?.[0]}{reservation.guest?.firstName?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {reservation.guest?.lastName} {reservation.guest?.firstName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Hab. {reservation.room?.roomNumber} · Venció: {formatDateAR(reservation.checkOutDate)}
                          {" "}
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            (hace {daysDiff} {daysDiff === 1 ? "día" : "días"})
                          </span>
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setShowOverdueDialog(false);
                        startCheckout(reservation);
                      }}
                      data-testid={`button-checkout-overdue-${reservation.id}`}
                    >
                      <LogOut className="h-3.5 w-3.5 mr-1" />
                      Check-out
                    </Button>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowOverdueDialog(false)}>Cancelar</Button>
            {overdueReservations.length > 0 && (
              <>
                <Button
                  variant="secondary"
                  disabled={bulkCheckoutOverdueMutation.isPending}
                  data-testid="button-bulk-checkout-overdue"
                  onClick={() => { setBulkClosing(true); bulkCheckoutOverdueMutation.mutate(false); }}
                >
                  {bulkCheckoutOverdueMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cerrando...</>
                  ) : (
                    <><LogOut className="h-4 w-4 mr-2" />Cerrar saldo $0 ({overdueReservations.length})</>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  disabled={bulkCheckoutOverdueMutation.isPending}
                  data-testid="button-bulk-checkout-force"
                  onClick={() => { setBulkClosing(true); bulkCheckoutOverdueMutation.mutate(true); }}
                >
                  {bulkCheckoutOverdueMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cerrando...</>
                  ) : (
                    <><LogOut className="h-4 w-4 mr-2" />Forzar cierre de TODAS</>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PrefacturaDialog para checkout normal */}
      {selectedReservation && (
        <PrefacturaDialog
          open={prefacturaOpen}
          onClose={() => { setPrefacturaOpen(false); setSelectedReservation(null); }}
          reservationId={selectedReservation.id}
          reservation={selectedReservation}
          mode="checkout"
          onCheckoutComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/dashboard/departures"] });
          }}
        />
      )}

      {/* ══════════ DIALOGS NO SHOWS ══════════ */}

      {/* Cerrar con cobro → PrefacturaDialog en modo billing */}
      {selectedNoShow && noShowWithChargeOpen && (
        <PrefacturaDialog
          open={noShowWithChargeOpen}
          onClose={handleBillingDialogClose}
          reservationId={selectedNoShow.id}
          mode="billing"
        />
      )}

      {/* Cerrar sin cobro → confirmación simple */}
      <Dialog open={noShowWithoutChargeOpen} onOpenChange={(v) => { if (!v) { setNoShowWithoutChargeOpen(false); setSelectedNoShow(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-amber-600" />
              Cerrar No-Show sin cobro
            </DialogTitle>
            <DialogDescription>
              {selectedNoShow && (
                <>
                  <span className="font-medium">
                    {selectedNoShow.guest?.lastName} {selectedNoShow.guest?.firstName}
                  </span>{" "}
                  — Hab.{" "}
                  <span className="font-medium">
                    {selectedNoShow.room?.room_number ?? selectedNoShow.room?.roomNumber}
                  </span>
                  <br />
                  Check-in esperado: {formatDateAR(selectedNoShow.check_in_date ?? selectedNoShow.checkInDate)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
            La reserva se cerrará como <strong>no-show sin penalidad</strong>. La habitación quedará disponible para limpieza. Este movimiento quedará registrado en la caja del día con monto $0.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNoShowWithoutChargeOpen(false); setSelectedNoShow(null); }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={closeNoShowMutation.isPending}
              onClick={() => selectedNoShow && closeNoShowMutation.mutate({ id: selectedNoShow.id, withCharge: false })}
              data-testid="button-confirm-noshow-without-charge"
            >
              {closeNoShowMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cerrando...</>
              ) : (
                <><XCircle className="h-4 w-4 mr-2" />Confirmar cierre sin cobro</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
