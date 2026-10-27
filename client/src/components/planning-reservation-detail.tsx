import { ReservationDetailDialog } from "@/pages/reservations";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { LogIn, LogOut, AlertCircle, Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/App";
import { getLocalToday, toArgentinaDateStr } from "@/lib/utils";
import type { ReservationWithDetails } from "@shared/schema";
import { PrefacturaDialog } from "@/components/PrefacturaDialog";

export function ReservationDetailModal({
  open,
  onOpenChange,
  reservationId,
  onNavigate,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string | null;
  onNavigate: (path: string) => void;
  onEdit?: (reservation: ReservationWithDetails) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [retroDialogOpen, setRetroDialogOpen] = useState(false);
  const [retroMotivo, setRetroMotivo] = useState("");
  const [dirtyRoomDialogOpen, setDirtyRoomDialogOpen] = useState(false);
  const [prefacturaOpen, setPrefacturaOpen] = useState(false);

  const { data: reservation, isLoading } = useQuery<ReservationWithDetails>({
    queryKey: ["/api/reservations", reservationId],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservationId}`);
      if (!res.ok) throw new Error("Failed to fetch reservation");
      return res.json();
    },
    enabled: !!reservationId && open,
  });

  const startCheckout = () => setPrefacturaOpen(true);

  const checkInMutation = useMutation({
    mutationFn: async ({ motivo }: { motivo?: string } = {}) =>
      apiRequest(
        "POST",
        `/api/reservations/${reservationId}/check-in`,
        motivo ? { motivo } : {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/planning",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/arrivals"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/dashboard/departures"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({
        title: "Check-in realizado",
        description: "El huesped ha sido registrado.",
      });
      setRetroDialogOpen(false);
      setRetroMotivo("");
      onOpenChange(false);
    },
    onError: (error: any) => {
      let body: any = {};
      try {
        const msg = error?.message || "";
        const jsonStart = msg.indexOf("{");
        if (jsonStart !== -1) body = JSON.parse(msg.slice(jsonStart));
      } catch {}
      if (body?.error === "CHECK_IN_RETROACTIVO") {
        setRetroDialogOpen(true);
      } else {
        toast({
          title: "Error en Check-in",
          description:
            body?.error ||
            body?.message ||
            error?.message ||
            "No se pudo realizar el check-in.",
          variant: "destructive",
        });
      }
    },
  });

  const undoCheckOutMutation = useMutation({
    mutationFn: async () =>
      apiRequest(
        "POST",
        `/api/reservations/${reservationId}/undo-checkout`,
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/planning",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({
        title: "Check-out revertido",
        description:
          "La reserva volvió a Check-in y la habitación quedó Ocupada.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      let description = "No se pudo revertir el check-out.";
      try {
        const b = JSON.parse(error.message.replace(/^\d+:\s*/, ""));
        if (b.error) description = b.error;
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const undoCheckInMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/reservations/${reservationId}/undo-checkin`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/planning",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({
        title: "Check-in revertido",
        description:
          "La reserva volvió a Confirmada y la habitación quedó Limpia.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      let description = "No se pudo revertir el check-in.";
      try {
        const b = JSON.parse(error.message.replace(/^\d+:\s*/, ""));
        if (b.error) description = b.error;
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const cancelReservationMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/reservations/${reservationId}/cancel`, {
        reason: "Anulado desde Planning",
        cancelledBy: user?.username || "Recepción",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === "/api/planning",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/cancelled-reservations"],
        exact: false,
      });
      toast({ title: "Reserva anulada" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      let description = "No se pudo anular la reserva.";
      try {
        const body = JSON.parse(error.message.replace(/^\d+:\s*/, ""));
        if (body.error) description = body.error;
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  if (!reservationId) return null;

  const todayLocal = getLocalToday();
  const isCheckInDateValid = reservation
    ? (() => {
        const todayMs = new Date(todayLocal + "T12:00:00").getTime();
        const ciMs = new Date(reservation.checkInDate + "T12:00:00").getTime();
        const diffDays = Math.round((ciMs - todayMs) / (1000 * 60 * 60 * 24));
        return diffDays <= 1; // today, any past date, or tomorrow (early check-in)
      })()
    : false;
  const isCheckOutDateValid = reservation
    ? (() => {
        const todayMs = new Date(todayLocal + "T12:00:00").getTime();
        const coMs = new Date(reservation.checkOutDate + "T12:00:00").getTime();
        const diffDays = Math.round((coMs - todayMs) / (1000 * 60 * 60 * 24));
        return diffDays <= 1; // today, any past date, or tomorrow
      })()
    : false;
  const canCheckIn =
    (reservation?.status === "confirmed" ||
      reservation?.status === "web_checkin" ||
      reservation?.status === "pending" ||
      reservation?.status === "tentative") &&
    isCheckInDateValid;
  const canCheckOut =
    reservation?.status === "checked_in" && isCheckOutDateValid;
  const canUndoCheckIn =
    reservation?.status === "checked_in" &&
    reservation?.checkInDate === todayLocal;
  const canUndoCheckOut =
    reservation?.status === "checked_out" &&
    reservation?.checkedOutAt != null &&
    toArgentinaDateStr(new Date(reservation.checkedOutAt)) === todayLocal;
  const canCancel =
    reservation?.status === "confirmed" ||
    reservation?.status === "web_checkin" ||
    reservation?.status === "pending" ||
    reservation?.status === "tentative";
  return (
    <>
      {open && reservation ? (
        <ReservationDetailDialog
          open={open}
          reservation={reservation}
          currentUserRole={user?.role}
          allowCancel={canCancel}
          onOpenChange={onOpenChange}
          onEdit={
            onEdit && !(reservation.isGroup && reservation.groupId)
              ? () => {
                  onEdit(reservation);
                  onOpenChange(false);
                }
              : undefined
          }
          onCancel={() => {
            if (window.confirm("¿Está seguro que desea cancelar esta reserva?"))
              cancelReservationMutation.mutate();
          }}
          operationalActions={
            <>
              {reservation.isGroup && reservation.groupId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onNavigate(`/groups/${reservation.groupId}`);
                  }}
                  data-testid="button-edit-group-reservation"
                >
                  Ver en Grupo
                </Button>
              )}
              {canCheckIn && (
                <Button
                  onClick={() => {
                    const roomStatus = reservation?.room?.status;
                    if (
                      roomStatus === "dirty" ||
                      roomStatus === "cleaning" ||
                      roomStatus === "maintenance"
                    ) {
                      setDirtyRoomDialogOpen(true);
                      return;
                    }
                    checkInMutation.mutate({});
                  }}
                  disabled={checkInMutation.isPending}
                  className="w-full sm:w-auto"
                  data-testid="button-checkin-quick"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  {checkInMutation.isPending ? "Procesando..." : "Check-in"}
                </Button>
              )}
              {canCheckOut && (
                <Button
                  onClick={startCheckout}
                  variant="secondary"
                  className="w-full sm:w-auto"
                  data-testid="button-checkout-quick"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Check-out
                </Button>
              )}
              {canUndoCheckOut && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        "¿Revertir el check-out? La reserva volverá a Check-in y la habitación quedará Ocupada.",
                      )
                    ) {
                      undoCheckOutMutation.mutate();
                    }
                  }}
                  disabled={undoCheckOutMutation.isPending}
                  className="w-full sm:w-auto text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950/30"
                  data-testid="button-undo-checkout"
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  {undoCheckOutMutation.isPending
                    ? "Revirtiendo..."
                    : "Revertir Check-out"}
                </Button>
              )}
              {canUndoCheckIn && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        "¿Revertir el check-in? La reserva volverá a Confirmada y la habitación quedará Limpia.",
                      )
                    ) {
                      undoCheckInMutation.mutate();
                    }
                  }}
                  disabled={undoCheckInMutation.isPending}
                  className="w-full sm:w-auto text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950/30"
                  data-testid="button-undo-checkin"
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  {undoCheckInMutation.isPending
                    ? "Revirtiendo..."
                    : "Revertir Check-in"}
                </Button>
              )}
            </>
          }
        />
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Detalle de reserva</DialogTitle>
            </DialogHeader>
            <p role={isLoading ? "status" : "alert"}>
              {isLoading
                ? "Cargando reserva…"
                : "No se pudo cargar la reserva."}
            </p>
          </DialogContent>
        </Dialog>
      )}

      {/* Retroactive check-in dialog */}
      <Dialog
        open={retroDialogOpen}
        onOpenChange={(open) => {
          setRetroDialogOpen(open);
          if (!open) setRetroMotivo("");
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Check-in retroactivo</DialogTitle>
            <DialogDescription>
              La fecha de check-in es anterior a hoy. Ingresá el motivo para
              registrarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="retro-motivo-planning">Motivo (obligatorio)</Label>
            <Input
              id="retro-motivo-planning"
              className="mt-1"
              placeholder="Ej: El huésped llegó ayer sin registrar..."
              value={retroMotivo}
              onChange={(e) => setRetroMotivo(e.target.value)}
              data-testid="input-retro-motivo-planning"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRetroDialogOpen(false);
                setRetroMotivo("");
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={!retroMotivo.trim() || checkInMutation.isPending}
              onClick={() => {
                if (retroMotivo.trim())
                  checkInMutation.mutate({ motivo: retroMotivo });
              }}
              data-testid="button-confirm-retro-checkin-planning"
            >
              {checkInMutation.isPending
                ? "Procesando..."
                : "Confirmar Check-in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso: habitación sucia o en mantenimiento */}
      <Dialog open={dirtyRoomDialogOpen} onOpenChange={setDirtyRoomDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertCircle className="h-5 w-5" />
              Habitación no disponible
            </DialogTitle>
            <DialogDescription>
              La habitación <strong>{reservation?.room?.roomNumber}</strong>{" "}
              figura como{" "}
              <strong>
                {reservation?.room?.status === "dirty"
                  ? "sucia"
                  : reservation?.room?.status === "maintenance"
                    ? "en mantenimiento"
                    : "en limpieza"}
              </strong>{" "}
              en el sistema. ¿Desea registrar el check-in de todas formas?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDirtyRoomDialogOpen(false)}
              data-testid="button-cancel-dirty-warning-planning"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDirtyRoomDialogOpen(false);
                checkInMutation.mutate({});
              }}
              disabled={checkInMutation.isPending}
              data-testid="button-confirm-dirty-checkin-planning"
            >
              Confirmar de todas formas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reservationId && (
        <PrefacturaDialog
          open={prefacturaOpen}
          onClose={() => setPrefacturaOpen(false)}
          reservationId={reservationId}
          reservation={reservation as any}
          mode="checkout"
          onCheckoutComplete={() => {
            setPrefacturaOpen(false);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
