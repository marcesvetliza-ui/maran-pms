import { useState } from "react";
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
      (g) => g.active && !g.codigo?.toUpperCase().startsWith("GROUP-"),
    ) || [];
  async function assign(body: object) {
    const response = await apiRequest("PATCH", endpoint, body);
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Asignar huésped</DialogTitle>
          <DialogDescription>
            Hab. {reservation.room?.roomNumber} · {reservation.reservationCode}.
            Elegí una ficha existente o registrá un huésped nuevo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button variant="secondary">Buscar existente</Button>
          <Button
            variant="outline"
            disabled={mutation.isPending}
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
            <p role="alert">No se pudo buscar huéspedes. Intentá nuevamente.</p>
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
                onClick={() => setSelected(g)}
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
          Esta acción cambia el ocupante de la reserva. Para corregir sus datos
          personales, editá su ficha en Huéspedes.
        </p>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {parseApiError(mutation.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            disabled={!selected || mutation.isPending}
            onClick={() => selected && mutation.mutate(selected.id)}
          >
            {mutation.isPending ? "Asignando..." : "Asignar huésped"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
