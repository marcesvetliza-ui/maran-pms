import { formatDisplayDate } from "@shared/date-display";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { HousekeepingPreparation } from "@shared/schema";
export function PreparationBadge({
  preparation,
  compact = false,
}: {
  preparation?: HousekeepingPreparation | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!preparation) return null;
  const text =
    preparation.state === "prepared" ? "NO MOVER" : "REVISAR PREPARACIÓN";
  const message = `${text} · Preparación especial de Housekeeping\n${preparation.note || "Sin nota adicional"}`;
  return (
    <>
      <button
        type="button"
        className="rounded bg-amber-100 text-amber-900 px-1 text-[10px] font-bold shrink-0"
        title={message}
        aria-label={message}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        ⚠ {!compact && text}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{text}</DialogTitle>
            <DialogDescription>
              Preparación especial de Housekeeping · {preparation.markedBy}
            </DialogDescription>
          </DialogHeader>
          <p>{preparation.note || "Sin nota adicional"}</p>
          {preparation.state === "review" && (
            <p>Se cambió la habitación. Revisar la preparación en destino.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function HousekeepingPreparationControl({
  roomId,
  roomNumber,
  controlledOpen,
  onOpenChange,
  hideTrigger=false,
  summaryOnly = false,
}: {
  roomId: string;
  roomNumber: string;
  controlledOpen?:boolean;
  onOpenChange?:(open:boolean)=>void;
  hideTrigger?:boolean;
  summaryOnly?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false),
    [reservationId, setReservationId] = useState(""),
    [note, setNote] = useState("");
  const open=controlledOpen??internalOpen, setOpen=onOpenChange??setInternalOpen;
  const { toast } = useToast();
  const {
    data: rows = [],
    isLoading,
    isError,
  } = useQuery<any[]>({
    queryKey: ["/api/housekeeping/preparations"],
    refetchInterval: 30000,
  });
  const candidates = rows.filter((r) => r.room_id === roomId),
    marked = candidates.filter((r) => r.housekeeping_preparation);
  useEffect(()=>{if(open){setReservationId(candidates.length===1?candidates[0].id:'');setNote(candidates.length===1?candidates[0].housekeeping_preparation?.note||'':'');}},[open]);
  const save = useMutation({
    mutationFn: async (action: "mark" | "clear") => {
      await apiRequest("PUT", `/api/housekeeping/room/${roomId}/preparation`, {
        reservationId,
        action,
        note,
      });
    },
    onSuccess: () => {
      for (const key of [
        "/api/rooms",
        "/api/housekeeping/preparations",
        "/api/planning",
        "/api/reservations",
        "/api/dashboard/stats",
      ])
        queryClient.invalidateQueries({ queryKey: [key] });
      setOpen(false);
      toast({ title: "Preparación actualizada" });
    },
    onError: (e: Error) =>
      toast({
        title: "No se pudo actualizar",
        description: e.message,
        variant: "destructive",
      }),
  });
  if (summaryOnly)
    return (
      <>
        {marked.map((r) => (
          <div
            key={r.id}
            className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 mb-2"
          >
            <strong>
              {r.housekeeping_preparation.state === "prepared"
                ? "NO MOVER"
                : "REVISAR PREPARACIÓN"}
            </strong>{" "}
            · {r.guest_name}
            <p>{r.housekeeping_preparation.note}</p>
          </div>
        ))}
      </>
    );
  return (
    <>
      {!hideTrigger&&<Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-xs text-amber-700 justify-start"
        onClick={() => {
          setReservationId(candidates.length === 1 ? candidates[0].id : "");
          setNote(
            candidates.length === 1
              ? candidates[0].housekeeping_preparation?.note || ""
              : "",
          );
          setOpen(true);
        }}
      >
        ⚠ Limpia — No mover
      </Button>}
      {marked.map((r) => (
        <div
          key={r.id}
          className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
        >
          <strong>
            {r.housekeeping_preparation.state === "prepared"
              ? "NO MOVER"
              : "REVISAR PREPARACIÓN"}
          </strong>{" "}
          · {r.guest_name}
          <p>{r.housekeeping_preparation.note}</p>
          {r.housekeeping_preparation.state === "review" && (
            <p>
              La reserva cambió de habitación. Revisar los pedidos especiales.
            </p>
          )}
        </div>
      ))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preparación especial · Hab. {roomNumber}</DialogTitle>
            <DialogDescription>
              Elegí para qué reserva está preparada. Recepción verá el aviso y
              podrá moverla confirmando.
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <p>Cargando reservas…</p>
          ) : isError ? (
            <p>No se pudieron cargar las reservas.</p>
          ) : candidates.length === 0 ? (
            <p>No hay reservas activas asignadas a esta habitación.</p>
          ) : (
            <>
              <Label>Reserva</Label>
              <Select
                value={reservationId}
                onValueChange={(v) => {
                  setReservationId(v);
                  setNote(
                    candidates.find((r) => r.id === v)?.housekeeping_preparation
                      ?.note || "",
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Elegir reserva" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.guest_name} · {formatDisplayDate(r.check_in_date)} · {r.reservation_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor={`preparation-note-${roomId}`}>
                Pedido especial (opcional)
              </Label>
              <Textarea
                id={`preparation-note-${roomId}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="Ej.: cuna y almohadas especiales"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!reservationId || save.isPending}
                  onClick={() => save.mutate("mark")}
                >
                  Marcar limpia — No mover
                </Button>
                {candidates.find((r) => r.id === reservationId)
                  ?.housekeeping_preparation && (
                  <Button
                    variant="outline"
                    disabled={save.isPending}
                    onClick={() => save.mutate("clear")}
                  >
                    Quitar aviso de no mover
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
