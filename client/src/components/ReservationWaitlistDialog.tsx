import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, Pencil, Phone, Plus, Trash2, Users, UserRound } from "lucide-react";
import { formatDateAR } from "@/lib/utils";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InsertReservationWaitlist, ReservationWaitlist } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";

type WaitlistForm = {
  firstName: string;
  lastName: string;
  checkInDate: string;
  checkOutDate: string;
  phone: string;
  numberOfGuests: string;
  notes: string;
};

const emptyForm: WaitlistForm = {
  firstName: "",
  lastName: "",
  checkInDate: "",
  checkOutDate: "",
  phone: "",
  numberOfGuests: "1",
  notes: "",
};

function toForm(entry?: ReservationWaitlist | null): WaitlistForm {
  if (!entry) return emptyForm;
  return {
    firstName: entry.firstName,
    lastName: entry.lastName,
    checkInDate: entry.checkInDate,
    checkOutDate: entry.checkOutDate,
    phone: entry.phone || "",
    numberOfGuests: String(entry.numberOfGuests || 1),
    notes: entry.notes || "",
  };
}

function getWaitlistError(error: unknown): string {
  const message = parseApiError(error);
  return message === "Error desconocido" ? "No se pudo completar la operación." : message;
}

export function ReservationWaitlistDialog({
  open,
  onOpenChange,
  onConvert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConvert: (entry: ReservationWaitlist) => void;
}) {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ReservationWaitlist | null>(null);
  const [form, setForm] = useState<WaitlistForm>(emptyForm);

  const { data: entries = [], isLoading, refetch } = useQuery<ReservationWaitlist[]>({
    queryKey: ["/api/reservation-waitlist"],
    enabled: open,
  });

  useEffect(() => {
    if (open) void refetch();
  }, [open, refetch]);

  const saveMutation = useMutation({
    mutationFn: async (data: InsertReservationWaitlist) => {
      const method = editingEntry ? "PATCH" : "POST";
      const path = editingEntry
        ? `/api/reservation-waitlist/${editingEntry.id}`
        : "/api/reservation-waitlist";
      const response = await apiRequest(method, path, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservation-waitlist"] });
      setFormOpen(false);
      setEditingEntry(null);
      setForm(emptyForm);
      toast({
        title: editingEntry ? "Consulta actualizada" : "Consulta agregada",
        description: "La lista de espera se actualizó correctamente.",
      });
    },
    onError: (error) => {
      toast({ title: "No se pudo guardar la consulta", description: getWaitlistError(error), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/reservation-waitlist/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reservation-waitlist"] });
      toast({ title: "Consulta eliminada", description: "La consulta se quitó de la lista de espera." });
    },
    onError: (error) => {
      toast({ title: "No se pudo eliminar la consulta", description: getWaitlistError(error), variant: "destructive" });
    },
  });

  const openNewForm = () => {
    setEditingEntry(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEditForm = (entry: ReservationWaitlist) => {
    setEditingEntry(entry);
    setForm(toForm(entry));
    setFormOpen(true);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const numberOfGuests = Number(form.numberOfGuests);
    if (!firstName || !lastName) {
      toast({ title: "Datos incompletos", description: "Ingresá nombre y apellido.", variant: "destructive" });
      return;
    }
    if (!form.checkInDate || !form.checkOutDate || form.checkOutDate <= form.checkInDate) {
      toast({ title: "Fechas inválidas", description: "La fecha de salida debe ser posterior a la de ingreso.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(numberOfGuests) || numberOfGuests < 1 || numberOfGuests > 99) {
      toast({ title: "Cantidad inválida", description: "La cantidad de personas debe estar entre 1 y 99.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({
      firstName,
      lastName,
      checkInDate: form.checkInDate,
      checkOutDate: form.checkOutDate,
      phone: form.phone.trim() || null,
      numberOfGuests,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Lista de Espera
            </DialogTitle>
            <DialogDescription>
              Consultas de alojamiento que todavía no son huéspedes ni reservas.
              Se eliminan cuando pasa la fecha de salida.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button onClick={openNewForm} data-testid="button-new-waitlist-entry">
              <Plus className="mr-2 h-4 w-4" />
              Agregar a lista
            </Button>
          </div>

          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Cargando lista de espera...</div>
          ) : entries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Clock className="mb-3 h-12 w-12 text-muted-foreground/40" />
                <p className="font-medium">No hay consultas en espera</p>
                <p className="mt-1 text-sm text-muted-foreground">Podés agregar una consulta sin crear un huésped.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <Card key={entry.id} data-testid={`row-waitlist-${entry.id}`}>
                  <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{entry.lastName}, {entry.firstName}</span>
                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {entry.numberOfGuests} {entry.numberOfGuests === 1 ? "persona" : "personas"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDateAR(entry.checkInDate)} al {formatDateAR(entry.checkOutDate)}
                        </span>
                        {entry.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {entry.phone}
                          </span>
                        )}
                      </div>
                      {entry.notes && <p className="max-w-2xl text-sm text-muted-foreground">{entry.notes}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button
                        size="sm"
                        onClick={() => onConvert(entry)}
                        data-testid={`button-convert-waitlist-${entry.id}`}
                      >
                        <CalendarDays className="mr-1.5 h-4 w-4" />
                        Pasar a reserva
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEditForm(entry)} data-testid={`button-edit-waitlist-${entry.id}`}>
                        <Pencil className="mr-1.5 h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (window.confirm("¿Querés eliminar esta consulta de la lista de espera?")) {
                            deleteMutation.mutate(entry.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-waitlist-${entry.id}`}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Eliminar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Editar consulta" : "Agregar a lista de espera"}</DialogTitle>
            <DialogDescription>
              Estos datos quedan sólo en la lista de espera y no crean un huésped.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="waitlist-first-name">Nombre *</Label>
                  <Input
                    id="waitlist-first-name"
                    value={form.firstName}
                    onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    autoFocus
                    data-testid="input-waitlist-first-name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="waitlist-last-name">Apellido *</Label>
                  <Input
                    id="waitlist-last-name"
                    value={form.lastName}
                    onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    data-testid="input-waitlist-last-name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="waitlist-check-in">Fecha de ingreso *</Label>
                  <Input
                    id="waitlist-check-in"
                    type="date"
                    value={form.checkInDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, checkInDate: e.target.value }))}
                    data-testid="input-waitlist-check-in"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="waitlist-check-out">Fecha de salida *</Label>
                  <Input
                    id="waitlist-check-out"
                    type="date"
                    value={form.checkOutDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, checkOutDate: e.target.value }))}
                    data-testid="input-waitlist-check-out"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="waitlist-phone">Teléfono (opcional)</Label>
                  <Input
                    id="waitlist-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    data-testid="input-waitlist-phone"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="waitlist-guests">Cantidad de personas</Label>
                  <Input
                    id="waitlist-guests"
                    type="number"
                    min={1}
                    max={99}
                    value={form.numberOfGuests}
                    onChange={(e) => setForm((prev) => ({ ...prev, numberOfGuests: e.target.value }))}
                    data-testid="input-waitlist-guests"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="waitlist-notes">Observaciones (opcional)</Label>
                <Textarea
                  id="waitlist-notes"
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Preferencias, pedido especial o información de contacto..."
                  data-testid="input-waitlist-notes"
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-waitlist-entry">
                {saveMutation.isPending ? "Guardando..." : editingEntry ? "Guardar cambios" : "Agregar consulta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}