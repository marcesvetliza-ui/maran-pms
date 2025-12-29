import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Users2,
  Plus,
  Search,
  Calendar,
  Phone,
  Mail,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  DoorOpen,
  Hotel,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { GroupWithDetails, GroupStatus, InsertGroup } from "@shared/schema";

function GroupStatusBadge({ status }: { status: GroupStatus }) {
  const statusConfig: Record<GroupStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    tentative: { label: "Tentativo", variant: "outline" },
    blocked: { label: "Bloqueado", variant: "secondary" },
    confirmed: { label: "Confirmado", variant: "default" },
    inhouse: { label: "En Casa", variant: "default" },
    finished: { label: "Finalizado", variant: "outline" },
    cancelled: { label: "Cancelado", variant: "destructive" },
  };

  const config = statusConfig[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function GroupFormDialog({
  group,
  open,
  onOpenChange,
  onSuccess,
}: {
  group?: GroupWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!group;

  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const [formData, setFormData] = useState<Partial<InsertGroup>>({
    name: group?.name || "",
    contactName: group?.contactName || "",
    contactPhone: group?.contactPhone || "",
    contactEmail: group?.contactEmail || "",
    eventDate: group?.eventDate || "",
    checkInDate: group?.checkInDate || today,
    checkOutDate: group?.checkOutDate || tomorrow,
    status: group?.status || "tentative",
    releaseDate: group?.releaseDate || "",
    notes: group?.notes || "",
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertGroup>) =>
      apiRequest("POST", "/api/groups", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({ title: "Grupo creado exitosamente" });
      onSuccess();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error al crear grupo", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<InsertGroup>) =>
      apiRequest("PATCH", `/api/groups/${group!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({ title: "Grupo actualizado exitosamente" });
      onSuccess();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error al actualizar grupo", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Grupo" : "Nuevo Grupo"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifique los datos del grupo" : "Complete los datos del nuevo grupo"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Nombre del Grupo *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Congreso Médico 2025"
                required
                data-testid="input-group-name"
              />
            </div>

            <div>
              <Label htmlFor="contactName">Nombre de Contacto</Label>
              <Input
                id="contactName"
                value={formData.contactName || ""}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                placeholder="Nombre del responsable"
                data-testid="input-group-contact-name"
              />
            </div>

            <div>
              <Label htmlFor="contactPhone">Teléfono</Label>
              <Input
                id="contactPhone"
                value={formData.contactPhone || ""}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                placeholder="+54 11 1234-5678"
                data-testid="input-group-contact-phone"
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="contactEmail">Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={formData.contactEmail || ""}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                placeholder="contacto@empresa.com"
                data-testid="input-group-contact-email"
              />
            </div>

            <div>
              <Label htmlFor="checkInDate">Fecha Check-in *</Label>
              <Input
                id="checkInDate"
                type="date"
                value={formData.checkInDate}
                onChange={(e) => setFormData({ ...formData, checkInDate: e.target.value })}
                required
                data-testid="input-group-checkin"
              />
            </div>

            <div>
              <Label htmlFor="checkOutDate">Fecha Check-out *</Label>
              <Input
                id="checkOutDate"
                type="date"
                value={formData.checkOutDate}
                onChange={(e) => setFormData({ ...formData, checkOutDate: e.target.value })}
                required
                data-testid="input-group-checkout"
              />
            </div>

            <div>
              <Label htmlFor="eventDate">Fecha del Evento</Label>
              <Input
                id="eventDate"
                type="date"
                value={formData.eventDate || ""}
                onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                data-testid="input-group-event-date"
              />
            </div>

            <div>
              <Label htmlFor="releaseDate">Fecha de Release</Label>
              <Input
                id="releaseDate"
                type="date"
                value={formData.releaseDate || ""}
                onChange={(e) => setFormData({ ...formData, releaseDate: e.target.value })}
                data-testid="input-group-release-date"
              />
            </div>

            <div>
              <Label htmlFor="status">Estado</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value as GroupStatus })}
              >
                <SelectTrigger data-testid="select-group-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tentative">Tentativo</SelectItem>
                  <SelectItem value="blocked">Bloqueado</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="inhouse">En Casa</SelectItem>
                  <SelectItem value="finished">Finalizado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notas adicionales..."
                className="resize-none"
                rows={3}
                data-testid="textarea-group-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-save-group">
              {isPending ? "Guardando..." : isEditing ? "Guardar Cambios" : "Crear Grupo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function GroupsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupWithDetails | undefined>();
  const [deleteConfirmGroup, setDeleteConfirmGroup] = useState<GroupWithDetails | null>(null);

  const { data: groups, isLoading } = useQuery<GroupWithDetails[]>({
    queryKey: ["/api/groups"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({ title: "Grupo eliminado" });
      setDeleteConfirmGroup(null);
    },
    onError: () => {
      toast({ title: "Error al eliminar grupo", variant: "destructive" });
    },
  });

  const filteredGroups = groups?.filter((group) => {
    const matchesSearch =
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.groupCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.contactName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || group.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleEdit = (group: GroupWithDetails) => {
    setEditingGroup(group);
    setShowFormDialog(true);
  };

  const handleViewDetail = (group: GroupWithDetails) => {
    navigate(`/groups/${group.id}`);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-groups-title">
          Grupos
        </h1>
        <p className="text-muted-foreground">
          Gestión de reservas grupales y eventos
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, código o contacto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-groups"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-filter-status">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="tentative">Tentativo</SelectItem>
              <SelectItem value="blocked">Bloqueado</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="inhouse">En Casa</SelectItem>
              <SelectItem value="finished">Finalizado</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setEditingGroup(undefined); setShowFormDialog(true); }} data-testid="button-new-group">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Grupo
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5" />
            Listado de Grupos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredGroups && filteredGroups.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Fechas</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Habitaciones</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group) => (
                  <TableRow key={group.id} data-testid={`row-group-${group.id}`}>
                    <TableCell className="font-mono text-sm">{group.groupCode}</TableCell>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatDate(group.checkInDate)} - {formatDate(group.checkOutDate)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {group.contactName && (
                        <div className="flex flex-col gap-0.5 text-sm">
                          <span>{group.contactName}</span>
                          {group.contactPhone && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {group.contactPhone}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <DoorOpen className="h-4 w-4 text-muted-foreground" />
                        <span>{group.assignedRooms} / {group.totalRooms}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <GroupStatusBadge status={group.status} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${group.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewDetail(group)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Ver Detalle
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(group)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteConfirmGroup(group)}
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
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users2 className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No hay grupos</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {searchQuery || statusFilter !== "all"
                  ? "No se encontraron grupos con los filtros aplicados"
                  : "Comience creando un nuevo grupo para gestionar reservas grupales"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <GroupFormDialog
        group={editingGroup}
        open={showFormDialog}
        onOpenChange={setShowFormDialog}
        onSuccess={() => setEditingGroup(undefined)}
      />

      <Dialog open={!!deleteConfirmGroup} onOpenChange={() => setDeleteConfirmGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea eliminar el grupo "{deleteConfirmGroup?.name}"?
              Esta acción eliminará todos los bloques asociados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmGroup(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmGroup && deleteMutation.mutate(deleteConfirmGroup.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
