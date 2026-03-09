import { useState, useEffect } from "react";
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
import type { GroupWithDetails, GroupStatus, InsertGroup, RoomType } from "@shared/schema";
import { Trash2 as TrashIcon } from "lucide-react";

interface BlockDraft {
  id: string;
  roomTypeId: string;
  quantity: number;
  agreedRate: string;
  useCustomDates: boolean;
  blockCheckInDate: string;
  blockCheckOutDate: string;
  error?: string;
}

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

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<InsertGroup>>({
    name: group?.name || "",
    contactName: group?.contactName || "",
    contactPhone: group?.contactPhone || "",
    contactEmail: group?.contactEmail || "",
    eventDate: group?.eventDate || "",
    checkInDate: group?.checkInDate || today,
    checkOutDate: group?.checkOutDate || tomorrow,
    status: group?.status || "blocked",
    releaseDate: group?.releaseDate || "",
    notes: group?.notes || "",
  });

  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);

  // Reset state when dialog opens/closes or mode changes
  useEffect(() => {
    if (open) {
      setStep(1);
      setBlocks([]);
      setCreatedGroupId(null);
      setFormData({
        name: group?.name || "",
        contactName: group?.contactName || "",
        contactPhone: group?.contactPhone || "",
        contactEmail: group?.contactEmail || "",
        eventDate: group?.eventDate || "",
        checkInDate: group?.checkInDate || today,
        checkOutDate: group?.checkOutDate || tomorrow,
        status: group?.status || "blocked",
        releaseDate: group?.releaseDate || "",
        notes: group?.notes || "",
      });
    }
  }, [open, group, today, tomorrow]);

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
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

  const handleNext = () => {
    if (!formData.name || !formData.checkInDate || !formData.checkOutDate) {
      toast({ title: "Complete los campos obligatorios", variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const addBlock = () => {
    setBlocks([
      ...blocks,
      {
        id: crypto.randomUUID(),
        roomTypeId: "",
        quantity: 1,
        agreedRate: "",
        useCustomDates: false,
        blockCheckInDate: formData.checkInDate || today,
        blockCheckOutDate: formData.checkOutDate || tomorrow,
      },
    ]);
  };

  const updateBlock = (id: string, updates: Partial<BlockDraft>) => {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter((b) => b.id !== id));
  };

  const handleCreate = async () => {
    // Clear previous errors
    setBlocks(blocks.map((b) => ({ ...b, error: undefined })));
    
    // Validate blocks before submission
    const hasInvalidBlocks = blocks.some((b) => {
      const qty = Number(b.quantity);
      return !b.roomTypeId || !Number.isFinite(qty) || qty < 1;
    });
    
    if (hasInvalidBlocks) {
      setBlocks(blocks.map((b) => {
        const qty = Number(b.quantity);
        if (!b.roomTypeId) {
          return { ...b, error: "Seleccione tipo de habitación" };
        }
        if (!Number.isFinite(qty) || qty < 1) {
          return { ...b, error: "Cantidad debe ser mayor a 0" };
        }
        return b;
      }));
      toast({ 
        title: "Bloques inválidos", 
        description: "Corrija los errores marcados en rojo",
        variant: "destructive" 
      });
      return;
    }
    
    setIsCreating(true);
    
    try {
      // Create group if not already created
      let groupId = createdGroupId;
      if (!groupId) {
        const response = await apiRequest("POST", "/api/groups", formData);
        const newGroup = await response.json();
        groupId = newGroup.id;
        setCreatedGroupId(groupId);
      }

      // Create blocks - track failures
      let failedBlocks = 0;
      let successBlocks = 0;
      const updatedBlocks: BlockDraft[] = [];
      
      for (const block of blocks) {
        if (!block.roomTypeId) continue;
        
        try {
          await apiRequest("POST", `/api/groups/${groupId}/blocks`, {
            roomTypeId: block.roomTypeId,
            quantity: Number(block.quantity),
            ratePlanId: null,
            agreedRate: block.agreedRate || null,
            blockCheckInDate: block.useCustomDates ? block.blockCheckInDate : null,
            blockCheckOutDate: block.useCustomDates ? block.blockCheckOutDate : null,
          });
          successBlocks++;
          // Don't add successful blocks to updatedBlocks - they're done
        } catch {
          failedBlocks++;
          updatedBlocks.push({ ...block, error: "Error al crear bloque - intente de nuevo" });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      
      if (failedBlocks > 0) {
        // Keep wizard open with only failed blocks
        setBlocks(updatedBlocks);
        toast({ 
          title: `${successBlocks} bloque(s) creado(s), ${failedBlocks} fallaron`, 
          description: "Corrija los errores o elimine los bloques fallidos",
          variant: "destructive" 
        });
        // Keep wizard open for user to retry
      } else {
        // All blocks succeeded - close wizard
        toast({ title: blocks.length > 0 ? `Grupo creado con ${blocks.length} bloque(s)` : "Grupo creado exitosamente" });
        onSuccess();
        onOpenChange(false);
        setStep(1);
        setBlocks([]);
        setCreatedGroupId(null);
      }
    } catch {
      toast({ title: "Error al crear grupo", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing) {
      updateMutation.mutate(formData);
    } else {
      handleCreate();
    }
  };

  const isPending = isCreating || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Grupo" : "Nuevo Grupo"}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Modifique los datos del grupo" 
              : step === 1 
                ? "Paso 1: Información del grupo" 
                : "Paso 2: Bloques de habitaciones"}
          </DialogDescription>
        </DialogHeader>

        {!isEditing && (
          <div className="flex gap-2 mb-4">
            <div className={`flex-1 h-2 rounded ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
            <div className={`flex-1 h-2 rounded ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
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

              {isEditing ? (
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
              ) : null}

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
              {isEditing ? (
                <Button onClick={() => updateMutation.mutate(formData)} disabled={isPending} data-testid="button-save-group">
                  {isPending ? "Guardando..." : "Guardar Cambios"}
                </Button>
              ) : (
                <Button type="button" onClick={handleNext} data-testid="button-next-step">
                  Siguiente
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {step === 2 && !isEditing && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Agregue los bloques de habitaciones para el grupo. Puede configurar fechas y tarifas diferentes para cada bloque.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addBlock} data-testid="button-add-block-wizard">
                <Plus className="mr-2 h-4 w-4" />
                Agregar Bloque
              </Button>
            </div>

            {blocks.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center">
                <Hotel className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No hay bloques agregados. Puede agregar bloques ahora o después desde el detalle del grupo.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {blocks.map((block, index) => (
                  <div key={block.id} className={`rounded-md border p-4 space-y-3 ${block.error ? "border-destructive" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Bloque {index + 1}</span>
                        {block.error && <span className="text-xs text-destructive">{block.error}</span>}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBlock(block.id)}
                        data-testid={`button-remove-block-${index}`}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Tipo de Habitación *</Label>
                        <Select
                          value={block.roomTypeId}
                          onValueChange={(v) => updateBlock(block.id, { roomTypeId: v })}
                        >
                          <SelectTrigger data-testid={`select-block-type-${index}`}>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                          <SelectContent>
                            {roomTypes?.map((rt) => (
                              <SelectItem key={rt.id} value={rt.id}>
                                {rt.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs">Cantidad *</Label>
                        <Input
                          type="number"
                          min={1}
                          value={block.quantity}
                          onChange={(e) => updateBlock(block.id, { quantity: parseInt(e.target.value) || 1 })}
                          data-testid={`input-block-qty-${index}`}
                        />
                      </div>

                      <div>
                        <Label className="text-xs">Tarifa Acordada</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={block.agreedRate}
                          onChange={(e) => updateBlock(block.id, { agreedRate: e.target.value })}
                          placeholder="0.00"
                          data-testid={`input-block-rate-${index}`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`customDates-${block.id}`}
                        checked={block.useCustomDates}
                        onChange={(e) => updateBlock(block.id, { useCustomDates: e.target.checked })}
                        className="h-4 w-4"
                        data-testid={`checkbox-custom-dates-${index}`}
                      />
                      <Label htmlFor={`customDates-${block.id}`} className="text-xs font-normal">
                        Fechas diferentes al grupo
                      </Label>
                    </div>

                    {block.useCustomDates && (
                      <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3">
                        <div>
                          <Label className="text-xs">Check-in Bloque</Label>
                          <Input
                            type="date"
                            value={block.blockCheckInDate}
                            onChange={(e) => updateBlock(block.id, { blockCheckInDate: e.target.value })}
                            data-testid={`input-block-checkin-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Check-out Bloque</Label>
                          <Input
                            type="date"
                            value={block.blockCheckOutDate}
                            onChange={(e) => updateBlock(block.id, { blockCheckOutDate: e.target.value })}
                            data-testid={`input-block-checkout-${index}`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <DialogFooter className="gap-2">
              {!createdGroupId && (
                <Button type="button" variant="outline" onClick={handleBack}>
                  Anterior
                </Button>
              )}
              {createdGroupId && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    onSuccess();
                    onOpenChange(false);
                    setStep(1);
                    setBlocks([]);
                    setCreatedGroupId(null);
                  }}
                >
                  Terminar sin bloques
                </Button>
              )}
              <Button onClick={handleCreate} disabled={isPending} data-testid="button-create-group">
                {isPending ? "Creando..." : createdGroupId ? "Reintentar Bloques" : "Crear Grupo"}
              </Button>
            </DialogFooter>
          </div>
        )}
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

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/groups/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({ title: "Estado actualizado" });
    },
    onError: () => {
      toast({ title: "Error al actualizar estado", variant: "destructive" });
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
                      <Select
                        value={group.status}
                        onValueChange={(value) =>
                          updateStatusMutation.mutate({ id: group.id, status: value })
                        }
                      >
                        <SelectTrigger
                          className="h-7 w-36 text-xs border-0 bg-transparent p-0 focus:ring-0"
                          data-testid={`select-status-${group.id}`}
                        >
                          <SelectValue>
                            <GroupStatusBadge status={group.status} />
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tentative"><GroupStatusBadge status="tentative" /></SelectItem>
                          <SelectItem value="blocked"><GroupStatusBadge status="blocked" /></SelectItem>
                          <SelectItem value="confirmed"><GroupStatusBadge status="confirmed" /></SelectItem>
                          <SelectItem value="inhouse"><GroupStatusBadge status="inhouse" /></SelectItem>
                          <SelectItem value="finished"><GroupStatusBadge status="finished" /></SelectItem>
                          <SelectItem value="cancelled"><GroupStatusBadge status="cancelled" /></SelectItem>
                        </SelectContent>
                      </Select>
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
