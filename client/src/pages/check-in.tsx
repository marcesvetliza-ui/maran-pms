import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  LogIn,
  Search,
  Calendar,
  User,
  DoorOpen,
  Check,
  Clock,
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

export default function CheckInPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const { data: reservations, isLoading } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations/check-in"],
  });

  const checkInMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/reservations/${id}/check-in`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-in"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Check-in realizado",
        description: `El huésped ${selectedReservation?.guest?.firstName} ${selectedReservation?.guest?.lastName} ha sido registrado exitosamente.`,
      });
      setConfirmDialogOpen(false);
      setSelectedReservation(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo realizar el check-in. Intente nuevamente.",
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

  const handleCheckIn = (reservation: ReservationWithDetails) => {
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
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-checkin-title">
          Check-in
        </h1>
        <p className="text-muted-foreground capitalize">{today}</p>
      </div>

      {/* Info Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <LogIn className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Registro de Llegadas</h3>
            <p className="text-sm text-muted-foreground">
              Reservas confirmadas listas para check-in
            </p>
          </div>
          <Badge className="ml-auto" variant="secondary">
            {reservations?.length || 0} pendientes
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
              data-testid="input-search-checkin"
            />
          </div>
        </CardContent>
      </Card>

      {/* Reservations for Check-in */}
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
              data-testid={`checkin-card-${reservation.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                      {reservation.guest?.firstName?.[0]}{reservation.guest?.lastName?.[0]}
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {reservation.guest?.firstName} {reservation.guest?.lastName}
                      </CardTitle>
                      <CardDescription>{reservation.guest?.email}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary">Confirmada</Badge>
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
                    <span>{reservation.checkInDate}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{reservation.checkOutDate}</span>
                  </div>
                </div>
                <div className="pt-2">
                  <Button
                    className="w-full"
                    onClick={() => handleCheckIn(reservation)}
                    data-testid={`button-checkin-${reservation.id}`}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Realizar Check-in
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <LogIn className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay check-ins pendientes</h3>
            <p className="text-muted-foreground">
              {searchQuery
                ? "No se encontraron reservas con los criterios de búsqueda."
                : "Todas las reservas confirmadas ya han realizado check-in."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Check-in</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedReservation && (
                <>
                  Vas a registrar la llegada de{" "}
                  <strong>
                    {selectedReservation.guest?.firstName} {selectedReservation.guest?.lastName}
                  </strong>{" "}
                  a la habitación <strong>{selectedReservation.room?.roomNumber}</strong>.
                  <br /><br />
                  Esto marcará la habitación como ocupada.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedReservation && checkInMutation.mutate(selectedReservation.id)}
              disabled={checkInMutation.isPending}
            >
              {checkInMutation.isPending ? "Procesando..." : "Confirmar Check-in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
