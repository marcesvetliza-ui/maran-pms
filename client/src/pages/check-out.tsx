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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ReservationWithDetails } from "@shared/schema";
import { PrefacturaDialog } from "@/components/PrefacturaDialog";

export default function CheckOutPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showOverdueDialog, setShowOverdueDialog] = useState(false);
  const [bulkClosing, setBulkClosing] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | null>(null);
  const [prefacturaOpen, setPrefacturaOpen] = useState(false);

  const { data: reservations, isLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/dashboard/departures"],
  });

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

  const today = getLocalToday();
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

      <Card className="bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
            <LogOut className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="font-semibold">Registro de Salidas</h3>
            <p className="text-sm text-muted-foreground">
              Huéspedes activos listos para check-out
            </p>
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
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre de huésped o número de habitación..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-checkout"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredReservations && filteredReservations.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredReservations.slice().sort((a, b) => parseInt(a.room?.roomNumber || "0") - parseInt(b.room?.roomNumber || "0")).map((reservation) => (
            <Card
              key={reservation.id}
              className="hover-elevate"
              data-testid={`checkout-card-${reservation.id}`}
            >
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
                  <span className="text-2xl font-bold text-primary tracking-tight">
                    {reservation.room?.roomNumber}
                  </span>
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
                const daysDiff = Math.floor(
                  (new Date(today).getTime() - new Date(reservation.checkOutDate).getTime()) / 86400000
                );
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
                  onClick={() => {
                    setBulkClosing(true);
                    bulkCheckoutOverdueMutation.mutate(false);
                  }}
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
                  onClick={() => {
                    setBulkClosing(true);
                    bulkCheckoutOverdueMutation.mutate(true);
                  }}
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
      {/* PrefacturaDialog — unified checkout + billing */}
      {selectedReservation && (
        <PrefacturaDialog
          open={prefacturaOpen}
          onClose={() => {
            setPrefacturaOpen(false);
            setSelectedReservation(null);
          }}
          reservationId={selectedReservation.id}
          reservation={selectedReservation}
          mode="checkout"
          onCheckoutComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/dashboard/departures"] });
          }}
        />
      )}
    </div>
  );
}
