import { useState } from "react";
import { groupOccupantReplacementSchema } from "@shared/groupOccupant";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import type {
  Guest,
  ReservationWithDetails,
  InsertGuest,
} from "@shared/schema";
import { GuestFormDialog } from "@/pages/guests";
import { apiRequest, queryClient, parseApiError } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useGroupAssignmentPreview } from "./group-assignment-release-dialog";
import { fmtMoney } from "@/lib/utils";

export function GroupOccupantDialog({
  groupId,
  reservation,
  onClose,
  onAssigned,
}: {
  groupId: string;
  reservation: ReservationWithDetails;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Guest | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmPersonalAdvances, setConfirmPersonalAdvances] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmedFingerprint, setConfirmedFingerprint] = useState<
    string | null
  >(null);
  const preview = useGroupAssignmentPreview(groupId, reservation.id);
  const replacing =
    !!reservation.guestId &&
    !reservation.guest?.codigo?.toUpperCase().startsWith("GROUP-");
  const actionLabel = replacing ? "Reemplazar huésped" : "Asignar huésped";
  const confirmPreserveStay =
    !!confirmedFingerprint &&
    confirmedFingerprint === preview.data?.fingerprint;
  const replacementReady =
    !replacing ||
    groupOccupantReplacementSchema.safeParse({ reason, confirmPreserveStay })
      .success;
  const ready =
    replacementReady &&
    preview.data?.canReplace &&
    !preview.isFetching &&
    (!preview.data.personalAdvance || confirmPersonalAdvances);
  const term = search.trim();
  const endpoint = `/api/groups/${groupId}/reservations/${reservation.id}/occupant`;
  const results = useQuery<Guest[]>({
    queryKey: ["/api/guests/search", term],
    enabled: term.length >= 2,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/guests/search?q=${encodeURIComponent(term)}`,
        { signal, credentials: "include" },
      );
      if (!response.ok) throw new Error("No se pudo buscar huéspedes.");
      return response.json();
    },
  });
  const availableGuests =
    results.data?.filter(
      (g) =>
        g.id !== reservation.guestId &&
        g.active &&
        !g.codigo?.toUpperCase().startsWith("GROUP-"),
    ) || [];
  async function assign(body: object) {
    if (!ready || !preview.data)
      throw new Error(
        "Verificá la reserva y sus anticipos antes de cambiar al huésped.",
      );
    const response = await apiRequest("PATCH", endpoint, {
      ...body,
      expectedGuestId: reservation.guestId,
      fingerprint: preview.data.fingerprint,
      confirmPersonalAdvances,
      ...(replacing ? { reason: reason.trim(), confirmPreserveStay } : {}),
    });
    const result = await response.json();
    queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
    return result;
  }
  const mutation = useMutation({
    mutationFn: (guestId: string) => assign({ guestId }),
    onSuccess: onAssigned,
  });
  if (creating)
    return (
      <GuestFormDialog
        open
        onOpenChange={(open) => {
          if (!open) setCreating(false);
        }}
        saveGuest={async (newGuest: Partial<InsertGuest>) =>
          (await assign({ newGuest })).guest
        }
        onSuccess={onAssigned}
      />
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>
            Hab. {reservation.room?.roomNumber} · {reservation.reservationCode}.
            Elegí una ficha existente o registrá un huésped nuevo.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto space-y-4 pr-1">
          {preview.isFetching && (
            <p role="status">Verificando reserva y anticipos…</p>
          )}
          {preview.isError && (
            <div role="alert">
              <p>{parseApiError(preview.error)}</p>
              <Button variant="outline" onClick={() => preview.refetch()}>
                Reintentar verificación
              </Button>
            </div>
          )}
          {!!preview.data?.replacementBlockers.length && (
            <div role="alert" className="text-sm space-y-1">
              {preview.data.replacementBlockers.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          {preview.data?.canReplace && preview.data.personalAdvance > 0 && (
            <label className="flex gap-2 text-sm">
              <Checkbox
                checked={confirmPersonalAdvances}
                onCheckedChange={(v) => setConfirmPersonalAdvances(v === true)}
              />
              <span>
                Confirmo que el anticipo personal de $
                {fmtMoney(preview.data.personalAdvance)} se conserva en esta
                reserva para el nuevo pasajero.
              </span>
            </label>
          )}
          {replacing && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm">
                Se conservan la habitación, fechas, tarifa y todos los pagos de
                esta reserva. El reemplazo no libera ni mueve anticipos.
              </p>
              <label className="block text-sm space-y-1">
                <span>Motivo del reemplazo</span>
                <Textarea
                  value={reason}
                  minLength={10}
                  maxLength={1000}
                  disabled={mutation.isPending}
                  placeholder="Explicá por qué se reemplaza al huésped (mínimo 10 caracteres)"
                  onChange={(e) => {
                    setReason(e.target.value);
                    setConfirmedFingerprint(null);
                  }}
                />
              </label>
              <label className="flex gap-2 text-sm">
                <Checkbox
                  checked={confirmPreserveStay}
                  disabled={
                    mutation.isPending ||
                    !preview.data?.canReplace ||
                    preview.isFetching
                  }
                  onCheckedChange={(value) =>
                    setConfirmedFingerprint(
                      value === true ? preview.data?.fingerprint || null : null,
                    )
                  }
                />
                <span>
                  Confirmo que la estadía y sus pagos se conservan para el nuevo
                  huésped.
                </span>
              </label>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary">Buscar existente</Button>
            <Button
              variant="outline"
              disabled={mutation.isPending || !ready}
              onClick={() => setCreating(true)}
            >
              Nuevo huésped
            </Button>
          </div>
          <Input
            disabled={mutation.isPending}
            aria-label="Buscar huésped"
            placeholder="Buscar por nombre, apellido o DNI..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(null);
              setConfirmedFingerprint(null);
            }}
          />
          <div className="max-h-64 overflow-y-auto space-y-2">
            {term.length < 2 && (
              <p className="text-sm text-muted-foreground">
                Escribí al menos dos caracteres para buscar.
              </p>
            )}
            {results.isFetching && <p>Buscando...</p>}
            {results.isError && (
              <p role="alert">
                No se pudo buscar huéspedes. Intentá nuevamente.
              </p>
            )}
            {term.length >= 2 &&
              results.isSuccess &&
              !results.isFetching &&
              !availableGuests.length && (
                <p>No se encontraron huéspedes. Podés registrar uno nuevo.</p>
              )}
            {term.length >= 2 &&
              availableGuests.map((g) => (
                <Button
                  disabled={mutation.isPending}
                  key={g.id}
                  variant={selected?.id === g.id ? "secondary" : "outline"}
                  className="w-full h-auto py-3 justify-start text-left"
                  onClick={() => {
                    setSelected(g);
                    setConfirmedFingerprint(null);
                  }}
                  aria-pressed={selected?.id === g.id}
                >
                  <span>
                    <span className="block font-medium">
                      {g.lastName}, {g.firstName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {g.documentType?.toUpperCase() || "Documento"}:{" "}
                      {g.documentNumber || "Sin documento"}
                      {g.email ? ` · ${g.email}` : ""}
                    </span>
                  </span>
                </Button>
              ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Esta acción cambia el ocupante de la reserva. Para corregir sus
            datos personales, editá su ficha en Huéspedes.
          </p>
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {parseApiError(mutation.error)}
            </p>
          )}
        </div>
        <DialogFooter className="shrink-0">
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            disabled={!selected || mutation.isPending || !ready}
            onClick={() => selected && mutation.mutate(selected.id)}
          >
            {mutation.isPending ? "Guardando..." : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
