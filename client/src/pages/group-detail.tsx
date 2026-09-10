import { useState, useEffect, useRef } from "react";
import { fmtMoney, getArgentinaToday } from "@/lib/utils";
import { formatHotelDateTime } from "@/lib/hotelTime";
import { getBedConfigLabel } from "@/lib/planning-utils";

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
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmitirFacturaDialog, NotaCreditoDialog } from "./billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_METHOD_LABELS, GroupPaymentHistoryRow } from "@/components/group-payment-history-row";
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
import {
  availableGroupInvoiceTotal,
  buildGroupInvoiceItems,
  exceedsGroupInvoiceAvailable,
  groupInvoicePaymentMatchesConcepts,
  groupPaymentConceptsMatchTotal,
  requiredGroupInvoiceCollection,
} from "@/lib/group-invoice-allocation";
import { GuestSearchCombobox } from "@/components/guest-search-combobox";
import {
  allocateBalanceCappedGroupRooms,
  resolveAutomaticGroupRoomAllocationMode,
} from "@shared/groupRoomAllocation";
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

const CONDICION_IVA_OPTIONS = [
  "Consumidor Final",
  "Responsable Inscripto",
  "Monotributista",
  "Exento",
  "No Responsable",
];

// Guests/companies/agencies persist Condición IVA in different shapes (snake_case
// enum values like "responsable_inscripto" for guests/companies/agencies vs. the
// display labels used by CONDICION_IVA_OPTIONS here). Any value coming from one of
// those records must go through this normalizer before it's used to drive the
// Select or the comprobante-type filter below, or it silently fails to match any
// option and the field looks blank/default instead of reflecting the real value.
const CONDICION_IVA_NORMALIZE_MAP: Record<string, string> = {
  responsable_inscripto: "Responsable Inscripto",
  consumidor_final: "Consumidor Final",
  monotributo: "Monotributista",
  monotributista: "Monotributista",
  exento: "Exento",
  no_responsable: "No Responsable",
};
function normalizeCondicionIva(raw: string | null | undefined): string {
  if (!raw) return "Consumidor Final";
  if (CONDICION_IVA_OPTIONS.includes(raw)) return raw;
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  return CONDICION_IVA_NORMALIZE_MAP[key] || "Consumidor Final";
}

type GItem = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  alicuotaIva: "21" | "10.5" | "exento" | "no_gravado";
  subtotalNeto: number;
  subtotal: number;
};
function gNewItem(): GItem {
  return { descripcion: "", cantidad: 1, precioUnitario: 0, alicuotaIva: "21", subtotalNeto: 0, subtotal: 0 };
}
function gUpdateItem(items: GItem[], idx: number, field: keyof GItem, value: any): GItem[] {
  const updated = [...items];
  const item = { ...updated[idx], [field]: value };
  const base = item.cantidad * item.precioUnitario;
  if (item.alicuotaIva === "21") { item.subtotalNeto = Number((base / 1.21).toFixed(2)); item.subtotal = base; }
  else if (item.alicuotaIva === "10.5") { item.subtotalNeto = Number((base / 1.105).toFixed(2)); item.subtotal = base; }
  else { item.subtotalNeto = base; item.subtotal = base; }
  updated[idx] = item;
  return updated;
}
function gItemsFromSimple(simples: Array<{ descripcion: string; precioUnitario: number }>): GItem[] {
  return simples.map(s => {
    const base = s.precioUnitario;
    return { descripcion: s.descripcion, cantidad: 1, precioUnitario: base, alicuotaIva: "21" as const, subtotalNeto: Number((base / 1.21).toFixed(2)), subtotal: base };
  });
}

/** Caja only receives tender rows; retentions and cuenta corriente settle the
 * document but do not represent an ingreso a Caja. */
const GROUP_CAJA_TENDER_METHODS = new Set(["cash", "transfer", "credit_card", "debit_card", "check"]);

export function calculateGroupCajaToday(rows: Array<{ method: string; amount?: string | number }>): number {
  return rows
    .filter((row) => GROUP_CAJA_TENDER_METHODS.has(row.method))
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar Bloque de Habitaciones</DialogTitle>
          <DialogDescription>
            Defina el tipo, cantidad y tarifa para este bloque
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-md border p-3 bg-muted/30">
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
  guestId: string | null;
  guestMode: "search" | "new";
};

export function AssignBlockDialog({
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
  // group_room_blocks.room_type_id is the canonical type for every row in
  // this dialog. Do not infer it from a possibly stale reservation join.
  const canonicalRoomTypeId = block.roomTypeId;

  // Distribute reservations across same-type blocks sequentially
  const sameTypeBlocks = [...group.blocks]
    .filter(b => b.roomTypeId === canonicalRoomTypeId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const blockIndex = sameTypeBlocks.findIndex(b => b.id === block.id);
  let offset = 0;
  for (let i = 0; i < blockIndex; i++) offset += sameTypeBlocks[i].quantity;

  const allActiveOfType = group.reservations.filter(r => {
    return r.roomTypeId === canonicalRoomTypeId && !["cancelled", "checked_out"].includes(r.status);
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
      guestId: null,
      guestMode: "search" as const,
    })),
    ...Array.from({ length: emptyCount }, () => ({
      reservationId: null,
      roomId: "",
      originalRoomId: "",
      firstName: "",
      lastName: "",
      guestId: null,
      guestMode: "search" as const,
    })),
  ]);

  const { data: availableRooms = [] } = useQuery<RoomWithType[]>({
    queryKey: ["/api/rooms/available", defaultCheckIn, defaultCheckOut, canonicalRoomTypeId, group.id],
    queryFn: async () => {
      const params = new URLSearchParams({
        checkIn: defaultCheckIn,
        checkOut: defaultCheckOut,
        roomTypeId: canonicalRoomTypeId,
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
    const validRows = rows.filter(r => r.roomId && (r.guestId || r.firstName.trim()));
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
            guestId: row.guestId || undefined,
            guestFirstName: row.firstName.trim(),
            guestLastName: row.lastName.trim(),
            roomId: row.roomId !== row.originalRoomId ? row.roomId : undefined,
            roomTypeId: canonicalRoomTypeId,
          });
        } else {
          await apiRequest("POST", `/api/groups/${group.id}/assign-room`, {
            roomId: row.roomId,
            roomTypeId: canonicalRoomTypeId,
            guestId: row.guestId || undefined,
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
              <div className="grid grid-cols-[1.3fr_2fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>Habitación</span>
                <span>Huésped</span>
                <span></span>
              </div>
              {rows.map((row, index) => {
                const roomOptions = getRoomOptions(row);
                const otherChosenRoomIds = allChosenRoomIds.filter((id, i) => i !== index);
                const updateRow = (changes: Partial<AssignRow>) => {
                  setRows((currentRows) => currentRows.map((currentRow, rowIndex) =>
                    rowIndex === index ? { ...currentRow, ...changes } : currentRow
                  ));
                };
                return (
                  <div key={row.reservationId ?? `new-${index}`} className="flex flex-col gap-0.5">
                    <div className="grid grid-cols-[1.3fr_2fr_auto] gap-2 items-start">
                    <Select
                      value={row.roomId}
                      onValueChange={(value) => {
                        updateRow({ roomId: value });
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

                    <div className="min-w-0">
                      {row.guestMode === "new" ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">Nuevo huésped</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-xs"
                              onClick={() => updateRow({ guestMode: "search", firstName: "", lastName: "", guestId: null })}
                              data-testid={`button-search-guest-${index}`}
                            >
                              <Search className="h-3 w-3 mr-1" />
                              Buscar existente
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              placeholder="Nombre"
                              value={row.firstName}
                              name={`passenger-firstname-${index}`}
                              autoComplete="off"
                              onChange={(e) => updateRow({ firstName: e.target.value })}
                              data-testid={`input-firstname-${index}`}
                            />
                            <Input
                              placeholder="Apellido"
                              value={row.lastName}
                              name={`passenger-lastname-${index}`}
                              autoComplete="off"
                              onChange={(e) => updateRow({ lastName: e.target.value })}
                              data-testid={`input-lastname-${index}`}
                            />
                          </div>
                        </div>
                      ) : (
                        <GuestSearchCombobox
                          label=""
                          selectedGuestId={row.guestId}
                          selectedGuestName={row.guestId ? `${row.lastName} ${row.firstName}`.trim() : null}
                          placeholder="Buscar nombre, apellido o documento..."
                          onGuestSelect={(guest) => updateRow({
                            guestId: guest.id,
                            firstName: guest.firstName,
                            lastName: guest.lastName || "",
                            guestMode: "search",
                          })}
                          onClear={() => updateRow({
                            guestId: null,
                            firstName: "",
                            lastName: "",
                            guestMode: "search",
                          })}
                          onCreateNew={(prefillName) => {
                            const parts = (prefillName || "").trim().split(/\s+/).filter(Boolean);
                            updateRow({
                              guestId: null,
                              guestMode: "new",
                              firstName: parts[0] || "",
                              lastName: parts.slice(1).join(" "),
                            });
                          }}
                          data-testid={`guest-selector-${index}`}
                        />
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setRows((currentRows) => currentRows.filter((_, i) => i !== index))}
                      title="Quitar fila"
                      data-testid={`button-remove-row-${index}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
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
                  onClick={() => setRows([...rows, { reservationId: null, roomId: "", originalRoomId: "", firstName: "", lastName: "", guestId: null, guestMode: "search" }])}
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
              disabled={isSubmitting || rows.every(r => !r.guestId && !r.firstName.trim())}
              data-testid="button-confirm-assign-all"
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</>
              ) : (
                `Guardar ${rows.filter(r => r.guestId || r.firstName.trim()).length} pasajero(s)`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function buildGroupInvoiceRecipientInitialValues({
  razonSocial,
  fallbackName,
  cuit,
  dni,
  condicionIva,
  domicilio,
}: {
  razonSocial: string;
  fallbackName?: string | null;
  cuit: string;
  dni: string;
  condicionIva: string;
  domicilio: string;
}) {
  return {
    razonSocial: razonSocial || fallbackName || "",
    cuit: cuit ? cuit.replace(/-/g, "") : undefined,
    dni: dni || undefined,
    condicionIva: condicionIva || undefined,
    domicilio: domicilio || undefined,
  };
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
  const [expandedGroupInvoiceId, setExpandedGroupInvoiceId] = useState<number | null>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);
  const [showRoomingListDialog, setShowRoomingListDialog] = useState(false);
  const [showCheckInConfirm, setShowCheckInConfirm] = useState(false);
  const [showCheckOutConfirm, setShowCheckOutConfirm] = useState(false);
  const [showGroupPaymentDialog, setShowGroupPaymentDialog] = useState(false);
  const [groupPaymentRows, setGroupPaymentRows] = useState<Array<{method: string; amount: string; reference: string; retencionEnabled?: boolean; retencionTipo?: "iibb" | "ganancias"; retencionMonto?: string}>>([{method: "cash", amount: "", reference: ""}]);
  const [groupPaymentReceiptType, setGroupPaymentReceiptType] = useState("sin_comprobante");
  const [groupPaymentDistribution, setGroupPaymentDistribution] = useState("equal");
  const [groupPaymentCloseAll, setGroupPaymentCloseAll] = useState(false);
  const [groupPaymentCloseReservationIds, setGroupPaymentCloseReservationIds] = useState<string[]>([]);
  const [groupPaymentCloseAmounts, setGroupPaymentCloseAmounts] = useState<Record<string, string>>({});
  const [groupPaymentDestino, setGroupPaymentDestino] = useState<"distribute" | "master">("distribute");
  const [groupPaymentCcEntityType, setGroupPaymentCcEntityType] = useState<"company" | "agency">("company");
  const [groupPaymentCcEntityId, setGroupPaymentCcEntityId] = useState("");
  // Receptor: huésped / empresa / agencia — fiscal data locked once selected
  const [groupPaymentReceptorType, setGroupPaymentReceptorType] = useState<"guest" | "company" | "agency">("company");
  const [groupPaymentReceptorLocked, setGroupPaymentReceptorLocked] = useState(false);
  const [groupPaymentGuestId, setGroupPaymentGuestId] = useState<string | null>(null);
  const [groupPaymentGuestNationality, setGroupPaymentGuestNationality] = useState("");
  const [groupPaymentGuestNationalityCode, setGroupPaymentGuestNationalityCode] = useState("");
  // POS-style receptor fields for Pago Grupal
  const [groupPaymentEntitySearch, setGroupPaymentEntitySearch] = useState("");
  const [groupPaymentShowEntityDropdown, setGroupPaymentShowEntityDropdown] = useState(false);
  const [groupPaymentRazonSocial, setGroupPaymentRazonSocial] = useState("");
  const [groupPaymentCuit, setGroupPaymentCuit] = useState("");
  const [groupPaymentDni, setGroupPaymentDni] = useState("");
  const [groupPaymentCondicionIva, setGroupPaymentCondicionIva] = useState("Consumidor Final");
  const [groupPaymentDomicilio, setGroupPaymentDomicilio] = useState("");
  const [groupPaymentPvNum, setGroupPaymentPvNum] = useState("");
  const [groupPaymentItems, setGroupPaymentItems] = useState<GItem[]>([gNewItem()]);
  const [showGroupFacturaDialog, setShowGroupFacturaDialog] = useState(false);
  const [pendingGroupPaymentDraft, setPendingGroupPaymentDraft] = useState<{ endpoint: string; body: Record<string, any> } | null>(null);
  const [groupFacturaFromResumen, setGroupFacturaFromResumen] = useState(false);
  const [groupInvoiceDistribution, setGroupInvoiceDistribution] = useState<"none" | "totalizados" | "detallados">("detallados");
  const [showCancelledRes, setShowCancelledRes] = useState(false);

  // Full reset of the "Pago Grupal" dialog's form state. Must run whenever that dialog's
  // flow truly ends — on plain success, after a fiscal/voucher follow-up dialog it opened
  // succeeds, or if that follow-up dialog is abandoned — or the next time the dialog is
  // opened it reopens with a stale locked receptor (see showMasterFacturaDialog above).
  const resetGroupPaymentDialogFields = () => {
    setGroupPaymentRows([{method: "cash", amount: "", reference: ""}]);
    setGroupPaymentReceiptType("sin_comprobante");
    setGroupPaymentDistribution("equal");
    setGroupPaymentCloseAll(false);
    setGroupPaymentCloseReservationIds([]);
    setGroupPaymentCloseAmounts({});
    setGroupPaymentDestino("distribute");
    setGroupPaymentCcEntityType("company");
    setGroupPaymentCcEntityId("");
    setGroupInvoiceDistribution("detallados");
    setGroupPaymentReceptorType("company");
    setGroupPaymentReceptorLocked(false);
    setGroupPaymentGuestId(null);
    setGroupPaymentGuestNationality("");
    setGroupPaymentGuestNationalityCode("");
    setGroupPaymentEntitySearch("");
    setGroupPaymentShowEntityDropdown(false);
    setGroupPaymentRazonSocial("");
    setGroupPaymentCuit("");
    setGroupPaymentDni("");
    setGroupPaymentCondicionIva("Consumidor Final");
    setGroupPaymentDomicilio("");
    setGroupPaymentPvNum("");
    setGroupPaymentItems([gNewItem()]);
  };

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
  // showMasterFacturaDialog is the fiscal-invoice follow-up opened after a "Pago Grupal"
  // payment with destino="master" (Aplicar al Folio Maestro) requires a factura. It always
  // reads its data from the groupPayment* state below — there is a single entry point.
  const [showMasterFacturaDialog, setShowMasterFacturaDialog] = useState(false);
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

  const { data: posConfigsData = [] } = useQuery<any[]>({ queryKey: ["/api/pos-configs"] });

  // Pre-loads the "Pago Grupal" Receptor from the group's configured billing
  // empresa/agencia (group.billingEntityType/billingEntityId), so the operator
  // doesn't have to re-search a company that's already on file for this group.
  // Returns true when it actually applied a receptor.
  function prefillGroupReceptorFromBillingEntity(): boolean {
    const entityType = (group as any)?.billingEntityType as "company" | "agency" | undefined;
    const entityId = (group as any)?.billingEntityId as string | undefined;
    if (!entityType || !entityId) return false;
    const list = entityType === "agency" ? agencies : companies;
    const entity = (list as any[]).find((e: any) => e.id === entityId);
    if (!entity) return false;
    setGroupPaymentReceptorType(entityType);
    setGroupPaymentRazonSocial(entity.razonSocial || entity.nombreFantasia || "");
    setGroupPaymentCuit(entity.cuilCuit ? String(entity.cuilCuit).replace(/-/g, "") : "");
    setGroupPaymentDni("");
    setGroupPaymentCondicionIva(normalizeCondicionIva(entity.condicionIva));
    setGroupPaymentDomicilio(entity.direccion || entity.domicilio || "");
    setGroupPaymentCcEntityType(entityType);
    setGroupPaymentCcEntityId(entityId);
    setGroupPaymentGuestId(null);
    setGroupPaymentGuestNationality("");
    setGroupPaymentGuestNationalityCode("");
    setGroupPaymentReceptorLocked(true);
    return true;
  }

  type GroupPaymentDialogPreset = {
    destino: "distribute" | "master";
    invoiceDistribution: "none" | "detallados";
    rows?: Array<{ method: string; amount: string; reference: string; retencionEnabled?: boolean; retencionTipo?: "iibb" | "ganancias"; retencionMonto?: string }>;
    prefillReceptor?: boolean;
  };

  // Every entry point must establish the complete initial mode. Keeping the
  // destination and receipt breakdown together prevents a reused mounted
  // dialog from showing the previous entry point's mode.
  const openGroupPaymentDialog = (preset: GroupPaymentDialogPreset) => {
    resetGroupPaymentDialogFields();
    if (preset.rows) {
      setGroupPaymentRows(preset.rows);
    }
    setGroupPaymentDestino(preset.destino);
    setGroupInvoiceDistribution(preset.invoiceDistribution);
    if (preset.prefillReceptor) {
      prefillGroupReceptorFromBillingEntity();
    }
    setShowGroupPaymentDialog(true);
  };

  // The payment destination determines the receipt breakdown. Keep this
  // invariant in one handler so switching destinations inside the mounted
  // dialog cannot reuse concepts from the previous destination.
  const changeGroupPaymentDestino = (destino: "distribute" | "master") => {
    setGroupPaymentDestino(destino);
    setGroupInvoiceDistribution(destino === "master" ? "none" : "detallados");
  };

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

  const { data: groupInvoiceSnapshot } = useQuery<any>({
    queryKey: ["/api/groups", groupId, "invoice-snapshot"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/invoice-snapshot`, { credentials: "include" });
      if (!res.ok) throw new Error("Error loading group invoice availability");
      return res.json();
    },
  });
  const { data: pendingFiscalCollections = [] } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "pending-fiscal-collections"],
    enabled: !!groupId,
  });
  const { data: pendingDirectInvoices = [] } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "pending-direct-invoices"],
    enabled: !!groupId,
  });
  const { data: pendingPaymentInvoices = [] } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "pending-payment-invoices"],
    enabled: !!groupId,
  });
  const { data: pendingGroupAuthorizations = [] } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "pending-authorizations"],
    enabled: !!groupId,
  });
  const recoveringFiscalInvoices = useRef(new Set<number>());
  const recoveringDirectInvoices = useRef(new Set<number>());
  const recoveringPaymentInvoices = useRef(new Set<number>());
  const recoveringGroupAuthorizations = useRef(new Set<number>());

  useEffect(() => {
    for (const invoice of pendingDirectInvoices) {
      const invoiceId = Number(invoice?.id);
      if (!invoiceId || recoveringDirectInvoices.current.has(invoiceId)) continue;
      recoveringDirectInvoices.current.add(invoiceId);
      apiRequest("POST", `/api/groups/${groupId}/direct-invoice`, {
        invoiceData: {
          id: invoiceId,
          tipoComprobante: invoice.tipo_comprobante ?? invoice.tipoComprobante,
          puntoVenta: Number(invoice.punto_venta ?? invoice.puntoVenta),
          numero: Number(invoice.numero),
        },
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "pending-direct-invoices"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "direct-invoices"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "invoice-snapshot"] });
      }).catch(() => recoveringDirectInvoices.current.delete(invoiceId));
    }
  }, [pendingDirectInvoices, groupId, queryClient]);

  useEffect(() => {
    for (const invoice of pendingPaymentInvoices) {
      const invoiceId = Number(invoice?.id);
      const paymentId = String(invoice?.group_payment_id ?? invoice?.groupPaymentId ?? "");
      if (!invoiceId || !paymentId || recoveringPaymentInvoices.current.has(invoiceId)) continue;
      recoveringPaymentInvoices.current.add(invoiceId);
      apiRequest("PATCH", `/api/groups/${groupId}/payments/${paymentId}/invoice`, {
        invoiceData: {
          id: invoiceId,
          tipoComprobante: invoice.tipo_comprobante ?? invoice.tipoComprobante,
          puntoVenta: Number(invoice.punto_venta ?? invoice.puntoVenta),
          numero: Number(invoice.numero),
        },
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "pending-payment-invoices"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      }).catch(() => recoveringPaymentInvoices.current.delete(invoiceId));
    }
  }, [pendingPaymentInvoices, groupId, queryClient]);

  useEffect(() => {
    for (const draft of pendingGroupAuthorizations) {
      const invoiceId = Number(draft?.id);
      if (!invoiceId || recoveringGroupAuthorizations.current.has(invoiceId)) continue;
      recoveringGroupAuthorizations.current.add(invoiceId);
      apiRequest("POST", `/api/groups/${groupId}/invoices/${invoiceId}/resume-authorization`, {})
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "pending-authorizations"] });
          queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "pending-fiscal-collections"] });
          queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "pending-payment-invoices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "pending-direct-invoices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "invoice-snapshot"] });
        })
        .catch(() => recoveringGroupAuthorizations.current.delete(invoiceId));
    }
  }, [pendingGroupAuthorizations, groupId, queryClient]);

  useEffect(() => {
    for (const pending of pendingFiscalCollections) {
      const invoiceId = Number(pending?.id);
      const intent = pending?.intent;
      if (!invoiceId || recoveringFiscalInvoices.current.has(invoiceId) || !intent?.endpoint || !intent?.body) continue;
      const allowedEndpoints = new Set([
        `/api/groups/${groupId}/payment`,
        `/api/groups/${groupId}/master-payment`,
      ]);
      if (!allowedEndpoints.has(String(intent.endpoint))) continue;
      recoveringFiscalInvoices.current.add(invoiceId);
      const finalConcepts = (Array.isArray(pending.items) ? pending.items : [])
        .map((item: any) => ({
          description: String(item.descripcion || item.description || "").trim(),
          amount: Number(item.subtotal ?? (Number(item.precioUnitario || 0) * Number(item.cantidad || 1))),
        }))
        .filter((item: any) => item.description && item.amount > 0);
      const oldTotal = (intent.body.concepts || []).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
      const newTotal = finalConcepts.reduce((sum: number, item: any) => sum + item.amount, 0);
      const sourceRows = intent.body.paymentRows || [];
      // An emitted invoice can have been created by an older client which put
      // its gross document amount in paymentRows even though an advance had
      // already settled part of it. The persisted settlement breakdown is the
      // authoritative recovery instruction: never recreate that overpayment
      // from the stale payment rows. This also keeps an operator's edited
      // invoice total aligned with the original advance application.
      const appliedAdvances = Math.min(
        newTotal,
        Math.max(0, Number(intent.body.settlementBreakdown?.appliedAdvances || 0)),
      );
      const targetGrossCents = Math.round((newTotal - appliedAdvances) * 100);
      const retentionCents = Math.round(sourceRows.reduce((sum: number, row: any) =>
        sum + Number(row.retention?.monto || 0), 0) * 100);
      if (targetGrossCents <= retentionCents || targetGrossCents <= 0) {
        recoveringFiscalInvoices.current.delete(invoiceId);
        toast({
          title: "Cobro fiscal pendiente",
          description: "El comprobante emitido requiere revisar sus retenciones antes de poder registrar el cobro.",
          variant: "destructive",
        });
        continue;
      }
      const eligible = sourceRows.map((row: any, index: number) => ({ row, index }))
        .filter(({ row }: any) => row.method !== "retencion" && Number(row.amount || 0) > 0);
      const weightTotal = eligible.reduce((sum: number, entry: any) => sum + Number(entry.row.amount || 0), 0);
      let allocated = 0;
      const centsByIndex = new Map<number, number>();
      eligible.forEach((entry: any, position: number) => {
        const cents = position === eligible.length - 1
          ? targetGrossCents - retentionCents - allocated
          : Math.floor((targetGrossCents - retentionCents) * Number(entry.row.amount || 0) / weightTotal);
        centsByIndex.set(entry.index, cents);
        allocated += cents;
      });
      const paymentRows = sourceRows.map((row: any, index: number) =>
        centsByIndex.has(index) ? { ...row, amount: (centsByIndex.get(index)! / 100).toFixed(2) } : row
      );
      apiRequest("POST", intent.endpoint, {
        ...intent.body,
        paymentRows,
        concepts: finalConcepts,
        settlementBreakdown: {
          documentTotal: newTotal,
          appliedAdvances,
          newCollection: targetGrossCents / 100,
        },
        // The post-emission snapshot no longer has a non-fiscal advance (the
        // invoice consumes fiscal availability). Supply its persisted intent
        // so the server can validate the same advance split on recovery.
        invoiceData: { id: invoiceId, groupPaymentIntent: intent },
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "pending-fiscal-collections"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
        queryClient.invalidateQueries({ queryKey: ["/api/cash/movements"] });
        toast({ title: "Cobro fiscal recuperado", description: "Se completó un cobro confirmado que había quedado pendiente." });
      }).catch(() => {
        recoveringFiscalInvoices.current.delete(invoiceId);
      });
    }
  }, [pendingFiscalCollections, groupId, queryClient, toast]);

  const refreshGroupBillingState = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["/api/groups", groupId, "invoice-snapshot"], exact: true }),
      queryClient.refetchQueries({ queryKey: ["/api/groups", groupId, "folio"], exact: true }),
      queryClient.refetchQueries({ queryKey: ["/api/groups", groupId, "master-folio"], exact: true }),
      queryClient.refetchQueries({ queryKey: ["/api/groups", groupId, "invoices"], exact: true }),
    ]);
  };

  // FT is a document exclusively for an accommodation-only Folio Maestro.
  // Reset a stale persisted/UI choice immediately when either prerequisite
  // changes; never leave a choice visible that cannot be emitted.
  useEffect(() => {
    const nationality = groupPaymentGuestNationality.trim().toLowerCase();
    const nationalityCode = groupPaymentGuestNationalityCode.trim().toLowerCase();
    const isForeignGuest = groupPaymentReceptorType === "guest"
      && !!(nationality || nationalityCode)
      && !["arg", "ar", "200"].includes(nationalityCode)
      && !["argentina", "argentino", "argentina/a", "argentine"].includes(nationality);
    if (groupPaymentReceiptType === "factura_t" &&
      (groupPaymentDestino !== "master" || masterFolio?.config !== "accommodation" || !isForeignGuest)) {
      setGroupPaymentReceiptType("factura_b");
    }
  }, [
    groupPaymentReceiptType,
    groupPaymentDestino,
    masterFolio?.config,
    groupPaymentReceptorType,
    groupPaymentGuestNationality,
    groupPaymentGuestNationalityCode,
  ]);

  const { data: groupFiscalInvoices = [] } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/invoices`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Full history of every "Pago Grupal" received for this group, regardless of
  // destino (Folio Maestro vs. Distribuido entre habitaciones). The Folio
  // Maestro card below only lists master-destined payments, so without this a
  // group_distribution payment was invisible everywhere except the raw DB.
  const { data: groupPaymentsHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/groups", groupId, "payments"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/payments`, { credentials: "include" });
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

  const buildGroupPaymentDraft = () => {
      const validRows = groupPaymentRows.filter(r => parseFloat(r.amount || "0") > 0);
      if (!groupPaymentReceptorLocked) {
        throw new Error("Seleccioná y confirmá el receptor antes de registrar el pago.");
      }
      if (validRows.length === 0 && groupPaymentReceiptType !== "factura_mipyme_a") {
        throw new Error("Ingresá al menos un monto");
      }
      if (!["factura_a", "factura_b", "factura_t", "factura_mipyme_a"].includes(groupPaymentReceiptType)
        && validRows.some(row => !row.reference.trim())) {
        throw new Error("El Anticipo requiere una referencia para cada medio de pago.");
      }
      const rowsPayload = (validRows.length > 0 ? validRows : [{ method: groupPaymentRows[0].method, amount: "0", reference: "" }])
        .map((r) => ({
          method: r.method,
          amount: r.amount,
          reference: r.reference || undefined,
          retention: r.retencionEnabled && r.retencionTipo && parseFloat(r.retencionMonto || "0") > 0
            ? { tipo: r.retencionTipo, monto: parseFloat(r.retencionMonto || "0") }
            : undefined,
        }));
      const isFiscal = ["factura_a", "factura_b", "factura_t", "factura_mipyme_a"].includes(groupPaymentReceiptType);
      const grossPaymentTotal = validRows.reduce((sum, row) =>
        sum + (parseFloat(row.amount || "0") || 0)
        + (row.retencionEnabled ? (parseFloat(row.retencionMonto || "0") || 0) : 0), 0);
      const receiptConceptItems = buildGroupInvoiceItems(
        groupInvoiceSnapshot?.sources ?? [],
        groupInvoiceDistribution,
        group?.name || groupId,
        grossPaymentTotal,
      );
      const concepts = isFiscal
        ? groupPaymentItems
            .filter((item) => item.descripcion.trim() && item.subtotal > 0)
            .map((item) => ({ description: item.descripcion.trim(), amount: item.subtotal }))
        : (receiptConceptItems.length > 0
            ? receiptConceptItems.map((item) => ({ description: item.descripcion, amount: item.precioUnitario }))
            : [{ description: `Anticipo grupo ${group?.name || groupId}`, amount: grossPaymentTotal }]);
      if (!isFiscal && !groupPaymentConceptsMatchTotal(concepts, grossPaymentTotal)) {
        throw new Error("El detalle del recibo no coincide con el total del anticipo.");
      }
      const documentTotal = isFiscal
        ? concepts.reduce((sum, concept) => sum + concept.amount, 0)
        : grossPaymentTotal;
      const settlementBreakdown = {
        documentTotal,
        appliedAdvances: isFiscal
          ? Math.min(documentTotal, Math.max(0, Number(groupInvoiceSnapshot?.financial?.nonFiscalAdvances ?? 0)))
          : 0,
        newCollection: grossPaymentTotal,
      };
      const receiverDetails = {
        razonSocial: groupPaymentRazonSocial || undefined,
        cuit: groupPaymentCuit.replace(/-/g, "") || undefined,
        dni: groupPaymentDni || undefined,
        condicionIva: groupPaymentCondicionIva || undefined,
        domicilio: groupPaymentDomicilio || undefined,
      };
      if (groupPaymentDestino === "master") {
        return { endpoint: `/api/groups/${groupId}/master-payment`, body: {
          paymentRows: rowsPayload,
          receiptType: groupPaymentReceiptType === "sin_comprobante" ? "none" : groupPaymentReceiptType,
          closeReservationIds: groupPaymentCloseAll ? groupPaymentCloseReservationIds : [],
          distributionDetail: groupPaymentCloseAll
            ? Object.fromEntries(groupPaymentCloseReservationIds.map((id) => [id, Number(groupPaymentCloseAmounts[id] || 0)]))
            : undefined,
          billingEntityType: groupPaymentCcEntityType,
          billingEntityId: groupPaymentCcEntityId || undefined,
          receiverDetails,
          concepts,
          settlementBreakdown,
        }};
      }
      return { endpoint: `/api/groups/${groupId}/payment`, body: {
        paymentRows: rowsPayload,
        receiptType: groupPaymentReceiptType,
        distribution: groupPaymentDistribution,
        closeAllRooms: groupPaymentCloseAll,
        closeReservationIds: groupPaymentCloseReservationIds,
        distributionDetail: groupPaymentCloseAll
          ? Object.fromEntries(groupPaymentCloseReservationIds.map((id) => [id, Number(groupPaymentCloseAmounts[id] || 0)]))
          : undefined,
        billingEntityType: groupPaymentCcEntityType,
        billingEntityId: groupPaymentCcEntityId || undefined,
        receiverDetails,
        concepts,
        settlementBreakdown,
      }};
  };

  const groupPaymentMutation = useMutation({
    mutationFn: async () => {
      const draft = buildGroupPaymentDraft();
      return apiRequest("POST", draft.endpoint, draft.body);
    },
    onSuccess: async (res) => {
      const data = await res.json().catch(() => ({}));
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === "/api/planning"
      });
      // The follow-up invoice must use the post-payment source balances, never
      // the snapshot that happened to be cached while the payment was entered.
      await refreshGroupBillingState();

      const isMaster = groupPaymentDestino === "master";

      if (groupPaymentCloseAll) {
        if (data.balanceDiff && Math.abs(data.balanceDiff) > 0.01) {
          toast({
            title: "Pago registrado con diferencia",
            description: `Diferencia de $${fmtMoney(Math.abs(data.balanceDiff))} ${data.balanceDiff > 0 ? "(pagó de más)" : "(saldo pendiente)"}`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Pago grupal registrado — habitaciones cerradas",
            description: `${data.checkoutCount ?? 0} habitación(es) cerrada(s) exitosamente.`,
          });
        }
      } else {
        toast({ title: isMaster ? "Pago al Folio Maestro registrado exitosamente" : "Pago grupal registrado exitosamente" });
      }
      setShowGroupPaymentDialog(false);
      resetGroupPaymentDialogFields();
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
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "payments"] });
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
    if (res.bedTypeNotes) return getBedConfigLabel(res.bedTypeNotes);
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

    const groups = sortedReservations.map((res, idx) => {
      const companions: any[] = (res as any).companions || [];
      const lateCheckout = (res as any).lateCheckOut;
      const lateCheckoutTime = (res as any).lateCheckOutTime;
      const isLastRowOfGroup = companions.length === 0;
      const mainRow = `
      <tr class="room-row${idx % 2 === 1 ? ' alt' : ''}">
        <td class="c-idx${isLastRowOfGroup ? '' : ' no-border'}">${idx + 1}</td>
        <td class="c-room${isLastRowOfGroup ? '' : ' no-border'}">${res.room?.roomNumber || "-"}</td>
        <td class="c-bed${isLastRowOfGroup ? '' : ' no-border'}">${getBedLabel(res)}</td>
        <td class="c-guest${isLastRowOfGroup ? '' : ' no-border'}">${res.guest?.codigo?.startsWith("GROUP-") ? ((res as any).guestName || "") : ((res.guest?.lastName || "") + " " + (res.guest?.firstName || "")).trim() || ((res as any).guestName || "")}</td>
        <td class="c-doc${isLastRowOfGroup ? '' : ' no-border'}">${res.guest?.documentNumber ? `${res.guest?.documentType || "DOC"}: ${res.guest?.documentNumber}` : "-"}</td>
        <td class="c-date${isLastRowOfGroup ? '' : ' no-border'}">${fmtDate(res.checkInDate)}</td>
        <td class="c-date${isLastRowOfGroup ? '' : ' no-border'}">${fmtDate(res.checkOutDate)}${lateCheckout ? `<br/><span class="badge-late">LATE${lateCheckoutTime ? ' ' + lateCheckoutTime : ''}</span>` : ""}</td>
        <td class="c-notes${isLastRowOfGroup ? '' : ' no-border'}">${res.notes || ""}</td>
      </tr>`;
      const companionRows = companions.map((c: any, cIdx: number) => `
      <tr class="companion-row${idx % 2 === 1 ? ' alt' : ''}${cIdx === companions.length - 1 ? ' last-companion' : ''}">
        <td class="c-idx no-border"></td>
        <td class="c-room no-border companion-label">&#8627;</td>
        <td class="c-bed no-border companion-label">Acomp.</td>
        <td class="c-guest no-border">${c.lastName || ""} ${c.firstName || ""}</td>
        <td class="c-doc no-border">${c.documentNumber ? `${c.documentType || "DOC"}: ${c.documentNumber}` : "-"}</td>
        <td class="c-date no-border"></td>
        <td class="c-date no-border"></td>
        <td class="c-notes no-border">${c.notes || ""}</td>
      </tr>`).join("");
      return `<tbody class="room-group">${mainRow}${companionRows}</tbody>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Rooming List - ${group.name}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 28px; color: #1a1a1a; }
    h1 { margin: 0 0 2px 0; font-size: 20px; letter-spacing: 0.3px; }
    h2 { margin: 0; font-size: 14px; font-weight: normal; color: #555; text-transform: uppercase; letter-spacing: 1px; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; border-bottom: 2px solid #222; padding-bottom: 10px; }
    .info-panel { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 18px; padding: 12px 16px; background: #f7f7f8; border: 1px solid #e2e2e2; border-radius: 6px; font-size: 12px; }
    .info-block p { margin: 2px 0; line-height: 1.4; }
    .info-label { color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .info-block.right { text-align: right; }

    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11.5px; }
    colgroup .col-idx { width: 24px; }
    colgroup .col-room { width: 46px; }
    colgroup .col-bed { width: 88px; }
    colgroup .col-guest { width: auto; }
    colgroup .col-doc { width: 104px; }
    colgroup .col-date { width: 82px; }
    colgroup .col-notes { width: 108px; }

    thead { display: table-header-group; }
    th { background: #222; color: #fff; padding: 7px 6px; text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.2px; white-space: nowrap; }
    th.center, td.c-idx { text-align: center; }

    tbody.room-group { break-inside: avoid; page-break-inside: avoid; }
    td { padding: 6px 8px; vertical-align: top; word-wrap: break-word; border-bottom: 1px solid #ddd; }
    td.no-border { border-bottom: none; }
    td.c-date { white-space: nowrap; }
    tr.room-row.alt, tr.companion-row.alt { background: #fafafa; }
    tr.room-row td.c-room { font-weight: bold; }
    tr.companion-row td { color: #555; }
    tr.companion-row.last-companion td { border-bottom: 1px solid #ddd; }
    .companion-label { color: #999; font-size: 10.5px; font-style: italic; }
    .badge-late { display: inline-block; background: #fef3c7; color: #92400e; font-size: 9px; font-weight: bold; padding: 1px 5px; border-radius: 3px; margin-top: 2px; }

    .event-box { background: #f9f7ff; border: 1px solid #d4c8f0; border-radius: 6px; padding: 10px 16px; margin-bottom: 14px; font-size: 12px; }
    .notes-box { background: #fffbea; border: 1px solid #e6d87a; border-radius: 6px; padding: 10px 16px; margin-bottom: 14px; font-size: 12px; }
    .footer { text-align: center; margin-top: 20px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 9.5px; color: #999; }

    @media print {
      body { padding: 10mm; }
      @page { margin: 12mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Maran Suites &amp; Towers</h1>
      <h2>Rooming List</h2>
    </div>
    <div style="text-align:right;font-size:11px;color:#777;">
      Generado el ${formatHotelDateTime(new Date())}
    </div>
  </div>
  <div class="info-panel">
    <div class="info-block">
      <p class="info-label">Grupo</p>
      <p><strong>${group.name}</strong></p>
      <p style="font-family:monospace;">${group.groupCode}</p>
    </div>
    <div class="info-block">
      <p class="info-label">Contacto</p>
      <p>${group.contactName || "-"}</p>
      <p>${group.contactPhone || ""}</p>
      <p>${group.contactEmail || ""}</p>
    </div>
    <div class="info-block right">
      <p class="info-label">Fechas</p>
      <p>Check-in: <strong>${fmtDate(group.checkInDate)}</strong></p>
      <p>Check-out: <strong>${fmtDate(group.checkOutDate)}</strong></p>
      <p>Habitaciones: <strong>${group.reservations.length}</strong></p>
    </div>
  </div>
  ${group.eventDate ? `
  <div class="event-box">
    <p class="info-label" style="margin:0 0 6px 0;">Evento</p>
    <div style="display:flex;gap:32px;">
      <div><strong>Fecha:</strong> ${fmtDate(group.eventDate)}</div>
      ${(group as any).eventSalon ? `<div><strong>Salón:</strong> ${(group as any).eventSalon}</div>` : ""}
      ${(group as any).eventTime ? `<div><strong>Horario:</strong> ${(group as any).eventTime}</div>` : ""}
    </div>
  </div>
  ` : ""}
  ${group.notes ? `
  <div class="notes-box">
    <p class="info-label" style="margin:0 0 6px 0;">Notas de la estadía</p>
    <p style="margin:0;white-space:pre-wrap;">${group.notes}</p>
  </div>
  ` : ""}
  <table>
    <colgroup>
      <col class="col-idx" /><col class="col-room" /><col class="col-bed" /><col class="col-guest" />
      <col class="col-doc" /><col class="col-date" /><col class="col-date" /><col class="col-notes" />
    </colgroup>
    <thead>
      <tr>
        <th class="center">#</th>
        <th>Hab.</th>
        <th>Camaje</th>
        <th>Hu&eacute;sped</th>
        <th>Documento</th>
        <th>Check-in</th>
        <th>Check-out</th>
        <th>Notas</th>
      </tr>
    </thead>
    ${groups}
  </table>
  <div class="footer">
    Maran Suites &amp; Towers &mdash; Documento interno de uso operativo
  </div>
  ${"<" + "script>window.onload = function() { window.print(); };" + "<" + "/script>"}
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

  const autoSyncFiscalPayment = ["factura_a", "factura_b", "factura_t", "factura_mipyme_a"].includes(groupPaymentReceiptType);
  const autoSyncItemsTotal = groupPaymentItems.reduce((sum, item) => sum + item.subtotal, 0);
  const autoSyncRequiredCollection = requiredGroupInvoiceCollection(
    autoSyncItemsTotal,
    Number(groupInvoiceSnapshot?.financial?.nonFiscalAdvances ?? 0),
  );
  useEffect(() => {
    if (!showGroupPaymentDialog
      || !autoSyncFiscalPayment
      || groupPaymentReceiptType === "factura_mipyme_a"
      || groupPaymentCloseAll
      || groupPaymentRows.length !== 1) {
      return;
    }
    const nextAmount = autoSyncRequiredCollection > 0
      ? autoSyncRequiredCollection.toFixed(2)
      : "";
    setGroupPaymentRows((rows) => {
      if (rows.length !== 1 || rows[0].amount === nextAmount) return rows;
      return [{ ...rows[0], amount: nextAmount }];
    });
  }, [
    showGroupPaymentDialog,
    autoSyncFiscalPayment,
    groupPaymentReceiptType,
    groupPaymentCloseAll,
    autoSyncItemsTotal,
    autoSyncRequiredCollection,
    groupPaymentRows.length,
  ]);

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

  // Keep the three financial validations independent: collection media,
  // fiscal concepts, and source availability represent different ledgers.
  const groupPaymentIsFiscal = ["factura_a", "factura_b", "factura_t", "factura_mipyme_a"].includes(groupPaymentReceiptType);
  const groupPaymentIsMipyme = groupPaymentReceiptType === "factura_mipyme_a";
  const groupPaymentHasCuentaCorriente = groupPaymentRows.some(r => r.method === "cuenta_corriente");
  const groupPaymentEntityRequired = (groupPaymentIsFiscal && !groupPaymentIsMipyme) || groupPaymentHasCuentaCorriente;
  const groupPaymentHasEntityData = !!groupPaymentRazonSocial.trim();
  const groupPaymentRowsTotal = groupPaymentRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const groupPaymentRetentionsTotal = groupPaymentRows.reduce((s, r) =>
    s + (r.retencionEnabled ? (parseFloat(r.retencionMonto || "0") || 0) : 0), 0);
  const groupPaymentGrossPaymentTotal = groupPaymentRowsTotal + groupPaymentRetentionsTotal;
  const groupPaymentReceiptConcepts = buildGroupInvoiceItems(
    groupInvoiceSnapshot?.sources ?? [],
    groupInvoiceDistribution,
    group?.name || groupId,
    groupPaymentGrossPaymentTotal,
  );
  const groupPaymentItemsTotal = groupPaymentItems.reduce((s, it) => s + it.subtotal, 0);
  const groupPaymentFiscalAvailable = availableGroupInvoiceTotal(groupInvoiceSnapshot?.sources ?? []);
  const groupPaymentNonFiscalAdvances = Number(groupInvoiceSnapshot?.financial?.nonFiscalAdvances ?? 0);
  const groupPaymentRequiredCollection = requiredGroupInvoiceCollection(
    groupPaymentItemsTotal,
    groupPaymentNonFiscalAdvances,
  );
  const groupPaymentOperationalBalance = Number(
    groupInvoiceSnapshot?.financial?.operationalBalance ?? folio?.totals?.balance ?? 0,
  );
  const groupPaymentActiveReservations = group.reservations.filter(
    (reservation) => reservation.status === "confirmed" || reservation.status === "checked_in",
  );
  const groupPaymentSelectedBalance = groupPaymentCloseReservationIds.reduce((sum, reservationId) => {
    return sum + Math.max(0, Number(groupPaymentCloseAmounts[reservationId] || 0));
  }, 0);
  const groupPaymentHasCloseSelection = !groupPaymentCloseAll || groupPaymentCloseReservationIds.length > 0;
  const groupPaymentCloseAssignmentsValid = !groupPaymentCloseAll || groupPaymentCloseReservationIds.every((reservationId) => {
    const row = folio?.reservations?.find((reservation) => reservation.reservationId === reservationId);
    return Math.round(Number(groupPaymentCloseAmounts[reservationId] || 0) * 100)
      === Math.round(Math.max(0, Number(row?.balance || 0)) * 100);
  });

  // A fiscal document is backed by the invoice snapshot, not by the cash rows:
  // an earlier advance can leave cash balance at zero while accommodation is
  // still available to document.
  const groupPaymentHasConcepts = !groupPaymentIsFiscal || groupPaymentItemsTotal > 0;
  const groupPaymentHasRequiredPaymentSum = groupPaymentIsFiscal || groupPaymentRowsTotal > 0;
  const groupPaymentExceedsFiscalAvailable = groupPaymentIsFiscal
    && exceedsGroupInvoiceAvailable(groupPaymentItemsTotal, groupPaymentFiscalAvailable);
  const groupPaymentConceptsMismatchPayment = groupPaymentIsFiscal
    && groupPaymentItemsTotal > 0
    && !groupInvoicePaymentMatchesConcepts(
      groupPaymentGrossPaymentTotal,
      groupPaymentItemsTotal,
      groupPaymentNonFiscalAdvances,
      {
        enabled: groupPaymentDestino === "distribute" && groupPaymentCloseAll,
        operationalBalance: groupPaymentCloseAll ? groupPaymentSelectedBalance : groupPaymentOperationalBalance,
      },
    );
  const groupPaymentHasRequiredReferences = groupPaymentIsFiscal || groupPaymentRows
    .filter(r => parseFloat(r.amount || "0") > 0)
    .every(r => !!r.reference.trim());
  const groupPaymentCanSubmit = !groupPaymentMutation.isPending
    && groupPaymentHasRequiredPaymentSum
    && (!groupPaymentIsFiscal || groupPaymentFiscalAvailable > 0)
    // A receiver is never optional, including an Anticipo.
    && groupPaymentReceptorLocked
    && (!groupPaymentEntityRequired || groupPaymentHasEntityData)
    && groupPaymentHasRequiredReferences
    && groupPaymentHasConcepts
    && groupPaymentHasCloseSelection
    && groupPaymentCloseAssignmentsValid
    && !groupPaymentConceptsMismatchPayment
    && !groupPaymentExceedsFiscalAvailable;

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
            onClick={async () => {
              await refreshGroupBillingState();
              openGroupPaymentDialog({
                destino: "distribute",
                invoiceDistribution: "detallados",
                prefillReceptor: true,
              });
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

      {groupInvoiceSnapshot?.totals && Number(groupInvoiceSnapshot.totals.eligible) > 0 && (
        <Card className="border-violet-200 dark:border-violet-800">
          <CardContent className="pt-4 pb-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Receipt className="h-4 w-4" />
                <span>Snapshot financiero del grupo</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Total operativo</p>
                  <p className="font-semibold" data-testid="text-financial-operational-total">${fmtMoney(groupInvoiceSnapshot.financial?.operationalTotal ?? groupInvoiceSnapshot.totals.eligible)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cobros</p>
                  <p className="font-semibold text-green-600" data-testid="text-financial-collected">${fmtMoney(groupInvoiceSnapshot.financial?.collected ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Adelantos no fiscalizados</p>
                  <p className="font-semibold text-amber-600" data-testid="text-financial-advances">${fmtMoney(groupInvoiceSnapshot.financial?.nonFiscalAdvances ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Saldo operativo</p>
                  <p className="font-semibold text-red-600" data-testid="text-financial-operational-balance">${fmtMoney(groupInvoiceSnapshot.financial?.operationalBalance ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Facturado</p>
                  <p className="font-semibold text-orange-600" data-testid="text-billing-status-invoiced">${fmtMoney(groupInvoiceSnapshot.totals.invoiced)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Disponible fiscal</p>
                  <p className="font-semibold text-emerald-600" data-testid="text-billing-status-available">${fmtMoney(groupInvoiceSnapshot.totals.available)}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={loadInvoice} disabled={isLoadingInvoice} data-testid="button-billing-status-details">
                  Ver detalle
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                const sortByRoom = (a: typeof group.reservations[0], b: typeof group.reservations[0]) =>
                  (a.room?.roomNumber || "").localeCompare(b.room?.roomNumber || "", "es", { numeric: true });
                const activeRes = group.reservations.filter(r => r.status !== "cancelled").sort(sortByRoom);
                const cancelledRes = group.reservations.filter(r => r.status === "cancelled").sort(sortByRoom);
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

              {/* ── Consultas (siempre visible, independiente de la config. de Folio Maestro) ── */}
              <div className="flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-folio-pdf">
                      <FileDown className="h-4 w-4 mr-1" />
                      Consultas
                      <ChevronDown className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {masterFolio.config !== "none" && (
                      <DropdownMenuItem onClick={() => {
                        const a = document.createElement("a");
                        a.href = `/api/groups/${groupId}/master-folio/pdf`;
                        a.download = `folio-maestro-${group?.name || groupId}.pdf`;
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                      }}>
                        <FileDown className="h-4 w-4 mr-2" />Folio Maestro PDF
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setShowRoomingListDialog(true)}>
                      <Printer className="h-4 w-4 mr-2" />Rooming List
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

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
                          <CardDescription>Asignación operativa de cargos y cobros del organizador; no modifica el total fiscal del comprobante.</CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                            onClick={async () => {
                             await refreshGroupBillingState();
                            // "Pagar Folio Maestro" opens the unified "Pago Grupal" dialog
                            // pre-set to destino="master" (Aplicar al Folio Maestro) — the
                            // dedicated legacy dialog was retired in favor of this toggle.
                            const balance = masterFolio.masterBalance;
                            openGroupPaymentDialog({
                              destino: "master",
                              invoiceDistribution: "none",
                              rows: [{method: "cash", amount: balance > 0 ? String(balance.toFixed(2)) : "", reference: ""}],
                              prefillReceptor: true,
                            });
                          }}
                          disabled={masterFolio.masterBalance <= 0.01 && Number(groupInvoiceSnapshot?.totals?.available ?? 0) <= 0.01}
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
                        <p className="text-lg font-bold text-blue-700 dark:text-blue-400">${masterFolio.masterAccommodation.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                      </div>
                      {masterFolio.config === "all" && (
                        <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-3 border border-purple-200 dark:border-purple-800">
                          <p className="text-xs text-muted-foreground mb-1">Extras (hab.)</p>
                          <p className="text-lg font-bold text-purple-700 dark:text-purple-400">${masterFolio.masterExtras.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                        </div>
                      )}
                      <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-3 border border-orange-200 dark:border-orange-800">
                        <p className="text-xs text-muted-foreground mb-1">Cargos grupales</p>
                        <p className="text-lg font-bold text-orange-700 dark:text-orange-400">${masterFolio.groupChargesTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3 border border-green-200 dark:border-green-800">
                        <p className="text-xs text-muted-foreground mb-1">Cobrado operativo</p>
                        <p className="text-lg font-bold text-green-700 dark:text-green-400">${masterFolio.masterPaid.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className={`rounded-lg p-3 border col-span-2 sm:col-span-1 ${masterFolio.masterBalance > 0.01 ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"}`}>
                        <p className="text-xs text-muted-foreground mb-1">Saldo pendiente</p>
                        <p className={`text-lg font-bold ${masterFolio.masterBalance > 0.01 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`} data-testid="folio-master-balance">
                          ${masterFolio.masterBalance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    {/* Desglose financiero por habitación */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Estado por habitación</p>
                      <div className="rounded-md border divide-y">
                        {masterFolio.rooms.map((r: any) => (
                          <div key={r.reservationId} className="grid grid-cols-2 gap-2 px-3 py-2 text-sm sm:grid-cols-[minmax(12rem,1fr)_repeat(5,minmax(6.5rem,auto))]" data-testid={`master-room-financial-${r.reservationId}`}>
                            <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
                              <span className="font-bold w-10">Hab. {r.roomNumber}</span>
                              <span className="text-muted-foreground">{r.guestName || "Sin asignar"}</span>
                              <span className="text-xs text-muted-foreground">{r.nights} noche(s)</span>
                            </div>
                            <div className="text-right"><p className="text-[10px] text-muted-foreground">Operativo</p><p className="font-semibold">{fmtMoney(r.financial?.operationalTotal ?? (r.accommodation + r.extras))}</p></div>
                            <div className="text-right"><p className="text-[10px] text-muted-foreground">Cobrado</p><p className="font-semibold text-green-600">{fmtMoney(r.financial?.collected ?? 0)}</p></div>
                            <div className="text-right"><p className="text-[10px] text-muted-foreground">Facturado</p><p className="font-semibold text-orange-600">{fmtMoney(r.financial?.invoiced ?? 0)}</p></div>
                            <div className="text-right"><p className="text-[10px] text-muted-foreground">Anticipo</p><p className="font-semibold text-amber-600">{fmtMoney(r.financial?.nonFiscalAdvances ?? 0)}</p></div>
                            <div className="text-right"><p className="text-[10px] text-muted-foreground">Saldo</p><p className={`font-semibold ${(r.financial?.operationalBalance ?? 0) > 0.01 ? "text-red-600" : "text-green-600"}`}>{fmtMoney(r.financial?.operationalBalance ?? 0)}</p></div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-3 py-2 text-sm bg-muted/30 font-semibold">
                          <span>El saldo descuenta pagos y anticipos según su asignación operativa registrada</span>
                          <span>Total alojamiento: {fmtMoney(masterFolio.masterAccommodation)}</span>
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
                              : (!gp.receiptType || gp.receiptType === "none" || gp.receiptType === "sin_comprobante") ? `ADELANTO #${gpIdx + 1}`
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
                            const receiverName = gp.receiverDetails?.razonSocial || entityName;
                            const methodsLabel = Array.isArray(gp.paymentMethodDetail) && gp.paymentMethodDetail.length > 0
                              ? gp.paymentMethodDetail.map((row: any) => PAYMENT_METHOD_LABELS[row.method] || row.method).join(" + ")
                              : PAYMENT_METHOD_LABELS[gp.method] || gp.method;
                             const settlement = gp.settlementBreakdown || {
                               documentTotal: Number(gp.amount) || 0,
                               appliedAdvances: 0,
                               newCollection: Number(gp.amount) || 0,
                             };
                            const settlementUnavailable = gp.settlementBreakdownStatus === "not_reconstructible";
                            // NC button: show only when there's an invoice with a known DB id and no NC yet
                            const canEmitNc = invoiceRefParsed?.id && !ncRefParsed;
                            return (
                              <div key={gp.id} className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`row-group-payment-${gp.id}`}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-muted-foreground">{fmtDate(gp.date)}</span>
                                  <Badge variant="secondary">{methodsLabel}</Badge>
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
                                  {receiverName && (
                                    <span className="text-xs text-muted-foreground">→ {receiverName}</span>
                                  )}
                                  {gp.reference && <span className="text-xs text-muted-foreground italic">{gp.reference}</span>}
                                  {settlementUnavailable ? (
                                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400" data-testid={`master-payment-breakdown-${gp.id}`}>
                                      Desglose histórico no reconstruible · Cobro registrado: {fmtMoney(Number(gp.amount) || 0)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground" data-testid={`master-payment-breakdown-${gp.id}`}>
                                       Documento fiscal (bruto): <strong>{fmtMoney(Number(settlement.documentTotal) || 0)}</strong>
                                       {" · "}Anticipos no fiscales previos aplicados: <strong>{fmtMoney(Number(settlement.appliedAdvances) || 0)}</strong>
                                      {" · "}Cobro nuevo: <strong>{fmtMoney(Number(settlement.newCollection) || 0)}</strong>
                                       {" · "}Total cubierto: <strong>{fmtMoney(Number(settlement.appliedAdvances || 0) + Number(settlement.newCollection || 0))}</strong>
                                      {gp.settlementBreakdownStatus === "reconstructed_from_fiscal_intent"
                                        ? " · Reconstruido desde intención fiscal"
                                        : null}
                                    </span>
                                  )}
                                  {/* Retención (IIBB/Ganancias) withheld on the Folio Maestro / group-charges
                                      portion of this payment — no room to carry it on payments.notes, so it's
                                      stored on the group_payments row itself (retentionDetail). */}
                                  {Array.isArray(gp.retentionDetail) && gp.retentionDetail.map((ret: any, retIdx: number) => {
                                    if (!ret?.monto) return null;
                                    const retLabel = ret.tipo === "iibb" ? "Ret. IIBB" : ret.tipo === "ganancias" ? "Ret. Ganancias" : ret.tipo ? `Ret. ${ret.tipo}` : null;
                                    if (!retLabel) return null;
                                    return (
                                      <Badge key={retIdx} variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400" data-testid={`badge-retention-master-${gp.id}-${retIdx}`}>
                                        {retLabel}: ${ret.monto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                      </Badge>
                                    );
                                  })}
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
              {/* HISTORIAL DE PAGOS GRUPALES (todos los destinos)   */}
              {/* ══════════════════════════════════════════════════ */}
              {groupPaymentsHistory.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <Receipt className="h-5 w-5 text-muted-foreground" />
                      Historial de Pagos Grupales
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border divide-y">
                      {groupPaymentsHistory.map((gp: any) => (
                        <GroupPaymentHistoryRow key={gp.id} gp={gp} companies={companies as any[]} agencies={agencies as any[]} />
                      ))}
                    </div>
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
                      <Button size="sm" variant="outline" onClick={() => {
                        resetGroupPaymentDialogFields();
                        setGroupPaymentDestino("distribute");
                        setShowGroupPaymentDialog(true);
                      }} data-testid="button-folio-payment">
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
                                  ${r.extras.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} en extras
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
                                      const retLabel = p.retention?.tipo === "iibb" ? "Ret. IIBB" : p.retention?.tipo === "ganancias" ? "Ret. Ganancias" : p.retention?.tipo ? `Ret. ${p.retention.tipo}` : null;
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
                                            {retLabel && p.retention && (
                                              <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400" data-testid={`badge-retention-${p.id}`}>
                                                {retLabel}: ${p.retention.monto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
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

                              <div className="grid grid-cols-2 gap-2 rounded border bg-background p-2 text-xs sm:grid-cols-5" data-testid={`room-financial-summary-${r.reservationId}`}>
                                <div><p className="text-muted-foreground">Operativo</p><p className="font-semibold">{fmtMoney(r.financial?.operationalTotal ?? (r.accommodation + r.extras))}</p></div>
                                <div><p className="text-muted-foreground">Cobrado</p><p className="font-semibold text-green-600">{fmtMoney(r.financial?.collected ?? 0)}</p></div>
                                <div><p className="text-muted-foreground">Facturado</p><p className="font-semibold text-orange-600">{fmtMoney(r.financial?.invoiced ?? 0)}</p></div>
                                <div><p className="text-muted-foreground">Anticipo disponible</p><p className="font-semibold text-amber-600">{fmtMoney(r.financial?.nonFiscalAdvances ?? 0)}</p></div>
                                <div><p className="text-muted-foreground">Pendiente operativo</p><p className={`font-semibold ${(r.financial?.operationalBalance ?? 0) > 0.01 ? "text-red-600" : "text-green-600"}`}>{fmtMoney(r.financial?.operationalBalance ?? 0)}</p></div>
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs border-cyan-400 text-cyan-700 hover:bg-cyan-50 dark:border-cyan-600 dark:text-cyan-400 dark:hover:bg-cyan-950"
                                  onClick={() => window.open(`/reservations?view=${r.reservationId}`, '_blank')}
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

                  {/* Todos los comprobantes fiscales del grupo, con la misma
                      composición exacta que se agrega al PDF fiscal. */}
                  {groupFiscalInvoices.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5 text-emerald-500" />
                        Comprobantes grupales emitidos
                      </p>
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 divide-y divide-emerald-100 dark:divide-emerald-900 overflow-hidden">
                        {groupFiscalInvoices.map((inv: any) => {
                          const badge = `${inv.tipoComprobante ?? "FAC"} ${String(inv.puntoVenta ?? "").padStart(4, "0")}-${String(inv.numero ?? "").padStart(8, "0")}`;
                          const isExpanded = expandedGroupInvoiceId === inv.id;
                          const isCreditNote = String(inv.tipoComprobante || "").startsWith("NC");
                          const isDebitNote = String(inv.tipoComprobante || "").startsWith("ND");
                          return (
                            <div key={inv.id} className="bg-emerald-50/50 dark:bg-emerald-950/10" data-testid={`row-group-invoice-${inv.id}`}>
                              <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                  onClick={() => setExpandedGroupInvoiceId(isExpanded ? null : inv.id)}
                                  aria-expanded={isExpanded}
                                  data-testid={`button-group-invoice-detail-${inv.id}`}
                                >
                                  {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                                  <span className="text-muted-foreground text-xs">{new Date(inv.createdAt).toLocaleDateString("es-AR")}</span>
                                  <Badge variant="outline" className={`text-xs font-mono gap-1 ${isCreditNote ? "border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400" : "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400"}`}>
                                    {isCreditNote ? <FileX className="h-3 w-3" /> : <Receipt className="h-3 w-3" />}
                                    {badge}
                                  </Badge>
                                  {isCreditNote ? (
                                    <Badge variant="secondary" className="text-[10px]">Nota de crédito</Badge>
                                  ) : isDebitNote ? (
                                    <Badge variant="secondary" className="text-[10px]">Nota de débito</Badge>
                                  ) : inv.groupPaymentId ? (
                                    <Badge variant="secondary" className="text-[10px]">Asociado a cobro grupal</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px]">Factura directa</Badge>
                                  )}
                                  {inv.cae && <span className="truncate text-xs text-muted-foreground font-mono">CAE: {inv.cae}</span>}
                                </button>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2"
                                    onClick={() => window.open(`/api/billing/invoices/${inv.id}/pdf`, "_blank")}
                                    data-testid={`button-group-invoice-pdf-${inv.id}`}
                                  >
                                    <FileDown className="mr-1 h-3.5 w-3.5" />
                                    PDF
                                  </Button>
                                  <span className={`font-semibold tabular-nums whitespace-nowrap ${isCreditNote ? "text-orange-700 dark:text-orange-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                                    ${Number(inv.montoTotal || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                              {isExpanded && (
                                <div className="border-t border-emerald-100 px-4 py-3 dark:border-emerald-900" data-testid={`group-invoice-composition-${inv.id}`}>
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Composición del comprobante</p>
                                  {inv.groupComposition?.sections?.length > 0 ? (
                                    <div className="space-y-3">
                                      {inv.groupComposition.sections.map((section: any) => (
                                        <div key={section.kind} className="rounded-md border bg-background/70 p-2">
                                          <div className="mb-1 flex justify-between text-xs font-semibold">
                                            <span>{section.label}</span>
                                            <span>${Number(section.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                          </div>
                                          {section.lines.map((line: any) => (
                                            <div key={line.id} className="flex justify-between gap-3 py-0.5 pl-2 text-xs text-muted-foreground">
                                              <span>{line.destination} · {stripTransferTags(line.concept)}</span>
                                              <span className="shrink-0 tabular-nums">${Number(line.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ))}
                                      <div className="flex justify-between border-t pt-2 text-sm font-bold">
                                        <span>Total del documento fiscal</span>
                                        <span>${Number(inv.groupComposition.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <p className="text-xs text-muted-foreground">
                                        {inv.groupComposition?.unavailableReason || "Este comprobante histórico no tiene un mapa de fuentes disponible."}
                                      </p>
                                      <div className="flex justify-between border-t pt-2 text-sm font-bold">
                                        <span>Total del comprobante</span>
                                        <span>${Number(inv.groupComposition?.total ?? inv.montoTotal ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
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
                      <p className="text-xs text-muted-foreground">Resumen operativo del grupo: cobros y saldo. El total fiscal se consulta en los comprobantes emitidos.</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Total alojamiento</p>
                          <p className="font-bold">${folio.totals.accommodation.toLocaleString("es-AR", { minimumFractionDigits: 0 })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total extras</p>
                          <p className="font-bold">${folio.totals.extras.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Cobrado operativo</p>
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
              {invoiceData.billing && (
                <Card className="border-violet-200 dark:border-violet-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Disponibilidad para facturar</CardTitle>
                    <CardDescription>Total elegible, ya facturado y disponible por concepto y destino.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div><p className="text-xs text-muted-foreground">Total operativo</p><p className="font-semibold">{fmtMoney(invoiceData.billing.financial?.operationalTotal ?? invoiceData.billing.totals.eligible)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Cobros</p><p className="font-semibold text-green-600">{fmtMoney(invoiceData.billing.financial?.collected ?? invoiceData.totals.payments)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Adelantos no fiscalizados</p><p className="font-semibold text-amber-600">{fmtMoney(invoiceData.billing.financial?.nonFiscalAdvances ?? 0)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Saldo operativo</p><p className="font-semibold text-red-600">{fmtMoney(invoiceData.billing.financial?.operationalBalance ?? invoiceData.totals.balance)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Facturado</p><p className="font-semibold text-orange-600">{fmtMoney(invoiceData.billing.totals.invoiced)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Disponible fiscal</p><p className="font-semibold text-emerald-600">{fmtMoney(invoiceData.billing.totals.available)}</p></div>
                    </div>
                    <div className="max-h-52 overflow-y-auto rounded-md border">
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                        <span>Concepto / destino</span><span>Elegible</span><span>Facturado</span><span>Disponible</span>
                      </div>
                      {invoiceData.billing.sources.map((source: any) => (
                        <div key={source.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 text-xs">
                          <span className="truncate" title={source.id}>{source.destination} · {source.concept}</span>
                          <span>{fmtMoney(source.eligible)}</span>
                          <span>{fmtMoney(source.invoiced)}</span>
                          <span className={source.available > 0 ? "font-semibold text-emerald-700" : "text-muted-foreground"}>{fmtMoney(source.available)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
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
                          {res.payments.map((p: any, i: number) => {
                            const retLabel = p.retention?.tipo === "iibb" ? "Ret. IIBB" : p.retention?.tipo === "ganancias" ? "Ret. Ganancias" : p.retention?.tipo ? `Ret. ${p.retention.tipo}` : null;
                            return (
                              <div key={i}>
                                <div className="flex justify-between text-green-600">
                                  <span>{p.method} {p.reference && `(${p.reference})`}</span>
                                  <span>-${fmtMoney(p.amount)}</span>
                                </div>
                                {retLabel && p.retention && (
                                  <div className="flex justify-between text-amber-600 text-xs pl-2">
                                    <span>↳ {retLabel}</span>
                                    <span>${fmtMoney(p.retention.monto)}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <div className="flex justify-between font-medium text-green-600">
                            <span>Total pagos</span>
                            <span>-${fmtMoney(res.paymentsTotal)}</span>
                          </div>
                        </div>
                      )}
                      {res.financial && (
                        <div className="grid grid-cols-2 gap-2 border-t pt-2 text-xs sm:grid-cols-4" data-testid={`invoice-room-financial-${res.reservationCode}`}>
                          <div><p className="text-muted-foreground">Facturado</p><p className="font-semibold text-orange-600">{fmtMoney(res.financial.invoiced)}</p></div>
                          <div><p className="text-muted-foreground">Anticipo disponible</p><p className="font-semibold text-amber-600">{fmtMoney(res.financial.nonFiscalAdvances)}</p></div>
                          <div><p className="text-muted-foreground">Disponible fiscal</p><p className="font-semibold text-emerald-600">{fmtMoney(res.financial.fiscalAvailable)}</p></div>
                          <div><p className="text-muted-foreground">Saldo operativo</p><p className={res.financial.operationalBalance > 0.01 ? "font-semibold text-red-600" : "font-semibold text-green-600"}>{fmtMoney(res.financial.operationalBalance)}</p></div>
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
              onClick={async () => {
                await refreshGroupBillingState();
                const freshSnapshot = queryClient.getQueryData<any>(["/api/groups", groupId, "invoice-snapshot"]);
                const billableSources = (freshSnapshot?.sources ?? [])
                  .filter((source: any) => Number(source.available) > 0);
                const available = availableGroupInvoiceTotal(billableSources);
                const operationalBalance = Number(freshSnapshot?.financial?.operationalBalance ?? 0);
                resetGroupPaymentDialogFields();
                setGroupPaymentReceiptType("factura_b");
                setGroupPaymentRows([{
                  method: "cash",
                  amount: operationalBalance > 0 ? String(operationalBalance) : "",
                  reference: "",
                }]);
                setGroupPaymentItems(gItemsFromSimple(billableSources.map((source: any) => ({
                  descripcion: `${source.destination} — ${source.concept}`,
                  precioUnitario: Number(source.available),
                }))));
                // Pre-fill receptor (razón social, CUIT, Condición IVA) from group config
                if (!prefillGroupReceptorFromBillingEntity()) {
                  setGroupPaymentCcEntityId("");
                  setGroupPaymentCcEntityType("company");
                }
                setPendingGroupPaymentDraft(null);
                if (operationalBalance > 0.009) {
                  setGroupFacturaFromResumen(false);
                  setGroupPaymentDestino("distribute");
                  setShowGroupPaymentDialog(true);
                } else {
                  setGroupFacturaFromResumen(true);
                  setShowGroupFacturaDialog(true);
                }
              }}
              disabled={!invoiceData || Number(invoiceData?.billing?.totals?.available ?? groupInvoiceSnapshot?.totals?.available ?? 0) <= 0}
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
              Generado el {formatHotelDateTime(new Date())} | Maran Suites & Towers
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

      <Dialog open={showGroupPaymentDialog} onOpenChange={(open) => {
        if (!open) {
          // Outside-click / Escape must not silently discard a partially filled
          // payment — confirm first whenever there's anything worth losing.
          const hasUnsavedData = groupPaymentRows.some(r => (parseFloat(r.amount) || 0) > 0)
            || !!groupPaymentRazonSocial.trim()
            || groupPaymentItems.some(it => it.descripcion.trim() || it.precioUnitario > 0);
          if (hasUnsavedData && !window.confirm("Hay datos del pago sin guardar. ¿Cerrar de todas formas?")) {
            return;
          }
        }
        setShowGroupPaymentDialog(open);
        if (!open) {
          resetGroupPaymentDialogFields();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Pago Grupal
            </DialogTitle>
            <DialogDescription>
              Seleccioná primero el receptor y luego definí el cobro o la documentación fiscal
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const isFiscal = ["factura_a", "factura_b", "factura_t", "factura_mipyme_a"].includes(groupPaymentReceiptType);
            const isMipyme = groupPaymentReceiptType === "factura_mipyme_a";
            const isFA = groupPaymentReceiptType === "factura_a";
            // CUIT vs. DNI must follow WHO the receptor is (Empresa/Agencia always has
            // CUIT; only a Huésped may show a DNI instead), never which comprobante is
            // being emitted — a Huésped paying with Factura A still identifies by DNI
            // unless they explicitly provide a CUIT via razón social search.
            const isEntityReceptor = groupPaymentReceptorType === "company" || groupPaymentReceptorType === "agency";
            const rowsTotal = groupPaymentRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
            const retentionsTotal = groupPaymentRows.reduce((s, r) => s + (r.retencionEnabled ? (parseFloat(r.retencionMonto || "0") || 0) : 0), 0);
            const cajaToday = calculateGroupCajaToday(groupPaymentRows);
            const groupHasCheckIn = group.reservations.some((r: any) => r.status === "checked_in");
            const masterAvailable = !!masterFolio && masterFolio.config !== "none" && groupHasCheckIn;
            const isMaster = groupPaymentDestino === "master";
            const priorBalance = isMaster ? (masterFolio?.masterBalance ?? 0) : (folio?.totals.balance ?? 0);
            const isRI = groupPaymentCondicionIva === "Responsable Inscripto" || groupPaymentCondicionIva === "Exento";
            const condicionSupportsFA = isRI;
            const receiptTypeLabels: Record<string, string> = {
              factura_a: "Factura A",
              factura_b: "Factura B",
              factura_mipyme_a: "Factura MiPyme A",
              factura_t: "Factura T",
            };
            // Factura T ("solo alojamiento") is only fiscally valid when the master folio is
            // configured to cover accommodation exclusively — a config="all" master folio
            // also covers extras/cargos grupales, which Factura T cannot legally document.
            const isAccommodationOnlyMaster = isMaster && masterFolio?.config === "accommodation";
            const normalizedNationality = groupPaymentGuestNationality.trim().toLowerCase();
            const normalizedNationalityCode = groupPaymentGuestNationalityCode.trim().toLowerCase();
            const isForeignGuest = groupPaymentReceptorType === "guest"
              && !!(normalizedNationality || normalizedNationalityCode)
              && !["arg", "ar", "200"].includes(normalizedNationalityCode)
              && !["argentina", "argentino", "argentina/a", "argentine"].includes(normalizedNationality);
            const allowFT = isAccommodationOnlyMaster && isForeignGuest;
            const { other: _excl, ...methodsWithoutOther } = PAYMENT_METHOD_LABELS;
            const allowedMethods = groupPaymentReceiptType === "factura_t"
              ? { credit_card: "Tarjeta Crédito", debit_card: "Tarjeta Débito", cuenta_corriente: "Cuenta Corriente" }
              : methodsWithoutOther;
            const hasCuentaCorriente = groupPaymentRows.some(r => r.method === "cuenta_corriente");
            const entityRequired = (isFiscal && !isMipyme) || hasCuentaCorriente;
            const hasEntityData = !!groupPaymentRazonSocial.trim();
            // Fiscal concepts are limited by the source snapshot, independently
            // from what is collected now.
            const itemsTotal = groupPaymentItems.reduce((s, it) => s + it.subtotal, 0);
            const fiscalAvailable = availableGroupInvoiceTotal(groupInvoiceSnapshot?.sources ?? []);
            const nonFiscalAdvances = Number(groupInvoiceSnapshot?.financial?.nonFiscalAdvances ?? 0);
            const requiredCollection = requiredGroupInvoiceCollection(itemsTotal, nonFiscalAdvances);
            const automaticAdvance = Math.max(0, itemsTotal - requiredCollection);
            const closeCollection = groupPaymentCloseAll
              ? groupPaymentSelectedBalance
              : requiredCollection;
            const applicationTotal = groupPaymentCloseAll ? closeCollection : rowsTotal + retentionsTotal;
            const roomBalances = groupPaymentActiveReservations.map((reservation: any) => ({
              id: reservation.id,
              reservation,
              amount: Math.max(0, Number(folio?.reservations?.find((row: any) => row.reservationId === reservation.id)?.balance || 0)),
            }));
            const effectiveAllocationMode = resolveAutomaticGroupRoomAllocationMode(
              groupPaymentDistribution,
              nonFiscalAdvances > 0,
            );
            const cappedApplications = allocateBalanceCappedGroupRooms(
              applicationTotal,
              roomBalances.map((row) => ({ id: row.id, balance: row.amount })),
              groupPaymentDistribution,
              nonFiscalAdvances > 0,
            );
            const roomApplicationPreview = roomBalances.map((row, index) => ({
              ...row,
              applied: cappedApplications.allocations[row.id] || 0,
            }));
            const exceedsFiscalAvailable = isFiscal && exceedsGroupInvoiceAvailable(itemsTotal, fiscalAvailable);
            const conceptsMismatchPayment = isFiscal
              && itemsTotal > 0
              && !groupInvoicePaymentMatchesConcepts(
                rowsTotal + retentionsTotal,
                itemsTotal,
                nonFiscalAdvances,
                {
                  enabled: groupPaymentCloseAll,
                  operationalBalance: closeCollection,
                },
              );

            // Entity search autocomplete
            const entitySearchResults: any[] = groupPaymentEntitySearch.length >= 2
              ? [
                  ...companies.map((c: any) => ({ ...c, _type: "Empresa", _kind: "company" })),
                  ...agencies.map((a: any) => ({ ...a, _type: "Agencia", _kind: "agency" })),
                ].filter((e: any) => {
                  const name = (e.razonSocial || e.nombreFantasia || "").toLowerCase();
                  const cuitVal = (e.cuilCuit || "").replace(/-/g, "");
                  return name.includes(groupPaymentEntitySearch.toLowerCase()) || cuitVal.includes(groupPaymentEntitySearch.replace(/-/g, ""));
                }).slice(0, 8)
              : [];

            // Comprobante types are strictly split by Condición IVA: Responsable
            // Inscripto/Exento may only receive Factura A/MiPyme A (never Ticket/B),
            // while every other condición may only receive Ticket/Factura B (never
            // A/MiPyme A). Factura T and Voucher Habitaciones sit outside this split
            // (foreign-guest and no-comprobante rules respectively). Call this any
            // time the receptor's condición changes so the current selection — and
            // the dropdown's visible options — stay consistent with the new value.
            const applyStrictComprobanteForCondicion = (condicion: string) => {
              const supportsFA = condicion === "Responsable Inscripto" || condicion === "Exento";
              setGroupPaymentReceiptType(prev => {
                if (prev === "sin_comprobante" || prev === "factura_t") return prev;
                const prevIsFAFamily = prev === "factura_a" || prev === "factura_mipyme_a";
                if (supportsFA && !prevIsFAFamily) return "factura_a";
                if (!supportsFA && prevIsFAFamily) return "factura_b";
                return prev;
              });
            };

            const selectGroupEntity = (e: any) => {
              setGroupPaymentRazonSocial(e.razonSocial || e.nombreFantasia || "");
              setGroupPaymentCuit(e.cuilCuit ? String(e.cuilCuit).replace(/-/g, "") : "");
              setGroupPaymentDni("");
              const cond = e.condicionIva ? normalizeCondicionIva(e.condicionIva) : (e.cuilCuit ? "Responsable Inscripto" : "Consumidor Final");
              setGroupPaymentCondicionIva(cond);
              setGroupPaymentDomicilio(e.direccion || e.domicilio || "");
              setGroupPaymentCcEntityType(e._kind);
              setGroupPaymentCcEntityId(e.id);
              setGroupPaymentEntitySearch("");
              setGroupPaymentShowEntityDropdown(false);
              setGroupPaymentReceptorLocked(true);
              applyStrictComprobanteForCondicion(cond);
            };

            const clearGroupReceptor = () => {
              setGroupPaymentRazonSocial("");
              setGroupPaymentCuit("");
              setGroupPaymentDni("");
              setGroupPaymentCondicionIva("Consumidor Final");
              setGroupPaymentDomicilio("");
              setGroupPaymentCcEntityId("");
              setGroupPaymentGuestId(null);
              setGroupPaymentGuestNationality("");
              setGroupPaymentGuestNationalityCode("");
              setGroupPaymentReceptorLocked(false);
            };

            const posElectronicos = (posConfigsData as any[]).filter((p: any) => p.activo && p.tipo === "electronico");

            return (
              <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Saldo operativo</p>
                    <p className={priorBalance > 0 ? "font-semibold text-red-600" : "font-semibold text-green-600"}>{fmtMoney(priorBalance)}</p>
                  </div>
                  <div>
                      <p className="text-xs text-muted-foreground">Fuentes fiscales disponibles</p>
                    <p className="font-semibold text-primary">{fmtMoney(Number(groupInvoiceSnapshot?.totals?.available ?? 0))}</p>
                  </div>
                  <div>
                      <p className="text-xs text-muted-foreground">Anticipos no fiscales previos</p>
                    <p className="font-semibold text-amber-600">{fmtMoney(nonFiscalAdvances)}</p>
                  </div>
                  <div>
                      <p className="text-xs text-muted-foreground">Nuevo cobro</p>
                    <p className="font-semibold">{fmtMoney(rowsTotal + retentionsTotal)}</p>
                  </div>
                </div>
                {/* 1. RECEPTOR */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">1. Receptor del comprobante</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "guest", label: "Huésped" },
                      { value: "company", label: "Empresa" },
                      { value: "agency", label: "Agencia" },
                    ] as const).map(opt => (
                      <button key={opt.value} type="button"
                        disabled={groupPaymentReceptorLocked}
                        onClick={() => { setGroupPaymentReceptorType(opt.value); clearGroupReceptor(); }}
                        className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${groupPaymentReceptorType === opt.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground"} ${groupPaymentReceptorLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                        data-testid={`button-group-receptor-${opt.value}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {groupPaymentReceptorType === "guest" ? (
                    <GuestSearchCombobox
                      label=""
                      selectedGuestId={groupPaymentGuestId}
                      selectedGuestName={groupPaymentGuestId ? groupPaymentRazonSocial : null}
                      placeholder="Buscar huésped por nombre, apellido o documento..."
                      onGuestSelect={async (guest) => {
                        setGroupPaymentGuestId(guest.id);
                        setGroupPaymentRazonSocial(`${guest.lastName} ${guest.firstName}`.trim());
                        setGroupPaymentDni(guest.documentNumber || "");
                        setGroupPaymentCuit("");
                        setGroupPaymentCondicionIva("Consumidor Final");
                        applyStrictComprobanteForCondicion("Consumidor Final");
                        setGroupPaymentCcEntityType("company");
                        setGroupPaymentCcEntityId("");
                        setGroupPaymentReceptorLocked(true);
                        try {
                          const res = await apiRequest("GET", `/api/guests/${guest.id}`);
                          const full = await res.json();
                          if (full?.direccion) setGroupPaymentDomicilio(full.direccion);
                           setGroupPaymentGuestNationality(String(full?.nationality || ""));
                           setGroupPaymentGuestNationalityCode(String(full?.nationalityCode || ""));
                          if (full?.vatCondition) {
                            // Guests store condición IVA as a lowercase snake_case enum
                            // (e.g. "responsable_inscripto"), not the Title-Case labels
                            // this dialog's Select uses — normalize it or the field
                            // silently fails to match any option and looks unset.
                            const normalized = normalizeCondicionIva(full.vatCondition);
                            setGroupPaymentCondicionIva(normalized);
                            applyStrictComprobanteForCondicion(normalized);
                          }
                        } catch {}
                      }}
                      onClear={() => clearGroupReceptor()}
                      data-testid="combobox-group-payment-guest"
                    />
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Search className="w-3 h-3" /> Buscar {groupPaymentReceptorType === "company" ? "empresa" : "agencia"} para autocompletar
                      </Label>
                      {groupPaymentReceptorLocked ? (
                        <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm bg-muted/30">
                          <span className="font-medium">{groupPaymentRazonSocial}</span>
                          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={clearGroupReceptor}>Cambiar</Button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            value={groupPaymentEntitySearch}
                            onChange={e => { setGroupPaymentEntitySearch(e.target.value); setGroupPaymentShowEntityDropdown(true); }}
                            onFocus={() => setGroupPaymentShowEntityDropdown(true)}
                            onBlur={() => setTimeout(() => setGroupPaymentShowEntityDropdown(false), 200)}
                            placeholder="Nombre o CUIT..."
                            className="text-sm"
                            data-testid="input-group-entity-search"
                          />
                          {groupPaymentShowEntityDropdown && entitySearchResults.filter((e: any) => e._kind === groupPaymentReceptorType).length > 0 && (
                            <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                              {entitySearchResults.filter((e: any) => e._kind === groupPaymentReceptorType).map((e: any) => (
                                <button key={e.id} type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted cursor-pointer flex items-center justify-between"
                                  onMouseDown={() => selectGroupEntity(e)}>
                                  <span className="font-medium">{e.razonSocial || e.nombreFantasia}</span>
                                  {e.cuilCuit && <span className="text-muted-foreground text-xs">{e.cuilCuit}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                          {groupPaymentShowEntityDropdown && groupPaymentEntitySearch.length >= 2 && entitySearchResults.filter((e: any) => e._kind === groupPaymentReceptorType).length === 0 && (
                            <div className="absolute z-50 w-full bg-popover border rounded-md shadow-sm mt-1 px-3 py-2 text-sm text-muted-foreground">
                              Sin resultados
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Datos fiscales — bloqueados salvo domicilio, una vez seleccionado el receptor */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">{isEntityReceptor ? "Razón Social *" : "Nombre y Apellido *"}</Label>
                      <Input value={groupPaymentRazonSocial} readOnly={groupPaymentReceptorLocked}
                        className={groupPaymentReceptorLocked ? "bg-muted/40" : ""}
                        onChange={e => !groupPaymentReceptorLocked && setGroupPaymentRazonSocial(e.target.value)}
                        placeholder={groupPaymentReceptorType === "guest" ? "Seleccioná un huésped..." : "EMPRESA S.A."} data-testid="input-group-razon-social" />
                    </div>
                    {isEntityReceptor ? (
                      <div className="space-y-1">
                        <Label className="text-xs">CUIT *</Label>
                        <Input value={groupPaymentCuit} readOnly={groupPaymentReceptorLocked}
                          className={groupPaymentReceptorLocked ? "bg-muted/40" : ""}
                          onChange={e => {
                            if (groupPaymentReceptorLocked) return;
                            const d = e.target.value.replace(/\D/g, "").slice(0, 11);
                            const f = d.length <= 2 ? d : d.length <= 10 ? `${d.slice(0,2)}-${d.slice(2)}` : `${d.slice(0,2)}-${d.slice(2,10)}-${d[10]}`;
                            setGroupPaymentCuit(f);
                          }} placeholder="XX-XXXXXXXX-X" data-testid="input-group-cuit" />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label className="text-xs">DNI (opcional)</Label>
                        <Input value={groupPaymentDni} readOnly={groupPaymentReceptorLocked}
                          className={groupPaymentReceptorLocked ? "bg-muted/40" : ""}
                          onChange={e => !groupPaymentReceptorLocked && setGroupPaymentDni(e.target.value)} placeholder="00000000" data-testid="input-group-dni" />
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Condición IVA</Label>
                      <Select value={groupPaymentCondicionIva} onValueChange={v => {
                        setGroupPaymentCondicionIva(v);
                        applyStrictComprobanteForCondicion(v);
                      }} disabled={groupPaymentReceptorLocked}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CONDICION_IVA_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Domicilio (opcional)</Label>
                      <Input value={groupPaymentDomicilio} onChange={e => setGroupPaymentDomicilio(e.target.value)} placeholder="Calle 123, Ciudad" data-testid="input-group-domicilio" />
                    </div>
                  </div>

                  {entityRequired && !hasEntityData && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Seleccioná o completá el receptor del comprobante.
                    </p>
                  )}
                </div>

                {!groupPaymentReceptorLocked && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Seleccioná un receptor para habilitar las siguientes secciones.
                  </p>
                )}
                <fieldset disabled={!groupPaymentReceptorLocked} className={!groupPaymentReceptorLocked ? "opacity-50" : ""}>
                <div className="border-t" />

                {/* 2. COMPROBANTE */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">2. Comprobante</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button"
                      onClick={() => {
                        setGroupPaymentReceiptType("sin_comprobante");
                        setGroupInvoiceDistribution(groupPaymentDestino === "master" ? "none" : "detallados");
                        setGroupPaymentRows((rows) => rows.map((row) => ({ ...row, amount: "" })));
                        setGroupPaymentItems([gNewItem()]);
                      }}
                      className={`rounded-md border px-3 py-2 text-sm font-medium text-left transition-colors ${!isFiscal ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground"}`}
                      data-testid="button-group-sin-comprobante">
                      Anticipo
                    </button>
                    <button type="button"
                      onClick={() => {
                        if (groupPaymentReceiptType === "sin_comprobante") {
                          setGroupPaymentReceiptType(condicionSupportsFA ? "factura_a" : "factura_b");
                        }
                        // Fiscal lines always originate in the immutable invoice
                        // snapshot, rather than from the amount being collected.
                        const sources = (groupInvoiceSnapshot?.sources ?? []).filter((source: any) => Number(source.available) > 0);
                        const sourceTotal = sources.reduce((sum: number, source: any) => sum + Number(source.available || 0), 0);
                        const required = requiredGroupInvoiceCollection(
                          sourceTotal,
                          Number(groupInvoiceSnapshot?.financial?.nonFiscalAdvances ?? 0),
                        );
                        setGroupPaymentRows((rows) => rows.map((row, index) =>
                          index === 0 ? { ...row, amount: required > 0 ? String(required) : "" } : { ...row, amount: "" }
                        ));
                        setGroupPaymentItems(gItemsFromSimple(sources.map((source: any) => ({
                          descripcion: `${source.destination} — ${source.concept}`,
                          precioUnitario: Number(source.available),
                        }))));
                      }}
                      className={`rounded-md border px-3 py-2 text-sm font-medium text-left transition-colors ${isFiscal ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground"}`}
                      data-testid="button-group-con-comprobante">
                      Emitir comprobante
                    </button>
                  </div>

                  {isFiscal && (
                    <div className="space-y-1">
                      <Select value={groupPaymentReceiptType} onValueChange={setGroupPaymentReceiptType}>
                        <SelectTrigger data-testid="select-group-payment-receipt">
                          <SelectValue placeholder="Seleccionar comprobante..." />
                        </SelectTrigger>
                        <SelectContent>
                           {/* Grupos only issues fiscal documents; advances have no receipt. */}
                          {condicionSupportsFA && <SelectItem value="factura_a">Factura A</SelectItem>}
                          {!condicionSupportsFA && <SelectItem value="factura_b">Factura B</SelectItem>}
                          {condicionSupportsFA && <SelectItem value="factura_mipyme_a">Factura MiPyme A</SelectItem>}
                          {allowFT && <SelectItem value="factura_t">Factura T (solo alojamiento)</SelectItem>}
                        </SelectContent>
                      </Select>
                      {isFiscal && !isMipyme && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Al registrar se abrirá el formulario de emisión con CAE real de ARCA.
                        </p>
                      )}
                      {isMipyme && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          MiPyme A: no requiere forma de pago (cobro diferido hasta 30 días).
                        </p>
                      )}
                      {!condicionSupportsFA && (
                        <p className="text-xs text-muted-foreground">Factura A / MiPyme A solo disponibles para Responsable Inscripto o Exento.</p>
                      )}
                    </div>
                  )}
                </div>
                {/* 3. PRIMARY APPLICATION MODE */}
                {masterAvailable && (
                  <>
                    <div className="border-t" />
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">3. Aplicación principal del cobro</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button"
                          onClick={() => changeGroupPaymentDestino("distribute")}
                          className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${!isMaster ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground"}`}
                            aria-pressed={!isMaster}
                          data-testid="button-group-destino-distribute">
                          <p className="font-medium">Cobro distribuido en habitaciones</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Distribuye al saldo de las reservas activas</p>
                        </button>
                        <button type="button"
                          onClick={() => {
                            changeGroupPaymentDestino("master");
                            // Factura T only covers accommodation-only master folios.
                            if (groupPaymentReceiptType === "factura_t" && masterFolio?.config !== "accommodation") {
                              setGroupPaymentReceiptType("factura_b");
                            }
                          }}
                          className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${isMaster ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground"}`}
                            aria-pressed={isMaster}
                          data-testid="button-group-destino-master">
                          <p className="font-medium">Cobro dirigido al Folio Maestro</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Concentra el cobro en el folio del grupo</p>
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* 4. PUNTO DE VENTA (solo fiscal) */}
                {isFiscal && posElectronicos.length > 0 && (
                  <>
                    <div className="border-t" />
                    <div className="space-y-1">
                      <Label className="text-sm font-semibold">4. Punto de Venta (ARCA)</Label>
                      <Select value={groupPaymentPvNum} onValueChange={setGroupPaymentPvNum}>
                        <SelectTrigger><SelectValue placeholder="PV por defecto (configuración)" /></SelectTrigger>
                        <SelectContent>
                          {posElectronicos.map((p: any) => (
                            <SelectItem key={p.id} value={String(p.numero)}>
                              PV {String(p.numero).padStart(4, "0")} — {p.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Si no se selecciona, se usa el PV configurado en Facturación.</p>
                    </div>
                  </>
                )}

                {/* 5. DETALLE DEL RECIBO / CONCEPTOS FISCALES */}
                {!isFiscal && (
                  <>
                    <div className="border-t" />
                    <div className="space-y-2" data-testid="group-advance-breakdown">
                      <Label className="text-sm font-semibold">5. Detalle del recibo</Label>
                      <p className="text-xs text-muted-foreground">
                        El anticipo puede ser parcial. El detalle se calcula desde el total ingresado, sin exigir una carga manual por habitación.
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { value: "none", label: "Sin desglose", desc: "Un concepto global" },
                          { value: "totalizados", label: "Totalizados", desc: "Alojamiento + consumos" },
                          { value: "detallados", label: "Detallados", desc: "Por habitación y cargo" },
                        ] as const).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setGroupInvoiceDistribution(option.value)}
                            className={`rounded-md border px-2 py-2 text-left text-xs transition-colors ${groupInvoiceDistribution === option.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground"}`}
                            aria-pressed={groupInvoiceDistribution === option.value}
                            data-testid={`button-group-advance-breakdown-${option.value}`}
                          >
                            <p className="font-semibold">{option.label}</p>
                            <p className="mt-0.5 text-muted-foreground">{option.desc}</p>
                          </button>
                        ))}
                      </div>
                      {groupPaymentGrossPaymentTotal > 0 && (
                        <div className="space-y-1 rounded-lg border bg-muted/20 p-2 text-xs" data-testid="group-advance-breakdown-preview">
                          {(groupPaymentReceiptConcepts.length > 0
                            ? groupPaymentReceiptConcepts
                            : [{ descripcion: `Anticipo grupo ${group?.name || groupId}`, precioUnitario: groupPaymentGrossPaymentTotal }]
                          ).map((concept, index) => (
                            <div key={`${concept.descripcion}-${index}`} className="flex justify-between gap-3">
                              <span>{concept.descripcion}</span>
                              <span className="font-medium tabular-nums">{fmtMoney(concept.precioUnitario)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between border-t pt-1 font-semibold">
                            <span>Total del recibo</span>
                            <span>{fmtMoney(groupPaymentGrossPaymentTotal)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {isFiscal && (
                  <>
                    <div className="border-t" />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">5. Conceptos</Label>
                        {!isAccommodationOnlyMaster && <Button variant="outline" size="sm" type="button"
                          onClick={() => setGroupPaymentItems(p => [...p, gNewItem()])}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Agregar ítem
                        </Button>}
                      </div>
                      <p className="text-xs text-muted-foreground">Ingrese precios con IVA incluido</p>

                      {groupInvoiceSnapshot?.totals && Number(groupInvoiceSnapshot.totals.eligible) > 0 && (
                        <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/20 p-2 text-xs">
                          <div><p className="text-muted-foreground">Facturable</p><p className="font-semibold">{fmtMoney(groupInvoiceSnapshot.totals.eligible)}</p></div>
                          <div><p className="text-muted-foreground">Facturado</p><p className="font-semibold text-orange-600">{fmtMoney(groupInvoiceSnapshot.totals.invoiced)}</p></div>
                          <div><p className="text-muted-foreground">Disponible</p><p className="font-semibold text-emerald-600">{fmtMoney(groupInvoiceSnapshot.totals.available)}</p></div>
                        </div>
                      )}

                      {/* An accommodation-only master can only document the
                          source-backed accommodation lines. */}
                      {isAccommodationOnlyMaster && (
                        <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-2">
                          <p className="font-medium">Alojamiento del grupo</p>
                          <p className="text-xs text-muted-foreground">Los conceptos se generan desde los cargos de alojamiento disponibles; no se admiten extras ni conceptos manuales.</p>
                          <Button type="button" size="sm" variant="outline" onClick={() => {
                            const sources = (groupInvoiceSnapshot?.sources ?? []).filter((source: any) =>
                              Number(source.available) > 0 && /alojamiento/i.test(`${source.concept ?? ""} ${source.destination ?? ""}`)
                            );
                            setGroupInvoiceDistribution("none");
                            setGroupPaymentItems(gItemsFromSimple(sources.map((source: any) => ({
                              descripcion: source.concept || `Alojamiento grupo ${group?.name ?? ""}`,
                              precioUnitario: Number(source.available),
                            }))));
                          }}>
                            Generar detalle de alojamiento
                          </Button>
                        </div>
                      )}
                      {/* Quick fill from folio */}
                      {!isMipyme && !isAccommodationOnlyMaster && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Completar desde folio:</Label>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { value: "none", label: "Sin desglose", desc: "1 ítem total" },
                              { value: "totalizados", label: "Totalizados", desc: "Alojamiento + Consumos" },
                              { value: "detallados", label: "Detallados", desc: "Ítem por hab. y cargo" },
                            ] as const).map(opt => (
                              <button key={opt.value} type="button"
                                  onClick={() => {
                                  setGroupInvoiceDistribution(opt.value);
                                   setGroupPaymentItems(gItemsFromSimple(buildGroupInvoiceItems(
                                     groupInvoiceSnapshot?.sources ?? [],
                                     opt.value,
                                     group?.name ?? "",
                                   )));
                                }}
                                className={`rounded-md border px-2 py-2 text-left transition-colors text-xs ${groupInvoiceDistribution === opt.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground"}`}>
                                <p className="font-semibold">{opt.label}</p>
                                <p className="text-muted-foreground mt-0.5">{opt.desc}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Editable items */}
                      {!isAccommodationOnlyMaster && <div className="space-y-2">
                        {groupPaymentItems.map((item, idx) => (
                          <div key={idx} className="border rounded-lg p-3 space-y-2">
                            <div className="grid grid-cols-12 gap-2">
                              <div className="col-span-5 space-y-1 min-w-0">
                                <Label className="text-xs">Descripción *</Label>
                                <Input value={item.descripcion}
                                  onChange={e => setGroupPaymentItems(p => gUpdateItem(p, idx, "descripcion", e.target.value))}
                                  placeholder="Hospedaje habitación..." className="h-8 text-sm" />
                              </div>
                              <div className="col-span-2 space-y-1 min-w-0">
                                <Label className="text-xs">Cant.</Label>
                                <Input type="number" min="1" value={item.cantidad}
                                  onChange={e => setGroupPaymentItems(p => gUpdateItem(p, idx, "cantidad", parseFloat(e.target.value) || 1))}
                                  className="h-8 text-sm" />
                              </div>
                              <div className="col-span-3 space-y-1 min-w-0">
                                <Label className="text-xs">P. Unit.</Label>
                                <Input type="number" step="0.01" value={item.precioUnitario || ""}
                                  onChange={e => setGroupPaymentItems(p => gUpdateItem(p, idx, "precioUnitario", parseFloat(e.target.value) || 0))}
                                  placeholder="0.00" className="h-8 text-sm min-w-0 tabular-nums" />
                              </div>
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs">Alíc. IVA</Label>
                                <Select value={item.alicuotaIva}
                                  onValueChange={v => setGroupPaymentItems(p => gUpdateItem(p, idx, "alicuotaIva", v))}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="21">21%</SelectItem>
                                    <SelectItem value="10.5">10.5%</SelectItem>
                                    <SelectItem value="exento">Exento</SelectItem>
                                    <SelectItem value="no_gravado">No Grav.</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                Total con IVA: {fmtMoney(item.subtotal)} (neto: {fmtMoney(item.subtotalNeto)})
                              </span>
                              {groupPaymentItems.length > 1 && (
                                <Button variant="ghost" size="sm" type="button"
                                  className="text-red-500 hover:text-red-700 h-6 text-xs"
                                  onClick={() => setGroupPaymentItems(p => p.filter((_, i) => i !== idx))}>
                                  Quitar
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>}

                      {!isMaster && roomApplicationPreview.length > 0 && (
                        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2" data-testid="group-room-application-preview">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">Aplicación prevista por habitación</p>
                            <span className="text-xs text-muted-foreground">
                              {effectiveAllocationMode === "proportional"
                                ? "Proporcional al saldo restante"
                                : "Partes iguales"}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {roomApplicationPreview.map(({ reservation, applied }) => (
                              <div key={reservation.id} className="rounded-md border bg-background px-2 py-1.5">
                                <p className="text-xs text-muted-foreground">Hab. {reservation.room?.roomNumber || "—"}</p>
                                <p className="font-semibold tabular-nums">{fmtMoney(applied)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Total preview */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg border bg-muted/30 p-3 text-sm" data-testid="group-fiscal-amount-summary">
                        <div>
                          <p className="text-xs text-muted-foreground">Total documento fiscal (bruto)</p>
                          <p className="font-semibold">{fmtMoney(itemsTotal)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Anticipos no fiscales previos aplicados</p>
                          <p className="font-semibold text-amber-600">{fmtMoney(automaticAdvance)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Cobro de hoy</p>
                          <p className="font-semibold text-green-600">{fmtMoney(groupPaymentCloseAll ? closeCollection : requiredCollection)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total cubierto</p>
                          <p className="font-semibold">{fmtMoney(automaticAdvance + (groupPaymentCloseAll ? closeCollection : requiredCollection))}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        El anticipo ya fue cobrado: se aplica a la liquidación, pero no reduce el total del documento fiscal.
                      </p>
                      {exceedsFiscalAvailable && (
                        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1" data-testid="text-items-payment-mismatch">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Los conceptos superan el disponible para facturar ({fmtMoney(fiscalAvailable)}). Ajustá los conceptos de origen.
                        </p>
                      )}
                      {conceptsMismatchPayment && (
                        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1" data-testid="text-concepts-payment-mismatch">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          El cobro nuevo debe ser {fmtMoney(!isMaster && groupPaymentCloseAll ? closeCollection : requiredCollection)}. Se aplican automáticamente {fmtMoney(automaticAdvance)} de adelantos no fiscalizados a la factura de {fmtMoney(itemsTotal)}.
                        </p>
                      )}
                    </div>
                  </>
                )}

                <div className="border-t" />

                {/* 6. MEDIOS DE PAGO (+ retenciones) */}
                {!isMipyme && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">6. Forma de pago</Label>
                      {groupPaymentRows.length < 4 && Object.keys(allowedMethods).length > groupPaymentRows.length && (
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                          onClick={() => setGroupPaymentRows(prev => [...prev, {method: "transfer", amount: "", reference: ""}])}>
                          <Plus className="h-3 w-3" />
                          Agregar método
                        </Button>
                      )}
                    </div>
                    {groupPaymentRows.map((row, idx) => (
                      <div key={idx} className="space-y-1 border rounded-md p-2">
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
                          <Select value={row.method}
                            onValueChange={v => setGroupPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, method: v, ...(v === "cuenta_corriente" ? { retencionEnabled: false, retencionMonto: "" } : {})} : r))}>
                            <SelectTrigger data-testid={`select-group-payment-method-${idx}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(allowedMethods).filter(([k]) => !groupPaymentRows.some((r, i) => i !== idx && r.method === k)).map(([k, label]) => (
                                <SelectItem key={k} value={k}>{label as string}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input type="number" inputMode="decimal" step="0.01" min={0} placeholder="Monto"
                            value={row.amount}
                            onChange={e => setGroupPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, amount: e.target.value} : r))}
                            className="min-w-0 tabular-nums"
                            data-testid={`input-group-payment-amount-${idx}`} />
                          <Input
                            value={row.reference}
                            placeholder={isFiscal ? "Referencia" : "Referencia *"}
                            aria-label={`Referencia del medio de pago ${idx + 1}`}
                            className="h-9 min-w-0"
                            onChange={e => setGroupPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, reference: e.target.value} : r))}
                            data-testid={`input-group-payment-reference-${idx}`}
                          />
                          {groupPaymentRows.length > 1 ? (
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive/70 hover:text-destructive shrink-0"
                              onClick={() => setGroupPaymentRows(prev => prev.filter((_, i) => i !== idx))}>
                              <X className="h-4 w-4" />
                            </Button>
                          ) : <div className="w-9" />}
                        </div>
                        {!isFiscal && parseFloat(row.amount || "0") > 0 && !row.reference.trim() && (
                          <p className="text-xs text-destructive pl-1">La referencia es obligatoria para registrar un Anticipo.</p>
                        )}
                        {row.method !== "cuenta_corriente" ? (
                          !row.retencionEnabled ? (
                            <button type="button" className="text-xs text-muted-foreground underline pl-1"
                              onClick={() => setGroupPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, retencionEnabled: true, retencionTipo: "iibb"} : r))}
                              data-testid={`button-group-add-retencion-${idx}`}>
                              + Agregar retención
                            </button>
                          ) : (
                            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center bg-muted/20 rounded p-2">
                              <Select value={row.retencionTipo} onValueChange={v => setGroupPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, retencionTipo: v as "iibb" | "ganancias"} : r))}>
                                <SelectTrigger className="h-8 text-xs" data-testid={`select-group-retencion-tipo-${idx}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="iibb">Retención IIBB</SelectItem>
                                  <SelectItem value="ganancias">Retención Ganancias</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input type="number" step="0.01" min={0} placeholder="Monto retenido" className="h-8 text-xs"
                                value={row.retencionMonto || ""}
                                onChange={e => setGroupPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, retencionMonto: e.target.value} : r))}
                                data-testid={`input-group-retencion-monto-${idx}`} />
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive/70"
                                onClick={() => setGroupPaymentRows(prev => prev.map((r, i) => i === idx ? {...r, retencionEnabled: false, retencionMonto: ""} : r))}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                              <p className="col-span-3 text-[11px] text-muted-foreground">
                                Neto {fmtMoney(parseFloat(row.amount) || 0)} + Retención {fmtMoney(parseFloat(row.retencionMonto || "0") || 0)} = Cubre {fmtMoney((parseFloat(row.amount) || 0) + (parseFloat(row.retencionMonto || "0") || 0))}
                              </p>
                            </div>
                          )
                        ) : (
                          <p className="text-[11px] text-muted-foreground pl-1">
                            Las retenciones sobre Cuenta Corriente se registran cuando la empresa/agencia cancele el saldo.
                          </p>
                        )}
                      </div>
                    ))}
                    {groupPaymentRows.length > 1 && (
                      <div className="flex justify-end text-sm font-semibold border-t pt-2">
                        Total cubierto: <span className="ml-1">{fmtMoney(rowsTotal + retentionsTotal)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 7. DISTRIBUCIÓN + CIERRE DIRIGIDO */}
                <>
                  <div className="border-t" />
                  <div className={`grid grid-cols-1 ${!isMaster ? "sm:grid-cols-2" : ""} gap-4`}>
                    {!isMaster && (
                      <div>
                        <Label>Modo automático entre habitaciones</Label>
                        <Select value={effectiveAllocationMode} onValueChange={setGroupPaymentDistribution}>
                          <SelectTrigger data-testid="select-group-payment-distribution"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {nonFiscalAdvances <= 0 && <SelectItem value="equal">Partes iguales</SelectItem>}
                            <SelectItem value="proportional">
                              {nonFiscalAdvances > 0 ? "Proporcional al saldo restante (por anticipo previo)" : "Proporcional al saldo"}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                          <p className="text-xs text-muted-foreground mt-1">
                          {effectiveAllocationMode === "equal"
                            ? "Solo asignación operativa entre reservas activas; no altera las fuentes fiscales."
                            : "Asignación operativa proporcional al saldo pendiente; no altera las fuentes fiscales."}
                        </p>
                      </div>
                    )}
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                      <Checkbox
                        id="close-all-rooms"
                        checked={groupPaymentCloseAll}
                        onCheckedChange={(value) => {
                          const checked = !!value;
                          setGroupPaymentCloseAll(checked);
                          const nextIds = checked ? groupPaymentActiveReservations.map((reservation) => reservation.id) : [];
                          const nextAmounts = Object.fromEntries(nextIds.map((reservationId) => {
                            const row = folio?.reservations?.find((reservation) => reservation.reservationId === reservationId);
                            return [reservationId, Math.max(0, Number(row?.balance || 0)).toFixed(2)];
                          }));
                          setGroupPaymentCloseReservationIds(nextIds);
                          setGroupPaymentCloseAmounts(nextAmounts);
                        }}
                        data-testid="checkbox-close-all-rooms"
                      />
                      <div className="space-y-1">
                        <label htmlFor="close-all-rooms" className="text-sm font-medium cursor-pointer leading-tight">
                          Cerrar habitaciones elegidas con este pago
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Confirmá el saldo exacto de cada reserva. Esta asignación es dirigida por habitación (no se reparte en partes iguales). Las que están en casa pasan a limpieza; las confirmadas se cierran sin generar limpieza.
                        </p>
                      </div>
                    </div>
                    {groupPaymentCloseAll && Math.abs(closeCollection - (rowsTotal + retentionsTotal)) > 0.009 && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200" data-testid="directed-close-amount-warning">
                        El cierre dirigido totaliza {fmtMoney(closeCollection)}, pero los medios de pago y retenciones suman {fmtMoney(rowsTotal + retentionsTotal)}. Revisá el desajuste: los medios de pago no se modificaron automáticamente.
                      </div>
                    )}
                  </div>
                    {groupPaymentCloseAll && (
                      <div className="rounded-lg border p-3 space-y-2" data-testid="group-close-room-selection">
                        <div className="flex items-center justify-between gap-3">
                          <Label className="text-sm font-semibold">Habitaciones a cerrar</Label>
                          <span className="text-sm font-medium">Saldo seleccionado: {fmtMoney(groupPaymentSelectedBalance)}</span>
                        </div>
                        {groupPaymentActiveReservations.map((reservation) => {
                          const folioRow = folio?.reservations?.find((row) => row.reservationId === reservation.id);
                          const selected = groupPaymentCloseReservationIds.includes(reservation.id);
                          const expectedBalance = Math.max(0, Number(folioRow?.balance || 0));
                          return (
                            <div key={reservation.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                              <span className="flex items-center gap-2">
                                <Checkbox
                                  checked={selected}
                                  onCheckedChange={(value) => {
                                    const nextIds = value
                                      ? [...groupPaymentCloseReservationIds, reservation.id]
                                      : groupPaymentCloseReservationIds.filter((id) => id !== reservation.id);
                                    const nextAmounts = { ...groupPaymentCloseAmounts };
                                    if (value) nextAmounts[reservation.id] = expectedBalance.toFixed(2);
                                    else delete nextAmounts[reservation.id];
                                    setGroupPaymentCloseReservationIds(nextIds);
                                    setGroupPaymentCloseAmounts(nextAmounts);
                                  }}
                                  data-testid={`checkbox-close-reservation-${reservation.id}`}
                                />
                                <span className="text-sm">
                                  Hab. {reservation.room?.roomNumber || "—"} · {reservation.status === "checked_in" ? "En casa" : "Confirmada"}
                                </span>
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Saldo {fmtMoney(expectedBalance)}</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="h-8 w-28 text-right"
                                  disabled={!selected}
                                  value={groupPaymentCloseAmounts[reservation.id] || ""}
                                  onChange={(event) => {
                                    const nextAmounts = { ...groupPaymentCloseAmounts, [reservation.id]: event.target.value };
                                    setGroupPaymentCloseAmounts(nextAmounts);
                                  }}
                                  aria-label={`Importe para habitación ${reservation.room?.roomNumber || "sin asignar"}`}
                                  data-testid={`input-close-amount-${reservation.id}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                        {groupPaymentCloseReservationIds.length === 0 && (
                          <p className="text-xs text-destructive">Elegí al menos una habitación para cerrar.</p>
                        )}
                        {!groupPaymentCloseAssignmentsValid && (
                          <p className="text-xs text-destructive">Cada importe debe coincidir exactamente con el saldo de su reserva.</p>
                        )}
                      </div>
                    )}
                </>

                <div className="border-t" />

                {/* 8. RESUMEN */}
                <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1.5"><Receipt className="h-4 w-4" /> Resumen antes de emitir</Label>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Receptor</span><span className="font-medium text-right">{groupPaymentRazonSocial || "—"}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Comprobante</span><span className="font-medium text-right">{isFiscal ? (receiptTypeLabels[groupPaymentReceiptType] || groupPaymentReceiptType) : "Anticipo"}</span></div>
                    {isFiscal && posElectronicos.length > 0 && (
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Punto de Venta</span><span className="font-medium">{groupPaymentPvNum ? `PV ${groupPaymentPvNum.padStart(4, "0")}` : "Por defecto"}</span></div>
                    )}
                    {masterAvailable && (
                        <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Aplicación</span><span className="font-medium">{isMaster ? "Dirigida al Folio Maestro" : "Automática entre habitaciones"}</span></div>
                    )}
                    {isFiscal && (
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Total documento fiscal (bruto)</span><span className="font-medium">{fmtMoney(groupPaymentItems.reduce((s, it) => s + it.subtotal, 0))}</span></div>
                    )}
                    {isFiscal && automaticAdvance > 0 && (
                      <div className="flex justify-between gap-2 text-amber-700 dark:text-amber-400"><span>Anticipos no fiscales previos aplicados (ya cobrados)</span><span className="font-medium">-{fmtMoney(automaticAdvance)}</span></div>
                    )}
                    {isFiscal && (
                      <>
                        <div className="flex justify-between gap-2"><span className="text-muted-foreground">Cobro de hoy</span><span className="font-medium">{fmtMoney(groupPaymentCloseAll ? closeCollection : requiredCollection)}</span></div>
                        {groupPaymentCloseAll && closeCollection > requiredCollection + 0.009 && (
                          <div className="flex justify-between gap-2 text-xs"><span className="text-muted-foreground">Porción fiscal del cobro</span><span>{fmtMoney(requiredCollection)}</span></div>
                        )}
                      </>
                    )}
                    <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Medios de pago</span><span className="font-medium text-right">{groupPaymentRows.filter(r => parseFloat(r.amount || "0") > 0).map(r => `${PAYMENT_METHOD_LABELS[r.method] || r.method} ${fmtMoney(parseFloat(r.amount) || 0)}`).join(" + ") || "—"}</span></div>
                    {retentionsTotal > 0 && (
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground shrink-0">Retenciones</span><span className="font-medium">{fmtMoney(retentionsTotal)}</span></div>
                    )}
                    <div className="flex justify-between gap-2 border-t pt-1 font-semibold">
                      <span>{isFiscal ? (cajaToday > 0 ? "Ingreso a Caja hoy" : "Sin ingreso a Caja") : "Total del anticipo"}</span>
                      <span>{isFiscal ? fmtMoney(cajaToday) : fmtMoney(rowsTotal + retentionsTotal)}</span>
                    </div>
                    {isFiscal && (
                      <div className="flex justify-between gap-2 border-t pt-1 font-semibold" data-testid="group-payment-total-settled">
                        <span>Total cubierto</span>
                        <span>{fmtMoney(automaticAdvance + rowsTotal + retentionsTotal)}</span>
                      </div>
                    )}
                  </div>
                </div>
                </fieldset>
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowGroupPaymentDialog(false);
              resetGroupPaymentDialogFields();
            }}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                // Documentation of already-collected accommodation must not
                // manufacture a second, zero-value cash collection.
                if (groupPaymentIsFiscal && groupPaymentRowsTotal <= 0 && groupPaymentFiscalAvailable > 0) {
                  setPendingGroupPaymentDraft(null);
                  setGroupFacturaFromResumen(true);
                  setShowGroupPaymentDialog(false);
                  setShowGroupFacturaDialog(true);
                  return;
                }
                if (groupPaymentIsFiscal) {
                  try {
                    const draft = buildGroupPaymentDraft();
                    setPendingGroupPaymentDraft(draft);
                    setGroupFacturaFromResumen(false);
                    setShowGroupPaymentDialog(false);
                    if (groupPaymentDestino === "master") setShowMasterFacturaDialog(true);
                    else setShowGroupFacturaDialog(true);
                  } catch (error: any) {
                    toast({ title: "No se puede continuar", description: error?.message || "Revisá los datos del cobro.", variant: "destructive" });
                  }
                  return;
                }
                groupPaymentMutation.mutate();
              }}
              disabled={!groupPaymentCanSubmit}
              data-testid="button-confirm-group-payment"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {groupPaymentMutation.isPending ? "Procesando..." : groupPaymentCloseAll ? "Pagar y Cerrar Habitaciones" : groupPaymentDestino === "master" ? "Registrar Pago al Folio Maestro" : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showGroupFacturaDialog && (
        <EmitirFacturaDialog
          open={showGroupFacturaDialog}
          onClose={() => {
            setShowGroupFacturaDialog(false);
            setPendingGroupPaymentDraft(null);
            setGroupFacturaFromResumen(false);
            resetGroupPaymentDialogFields();
          }}
          onBackToSource={groupFacturaFromResumen ? undefined : () => {
            setShowGroupFacturaDialog(false);
            setPendingGroupPaymentDraft(null);
            setShowGroupPaymentDialog(true);
          }}
          config={billingConfig}
          allowedTipos={
            groupPaymentReceiptType === "factura_a" ? ["FA"] :
            groupPaymentReceiptType === "factura_t" ? ["FT"] :
            groupPaymentReceiptType === "factura_mipyme_a" ? ["FM"] :
            ["FB"]
          }
          compactMode={!groupFacturaFromResumen}
          initialValues={{
            ...buildGroupInvoiceRecipientInitialValues({
              razonSocial: groupPaymentRazonSocial,
              fallbackName: group?.name,
              cuit: groupPaymentCuit,
              dni: groupPaymentDni,
              condicionIva: groupPaymentCondicionIva,
              domicilio: groupPaymentDomicilio,
            }),
            items: groupPaymentItems.filter(it => it.descripcion.trim() || it.precioUnitario > 0).map(it => ({
              descripcion: it.descripcion || `Pago grupal — ${group?.name ?? ""}`,
              precioUnitario: it.precioUnitario * it.cantidad,
            })),
          }}
          groupPaymentDraft={pendingGroupPaymentDraft || undefined}
          groupPaymentGroupId={pendingGroupPaymentDraft ? groupId : undefined}
          groupId={groupFacturaFromResumen ? groupId : undefined}
          groupInvoiceSources={groupPaymentDestino === "master" && masterFolio?.config === "accommodation"
            ? (groupInvoiceSnapshot?.sources ?? []).filter((source: any) => String(source.id || "").endsWith(":accommodation"))
            : groupInvoiceSnapshot?.sources}
          groupPaymentDestinations={groupInvoiceSnapshot?.paymentDestinations}
          groupFolioContext={groupPaymentReceiptType === "factura_t" ? {
            billingTarget: "guest",
            nationality: groupPaymentGuestNationality || undefined,
            nationalityCode: groupPaymentGuestNationalityCode || undefined,
            hasAccommodation: true,
          } : undefined}
          lockItems={groupFacturaFromResumen}
          hideAddItems={groupFacturaFromResumen}
          onSuccess={async () => {
            await refreshGroupBillingState();
            setShowGroupFacturaDialog(false);
            setGroupFacturaFromResumen(false);
            setPendingGroupPaymentDraft(null);
            resetGroupPaymentDialogFields();
            queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "invoices"] });
            queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "payments"] });
            if (showInvoiceDialog) {
              loadInvoice();
            }
            if (groupPaymentCloseAll) {
              toast({ title: "Pago grupal registrado — habitaciones cerradas" });
            } else if (groupFacturaFromResumen) {
              toast({ title: "Factura emitida y vinculada al folio del grupo" });
            } else {
              toast({ title: "Pago grupal registrado exitosamente" });
            }
          }}
        />
      )}

      {showMasterFacturaDialog && (() => {
        // The "Aplicar al Folio Maestro" destino inside the unified "Pago Grupal" dialog is
        // now the only entry point into this fiscal follow-up, so it always reads straight
        // from groupPayment* state — no cross-flow resolver needed anymore.
        const defaultDescripcion = `Pago grupal — ${group?.name ?? ""}`;
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
              setPendingGroupPaymentDraft(null);
              resetGroupPaymentDialogFields();
            }}
            onBackToSource={() => {
              setShowMasterFacturaDialog(false);
              setPendingGroupPaymentDraft(null);
              setShowGroupPaymentDialog(true);
            }}
            config={billingConfig}
            allowedTipos={allowedTiposMap[groupPaymentReceiptType] ?? ["FB"]}
            compactMode={true}
            initialValues={{
              ...buildGroupInvoiceRecipientInitialValues({
                razonSocial: groupPaymentRazonSocial,
                fallbackName: group?.name,
                cuit: groupPaymentCuit,
                dni: groupPaymentDni,
                condicionIva: groupPaymentCondicionIva,
                domicilio: groupPaymentDomicilio,
              }),
              items: groupPaymentItems.filter(it => it.descripcion.trim() || it.precioUnitario > 0).map(it => ({
                descripcion: it.descripcion || defaultDescripcion,
                precioUnitario: it.precioUnitario * it.cantidad,
              })),
            }}
            groupPaymentDraft={pendingGroupPaymentDraft || undefined}
            groupPaymentGroupId={pendingGroupPaymentDraft ? groupId : undefined}
            groupInvoiceSources={masterFolio?.config === "accommodation"
              ? (groupInvoiceSnapshot?.sources ?? []).filter((source: any) => String(source.id || "").endsWith(":accommodation"))
              : groupInvoiceSnapshot?.sources}
            groupPaymentDestinations={groupInvoiceSnapshot?.paymentDestinations}
            groupFolioContext={groupPaymentReceiptType === "factura_t" ? {
              billingTarget: "guest",
              nationality: groupPaymentGuestNationality || undefined,
              nationalityCode: groupPaymentGuestNationalityCode || undefined,
              hasAccommodation: true,
            } : undefined}
            onSuccess={async () => {
              await refreshGroupBillingState();
              setShowMasterFacturaDialog(false);
              setPendingGroupPaymentDraft(null);
              resetGroupPaymentDialogFields();
              queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
              queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "payments"] });
              queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "invoices"] });
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Pago Grupal Distribuido
            </DialogTitle>
            <DialogDescription>
              El pago se distribuirá entre las reservas activas y quedará registrado en cada folio individual.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* ── Monto y Método ── */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-3">Datos del pago</p>
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
                  <Label>Método de pago *</Label>
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
            </div>

            <div className="border-t" />

            {/* ── Distribución ── */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-3">Distribución entre habitaciones</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Criterio de distribución</Label>
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
                <div>
                  <Label>Referencia / N° comprobante</Label>
                  <Input
                    value={folioPaymentReference}
                    onChange={(e) => setFolioPaymentReference(e.target.value)}
                    placeholder="N° de comprobante..."
                    data-testid="input-folio-payment-reference"
                  />
                </div>
              </div>

              {folioPaymentDistribution === "manual" && folio && (
                <div className="mt-3 space-y-2 rounded-md border p-3 bg-muted/30">
                  <Label>Asignación por habitación</Label>
                  {folio.reservations.map((res) => (
                    <div key={res.reservationId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                      <span className="text-sm font-medium w-20 shrink-0">Hab. {res.roomNumber}</span>
                      <span className="text-xs text-muted-foreground truncate">{res.guestName}</span>
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
                  <p className="text-xs text-muted-foreground pt-1 border-t">
                    Asignado: <span className="font-medium">${fmtMoney(Object.values(manualDistribution).reduce((a, b) => a + b, 0))}</span>
                    {" / "}Total: <span className="font-medium">${folioPaymentAmount || "0"}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="border-t" />

            {/* ── Notas ── */}
            <div>
              <Label>Notas / Observaciones</Label>
              <Input
                value={folioPaymentNotes}
                onChange={(e) => setFolioPaymentNotes(e.target.value)}
                placeholder="Observaciones opcionales..."
                data-testid="input-folio-payment-notes"
              />
            </div>
          </div>

          <DialogFooter className="mt-2">
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
                        Hab. {r.roomNumber} — Piso {r.floor} (
                          {r.roomType
                            ? `${r.roomType.name}${r.roomType.code ? ` (${r.roomType.code})` : ""}`
                            : `Tipo no encontrado (${r.roomTypeId})`}
                        )
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
            queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "payments"] });
          }}
        />
      )}

    </div>
  );
}
