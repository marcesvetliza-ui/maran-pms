import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Mail,
  Phone,
  MapPin,
  FileText,
  Car,
  Heart,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Guest, InsertGuest, ReservationWithDetails, ReservationStatus, GuestPreference } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

function GuestFormDialog({
  guest,
  open,
  onOpenChange,
  onSuccess,
}: {
  guest?: Guest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!guest;

  const [formData, setFormData] = useState<Partial<InsertGuest>>({
    firstName: guest?.firstName || "",
    lastName: guest?.lastName || "",
    email: guest?.email || "",
    phone: guest?.phone || "",
    documentType: guest?.documentType || "dni",
    documentNumber: guest?.documentNumber || "",
    nationality: guest?.nationality || "",
    localidad: guest?.localidad || "",
    vehiculoPatente: guest?.vehiculoPatente || "",
    vehiculoMarca: guest?.vehiculoMarca || "",
    vehiculoModelo: guest?.vehiculoModelo || "",
    vehiculoColor: guest?.vehiculoColor || "",
  });

  const mutation = useMutation({
    mutationFn: async (data: Partial<InsertGuest>) => {
      if (isEditing) {
        return apiRequest("PATCH", `/api/guests/${guest.id}`, data);
      }
      return apiRequest("POST", "/api/guests", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: isEditing ? "Huésped actualizado" : "Huésped registrado",
        description: `${formData.firstName} ${formData.lastName} ha sido ${isEditing ? "actualizado" : "registrado"} exitosamente.`,
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo guardar el huésped. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Huésped" : "Nuevo Huésped"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifica los datos del huésped." : "Ingresa los datos para registrar un nuevo huésped."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">Nombre</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="Juan"
                  required
                  data-testid="input-first-name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Apellido</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Pérez"
                  required
                  data-testid="input-last-name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="juan@email.com"
                  data-testid="input-email"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={formData.phone || ""}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+54 11 1234-5678"
                  data-testid="input-phone"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="documentType">Tipo de Documento</Label>
                <Select
                  value={formData.documentType || "dni"}
                  onValueChange={(value) => setFormData({ ...formData, documentType: value })}
                >
                  <SelectTrigger data-testid="select-document-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dni">DNI</SelectItem>
                    <SelectItem value="passport">Pasaporte</SelectItem>
                    <SelectItem value="cedula">Cédula</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="documentNumber">Número de Documento</Label>
                <Input
                  id="documentNumber"
                  value={formData.documentNumber || ""}
                  onChange={(e) => setFormData({ ...formData, documentNumber: e.target.value })}
                  placeholder="12345678"
                  data-testid="input-document-number"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nationality">Nacionalidad</Label>
              <Input
                id="nationality"
                value={formData.nationality || ""}
                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                placeholder="Argentina"
                data-testid="input-nationality"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="localidad">Ciudad / Localidad</Label>
              <Input
                id="localidad"
                value={formData.localidad || ""}
                onChange={(e) => setFormData({ ...formData, localidad: e.target.value })}
                placeholder="Buenos Aires"
                data-testid="input-localidad"
              />
            </div>

            <div className="pt-2 border-t">
              <Label className="text-sm font-medium text-muted-foreground">Datos del Vehículo (opcional)</Label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="vehiculoPatente">Patente</Label>
                <Input
                  id="vehiculoPatente"
                  name="vehiculoPatente"
                  value={formData.vehiculoPatente || ""}
                  onChange={(e) => setFormData({ ...formData, vehiculoPatente: e.target.value.toUpperCase() })}
                  placeholder="ABC 123"
                  data-testid="input-vehiculo-patente"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vehiculoMarca">Marca</Label>
                <Input
                  id="vehiculoMarca"
                  name="vehiculoMarca"
                  value={formData.vehiculoMarca || ""}
                  onChange={(e) => setFormData({ ...formData, vehiculoMarca: e.target.value })}
                  placeholder="Toyota"
                  data-testid="input-vehiculo-marca"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="vehiculoModelo">Modelo</Label>
                <Input
                  id="vehiculoModelo"
                  name="vehiculoModelo"
                  value={formData.vehiculoModelo || ""}
                  onChange={(e) => setFormData({ ...formData, vehiculoModelo: e.target.value })}
                  placeholder="Corolla"
                  data-testid="input-vehiculo-modelo"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vehiculoColor">Color</Label>
                <Input
                  id="vehiculoColor"
                  name="vehiculoColor"
                  value={formData.vehiculoColor || ""}
                  onChange={(e) => setFormData({ ...formData, vehiculoColor: e.target.value })}
                  placeholder="Blanco"
                  data-testid="input-vehiculo-color"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-guest">
              {mutation.isPending ? "Guardando..." : isEditing ? "Guardar Cambios" : "Registrar Huésped"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const statusConfig: Record<ReservationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pendiente", variant: "secondary" },
    tentative: { label: "Tentativa", variant: "secondary" },
    confirmed: { label: "Confirmada", variant: "default" },
    checked_in: { label: "Hospedado", variant: "outline" },
    checked_out: { label: "Finalizada", variant: "secondary" },
    cancelled: { label: "Cancelada", variant: "destructive" },
  };
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function GuestDetailDialog({
  guest,
  open,
  onOpenChange,
}: {
  guest: Guest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: allReservations } = useQuery<ReservationWithDetails[]>({
    queryKey: ["/api/reservations"],
  });

  const { data: preferences = [] } = useQuery<GuestPreference[]>({
    queryKey: ["/api/guests", guest.id, "preferences"],
    enabled: open,
  });

  const activePreferences = preferences.filter((p) => p.isActive);

  const guestReservations = allReservations?.filter(r => r.guestId === guest.id) || [];
  const totalStays = guestReservations.filter(r => r.status === "checked_out").length;
  const totalNights = guestReservations.reduce((sum, r) => sum + (r.nights || 0), 0);
  const totalSpent = guestReservations.reduce((sum, r) => sum + parseFloat(r.totalRoomAmount || "0"), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle del Huésped</DialogTitle>
          <DialogDescription>Información completa y historial de reservaciones.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl">
              {guest.firstName?.[0]}{guest.lastName?.[0]}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-xl">
                {guest.firstName} {guest.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{guest.nationality || "Sin nacionalidad"}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 border rounded-lg">
              <p className="text-2xl font-bold text-primary">{totalStays}</p>
              <p className="text-sm text-muted-foreground">Estancias</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="text-2xl font-bold text-primary">{totalNights}</p>
              <p className="text-sm text-muted-foreground">Noches</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="text-2xl font-bold text-primary">${totalSpent.toFixed(0)}</p>
              <p className="text-sm text-muted-foreground">Gastado</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {guest.email && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div className="overflow-hidden">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium text-sm truncate">{guest.email}</p>
                  </div>
                </div>
              )}
              {guest.phone && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Teléfono</p>
                    <p className="font-medium text-sm">{guest.phone}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {guest.documentNumber && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {guest.documentType?.toUpperCase() || "Documento"}
                    </p>
                    <p className="font-medium text-sm">{guest.documentNumber}</p>
                  </div>
                </div>
              )}
              {guest.localidad && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div className="overflow-hidden">
                    <p className="text-xs text-muted-foreground">Ciudad</p>
                    <p className="font-medium text-sm truncate">{guest.localidad}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {guest.vehiculoPatente && (
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Car className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Vehículo</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Patente</p>
                  <p className="font-medium">{guest.vehiculoPatente}</p>
                </div>
                {guest.vehiculoMarca && (
                  <div>
                    <p className="text-xs text-muted-foreground">Marca</p>
                    <p className="font-medium">{guest.vehiculoMarca}</p>
                  </div>
                )}
                {guest.vehiculoModelo && (
                  <div>
                    <p className="text-xs text-muted-foreground">Modelo</p>
                    <p className="font-medium">{guest.vehiculoModelo}</p>
                  </div>
                )}
                {guest.vehiculoColor && (
                  <div>
                    <p className="text-xs text-muted-foreground">Color</p>
                    <p className="font-medium">{guest.vehiculoColor}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activePreferences.length > 0 && (
            <div className="border rounded-lg" data-testid="guest-preferences-section">
              <div className="p-3 border-b bg-muted/50 flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" />
                <h4 className="font-semibold">Preferencias de Hospitalidad</h4>
                <Badge variant="outline" className="text-xs">{activePreferences.length}</Badge>
              </div>
              <div className="divide-y max-h-[200px] overflow-y-auto">
                {activePreferences.map((pref) => (
                  <div key={pref.id} className="flex items-center justify-between p-3 text-sm" data-testid={`guest-pref-${pref.id}`}>
                    <div>
                      <p className="font-medium">{pref.title}</p>
                      {pref.description && <p className="text-xs text-muted-foreground">{pref.description}</p>}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        pref.priority === "critical" ? "border-red-400 text-red-700 dark:text-red-300" :
                        pref.priority === "high" ? "border-orange-400 text-orange-700 dark:text-orange-300" :
                        ""
                      }`}
                    >
                      {pref.priority === "critical" ? "Crítica" : pref.priority === "high" ? "Alta" : pref.priority === "low" ? "Baja" : "Normal"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border rounded-lg">
            <div className="p-3 border-b bg-muted/50">
              <h4 className="font-semibold">Historial de Reservaciones</h4>
            </div>
            <div className="divide-y max-h-[200px] overflow-y-auto">
              {guestReservations.length > 0 ? (
                guestReservations.map((reservation) => (
                  <div key={reservation.id} className="flex items-center justify-between p-3 text-sm" data-testid={`guest-reservation-${reservation.id}`}>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Hab. {reservation.room?.roomNumber}</p>
                        <p className="text-muted-foreground text-xs">
                          {reservation.checkInDate} - {reservation.checkOutDate}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">${reservation.totalRoomAmount || 0}</span>
                      <ReservationStatusBadge status={reservation.status} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No hay reservaciones registradas
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GuestsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | undefined>();

  const { data: guests, isLoading } = useQuery<Guest[]>({
    queryKey: ["/api/guests"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/guests/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Huésped eliminado", description: "El huésped ha sido eliminado del sistema." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "No se pudo eliminar el huésped", variant: "destructive" });
    },
  });

  const filteredGuests = guests?.filter((guest) => {
    const fullName = `${guest.firstName} ${guest.lastName}`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchQuery.toLowerCase()) ||
      guest.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.documentNumber?.includes(searchQuery);
    return matchesSearch;
  });

  const handleEditGuest = (guest: Guest) => {
    setSelectedGuest(guest);
    setDialogOpen(true);
  };

  const handleViewGuest = (guest: Guest) => {
    setSelectedGuest(guest);
    setDetailDialogOpen(true);
  };

  const handleNewGuest = () => {
    setSelectedGuest(undefined);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-guests-title">
            Huéspedes
          </h1>
          <p className="text-muted-foreground">Gestiona el registro de huéspedes del hotel</p>
        </div>
        <Button onClick={handleNewGuest} data-testid="button-new-guest">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Huésped
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email o documento..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-guests"
            />
          </div>
        </CardContent>
      </Card>

      {/* Guests Table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredGuests && filteredGuests.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Nacionalidad</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGuests.map((guest) => (
                <TableRow key={guest.id} data-testid={`guest-row-${guest.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                        {guest.firstName?.[0]}{guest.lastName?.[0]}
                      </div>
                      <span className="font-medium">
                        {guest.firstName} {guest.lastName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{guest.email || "-"}</TableCell>
                  <TableCell>{guest.phone || "-"}</TableCell>
                  <TableCell>
                    {guest.documentType && guest.documentNumber
                      ? `${guest.documentType.toUpperCase()}: ${guest.documentNumber}`
                      : "-"}
                  </TableCell>
                  <TableCell>{guest.nationality || "-"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewGuest(guest)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver Detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditGuest(guest)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(guest.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay huéspedes</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? "No se encontraron huéspedes con los criterios de búsqueda."
                : "Comienza registrando el primer huésped del hotel."}
            </p>
            {!searchQuery && (
              <Button onClick={handleNewGuest}>
                <Plus className="mr-2 h-4 w-4" />
                Registrar Primer Huésped
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Guest Form Dialog */}
      <GuestFormDialog
        guest={selectedGuest}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setSelectedGuest(undefined)}
      />

      {/* Guest Detail Dialog */}
      {selectedGuest && (
        <GuestDetailDialog
          guest={selectedGuest}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
        />
      )}
    </div>
  );
}
