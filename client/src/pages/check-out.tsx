import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  LogOut,
  Search,
  Calendar,
  User,
  DoorOpen,
  Check,
  Clock,
  CreditCard,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ReservationWithDetails } from "@shared/schema";

export default function CheckOutPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const { data: reservations, isLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations/check-out"],
  });

  const checkOutMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/reservations/${id}/check-out`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-out"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Check-out realizado",
        description: `El huésped ${selectedReservation?.guest?.firstName} ${selectedReservation?.guest?.lastName} ha sido dado de baja exitosamente.`,
      });
      setConfirmDialogOpen(false);
      setSelectedReservation(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo realizar el check-out. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const filteredReservations = reservations?.filter((res) => {
    const guestName = `${res.guest?.firstName} ${res.guest?.lastName}`.toLowerCase();
    return (
      guestName.includes(searchQuery.toLowerCase()) ||
      res.room?.roomNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleCheckOut = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setConfirmDialogOpen(true);
  };

  const today = new Date().toLocaleDateString("es-ES", {
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
        <p className="text-muted-foreground capitalize">{today}</p>
      </div>

      {/* Info Card */}
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
          <Badge className="ml-auto bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400">
            {reservations?.length || 0} activos
          </Badge>
        </CardContent>
      </Card>

      {/* Search */}
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

      {/* Reservations for Check-out */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredReservations && filteredReservations.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredReservations.map((reservation) => (
            <Card
              key={reservation.id}
              className="hover-elevate"
              data-testid={`checkout-card-${reservation.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 font-semibold">
                      {reservation.guest?.firstName?.[0]}{reservation.guest?.lastName?.[0]}
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {reservation.guest?.firstName} {reservation.guest?.lastName}
                      </CardTitle>
                      <CardDescription>{reservation.guest?.phone || reservation.guest?.email}</CardDescription>
                    </div>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400">
                    Alojado
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <DoorOpen className="h-4 w-4 text-muted-foreground" />
                    <span>Hab. {reservation.room?.roomNumber}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{reservation.numberOfGuests} huésped(es)</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Desde: {reservation.checkInDate}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Hasta: {reservation.checkOutDate}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Total a cobrar</span>
                  </div>
                  <span className="text-lg font-bold">${reservation.totalAmount || 0}</span>
                </div>
                <div className="pt-2">
                  <Button
                    variant="outline"
                    className="w-full border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
                    onClick={() => handleCheckOut(reservation)}
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
                : "No hay huéspedes alojados actualmente."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Check-out</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedReservation && (
                <>
                  Vas a registrar la salida de{" "}
                  <strong>
                    {selectedReservation.guest?.firstName} {selectedReservation.guest?.lastName}
                  </strong>{" "}
                  de la habitación <strong>{selectedReservation.room?.roomNumber}</strong>.
                  <br /><br />
                  <strong>Total a cobrar: ${selectedReservation.totalAmount || 0}</strong>
                  <br /><br />
                  La habitación quedará marcada para limpieza.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedReservation && checkOutMutation.mutate(selectedReservation.id)}
              disabled={checkOutMutation.isPending}
            >
              {checkOutMutation.isPending ? "Procesando..." : "Confirmar Check-out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
