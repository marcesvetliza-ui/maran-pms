import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Guest, InsertGuest } from "@shared/schema";
import type { HolderCorrectionPreview } from "@shared/reservationHolderCorrection";
import { GuestSelector } from "./entity-selector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Textarea } from "./ui/textarea";

export function ReservationHolderCorrection({
  reservationId,
  onClose,
  onCorrected,
}: {
  reservationId: string;
  onClose: () => void;
  onCorrected?: (guest: Guest) => void;
}) {
  const { toast } = useToast();
  const [guest, setGuest] = useState<Guest | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const url = `/api/reservations/${reservationId}/holder-correction`;
  const preview = useQuery<HolderCorrectionPreview>({
    queryKey: [url],
    staleTime: 0,
    retry: false,
    queryFn: async () => (await apiRequest("GET", url)).json(),
  });
  const resetConfirmation = () => setConfirmed(false);
  useEffect(() => {
    setConfirmed(false);
  }, [preview.data?.guest.id]);
  const create = useMutation({
    mutationFn: async (data: InsertGuest) =>
      (await apiRequest("POST", "/api/guests", data)).json(),
    onSuccess: (created: Guest) => {
      setGuest(created);
      resetConfirmation();
      void queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
    },
  });
  const save = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", url, {
          guestId: guest!.id,
          expectedGuestId: preview.data!.guest.id,
          reason: reason.trim(),
          confirmed,
        })
      ).json(),
    onSuccess: async () => {
      onCorrected?.(guest!);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/reservations"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/reservations/recent"] }),
        queryClient.invalidateQueries({ queryKey: [`/api/reservations/${reservationId}`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/planning"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/groups"] }),
        queryClient.invalidateQueries({ predicate: query => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/groups/") }),
        queryClient.invalidateQueries({ queryKey: ["/api/rooms/in-house"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/inhouse"] }),
        queryClient.invalidateQueries({
          queryKey: ["/api/dashboard/departures"],
        }),
      ]);
      toast({
        title: "Titular de la estadía corregido",
        description:
          "El cambio y su motivo quedaron registrados en el historial.",
      });
      onClose();
    },
  });
  const busy = save.isPending || create.isPending;
  const ready =
    preview.data?.canCorrect &&
    !!guest &&
    guest.id !== preview.data.guest.id &&
    reason.trim().length >= 5 &&
    confirmed &&
    !busy &&
    !preview.isFetching;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
          <DialogTitle>Cambiar titular de la estadía</DialogTitle>
          <DialogDescription>
            Corregí quién se alojó desde el ingreso, dejando el motivo en el
            historial.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 space-y-4">
          {preview.isLoading && (
            <p role="status">Consultando titular actual…</p>
          )}
          {preview.error && (
            <div role="alert" className="space-y-2">
              <p>{parseApiError(preview.error)}</p>
              <Button variant="outline" onClick={() => void preview.refetch()}>
                Volver a consultar
              </Button>
            </div>
          )}
          {preview.data && (
            <>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm text-muted-foreground">Titular actual</p>
                <p className="font-semibold">
                  {preview.data.guest.lastName} {preview.data.guest.firstName}
                </p>
              </div>
              {preview.data.blockers.map((message) => (
                <p
                  key={message}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {message}
                </p>
              ))}
              {preview.data.canCorrect && (
                <>
                  <div className="rounded-lg border p-3 text-sm space-y-2">
                    <p>
                      Se conserva la misma habitación, fechas, tarifa,
                      acompañantes y movimientos de la estadía.
                    </p>
                    <p>
                      Las facturas emitidas y los pagos mantienen sus datos
                      originales. Esta acción no transfiere deudas de Cuenta
                      Corriente ni modifica la ficha del titular anterior.
                    </p>
                  </div>
                  <fieldset disabled={busy} className="min-w-0 space-y-3">
                    <legend className="mb-2 font-medium">
                      Huésped que se alojó
                    </legend>
                    <GuestSelector
                      selectedGuest={guest}
                      onSelect={(selected) => {
                        setGuest(selected);
                        resetConfirmation();
                        save.reset();
                      }}
                      onClear={() => {
                        setGuest(null);
                        resetConfirmation();
                        save.reset();
                      }}
                      onCreateNew={(data) => create.mutate(data)}
                    />
                    {guest?.id === preview.data.guest.id && (
                      <p role="alert" className="text-sm text-destructive">
                        Elegí una persona distinta del titular actual.
                      </p>
                    )}
                    {create.error && (
                      <p role="alert" className="text-sm text-destructive">
                        {parseApiError(create.error)}
                      </p>
                    )}
                    <label className="block text-sm space-y-1">
                      <span>Motivo del cambio (obligatorio)</span>
                      <Textarea
                        aria-label="Motivo del cambio"
                        value={reason}
                        onChange={(event) => {
                          setReason(event.target.value);
                          resetConfirmation();
                        }}
                        maxLength={1000}
                        rows={3}
                        placeholder="Ej.: el pasajero previsto no viajó y otra persona se alojó desde el ingreso."
                      />
                      <span className="text-xs text-muted-foreground">
                        Mínimo 5 caracteres. Se registra junto al titular
                        anterior, el nuevo titular, el operador y la fecha.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                      <Checkbox
                        className="shrink-0 mt-0.5"
                        checked={confirmed}
                        onCheckedChange={(value) =>
                          setConfirmed(value === true)
                        }
                      />
                      <span>
                        Confirmo que corrijo la identidad de quien se alojó
                        desde el ingreso y que se conservan los movimientos y
                        comprobantes originales.
                      </span>
                    </label>
                  </fieldset>
                </>
              )}
            </>
          )}
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {parseApiError(save.error)} Actualizá la reserva si sus datos
              cambiaron.
            </p>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t px-5 py-3 gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!ready} onClick={() => save.mutate()}>
            {save.isPending ? "Guardando…" : "Confirmar cambio de titular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
