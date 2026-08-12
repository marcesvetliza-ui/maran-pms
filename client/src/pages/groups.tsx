import { useState, useEffect } from "react";
import { getArgentinaToday, toArgentinaDateStr } from "@/lib/date-utils";
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
  ChevronDown,
  ChevronRight,
  Archive,
  AlertTriangle,
  Loader2,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { queryClient, apiRequest, parseApiError } from "@/lib/queryClient";
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

  const today = getArgentinaToday();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = toArgentinaDateStr(tomorrowDate);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<InsertGroup> & { billingEntityType?: string; billingEntityId?: string }>({
    name: group?.name || "",
    contactName: group?.contactName || "",
    contactPhone: group?.contactPhone || "",
    contactEmail: group?.contactEmail || "",
    eventDate: group?.eventDate || "",
    eventSalon: (group as any)?.eventSalon || "",
    eventTime: (group as any)?.eventTime || "",
    checkInDate: group?.checkInDate || today,
    checkOutDate: group?.checkOutDate || tomorrow,
    status: group?.status || "blocked",
    releaseDate: group?.releaseDate || "",
    notes: group?.notes || "",
    color: group?.color || "#6366f1",
    billingEntityType: (group as any)?.billingEntityType || "",
    billingEntityId: (group as any)?.billingEntityId || "",
  });

  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const [blockAvailability, setBlockAvailability] = useState<Record<string, number | null>>({});

  // 6a: Conflict resolution state
  type ConflictItem = {
    reservationId: string;
    roomId: string;
    roomNumber: string;
    roomTypeId: string;
    roomTypeName: string;
    passengerName: string | null;
    alternatives: Array<{ id: string; roomNumber: string }>;
  };
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [conflictData, setConflictData] = useState<ConflictItem[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, string>>({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<(Partial<InsertGroup> & { roomReassignments?: Record<string, string> }) | null>(null);

  const fetchBlockAvailability = async (blockId: string, roomTypeId: string, checkIn: string, checkOut: string) => {
    if (!roomTypeId || !checkIn || !checkOut || checkOut <= checkIn) return;
    try {
      const res = await fetch(`/api/rooms/available?checkIn=${checkIn}&checkOut=${checkOut}&roomTypeId=${roomTypeId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBlockAvailability(prev => ({ ...prev, [blockId]: Array.isArray(data) ? data.length : null }));
      }
    } catch { /* ignorar */ }
  };

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
        eventSalon: (group as any)?.eventSalon || "",
        eventTime: (group as any)?.eventTime || "",
        checkInDate: group?.checkInDate || today,
        checkOutDate: group?.checkOutDate || tomorrow,
        status: group?.status || "blocked",
        releaseDate: group?.releaseDate || "",
        notes: group?.notes || "",
        color: group?.color || "#6366f1",
        billingEntityType: (group as any)?.billingEntityType || "",
        billingEntityId: (group as any)?.billingEntityId || "",
      });
    }
  }, [open, group, today, tomorrow]);

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });
  const { data: companies = [] } = useQuery<any[]>({ queryKey: ["/api/companies"] });
  const { data: agencies = [] } = useQuery<any[]>({ queryKey: ["/api/agencies"] });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<InsertGroup>) =>
      apiRequest("PATCH", `/api/groups/${group!.id}`, data).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      const count = data?.propagatedCount ?? 0;
      toast({
        title: "Grupo actualizado exitosamente",
        description: count > 0 ? `Se actualizaron las fechas de ${count} reserva(s) vinculada(s).` : undefined,
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Error al actualizar grupo", description: parseApiError(e), variant: "destructive" });
    },
  });

  // 6a: Intercept save for edit mode — check conflicts before submitting
  const handleSaveEdit = async () => {
    if (!formData.name || !formData.checkInDate || !formData.checkOutDate) {
      toast({ title: "Complete los campos obligatorios", variant: "destructive" });
      return;
    }
    if (formData.checkOutDate <= formData.checkInDate) {
      toast({ title: "Fecha inválida", description: "El check-out debe ser posterior al check-in.", variant: "destructive" });
      return;
    }

    const datesChanged = formData.checkInDate !== group?.checkInDate || formData.checkOutDate !== group?.checkOutDate;

    if (!datesChanged) {
      // No date change — go straight to confirmation
      setPendingFormData(formData);
      setShowConfirmDialog(true);
      return;
    }

    // Date changed — check for room conflicts
    setIsCheckingConflicts(true);
    try {
      const r = await fetch(
        `/api/groups/${group!.id}/date-conflicts?checkIn=${formData.checkInDate}&checkOut=${formData.checkOutDate}`,
        { credentials: "include" }
      );
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const conflicts: ConflictItem[] = data.conflicts ?? [];

      // Blocked: group has guests already checked in
      if (data.checkedInCount && data.checkedInCount > 0) {
        const n = data.checkedInCount;
        toast({
          title: "No se pueden cambiar las fechas",
          description: `Hay ${n} habitación${n !== 1 ? "es" : ""} actualmente en check-in en este grupo. Finalizá o revertí esos check-ins antes de modificar las fechas.`,
          variant: "destructive",
        });
        return;
      }

      if (conflicts.length === 0) {
        // No conflicts — go to confirmation
        setPendingFormData(formData);
        setShowConfirmDialog(true);
      } else {
        // Check if any conflict is truly unresolvable (0 alternatives)
        const unresolvable = conflicts.filter(c => c.alternatives.length === 0);
        if (unresolvable.length > 0) {
          const rooms = unresolvable.map(c => `Hab. ${c.roomNumber} (${c.roomTypeName})`).join(", ");
          toast({
            title: "Sin disponibilidad — no se pueden cambiar las fechas",
            description: `Las siguientes habitaciones no tienen alternativas del mismo tipo en esas fechas: ${rooms}. Cambiá la habitación manualmente antes de actualizar las fechas.`,
            variant: "destructive",
          });
          return;
        }
        // All conflicts have alternatives — show resolution dialog
        setConflictData(conflicts);
        setConflictResolutions(Object.fromEntries(conflicts.map(c => [c.reservationId, ""])));
        setPendingFormData(formData);
        setShowConflictDialog(true);
      }
    } catch (e: any) {
      toast({ title: "Error al verificar disponibilidad", description: e?.message, variant: "destructive" });
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  const handleConflictContinue = () => {
    // All conflicts must have a selection
    const missing = conflictData.filter(c => !conflictResolutions[c.reservationId]);
    if (missing.length > 0) {
      toast({ title: "Seleccioná una habitación alternativa para cada conflicto", variant: "destructive" });
      return;
    }
    setShowConflictDialog(false);
    setShowConfirmDialog(true);
  };

  const handleConfirm = () => {
    if (!pendingFormData) return;
    const dataToSubmit: any = { ...pendingFormData };
    // Attach room reassignments if any
    const hasReassignments = Object.values(conflictResolutions).some(v => !!v);
    if (hasReassignments) {
      dataToSubmit.roomReassignments = conflictResolutions;
    }
    updateMutation.mutate(dataToSubmit);
    setShowConfirmDialog(false);
    setConflictData([]);
    setConflictResolutions({});
    setPendingFormData(null);
  };

  const handleNext = () => {
    if (!formData.name || !formData.checkInDate || !formData.checkOutDate) {
      toast({ title: "Complete los campos obligatorios", variant: "destructive" });
      return;
    }
    if (!group && formData.checkInDate < today) {
      toast({ title: "Fecha inválida", description: "La fecha de check-in no puede ser anterior a hoy.", variant: "destructive" });
      return;
    }
    if (formData.checkOutDate <= formData.checkInDate) {
      toast({ title: "Fecha inválida", description: "El check-out debe ser posterior al check-in.", variant: "destructive" });
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

    // Validate block availability
    const hasAvailabilityViolations = blocks.some((b) => {
      const avail = blockAvailability[b.id];
      return avail != null && (avail === 0 || b.quantity > avail);
    });
    if (hasAvailabilityViolations) {
      setBlocks(blocks.map((b) => {
        const avail = blockAvailability[b.id];
        if (avail != null && avail === 0) return { ...b, error: "Sin disponibilidad para este tipo de habitación" };
        if (avail != null && b.quantity > avail) return { ...b, error: `Solo hay ${avail} habitación${avail === 1 ? "" : "es"} disponible${avail === 1 ? "" : "s"}` };
        return b;
      }));
      toast({
        title: "Sin disponibilidad suficiente",
        description: "Corrija los bloques marcados antes de crear el grupo.",
        variant: "destructive",
      });
      return;
    }

    // Validate custom date ranges on blocks
    const hasInvertedDates = blocks.some((b) =>
      b.useCustomDates && b.blockCheckInDate && b.blockCheckOutDate && b.blockCheckOutDate <= b.blockCheckInDate
    );
    if (hasInvertedDates) {
      setBlocks(blocks.map((b) => {
        if (b.useCustomDates && b.blockCheckInDate && b.blockCheckOutDate && b.blockCheckOutDate <= b.blockCheckInDate) {
          return { ...b, error: "El check-out del bloque debe ser posterior al check-in." };
        }
        return b;
      }));
      toast({
        title: "Fechas de bloque inválidas",
        description: "El check-out debe ser posterior al check-in en todos los bloques.",
        variant: "destructive",
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
        } catch (blockErr: any) {
          failedBlocks++;
          updatedBlocks.push({ ...block, error: parseApiError(blockErr) || "Error al crear bloque - intente de nuevo" });
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
    } catch (e: any) {
      toast({ title: "Error al crear grupo", description: parseApiError(e), variant: "destructive" });
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
    <>
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

              <div className="col-span-2">
                <Label>Color del grupo</Label>
                <div className="flex gap-2 flex-wrap mt-2">
                  {[
                    "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
                    "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#84cc16",
                  ].map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                        formData.color === color ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormData({ ...formData, color })}
                      data-testid={`button-color-${color.replace("#", "")}`}
                      title={color}
                    />
                  ))}
                </div>
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

              {/* Entidad de facturación del grupo */}
              <div className="col-span-2">
                <Label>Empresa / Agencia de facturación <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <p className="text-xs text-muted-foreground mb-2">Se pre-seleccionará automáticamente al registrar pagos del grupo.</p>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-background dark:text-foreground"
                    value={formData.billingEntityType || ""}
                    onChange={(e) => setFormData({ ...formData, billingEntityType: e.target.value, billingEntityId: "" })}
                    data-testid="select-group-billing-entity-type"
                  >
                    <option value="">Sin entidad</option>
                    <option value="company">Empresa</option>
                    <option value="agency">Agencia</option>
                  </select>
                  {formData.billingEntityType && (
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-background dark:text-foreground"
                      value={formData.billingEntityId || ""}
                      onChange={(e) => setFormData({ ...formData, billingEntityId: e.target.value })}
                      data-testid="select-group-billing-entity-id"
                    >
                      <option value="">{formData.billingEntityType === "company" ? "Seleccionar empresa..." : "Seleccionar agencia..."}</option>
                      {(formData.billingEntityType === "company" ? companies : agencies).map((e: any) => (
                        <option key={e.id} value={e.id}>{e.razonSocial || e.nombreFantasia || e.name || e.id}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="checkInDate">Fecha Check-in *</Label>
                <Input
                  id="checkInDate"
                  type="date"
                  value={formData.checkInDate}
                  min={!group ? today : undefined}
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
                  min={!group ? (formData.checkInDate || today) : undefined}
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
                <Label htmlFor="eventSalon">Salón del Evento</Label>
                <Input
                  id="eventSalon"
                  type="text"
                  placeholder="Ej: Salón Solárium"
                  value={(formData as any).eventSalon || ""}
                  onChange={(e) => setFormData({ ...formData, eventSalon: e.target.value } as any)}
                  data-testid="input-group-event-salon"
                />
              </div>

              <div>
                <Label htmlFor="eventTime">Horario del Evento</Label>
                <Input
                  id="eventTime"
                  type="text"
                  placeholder="Ej: 20:00 hs"
                  value={(formData as any).eventTime || ""}
                  onChange={(e) => setFormData({ ...formData, eventTime: e.target.value } as any)}
                  data-testid="input-group-event-time"
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
                <Button onClick={handleSaveEdit} disabled={isPending || isCheckingConflicts} data-testid="button-save-group">
                  {isCheckingConflicts ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando disponibilidad...</>
                  ) : isPending ? "Guardando..." : "Guardar Cambios"}
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
                          onValueChange={(v) => {
                            updateBlock(block.id, { roomTypeId: v });
                            const ci = block.useCustomDates ? block.blockCheckInDate : formData.checkInDate;
                            const co = block.useCustomDates ? block.blockCheckOutDate : formData.checkOutDate;
                            fetchBlockAvailability(block.id, v, ci || '', co || '');
                          }}
                        >
                          <SelectTrigger data-testid={`select-block-type-${index}`}>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                          <SelectContent>
                            {roomTypes?.filter(rt => rt.id).map((rt) => (
                              <SelectItem key={rt.id} value={rt.id}>
                                {rt.name}{(rt as any).code ? ` (${(rt as any).code})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs">
                          Cantidad *
                          {blockAvailability[block.id] != null && (
                            <span className={`ml-1 font-normal ${blockAvailability[block.id] === 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                              ({blockAvailability[block.id]} disponibles)
                            </span>
                          )}
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={blockAvailability[block.id] ?? undefined}
                          value={block.quantity}
                          onChange={(e) => updateBlock(block.id, { quantity: parseInt(e.target.value) || 1 })}
                          data-testid={`input-block-qty-${index}`}
                          className={blockAvailability[block.id] != null && block.quantity > (blockAvailability[block.id] ?? Infinity) ? 'border-destructive' : ''}
                        />
                        {blockAvailability[block.id] != null && block.quantity > (blockAvailability[block.id] ?? Infinity) && (
                          <p className="text-xs text-destructive mt-1">Supera la disponibilidad actual</p>
                        )}
                      </div>

                      <div>
                        <Label className="text-xs">Tarifa Acordada <span className="text-xs font-normal text-muted-foreground">(con IVA)</span></Label>
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
              <Button
                onClick={handleCreate}
                disabled={isPending || blocks.some((b) => {
                  const avail = blockAvailability[b.id];
                  return avail != null && (avail === 0 || b.quantity > avail);
                })}
                data-testid="button-create-group"
              >
                {isPending ? "Creando..." : createdGroupId ? "Reintentar Bloques" : "Crear Grupo"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* 6a: Conflict resolution dialog — shown when some rooms are occupied on new dates */}
    <Dialog open={showConflictDialog} onOpenChange={(o) => { if (!o) setShowConflictDialog(false); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Conflictos de disponibilidad
          </DialogTitle>
          <DialogDescription>
            Las siguientes habitaciones ya tienen otra reserva en las nuevas fechas. Elegí una alternativa del mismo tipo para cada una.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[50vh] overflow-y-auto">
          {conflictData.map((c) => {
            // Exclude rooms already selected for OTHER conflicts (prevent double-booking within the batch)
            const selectedElsewhere = new Set(
              Object.entries(conflictResolutions)
                .filter(([resId, roomId]) => resId !== c.reservationId && !!roomId)
                .map(([, roomId]) => roomId)
            );
            const availableAlternatives = c.alternatives.filter(alt => !selectedElsewhere.has(alt.id));
            return (
              <div key={c.reservationId} className="border rounded-md p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">Hab. {c.roomNumber} — {c.roomTypeName}</p>
                    {c.passengerName && <p className="text-xs text-muted-foreground">{c.passengerName}</p>}
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium shrink-0">Conflicto</span>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Habitación alternativa *</Label>
                  <Select
                    value={conflictResolutions[c.reservationId] || ""}
                    onValueChange={(v) => setConflictResolutions(prev => ({ ...prev, [c.reservationId]: v }))}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Seleccionar habitación..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAlternatives.map(alt => (
                        <SelectItem key={alt.id} value={alt.id}>
                          Hab. {alt.roomNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableAlternatives.length === 0 && (
                    <p className="text-xs text-destructive mt-1">Sin alternativas disponibles (ya seleccionadas para otras habitaciones)</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowConflictDialog(false)}>Cancelar</Button>
          <Button
            onClick={handleConflictContinue}
            disabled={conflictData.some(c => !conflictResolutions[c.reservationId])}
          >
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 6a: Final confirmation dialog */}
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás segura de lo que vas a hacer?</AlertDialogTitle>
          <AlertDialogDescription>
            {conflictData.length > 0
              ? `Se cambiarán las fechas del grupo y se reasignarán ${conflictData.length} habitación(es) a alternativas del mismo tipo. Esta acción actualizará todas las reservas pendientes y confirmadas vinculadas.`
              : "Se cambiarán las fechas del grupo y se propagarán a todas las reservas pendientes y confirmadas vinculadas."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setShowConfirmDialog(false); }}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Guardando..." : "Confirmar cambio"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ─── Reusable table component ────────────────────────────────────────────────

function GroupTable({
  groups,
  formatDate,
  updateStatusMutation,
  handleViewDetail,
  handleEdit,
  setDeleteConfirmGroup,
  dimmed = false,
}: {
  groups: GroupWithDetails[];
  formatDate: (d: string) => string;
  updateStatusMutation: any;
  handleViewDetail: (g: GroupWithDetails) => void;
  handleEdit: (g: GroupWithDetails) => void;
  setDeleteConfirmGroup: (g: GroupWithDetails) => void;
  dimmed?: boolean;
}) {
  const today = getArgentinaToday();
  return (
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
        {groups.map((group) => (
          <TableRow
            key={group.id}
            data-testid={`row-group-${group.id}`}
            className={dimmed ? "opacity-60" : undefined}
          >
            <TableCell>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: group.color || "#6366f1" }}
                />
                <span className="font-mono text-sm">{group.groupCode}</span>
              </div>
            </TableCell>
            <TableCell className="font-medium">{group.name}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {formatDate(group.checkInDate)} — {formatDate(group.checkOutDate)}
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
              {/* Alerta release date vencida — solo en tentativo */}
              {group.status === "tentative" && group.releaseDate && group.releaseDate <= today && (
                <div className="flex items-center gap-1 mb-1">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    ⚠ Release vencido {group.releaseDate}
                  </span>
                </div>
              )}
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
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleViewDetail(group)}
                  data-testid={`button-view-${group.id}`}
                >
                  <Eye className="mr-1 h-4 w-4" />
                  Ver
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(group)}
                  data-testid={`button-edit-${group.id}`}
                >
                  <Pencil className="mr-1 h-4 w-4" />
                  Editar
                </Button>
                {group.status === "tentativo" && group.reservations.length === 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirmGroup(group)}
                    data-testid={`button-delete-${group.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupWithDetails | undefined>();
  const [deleteConfirmGroup, setDeleteConfirmGroup] = useState<GroupWithDetails | null>(null);
  const [showPastGroups, setShowPastGroups] = useState(false);

  const { data: groups, isLoading } = useQuery<GroupWithDetails[]>({
    queryKey: ["/api/groups"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/groups/${id}`);
      return res.json().catch(() => ({}));
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === "/api/planning"
      });
      const cancelled = data?.cancelledReservations ?? 0;
      toast({
        title: "Grupo eliminado",
        description: cancelled > 0
          ? `${cancelled} reserva(s) vinculada(s) cancelada(s) y habitaciones liberadas.`
          : "El grupo fue eliminado correctamente.",
      });
      setDeleteConfirmGroup(null);
    },
    onError: (e: any) => {
      toast({ title: "Error al eliminar grupo", description: parseApiError(e), variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/groups/${id}`, { status }),
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      // Invalidate planning so cancelled group blocks disappear immediately
      if (status === "cancelled" || status === "finished") {
        queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === "/api/planning" });
      }
      toast({ title: "Estado actualizado" });
    },
    onError: (e: any) => {
      toast({ title: "Error al actualizar estado", description: parseApiError(e), variant: "destructive" });
    },
  });

  const today = getArgentinaToday();

  const matchesFilter = (group: GroupWithDetails) => {
    const matchesSearch =
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.groupCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (group.contactName?.toLowerCase() ?? "").includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || group.status === statusFilter;
    return matchesSearch && matchesStatus;
  };

  const activeGroups = (groups ?? [])
    .filter(g => g.checkOutDate >= today && g.status !== "cancelled" && g.status !== "finished" && matchesFilter(g))
    .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate));

  const pastGroups = (groups ?? [])
    .filter(g => (g.checkOutDate < today || g.status === "cancelled" || g.status === "finished") && matchesFilter(g))
    .sort((a, b) => b.checkOutDate.localeCompare(a.checkOutDate));

  const handleEdit = (group: GroupWithDetails) => {
    setEditingGroup(group);
    setShowFormDialog(true);
  };

  const handleViewDetail = (group: GroupWithDetails) => {
    navigate(`/groups/${group.id}`);
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("es-AR", {
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

      {/* ── Active groups ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5" />
            Grupos Activos
            {!isLoading && (
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({activeGroups.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : activeGroups.length > 0 ? (
            <GroupTable
              groups={activeGroups}
              formatDate={formatDate}
              updateStatusMutation={updateStatusMutation}
              handleViewDetail={handleViewDetail}
              handleEdit={handleEdit}
              setDeleteConfirmGroup={setDeleteConfirmGroup}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users2 className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No hay grupos activos</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {searchQuery || statusFilter !== "all"
                  ? "No se encontraron grupos con los filtros aplicados"
                  : "Creá un nuevo grupo para comenzar"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Past groups (collapsible) ───────────────────────────────────── */}
      {(isLoading || pastGroups.length > 0) && (
        <div className="rounded-lg border bg-muted/20">
          <button
            className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
            onClick={() => setShowPastGroups(v => !v)}
            data-testid="button-toggle-past-groups"
          >
            <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm text-muted-foreground flex-1">
              Grupos Anteriores
              {!isLoading && (
                <span className="ml-2 text-xs font-normal">({pastGroups.length})</span>
              )}
            </span>
            {showPastGroups
              ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          </button>

          {showPastGroups && (
            <div className="px-4 pb-4">
              {isLoading ? (
                <div className="space-y-2 pt-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : pastGroups.length > 0 ? (
                <GroupTable
                  groups={pastGroups}
                  formatDate={formatDate}
                  updateStatusMutation={updateStatusMutation}
                  handleViewDetail={handleViewDetail}
                  handleEdit={handleEdit}
                  setDeleteConfirmGroup={setDeleteConfirmGroup}
                  dimmed
                />
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No hay grupos anteriores con los filtros aplicados
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <GroupFormDialog
        group={editingGroup}
        open={showFormDialog}
        onOpenChange={(open) => {
          setShowFormDialog(open);
          if (!open) setEditingGroup(undefined);
        }}
        onSuccess={() => {
          setEditingGroup(undefined);
          queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
        }}
      />

      <Dialog open={!!deleteConfirmGroup} onOpenChange={() => setDeleteConfirmGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>¿Eliminás el grupo <strong className="text-foreground">"{deleteConfirmGroup?.name}"</strong>?</p>
                <p className="text-xs">Solo se pueden eliminar grupos <strong>Tentativos</strong> sin reservas ni movimientos. Esta acción no se puede deshacer.</p>
              </div>
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
