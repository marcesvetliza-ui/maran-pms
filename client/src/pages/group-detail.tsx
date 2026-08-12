import { useState, useEffect } from "react";
import { fmtMoney, getArgentinaToday } from "@/lib/utils";

/** Strip machine-readable transfer/reversal tags from a charge description before display. */
function stripTransferTags(description: string): string {
  return description
    .replace(/\s*\[xfer:[^\]]+\]/g, "")
    .replace(/\s*\[corr:[^\]]+\]/g, "")
    .replace(/\s*\[res:[^\]]+\]/g, "")
    .trim();
}
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
  ShoppingCart,
  Pencil,
  Unlink,
  Clock,
  FileX,
  Undo2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmitirFacturaDialog, NotaCreditoDialog } from "./billing";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { queryClient, apiRequest, parseApiError } from "@/lib/queryClient";
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
  cuenta_corriente: "Cuenta Corriente",
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
  const [availableCount, setAvailableCount] = useState<number | null>(null);

  const { data: roomTypes } = useQuery<RoomType[]>({
    queryKey: ["/api/room-types"],
  });

  const fetchAvailability = async (rtId: string, ci: string, co: string) => {
    if (!rtId || !ci || !co || co <= ci) { setAvailableCount(null); return; }
    try {
      const res = await fetch(`/api/rooms/available?checkIn=${ci}&checkOut=${co}&roomTypeId=${rtId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAvailableCount(Array.isArray(data) ? data.length : null);
      }
    } catch { setAvailableCount(null); }
  };

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
        agreedRate: agreedRate || null,
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
    onError: (e: any) => {
      toast({ title: "Error al agregar bloque", description: parseApiError(e), variant: "destructive" });
    },
  });

  const handleRatePlanChange = (planId: string) => {
    setRatePlanId(planId);
    const plan = ratePlans?.find(p => p.id === planId);
    if (plan) {
      setAgreedRate(plan.baseRate);
    }
  };

  const handleSaveBlock = () => {
    if (useCustomDates && blockCheckInDate && blockCheckOutDate && blockCheckOutDate <= blockCheckInDate) {
      toast({ title: "Fechas inválidas", description: "El check-out debe ser posterior al check-in.", variant: "destructive" });
      return;
    }
    createMutation.mutate();
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
              <Select value={roomTypeId} onValueChange={(v) => {
                setRoomTypeId(v);
                const ci = useCustomDates ? blockCheckInDate : group.checkInDate;
                const co = useCustomDates ? blockCheckOutDate : group.checkOutDate;
                fetchAvailability(v, ci, co);
              }}>
                <SelectTrigger data-testid="select-block-room-type">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes?.filter(rt => rt.id).map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name} ({rt.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>
                Cantidad *
                {availableCount !== null && (
                  <span className={`ml-1 font-normal text-xs ${availableCount === 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    ({availableCount} disponibles)
                  </span>
                )}
              </Label>
              <Input
                type="number"
                min={1}
                max={availableCount ?? undefined}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                data-testid="input-block-quantity"
                className={availableCount !== null && quantity > availableCount ? 'border-destructive' : ''}
              />
              {availableCount !== null && quantity > availableCount && (
                <p className="text-xs text-destructive mt-1">Supera la disponibilidad actual</p>
              )}
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
                  {ratePlans?.filter(rp => rp.id).map((rp) => (
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
            onClick={handleSaveBlock}
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

type AssignRow = {
  reservationId: string | null;
  roomId: string;
  originalRoomId: string;
  firstName: string;
  lastName: string;
};

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
  const placeholderCode = `GROUP-${group.id}`;

  const defaultCheckIn = block.blockCheckInDate || group.checkInDate;
  const defaultCheckOut = block.blockCheckOutDate || group.checkOutDate;

  // Distribute reservations across same-type blocks sequentially
  const sameTypeBlocks = [...group.blocks]
    .filter(b => b.roomTypeId === block.roomTypeId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const blockIndex = sameTypeBlocks.findIndex(b => b.id === block.id);
  let offset = 0;
  for (let i = 0; i < blockIndex; i++) offset += sameTypeBlocks[i].quantity;

  const allActiveOfType = group.reservations.filter(r => {
    const rTypeId = r.room?.roomTypeId ?? (r as any).roomTypeId;
    return rTypeId === block.roomTypeId && !["cancelled", "checked_out"].includes(r.status);
  });
  const thisBlockReservations = allActiveOfType.slice(offset, offset + block.quantity);
  // A reservation is a placeholder if it has no guestId (new approach) or still uses the
  // legacy shared group guest (older reservations created before the per-room fix).
  const isPlaceholder = (r: any) => !r.guestId || r.guest?.codigo === placeholderCode;
  const placeholderReservations = thisBlockReservations.filter(r => isPlaceholder(r));
  const realAssignedCount = thisBlockReservations.filter(r => !isPlaceholder(r)).length;
  const emptyCount = Math.max(0, block.quantity - thisBlockReservations.length);

  const [rows, setRows] = useState<AssignRow[]>(() => [
    ...placeholderReservations.map(res => ({
      reservationId: res.id,
      roomId: res.roomId || "",
      originalRoomId: res.roomId || "",
      firstName: "",
      lastName: "",
    })),
    ...Array.from({ length: emptyCount }, () => ({
      reservationId: null,
      roomId: "",
      originalRoomId: "",
      firstName: "",
      lastName: "",
    })),
  ]);

  const { data: availableRooms = [] } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms/available", defaultCheckIn, defaultCheckOut, block.roomTypeId, group.id],
    queryFn: async () => {
      const params = new URLSearchParams({
        checkIn: defaultCheckIn,
        checkOut: defaultCheckOut,
        roomTypeId: block.roomTypeId,
        groupId: group.id,
      });
      const res = await fetch(`/api/rooms/available?${params}`);
      if (!res.ok) throw new Error("Error al cargar habitaciones");
      return res.json();
    },
    enabled: !!defaultCheckIn && !!defaultCheckOut,
  });

  // For placeholder rows, always include the current pre-assigned room in options
  const getRoomOptions = (row: AssignRow): RoomWithType[] => {
    if (!row.originalRoomId) return availableRooms;
    const alreadyIn = availableRooms.some(r => r.id === row.originalRoomId);
    if (alreadyIn) return availableRooms;
    const preAssignedRes = placeholderReservations.find(r => r.id === row.reservationId);
    if (preAssignedRes?.room) return [...availableRooms, preAssignedRes.room as RoomWithType];
    return availableRooms;
  };

  const allChosenRoomIds = rows.map(r => r.roomId).filter(Boolean);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAssignAll = async () => {
    const validRows = rows.filter(r => r.roomId && r.firstName.trim());
    if (validRows.length === 0) {
      toast({
        title: "Completá al menos un nombre de pasajero",
        description: "Ingresá el nombre para al menos una habitación.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const row of validRows) {
      try {
        if (row.reservationId) {
          await apiRequest("PATCH", `/api/groups/${group.id}/placeholder-reservations/${row.reservationId}`, {
            guestFirstName: row.firstName.trim(),
            guestLastName: row.lastName.trim(),
            roomId: row.roomId !== row.originalRoomId ? row.roomId : undefined,
          });
        } else {
          await apiRequest("POST", `/api/groups/${group.id}/assign-room`, {
            roomId: row.roomId,
            guestFirstName: row.firstName.trim(),
            guestLastName: row.lastName.trim(),
            ratePlanId: block.ratePlanId,
            checkInDate: defaultCheckIn,
            checkOutDate: defaultCheckOut,
            agreedRate: block.agreedRate,
          });
        }
        successCount++;
      } catch (err: any) {
        failCount++;
        errors.push(parseApiError(err));
      }
    }

    setIsSubmitting(false);
    queryClient.invalidateQueries({ queryKey: ["/api/groups", group.id] });
    queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
    queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/planning" });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });

    if (failCount === 0) {
      toast({ title: `${successCount} pasajero(s) asignado(s) exitosamente` });
      onSuccess();
      onOpenChange(false);
    } else {
      const uniqueErrors = [...new Set(errors)];
      toast({
        title: `${successCount > 0 ? `${successCount} asignados, ` : ""}${failCount} no pudo(n) asignarse`,
        description: uniqueErrors.length > 0 ? uniqueErrors[0] : undefined,
        variant: "destructive",
      });
    }
  };

  const fmtDate = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString("es-AR");
  };

  const totalPending = rows.length;
  const allDone = totalPending === 0 && realAssignedCount === block.quantity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Asignar Pasajeros — {block.roomType?.name}
          </DialogTitle>
          <DialogDescription>
            Bloque de {block.quantity} hab.
            {realAssignedCount > 0 && ` · ${realAssignedCount} con pasajero asignado`}
            {placeholderReservations.length > 0 && ` · ${placeholderReservations.length} pendientes de pasajero`}
            {emptyCount > 0 && ` · ${emptyCount} sin habitación pre-asignada`}
            {defaultCheckIn && ` · ${fmtDate(defaultCheckIn)} → ${fmtDate(defaultCheckOut)}`}
          </DialogDescription>
          {placeholderReservations.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-3 py-2 text-xs text-green-800 dark:text-green-200 mt-1">
              <span className="mt-0.5">✓</span>
              <span>Habitaciones <strong>pre-asignadas automáticamente</strong>. Completá el nombre del pasajero para cada una. Podés cambiar la habitación si necesitás.</span>
            </div>
          )}
          {emptyCount > 0 && placeholderReservations.length === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 mt-1">
              <span className="mt-0.5">⚠</span>
              <span>No hay suficientes habitaciones disponibles para pre-asignar. Seleccioná manualmente la habitación y el pasajero.</span>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-3 py-2">
          {allDone ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p>Todos los pasajeros del bloque están asignados.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>Habitación</span>
                <span>Nombre</span>
                <span>Apellido</span>
                <span></span>
              </div>
              {rows.map((row, index) => {
                const roomOptions = getRoomOptions(row);
                const otherChosenRoomIds = allChosenRoomIds.filter((id, i) => i !== index);
                return (
                  <div key={row.reservationId ?? `new-${index}`} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-center">
                    <Select
                      value={row.roomId}
                      onValueChange={(value) => {
                        const updated = [...rows];
                        updated[index] = { ...updated[index], roomId: value };
                        setRows(updated);
                      }}
                    >
                      <SelectTrigger data-testid={`select-room-${index}`}>
                        <SelectValue placeholder="Seleccionar hab." />
                      </SelectTrigger>
                      <SelectContent>
                        {roomOptions
                          .filter(r => r.id && (!otherChosenRoomIds.includes(r.id) || r.id === row.roomId))
                          .sort((a, b) => parseInt(a.roomNumber) - parseInt(b.roomNumber))
                          .map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              Hab. {room.roomNumber} — Piso {room.floor}
                              {row.originalRoomId === room.id ? " ★" : ""}
                            </SelectItem>
                          ))
                        }
                        {roomOptions.filter(r => !otherChosenRoomIds.includes(r.id) || r.id === row.roomId).length === 0 && (
                          <SelectItem value="_none" disabled>Sin disponibilidad</SelectItem>
                        )}
                      </SelectContent>
                    </Select>

                    <Input
                      placeholder="Nombre"
                      value={row.firstName}
                      name={`passenger-firstname-${index}`}
                      autoComplete="off"
                      onChange={(e) => {
                        const updated = [...rows];
                        updated[index] = { ...updated[index], firstName: e.target.value };
                        setRows(updated);
                      }}
                      data-testid={`input-firstname-${index}`}
                    />

                    <Input
                      placeholder="Apellido"
                      value={row.lastName}
                      name={`passenger-lastname-${index}`}
                      autoComplete="off"
                      onChange={(e) => {
                        const updated = [...rows];
                        updated[index] = { ...updated[index], lastName: e.target.value };
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
                );
              })}

              {/* Show add-row button only for empty slots (no placeholder) */}
              {rows.filter(r => !r.reservationId).length < emptyCount &&
               rows.filter(r => !r.reservationId).length < availableRooms.length && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setRows([...rows, { reservationId: null, roomId: "", originalRoomId: "", firstName: "", lastName: "" }])}
                  data-testid="button-add-assignment-row"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Agregar habitación manualmente
                </Button>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {!allDone && rows.length > 0 && (
            <Button
              onClick={handleAssignAll}
              disabled={isSubmitting || rows.every(r => !r.firstName.trim())}
              data-testid="button-confirm-assign-all"
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
              ) : (
                `Guardar ${rows.filter(r => r.firstName.trim()).length} pasajero(s)`
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
  const today = getArgentinaToday();
  
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
  const [groupPaymentCcEntityType, setGroupPaymentCcEntityType] = useState<"company" | "agency">("company");
  const [groupPaymentCcEntityId, setGroupPaymentCcEntityId] = useState("");
  const [showGroupFacturaDialog, setShowGroupFacturaDialog] = useState(false);
  const [pendingGroupPaymentId, setPendingGroupPaymentId] = useState<string>("");
  const [groupFacturaFromResumen, setGroupFacturaFromResumen] = useState(false);
  const [showCancelledRes, setShowCancelledRes] = useState(false);

  // Cambiar habitación
  const [changingReservation, setChangingReservation] = useState<ReservationWithDetails | null>(null);
  const [changeRoomId, setChangeRoomId] = useState("");

  // Cargo individual a una reserva del grupo
  const [chargingReservation, setChargingReservation] = useState<ReservationWithDetails | null>(null);
  const [indivChargePreset, setIndivChargePreset] = useState("");
  const [indivChargeDesc, setIndivChargeDesc] = useState("");
  const [indivChargeAmount, setIndivChargeAmount] = useState("");
  const [indivChargeQty, setIndivChargeQty] = useState(1);
  const [indivChargeCategory, setIndivChargeCategory] = useState("otros");

  // Folio Grupal state
  const [showAddGroupChargeDialog, setShowAddGroupChargeDialog] = useState(false);
  const [showFolioPaymentDialog, setShowFolioPaymentDialog] = useState(false);
  const [folioChargeDescription, setFolioChargeDescription] = useState("");
  const [folioChargeAmount, setFolioChargeAmount] = useState("");
  const [folioChargeDate, setFolioChargeDate] = useState(getArgentinaToday());
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
  const [masterPaymentRows, setMasterPaymentRows] = useState<Array<{method: string; amount: string; reference: string}>>([{method: "cash", amount: "", reference: ""}]);
  const [masterPaymentReference, setMasterPaymentReference] = useState("");
  const [masterPaymentReceiptType, setMasterPaymentReceiptType] = useState("none");
  const [showMasterFacturaDialog, setShowMasterFacturaDialog] = useState(false);
  const [pendingMasterPaymentId, setPendingMasterPaymentId] = useState<string>("");
  const [masterPaymentCcEntityType, setMasterPaymentCcEntityType] = useState<"company" | "agency">("company");
  const [masterPaymentCcEntityId, setMasterPaymentCcEntityId] = useState("");
  // NC dialog: invoice DB id from the payment's invoiceRef
  const [ncInvoiceId, setNcInvoiceId] = useState<number | null>(null);
  // Delete group charge confirmation
  const [deletingGroupChargeId, setDeletingGroupChargeId] = useState<string | null>(null);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);

  // Edit rate + late checkout
  const [editingRateRes, setEditingRateRes] = useState<ReservationWithDetails | null>(null);
  const [editingRate, setEditingRate] = useState("");
  const [editingLateCheckout, setEditingLateCheckout] = useState(false);
  const [editingLateCheckoutTime, setEditingLateCheckoutTime] = useState("");
  const [editingPassengerRes, setEditingPassengerRes] = useState<ReservationWithDetails | null>(null);
  const [editPassengerFirst, setEditPassengerFirst] = useState("");
  const [editPassengerLast, setEditPassengerLast] = useState("");

  // Unassign confirmation
  const [unassignResId, setUnassignResId] = useState<string | null>(null);
  // Delete master payment confirmation
  const [deletingMasterPaymentId, setDeletingMasterPaymentId] = useState<string | null>(null);

  const { data: group, isLoading } = useQuery<GroupWithDetails>({
    queryKey: ["/api/groups", groupId],
  });

  const { data: bedTypesList } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/bed-types"],
  });

  const { data: billingConfig } = useQuery<any>({
    queryKey: ["/api/billing/config"],
  });

  const { data: companies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/companies"],
  });

  const { data: agencies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/agencies"],
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

  const { data: directInvoices = [] } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "direct-invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/direct-invoices`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: chargeTypesData = [] } = useQuery<{ id: string; label: string; description: string; defaultAmount: string; category: string }[]>({
    queryKey: ["/api/charge-types"],
  });
  const chargePresets = [
    ...chargeTypesData.map(ct => ({ label: ct.label, description: ct.description, amount: String(ct.defaultAmount), category: ct.category })),
    { label: "Cargo personalizado", description: "", amount: "", category: "otros" },
  ];

  const addIndividualChargeMutation = useMutation({
    mutationFn: async ({ reservationId, description, amount, category }: { reservationId: string; description: string; amount: string; category: string }) => {
      const todayStr = getArgentinaToday();
      return apiRequest("POST", "/api/charges", { reservationId, description, amount, category, date: todayStr });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
      toast({ title: "Cargo agregado a la reserva" });
      setChargingReservation(null);
      setIndivChargePreset("");
      setIndivChargeDesc("");
      setIndivChargeAmount("");
      setIndivChargeQty(1);
      setIndivChargeCategory("otros");
    },
    onError: (e: any) => {
      toast({ title: "Error al agregar cargo", description: parseApiError(e), variant: "destructive" });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (blockId: string) => apiRequest("DELETE", `/api/group-blocks/${blockId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      toast({ title: "Bloque eliminado" });
      setDeleteBlockId(null);
    },
    onError: (e: any) => {
      toast({ title: "Error al eliminar bloque", description: parseApiError(e), variant: "destructive" });
    },
  });

  const updateRateMutation = useMutation({
    mutationFn: ({ reservationId, rate, lateCheckOut, lateCheckOutTime }: { reservationId: string; rate: string; lateCheckOut: boolean; lateCheckOutTime: string }) =>
      apiRequest("PATCH", `/api/groups/${groupId}/reservations/${reservationId}/rate`, {
        finalRatePerNight: rate,
        lateCheckOut,
        lateCheckOutTime: lateCheckOutTime || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      toast({ title: "Tarifa y late checkout actualizados" });
      setEditingRateRes(null);
      setEditingRate("");
      setEditingLateCheckout(false);
      setEditingLateCheckoutTime("");
    },
    onError: (e: any) => {
      toast({ title: "Error al actualizar tarifa", description: parseApiError(e), variant: "destructive" });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (reservationId: string) => apiRequest("DELETE", `/api/groups/${groupId}/reservations/${reservationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      toast({ title: "Habitación desasignada del grupo" });
      setUnassignResId(null);
    },
    onError: (e: any) => {
      toast({ title: "No se puede desasignar", description: parseApiError(e), variant: "destructive" });
      setUnassignResId(null);
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
      toast({ title: "Error al cambiar habitación", description: parseApiError(err), variant: "destructive" });
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
    onError: (e: any) => {
      setShowCheckInConfirm(false);
      toast({ title: "Error en check-in grupal", description: parseApiError(e), variant: "destructive" });
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
    onError: (e: any) => {
      setShowCheckOutConfirm(false);
      toast({ title: "Error en check-out grupal", description: parseApiError(e), variant: "destructive" });
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
        ...(groupPaymentMethod === "cuenta_corriente"
          ? { ccEntityType: groupPaymentCcEntityType, ccEntityId: groupPaymentCcEntityId }
          : {}),
      });
    },
    onSuccess: async (res) => {
      const data = await res.json().catch(() => ({}));
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === "/api/planning"
      });

      const needsFactura = groupPaymentReceiptType === "factura_a" || groupPaymentReceiptType === "factura_b";
      const needsVoucher = groupPaymentReceiptType === "cierre_habitacion";

      if (needsFactura || needsVoucher) {
        // Close the payment dialog and open the invoice dialog with the payment ID
        setShowGroupPaymentDialog(false);
        setPendingGroupPaymentId(data.paymentId ? String(data.paymentId) : "");
        setShowGroupFacturaDialog(true);
        return;
      }

      if (groupPaymentCloseAll) {
        if (data.balanceDiff && Math.abs(data.balanceDiff) > 0.01) {
          toast({
            title: "Pago registrado con diferencia",
            description: `Diferencia de $${fmtMoney(Math.abs(data.balanceDiff))} ${data.balanceDiff > 0 ? "(pagó de más)" : "(saldo pendiente)"}`,
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
      setGroupPaymentCcEntityType("company");
      setGroupPaymentCcEntityId("");
      if (showInvoiceDialog) {
        loadInvoice();
      }
    },
    onError: (e: any) => {
      toast({ title: "Error al registrar pago grupal", description: parseApiError(e), variant: "destructive" });
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
      setFolioChargeDate(getArgentinaToday());
      setFolioChargeCategory("otros");
    },
    onError: (e: any) => toast({ title: "Error al agregar cargo", description: parseApiError(e), variant: "destructive" }),
  });

  const deleteGroupChargeMutation = useMutation({
    mutationFn: (chargeId: string) => apiRequest("DELETE", `/api/groups/${groupId}/charges/${chargeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      toast({ title: "Cargo eliminado" });
    },
    onError: (e: any) => toast({ title: "Error al eliminar cargo", description: parseApiError(e), variant: "destructive" }),
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
    onError: (e: any) => toast({ title: "Error al registrar pago", description: parseApiError(e), variant: "destructive" }),
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
    onError: (e: any) => toast({ title: "Error al transferir cargo", description: parseApiError(e), variant: "destructive" }),
  });

  const reverseGroupChargeMutation = useMutation({
    mutationFn: (chargeId: string) =>
      apiRequest("POST", `/api/groups/${groupId}/reverse-transfer-charge`, { chargeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
      toast({ title: "Cargo revertido correctamente" });
    },
    onError: (e: any) => toast({ title: "Error al revertir cargo", description: parseApiError(e), variant: "destructive" }),
  });

  const updateMasterFolioConfigMutation = useMutation({
    mutationFn: (config: MasterFolioConfig) =>
      apiRequest("PATCH", `/api/groups/${groupId}`, { masterFolioConfig: config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      toast({ title: "Configuración del Folio Maestro actualizada" });
    },
    onError: (e: any) => toast({ title: "Error al actualizar configuración", description: parseApiError(e), variant: "destructive" }),
  });

  const masterPaymentMutation = useMutation({
    mutationFn: () => {
      const validRows = masterPaymentRows.filter(r => parseFloat(r.amount || "0") > 0);
      if (validRows.length === 0 && masterPaymentReceiptType !== "factura_mipyme_a") {
        throw new Error("Ingresá al menos un monto");
      }
      return apiRequest("POST", `/api/groups/${groupId}/master-payment`, {
        paymentRows: validRows.length > 0 ? validRows.map(r => ({
          method: r.method,
          amount: r.amount,
          reference: masterPaymentReference || undefined,
        })) : [{ method: masterPaymentRows[0].method, amount: "0", reference: masterPaymentReference || undefined }],
        receiptType: masterPaymentReceiptType,
        billingEntityType: masterPaymentReceiptType !== "none" ? masterPaymentCcEntityType : undefined,
        billingEntityId: masterPaymentReceiptType !== "none" ? masterPaymentCcEntityId : undefined,
      });
    },
    onSuccess: async (res) => {
      const data = await res.json().catch(() => ({}));
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });

      const needsFactura = ["factura_a", "factura_b", "factura_mipyme_a"].includes(masterPaymentReceiptType);
      if (needsFactura) {
        setShowMasterPaymentDialog(false);
        setPendingMasterPaymentId(data.paymentId ? String(data.paymentId) : "");
        setShowMasterFacturaDialog(true);
        return;
      }

      toast({ title: "Pago al Folio Maestro registrado exitosamente" });
      setShowMasterPaymentDialog(false);
      setMasterPaymentRows([{method: "cash", amount: "", reference: ""}]);
      setMasterPaymentReference("");
      setMasterPaymentReceiptType("none");
    },
    onError: (e: any) => toast({ title: "Error al registrar pago maestro", description: parseApiError(e), variant: "destructive" }),
  });

  const deleteMasterPaymentMutation = useMutation({
    mutationFn: (paymentId: string) =>
      apiRequest("DELETE", `/api/groups/${groupId}/master-payments/${paymentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      toast({ title: "Pago eliminado del Folio Maestro" });
      setDeletingMasterPaymentId(null);
    },
    onError: (e: any) => {
      toast({ title: "Error al eliminar pago", description: parseApiError(e), variant: "destructive" });
      setDeletingMasterPaymentId(null);
    },
  });

  const updatePassengerMutation = useMutation({
    mutationFn: ({ reservationId, firstName, lastName }: { reservationId: string; firstName: string; lastName: string }) =>
      apiRequest("PATCH", `/api/groups/${groupId}/placeholder-reservations/${reservationId}`, {
        guestFirstName: firstName,
        guestLastName: lastName,
      }),
    onSuccess: () => {
      // refetch (not just invalidate) so the rooming list updates immediately
      queryClient.refetchQueries({ queryKey: ["/api/groups", groupId] });
      toast({ title: "Nombre de pasajero actualizado" });
      setEditingPassengerRes(null);
    },
    onError: (e: any) => toast({ title: "Error al actualizar el nombre", description: parseApiError(e), variant: "destructive" }),
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

  const bedTypeMap: Record<string, string> = {};
  (bedTypesList || []).forEach(bt => { bedTypeMap[bt.id] = bt.name; });

  const getBedLabel = (res: any) => {
    // Primero: tipo de camaje elegido al hacer/editar la reserva
    if (res.bedTypeNotes) return res.bedTypeNotes;
    // Fallback: tipo de cama por defecto de la habitación
    const btId = res.room?.bedTypeId;
    if (btId && bedTypeMap[btId]) return bedTypeMap[btId];
    return "-";
  };

  const printRoomingList = () => {
    if (!group) return;
    const sortedReservations = [...group.reservations]
      .filter(r => r.status !== "cancelled")
      .sort((a, b) => (a.room?.roomNumber || "").localeCompare(b.room?.roomNumber || ""));

    const rows = sortedReservations.map((res, idx) => {
      const companions: any[] = (res as any).companions || [];
      const lateCheckout = (res as any).lateCheckOut;
      const lateCheckoutTime = (res as any).lateCheckOutTime;
      const mainRow = `
      <tr>
        <td style="padding:6px 8px;border-bottom:${companions.length > 0 ? 'none' : '1px solid #ddd'};text-align:center;">${idx + 1}</td>
        <td style="padding:6px 8px;border-bottom:${companions.length > 0 ? 'none' : '1px solid #ddd'};font-weight:bold;">${res.room?.roomNumber || "-"}</td>
        <td style="padding:6px 8px;border-bottom:${companions.length > 0 ? 'none' : '1px solid #ddd'};">${getBedLabel(res)}</td>
        <td style="padding:6px 8px;border-bottom:${companions.length > 0 ? 'none' : '1px solid #ddd'};">${res.guest?.codigo?.startsWith("GROUP-") ? ((res as any).guestName || "") : ((res.guest?.lastName || "") + " " + (res.guest?.firstName || "")).trim() || ((res as any).guestName || "")}</td>
        <td style="padding:6px 8px;border-bottom:${companions.length > 0 ? 'none' : '1px solid #ddd'};font-size:11px;">${res.guest?.documentNumber ? `${res.guest?.documentType || "DOC"}: ${res.guest?.documentNumber}` : "-"}</td>
        <td style="padding:6px 8px;border-bottom:${companions.length > 0 ? 'none' : '1px solid #ddd'};">${fmtDate(res.checkInDate)}</td>
        <td style="padding:6px 8px;border-bottom:${companions.length > 0 ? 'none' : '1px solid #ddd'};">${lateCheckout ? `${fmtDate(res.checkOutDate)} <span style="background:#fef3c7;color:#92400e;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px;">LATE${lateCheckoutTime ? ' ' + lateCheckoutTime : ''}</span>` : fmtDate(res.checkOutDate)}</td>
        <td style="padding:6px 8px;border-bottom:${companions.length > 0 ? 'none' : '1px solid #ddd'};font-size:11px;max-width:120px;">${res.notes || ""}</td>
      </tr>`;
      const companionRows = companions.map((c: any) => `
      <tr style="background:#f9f9f9;">
        <td style="padding:4px 8px;border-bottom:1px solid #ddd;"></td>
        <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;color:#666;">↳ Hab. ${res.room?.roomNumber || "-"}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;color:#888;">Acompañante</td>
        <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;">${c.lastName || ""} ${c.firstName || ""}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;">${c.documentNumber ? `${c.documentType || "DOC"}: ${c.documentNumber}` : "-"}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #ddd;"></td>
        <td style="padding:4px 8px;border-bottom:1px solid #ddd;"></td>
        <td style="padding:4px 8px;border-bottom:1px solid #ddd;font-size:11px;">${c.notes || ""}</td>
      </tr>`).join("");
      return mainRow + companionRows;
    }).join("");

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
        <th>Camaje</th>
        <th>Hu&eacute;sped</th>
        <th>Documento</th>
        <th>Check-in</th>
        <th>Check-out</th>
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
            <div
              className="w-5 h-5 rounded-full flex-shrink-0 border-2 border-white shadow-sm"
              style={{ backgroundColor: (group as any).color || '#6366f1' }}
              title="Color del grupo"
            />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-group-name">
              {group.name}
            </h1>
            <GroupStatusBadge status={group.status} />
          </div>
          <p className="text-muted-foreground font-mono">{group.groupCode}</p>
        </div>
        
        {/* Mass Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          {group.reservations.some(r => (r.status === "confirmed" || r.status === "web_checkin" || r.status === "pending") && r.checkInDate <= today) && (
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
            {isLoadingInvoice ? "Cargando..." : "Resumen del Grupo"}
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
            {(group as any).billingEntityType && (group as any).billingEntityId && (() => {
              const list = (group as any).billingEntityType === 'agency'
                ? (agencies as any[])
                : (companies as any[]);
              const entity = list.find((e: any) => e.id === (group as any).billingEntityId);
              const label = (group as any).billingEntityType === 'agency' ? 'Agencia' : 'Empresa';
              const entityName = entity
                ? (entity.razonSocial || entity.nombreFantasia || entity.name || entity.id)
                : '...';
              return (
                <div className="mt-2 pt-2 border-t">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label} de facturación</p>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {entityName}
                  </p>
                </div>
              );
            })()}
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
              <span className={`text-3xl font-bold ${group.blocks.length > 0 && group.assignedRooms > group.totalRooms ? "text-destructive" : ""}`}>
                {group.assignedRooms}
              </span>
              {group.blocks.length > 0 ? (
                <span className="text-muted-foreground">/ {group.totalRooms} bloqueadas</span>
              ) : (
                <span className="text-muted-foreground">asignadas</span>
              )}
            </div>
            {group.blocks.length > 0 && group.assignedRooms > group.totalRooms && (
              <div className="mt-1 flex items-center gap-1 text-sm text-destructive font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Excede el bloque en {group.assignedRooms - group.totalRooms} habitación(es). Agregue un bloque adicional.</span>
              </div>
            )}
            {group.blocks.length === 0 && group.assignedRooms === 0 && (
              <div className="mt-1 text-sm text-muted-foreground">
                Sin habitaciones asignadas aún.
              </div>
            )}
            {group.blocks.length > 0 && group.totalRooms > group.assignedRooms && (
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
              {(() => {
                const activeRes = group.reservations.filter(r => r.status !== "cancelled");
                const cancelledRes = group.reservations.filter(r => r.status === "cancelled");
                const renderTable = (rows: typeof group.reservations) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Ocupante</TableHead>
                        <TableHead>Habitación</TableHead>
                        <TableHead>Fechas</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Tarifa</TableHead>
                        {masterFolio && masterFolio.config !== "none" && <TableHead className="text-right text-xs">Saldo indiv.</TableHead>}
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((res) => (
                      <TableRow 
                        key={res.id} 
                        data-testid={`row-reservation-${res.id}`}
                        className="group/row cursor-pointer hover:bg-accent"
                        onClick={() => window.open(`/reservations?view=${res.id}`, '_blank')}
                      >
                        <TableCell className="font-mono text-sm">{res.reservationCode}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span>
                              {res.guestId && res.guest?.firstName && !res.guest?.codigo?.startsWith("GROUP-")
                                ? `${res.guest?.lastName || ""} ${res.guest?.firstName || ""}`.trim()
                                : (res as any).guestName || <span className="text-muted-foreground italic">{group?.name || "Sin asignar"}</span>}
                            </span>
                            <button
                              className="opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                              title="Editar nombre del pasajero"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPassengerRes(res);
                                // Pre-fill only from real (non-placeholder) guests
                                const isRealGuest = res.guestId && !res.guest?.codigo?.startsWith("GROUP-");
                                setEditPassengerFirst(isRealGuest ? (res.guest?.firstName || "") : "");
                                setEditPassengerLast(isRealGuest ? (res.guest?.lastName || "") : "");
                              }}
                              data-testid={`button-edit-passenger-${res.id}`}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        </TableCell>
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
                          <div className="flex items-center gap-1.5">
                            {res.finalRatePerNight
                              ? `$${fmtMoney(res.finalRatePerNight)}`
                              : <span className="text-destructive font-medium">Sin tarifa</span>
                            }
                            {(res as any).lateCheckOut && (
                              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                LATE{(res as any).lateCheckOutTime ? ` ${(res as any).lateCheckOutTime}` : ""}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {masterFolio && masterFolio.config !== "none" && (() => {
                          const roomData = masterFolio.rooms.find((r: any) => r.reservationId === res.id);
                          const bal = roomData ? roomData.individualBalance : null;
                          return (
                            <TableCell className="text-right text-sm" onClick={(e) => e.stopPropagation()}>
                              {bal !== null ? (
                                <span className={`font-semibold ${bal > 0.01 ? "text-red-600" : "text-green-600"}`}>
                                  ${bal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          );
                        })()}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1 flex-wrap">
                            {!["checked_in", "checked_out", "cancelled"].includes(res.status) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => { setChangingReservation(res); setChangeRoomId(""); }}
                                data-testid={`button-change-room-${res.id}`}
                                title="Cambiar habitación"
                              >
                                <ArrowLeftRight className="h-3 w-3 mr-1" />
                                Cambiar
                              </Button>
                            )}
                            {!["checked_out", "cancelled"].includes(res.status) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950/30"
                                onClick={() => {
                                  setEditingRateRes(res);
                                  setEditingRate(res.finalRatePerNight || "");
                                  setEditingLateCheckout(!!(res as any).lateCheckOut);
                                  setEditingLateCheckoutTime((res as any).lateCheckOutTime || "");
                                }}
                                data-testid={`button-edit-rate-${res.id}`}
                                title="Editar tarifa y late checkout"
                              >
                                <Pencil className="h-3 w-3 mr-1" />
                                Tarifa
                              </Button>
                            )}
                            {!["cancelled"].includes(res.status) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2 text-primary border-primary/40 hover:bg-primary/5"
                                onClick={() => { setChargingReservation(res); setIndivChargePreset(""); setIndivChargeDesc(""); setIndivChargeAmount(""); setIndivChargeQty(1); setIndivChargeCategory("otros"); }}
                                data-testid={`button-add-charge-${res.id}`}
                                title="Agregar cargo a esta reserva"
                              >
                                <ShoppingCart className="h-3 w-3 mr-1" />
                                Cargo
                              </Button>
                            )}
                            {["confirmed", "pending", "tentative"].includes(res.status) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setUnassignResId(res.id)}
                                data-testid={`button-unassign-${res.id}`}
                                title="Desasignar del grupo (cancela la reserva)"
                              >
                                <Unlink className="h-3 w-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => window.open(`/reservations?view=${res.id}`, '_blank')}
                              data-testid={`button-view-reservation-${res.id}`}
                              title="Ver detalle de reserva (nueva pestaña)"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
                return (
                  <div className="space-y-4">
                    {activeRes.length > 0 ? renderTable(activeRes) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users2 className="h-10 w-10 text-muted-foreground/50" />
                        <p className="mt-2 text-sm text-muted-foreground">
                          No hay reservas activas. Use los bloques para asignar habitaciones.
                        </p>
                      </div>
                    )}
                    {cancelledRes.length > 0 && (
                      <div>
                        <button
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                          onClick={() => setShowCancelledRes(v => !v)}
                          data-testid="button-toggle-cancelled-res"
                        >
                          <ChevronRight className={`h-4 w-4 transition-transform ${showCancelledRes ? "rotate-90" : ""}`} />
                          Canceladas ({cancelledRes.length})
                        </button>
                        {showCancelledRes && (
                          <div className="mt-2 opacity-60">
                            {renderTable(cancelledRes)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
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
                        {/* Bug 12: PDF dropdown consolidating all print options */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" data-testid="button-folio-pdf">
                              <FileDown className="h-4 w-4 mr-1" />
                              Consultas
                              <ChevronDown className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              const a = document.createElement("a");
                              a.href = `/api/groups/${groupId}/master-folio/pdf`;
                              a.download = `folio-maestro-${group?.name || groupId}.pdf`;
                              document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            }}>
                              <FileDown className="h-4 w-4 mr-2" />Folio Maestro PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowRoomingListDialog(true)}>
                              <Printer className="h-4 w-4 mr-2" />Rooming List
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          size="sm"
                          onClick={() => {
                            const balance = masterFolio.masterBalance;
                            setMasterPaymentRows([{method: "cash", amount: balance > 0 ? String(balance.toFixed(2)) : "", reference: ""}]);
                            setMasterPaymentReceiptType("none");
                            // Pre-fill billing entity from group config
                            if ((group as any)?.billingEntityType && (group as any)?.billingEntityId) {
                              setMasterPaymentCcEntityType((group as any).billingEntityType as "company" | "agency");
                              setMasterPaymentCcEntityId((group as any).billingEntityId);
                            }
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
                                <span className="font-medium">{stripTransferTags(gc.description)}</span>
                                <span className="text-xs text-muted-foreground">{fmtDate(gc.date)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">${parseFloat(gc.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                <Button
                                  variant="ghost" size="icon" className="h-6 w-6"
                                  title="Revertir cargo"
                                  onClick={() => reverseGroupChargeMutation.mutate(gc.id)}
                                  disabled={reverseGroupChargeMutation.isPending}
                                  data-testid={`button-reverse-group-charge-${gc.id}`}
                                >
                                  <Undo2 className="h-3 w-3 text-orange-500" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="h-6 w-6"
                                  onClick={() => setDeletingGroupChargeId(gc.id)}
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

                    {/* Pagos al folio maestro — Bug 7+8: show entity + receipt type for ALL payments */}
                    {masterFolio.groupPayments.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pagos recibidos del organizador</p>
                        <div className="rounded-md border divide-y">
                          {masterFolio.groupPayments.map((gp: any, gpIdx: number) => {
                            // Bug 8: parse invoice badge (shown for electronic comprobantes)
                            const invoiceRefParsed = (() => {
                              if (!gp.invoiceRef) return null;
                              try { return JSON.parse(gp.invoiceRef); } catch { return null; }
                            })();
                            const invoiceBadge = invoiceRefParsed
                              ? `${invoiceRefParsed.tipo_comprobante ?? "FAC"} ${String(invoiceRefParsed.punto_venta ?? "").padStart(4, "0")}-${String(invoiceRefParsed.numero ?? "").padStart(8, "0")}`
                              : null;
                            const ncRefParsed = (() => {
                              if (!gp.invoiceNcRef) return null;
                              try { return JSON.parse(gp.invoiceNcRef); } catch { return null; }
                            })();
                            const ncBadge = ncRefParsed
                              ? `${ncRefParsed.tipo_comprobante ?? "NC"} ${String(ncRefParsed.punto_venta ?? "").padStart(4, "0")}-${String(ncRefParsed.numero ?? "").padStart(8, "0")}`
                              : null;
                            // Bug 8: for non-electronic payments, show receipt type as badge
                            const receiptLabel = invoiceBadge ? null
                              : (!gp.receiptType || gp.receiptType === "none") ? `Adelanto Grupos #${gpIdx + 1}`
                              : gp.receiptType === "factura_a" ? "Factura A"
                              : gp.receiptType === "factura_b" ? "Factura B"
                              : gp.receiptType === "factura_t" ? "Factura T"
                              : gp.receiptType === "factura_mipyme_a" ? "MiPyme A"
                              : gp.receiptType;
                            // Bug 7: resolve entity name from companies/agencies
                            const entityName = (() => {
                              if (!gp.billingEntityId) return null;
                              const list = gp.billingEntityType === "agency" ? agencies : companies;
                              const found = (list as any[]).find((e: any) => e.id === gp.billingEntityId);
                              return found ? (found.razonSocial || found.nombreFantasia) : null;
                            })();
                            // NC button: show only when there's an invoice with a known DB id and no NC yet
                            const canEmitNc = invoiceRefParsed?.id && !ncRefParsed;
                            return (
                              <div key={gp.id} className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`row-group-payment-${gp.id}`}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-muted-foreground">{fmtDate(gp.date)}</span>
                                  <Badge variant="secondary">{PAYMENT_METHOD_LABELS[gp.method] || gp.method}</Badge>
                                  {/* Bug 8: receipt type for all comprobantes */}
                                  {receiptLabel && (
                                    <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
                                      <Receipt className="h-3 w-3" />
                                      {receiptLabel}
                                    </Badge>
                                  )}
                                  {invoiceBadge && (
                                    <Badge variant="outline" className="text-xs font-mono gap-1 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">
                                      <Receipt className="h-3 w-3" />
                                      {invoiceBadge}
                                    </Badge>
                                  )}
                                  {/* NC badge: shown when a nota de crédito has already been emitted */}
                                  {ncBadge && (
                                    <Badge variant="outline" className="text-xs font-mono gap-1 border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400">
                                      <FileX className="h-3 w-3" />
                                      {ncBadge}
                                    </Badge>
                                  )}
                                  {/* Bug 7: entity name */}
                                  {entityName && (
                                    <span className="text-xs text-muted-foreground">→ {entityName}</span>
                                  )}
                                  {gp.reference && <span className="text-xs text-muted-foreground italic">{gp.reference}</span>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  {/* NC button: only for payments with an emitted invoice and no NC yet */}
                                  {canEmitNc && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 px-2 text-xs text-orange-600 border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/20"
                                      onClick={() => setNcInvoiceId(invoiceRefParsed.id)}
                                      data-testid={`btn-nc-group-payment-${gp.id}`}
                                    >
                                      <FileX className="h-3 w-3 mr-1" />
                                      NC
                                    </Button>
                                  )}
                                  {!gp.invoiceRef && !gp.invoiceNcRef && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                      onClick={() => setDeletingMasterPaymentId(gp.id)}
                                      data-testid={`btn-delete-group-payment-${gp.id}`}
                                      title="Anular pago"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <span className="font-semibold text-green-600">${parseFloat(gp.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                </div>
                              </div>
                            );
                          })}
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
                                          <span>{stripTransferTags(c.description)}</span>
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
                              {Array.isArray(r.individualPayments) && r.individualPayments.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pagos individuales recibidos</p>
                                  <div className="rounded-md border divide-y">
                                    {r.individualPayments.map((p: any) => {
                                      const invoiceBadge = (() => {
                                        if (!p.invoiceRef) return null;
                                        try {
                                          const ref = JSON.parse(p.invoiceRef);
                                          return `${ref.tipo_comprobante ?? "FAC"} ${String(ref.punto_venta ?? "").padStart(4, "0")}-${String(ref.numero ?? "").padStart(8, "0")}`;
                                        } catch { return null; }
                                      })();
                                      return (
                                        <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-muted-foreground">{fmtDate(p.date)}</span>
                                            <Badge variant="secondary">{PAYMENT_METHOD_LABELS[p.method] || p.method}</Badge>
                                            {invoiceBadge && (
                                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-mono">
                                                {invoiceBadge}
                                              </Badge>
                                            )}
                                          </div>
                                          <span className="font-medium text-green-600">${p.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                        </div>
                                      );
                                    })}
                                    {r.individualPayments.length > 1 && (
                                      <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold border-t bg-muted/30">
                                        <span>Total pagado</span>
                                        <span className="text-green-600">${r.individualPayments.reduce((s: number, p: any) => s + p.amount, 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                      </div>
                                    )}
                                  </div>
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

                  {/* Anulaciones / Reversiones NC */}
                  {folio && folio.voidMovements.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <FileX className="h-3.5 w-3.5 text-orange-500" />
                        Anulaciones de pagos (NC)
                      </p>
                      <div className="rounded-lg border border-orange-200 dark:border-orange-800 divide-y divide-orange-100 dark:divide-orange-900 overflow-hidden">
                        {folio.voidMovements.map((vm) => (
                          <div
                            key={vm.id}
                            className="flex items-center justify-between px-3 py-2 text-sm bg-orange-50/60 dark:bg-orange-950/10"
                            data-testid={`row-void-movement-${vm.id}`}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-300 dark:border-orange-700 text-xs">
                                <FileX className="h-3 w-3 mr-1" />
                                Anulación
                              </Badge>
                              <span className="font-medium text-xs">Hab. {vm.roomNumber}</span>
                              {vm.guestName && <span className="text-muted-foreground text-xs">{vm.guestName}</span>}
                              <span className="text-xs text-muted-foreground">{vm.description}</span>
                              {vm.voidReason && (
                                <span className="text-xs text-orange-600 dark:text-orange-400 italic">— {vm.voidReason}</span>
                              )}
                            </div>
                            <span className="font-semibold text-orange-600 dark:text-orange-400 tabular-nums whitespace-nowrap">
                              +${parseFloat(vm.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                        {folio.voidMovements.length > 1 && (
                          <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold bg-orange-100/60 dark:bg-orange-900/20 border-t border-orange-200 dark:border-orange-800">
                            <span className="text-orange-700 dark:text-orange-300">Total anulado</span>
                            <span className="text-orange-600 dark:text-orange-400 tabular-nums">
                              +${folio.voidMovementsTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Facturas directas del grupo (emitidas desde el Resumen sin pago asociado) */}
                  {directInvoices.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5 text-emerald-500" />
                        Comprobantes emitidos para el grupo
                      </p>
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 divide-y divide-emerald-100 dark:divide-emerald-900 overflow-hidden">
                        {directInvoices.map((inv: any) => {
                          const parsed = (() => { try { return JSON.parse(inv.invoiceRef); } catch { return null; } })();
                          // invoiceRef is the camelCase Drizzle salesInvoices record returned by emitirFactura
                          const badge = parsed
                            ? `${parsed.tipoComprobante ?? "FAC"} ${String(parsed.puntoVenta ?? "").padStart(4, "0")}-${String(parsed.numero ?? "").padStart(8, "0")}`
                            : "Comprobante";
                          const total = parsed?.montoTotal ?? null;
                          const cae = parsed?.cae;
                          return (
                            <div key={inv.id} className="flex items-center justify-between px-3 py-2 text-sm bg-emerald-50/50 dark:bg-emerald-950/10" data-testid={`row-direct-invoice-${inv.id}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-muted-foreground text-xs">{new Date(inv.createdAt).toLocaleDateString("es-AR")}</span>
                                <Badge variant="outline" className="text-xs font-mono gap-1 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">
                                  <Receipt className="h-3 w-3" />
                                  {badge}
                                </Badge>
                                {cae && (
                                  <span className="text-xs text-muted-foreground font-mono">CAE: {cae}</span>
                                )}
                                {inv.notes && (
                                  <span className="text-xs text-muted-foreground italic">{inv.notes}</span>
                                )}
                              </div>
                              {total != null && (
                                <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                                  ${parseFloat(total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
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
                        {folio.voidMovementsTotal > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">Anulaciones</p>
                            <p className="font-bold text-orange-600">+${folio.totals.voids.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
                          </div>
                        )}
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
              Resumen del Grupo - {invoiceData?.group?.name}
            </DialogTitle>
            <DialogDescription>
              Código: {invoiceData?.group?.code} | {fmtDate(invoiceData?.group?.checkInDate || "")} - {fmtDate(invoiceData?.group?.checkOutDate || "")}
              <span className="block mt-1 text-muted-foreground text-xs">
                Resumen informativo del folio grupal. Use el botón "Emitir Factura" para emitir el comprobante electrónico en ARCA.
              </span>
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
                    <p className="font-medium">{fmtDate(invoiceData.group.checkInDate)} - {fmtDate(invoiceData.group.checkOutDate)}</p>
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
                          {res.balance > 0 ? `Pendiente: $${fmtMoney(res.balance)}` : "Pagado"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Alojamiento ({res.nights} x ${fmtMoney(res.ratePerNight)})</span>
                        <span className="font-medium">${fmtMoney(res.accommodationTotal)}</span>
                      </div>
                      
                      {res.charges.length > 0 && (
                        <div className="pl-4 border-l-2 border-muted space-y-1">
                          <p className="text-muted-foreground">Consumos:</p>
                          {res.charges.map((c: any, i: number) => (
                            <div key={i} className="flex justify-between">
                              <span>{stripTransferTags(c.description)}</span>
                              <span>${fmtMoney(c.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-medium">
                            <span>Subtotal consumos</span>
                            <span>${fmtMoney(res.chargesTotal)}</span>
                          </div>
                        </div>
                      )}
                      
                      {res.payments.length > 0 && (
                        <div className="pl-4 border-l-2 border-green-500 space-y-1">
                          <p className="text-muted-foreground">Pagos:</p>
                          {res.payments.map((p: any, i: number) => (
                            <div key={i} className="flex justify-between text-green-600">
                              <span>{p.method} {p.reference && `(${p.reference})`}</span>
                              <span>-${fmtMoney(p.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-medium text-green-600">
                            <span>Total pagos</span>
                            <span>-${fmtMoney(res.paymentsTotal)}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Group-level charges (coffee, salons, etc.) */}
              {invoiceData.groupCharges && invoiceData.groupCharges.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Cargos Grupales</h3>
                  <Card className="print:border print:shadow-none">
                    <CardContent className="pt-4 space-y-1 text-sm">
                      {invoiceData.groupCharges.map((c: any, i: number) => (
                        <div key={i} className="flex justify-between">
                          <span>{stripTransferTags(c.description)}{c.category ? <span className="text-muted-foreground ml-1">({c.category})</span> : null}</span>
                          <span className="font-medium">${fmtMoney(c.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-semibold border-t pt-2 mt-1">
                        <span>Subtotal cargos grupales</span>
                        <span>${fmtMoney(invoiceData.totals.groupCharges)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Totals */}
              <Card className="bg-muted print:bg-transparent print:border-2">
                <CardContent className="pt-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Alojamiento</span>
                      <span className="font-medium">${fmtMoney(invoiceData.totals.accommodation)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Consumos por habitación</span>
                      <span className="font-medium">${fmtMoney(invoiceData.totals.charges)}</span>
                    </div>
                    {invoiceData.totals.groupCharges > 0 && (
                      <div className="flex justify-between">
                        <span>Cargos grupales</span>
                        <span className="font-medium">${fmtMoney(invoiceData.totals.groupCharges)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-green-600">
                      <span>Total Pagos</span>
                      <span className="font-medium">-${fmtMoney(invoiceData.totals.payments)}</span>
                    </div>
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Saldo Total</span>
                        <span className={invoiceData.totals.balance > 0 ? "text-destructive" : "text-green-600"}>
                          ${fmtMoney(invoiceData.totals.balance)}
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
            <Button variant="outline" onClick={printInvoice} data-testid="button-print-invoice">
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button
              onClick={() => {
                const balance = invoiceData?.totals?.balance ?? 0;
                setGroupPaymentReceiptType("factura_b");
                setGroupPaymentAmount(String(balance));
                setGroupPaymentCcEntityId("");
                setGroupPaymentCcEntityType("company");
                setPendingGroupPaymentId("");
                setGroupFacturaFromResumen(true);
                setShowGroupFacturaDialog(true);
              }}
              disabled={!invoiceData || (invoiceData?.totals?.balance ?? 0) <= 0}
              data-testid="button-emitir-factura-resumen"
            >
              <Receipt className="mr-2 h-4 w-4" />
              Emitir Factura
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
                    <TableHead>Camaje</TableHead>
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
                    .filter(r => r.status !== "cancelled")
                    .sort((a, b) => (a.room?.roomNumber || "").localeCompare(b.room?.roomNumber || ""))
                    .map((res, idx) => (
                      <TableRow key={res.id} data-testid={`row-rooming-${res.id}`}>
                        <TableCell className="font-medium">{idx + 1}</TableCell>
                        <TableCell className="font-bold">{res.room?.roomNumber}</TableCell>
                        <TableCell>{getBedLabel(res)}</TableCell>
                        <TableCell className="font-medium">
                          {res.guestId && res.guest?.firstName && !res.guest?.codigo?.startsWith("GROUP-")
                            ? `${res.guest?.lastName || ""} ${res.guest?.firstName || ""}`.trim()
                            : (res as any).guestName || <span className="text-muted-foreground italic">{group?.name || "Sin asignar"}</span>}
                        </TableCell>
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
                  Se realizará el check-in de <strong>{group.reservations.filter(r => ["confirmed", "web_checkin", "pending"].includes(r.status)).length}</strong> habitación(es) elegibles.
                  Las habitaciones pasarán a estado "ocupado".
                </p>
                <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                  <p className="font-medium text-foreground">Resumen del grupo:</p>
                  <p>Elegibles para check-in: {group.reservations.filter(r => ["confirmed", "web_checkin", "pending"].includes(r.status)).length}</p>
                  <p>Ya en casa: {group.reservations.filter(r => r.status === "checked_in").length}</p>
                  <p>Otras: {group.reservations.filter(r => !["confirmed", "web_checkin", "pending", "checked_in"].includes(r.status)).length}</p>
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
                  <SelectItem value="cierre_habitacion">Voucher Habitaciones</SelectItem>
                </SelectContent>
              </Select>
              {(groupPaymentReceiptType === "factura_a" || groupPaymentReceiptType === "factura_b") && (
                <p className="text-xs text-muted-foreground mt-1">
                  Al registrar el pago se abrirá el formulario de emisión con CAE real de ARCA.
                </p>
              )}
              {groupPaymentReceiptType === "factura_a" && groupPaymentMethod !== "cuenta_corriente" && (
                <div className="mt-2 space-y-2">
                  <Label className="text-xs text-muted-foreground">Empresa / Agencia (requerido para Factura A)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={groupPaymentCcEntityType} onValueChange={v => { setGroupPaymentCcEntityType(v as "company" | "agency"); setGroupPaymentCcEntityId(""); }}>
                      <SelectTrigger data-testid="select-group-factura-entity-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company">Empresa</SelectItem>
                        <SelectItem value="agency">Agencia</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={groupPaymentCcEntityId} onValueChange={setGroupPaymentCcEntityId}>
                      <SelectTrigger data-testid="select-group-factura-entity-id">
                        <SelectValue placeholder={groupPaymentCcEntityType === "company" ? "Seleccionar empresa..." : "Seleccionar agencia..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {(groupPaymentCcEntityType === "company" ? companies : agencies).map((e: any) => (
                          <SelectItem key={e.id} value={e.id}>{e.razonSocial || e.nombreFantasia || e.name || e.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!groupPaymentCcEntityId && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Seleccione una empresa o agencia para poder emitir Factura A.
                    </p>
                  )}
                </div>
              )}
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
              onClick={() => {
                if (groupPaymentMethod === "cuenta_corriente" && !groupPaymentCcEntityId) {
                  toast({ title: `Seleccione ${groupPaymentCcEntityType === "company" ? "una empresa" : "una agencia"}`, variant: "destructive" });
                  return;
                }
                groupPaymentMutation.mutate();
              }}
              disabled={!groupPaymentAmount || !groupPaymentMethod || groupPaymentMutation.isPending || (groupPaymentReceiptType === "factura_a" && !groupPaymentCcEntityId)}
              data-testid="button-confirm-group-payment"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {groupPaymentMutation.isPending ? "Procesando..." : groupPaymentCloseAll ? "Pagar y Cerrar Grupo" : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showGroupFacturaDialog && (
        <EmitirFacturaDialog
          open={showGroupFacturaDialog}
          onClose={() => {
            setShowGroupFacturaDialog(false);
            setPendingGroupPaymentId("");
            setGroupFacturaFromResumen(false);
          }}
          config={billingConfig}
          allowedTipos={groupPaymentReceiptType === "factura_a" ? ["FA"] : groupPaymentReceiptType === "cierre_habitacion" ? ["cierre_habitacion"] : ["FB"]}
          compactMode={!groupFacturaFromResumen && !!(groupPaymentCcEntityId || groupPaymentReceiptType !== "factura_a")}
          initialValues={(() => {
            const condicionIvaMap: Record<string, string> = {
              responsable_inscripto: "Responsable Inscripto",
              consumidor_final: "Consumidor Final",
              monotributo: "Monotributista",
              monotributista: "Monotributista",
              exento: "Exento",
            };
            const entityList = groupPaymentCcEntityType === "company" ? companies : agencies;
            const entity = (groupPaymentMethod === "cuenta_corriente" || groupPaymentReceiptType === "factura_a") && groupPaymentCcEntityId
              ? (entityList as any[]).find((e: any) => e.id === groupPaymentCcEntityId)
              : null;
            return {
              razonSocial: entity
                ? (entity.razonSocial ?? entity.nombreFantasia ?? group?.name ?? "")
                : (group?.name ?? ""),
              cuit: entity?.cuilCuit ? String(entity.cuilCuit).replace(/-/g, "") : undefined,
              condicionIva: entity?.condicionIva
                ? (condicionIvaMap[entity.condicionIva] ?? entity.condicionIva)
                : (entity?.cuilCuit ? "Responsable Inscripto" : undefined),
              domicilio: entity?.direccion ?? entity?.domicilio ?? undefined,
              items: [{ descripcion: `Pago grupal — ${group?.name ?? ""}`, precioUnitario: parseFloat(groupPaymentAmount) || 0 }],
            };
          })()}
          paymentId={pendingGroupPaymentId || undefined}
          groupId={groupFacturaFromResumen ? groupId : undefined}
          onSuccess={() => {
            setShowGroupFacturaDialog(false);
            setGroupFacturaFromResumen(false);
            setPendingGroupPaymentId("");
            setGroupPaymentAmount("");
            setGroupPaymentMethod("");
            setGroupPaymentReference("");
            setGroupPaymentReceiptType("");
            setGroupPaymentDistribution("equal");
            setGroupPaymentCloseAll(false);
            setGroupPaymentCcEntityType("company");
            setGroupPaymentCcEntityId("");
            queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "direct-invoices"] });
            if (showInvoiceDialog) {
              loadInvoice();
            }
            if (groupPaymentCloseAll) {
              toast({ title: "Pago grupal registrado — grupo cerrado" });
            } else if (groupFacturaFromResumen) {
              toast({ title: "Factura emitida y vinculada al folio del grupo" });
            } else {
              toast({ title: "Pago grupal registrado exitosamente" });
            }
          }}
        />
      )}

      {/* ─── Dialog: Pago al Folio Maestro ─── */}
      <Dialog open={showMasterPaymentDialog} onOpenChange={(open) => {
        setShowMasterPaymentDialog(open);
        if (!open) {
          setMasterPaymentRows([{method: "cash", amount: "", reference: ""}]);
          setMasterPaymentReceiptType("none");
          setMasterPaymentCcEntityType("company");
          setMasterPaymentCcEntityId("");
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              Pago al Folio Maestro
            </DialogTitle>
            <DialogDescription>
              Los pagos se distribuyen proporcionalmente entre las habitaciones activas del grupo.
            </DialogDescription>
          </DialogHeader>
          {masterFolio && (() => {
            const isFiscal = masterPaymentReceiptType !== "none";
            const selectedEntity = masterPaymentCcEntityId
              ? (masterPaymentCcEntityType === "company" ? companies : agencies as any[]).find((e: any) => e.id === masterPaymentCcEntityId) ?? null
              : null;
            const condIva = selectedEntity?.condicionIva ?? "";
            const isRI = condIva === "responsable_inscripto" || condIva === "exento";
            const allowFT = masterFolio.config === "accommodation";
            const { other: _excl, ...methodsWithoutOther } = PAYMENT_METHOD_LABELS;
            const allowedMethods = masterPaymentReceiptType === "factura_t"
              ? { credit_card: "Tarjeta Crédito", debit_card: "Tarjeta Débito", cuenta_corriente: "Cuenta Corriente" }
              : methodsWithoutOther;
            const rowsTotal = masterPaymentRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
            const isMipyme = masterPaymentReceiptType === "factura_mipyme_a";
            const isFiscalAndNeedsEntity = isFiscal && !masterPaymentCcEntityId;
            const rowsHaveAmount = masterPaymentRows.some(r => parseFloat(r.amount || "0") > 0);
            const canSubmit = !masterPaymentMutation.isPending
              && (isMipyme ? !isFiscalAndNeedsEntity : (rowsHaveAmount && !isFiscalAndNeedsEntity));

            return (
              <div className="space-y-4">
                {/* Balance summary */}
                <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total del Folio Maestro</span>
                    <span className="font-semibold">${masterFolio.masterTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  {masterFolio.masterPaid > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ya pagado / adelantos</span>
                      <span className="font-semibold text-green-600">${masterFolio.masterPaid.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Saldo pendiente</span>
                    <span className={masterFolio.masterBalance > 0.01 ? "text-red-600" : "text-green-600"}>
                      ${masterFolio.masterBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* 1. Comprobante fiscal — elegir primero */}
                <div>
                  <Label>Comprobante</Label>
                  <Select value={masterPaymentReceiptType} onValueChange={(v) => {
                    setMasterPaymentReceiptType(v);
                    // Bug 1: fiscal + advances → suggest full total
                    if (v !== "none" && masterFolio.masterPaid > 0) {
                      setMasterPaymentRows(prev => prev.map((r, i) => i === 0 ? { ...r, amount: String(masterFolio.masterTotal.toFixed(2)) } : r));
                    } else if (v === "none") {
                      setMasterPaymentRows(prev => prev.map((r, i) => i === 0 ? { ...r, amount: masterFolio.masterBalance > 0 ? String(masterFolio.masterBalance.toFixed(2)) : "" } : r));
                    }
                  }}>
                    <SelectTrigger data-testid="select-master-payment-receipt-type">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Adelanto Grupos (sin comprobante fiscal)</SelectItem>
                      {/* Bug 5: filter by entity condicionIva when entity selected; if no entity, show all */}
                      {(!masterPaymentCcEntityId || isRI) && <SelectItem value="factura_a">Factura A</SelectItem>}
                      {(!masterPaymentCcEntityId || !isRI) && <SelectItem value="factura_b">Factura B</SelectItem>}
                      {(!masterPaymentCcEntityId || isRI) && <SelectItem value="factura_mipyme_a">Factura MiPyme A</SelectItem>}
                      {allowFT && <SelectItem value="factura_t">Factura T (solo alojamiento)</SelectItem>}
                    </SelectContent>
                  </Select>
                  {isMipyme && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      MiPyme A: no requiere forma de pago (cobro diferido hasta 30 días).
                    </p>
                  )}
                </div>

                {/* 2. Empresa / Agencia — para todos los comprobantes fiscales */}
                {isFiscal && (
                  <div>
                    <Label>Empresa / Agencia receptora</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={masterPaymentCcEntityType} onValueChange={v => { setMasterPaymentCcEntityType(v as "company" | "agency"); setMasterPaymentCcEntityId(""); }}>
                        <SelectTrigger data-testid="select-master-cc-entity-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="company">Empresa</SelectItem>
                          <SelectItem value="agency">Agencia</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={masterPaymentCcEntityId} onValueChange={setMasterPaymentCcEntityId}>
                        <SelectTrigger data-testid="select-master-cc-entity-id">
                          <SelectValue placeholder={masterPaymentCcEntityType === "company" ? "Seleccionar empresa..." : "Seleccionar agencia..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {(masterPaymentCcEntityType === "company" ? companies : agencies as any[]).map((e: any) => (
                            <SelectItem key={e.id} value={e.id}>{e.razonSocial || e.nombreFantasia || e.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedEntity && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {({
                          responsable_inscripto: "Responsable Inscripto",
                          consumidor_final: "Consumidor Final",
                          monotributo: "Monotributista",
                          monotributista: "Monotributista",
                          exento: "Exento",
                        } as Record<string, string>)[selectedEntity.condicionIva] ?? selectedEntity.condicionIva}
                        {selectedEntity.cuilCuit && ` — CUIT: ${selectedEntity.cuilCuit}`}
                      </p>
                    )}
                    {isFiscalAndNeedsEntity && (
                      <p className="text-xs text-amber-600 mt-1">Seleccioná la empresa o agencia receptora del comprobante.</p>
                    )}
                    {["factura_a", "factura_b", "factura_mipyme_a"].includes(masterPaymentReceiptType) && masterPaymentCcEntityId && (
                      <p className="text-xs text-muted-foreground mt-1">Al registrar se abrirá el formulario de emisión ARCA.</p>
                    )}
                  </div>
                )}

                {/* 3. Monto — después de elegir comprobante (Bug 1 + 4) */}
                {!isMipyme && (
                  <div>
                    <Label>Monto a pagar</Label>
                    {isFiscal && masterFolio.masterPaid > 0 && (
                      <p className="text-xs text-amber-600 mb-1">
                        Existen adelantos previos. La factura debe cubrir el total del folio ({fmtMoney(masterFolio.masterTotal)}).
                      </p>
                    )}
                  </div>
                )}

                {/* 4. Método(s) de pago — después del comprobante (Bug 3 + 4) */}
                {!isMipyme && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Método(s) de pago</Label>
                      {masterPaymentRows.length < 4 && (
                        <Button variant="outline" size="sm" type="button"
                          onClick={() => setMasterPaymentRows(prev => [...prev, {method: "cash", amount: "", reference: ""}])}>
                          <Plus className="h-3.5 w-3.5 mr-1" />Agregar método
                        </Button>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Referencia / Observaciones del comprobante</Label>
                      <Input
                        placeholder="Nro. de transferencia, cheque, etc. (opcional)"
                        className="h-9 mt-1"
                        value={masterPaymentReference}
                        onChange={e => setMasterPaymentReference(e.target.value)}
                        data-testid="input-master-payment-reference"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">Método — Monto</div>
                    {masterPaymentRows.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                        <div className="col-span-6">
                          <Select value={row.method} onValueChange={v => setMasterPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, method: v} : r))}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(allowedMethods)
                                .filter(([k]) => k === row.method || !masterPaymentRows.some((r, i) => i !== idx && r.method === k))
                                .map(([k, v]) => (
                                  <SelectItem key={k} value={k}>{v as string}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-5">
                          <Input type="number" step="0.01" placeholder="Monto" className="h-9"
                            value={row.amount}
                            data-testid={idx === 0 ? "input-master-payment-amount" : undefined}
                            onChange={e => setMasterPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, amount: e.target.value} : r))} />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          {masterPaymentRows.length > 1 && (
                            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-muted-foreground hover:text-red-500"
                              onClick={() => setMasterPaymentRows(prev => prev.filter((_, i) => i !== idx))}>
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {masterPaymentRows.length > 1 && (
                      <div className="flex justify-between text-sm font-semibold border-t pt-2">
                        <span>Total:</span>
                        <span>${rowsTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMasterPaymentDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => masterPaymentMutation.mutate()}
              disabled={!masterFolio || masterPaymentMutation.isPending
                || (masterPaymentReceiptType !== "factura_mipyme_a"
                    && !masterPaymentRows.some(r => parseFloat(r.amount || "0") > 0))
                || (masterPaymentReceiptType !== "none" && !masterPaymentCcEntityId)}
              data-testid="button-confirm-master-payment"
            >
              {masterPaymentMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</> : "Registrar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showMasterFacturaDialog && (() => {
        const condicionIvaMap: Record<string, string> = {
          responsable_inscripto: "Responsable Inscripto",
          consumidor_final: "Consumidor Final",
          monotributo: "Monotributista",
          monotributista: "Monotributista",
          exento: "Exento",
        };
        const entityList = masterPaymentCcEntityType === "company" ? companies : agencies;
        const entity = masterPaymentCcEntityId
          ? (entityList as any[]).find((e: any) => e.id === masterPaymentCcEntityId) ?? null
          : null;
        const totalPaid = masterPaymentRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
        const allowedTiposMap: Record<string, string[]> = {
          factura_a: ["FA"],
          factura_b: ["FB"],
          factura_mipyme_a: ["FM"],
          factura_t: ["FT"],
        };
        return (
          <EmitirFacturaDialog
            open={showMasterFacturaDialog}
            onClose={() => {
              setShowMasterFacturaDialog(false);
              setPendingMasterPaymentId("");
            }}
            config={billingConfig}
            allowedTipos={allowedTiposMap[masterPaymentReceiptType] ?? ["FB"]}
            lockCondicionIva={!!entity}
            compactMode={!!entity}
            hideAddItems
            initialValues={{
              razonSocial: entity
                ? (entity.razonSocial ?? entity.nombreFantasia ?? group?.name ?? "")
                : (group?.name ?? ""),
              cuit: entity?.cuilCuit ? String(entity.cuilCuit).replace(/-/g, "") : undefined,
              condicionIva: entity?.condicionIva
                ? (condicionIvaMap[entity.condicionIva] ?? entity.condicionIva)
                : undefined,
              domicilio: entity?.direccion ?? entity?.domicilio ?? undefined,
              items: [{ descripcion: `Pago Folio Maestro — ${group?.name ?? ""}`, precioUnitario: totalPaid || 0 }],
            }}
            paymentId={pendingMasterPaymentId || undefined}
            onSuccess={() => {
              setShowMasterFacturaDialog(false);
              setPendingMasterPaymentId("");
              setMasterPaymentRows([{method: "cash", amount: "", reference: ""}]);
              setMasterPaymentReceiptType("none");
              setMasterPaymentCcEntityType("company");
              setMasterPaymentCcEntityId("");
              queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
              toast({ title: "Pago al Folio Maestro registrado exitosamente" });
            }}
          />
        );
      })()}

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
                  Asignado: ${fmtMoney(Object.values(manualDistribution).reduce((a, b) => a + b, 0))}
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
              ¿Mover el cargo "{transferChargeTarget?.description}" (${fmtMoney(transferChargeTarget?.amount || "0")}) al folio del grupo?
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

      {/* ─── EDITAR TARIFA + LATE CHECKOUT ─── */}
      {/* Editar nombre de pasajero */}
      <Dialog open={!!editingPassengerRes} onOpenChange={(open) => { if (!open) setEditingPassengerRes(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar pasajero</DialogTitle>
            <DialogDescription>
              Hab. {editingPassengerRes?.room?.roomNumber} — {editingPassengerRes?.reservationCode}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                value={editPassengerFirst}
                onChange={e => setEditPassengerFirst(e.target.value)}
                placeholder="Nombre"
                data-testid="input-edit-passenger-first"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Apellido</Label>
              <Input
                value={editPassengerLast}
                onChange={e => setEditPassengerLast(e.target.value)}
                placeholder="Apellido"
                data-testid="input-edit-passenger-last"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPassengerRes(null)}>Cancelar</Button>
            <Button
              disabled={!editPassengerFirst.trim() || updatePassengerMutation.isPending}
              onClick={() => {
                if (!editingPassengerRes?.id) return;
                updatePassengerMutation.mutate({
                  reservationId: editingPassengerRes.id,
                  firstName: editPassengerFirst.trim(),
                  lastName: editPassengerLast.trim(),
                });
              }}
              data-testid="button-save-passenger"
            >
              {updatePassengerMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingRateRes} onOpenChange={(open) => { if (!open) { setEditingRateRes(null); setEditingRate(""); setEditingLateCheckout(false); setEditingLateCheckoutTime(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editar Tarifa — Hab. {editingRateRes?.room?.roomNumber}
            </DialogTitle>
            <DialogDescription>
              {editingRateRes?.guest?.lastName} {editingRateRes?.guest?.firstName} · {editingRateRes?.reservationCode}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="editing-rate">Tarifa por noche ($)</Label>
              <Input
                id="editing-rate"
                type="number"
                min="0"
                step="0.01"
                value={editingRate}
                onChange={(e) => setEditingRate(e.target.value)}
                placeholder="Ej: 25000"
                data-testid="input-editing-rate"
                className="mt-1"
              />
            </div>
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="late-checkout"
                  checked={editingLateCheckout}
                  onCheckedChange={(checked) => {
                    setEditingLateCheckout(!!checked);
                    if (!checked) setEditingLateCheckoutTime("");
                  }}
                  data-testid="checkbox-late-checkout"
                />
                <Label htmlFor="late-checkout" className="cursor-pointer flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  Late Check-out
                </Label>
              </div>
              {editingLateCheckout && (
                <div>
                  <Label htmlFor="late-checkout-time" className="text-sm text-muted-foreground">Hora de salida (opcional)</Label>
                  <Input
                    id="late-checkout-time"
                    type="time"
                    value={editingLateCheckoutTime}
                    onChange={(e) => setEditingLateCheckoutTime(e.target.value)}
                    className="mt-1 w-36"
                    data-testid="input-late-checkout-time"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRateRes(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!editingRateRes) return;
                updateRateMutation.mutate({
                  reservationId: editingRateRes.id,
                  rate: editingRate,
                  lateCheckOut: editingLateCheckout,
                  lateCheckOutTime: editingLateCheckoutTime,
                });
              }}
              disabled={updateRateMutation.isPending}
              data-testid="button-save-rate"
            >
              {updateRateMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DESASIGNAR HABITACIÓN ─── */}
      {/* ─── ANULAR PAGO MAESTRO ─── */}
      <AlertDialog open={!!deletingMasterPaymentId} onOpenChange={(open) => { if (!open) setDeletingMasterPaymentId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Anular pago del Folio Maestro
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará este pago y se revertirán los pagos individuales distribuidos a cada habitación. Esta acción no se puede deshacer. Solo es posible si el pago no tiene factura electrónica asociada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deletingMasterPaymentId) deleteMasterPaymentMutation.mutate(deletingMasterPaymentId); }}
              data-testid="button-confirm-delete-master-payment"
            >
              {deleteMasterPaymentMutation.isPending ? "Anulando..." : "Confirmar, anular pago"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── ELIMINAR CARGO GRUPAL ─── */}
      <AlertDialog open={!!deletingGroupChargeId} onOpenChange={(open) => { if (!open) setDeletingGroupChargeId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Eliminar cargo grupal
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>Se eliminará este cargo del Folio Maestro. Esta acción no se puede deshacer.</span>
              {masterFolio && (masterFolio.masterPaid > 0 || masterFolio.groupPayments?.some((gp: any) => gp.invoiceRef)) && (
                <span className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 mt-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {masterFolio.groupPayments?.some((gp: any) => gp.invoiceRef)
                      ? "Este folio tiene facturas electrónicas emitidas. Eliminar el cargo generará una diferencia contable."
                      : "Este folio ya tiene pagos registrados. Eliminar el cargo modificará el saldo pendiente."}
                  </span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deletingGroupChargeId) deleteGroupChargeMutation.mutate(deletingGroupChargeId); setDeletingGroupChargeId(null); }}
              data-testid="button-confirm-delete-group-charge"
            >
              {deleteGroupChargeMutation.isPending ? "Eliminando..." : "Confirmar, eliminar cargo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unassignResId} onOpenChange={(open) => { if (!open) setUnassignResId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlink className="h-5 w-5 text-destructive" />
              Desasignar habitación del grupo
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción cancela la reserva de la habitación y la libera del bloque grupal. No se puede deshacer fácilmente. ¿Confirmar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (unassignResId) unassignMutation.mutate(unassignResId); }}
              data-testid="button-confirm-unassign"
            >
              {unassignMutation.isPending ? "Desasignando..." : "Confirmar, desasignar"}
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
                <span className="ml-1 text-muted-foreground">· Tarifa: ${fmtMoney(changingReservation.finalRatePerNight)}/noche (se conserva)</span>
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
                    .filter(r => r.id && r.id !== changingReservation?.roomId
                      && (!changingReservation?.roomTypeId || r.roomTypeId === changingReservation?.roomTypeId))
                    .map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        Hab. {r.roomNumber} — Piso {r.floor} ({r.roomType?.name || r.roomTypeId})
                      </SelectItem>
                    ))
                  }
                  {changeRoomOptions.filter(r => r.id !== changingReservation?.roomId
                    && (!changingReservation?.roomTypeId || r.roomTypeId === changingReservation?.roomTypeId)).length === 0 && (
                    <SelectItem value="_none" disabled>Sin disponibilidad del mismo tipo de habitación</SelectItem>
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

      {/* ── Dialog: Agregar cargo individual a reserva del grupo ── */}
      <Dialog open={!!chargingReservation} onOpenChange={(open) => { if (!open) { setChargingReservation(null); setIndivChargePreset(""); setIndivChargeDesc(""); setIndivChargeAmount(""); setIndivChargeQty(1); setIndivChargeCategory("otros"); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Cargo a Reserva</DialogTitle>
            <DialogDescription>
              {chargingReservation && (
                <>Reserva <span className="font-mono font-medium">{chargingReservation.reservationCode}</span> — Hab. <strong>{chargingReservation.room?.roomNumber}</strong> · {chargingReservation.guest?.lastName} {chargingReservation.guest?.firstName}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Tipo de cargo</Label>
              <Select
                value={indivChargePreset}
                onValueChange={(val) => {
                  setIndivChargePreset(val);
                  const preset = chargePresets.find((_, i) => String(i) === val);
                  if (preset) {
                    setIndivChargeDesc(preset.description);
                    setIndivChargeAmount(preset.amount);
                    setIndivChargeCategory(preset.category);
                  }
                }}
              >
                <SelectTrigger data-testid="select-indiv-charge-preset">
                  <SelectValue placeholder="Seleccionar tipo de cargo..." />
                </SelectTrigger>
                <SelectContent>
                  {chargePresets.map((p, i) => (
                    <SelectItem key={i} value={String(i)}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Descripción *</Label>
              <Input
                value={indivChargeDesc}
                onChange={(e) => setIndivChargeDesc(e.target.value)}
                placeholder="Ej: Cochera, Desayuno, Minibar..."
                data-testid="input-indiv-charge-desc"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Importe unitario *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={indivChargeAmount}
                  onChange={(e) => setIndivChargeAmount(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-indiv-charge-amount"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Cantidad</Label>
                <Input
                  type="number"
                  min={1}
                  value={indivChargeQty}
                  onChange={(e) => setIndivChargeQty(parseInt(e.target.value) || 1)}
                  data-testid="input-indiv-charge-qty"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Categoría</Label>
              <Select value={indivChargeCategory} onValueChange={setIndivChargeCategory}>
                <SelectTrigger data-testid="select-indiv-charge-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="otros">Otros</SelectItem>
                  <SelectItem value="alimentos">Alimentos</SelectItem>
                  <SelectItem value="bebidas">Bebidas</SelectItem>
                  <SelectItem value="transporte">Transporte / Cochera</SelectItem>
                  <SelectItem value="spa">SPA</SelectItem>
                  <SelectItem value="lavanderia">Lavandería</SelectItem>
                  <SelectItem value="eventos">Eventos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {indivChargeDesc && indivChargeAmount && (
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                Total: <strong>${(parseFloat(indivChargeAmount || "0") * indivChargeQty).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChargingReservation(null)}>Cancelar</Button>
            <Button
              disabled={!indivChargeDesc.trim() || !indivChargeAmount || addIndividualChargeMutation.isPending}
              onClick={() => {
                if (!chargingReservation) return;
                const totalAmount = (parseFloat(indivChargeAmount) * indivChargeQty).toFixed(2);
                addIndividualChargeMutation.mutate({
                  reservationId: chargingReservation.id,
                  description: indivChargeDesc.trim(),
                  amount: totalAmount,
                  category: indivChargeCategory,
                });
              }}
              data-testid="button-confirm-indiv-charge"
            >
              {addIndividualChargeMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
              ) : (
                "Agregar Cargo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── NC Dialog: Nota de Crédito desde pago del Folio Maestro ─── */}
      {ncInvoiceId !== null && (
        <NotaCreditoDialog
          invoiceId={ncInvoiceId}
          onClose={() => setNcInvoiceId(null)}
          onSuccess={() => {
            // The server propagates invoice_nc_ref to the linked group_payment automatically.
            // Refresh master-folio so the NC badge appears and the NC button disappears.
            queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
          }}
        />
      )}

    </div>
  );
}
