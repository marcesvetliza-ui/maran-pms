import { useRef, useState, type DragEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  spaMoveEndTime,
  type MovableSpaAppointment,
  type SpaPlanningMove,
} from "@shared/spaPlanningMove";

function today() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function time(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function useSpaPlanningMove({
  canEdit,
  isSimple,
  cabinName,
  planningDate,
}: {
  planningDate: string;
  canEdit: boolean;
  isSimple: (a: MovableSpaAppointment) => boolean;
  cabinName: (id: string) => string;
}) {
  const { toast } = useToast();
  const dragged = useRef<{
    appointment: MovableSpaAppointment;
    offset: number;
  } | null>(null);
  const suppressClickUntil = useRef(0);
  const [hover, setHover] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    appointment: MovableSpaAppointment;
    request: SpaPlanningMove;
    endTime: string;
  } | null>(null);
  const move = useMutation({
    mutationFn: async () => {
      if (!pending) throw Error("No hay un movimiento pendiente.");
      const response = await apiRequest(
        "POST",
        `/api/spa/appointments/${pending.appointment.id}/move`,
        pending.request,
      );
      return response.json();
    },
    onSuccess: async () => {
      setPending(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/spa/appointments"] }),
        queryClient.invalidateQueries({
          queryKey: ["/api/spa/appointments/weekly-summary"],
        }),
      ]);
      toast({ title: "Turno reprogramado" });
    },
    onError: (error: Error) => {
      setPending(null);
      void queryClient.invalidateQueries({
        queryKey: ["/api/spa/appointments"],
      });
      toast({ title: parseApiError(error), variant: "destructive" });
    },
  });
  const canDrag = (a: MovableSpaAppointment) =>
    canEdit &&
    !move.isPending &&
    !pending &&
    ["pending", "confirmed"].includes(a.status) &&
    a.appointmentDate.slice(0, 10) === planningDate &&
    planningDate >= today() &&
    !a.displayedAsResource &&
    !a.resourceReservations?.length &&
    isSimple(a);
  const dragProps = (appointment: MovableSpaAppointment) => ({
    draggable: !!canDrag(appointment),
    "data-spa-movable": !!canDrag(appointment),
    onDragStart: (e: DragEvent<HTMLElement>) => {
      if (!canDrag(appointment)) {
        e.preventDefault();
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const slots = Math.max(
        1,
        Math.ceil(
          (minutes(appointment.endTime) - minutes(appointment.startTime)) / 30,
        ),
      );
      const offset =
        rect.width > 0
          ? Math.min(
              slots - 1,
              Math.max(
                0,
                Math.floor(((e.clientX - rect.left) / rect.width) * slots),
              ),
            )
          : 0;
      dragged.current = { appointment, offset };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", appointment.id);
    },
    onDragEnd: () => {
      dragged.current = null;
      setHover(null);
      suppressClickUntil.current = Date.now() + 250;
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (Date.now() < suppressClickUntil.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  });
  const dropProps = (cabinId: string, startTime: string, colSpan = 1) => ({
    style:
      hover === `${cabinId}:${startTime}`
        ? { boxShadow: "inset 0 0 0 2px hsl(var(--primary))" }
        : undefined,
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!dragged.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setHover(`${cabinId}:${startTime}`);
    },
    onDragLeave: () => setHover(null),
    onDrop: (e: DragEvent<HTMLElement>) => {
      const source = dragged.current;
      if (!source) return;
      e.preventDefault();
      e.stopPropagation();
      dragged.current = null;
      setHover(null);
      suppressClickUntil.current = Date.now() + 250;
      if (!canDrag(source.appointment)) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const slot =
        rect.width > 0
          ? Math.min(
              colSpan - 1,
              Math.max(
                0,
                Math.floor(((e.clientX - rect.left) / rect.width) * colSpan),
              ),
            )
          : 0;
      const newStart = time(minutes(startTime) + (slot - source.offset) * 30);
      if (
        cabinId === source.appointment.cabinId &&
        newStart === source.appointment.startTime
      )
        return;
      try {
        const endTime = spaMoveEndTime(
          newStart,
          source.appointment.startTime,
          source.appointment.endTime,
        );
        const { appointment: a } = source;
        setPending({
          appointment: a,
          endTime,
          request: {
            cabinId,
            startTime: newStart,
            expected: {
              cabinId: a.cabinId,
              treatmentId: a.treatmentId,
              appointmentDate: a.appointmentDate.slice(0, 10),
              startTime: a.startTime,
              endTime: a.endTime,
              status: a.status,
            },
          },
        });
      } catch (error: any) {
        toast({ title: error.message, variant: "destructive" });
      }
    },
  });
  const dialog = (
    <Dialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open && !move.isPending) setPending(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover turno</DialogTitle>
          <DialogDescription>
            Revisá el nuevo horario y gabinete antes de confirmar.
          </DialogDescription>
        </DialogHeader>
        {pending && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold">
              {pending.appointment.guestName}{" "}
              {pending.appointment.guestLastName || ""}
            </p>
            <p>
              De {cabinName(pending.appointment.cabinId)} ·{" "}
              {pending.appointment.startTime}–{pending.appointment.endTime}
            </p>
            <p>
              A {cabinName(pending.request.cabinId)} ·{" "}
              {pending.request.startTime}–{pending.endTime}
            </p>
            <p className="text-muted-foreground">
              Se conserva la duración, el tratamiento y los importes del turno.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={move.isPending}
            onClick={() => setPending(null)}
          >
            Cancelar
          </Button>
          <Button disabled={move.isPending} onClick={() => move.mutate()}>
            {move.isPending ? "Guardando…" : "Confirmar movimiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { dragProps, dropProps, dialog };
}
