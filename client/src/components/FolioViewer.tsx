import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ReceiptText,
  FileX,
  ChevronsUpDown,
  Landmark,
  Download,
  ChevronDown,
  ChevronRight,
  UtensilsCrossed,
  BedDouble,
  Sparkles,
  CalendarCheck,
  Users,
  Building2,
  Briefcase,
  Ban,
  FileCheck,
} from "lucide-react";

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface FolioMovement {
  id: string;
  folioId: string;
  type: string;
  amount: string;
  description: string;
  sourceType?: string;
  sourceId?: string;
  paymentMethod?: string;
  registeredBy?: string;
  receiptType?: string;
  createdAt: string;
}

interface FolioData {
  id: string;
  codigo: string;
  entityType: string;
  entityId: string;
  status: string;
  totalCharges: string;
  totalPayments: string;
  balance: string;
  openedAt: string;
  closedAt?: string;
  movements: FolioMovement[];
}

// Restaurant order item
interface OrderItemDetail {
  id: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  notes?: string;
  menuItem: {
    id: string;
    name: string;
    category?: string;
  };
}
interface RestaurantOrderFull {
  id: string;
  orderNumber: string;
  status: string;
  waiterName?: string;
  createdAt: string;
  total?: string;
  notes?: string;
  table?: { number: number; area?: { name: string } };
  area?: { name: string };
  guest?: { firstName: string; lastName: string };
  items: OrderItemDetail[];
}

// Reservation detail
interface ReservationDetail {
  id: string;
  confirmationNumber?: string;
  checkInDate: string;
  checkOutDate: string;
  totalAmount?: string;
  roomRate?: string;
  status?: string;
  room?: { roomNumber: string; roomType?: { name: string } };
  guest?: { firstName: string; lastName: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_ICONS: Record<string, typeof UtensilsCrossed> = {
  restaurant_order: UtensilsCrossed,
  reservation: BedDouble,
  spa_account: Sparkles,
  event: CalendarCheck,
  group: Users,
  company: Building2,
  agency: Briefcase,
};

const ENTITY_LABELS: Record<string, string> = {
  restaurant_order: "Orden de Restaurant",
  reservation: "Reserva",
  spa_account: "Cuenta SPA",
  event: "Evento",
  group: "Grupo",
  company: "Empresa",
  agency: "Agencia",
};

const MOVEMENT_LABELS: Record<string, string> = {
  charge: "Cargo",
  payment: "Pago",
  advance: "Anticipo",
  discount: "Descuento",
  adjustment: "Ajuste",
  transfer_in: "Transferencia entrada",
  transfer_out: "Transferencia salida",
  void: "Anulación",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo", cash: "Efectivo",
  tarjeta_debito: "Tarj. Débito", debit_card: "Tarj. Débito",
  tarjeta_credito: "Tarj. Crédito", credit_card: "Tarj. Crédito",
  transferencia: "Transferencia", transfer: "Transferencia",
  mercadopago: "MercadoPago",
  cuenta_corriente: "Cta. Corriente", current_account: "Cta. Corriente",
  room_charge: "Cargo a Habitación",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDebit(type: string) {
  return ["charge", "transfer_in"].includes(type);
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(iso: string) {
  try { return format(new Date(iso), "dd/MM/yy HH:mm", { locale: es }); }
  catch { return iso; }
}

function movementIcon(type: string) {
  switch (type) {
    case "charge":     return <ArrowUpCircle className="h-4 w-4 text-red-500" />;
    case "payment":
    case "advance":    return <ArrowDownCircle className="h-4 w-4 text-green-600" />;
    case "discount":   return <ChevronsUpDown className="h-4 w-4 text-blue-500" />;
    case "void":       return <FileX className="h-4 w-4 text-orange-500" />;
    case "transfer_in":
    case "transfer_out": return <Landmark className="h-4 w-4 text-purple-500" />;
    default:           return <ReceiptText className="h-4 w-4 text-muted-foreground" />;
  }
}

function nightsCount(ci: string, co: string) {
  try {
    const d = (new Date(co).getTime() - new Date(ci).getTime()) / 86400000;
    return Math.max(1, Math.round(d));
  } catch { return 1; }
}

// ─── Restaurant Ticket Detail ─────────────────────────────────────────────────

function RestaurantTicketDetail({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useQuery<RestaurantOrderFull>({
    queryKey: ["/api/restaurant/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/restaurant/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: !!orderId,
  });

  if (isLoading) return (
    <div className="space-y-1.5 py-2">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
    </div>
  );

  if (!order) return (
    <p className="text-xs text-muted-foreground italic py-2">No se pudo cargar el detalle del ticket.</p>
  );

  // Group items by category for a cleaner view
  const grouped: Record<string, OrderItemDetail[]> = {};
  for (const item of order.items) {
    const cat = item.menuItem?.category || "Sin categoría";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const tableLabel = order.table
    ? `Mesa ${order.table.number}${order.table.area ? ` — ${order.table.area.name}` : ""}`
    : order.area ? order.area.name : "—";

  return (
    <div className="rounded-lg border bg-orange-50/40 dark:bg-orange-950/10 overflow-hidden">
      {/* Ticket header */}
      <div className="bg-orange-100 dark:bg-orange-900/30 px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <span className="font-semibold text-sm text-orange-800 dark:text-orange-300">
            Ticket #{order.orderNumber}
          </span>
        </div>
        <span className="text-xs text-orange-600 dark:text-orange-400">
          {formatDate(order.createdAt)}
        </span>
      </div>

      {/* Meta info */}
      <div className="px-3 py-1.5 flex flex-wrap gap-x-4 gap-y-0.5 border-b text-xs text-muted-foreground">
        {order.waiterName && <span>Mozo: <strong>{order.waiterName}</strong></span>}
        <span>{tableLabel}</span>
        {order.guest && (
          <span>Huésped: <strong>{order.guest.lastName} {order.guest.firstName}</strong></span>
        )}
      </div>

      {/* Items */}
      <div className="px-3 py-2 space-y-3">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              {cat}
            </p>
            <div className="space-y-1">
              {items.map(item => (
                <div key={item.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="flex items-baseline gap-1.5 flex-1 min-w-0">
                    <span className="font-medium text-orange-700 dark:text-orange-400 shrink-0">
                      {item.quantity}×
                    </span>
                    <span className="truncate">{item.menuItem?.name ?? "—"}</span>
                    {item.notes && (
                      <span className="text-xs text-muted-foreground italic truncate">({item.notes})</span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-muted-foreground">{formatCurrency(item.unitPrice)} c/u</span>
                    <br />
                    <span className="font-semibold">{formatCurrency(item.subtotal)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      {order.total && (
        <div className="flex items-center justify-between px-3 py-2 border-t bg-orange-100/60 dark:bg-orange-900/20">
          <span className="text-sm font-bold">Total del ticket</span>
          <span className="text-base font-bold text-orange-700 dark:text-orange-400">
            {formatCurrency(order.total)}
          </span>
        </div>
      )}

      {order.notes && (
        <p className="px-3 pb-2 text-xs text-muted-foreground italic">{order.notes}</p>
      )}
    </div>
  );
}

// ─── Reservation Detail ───────────────────────────────────────────────────────

function ReservationDetailPanel({ reservationId }: { reservationId: string }) {
  const { data: res, isLoading } = useQuery<ReservationDetail>({
    queryKey: ["/api/reservations", reservationId],
    queryFn: async () => {
      const r = await fetch(`/api/reservations/${reservationId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Error");
      return r.json();
    },
    enabled: !!reservationId,
  });

  if (isLoading) return (
    <div className="space-y-1.5 py-2">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
    </div>
  );

  if (!res) return (
    <p className="text-xs text-muted-foreground italic py-2">No se pudo cargar el detalle de la reserva.</p>
  );

  const nights = nightsCount(res.checkInDate, res.checkOutDate);
  const ratePerNight = res.roomRate
    ? Number(res.roomRate)
    : res.totalAmount
    ? Number(res.totalAmount) / nights
    : null;

  return (
    <div className="rounded-lg border bg-blue-50/40 dark:bg-blue-950/10 overflow-hidden">
      {/* Header */}
      <div className="bg-blue-100 dark:bg-blue-900/30 px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BedDouble className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="font-semibold text-sm text-blue-800 dark:text-blue-300">
            {res.confirmationNumber ? `Reserva #${res.confirmationNumber}` : "Detalle de Reserva"}
          </span>
        </div>
        {res.status && (
          <Badge variant="outline" className="text-xs">
            {res.status === "checked_in" ? "En Casa" : res.status === "checked_out" ? "Check-out" : res.status === "confirmed" ? "Confirmada" : res.status}
          </Badge>
        )}
      </div>

      {/* Info grid */}
      <div className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {res.guest && (
          <div className="col-span-2">
            <span className="text-xs text-muted-foreground">Huésped</span>
            <p className="font-semibold">{res.guest.lastName} {res.guest.firstName}</p>
          </div>
        )}
        {res.room && (
          <div>
            <span className="text-xs text-muted-foreground">Habitación</span>
            <p className="font-semibold">
              {res.room.roomNumber}
              {res.room.roomType && <span className="font-normal text-muted-foreground"> · {res.room.roomType.name}</span>}
            </p>
          </div>
        )}
        <div>
          <span className="text-xs text-muted-foreground">Noches</span>
          <p className="font-semibold">{nights}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Check-in</span>
          <p className="font-medium">{format(new Date(res.checkInDate), "dd/MM/yyyy", { locale: es })}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Check-out</span>
          <p className="font-medium">{format(new Date(res.checkOutDate), "dd/MM/yyyy", { locale: es })}</p>
        </div>
      </div>

      {/* Rate breakdown */}
      {ratePerNight !== null && (
        <div className="px-3 py-2 border-t space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Desglose de Tarifa
          </p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{formatCurrency(ratePerNight)} × {nights} {nights === 1 ? "noche" : "noches"}</span>
            <span className="font-medium">{formatCurrency(ratePerNight * nights)}</span>
          </div>
          {res.totalAmount && (
            <div className="flex justify-between text-sm font-bold border-t pt-1">
              <span>Total alojamiento</span>
              <span className="text-blue-700 dark:text-blue-400">{formatCurrency(res.totalAmount)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Expandable movement row ──────────────────────────────────────────────────

function MovementRow({
  mov, canVoid, onVoidClick,
}: {
  mov: FolioMovement;
  canVoid?: boolean;
  onVoidClick?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const debit = isDebit(mov.type);
  const hasSource = !!mov.sourceId && mov.sourceType === "restaurant_order";

  return (
    <div className="border-b last:border-0">
      <div
        className={`flex items-start gap-3 py-2 ${hasSource ? "cursor-pointer hover:bg-muted/30 rounded-md px-1 -mx-1 transition-colors" : ""}`}
        onClick={() => hasSource && setExpanded(v => !v)}
      >
        <div className="mt-0.5 shrink-0">{movementIcon(mov.type)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium truncate">{mov.description}</span>
            <div className="flex items-center gap-2 shrink-0">
              {canVoid && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  data-testid={`button-void-payment-${mov.id}`}
                  onClick={e => { e.stopPropagation(); onVoidClick?.(); }}
                >
                  <Ban className="h-3 w-3 mr-1" />
                  Anular
                </Button>
              )}
              <span className={`text-sm font-bold ${debit ? "text-red-600" : "text-green-600"}`}>
                {debit ? "+" : "-"}{formatCurrency(mov.amount)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {MOVEMENT_LABELS[mov.type] ?? mov.type}
            </span>
            {mov.paymentMethod && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">
                  {PAYMENT_METHOD_LABELS[mov.paymentMethod] ?? mov.paymentMethod}
                </span>
              </>
            )}
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{formatDate(mov.createdAt)}</span>
            {mov.registeredBy && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{mov.registeredBy}</span>
              </>
            )}
          </div>
        </div>
        {hasSource && (
          <div className="shrink-0 mt-0.5 text-muted-foreground">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />}
          </div>
        )}
      </div>

      {/* Expandable detail for restaurant orders linked to a movement */}
      {expanded && mov.sourceId && mov.sourceType === "restaurant_order" && (
        <div className="pb-2 pl-7">
          <RestaurantTicketDetail orderId={mov.sourceId} />
        </div>
      )}
    </div>
  );
}

// ─── Main FolioViewer ─────────────────────────────────────────────────────────

interface Props {
  entityType: string;
  entityId: string;
  allowVoid?: boolean;
}

export default function FolioViewer({ entityType, entityId, allowVoid = false }: Props) {
  const [showSourceDetail, setShowSourceDetail] = useState(true);
  const [voidingMovement, setVoidingMovement] = useState<FolioMovement | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("Error en forma de pago");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const todayAR = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

  const voidPaymentMutation = useMutation({
    mutationFn: async ({ paymentId, motivo }: { paymentId: string; motivo: string }) => {
      const res = await apiRequest("PATCH", `/api/payments/${paymentId}/anular`, { motivoAnulacion: motivo });
      return res.json();
    },
    onSuccess: (data: any) => {
      setVoidingMovement(null);
      setMotivoAnulacion("Error en forma de pago");
      queryClient.invalidateQueries({ queryKey: ["/api/folios", entityType, entityId] });
      const nc = data?.notaCreditoGenerada;
      toast({
        title: "Pago anulado",
        description: nc
          ? "El pago fue anulado y se generó una nota de crédito automáticamente."
          : "El pago fue anulado. El saldo del folio fue actualizado.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Error al anular", description: err.message, variant: "destructive" });
    },
  });

  const { data: folio, isLoading } = useQuery<FolioData | null>({
    queryKey: ["/api/folios", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/folios/${entityType}/${entityId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando folio");
      return res.json();
    },
    enabled: !!entityId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!folio) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <ReceiptText className="mx-auto mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">No hay folio registrado todavía.</p>
        <p className="text-xs mt-1">Se creará automáticamente al agregar el primer cargo o pago.</p>
      </div>
    );
  }

  const balance = Number(folio.balance);
  const charges = Number(folio.totalCharges);
  const paymentsTotal = Number(folio.totalPayments);
  const EntityIcon = ENTITY_ICONS[entityType] ?? ReceiptText;

  return (
    <div className="space-y-4">
      {/* Folio header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">{folio.codigo}</span>
          <Badge variant={folio.status === "open" ? "secondary" : folio.status === "invoiced" ? "default" : "outline"}>
            {folio.status === "open" ? "Abierto" : folio.status === "closed" ? "Cerrado" : "Facturado"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {folio.openedAt && (
            <span className="text-xs text-muted-foreground">
              Abierto {formatDate(folio.openedAt)}
            </span>
          )}
          <Button
            variant="outline" size="sm" className="h-7 gap-1 text-xs"
            data-testid="button-download-folio-pdf"
            onClick={() => window.open(`/api/folios/${entityType}/${entityId}/pdf`, "_blank")}
          >
            <Download className="h-3 w-3" />
            PDF
          </Button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Cargos</p>
          <p className="font-bold text-red-600 dark:text-red-400">{formatCurrency(charges)}</p>
        </div>
        <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Pagado</p>
          <p className="font-bold text-green-600 dark:text-green-400">{formatCurrency(paymentsTotal)}</p>
        </div>
        <div className={`rounded-lg border p-3 text-center ${balance > 0 ? "bg-orange-50 dark:bg-orange-950/20" : balance < 0 ? "bg-purple-50 dark:bg-purple-950/20" : "bg-blue-50 dark:bg-blue-950/20"}`}>
          <p className="text-xs text-muted-foreground mb-1">Saldo</p>
          <p className={`font-bold text-lg ${balance > 0 ? "text-orange-600 dark:text-orange-400" : balance < 0 ? "text-purple-600 dark:text-purple-400" : "text-blue-600 dark:text-blue-400"}`}>
            {formatCurrency(balance)}
          </p>
          {balance > 0 && <p className="text-[10px] text-orange-500 dark:text-orange-400 mt-0.5 font-medium">PENDIENTE</p>}
          {balance < 0 && <p className="text-[10px] text-purple-500 dark:text-purple-400 mt-0.5 font-medium">A FAVOR</p>}
          {balance === 0 && charges > 0 && <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-0.5 font-medium">SALDADO</p>}
        </div>
      </div>

      {/* IVA breakdown — solo si hay cargos */}
      {charges > 0 && (
        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Composición IVA (21%)</span>
          <span>Neto: <strong className="text-foreground">{formatCurrency(charges / 1.21)}</strong></span>
          <span>IVA 21%: <strong className="text-foreground">{formatCurrency(charges - charges / 1.21)}</strong></span>
          <span>Total c/IVA: <strong className="text-foreground">{formatCurrency(charges)}</strong></span>
        </div>
      )}

      {/* ── Source entity detail ──────────────────────────────────────── */}
      {(entityType === "restaurant_order" || entityType === "reservation") && (
        <div className="space-y-2">
          <button
            className="flex items-center gap-2 w-full text-left"
            onClick={() => setShowSourceDetail(v => !v)}
            data-testid="button-toggle-source-detail"
          >
            <EntityIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">
              {ENTITY_LABELS[entityType] ?? entityType}
            </span>
            {showSourceDetail
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>

          {showSourceDetail && (
            <>
              {entityType === "restaurant_order" && (
                <RestaurantTicketDetail orderId={entityId} />
              )}
              {entityType === "reservation" && (
                <ReservationDetailPanel reservationId={entityId} />
              )}
            </>
          )}
        </div>
      )}

      <Separator />

      {/* Movements */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Movimientos ({folio.movements.length})
        </p>
        {folio.movements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin movimientos aún</p>
        ) : (
          folio.movements.map(mov => {
            const movDateAR = new Date(mov.createdAt).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
            const canVoid = allowVoid
              && mov.type === "payment"
              && !!mov.sourceId
              && movDateAR === todayAR;
            return (
              <MovementRow
                key={mov.id}
                mov={mov}
                canVoid={canVoid}
                onVoidClick={() => {
                  setVoidingMovement(mov);
                  setMotivoAnulacion("Error en forma de pago");
                }}
              />
            );
          })
        )}
      </div>

      {folio.closedAt && (
        <div className="text-xs text-muted-foreground text-right">
          Cerrado {formatDate(folio.closedAt)}
        </div>
      )}

      {/* ── Void payment dialog ─────────────────────────────────────── */}
      <Dialog open={!!voidingMovement} onOpenChange={open => { if (!open) setVoidingMovement(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-destructive" />
              Anular pago
            </DialogTitle>
            <DialogDescription>
              Esta acción revertirá el pago del folio y registrará un contraasiento en la caja.
              {voidingMovement && (
                <span className="block mt-1 font-medium text-foreground">
                  Importe: {formatCurrency(voidingMovement.amount)}
                  {voidingMovement.paymentMethod && ` · ${PAYMENT_METHOD_LABELS[voidingMovement.paymentMethod] ?? voidingMovement.paymentMethod}`}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="motivo-anulacion" className="text-sm">Motivo de anulación</Label>
              <Input
                id="motivo-anulacion"
                data-testid="input-motivo-anulacion"
                value={motivoAnulacion}
                onChange={e => setMotivoAnulacion(e.target.value)}
                placeholder="Ej: Error en forma de pago"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVoidingMovement(null)}
              disabled={voidPaymentMutation.isPending}
              data-testid="button-cancel-void"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!motivoAnulacion.trim() || voidPaymentMutation.isPending}
              data-testid="button-confirm-void"
              onClick={() => {
                if (voidingMovement?.sourceId) {
                  voidPaymentMutation.mutate({
                    paymentId: voidingMovement.sourceId,
                    motivo: motivoAnulacion.trim(),
                  });
                }
              }}
            >
              {voidPaymentMutation.isPending ? "Anulando…" : "Confirmar anulación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
