import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Users2,
  Plus,
  Calendar,
  Phone,
  Mail,
  DoorOpen,
  Trash2,
  User,
  Hotel,
  LogIn,
  LogOut,
  FileText,
  Printer,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  CreditCard,
  DollarSign,
  ExternalLink,
  X,
  Loader2,
  FileDown,
  Receipt,
  Wallet,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Settings2,
  Building2,
  Banknote,
  ArrowLeftRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { 
  GroupWithDetails, 
  GroupStatus, 
  GroupRoomBlockWithDetails, 
  RoomType, 
  RatePlan,
  RoomWithType,
  ReservationWithDetails,
  GroupFolioData,
  GroupCharge,
  MasterFolioConfig,
} from "@shared/schema";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  credit_card: "Tarjeta Crédito",
  debit_card: "Tarjeta Débito",
  check: "Cheque",
  other: "Otro",
};

const fmtDate = (d: string) => {
  if (!d) return "-";
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString("es-AR");
};

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

function AddBlockDialog({
  groupId,
  group,
  open,
  onOpenChange,
  onSuccess,
}: {
  groupId: string;
  group: GroupWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [roomTypeId, setRoomTypeId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [ratePlanId, setRatePlanId] = useState("");
  const [agreedRate, setAgreedRate] = useState("");
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [blockCheckInDate, setBlockCheckInDate] = useState(group.checkInDate);
  const [blockCheckOutDate, setBlockCheckOutDate] = useState(group.checkOutDate);

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });

  const { data: ratePlans } = useQuery<RatePlan[]>({
    queryKey: ["/api/rate-plans/by-room-type", roomTypeId],
    queryFn: async () => {
      if (!roomTypeId) return [];
      const res = await fetch(`/api/rate-plans/by-room-type/${roomTypeId}`);
      return res.json();
    },
    enabled: !!roomTypeId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/groups/${groupId}/blocks`, {
        roomTypeId,
        quantity: Number(quantity),
        ratePlanId: ratePlanId || null,
        agreedRate: agreedRate ? parseFloat(agreedRate).toFixed(2) : null,
        blockCheckInDate: useCustomDates ? blockCheckInDate : null,
        blockCheckOutDate: useCustomDates ? blockCheckOutDate : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      toast({ title: "Bloque agregado exitosamente" });
      onSuccess();
      onOpenChange(false);
      setRoomTypeId("");
      setQuantity(1);
      setRatePlanId("");
      setAgreedRate("");
      setUseCustomDates(false);
      setBlockCheckInDate(group.checkInDate);
      setBlockCheckOutDate(group.checkOutDate);
    },
    onError: () => {
      toast({ title: "Error al agregar bloque", variant: "destructive" });
    },
  });

  const handleRatePlanChange = (planId: string) => {
    setRatePlanId(planId);
    const plan = ratePlans?.find(p => p.id === planId);
    if (plan) {
      setAgreedRate(plan.baseRate);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar Bloque de Habitaciones</DialogTitle>
          <DialogDescription>
            Defina el tipo, cantidad y tarifa para este bloque
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo de Habitación *</Label>
              <Select value={roomTypeId} onValueChange={setRoomTypeId}>
                <SelectTrigger data-testid="select-block-room-type">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes?.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name} ({rt.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Cantidad *</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                data-testid="input-block-quantity"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Plan Tarifario</Label>
              <Select value={ratePlanId} onValueChange={handleRatePlanChange} disabled={!roomTypeId}>
                <SelectTrigger data-testid="select-block-rate-plan">
                  <SelectValue placeholder="Seleccionar plan" />
                </SelectTrigger>
                <SelectContent>
                  {ratePlans?.map((rp) => (
                    <SelectItem key={rp.id} value={rp.id}>
                      {rp.name} - ${rp.baseRate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tarifa Acordada <span className="text-xs font-normal text-muted-foreground">(con IVA incluido)</span></Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={agreedRate}
                onChange={(e) => setAgreedRate(e.target.value)}
                placeholder="0.00"
                data-testid="input-block-agreed-rate"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="useCustomDates"
              checked={useCustomDates}
              onChange={(e) => setUseCustomDates(e.target.checked)}
              className="h-4 w-4"
              data-testid="checkbox-custom-dates"
            />
            <Label htmlFor="useCustomDates" className="font-normal">
              Usar fechas diferentes al grupo
            </Label>
          </div>

          {useCustomDates && (
            <div className="grid grid-cols-2 gap-4 rounded-md border p-3 bg-muted/30">
              <div>
                <Label>Check-in Bloque</Label>
                <Input
                  type="date"
                  value={blockCheckInDate}
                  onChange={(e) => setBlockCheckInDate(e.target.value)}
                  data-testid="input-block-checkin"
                />
              </div>
              <div>
                <Label>Check-out Bloque</Label>
                <Input
                  type="date"
                  value={blockCheckOutDate}
                  onChange={(e) => setBlockCheckOutDate(e.target.value)}
                  data-testid="input-block-checkout"
                />
              </div>
            </div>
          )}

          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <p>Fechas del grupo: {fmtDate(group.checkInDate)} - {fmtDate(group.checkOutDate)}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!roomTypeId || createMutation.isPending}
            data-testid="button-save-block"
          >
            {createMutation.isPending ? "Guardando..." : "Agregar Bloque"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignBlockDialog({
  group,
  block,
  open,
  onOpenChange,
  onSuccess,
}: {
  group: GroupWithDetails;
  block: GroupRoomBlockWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();

  // Count per-block assignments: distribute total same-type reservations across blocks of same type sequentially
  const sameTypeBlocks = [...group.blocks].filter(b => b.roomTypeId === block.roomTypeId).sort((a, b) => a.id.localeCompare(b.id));
  const totalAssignedOfType = group.reservations.filter(r => r.room?.roomTypeId === block.roomTypeId).length;
  const blockIndex = sameTypeBlocks.findIndex(b => b.id === block.id);
  let filledInPreviousBlocks = 0;
  for (let i = 0; i < blockIndex; i++) {
    filledInPreviousBlocks += sameTypeBlocks[i].quantity;
  }
  const assignedToThisBlock = Math.max(0, Math.min(block.quantity, totalAssignedOfType - filledInPreviousBlocks));
  const pending = Math.max(0, block.quantity - assignedToThisBlock);

  const defaultCheckIn = block.blockCheckInDate || group.checkInDate;
  const defaultCheckOut = block.blockCheckOutDate || group.checkOutDate;

  const [rows, setRows] = useState<Array<{
    roomId: string;
    firstName: string;
    lastName: string;
  }>>(
    Array.from({ length: pending }, () => ({ roomId: "", firstName: group.name, lastName: group.name }))
  );

  const { data: availableRooms = [] } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms/available", defaultCheckIn, defaultCheckOut, block.roomTypeId],
    queryFn: async () => {
      const params = new URLSearchParams({
        checkIn: defaultCheckIn,
        checkOut: defaultCheckOut,
        roomTypeId: block.roomTypeId,
      });
      const res = await fetch(`/api/rooms/available?${params}`);
      if (!res.ok) throw new Error("Error al cargar habitaciones");
      return res.json();
    },
    enabled: !!defaultCheckIn && !!defaultCheckOut,
  });

  const chosenRoomIds = rows.map(r => r.roomId).filter(Boolean);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAssignAll = async () => {
    const validRows = rows.filter(r => r.roomId);
    if (validRows.length === 0) {
      toast({ title: "Seleccioná al menos una habitación", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;
    let failCount = 0;

    const errors: string[] = [];
    for (const row of validRows) {
      try {
        await apiRequest("POST", `/api/groups/${group.id}/assign-room`, {
          roomId: row.roomId,
          guestFirstName: row.firstName || "Sin Asignar",
          guestLastName: row.lastName || "",
          ratePlanId: block.ratePlanId,
          checkInDate: defaultCheckIn,
          checkOutDate: defaultCheckOut,
          agreedRate: block.agreedRate,
        });
        successCount++;
      } catch (err: any) {
        failCount++;
        try {
          const body = JSON.parse(err.message.replace(/^\d+:\s*/, ""));
          if (body.error) errors.push(body.error);
        } catch {}
      }
    }

    setIsSubmitting(false);
    queryClient.invalidateQueries({ queryKey: ["/api/groups", group.id] });
    queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
    queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning" });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });

    if (failCount === 0) {
      toast({ title: `${successCount} habitación(es) asignada(s) exitosamente` });
      onSuccess();
      onOpenChange(false);
    } else {
      const uniqueErrors = [...new Set(errors)];
      toast({
        title: `${successCount > 0 ? `${successCount} asignadas, ` : ""}${failCount} no pudo(n) asignarse`,
        description: uniqueErrors.length > 0 ? uniqueErrors[0] : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Asignar Habitaciones — {block.roomType?.name}
          </DialogTitle>
          <DialogDescription>
            Bloque de {block.quantity} habitaciones. {assignedToThisBlock} ya asignadas, {pending} pendientes.
            {defaultCheckIn && (() => {
              const fmt = (d: string) => { const [y,m,dd] = d.split("-").map(Number); return new Date(y, m-1, dd).toLocaleDateString("es-AR"); };
              return ` Check-in: ${fmt(defaultCheckIn)} | Check-out: ${fmt(defaultCheckOut)}`;
            })()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p>Todas las habitaciones del bloque ya están asignadas.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>Habitación</span>
                <span>Nombre</span>
                <span>Apellido</span>
                <span></span>
              </div>
              {rows.map((row, index) => (
                <div key={index} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-center">
                  <Select
                    value={row.roomId}
                    onValueChange={(value) => {
                      const updated = [...rows];
                      updated[index].roomId = value;
                      setRows(updated);
                    }}
                  >
                    <SelectTrigger data-testid={`select-room-${index}`}>
                      <SelectValue placeholder="Seleccionar hab." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRooms
                        .filter(r => !chosenRoomIds.includes(r.id) || r.id === row.roomId)
                        .map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            Hab. {room.roomNumber} — Piso {room.floor}
                          </SelectItem>
                        ))
                      }
                      {availableRooms.filter(r => !chosenRoomIds.includes(r.id) || r.id === row.roomId).length === 0 && (
                        <SelectItem value="_none" disabled>Sin disponibilidad</SelectItem>
                      )}
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="Nombre"
                    value={row.firstName}
                    onChange={(e) => {
                      const updated = [...rows];
                      updated[index].firstName = e.target.value;
                      setRows(updated);
                    }}
                    data-testid={`input-firstname-${index}`}
                  />

                  <Input
                    placeholder="Apellido (opcional)"
                    value={row.lastName}
                    onChange={(e) => {
                      const updated = [...rows];
                      updated[index].lastName = e.target.value;
                      setRows(updated);
                    }}
                    data-testid={`input-lastname-${index}`}
                  />

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                    title="Quitar fila"
                    data-testid={`button-remove-row-${index}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {rows.length < availableRooms.length && rows.length < pending && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setRows([...rows, { roomId: "", firstName: group.name, lastName: group.name }])}
                  data-testid="button-add-assignment-row"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Agregar otra habitación
                </Button>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {rows.length > 0 && (
            <Button
              onClick={handleAssignAll}
              disabled={isSubmitting || rows.every(r => !r.roomId)}
              data-testid="button-confirm-assign-all"
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Asignando...</>
              ) : (
                `Asignar ${rows.filter(r => r.roomId).length} habitación(es)`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GroupDetailPage() {
  const params = useParams();
  const groupId = params.id as string;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  
  const [showAddBlockDialog, setShowAddBlockDialog] = useState(false);
  const [assigningBlock, setAssigningBlock] = useState<GroupRoomBlockWithDetails | null>(null);
  const [deleteBlockId, setDeleteBlockId] = useState<string | null>(null);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);
  const [showRoomingListDialog, setShowRoomingListDialog] = useState(false);
  const [showCheckInConfirm, setShowCheckInConfirm] = useState(false);
  const [showCheckOutConfirm, setShowCheckOutConfirm] = useState(false);
  const [showGroupPaymentDialog, setShowGroupPaymentDialog] = useState(false);
  const [groupPaymentAmount, setGroupPaymentAmount] = useState("");
  const [groupPaymentMethod, setGroupPaymentMethod] = useState("");
  const [groupPaymentReference, setGroupPaymentReference] = useState("");
  const [groupPaymentReceiptType, setGroupPaymentReceiptType] = useState("");
  const [groupPaymentDistribution, setGroupPaymentDistribution] = useState("equal");
  const [groupPaymentCloseAll, setGroupPaymentCloseAll] = useState(false);

  // Cambiar habitación
  const [changingReservation, setChangingReservation] = useState<ReservationWithDetails | null>(null);
  const [changeRoomId, setChangeRoomId] = useState("");

  // Folio Grupal state
  const [showAddGroupChargeDialog, setShowAddGroupChargeDialog] = useState(false);
  const [showFolioPaymentDialog, setShowFolioPaymentDialog] = useState(false);
  const [folioChargeDescription, setFolioChargeDescription] = useState("");
  const [folioChargeAmount, setFolioChargeAmount] = useState("");
  const [folioChargeDate, setFolioChargeDate] = useState(new Date().toISOString().split("T")[0]);
  const [folioChargeCategory, setFolioChargeCategory] = useState("otros");
  const [folioPaymentAmount, setFolioPaymentAmount] = useState("");
  const [folioPaymentMethod, setFolioPaymentMethod] = useState("");
  const [folioPaymentDistribution, setFolioPaymentDistribution] = useState("equal");
  const [folioPaymentReference, setFolioPaymentReference] = useState("");
  const [folioPaymentNotes, setFolioPaymentNotes] = useState("");
  const [manualDistribution, setManualDistribution] = useState<Record<string, number>>({});
  const [transferChargeTarget, setTransferChargeTarget] = useState<GroupCharge | null>(null);

  // Master Folio state
  const [showMasterPaymentDialog, setShowMasterPaymentDialog] = useState(false);
  const [masterPaymentAmount, setMasterPaymentAmount] = useState("");
  const [masterPaymentMethod, setMasterPaymentMethod] = useState("cash");
  const [masterPaymentReference, setMasterPaymentReference] = useState("");
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);

  const { data: group, isLoading } = useQuery<GroupWithDetails>({
    queryKey: ["/api/groups", groupId],
  });

  const { data: folio, isLoading: folioLoading } = useQuery<GroupFolioData>({
    queryKey: ["/api/groups", groupId, "folio"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/folio`, { credentials: "include" });
      if (!res.ok) throw new Error("Error loading folio");
      return res.json();
    },
  });

  const { data: masterFolio, isLoading: masterFolioLoading } = useQuery<any>({
    queryKey: ["/api/groups", groupId, "master-folio"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/master-folio`, { credentials: "include" });
      if (!res.ok) throw new Error("Error loading master folio");
      return res.json();
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (blockId: string) => apiRequest("DELETE", `/api/group-blocks/${blockId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      toast({ title: "Bloque eliminado" });
      setDeleteBlockId(null);
    },
    onError: () => {
      toast({ title: "Error al eliminar bloque", variant: "destructive" });
    },
  });

  const { data: changeRoomOptions = [] } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms/available", changingReservation?.checkInDate, changingReservation?.checkOutDate],
    queryFn: async () => {
      if (!changingReservation) return [];
      const params = new URLSearchParams({
        checkIn: changingReservation.checkInDate,
        checkOut: changingReservation.checkOutDate,
      });
      const res = await fetch(`/api/rooms/available?${params}`);
      if (!res.ok) throw new Error("Error al cargar habitaciones");
      return res.json();
    },
    enabled: !!changingReservation,
  });

  const changeRoomMutation = useMutation({
    mutationFn: async ({ reservationId, roomId, roomTypeId }: { reservationId: string; roomId: string; roomTypeId: string }) => {
      return apiRequest("PATCH", `/api/reservations/${reservationId}`, { roomId, roomTypeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/planning" });
      toast({ title: "Habitación cambiada", description: "La tarifa original fue conservada." });
      setChangingReservation(null);
      setChangeRoomId("");
    },
    onError: (err: any) => {
      let msg = "Error al cambiar habitación";
      try { const b = JSON.parse(err.message.replace(/^\d+:\s*/, "")); if (b.error) msg = b.error; } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  // Group mass actions
  const checkInAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/groups/${groupId}/check-in-all`);
      return res.json() as Promise<{ success: number; failed: number; errors: string[] }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setShowCheckInConfirm(false);
      if (data.success > 0 && data.failed === 0) {
        toast({ title: `Check-in grupal exitoso`, description: `${data.success} habitaciones procesadas` });
      } else if (data.success > 0 && data.failed > 0) {
        toast({ 
          title: `Check-in parcial`, 
          description: `${data.success} exitosos, ${data.failed} fallidos`,
          variant: "destructive"
        });
      } else if (data.failed > 0) {
        toast({ 
          title: `Error en check-in grupal`, 
          description: data.errors.join(", "),
          variant: "destructive"
        });
      }
    },
    onError: () => {
      setShowCheckInConfirm(false);
      toast({ title: "Error en check-in grupal", variant: "destructive" });
    },
  });

  const checkOutAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/groups/${groupId}/check-out-all`);
      return res.json() as Promise<{ success: number; failed: number; errors: string[] }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setShowCheckOutConfirm(false);
      if (data.success > 0 && data.failed === 0) {
        toast({ title: `Check-out grupal exitoso`, description: `${data.success} habitaciones procesadas` });
      } else if (data.success > 0 && data.failed > 0) {
        toast({ 
          title: `Check-out parcial`, 
          description: `${data.success} exitosos, ${data.failed} con saldo pendiente`,
          variant: "destructive"
        });
      } else if (data.failed > 0) {
        toast({ 
          title: `Check-out bloqueado`, 
          description: data.errors.join(", "),
          variant: "destructive"
        });
      }
    },
    onError: () => {
      setShowCheckOutConfirm(false);
      toast({ title: "Error en check-out grupal", variant: "destructive" });
    },
  });

  const groupPaymentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/groups/${groupId}/payment`, {
        amount: groupPaymentAmount,
        method: groupPaymentMethod,
        reference: groupPaymentReference,
        receiptType: groupPaymentReceiptType,
        distribution: groupPaymentDistribution,
        closeAllRooms: groupPaymentCloseAll,
      });
    },
    onSuccess: async (res) => {
      const data = await res.json().catch(() => ({}));
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === "/api/planning"
      });
      if (groupPaymentCloseAll) {
        if (data.balanceDiff && Math.abs(data.balanceDiff) > 0.01) {
          toast({
            title: "Pago registrado con diferencia",
            description: `Diferencia de $${Math.abs(data.balanceDiff).toFixed(2)} ${data.balanceDiff > 0 ? "(pagó de más)" : "(saldo pendiente)"}`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Pago grupal registrado — grupo cerrado",
            description: `${data.checkoutCount ?? 0} habitación(es) cerrada(s) exitosamente.`,
          });
        }
      } else {
        toast({ title: "Pago grupal registrado exitosamente" });
      }
      setShowGroupPaymentDialog(false);
      setGroupPaymentAmount("");
      setGroupPaymentMethod("");
      setGroupPaymentReference("");
      setGroupPaymentReceiptType("");
      setGroupPaymentDistribution("equal");
      setGroupPaymentCloseAll(false);
      if (showInvoiceDialog) {
        loadInvoice();
      }
    },
    onError: () => {
      toast({ title: "Error al registrar pago grupal", variant: "destructive" });
    },
  });

  // Folio mutations
  const addGroupChargeMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${groupId}/charges`, {
      description: folioChargeDescription,
      amount: folioChargeAmount,
      date: folioChargeDate,
      category: folioChargeCategory,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
      toast({ title: "Cargo agregado al folio grupal" });
      setShowAddGroupChargeDialog(false);
      setFolioChargeDescription("");
      setFolioChargeAmount("");
      setFolioChargeDate(new Date().toISOString().split("T")[0]);
      setFolioChargeCategory("otros");
    },
    onError: () => toast({ title: "Error al agregar cargo", variant: "destructive" }),
  });

  const deleteGroupChargeMutation = useMutation({
    mutationFn: (chargeId: string) => apiRequest("DELETE", `/api/groups/${groupId}/charges/${chargeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
      toast({ title: "Cargo eliminado" });
    },
    onError: () => toast({ title: "Error al eliminar cargo", variant: "destructive" }),
  });

  const folioPaymentMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${groupId}/payment/v2`, {
      amount: folioPaymentAmount,
      method: folioPaymentMethod,
      reference: folioPaymentReference,
      distribution: folioPaymentDistribution,
      distributionDetail: folioPaymentDistribution === "manual" ? manualDistribution : undefined,
      notes: folioPaymentNotes,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      toast({ title: "Pago grupal registrado" });
      setShowFolioPaymentDialog(false);
      setFolioPaymentAmount("");
      setFolioPaymentMethod("");
      setFolioPaymentReference("");
      setFolioPaymentNotes("");
      setFolioPaymentDistribution("equal");
      setManualDistribution({});
    },
    onError: () => toast({ title: "Error al registrar pago", variant: "destructive" }),
  });

  const transferChargeMutation = useMutation({
    mutationFn: ({ chargeId }: { chargeId: string }) =>
      apiRequest("POST", `/api/groups/${groupId}/transfer-charge`, { chargeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      toast({ title: "Cargo transferido al Folio Maestro" });
      setTransferChargeTarget(null);
    },
    onError: () => toast({ title: "Error al transferir cargo", variant: "destructive" }),
  });

  const updateMasterFolioConfigMutation = useMutation({
    mutationFn: (config: MasterFolioConfig) =>
      apiRequest("PATCH", `/api/groups/${groupId}`, { masterFolioConfig: config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      toast({ title: "Configuración del Folio Maestro actualizada" });
    },
    onError: () => toast({ title: "Error al actualizar configuración", variant: "destructive" }),
  });

  const masterPaymentMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/groups/${groupId}/master-payment`, {
        amount: masterPaymentAmount,
        method: masterPaymentMethod,
        reference: masterPaymentReference || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      toast({ title: "Pago al Folio Maestro registrado exitosamente" });
      setShowMasterPaymentDialog(false);
      setMasterPaymentAmount("");
      setMasterPaymentMethod("cash");
      setMasterPaymentReference("");
    },
    onError: () => toast({ title: "Error al registrar pago maestro", variant: "destructive" }),
  });

  const loadInvoice = async () => {
    setIsLoadingInvoice(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/invoice`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setInvoiceData(data);
        setShowInvoiceDialog(true);
      } else {
        toast({ title: "Error al cargar factura", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error al cargar factura", variant: "destructive" });
    } finally {
      setIsLoadingInvoice(false);
    }
  };

  const printInvoice = () => {
    window.print();
  };

  const printRoomingList = () => {
    if (!group) return;
    const sortedReservations = [...group.reservations].sort(
      (a, b) => (a.room?.roomNumber || "").localeCompare(b.room?.roomNumber || "")
    );

    const statusLabel = (status: string) => {
      switch (status) {
        case "checked_in": return "En Casa";
        case "confirmed": return "Confirmado";
        case "checked_out": return "Salió";
        case "cancelled": return "Cancelado";
        default: return status;
      }
    };

    const rows = sortedReservations.map((res, idx) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:center;">${idx + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;font-weight:bold;">${res.room?.roomNumber || "-"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;">${res.room?.roomType?.name || "-"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;">${res.guest?.lastName || ""} ${res.guest?.firstName || ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;font-size:11px;">${res.guest?.documentNumber ? `${res.guest?.documentType || "DOC"}: ${res.guest?.documentNumber}` : "-"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;">${fmtDate(res.checkInDate)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;">${fmtDate(res.checkOutDate)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;">${statusLabel(res.status)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;font-size:11px;max-width:120px;">${res.notes || ""}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Rooming List - ${group.name}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 24px; color: #222; }
    h1 { margin: 0 0 2px 0; font-size: 20px; }
    h2 { margin: 0 0 16px 0; font-size: 15px; font-weight: normal; color: #555; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 12px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 13px; }
    .info-block { }
    .info-block p { margin: 2px 0; }
    .info-label { color: #777; font-size: 11px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f5f5f5; padding: 8px; text-align: left; border-bottom: 2px solid #333; font-size: 11px; text-transform: uppercase; }
    .footer { text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 10px; color: #999; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Maran Suites & Towers</h1>
    <h2>Rooming List</h2>
  </div>
  <div class="info-row">
    <div class="info-block">
      <p class="info-label">Grupo</p>
      <p><strong>${group.name}</strong></p>
      <p style="font-family:monospace;font-size:12px;">${group.groupCode}</p>
    </div>
    <div class="info-block">
      <p class="info-label">Contacto</p>
      <p>${group.contactName || "-"}</p>
      <p>${group.contactPhone || ""}</p>
      <p>${group.contactEmail || ""}</p>
    </div>
    <div class="info-block" style="text-align:right;">
      <p class="info-label">Fechas</p>
      <p>Check-in: <strong>${fmtDate(group.checkInDate)}</strong></p>
      <p>Check-out: <strong>${fmtDate(group.checkOutDate)}</strong></p>
      <p>Habitaciones: <strong>${group.reservations.length}</strong></p>
    </div>
  </div>
  ${group.eventDate ? `
  <div style="background:#f9f7ff;border:1px solid #d4c8f0;border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:13px;">
    <p class="info-label" style="margin:0 0 6px 0;">Evento</p>
    <div style="display:flex;gap:32px;">
      <div><strong>Fecha:</strong> ${fmtDate(group.eventDate)}</div>
      ${(group as any).eventSalon ? `<div><strong>Salón:</strong> ${(group as any).eventSalon}</div>` : ""}
      ${(group as any).eventTime ? `<div><strong>Horario:</strong> ${(group as any).eventTime}</div>` : ""}
    </div>
  </div>
  ` : ""}
  ${group.notes ? `
  <div style="background:#fffbea;border:1px solid #e6d87a;border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:13px;">
    <p class="info-label" style="margin:0 0 6px 0;">Notas de la estadía</p>
    <p style="margin:0;white-space:pre-wrap;">${group.notes}</p>
  </div>
  ` : ""}
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Hab.</th>
        <th>Tipo</th>
        <th>Hu&eacute;sped</th>
        <th>Documento</th>
        <th>Check-in</th>
        <th>Check-out</th>
        <th>Estado</th>
        <th>Notas</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    Generado el ${new Date().toLocaleString("es-AR")} | Maran Suites &amp; Towers
  </div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const [y, m, dd] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="p-6">
        <p>Grupo no encontrado</p>
        <Button onClick={() => navigate("/groups")}>Volver a Grupos</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/groups")} data-testid="button-back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-group-name">
              {group.name}
            </h1>
            <GroupStatusBadge status={group.status} />
          </div>
          <p className="text-muted-foreground font-mono">{group.groupCode}</p>
        </div>
        
        {/* Mass Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          {group.reservations.some(r => r.status === "confirmed" && r.checkInDate <= today) && (
            <Button
              variant="default"
              onClick={() => setShowCheckInConfirm(true)}
              disabled={checkInAllMutation.isPending}
              data-testid="button-check-in-all"
            >
              <LogIn className="mr-2 h-4 w-4" />
              {checkInAllMutation.isPending ? "Procesando..." : "Check-in Grupal"}
            </Button>
          )}
          
          {group.reservations.some(r => r.status === "checked_in") && (
            <Button
              variant="secondary"
              onClick={() => setShowCheckOutConfirm(true)}
              disabled={checkOutAllMutation.isPending}
              data-testid="button-check-out-all"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {checkOutAllMutation.isPending ? "Procesando..." : "Check-out Grupal"}
            </Button>
          )}
          
          <Button
            variant="default"
            onClick={() => {
              setGroupPaymentAmount("");
              setShowGroupPaymentDialog(true);
            }}
            disabled={groupPaymentMutation.isPending}
            data-testid="button-group-payment"
          >
            <DollarSign className="mr-2 h-4 w-4" />
            Pago Grupal
          </Button>
          
          <Button
            variant="outline"
            onClick={loadInvoice}
            disabled={isLoadingInvoice}
            data-testid="button-group-invoice"
          >
            <FileText className="mr-2 h-4 w-4" />
            {isLoadingInvoice ? "Cargando..." : "Factura Grupal"}
          </Button>
          
          <Button
            variant="outline"
            onClick={() => setShowRoomingListDialog(true)}
            data-testid="button-rooming-list"
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir Rooming List
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Fechas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Check-in: <span className="font-medium">{formatDate(group.checkInDate)}</span></p>
            <p className="text-sm">Check-out: <span className="font-medium">{formatDate(group.checkOutDate)}</span></p>
            {group.eventDate && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Evento</p>
                <p className="text-sm">Fecha: <span className="font-medium">{formatDate(group.eventDate)}</span></p>
                {(group as any).eventSalon && <p className="text-sm">Salón: <span className="font-medium">{(group as any).eventSalon}</span></p>}
                {(group as any).eventTime && <p className="text-sm">Horario: <span className="font-medium">{(group as any).eventTime}</span></p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" />
              Contacto
            </CardTitle>
          </CardHeader>
          <CardContent>
            {group.contactName ? (
              <>
                <p className="font-medium">{group.contactName}</p>
                {group.contactPhone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {group.contactPhone}
                  </p>
                )}
                {group.contactEmail && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {group.contactEmail}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sin contacto definido</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DoorOpen className="h-4 w-4" />
              Habitaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${group.assignedRooms > group.totalRooms ? "text-destructive" : ""}`}>
                {group.assignedRooms}
              </span>
              <span className="text-muted-foreground">/ {group.totalRooms} asignadas</span>
            </div>
            {group.assignedRooms > group.totalRooms && (
              <div className="mt-1 flex items-center gap-1 text-sm text-destructive font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Excede el bloque en {group.assignedRooms - group.totalRooms} habitación(es). Agregue un bloque adicional.</span>
              </div>
            )}
            {group.totalRooms > group.assignedRooms && (
              <div className="mt-1 flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{group.totalRooms - group.assignedRooms} habitación(es) sin asignar</span>
              </div>
            )}
            <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all ${group.assignedRooms > group.totalRooms ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${group.totalRooms > 0 ? Math.min(100, (group.assignedRooms / group.totalRooms) * 100) : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {group.notes && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{group.notes}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="blocks" className="w-full">
        <TabsList>
          <TabsTrigger value="blocks" data-testid="tab-blocks">
            <Hotel className="mr-2 h-4 w-4" />
            Bloques ({group.blocks.length})
          </TabsTrigger>
          <TabsTrigger value="reservations" data-testid="tab-reservations">
            <Users2 className="mr-2 h-4 w-4" />
            Reservas ({group.reservations.length})
          </TabsTrigger>
          <TabsTrigger value="folio" data-testid="tab-folio">
            <DollarSign className="mr-2 h-4 w-4" />
            Folio Grupal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="blocks" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
              <div>
                <CardTitle>Bloques de Habitaciones</CardTitle>
                <CardDescription>Tipos y cantidades reservadas para el grupo</CardDescription>
              </div>
              <Button onClick={() => setShowAddBlockDialog(true)} data-testid="button-add-block">
                <Plus className="mr-2 h-4 w-4" />
                Agregar Bloque
              </Button>
            </CardHeader>
            <CardContent>
              {group.blocks.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Plan Tarifario</TableHead>
                      <TableHead>Tarifa Acordada</TableHead>
                      <TableHead className="w-[150px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.blocks.map((block) => (
                      <TableRow key={block.id} data-testid={`row-block-${block.id}`}>
                        <TableCell className="font-medium">
                          {block.roomType?.name} ({block.roomType?.code})
                        </TableCell>
                        <TableCell>{block.quantity}</TableCell>
                        <TableCell>
                          {block.ratePlan?.name || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {block.agreedRate ? `$${block.agreedRate}` : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAssigningBlock(block)}
                              data-testid={`button-assign-${block.id}`}
                            >
                              <DoorOpen className="mr-1 h-3 w-3" />
                              Asignar
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteBlockId(block.id)}
                              data-testid={`button-delete-block-${block.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Hotel className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    No hay bloques definidos. Agregue bloques para reservar habitaciones.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reservations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Reservas del Grupo</CardTitle>
              <CardDescription>Habitaciones asignadas individualmente</CardDescription>
            </CardHeader>
            <CardContent>
              {group.reservations.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Ocupante</TableHead>
                      <TableHead>Habitación</TableHead>
                      <TableHead>Fechas</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Tarifa</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.reservations.map((res) => (
                      <TableRow 
                        key={res.id} 
                        data-testid={`row-reservation-${res.id}`}
                        className="cursor-pointer hover:bg-accent"
                        onClick={() => navigate(`/reservations?view=${res.id}`)}
                      >
                        <TableCell className="font-mono text-sm">{res.reservationCode}</TableCell>
                        <TableCell>{res.guest?.lastName} {res.guest?.firstName}</TableCell>
                        <TableCell>{res.room?.roomNumber}</TableCell>
                        <TableCell className="text-sm">
                          {fmtDate(res.checkInDate)} - {fmtDate(res.checkOutDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={res.status === "confirmed" ? "default" : "secondary"}>
                            {res.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {res.finalRatePerNight
                            ? `$${parseFloat(res.finalRatePerNight).toLocaleString("es-AR")}`
                            : <span className="text-destructive font-medium">Sin tarifa</span>
                          }
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {!["checked_in", "checked_out", "cancelled"].includes(res.status) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => { setChangingReservation(res); setChangeRoomId(""); }}
                                data-testid={`button-change-room-${res.id}`}
                                title="Cambiar habitación preservando tarifa"
                              >
                                <ArrowLeftRight className="h-3 w-3 mr-1" />
                                Cambiar
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => navigate(`/reservations?view=${res.id}`)}
                              data-testid={`button-view-reservation-${res.id}`}
                              title="Ver detalle de reserva"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users2 className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    No hay reservas asignadas. Use los bloques para asignar habitaciones.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── FOLIO GRUPAL ─── */}
        <TabsContent value="folio" className="mt-4">
          {(folioLoading || masterFolioLoading) ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : masterFolio ? (
            <div className="space-y-5">

              {/* ── Configuración del Folio Maestro ── */}
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Settings2 className="h-4 w-4" />
                      <span>¿Qué cubre el organizador?</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {(["accommodation", "all", "none"] as MasterFolioConfig[]).map((cfg) => {
                        const labels: Record<MasterFolioConfig, string> = {
                          accommodation: "Solo alojamiento",
                          all: "Paga todo",
                          none: "Cada huésped paga su cuenta",
                        };
                        const isActive = (group as any)?.masterFolioConfig === cfg || (!( group as any)?.masterFolioConfig && cfg === "accommodation");
                        return (
                          <Button
                            key={cfg}
                            size="sm"
                            variant={isActive ? "default" : "outline"}
                            onClick={() => !isActive && updateMasterFolioConfigMutation.mutate(cfg)}
                            disabled={updateMasterFolioConfigMutation.isPending}
                            data-testid={`btn-master-config-${cfg}`}
                          >
                            {labels[cfg]}
                          </Button>
                        );
                      })}
                    </div>
                    {masterFolio.config === "accommodation" && (
                      <span className="text-xs text-muted-foreground">El organizador paga el alojamiento + cargos grupales. Los consumos individuales van a cada habitación.</span>
                    )}
                    {masterFolio.config === "all" && (
                      <span className="text-xs text-muted-foreground">El organizador paga todo. Los extras de cada hab. también van al Folio Maestro.</span>
                    )}
                    {masterFolio.config === "none" && (
                      <span className="text-xs text-muted-foreground">Sin folio maestro. Cada habitación paga su propia cuenta al hacer check-out.</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* ══════════════════════════════════════════════════ */}
              {/* FOLIO MAESTRO — solo cuando config !== "none"      */}
              {/* ══════════════════════════════════════════════════ */}
              {masterFolio.config !== "none" && (
                <Card className="border-2 border-primary/20">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Building2 className="h-5 w-5 text-primary" />
                          Folio Maestro
                          <Badge variant="outline" className="text-xs font-normal ml-1">
                            {masterFolio.config === "accommodation" ? "Alojamiento + Cargos grupales" : "Todo incluido"}
                          </Badge>
                        </CardTitle>
                        <CardDescription>Lo que paga el organizador del grupo</CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = `/api/folios/group/${groupId}/pdf`;
                            a.download = `folio-maestro-${group?.name || groupId}.pdf`;
                            a.click();
                          }}
                          data-testid="button-folio-pdf"
                        >
                          <FileDown className="h-4 w-4 mr-1" />
                          PDF
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setMasterPaymentAmount(masterFolio.masterBalance > 0 ? masterFolio.masterBalance.toFixed(2) : "");
                            setShowMasterPaymentDialog(true);
                          }}
                          disabled={masterFolio.masterBalance <= 0.01}
                          data-testid="button-master-payment"
                        >
                          <CreditCard className="h-4 w-4 mr-1" />
                          Pagar Folio Maestro
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">

                    {/* Resumen maestro */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-muted-foreground mb-1">Alojamiento</p>
                        <p className="text-lg font-bold text-blue-700 dark:text-blue-400">${masterFolio.masterAccommodation.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
                      </div>
                      {masterFolio.config === "all" && (
                        <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-3 border border-purple-200 dark:border-purple-800">
                          <p className="text-xs text-muted-foreground mb-1">Extras (hab.)</p>
                          <p className="text-lg font-bold text-purple-700 dark:text-purple-400">${masterFolio.masterExtras.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
                        </div>
                      )}
                      <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-3 border border-orange-200 dark:border-orange-800">
                        <p className="text-xs text-muted-foreground mb-1">Cargos grupales</p>
                        <p className="text-lg font-bold text-orange-700 dark:text-orange-400">${masterFolio.groupChargesTotal.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
                      </div>
                      <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3 border border-green-200 dark:border-green-800">
                        <p className="text-xs text-muted-foreground mb-1">Pagado</p>
                        <p className="text-lg font-bold text-green-700 dark:text-green-400">${masterFolio.masterPaid.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
                      </div>
                      <div className={`rounded-lg p-3 border col-span-2 sm:col-span-1 ${masterFolio.masterBalance > 0.01 ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"}`}>
                        <p className="text-xs text-muted-foreground mb-1">Saldo pendiente</p>
                        <p className={`text-lg font-bold ${masterFolio.masterBalance > 0.01 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`} data-testid="folio-master-balance">
                          ${masterFolio.masterBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    {/* Desglose de alojamiento por habitación */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Alojamiento por habitación</p>
                      <div className="rounded-md border divide-y">
                        {masterFolio.rooms.map((r: any) => (
                          <div key={r.reservationId} className="flex items-center justify-between px-3 py-2 text-sm">
                            <div className="flex items-center gap-3">
                              <span className="font-bold w-10">Hab. {r.roomNumber}</span>
                              <span className="text-muted-foreground">{r.guestName || "Sin asignar"}</span>
                              <span className="text-xs text-muted-foreground">{r.nights} noche(s)</span>
                            </div>
                            <span className="font-semibold">${r.accommodation.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-3 py-2 text-sm bg-muted/30 font-semibold">
                          <span>Total alojamiento</span>
                          <span>${masterFolio.masterAccommodation.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>

                    {/* Cargos grupales */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cargos grupales (eventos, servicios)</p>
                        <Button size="sm" variant="outline" onClick={() => setShowAddGroupChargeDialog(true)} data-testid="button-add-group-charge">
                          <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
                        </Button>
                      </div>
                      {masterFolio.groupCharges.length > 0 ? (
                        <div className="rounded-md border divide-y">
                          {masterFolio.groupCharges.map((gc: any) => (
                            <div key={gc.id} className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`row-group-charge-${gc.id}`}>
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="text-xs">{gc.category}</Badge>
                                <span className="font-medium">{gc.description}</span>
                                <span className="text-xs text-muted-foreground">{fmtDate(gc.date)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">${parseFloat(gc.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                <Button
                                  variant="ghost" size="icon" className="h-6 w-6"
                                  onClick={() => deleteGroupChargeMutation.mutate(gc.id)}
                                  disabled={deleteGroupChargeMutation.isPending}
                                  data-testid={`button-delete-group-charge-${gc.id}`}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          <div className="flex items-center justify-between px-3 py-2 text-sm bg-muted/30 font-semibold">
                            <span>Total cargos grupales</span>
                            <span>${masterFolio.groupChargesTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground text-sm border rounded-md">
                          Sin cargos grupales. Usá "Agregar" para eventos, salones, etc.
                        </div>
                      )}
                    </div>

                    {/* Pagos al folio maestro */}
                    {masterFolio.groupPayments.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pagos recibidos del organizador</p>
                        <div className="rounded-md border divide-y">
                          {masterFolio.groupPayments.map((gp: any) => (
                            <div key={gp.id} className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`row-group-payment-${gp.id}`}>
                              <div className="flex items-center gap-3">
                                <span className="text-muted-foreground">{fmtDate(gp.date)}</span>
                                <Badge variant="secondary">{PAYMENT_METHOD_LABELS[gp.method] || gp.method}</Badge>
                                {gp.reference && <span className="text-xs text-muted-foreground">{gp.reference}</span>}
                                {gp.distribution === "master_folio" && (
                                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs">Folio Maestro</Badge>
                                )}
                              </div>
                              <span className="font-semibold text-green-600">${parseFloat(gp.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between px-3 py-2 text-sm bg-muted/30 font-semibold text-green-700 dark:text-green-400">
                            <span>Total pagado</span>
                            <span>${masterFolio.masterPaid.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                    )}

                  </CardContent>
                </Card>
              )}

              {/* ══════════════════════════════════════════════════ */}
              {/* FOLIOS INDIVIDUALES POR HABITACIÓN                */}
              {/* ══════════════════════════════════════════════════ */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <DoorOpen className="h-5 w-5 text-muted-foreground" />
                      Folios Individuales por Habitación
                    </CardTitle>
                    {masterFolio.config === "none" && (
                      <Button size="sm" variant="outline" onClick={() => setShowFolioPaymentDialog(true)} data-testid="button-folio-payment">
                        <CreditCard className="h-4 w-4 mr-1" /> Pago grupal distribuido
                      </Button>
                    )}
                  </div>
                  {masterFolio.config !== "none" && (
                    <CardDescription>
                      {masterFolio.config === "accommodation"
                        ? "El alojamiento está cubierto por el Folio Maestro. Aquí se ven los consumos individuales de cada habitación."
                        : "El Folio Maestro cubre todo. Las cuentas individuales deberían quedar en cero."}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {masterFolio.rooms.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No hay habitaciones asignadas al grupo.
                    </div>
                  ) : (
                    masterFolio.rooms.map((r: any) => {
                      const isExpanded = expandedRoomId === r.reservationId;
                      const hasExtras = r.extras > 0;
                      const indivBalance = r.individualBalance;
                      const hasDebt = indivBalance > 0.01;

                      return (
                        <div key={r.reservationId} className="rounded-lg border overflow-hidden" data-testid={`room-folio-${r.reservationId}`}>
                          {/* Header de la habitación */}
                          <button
                            className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors ${hasDebt ? "border-l-4 border-l-red-500" : "border-l-4 border-l-green-500"}`}
                            onClick={() => setExpandedRoomId(isExpanded ? null : r.reservationId)}
                            data-testid={`button-expand-room-${r.reservationId}`}
                          >
                            <div className="flex items-center gap-4">
                              <span className="font-bold text-sm w-14">Hab. {r.roomNumber}</span>
                              <span className="text-sm">{r.guestName || "Sin asignar"}</span>
                              <Badge variant="outline" className="text-xs">{r.nights} noche(s)</Badge>
                              {hasExtras && masterFolio.config !== "none" && (
                                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 text-xs">
                                  ${r.extras.toLocaleString("es-AR", { minimumFractionDigits: 0 })} en extras
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">
                                  {masterFolio.config === "none" ? "Saldo total" : "Saldo individual"}
                                </p>
                                <p className={`font-bold text-sm ${hasDebt ? "text-red-600" : "text-green-600"}`}>
                                  ${indivBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                </p>
                              </div>
                              {isExpanded
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </div>
                          </button>

                          {/* Detalle expandido */}
                          {isExpanded && (
                            <div className="border-t bg-muted/20 px-4 py-3 space-y-3">
                              {/* Alojamiento */}
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <Hotel className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-muted-foreground">Alojamiento ({r.nights} noche(s))</span>
                                  {masterFolio.config !== "none" && (
                                    <Badge className="bg-primary/10 text-primary text-xs border-0">Folio Maestro</Badge>
                                  )}
                                </div>
                                <span className={`font-medium ${masterFolio.config !== "none" ? "text-muted-foreground line-through" : ""}`}>
                                  ${r.accommodation.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                </span>
                              </div>

                              {/* Consumos individuales */}
                              {r.charges.length > 0 ? (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                    Consumos individuales
                                    {masterFolio.config === "all" && <span className="ml-2 text-muted-foreground font-normal normal-case">(cubiertos por Folio Maestro)</span>}
                                  </p>
                                  <div className="space-y-1">
                                    {r.charges.map((c: any) => (
                                      <div key={c.id} className="flex items-center justify-between text-sm bg-background rounded px-2 py-1.5">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className="text-xs">{c.category}</Badge>
                                          <span>{c.description}</span>
                                          <span className="text-xs text-muted-foreground">{fmtDate(c.date)}</span>
                                          {masterFolio.config === "all" && (
                                            <Badge className="bg-primary/10 text-primary text-xs border-0">Folio Maestro</Badge>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">${c.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                          {masterFolio.config === "accommodation" && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-6 text-xs px-2"
                                              onClick={() => transferChargeMutation.mutate({ chargeId: c.id })}
                                              disabled={transferChargeMutation.isPending}
                                              title="Mover al Folio Maestro"
                                              data-testid={`button-transfer-charge-${c.id}`}
                                            >
                                              <ArrowRight className="h-3 w-3 mr-1" />
                                              Al maestro
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                    <div className="flex items-center justify-between text-sm font-semibold px-2 py-1 border-t">
                                      <span>Total consumos</span>
                                      <span>${r.extras.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">Sin consumos individuales registrados</p>
                              )}

                              {/* Pagos individuales */}
                              {r.individualPayments > 0 && (
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">Pagos individuales recibidos</span>
                                  <span className="font-medium text-green-600">${r.individualPayments.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                </div>
                              )}

                              {/* Saldo individual */}
                              <div className={`flex items-center justify-between text-sm font-semibold rounded p-2 ${hasDebt ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400" : "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"}`}>
                                <span>
                                  {masterFolio.config === "none" ? "Saldo total pendiente" :
                                   masterFolio.config === "accommodation" ? "Saldo en consumos individuales" :
                                   "Saldo individual (debe ser $0)"}
                                </span>
                                <span>${indivBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs"
                                  onClick={() => navigate(`/reservations?view=${r.reservationId}`)}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Ver reserva completa
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* Totales resumen */}
                  {folio && masterFolio.rooms.length > 0 && (
                    <div className="mt-3 rounded-lg border bg-muted/30 px-4 py-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Total alojamiento</p>
                          <p className="font-bold">${folio.totals.accommodation.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total extras</p>
                          <p className="font-bold">${folio.totals.extras.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total pagos</p>
                          <p className="font-bold text-green-600">${folio.totals.payments.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Saldo total grupo</p>
                          <p className={`font-bold ${folio.totals.balance > 0.01 ? "text-red-600" : "text-green-600"}`}>
                            ${folio.totals.balance.toLocaleString("es-AR", { minimumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Error cargando folio grupal.</div>
          )}
        </TabsContent>

      </Tabs>

      {group && (
        <AddBlockDialog
          groupId={groupId}
          group={group}
          open={showAddBlockDialog}
          onOpenChange={setShowAddBlockDialog}
          onSuccess={() => {}}
        />
      )}

      {assigningBlock && (
        <AssignBlockDialog
          key={assigningBlock.id}
          group={group}
          block={assigningBlock}
          open={!!assigningBlock}
          onOpenChange={(open) => !open && setAssigningBlock(null)}
          onSuccess={() => {}}
        />
      )}

      <Dialog open={!!deleteBlockId} onOpenChange={() => setDeleteBlockId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea eliminar este bloque de habitaciones?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBlockId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteBlockId && deleteBlockMutation.mutate(deleteBlockId)}
              disabled={deleteBlockMutation.isPending}
            >
              {deleteBlockMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Invoice Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible">
          <DialogHeader className="print:mb-4">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Factura Grupal - {invoiceData?.group?.name}
            </DialogTitle>
            <DialogDescription>
              Código: {invoiceData?.group?.code} | {invoiceData?.group?.checkInDate} - {invoiceData?.group?.checkOutDate}
            </DialogDescription>
          </DialogHeader>

          {invoiceData && (
            <div className="space-y-6 print:text-sm" id="invoice-content">
              {/* Group Info */}
              <div className="p-4 bg-muted rounded-lg print:bg-transparent print:border print:p-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Contacto</p>
                    <p className="font-medium">{invoiceData.group.contactName || "-"}</p>
                    <p className="text-sm">{invoiceData.group.contactPhone}</p>
                    <p className="text-sm">{invoiceData.group.contactEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Período</p>
                    <p className="font-medium">{invoiceData.group.checkInDate} - {invoiceData.group.checkOutDate}</p>
                  </div>
                </div>
              </div>

              {/* Reservations Detail */}
              <div className="space-y-4">
                <h3 className="font-semibold">Detalle por Habitación</h3>
                {invoiceData.reservations.map((res: any, idx: number) => (
                  <Card key={idx} className="print:border print:shadow-none">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base">Hab. {res.room} - {res.guest}</CardTitle>
                          <CardDescription>{res.reservationCode} | {res.nights} noches</CardDescription>
                        </div>
                        <Badge variant={res.balance > 0 ? "destructive" : "default"}>
                          {res.balance > 0 ? `Pendiente: $${res.balance.toFixed(2)}` : "Pagado"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Alojamiento ({res.nights} x ${res.ratePerNight.toFixed(2)})</span>
                        <span className="font-medium">${res.accommodationTotal.toFixed(2)}</span>
                      </div>
                      
                      {res.charges.length > 0 && (
                        <div className="pl-4 border-l-2 border-muted space-y-1">
                          <p className="text-muted-foreground">Consumos:</p>
                          {res.charges.map((c: any, i: number) => (
                            <div key={i} className="flex justify-between">
                              <span>{c.description}</span>
                              <span>${c.amount.toFixed(2)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-medium">
                            <span>Subtotal consumos</span>
                            <span>${res.chargesTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                      
                      {res.payments.length > 0 && (
                        <div className="pl-4 border-l-2 border-green-500 space-y-1">
                          <p className="text-muted-foreground">Pagos:</p>
                          {res.payments.map((p: any, i: number) => (
                            <div key={i} className="flex justify-between text-green-600">
                              <span>{p.method} {p.reference && `(${p.reference})`}</span>
                              <span>-${p.amount.toFixed(2)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-medium text-green-600">
                            <span>Total pagos</span>
                            <span>-${res.paymentsTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Totals */}
              <Card className="bg-muted print:bg-transparent print:border-2">
                <CardContent className="pt-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Alojamiento</span>
                      <span className="font-medium">${invoiceData.totals.accommodation.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Consumos</span>
                      <span className="font-medium">${invoiceData.totals.charges.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>Total Pagos</span>
                      <span className="font-medium">-${invoiceData.totals.payments.toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Saldo Total</span>
                        <span className={invoiceData.totals.balance > 0 ? "text-destructive" : "text-green-600"}>
                          ${invoiceData.totals.balance.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter className="print:hidden gap-2">
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>
              Cerrar
            </Button>
            {invoiceData?.totals?.balance > 0.01 && (
              <Button
                variant="default"
                onClick={() => {
                  setGroupPaymentAmount(invoiceData.totals.balance.toFixed(2));
                  setShowGroupPaymentDialog(true);
                }}
                data-testid="button-group-payment"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Registrar Pago Grupal
              </Button>
            )}
            <Button onClick={printInvoice} data-testid="button-print-invoice">
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rooming List Dialog */}
      <Dialog open={showRoomingListDialog} onOpenChange={setShowRoomingListDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users2 className="h-5 w-5" />
              Rooming List - {group.name}
            </DialogTitle>
            <DialogDescription>
              {group.groupCode} | {fmtDate(group.checkInDate)} - {fmtDate(group.checkOutDate)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4" id="rooming-list-content">
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-md">
              <div>
                <p className="text-sm text-muted-foreground">Grupo</p>
                <p className="font-bold text-lg">{group.name}</p>
                <p className="font-mono text-sm">{group.groupCode}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Contacto</p>
                <p className="font-medium">{group.contactName || "-"}</p>
                <p className="text-sm">{group.contactPhone}</p>
                <p className="text-sm">{group.contactEmail}</p>
              </div>
            </div>

            <div className="flex gap-4 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Check-in: <strong>{fmtDate(group.checkInDate)}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Check-out: <strong>{fmtDate(group.checkOutDate)}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <DoorOpen className="h-4 w-4 text-muted-foreground" />
                <span><strong>{group.reservations.length}</strong> habitaciones</span>
              </div>
            </div>

            {group.reservations.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Habitación</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Huésped</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.reservations
                    .sort((a, b) => (a.room?.roomNumber || "").localeCompare(b.room?.roomNumber || ""))
                    .map((res, idx) => (
                      <TableRow key={res.id} data-testid={`row-rooming-${res.id}`}>
                        <TableCell className="font-medium">{idx + 1}</TableCell>
                        <TableCell className="font-bold">{res.room?.roomNumber}</TableCell>
                        <TableCell>{res.room?.roomType?.name || "-"}</TableCell>
                        <TableCell className="font-medium">{res.guest?.lastName} {res.guest?.firstName}</TableCell>
                        <TableCell className="text-sm">
                          {res.guest?.documentNumber
                            ? `${res.guest?.documentType || "DOC"}: ${res.guest?.documentNumber}`
                            : "-"}
                        </TableCell>
                        <TableCell>{fmtDate(res.checkInDate)}</TableCell>
                        <TableCell>{fmtDate(res.checkOutDate)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              res.status === "checked_in" ? "default" :
                              res.status === "confirmed" ? "secondary" :
                              res.status === "checked_out" ? "outline" : "destructive"
                            }
                          >
                            {res.status === "checked_in" ? "En Casa" :
                             res.status === "confirmed" ? "Confirmado" :
                             res.status === "checked_out" ? "Salió" : res.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                          {res.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No hay habitaciones asignadas en este grupo
              </div>
            )}

            <div className="text-xs text-muted-foreground text-center pt-4 border-t">
              Generado el {new Date().toLocaleString("es-AR")} | Maran Suites & Towers
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRoomingListDialog(false)}>
              Cerrar
            </Button>
            <Button onClick={() => printRoomingList()} data-testid="button-print-rooming-list">
              <Printer className="mr-2 h-4 w-4" />
              Imprimir Rooming List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCheckInConfirm} onOpenChange={setShowCheckInConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Confirmar Check-in Grupal
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Se realizará el check-in de <strong>{group.reservations.filter(r => r.status === "confirmed").length}</strong> habitación(es) confirmadas.
                  Las habitaciones pasarán a estado "ocupado".
                </p>
                <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                  <p className="font-medium text-foreground">Resumen del grupo:</p>
                  <p>Confirmadas: {group.reservations.filter(r => r.status === "confirmed").length}</p>
                  <p>Ya en casa: {group.reservations.filter(r => r.status === "checked_in").length}</p>
                  <p>Otras: {group.reservations.filter(r => !["confirmed", "checked_in"].includes(r.status)).length}</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => checkInAllMutation.mutate()}
              disabled={checkInAllMutation.isPending}
              data-testid="button-confirm-check-in-all"
            >
              <LogIn className="mr-2 h-4 w-4" />
              {checkInAllMutation.isPending ? "Procesando..." : "Sí, realizar check-in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCheckOutConfirm} onOpenChange={setShowCheckOutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Confirmar Check-out Grupal
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Se realizará el check-out de <strong>{group.reservations.filter(r => r.status === "checked_in").length}</strong> habitación(es) en casa.
                </p>
                <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                  <p className="font-medium text-foreground">Importante:</p>
                  <p>Las habitaciones con saldo pendiente no serán procesadas.</p>
                  <p>Las habitaciones procesadas irán a estado de limpieza.</p>
                  <p>Si hay habitaciones con saldo, registre un pago grupal primero.</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => checkOutAllMutation.mutate()}
              disabled={checkOutAllMutation.isPending}
              data-testid="button-confirm-check-out-all"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {checkOutAllMutation.isPending ? "Procesando..." : "Sí, realizar check-out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showGroupPaymentDialog} onOpenChange={setShowGroupPaymentDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Pago Grupal
            </DialogTitle>
            <DialogDescription>
              Registre un pago que se distribuirá entre las reservas activas del grupo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Monto Total *</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={groupPaymentAmount}
                onChange={(e) => setGroupPaymentAmount(e.target.value)}
                placeholder="0.00"
                data-testid="input-group-payment-amount"
              />
            </div>

            <div>
              <Label>Método de Pago *</Label>
              <Select value={groupPaymentMethod} onValueChange={setGroupPaymentMethod}>
                <SelectTrigger data-testid="select-group-payment-method">
                  <SelectValue placeholder="Seleccionar método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta_debito">Tarjeta Débito</SelectItem>
                  <SelectItem value="tarjeta_credito">Tarjeta Crédito</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="mercadopago">MercadoPago</SelectItem>
                  <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo de Comprobante</Label>
              <Select value={groupPaymentReceiptType} onValueChange={setGroupPaymentReceiptType}>
                <SelectTrigger data-testid="select-group-payment-receipt">
                  <SelectValue placeholder="Seleccionar comprobante" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ticket">Ticket</SelectItem>
                  <SelectItem value="factura_a">Factura A</SelectItem>
                  <SelectItem value="factura_b">Factura B</SelectItem>
                  <SelectItem value="factura_c">Factura C</SelectItem>
                  <SelectItem value="nota_credito">Nota de Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Distribución</Label>
              <Select value={groupPaymentDistribution} onValueChange={setGroupPaymentDistribution}>
                <SelectTrigger data-testid="select-group-payment-distribution">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">Partes iguales</SelectItem>
                  <SelectItem value="proportional">Proporcional al costo</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {groupPaymentDistribution === "equal"
                  ? "El monto se divide en partes iguales entre las reservas activas"
                  : "El monto se distribuye proporcionalmente al costo total de cada reserva"}
              </p>
            </div>

            <div>
              <Label>Referencia</Label>
              <Input
                value={groupPaymentReference}
                onChange={(e) => setGroupPaymentReference(e.target.value)}
                placeholder="Número de comprobante, nota..."
                data-testid="input-group-payment-reference"
              />
            </div>

            <div className="border-t pt-3">
              <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                <Checkbox
                  id="close-all-rooms"
                  checked={groupPaymentCloseAll}
                  onCheckedChange={(v) => setGroupPaymentCloseAll(!!v)}
                  data-testid="checkbox-close-all-rooms"
                />
                <div className="space-y-1">
                  <label htmlFor="close-all-rooms" className="text-sm font-medium cursor-pointer leading-tight">
                    Con este pago se cierran todas las habitaciones del grupo
                  </label>
                  <p className="text-xs text-muted-foreground">
                    El sistema distribuirá el pago para saldar cada reserva y realizará el check-out de todas las habitaciones activas.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGroupPaymentDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => groupPaymentMutation.mutate()}
              disabled={!groupPaymentAmount || !groupPaymentMethod || groupPaymentMutation.isPending}
              data-testid="button-confirm-group-payment"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {groupPaymentMutation.isPending ? "Procesando..." : groupPaymentCloseAll ? "Pagar y Cerrar Grupo" : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Pago al Folio Maestro ─── */}
      <Dialog open={showMasterPaymentDialog} onOpenChange={(open) => {
        setShowMasterPaymentDialog(open);
        if (!open) { setMasterPaymentAmount(""); setMasterPaymentMethod("cash"); setMasterPaymentReference(""); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              Pago al Folio Maestro
            </DialogTitle>
            <DialogDescription>
              Este pago cubre los cargos del organizador del grupo. Se distribuirá proporcionalmente entre las habitaciones.
            </DialogDescription>
          </DialogHeader>
          {masterFolio && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total del Folio Maestro</span>
                  <span className="font-semibold">${masterFolio.masterTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ya pagado</span>
                  <span className="font-semibold text-green-600">${masterFolio.masterPaid.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Saldo pendiente</span>
                  <span className={masterFolio.masterBalance > 0.01 ? "text-red-600" : "text-green-600"}>
                    ${masterFolio.masterBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div>
                <Label>Monto a pagar</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={masterPaymentAmount}
                  onChange={(e) => setMasterPaymentAmount(e.target.value)}
                  placeholder={masterFolio.masterBalance.toFixed(2)}
                  data-testid="input-master-payment-amount"
                />
              </div>
              <div>
                <Label>Método de pago</Label>
                <Select value={masterPaymentMethod} onValueChange={setMasterPaymentMethod}>
                  <SelectTrigger data-testid="select-master-payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Referencia / comprobante (opcional)</Label>
                <Input
                  value={masterPaymentReference}
                  onChange={(e) => setMasterPaymentReference(e.target.value)}
                  placeholder="Nro de transferencia, cheque, etc."
                  data-testid="input-master-payment-reference"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMasterPaymentDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => masterPaymentMutation.mutate()}
              disabled={!masterPaymentAmount || parseFloat(masterPaymentAmount) <= 0 || masterPaymentMutation.isPending}
              data-testid="button-confirm-master-payment"
            >
              {masterPaymentMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</> : "Registrar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Agregar cargo al folio grupal ─── */}
      <Dialog open={showAddGroupChargeDialog} onOpenChange={setShowAddGroupChargeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Cargo al Folio Grupal</DialogTitle>
            <DialogDescription>
              Este cargo se aplicará directamente al grupo, no a una reserva individual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Descripción *</Label>
              <Input
                value={folioChargeDescription}
                onChange={(e) => setFolioChargeDescription(e.target.value)}
                placeholder="Ej: Salón de eventos, Decoración..."
                data-testid="input-folio-charge-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Monto *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={folioChargeAmount}
                  onChange={(e) => setFolioChargeAmount(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-folio-charge-amount"
                />
              </div>
              <div>
                <Label>Fecha *</Label>
                <Input
                  type="date"
                  value={folioChargeDate}
                  onChange={(e) => setFolioChargeDate(e.target.value)}
                  data-testid="input-folio-charge-date"
                />
              </div>
            </div>
            <div>
              <Label>Categoría</Label>
              <Select value={folioChargeCategory} onValueChange={setFolioChargeCategory}>
                <SelectTrigger data-testid="select-folio-charge-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="otros">Otros</SelectItem>
                  <SelectItem value="alimentos">Alimentos</SelectItem>
                  <SelectItem value="bebidas">Bebidas</SelectItem>
                  <SelectItem value="eventos">Eventos</SelectItem>
                  <SelectItem value="transporte">Transporte</SelectItem>
                  <SelectItem value="spa">SPA</SelectItem>
                  <SelectItem value="lavanderia">Lavandería</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddGroupChargeDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => addGroupChargeMutation.mutate()}
              disabled={!folioChargeDescription || !folioChargeAmount || addGroupChargeMutation.isPending}
              data-testid="button-confirm-group-charge"
            >
              {addGroupChargeMutation.isPending ? "Guardando..." : "Agregar Cargo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Pago desde Folio Grupal ─── */}
      <Dialog open={showFolioPaymentDialog} onOpenChange={setShowFolioPaymentDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Registrar Pago Grupal
            </DialogTitle>
            <DialogDescription>
              El pago se distribuirá entre las reservas activas y quedará registrado en el folio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Monto Total *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={folioPaymentAmount}
                  onChange={(e) => setFolioPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-folio-payment-amount"
                />
              </div>
              <div>
                <Label>Método *</Label>
                <Select value={folioPaymentMethod} onValueChange={setFolioPaymentMethod}>
                  <SelectTrigger data-testid="select-folio-payment-method">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="tarjeta_debito">Tarjeta Débito</SelectItem>
                    <SelectItem value="tarjeta_credito">Tarjeta Crédito</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="mercadopago">MercadoPago</SelectItem>
                    <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Distribución</Label>
              <Select value={folioPaymentDistribution} onValueChange={setFolioPaymentDistribution}>
                <SelectTrigger data-testid="select-folio-payment-distribution">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">Partes iguales</SelectItem>
                  <SelectItem value="proportional_nights">Proporcional por noches</SelectItem>
                  <SelectItem value="proportional_rate">Proporcional por tarifa</SelectItem>
                  <SelectItem value="manual">Manual (asignar por habitación)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {folioPaymentDistribution === "manual" && folio && (
              <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                <Label>Asignación manual</Label>
                {folio.reservations.map((res) => (
                  <div key={res.reservationId} className="flex items-center gap-2">
                    <span className="text-sm w-28 shrink-0">Hab. {res.roomNumber}</span>
                    <span className="text-xs text-muted-foreground w-24 truncate">{res.guestName}</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={manualDistribution[res.reservationId] || ""}
                      onChange={(e) => setManualDistribution({
                        ...manualDistribution,
                        [res.reservationId]: parseFloat(e.target.value) || 0,
                      })}
                      className="w-28"
                      placeholder="0.00"
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Asignado: ${Object.values(manualDistribution).reduce((a, b) => a + b, 0).toFixed(2)}
                  {" / "}Total: ${folioPaymentAmount || "0"}
                </p>
              </div>
            )}

            <div>
              <Label>Referencia</Label>
              <Input
                value={folioPaymentReference}
                onChange={(e) => setFolioPaymentReference(e.target.value)}
                placeholder="N° de comprobante..."
                data-testid="input-folio-payment-reference"
              />
            </div>
            <div>
              <Label>Notas</Label>
              <Input
                value={folioPaymentNotes}
                onChange={(e) => setFolioPaymentNotes(e.target.value)}
                placeholder="Observaciones opcionales..."
                data-testid="input-folio-payment-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFolioPaymentDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => folioPaymentMutation.mutate()}
              disabled={!folioPaymentAmount || !folioPaymentMethod || folioPaymentMutation.isPending}
              data-testid="button-confirm-folio-payment"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {folioPaymentMutation.isPending ? "Procesando..." : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirm: Transferir cargo al folio grupal ─── */}
      <AlertDialog open={!!transferChargeTarget} onOpenChange={(open) => !open && setTransferChargeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transferir cargo al folio grupal</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Mover el cargo "{transferChargeTarget?.description}" (${parseFloat(transferChargeTarget?.amount || "0").toFixed(2)}) al folio del grupo?
              Se creará una copia en el folio grupal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => transferChargeTarget && transferChargeMutation.mutate({ chargeId: transferChargeTarget.id })}
              disabled={transferChargeMutation.isPending}
              data-testid="button-confirm-transfer-charge"
            >
              {transferChargeMutation.isPending ? "Transfiriendo..." : "Transferir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── CAMBIAR HABITACIÓN ─── */}
      <Dialog open={!!changingReservation} onOpenChange={(open) => { if (!open) { setChangingReservation(null); setChangeRoomId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" />
              Cambiar Habitación
            </DialogTitle>
            <DialogDescription>
              Reserva <span className="font-mono font-medium">{changingReservation?.reservationCode}</span>{" "}
              — Hab. actual: <strong>{changingReservation?.room?.roomNumber}</strong>
              {changingReservation?.finalRatePerNight && (
                <span className="ml-1 text-muted-foreground">· Tarifa: ${parseFloat(changingReservation.finalRatePerNight).toLocaleString("es-AR")}/noche (se conserva)</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <div>
              <Label>Nueva habitación</Label>
              <Select value={changeRoomId} onValueChange={setChangeRoomId}>
                <SelectTrigger data-testid="select-change-room">
                  <SelectValue placeholder="Seleccionar habitación..." />
                </SelectTrigger>
                <SelectContent>
                  {changeRoomOptions
                    .filter(r => r.id !== changingReservation?.roomId)
                    .map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        Hab. {r.roomNumber} — Piso {r.floor} ({r.roomType?.name || r.roomTypeId})
                      </SelectItem>
                    ))
                  }
                  {changeRoomOptions.filter(r => r.id !== changingReservation?.roomId).length === 0 && (
                    <SelectItem value="_none" disabled>Sin disponibilidad para esas fechas</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {changingReservation && !changingReservation.finalRatePerNight && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Esta reserva no tiene tarifa asignada. Luego de cambiar la habitación, editá la reserva para ingresar la tarifa correcta.</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangingReservation(null); setChangeRoomId(""); }}>
              Cancelar
            </Button>
            <Button
              disabled={!changeRoomId || changeRoomMutation.isPending}
              onClick={() => {
                if (!changingReservation || !changeRoomId) return;
                const selectedRoom = changeRoomOptions.find(r => r.id === changeRoomId);
                changeRoomMutation.mutate({
                  reservationId: changingReservation.id,
                  roomId: changeRoomId,
                  roomTypeId: selectedRoom?.roomTypeId || changingReservation.roomTypeId,
                });
              }}
              data-testid="button-confirm-change-room"
            >
              {changeRoomMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cambiando...</>
              ) : (
                "Confirmar cambio"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
