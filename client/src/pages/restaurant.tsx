import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/App";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { GuestSearchCombobox } from "@/components/guest-search-combobox";
import { ProvinciaCiudadSelect } from "@/components/provincia-ciudad-select";
import { VAT_CONDITION_LABELS } from "@/pages/guests";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus,
  UtensilsCrossed,
  Users,
  CircleDollarSign,
  Clock,
  MapPin,
  Square,
  Circle,
  RectangleHorizontal,
  X,
  CreditCard,
  Loader2,
  CalendarDays,
  Phone,
  Trash2,
  Check,
  XCircle,
  GripVertical,
  Settings,
  Edit,
  Eye,
  Search,
  BookOpen,
  Receipt,
  ChefHat,
  Banknote,
  ArrowUpDown,
  Pencil,
  Minus,
  ClipboardList,
  ChevronLeft,
  CheckCircle2,
  Printer,
  ArrowRightLeft,
  Smartphone,
  FileX,
  AlertTriangle,
  Building2,
  UserPlus,
  CheckCircle,
  BedDouble,
  FileText,
  Monitor,
  RotateCcw,
} from "lucide-react";
import { Link } from "wouter";

type RestaurantArea = {
  id: string;
  name: string;
  areaType: "indoor" | "outdoor" | "terrace" | "bar" | "private";
  capacity: number;
  hasTables: string | null;
  isActive: string;
  notes: string | null;
};

type RestaurantTable = {
  id: string;
  tableNumber: string;
  areaId: string;
  capacity: number;
  shape: "square" | "round" | "rectangular";
  status: "available" | "occupied" | "reserved" | "cleaning" | "blocked";
  positionX: number;
  positionY: number;
  hasWindow: string | null;
  isActive: string;
  area?: RestaurantArea;
};

type MenuCategory = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number | null;
  isActive: string | null;
};

type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  preparationTime: number | null;
  isAvailable: string | null;
  isActive: string | null;
  allergens: string | null;
  displayOrder: number | null;
  category?: MenuCategory;
};

type OrderSplit = {
  id: string;
  orderId: string;
  splitNumber: number;
  amount: string;
  method: string | null;
  receiptType: string | null;
  isPaid: string | null;
  paidAt: string | null;
  createdAt: string | null;
};

type RestaurantOrder = {
  id: string;
  orderNumber: string;
  tableId: string | null;
  areaId: string | null;
  status: "open" | "in_progress" | "served" | "closed" | "cancelled";
  covers: number;
  waiterName: string | null;
  orderLabel: string | null;
  activeCourse: number | null;
  subtotal: string;
  tax: string;
  total: string;
  openedAt: string;
  receiptType: string | null;
  paymentMethod: string | null;
  table?: RestaurantTable;
  area?: RestaurantArea;
  items?: Array<{
    id: string;
    menuItemId: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
    menuItem?: MenuItem;
    notes?: string | null;
    status?: string;
    course?: number | null;
    sentAt?: string | null;
  }>;
};

type TableReservation = {
  id: string;
  tableId: string | null;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  status: "pending" | "confirmed" | "check_in" | "seated" | "completed" | "cancelled" | "no_show" | "historical";
  notes: string | null;
  clientId: string | null;
  cardLast4: string | null;
  cardHolder: string | null;
  advanceAmount: string | null;
  advanceMethod: string | null;
  advanceDate: string | null;
  advanceNotes: string | null;
  createdAt: string;
  table?: RestaurantTable | null;
};

type RestaurantReservationAdvance = {
  id: string;
  reservationId: string;
  amount: string;
  paymentMethod: string;
  voucherNumber: string | null;
  notes: string | null;
  createdAt: string;
  appliedToOrderId: string | null;
  invoiceId: number | null;
};

type TimeSlot = {
  id: string;
  time: string;
  label: string | null;
  isActive: string | null;
  displayOrder: number | null;
  areaId: string | null;
};

const reservationStatusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  confirmed: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  check_in: "bg-green-500/20 text-green-700 dark:text-green-400",
  seated: "bg-green-500/20 text-green-700 dark:text-green-400",
  completed: "bg-gray-500/20 text-gray-700 dark:text-gray-400",
  historical: "bg-gray-500/20 text-gray-700 dark:text-gray-400",
  cancelled: "bg-red-500/20 text-red-700 dark:text-red-400",
  no_show: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
};

const reservationStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  check_in: "Check-in",
  seated: "En mesa",
  completed: "Completada",
  historical: "Histórica",
  cancelled: "Cancelada",
  no_show: "No se presentó",
};

const reservationFormSchema = z.object({
  tableId: z.string().optional().nullable(),
  areaId: z.string().optional().nullable(),
  guestName: z.string().min(1, "El nombre es requerido"),
  guestPhone: z.string().min(1, "El teléfono es requerido"),
  guestEmail: z.string().email("Email invalido").optional().or(z.literal("")),
  partySize: z.coerce.number().min(1, "Minimo 1 persona"),
  reservationDate: z.string().min(1, "La fecha es requerida"),
  reservationTime: z.string().min(1, "La hora es requerida"),
  notes: z.string().optional(),
  clientId: z.string().optional().nullable(),
  cardLast4: z.string().optional().nullable(),
  cardHolder: z.string().optional().nullable(),
});

type ReservationFormValues = z.infer<typeof reservationFormSchema>;

const tableStatusColors: Record<string, string> = {
  available: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40",
  occupied: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40",
  reserved: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/40",
  cleaning: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/40",
  blocked: "bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/40",
};

const tableStatusLabels: Record<string, string> = {
  available: "Disponible",
  occupied: "Ocupada",
  reserved: "Reservada",
  cleaning: "Limpieza",
  blocked: "Bloqueada",
};

const SHOW_FACTURA_C = false;

const receiptTypeLabels: Record<string, string> = {
  cierre_mesa: "Ticket / Cierre",
  factura_a: "Factura A",
  factura_b: "Factura B",
  voucher: "Voucher Justo Resto",
  voucher_pedidos_ya: "Voucher Pedidos Ya",
  ...(SHOW_FACTURA_C ? { factura_c: "Factura C" } : {}),
};

const paymentMethodLabels: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta_debito: "Tarjeta Débito",
  tarjeta_credito: "Tarjeta Crédito",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
  cuenta_corriente: "Cuenta Corriente",
  cuenta_habitacion: "Cargo a Habitación",
};

const menuItemFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  categoryId: z.string().min(1, "La categoria es requerida"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "El precio debe ser positivo"),
  preparationTime: z.coerce.number().min(0).optional(),
  isAvailable: z.string().default("true"),
  isEditable: z.string().default("false"),
  defaultCourse: z.coerce.number().int().min(0).max(3).optional(),
});

type MenuItemFormValues = z.infer<typeof menuItemFormSchema>;

const categoryFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  displayOrder: z.coerce.number().default(0),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

function useElapsedTime(openedAt: string | null | undefined): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
  if (!openedAt) return "";
  const diff = Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000);
  if (diff < 60) return `${diff}min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function TableElapsedBadge({ openedAt }: { openedAt: string }) {
  const elapsed = useElapsedTime(openedAt);
  if (!elapsed) return null;
  return <span className="text-[9px] opacity-70 font-medium">{elapsed}</span>;
}

type AdvanceDialogProps = {
  reservationId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reservations: TableReservation[];
  advanceAmount: string;
  setAdvanceAmount: (v: string) => void;
  advancePaymentMethod: string;
  setAdvancePaymentMethod: (v: string) => void;
  advanceNotes: string;
  setAdvanceNotes: (v: string) => void;
  createAdvanceMutation: any;
  deleteAdvanceMutation: any;
  posConfigsData?: any[];
  restaurantGuests?: any[];
};

function AdvanceDialog({
  reservationId, open, onOpenChange, reservations,
  advanceAmount, setAdvanceAmount, advancePaymentMethod, setAdvancePaymentMethod,
  advanceNotes, setAdvanceNotes, createAdvanceMutation, deleteAdvanceMutation,
  posConfigsData = [], restaurantGuests = [],
}: AdvanceDialogProps) {
  const { selectedPosNumero, selectedPosNombre } = useAuth();
  const reservation = reservations.find(r => r.id === reservationId);
  const { data: advances = [], isLoading } = useQuery<RestaurantReservationAdvance[]>({
    queryKey: ["/api/restaurant/advances", reservationId],
    queryFn: async () => {
      if (!reservationId) return [];
      const res = await fetch(`/api/restaurant/table-reservations/${reservationId}/advances`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!reservationId && open,
  });

  const [advReceiptType, setAdvReceiptType] = useState("voucher");
  const [advCustomerName, setAdvCustomerName] = useState("");
  const [advCustomerCuit, setAdvCustomerCuit] = useState("");

  // Resolve the registered client linked to this reservation
  const linkedClient = reservation?.clientId
    ? restaurantGuests.find((g: any) => g.id === reservation.clientId) as any ?? null
    : null;
  const hasClient = !!linkedClient;
  const clientVat: string = (linkedClient?.vatCondition as string) || "consumidor_final";

  // Compute which receipt types are valid for this reservation
  const availableReceiptTypes: { value: string; label: string }[] = [
    { value: "voucher", label: "Voucher (no fiscal)" },
    ...(hasClient
      ? [
          ...( ["consumidor_final", "exento", ""].includes(clientVat)
            ? [{ value: "factura_b", label: "Factura B" }]
            : []),
          ...( ["responsable_inscripto", "monotributo"].includes(clientVat)
            ? [{ value: "factura_a", label: "Factura A" }]
            : []),
        ]
      : [{ value: "factura_b", label: "Factura B" }]
    ),
  ];

  useEffect(() => {
    if (open) {
      setAdvReceiptType("voucher");
      setAdvCustomerName(
        hasClient
          ? linkedClient?.tipoPersona === "juridica"
            ? (linkedClient?.firstName || "")
            : `${linkedClient?.firstName || ""} ${linkedClient?.lastName || ""}`.trim()
          : ""
      );
      setAdvCustomerCuit(hasClient ? (linkedClient?.cuilCuit || "") : "");
    }
  }, [open, reservationId]);

  const totalAdvances = advances.reduce((s, a) => s + parseFloat(a.amount || "0"), 0);

  const payMethodLabel: Record<string, string> = {
    efectivo: "Efectivo", transferencia: "Transferencia",
    tarjeta_debito: "Débito", tarjeta_credito: "Crédito", mercadopago: "MercadoPago",
  };

  const isFactura = ["factura_a", "factura_b"].includes(advReceiptType);
  const needsClient = isFactura && hasClient;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Señas / Anticipos
          </DialogTitle>
          {reservation && (
            <p className="text-sm text-muted-foreground">
              {reservation.guestName} — {reservation.reservationDate} {reservation.reservationTime}
              {reservation.partySize > 1 ? ` (${reservation.partySize}p)` : ""}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Lista de adelantos */}
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : advances.length > 0 ? (
            <div className="space-y-2">
              {advances.map((adv) => (
                <div key={adv.id} className="flex items-center justify-between px-3 py-2 rounded-lg border bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">${parseFloat(adv.amount).toLocaleString("es-AR")}</p>
                    <p className="text-xs text-muted-foreground">
                      {payMethodLabel[adv.paymentMethod] || adv.paymentMethod}
                      {adv.voucherNumber && <span className="ml-2 font-mono">{adv.voucherNumber}</span>}
                      {adv.notes && <span className="ml-2">— {adv.notes}</span>}
                      {adv.invoiceId && <span className="ml-2 text-green-600 font-medium">· Fact. #{adv.invoiceId}</span>}
                      {adv.appliedToOrderId && <span className="ml-2 text-blue-600">· Aplicado</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {adv.invoiceId && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-green-600"
                        title="Ver factura AFIP"
                        data-testid={`button-view-invoice-advance-${adv.id}`}
                        onClick={() => window.open(`/api/billing/invoices/${adv.invoiceId}/pdf`, "_blank")}
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground"
                      title="Imprimir voucher"
                      data-testid={`button-print-advance-${adv.id}`}
                      onClick={() => {
                        const w = window.open("", "_blank", "width=380,height=500");
                        if (!w || !reservation) return;
                        const amt = parseFloat(adv.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 });
                        const metodoPago = payMethodLabel[adv.paymentMethod] || adv.paymentMethod;
                        const fecha = adv.createdAt ? new Date(adv.createdAt).toLocaleDateString("es-AR") : new Date().toLocaleDateString("es-AR");
                        w.document.write(`<!DOCTYPE html><html><head><title>Voucher Anticipo</title>
                        <style>
                          body{font-family:Arial,sans-serif;padding:20px;max-width:340px;margin:0 auto;font-size:13px;color:#111}
                          h1{font-size:15px;text-align:center;margin:0 0 2px}
                          .sub{text-align:center;font-size:11px;color:#666;margin:0 0 14px}
                          .sep{border:none;border-top:1px dashed #aaa;margin:10px 0}
                          .row{display:flex;justify-content:space-between;margin:4px 0}
                          .label{color:#555;font-size:12px}
                          .val{font-weight:600}
                          .total{font-size:16px;font-weight:bold;text-align:center;margin:12px 0 4px;border:1px solid #333;padding:6px;border-radius:4px}
                          .voucher{text-align:center;font-size:11px;color:#888;font-family:monospace;margin-top:10px}
                          .nota{font-size:10px;color:#999;text-align:center;margin-top:12px;border-top:1px dashed #ccc;padding-top:8px}
                          @media print{button{display:none}}
                        </style></head><body>
                        <h1>Maran Suites &amp; Towers</h1>
                        <p class="sub">Restaurante — Voucher Anticipo${adv.invoiceId ? " (Fiscal)" : " (No Fiscal)"}</p>
                        <hr class="sep">
                        <div class="row"><span class="label">Reserva a nombre de:</span></div>
                        <div class="row"><span class="val">${reservation.guestName}</span></div>
                        <div class="row"><span class="label">Fecha reserva:</span><span class="val">${reservation.reservationDate} ${reservation.reservationTime}</span></div>
                        <div class="row"><span class="label">Cubiertos:</span><span class="val">${reservation.partySize}</span></div>
                        <hr class="sep">
                        <div class="row"><span class="label">Fecha pago:</span><span class="val">${fecha}</span></div>
                        <div class="row"><span class="label">Forma de pago:</span><span class="val">${metodoPago}</span></div>
                        ${adv.notes ? `<div class="row"><span class="label">Ref.:</span><span class="val">${adv.notes}</span></div>` : ""}
                        <div class="total">$ ${amt}</div>
                        ${adv.voucherNumber ? `<div class="voucher">Voucher: ${adv.voucherNumber}</div>` : ""}
                        ${adv.invoiceId ? `<div class="voucher">Factura AFIP #${adv.invoiceId}</div>` : ""}
                        <p class="nota">${adv.invoiceId ? "Comprobante fiscal emitido." : "Este comprobante no tiene valor fiscal."}<br>Acreditable al momento del consumo.</p>
                        <br><button onclick="window.print()">Imprimir</button>
                        </body></html>`);
                        w.document.close();
                      }}
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground/40 cursor-not-allowed"
                      disabled
                      title="Los comprobantes no se eliminan. Para anular, emitir una Nota de Crédito."
                      data-testid={`button-delete-advance-${adv.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm font-semibold pr-1">
                <span className="text-muted-foreground">Total señado:</span>
                <span className="text-green-700 dark:text-green-400">${totalAdvances.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">Sin anticipos registrados</p>
          )}

          {/* Formulario nuevo adelanto — bloqueado si reserva ya está en check_in */}
          {reservation?.status === "check_in" ? (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>La reserva ya está en Check-in. No se pueden registrar señas adicionales.</span>
            </div>
          ) : (
          <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Registrar nuevo anticipo</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Monto *</Label>
                <Input
                  type="number" step="0.01" min="0.01"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-advance-amount"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Forma de pago</Label>
                <Select value={advancePaymentMethod} onValueChange={setAdvancePaymentMethod}>
                  <SelectTrigger data-testid="select-advance-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="tarjeta_debito">Débito</SelectItem>
                    <SelectItem value="tarjeta_credito">Crédito</SelectItem>
                    <SelectItem value="mercadopago">MercadoPago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Comprobante</Label>
              <Select value={advReceiptType} onValueChange={(v) => {
                setAdvReceiptType(v);
                if (!["factura_a", "factura_b"].includes(v)) {
                  setAdvCustomerName(""); setAdvCustomerCuit("");
                }
              }}>
                <SelectTrigger data-testid="select-advance-receipt-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableReceiptTypes.map(rt => (
                    <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasClient && (
                <p className="text-xs text-muted-foreground">
                  Cliente: <span className="font-medium">{linkedClient?.firstName} {linkedClient?.lastName || ""}</span>
                  {" — "}{clientVat === "responsable_inscripto" ? "Resp. Inscripto" : clientVat === "monotributo" ? "Monotributista" : clientVat === "exento" ? "Exento" : "Consumidor Final"}
                </p>
              )}
            </div>

            {isFactura && selectedPosNumero && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
                <Monitor className="h-3.5 w-3.5 shrink-0" />
                <span>PV {String(selectedPosNumero).padStart(4, "0")}{selectedPosNombre ? ` — ${selectedPosNombre}` : ""}</span>
              </div>
            )}

            {needsClient && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Razón Social</Label>
                  <Input
                    value={advCustomerName}
                    onChange={(e) => setAdvCustomerName(e.target.value)}
                    placeholder="CONSUMIDOR FINAL"
                    data-testid="input-advance-customer-name"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">CUIT</Label>
                  <Input
                    value={advCustomerCuit}
                    onChange={(e) => setAdvCustomerCuit(e.target.value)}
                    placeholder="20-00000000-0"
                    data-testid="input-advance-customer-cuit"
                  />
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label className="text-xs">Observación</Label>
              <Input
                value={advanceNotes}
                onChange={(e) => setAdvanceNotes(e.target.value)}
                placeholder="Referencia, nro. comprobante..."
                data-testid="input-advance-notes"
              />
            </div>
            <Button
              className="w-full"
              disabled={!advanceAmount || parseFloat(advanceAmount) <= 0 || createAdvanceMutation.isPending || !reservationId}
              onClick={() => {
                if (!reservationId || !advanceAmount) return;
                createAdvanceMutation.mutate({
                  reservationId,
                  amount: advanceAmount,
                  paymentMethod: advancePaymentMethod,
                  notes: advanceNotes,
                  receiptType: isFactura ? advReceiptType : undefined,
                  vatCondition: advReceiptType === "factura_a" ? "responsable_inscripto" : (clientVat === "exento" ? "exento" : "consumidor_final"),
                  customerRazonSocial: advCustomerName || undefined,
                  customerCuit: advCustomerCuit || undefined,
                  puntoVenta: selectedPosNumero || undefined,
                });
              }}
              data-testid="button-submit-advance"
            >
              {createAdvanceMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {isFactura ? "Registrar y Facturar" : "Registrar Anticipo"}
            </Button>
          </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RestaurantPage() {
  const { user, selectedPosNumero, selectedPosNombre } = useAuth();
  const canEditLayout = ["admin", "manager", "responsable_area"].includes(user?.role || "");
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("floor");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [isNewOrderDialogOpen, setIsNewOrderDialogOpen] = useState(false);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<RestaurantOrder | null>(null);
  const [newCovers, setNewCovers] = useState(2);
  const [orderView, setOrderView] = useState<"folio" | "menu" | "delete" | "comanda" | "review">("menu");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [pendingItem, setPendingItem] = useState<MenuItem | null>(null);
  const [itemNotes, setItemNotes] = useState("");
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [isReservationDialogOpen, setIsReservationDialogOpen] = useState(false);
  const [isDailyReservationsOpen, setIsDailyReservationsOpen] = useState(false);
  const [reservationDate, setReservationDate] = useState(new Date().toISOString().split("T")[0]);
  const [editingReservation, setEditingReservation] = useState<TableReservation | null>(null);
  const [isEditReservationOpen, setIsEditReservationOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [draggedTable, setDraggedTable] = useState<RestaurantTable | null>(null);
  const [isAddTableDialogOpen, setIsAddTableDialogOpen] = useState(false);
  const [isEditTableDialogOpen, setIsEditTableDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [editTableCapacity, setEditTableCapacity] = useState(4);
  const [editTableShape, setEditTableShape] = useState("square");
  const [editTableWindow, setEditTableWindow] = useState(false);
  const [reservationSortBy, setReservationSortBy] = useState<"name" | "time">("time");
  const [showPastReservations, setShowPastReservations] = useState(false);
  const [isMenuItemDialogOpen, setIsMenuItemDialogOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [reservationSearch, setReservationSearch] = useState("");
  const [reservationAreaFilter, setReservationAreaFilter] = useState<string>("all");
  const pendingCheckInReservationRef = useRef<TableReservation | null>(null);
  const [closeReceiptType, setCloseReceiptType] = useState("cierre_mesa");
  const [closePaymentMethod, setClosePaymentMethod] = useState("efectivo");
  const [closeDiscount, setCloseDiscount] = useState("");
  const [closeDiscountType, setCloseDiscountType] = useState<"amount" | "percent">("percent");
  const [closeRoomId, setCloseRoomId] = useState("");
  const [roomSearchFilter, setRoomSearchFilter] = useState("");
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingAreaName, setEditingAreaName] = useState("");
  const [isTimeSlotsDialogOpen, setIsTimeSlotsDialogOpen] = useState(false);
  const [newTimeSlot, setNewTimeSlot] = useState("");
  const [newTimeSlotArea, setNewTimeSlotArea] = useState<string>("__none__");
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState(4);
  const [newTableShape, setNewTableShape] = useState("square");
  const [newTableArea, setNewTableArea] = useState("");
  const [newTableWindow, setNewTableWindow] = useState(false);
  const [newWaiterName, setNewWaiterName] = useState("");
  const [newOrderLabel, setNewOrderLabel] = useState("");
  const [isDirectOrderDialogOpen, setIsDirectOrderDialogOpen] = useState(false);
  const [directOrderAreaId, setDirectOrderAreaId] = useState("");
  const [itemCourse, setItemCourse] = useState(1);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customItemName, setCustomItemName] = useState("");
  const [isEditableItem, setIsEditableItem] = useState(false);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitParts, setSplitParts] = useState(2);
  const [isTransferMode, setIsTransferMode] = useState(false);
  const [transferSelectedIds, setTransferSelectedIds] = useState<Set<string>>(new Set());
  const [transferTargetOrderId, setTransferTargetOrderId] = useState<string>("");
  const [transferNewWaiter, setTransferNewWaiter] = useState("");
  const [reservationClientSearch, setReservationClientSearch] = useState("");
  const [showReservationClientDropdown, setShowReservationClientDropdown] = useState(false);
  const [editingCovers, setEditingCovers] = useState(false);
  const [coversInput, setCoversInput] = useState(1);
  const [showCancelOrderDialog, setShowCancelOrderDialog] = useState(false);
  const [cancelOrderReason, setCancelOrderReason] = useState("");
  const [cancelledOrderSnapshot, setCancelledOrderSnapshot] = useState<{ order: any; items: any[] } | null>(null);
  const [itemToVoid, setItemToVoid] = useState<{ orderId: string; item: any } | null>(null);
  const [itemVoidReason, setItemVoidReason] = useState("");
  const [splitReceiptType, setSplitReceiptType] = useState("ticket");
  const [splitPayMethod, setSplitPayMethod] = useState("efectivo");
  const [splitPayMethods, setSplitPayMethods] = useState<Record<string, string>>({});
  const [splitReceiptTypes, setSplitReceiptTypes] = useState<Record<string, string>>({});
  const [splitRoomIds, setSplitRoomIds] = useState<Record<string, string>>({});
  const [splitRoomSearchFilters, setSplitRoomSearchFilters] = useState<Record<string, string>>({});
  const [splitEditAmounts, setSplitEditAmounts] = useState<Record<string, string>>({});
  const [menuSearch, setMenuSearch] = useState("");
  const menuSearchRef = useRef<HTMLInputElement>(null);
  const [showItemNotes, setShowItemNotes] = useState(false);
  const [reservationViewMode, setReservationViewMode] = useState<"day" | "all" | "past">("day");
  const [reservationDateFilter, setReservationDateFilter] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
  );
  const [reservationSearchText, setReservationSearchText] = useState("");
  const [reservationStatusFilter, setReservationStatusFilter] = useState<string>("all");
  const [advanceDialogReservationId, setAdvanceDialogReservationId] = useState<string | null>(null);
  const [isAdvanceDialogOpen, setIsAdvanceDialogOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState("efectivo");
  const [advanceNotes, setAdvanceNotes] = useState("");
  const [isAssignTableDialogOpen, setIsAssignTableDialogOpen] = useState(false);
  const [assignTableReservation, setAssignTableReservation] = useState<TableReservation | null>(null);
  const [confirmCancelReservationId, setConfirmCancelReservationId] = useState<string | null>(null);
  const [closeBillingName, setCloseBillingName] = useState("");
  const [closeBillingCuit, setCloseBillingCuit] = useState("");
  const [closeBillingCompanyId, setCloseBillingCompanyId] = useState("");
  const [closeCcEntityType, setCloseCcEntityType] = useState<"company" | "agency">("company");
  const [closeCcEntityId, setCloseCcEntityId] = useState("");
  const [invoiceForNC, setInvoiceForNC] = useState<any | null>(null);
  const [ncMotivo, setNcMotivo] = useState("");
  const [ncDateFrom, setNcDateFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]);
  const [ncDateTo, setNcDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [billingSearch, setBillingSearch] = useState("");
  const [billingSearchOpen, setBillingSearchOpen] = useState(false);
  const [fbIsExento, setFbIsExento] = useState(false);
  const [splitCustomerNames, setSplitCustomerNames] = useState<Record<string, string>>({});
  const [splitCustomerCuits, setSplitCustomerCuits] = useState<Record<string, string>>({});
  const [splitVatConditions, setSplitVatConditions] = useState<Record<string, string>>({});
  const [splitBillingSearches, setSplitBillingSearches] = useState<Record<string, string>>({});
  const [splitFbIsExento, setSplitFbIsExento] = useState<Record<string, boolean>>({});

  // Split dialog mode: "equal_parts" | "move_items" | "pay_items"
  const [splitDialogMode, setSplitDialogMode] = useState<"equal_parts" | "move_items" | "pay_items">("equal_parts");

  // Mover ítems mode (in split dialog)
  const [moveItemSelectedIds, setMoveItemSelectedIds] = useState<Set<string>>(new Set());
  const [moveItemTargetOrderId, setMoveItemTargetOrderId] = useState("");

  // Cobrar ítems mode (in split dialog)
  const [payItemSelectedIds, setPayItemSelectedIds] = useState<Set<string>>(new Set());
  const [payItemMethod, setPayItemMethod] = useState("efectivo");
  const [payItemReceipt, setPayItemReceipt] = useState("cierre_mesa");
  const [payItemRoomId, setPayItemRoomId] = useState("");
  const [payItemRoomSearch, setPayItemRoomSearch] = useState("");
  const [payItemCcEntityType, setPayItemCcEntityType] = useState<"company" | "agency">("company");
  const [payItemCcEntityId, setPayItemCcEntityId] = useState("");
  const [payItemBillingName, setPayItemBillingName] = useState("");
  const [payItemBillingCuit, setPayItemBillingCuit] = useState("");
  const [payItemBillingSearch, setPayItemBillingSearch] = useState("");
  const [payItemBillingSearchOpen, setPayItemBillingSearchOpen] = useState(false);
  const [payItemFbIsExento, setPayItemFbIsExento] = useState(false);
  const [payItemDiscount, setPayItemDiscount] = useState("");
  const [payItemDiscountType, setPayItemDiscountType] = useState<"percent" | "amount">("percent");
  const [payItemCompanyId, setPayItemCompanyId] = useState("");

  const [isNewClientDialogOpen, setIsNewClientDialogOpen] = useState(false);
  const [newClientRazonSocial, setNewClientRazonSocial] = useState("");
  const [newClientCuit, setNewClientCuit] = useState("");
  const [newClientCondicionIva, setNewClientCondicionIva] = useState<"responsable_inscripto"|"exento"|"monotributista">("exento");

  // Clientes tab state
  const [clientSearch, setClientSearch] = useState("");
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [clientCreatedForReservation, setClientCreatedForReservation] = useState<((g: { id: string; firstName: string; lastName: string; phone?: string | null; email?: string | null }) => void) | null>(null);
  const [clientEditingId, setClientEditingId] = useState<string | null>(null);
  const [clientForm, setClientForm] = useState({
    tipoPersona: "fisica" as "fisica" | "juridica",
    firstName: "", lastName: "", email: "", phone: "",
    documentType: "dni", documentNumber: "", cuilCuit: "",
    vatCondition: "consumidor_final",
    direccion: "", provincia: "", localidad: "",
    condicionVentaPredeterminada: "contado",
  });

  function validateCuit(cuit: string): boolean {
    const clean = cuit.replace(/[-\s]/g, "");
    if (!/^\d{11}$/.test(clean)) return false;
    const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const sum = mult.reduce((acc, m, i) => acc + m * parseInt(clean[i]), 0);
    const rem = sum % 11;
    const dv = rem === 0 ? 0 : rem === 1 ? 9 : 11 - rem;
    return dv === parseInt(clean[10]);
  }

  function formatCuit(v: string): string {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 10) return `${d.slice(0,2)}-${d.slice(2)}`;
    return `${d.slice(0,2)}-${d.slice(2,10)}-${d.slice(10)}`;
  }

  const courseLabels: Record<number, string> = { 1: "Entradas", 2: "Platos Principales", 3: "Postres" };
  const courseShortLabels: Record<number, string> = { 1: "Entrada", 2: "Principal", 3: "Postre" };

  function inferCourseFromCategory(categoryName: string): number | null {
    const name = categoryName.toLowerCase();
    if (name.includes("entrada") || name.includes("aperitivo")) return 1;
    if (name.includes("principal") || name.includes("segundo") || name.includes("plato")) return 2;
    if (name.includes("postre") || name.includes("dulce")) return 3;
    if (name.includes("bebida") || name.includes("cerveza") || name.includes("vino") || name.includes("espumante") || name.includes("jugo") || name.includes("gaseosa")) return null;
    return null;
  }

  const reservationForm = useForm<ReservationFormValues>({
    resolver: zodResolver(reservationFormSchema),
    defaultValues: {
      tableId: null,
      areaId: null,
      guestName: "",
      guestPhone: "",
      guestEmail: "",
      partySize: 2,
      reservationDate: new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
      reservationTime: "20:00",
      notes: "",
      clientId: null,
      cardLast4: null,
      cardHolder: null,
    },
  });

  const menuItemForm = useForm<MenuItemFormValues>({
    resolver: zodResolver(menuItemFormSchema),
    defaultValues: {
      name: "",
      categoryId: "",
      description: "",
      price: 0,
      preparationTime: 0,
      isAvailable: "true",
      isEditable: "false",
    },
  });

  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: "", description: "", displayOrder: 0 },
  });

  const { data: areas = [], isLoading: areasLoading } = useQuery<RestaurantArea[]>({
    queryKey: ["/api/restaurant/areas"],
  });

  const { data: tables = [], isLoading: tablesLoading } = useQuery<RestaurantTable[]>({
    queryKey: ["/api/restaurant/tables"],
  });

  const { data: menuCategories = [] } = useQuery<MenuCategory[]>({
    queryKey: ["/api/restaurant/menu/categories"],
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/restaurant/menu/items"],
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<RestaurantOrder[]>({
    queryKey: ["/api/restaurant/orders"],
    refetchInterval: 30000,
  });

  const { data: inHouseRooms = [] } = useQuery<{ roomId: string; roomNumber: string; guestName: string; reservationId: string }[]>({
    queryKey: ["/api/rooms/in-house"],
  });

  const { data: reservations = [] } = useQuery<TableReservation[]>({
    queryKey: ["/api/restaurant/table-reservations"],
  });

  const { data: timeSlots = [] } = useQuery<TimeSlot[]>({
    queryKey: ["/api/restaurant/time-slots"],
  });

  const { data: companies = [] } = useQuery<{ id: string; name: string; razonSocial: string; nombreFantasia?: string | null; cuilCuit: string }[]>({
    queryKey: ["/api/companies"],
  });
  const { data: posConfigsData = [] } = useQuery<any[]>({ queryKey: ["/api/pos-configs"] });
  const { data: allUsers = [] } = useQuery<{ id: string; username: string; fullName: string; role: string }[]>({
    queryKey: ["/api/admin/users"],
  });
  const isPrivilegedUser = user?.role === "admin" || user?.role === "manager";
  const restaurantUsers = allUsers.filter(u =>
    isPrivilegedUser
      ? (u.role === "restaurant" || u.role === "admin" || u.role === "manager")
      : u.role === "restaurant"
  );
  const { data: agencies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/agencies"],
  });

  const todayISO = new Date().toISOString().split("T")[0];
  const closeOrderTableId = currentOrder?.tableId ?? null;
  // Use the date the order was opened (not today) to find the correct reservation advances.
  // Orders opened yesterday should look for yesterday's reservation advances, not today's.
  const closeOrderDate = currentOrder?.openedAt
    ? new Date(currentOrder.openedAt).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })
    : todayISO;
  const { data: closeDialogTableAdvances = [] } = useQuery<RestaurantReservationAdvance[]>({
    queryKey: ["/api/restaurant/tables", closeOrderTableId, "advances", closeOrderDate],
    queryFn: async () => {
      if (!closeOrderTableId) return [];
      const res = await fetch(`/api/restaurant/tables/${closeOrderTableId}/advances?date=${closeOrderDate}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isCloseDialogOpen && !!closeOrderTableId,
  });
  const totalAdvanceCredit = closeDialogTableAdvances
    .filter(a => !a.appliedToOrderId)
    .reduce((s, a) => s + parseFloat(a.amount || "0"), 0);

  type RestaurantGuest = {
    id: string; tipoPersona: string | null; firstName: string; lastName: string;
    email: string | null; phone: string | null; documentType: string | null;
    documentNumber: string | null; cuilCuit: string | null;
    vatCondition: string | null;
    direccion: string | null; localidad: string | null;
    condicionVentaPredeterminada: string | null;
  };

  const { data: restaurantGuests = [], refetch: refetchClients } = useQuery<RestaurantGuest[]>({
    queryKey: ["/api/guests"],
  });

  const clientCreateMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/guests", data); return r.json(); },
    onSuccess: (guest: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      setClientDialogOpen(false);
      setClientEditingId(null);
      setClientForm({ tipoPersona: "fisica", firstName: "", lastName: "", email: "", phone: "", documentType: "dni", documentNumber: "", cuilCuit: "", vatCondition: "consumidor_final", direccion: "", provincia: "", localidad: "", condicionVentaPredeterminada: "contado" });
      toast({ title: "Cliente registrado" });
      if (clientCreatedForReservation) {
        clientCreatedForReservation(guest);
        setClientCreatedForReservation(null);
      }
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const clientUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => { const r = await apiRequest("PATCH", `/api/guests/${id}`, data); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      setClientDialogOpen(false);
      setClientEditingId(null);
      setClientForm({ tipoPersona: "fisica", firstName: "", lastName: "", email: "", phone: "", documentType: "dni", documentNumber: "", cuilCuit: "", vatCondition: "consumidor_final", direccion: "", provincia: "", localidad: "", condicionVentaPredeterminada: "contado" });
      toast({ title: "Cliente actualizado" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const todayReservations = reservations.filter(r =>
    r.reservationDate === todayStr &&
    !["cancelled", "completed", "historical", "no_show"].includes(r.status)
  );

  const getCategoryPriority = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("sin alcohol")) return 1;
    if (n.includes("bebida") && !n.includes("alcohol")) return 2;
    if (n.includes("con alcohol") || (n.includes("bebida") && n.includes("alcohol"))) return 3;
    if (n.includes("alcohol")) return 4;
    if (n.includes("entrada")) return 5;
    if (n.includes("postre")) return 90;
    return 50;
  };
  const sortedCategories = [...menuCategories].sort((a, b) => {
    const pa = getCategoryPriority(a.name);
    const pb = getCategoryPriority(b.name);
    if (pa !== pb) return pa - pb;
    return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  });
  // Si no hay categoría seleccionada, usar la primera automáticamente
  const effectiveCategory = selectedCategory ?? sortedCategories[0]?.id ?? null;

  const createReservationMutation = useMutation({
    mutationFn: async (data: ReservationFormValues) => {
      const res = await apiRequest("POST", "/api/restaurant/table-reservations", { ...data, status: "confirmed" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/table-reservations"] });
      setIsReservationDialogOpen(false);
      reservationForm.reset();
      toast({ title: "Reserva creada", description: "La reserva ha sido registrada" });
    },
  });

  const updateReservationMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TableReservation> }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/table-reservations/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/table-reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      setEditingReservation(null);
      toast({ title: "Reserva actualizada" });
    },
  });

  const deleteReservationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/table-reservations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/table-reservations"] });
      toast({ title: "Reserva eliminada" });
    },
  });

  const createAdvanceMutation = useMutation({
    mutationFn: async ({ reservationId, amount, paymentMethod, notes, receiptType, vatCondition, customerRazonSocial, customerCuit, puntoVenta }: { reservationId: string; amount: string; paymentMethod: string; notes: string; receiptType?: string; vatCondition?: string; customerRazonSocial?: string; customerCuit?: string; puntoVenta?: string }) => {
      const res = await apiRequest("POST", `/api/restaurant/table-reservations/${reservationId}/advances`, { amount, paymentMethod, notes, receiptType, vatCondition, customerRazonSocial, customerCuit, puntoVenta });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/advances", vars.reservationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/table-reservations"] });
      setAdvanceAmount("");
      setAdvanceNotes("");
      const isFactura = vars.receiptType && ["factura_a", "factura_b", "factura_c"].includes(vars.receiptType);
      if (isFactura && (_data as any)?.invoiceId) {
        window.open(`/api/billing/invoices/${(_data as any).invoiceId}/pdf`, "_blank");
        toast({ title: "Adelanto registrado — Factura emitida", description: `Voucher ${(_data as any).voucherNumber} generado con factura AFIP.` });
      } else {
        toast({ title: "Adelanto registrado", description: `Voucher ${(_data as any)?.voucherNumber || ""} generado` });
      }
    },
  });

  const deleteAdvanceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/reservation-advances/${id}`);
    },
    onSuccess: (_, __, ctx: any) => {
      if (advanceDialogReservationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/restaurant/advances", advanceDialogReservationId] });
      }
      toast({ title: "Adelanto eliminado" });
    },
  });

  const applyAdvancesMutation = useMutation({
    mutationFn: async ({ reservationId, orderId }: { reservationId: string; orderId: string }) => {
      const res = await apiRequest("POST", `/api/restaurant/table-reservations/${reservationId}/apply-advances`, { orderId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/table-reservations"] });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: { tableId?: string; areaId?: string; covers: number; waiterName: string; orderLabel?: string }) => {
      const res = await apiRequest("POST", "/api/restaurant/orders", data);
      return res.json();
    },
    onSuccess: (order: RestaurantOrder) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      const pendingReservation = pendingCheckInReservationRef.current;
      if (pendingReservation) {
        pendingCheckInReservationRef.current = null;
        const advAmt = parseFloat(pendingReservation.advanceAmount || "0");
        toast({
          title: `Check-in — ${pendingReservation.guestName}`,
          description: advAmt > 0
            ? `Comanda abierta. Seña de $${advAmt.toLocaleString("es-AR")} se descontará al cerrar.`
            : `Comanda abierta correctamente.`,
        });
        return;
      }
      // Auto check-in: if the new order's table has a "confirmed" reservation for today, auto-set to check_in
      if (order.tableId) {
        const _todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
        const _confirmedRes = reservations.find(r =>
          r.tableId === order.tableId && r.status === "confirmed" && r.reservationDate === _todayStr
        );
        if (_confirmedRes) {
          apiRequest("PATCH", `/api/restaurant/table-reservations/${_confirmedRes.id}`, { status: "check_in" })
            .then(() => queryClient.invalidateQueries({ queryKey: ["/api/restaurant/table-reservations"] }));
        }
      }
      setCurrentOrder(order);
      setIsNewOrderDialogOpen(false);
      setIsDirectOrderDialogOpen(false);
      setNewWaiterName("");
      setNewOrderLabel("");
      setOrderView("menu");
      setSelectedCategory(null);
      setIsOrderDialogOpen(true);
      toast({ title: "Pedido creado", description: `Pedido ${order.orderNumber} iniciado` });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: { orderId: string; menuItemId: string; quantity: number; notes?: string; course?: number; customPrice?: string; customName?: string }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/items`, {
        menuItemId: data.menuItemId,
        quantity: data.quantity,
        notes: data.notes,
        course: data.course === null ? null : (data.course || 1),
        customPrice: data.customPrice,
        customName: data.customName,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      setPendingItem(null);
      setItemNotes("");
      setItemQuantity(1);
      setIsEditableItem(false);
      setCustomItemName("");
      setCustomItemPrice("");
      toast({ title: "Item agregado" });
    },
  });

  const advanceCourseMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${orderId}/advance-course`);
      return res.json();
    },
    onSuccess: (data: { activeCourse: number; activatedItems: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      toast({ title: `Curso activado: ${courseLabels[data.activeCourse]}`, description: `${data.activatedItems} items enviados a cocina` });
    },
  });

  const updateItemCourseMutation = useMutation({
    mutationFn: async (data: { orderId: string; itemId: string; course: number }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/orders/${data.orderId}/items/${data.itemId}`, { course: data.course });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
    },
  });

  const updateAreaNameMutation = useMutation({
    mutationFn: async (data: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/areas/${data.id}`, { name: data.name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/areas"] });
      setEditingAreaId(null);
      toast({ title: "Área actualizada" });
    },
  });

  const handleSaveAreaName = (id: string) => {
    if (!editingAreaName.trim()) return;
    updateAreaNameMutation.mutate({ id, name: editingAreaName.trim() });
  };

  const transferItemsInSplitMutation = useMutation({
    mutationFn: async ({ orderId, itemIds, targetOrderId }: { orderId: string; itemIds: string[]; targetOrderId: string }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${orderId}/transfer-items`, { itemIds, targetOrderId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      setMoveItemSelectedIds(new Set());
      setMoveItemTargetOrderId("");
      setIsSplitMode(false);
      setIsCloseDialogOpen(false);
      toast({ title: "Ítems transferidos", description: "Los ítems se movieron a la otra comanda." });
    },
    onError: (err: any) => toast({ title: "Error al mover ítems", description: err.message, variant: "destructive" }),
  });

  const payItemsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/pay-items`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      setPayItemSelectedIds(new Set());
      setPayItemDiscount("");
      setIsSplitMode(false);
      if (data?.allPaid) {
        setIsCloseDialogOpen(false);
        toast({ title: "Cuenta cerrada", description: "Todos los ítems fueron cobrados." });
      } else {
        toast({ title: "Ítems cobrados", description: `$${parseFloat(data?.amount || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })} procesado. Saldo pendiente: $${parseFloat(data?.remainingTotal || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}` });
      }
    },
    onError: (err: any) => toast({ title: "Error al cobrar ítems", description: err.message, variant: "destructive" }),
  });

  const createSplitMutation = useMutation({
    mutationFn: async (data: { orderId: string; parts: number }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/split`, { parts: data.parts });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      toast({ title: "Cuenta dividida" });
    },
  });

  const paySplitMutation = useMutation({
    mutationFn: async (data: {
      orderId: string; splitId: string; method: string; receiptType: string; roomReservationId?: string;
      emitInvoice?: boolean; vatCondition?: string; customerRazonSocial?: string; customerCuit?: string;
    }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/orders/${data.orderId}/split/${data.splitId}`, {
        method: data.method,
        receiptType: data.receiptType,
        roomReservationId: data.roomReservationId,
        emitInvoice: data.emitInvoice,
        vatCondition: data.vatCondition,
        customerRazonSocial: data.customerRazonSocial,
        customerCuit: data.customerCuit,
      });
      return res.json();
    },
    onSuccess: (data: { split: OrderSplit; allPaid: boolean; invoiceId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      if (data.invoiceId) {
        window.open(`/api/billing/invoices/${data.invoiceId}/pdf`, "_blank");
      }
      if (data.allPaid) {
        setCurrentOrder(null);
        setIsCloseDialogOpen(false);
        setIsSplitMode(false);
        toast({ title: data.invoiceId ? "Mesa cerrada — Factura emitida" : "Todas las partes pagadas — mesa cerrada" });
      } else {
        toast({ title: data.invoiceId ? "Parte cobrada — Factura emitida" : "Parte cobrada" });
      }
    },
  });

  const cancelSplitMutation = useMutation({
    mutationFn: async (orderId: string) => {
      await apiRequest("DELETE", `/api/restaurant/orders/${orderId}/split`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      setIsSplitMode(false);
      toast({ title: "División cancelada" });
    },
  });

  const updateCoversMutation = useMutation({
    mutationFn: async ({ orderId, covers }: { orderId: string; covers: number }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/orders/${orderId}`, { covers });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      setEditingCovers(false);
      toast({ title: "Comensales actualizados" });
    },
    onError: () => toast({ title: "Error al actualizar comensales", variant: "destructive" }),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${orderId}/cancel`, { reason });
      return res.json();
    },
    onSuccess: () => {
      if (cancelledOrderSnapshot && cancelledOrderSnapshot.items.length > 0) {
        printCancellationComanda(cancelledOrderSnapshot.order, cancelledOrderSnapshot.items, cancelOrderReason);
      }
      setCancelledOrderSnapshot(null);
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      setShowCancelOrderDialog(false);
      setCancelOrderReason("");
      setIsOrderDialogOpen(false);
      setCurrentOrder(null);
      toast({ title: "Pedido anulado", description: "La comanda de anulación fue enviada a cocina." });
    },
    onError: (e: any) => toast({ title: e?.message || "Error al anular", variant: "destructive" }),
  });

  const transferItemsMutation = useMutation({
    mutationFn: async (data: { orderId: string; itemIds: string[]; targetOrderId: string; newOrderData?: any }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/transfer-items`, {
        itemIds: data.itemIds,
        targetOrderId: data.targetOrderId,
        newOrderData: data.newOrderData,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      setIsTransferMode(false);
      setTransferSelectedIds(new Set());
      setTransferTargetOrderId("");
      setTransferNewWaiter("");
      toast({ title: "Ítems transferidos correctamente" });
    },
    onError: (e: any) => toast({ title: e?.message || "Error al transferir ítems", variant: "destructive" }),
  });

  const updateSplitAmountMutation = useMutation({
    mutationFn: async ({ orderId, splitId, amount }: { orderId: string; splitId: string; amount: string }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/orders/${orderId}/split/${splitId}`, { amount });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
    },
    onError: () => {
      toast({ title: "Error al actualizar monto", variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (data: { orderId: string; itemId: string }) => {
      const res = await apiRequest("DELETE", `/api/restaurant/orders/${data.orderId}/items/${data.itemId}`);
      if (res.status === 204 || res.status === 200) return { success: true };
      return res.json();
    },
    onSuccess: () => {
      if (itemToVoid) {
        printCancellationComanda(getUpdatedOrder(), [itemToVoid.item], itemVoidReason || "Anulación de ítem");
      }
      setItemToVoid(null);
      setItemVoidReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      toast({ title: "Ítem anulado", description: "La comanda de anulación fue enviada a cocina." });
    },
    onError: () => {
      toast({ title: "Error al anular ítem", variant: "destructive" });
    },
  });

  const closeOrderMutation = useMutation({
    mutationFn: async (data: {
      orderId: string; receiptType: string; paymentMethod: string;
      discount?: number; discountType?: string; roomReservationId?: string;
      billingName?: string; billingCuit?: string; ccEntityType?: string; ccEntityId?: string;
      emitInvoice?: boolean; vatCondition?: string; customerRazonSocial?: string; customerCuit?: string;
      puntoVenta?: number; reservationAdvanceCredit?: number;
    }) => {
      const res = await apiRequest("POST", `/api/restaurant/orders/${data.orderId}/close`, {
        chargeToRoom: data.paymentMethod === "cuenta_habitacion",
        receiptType: data.receiptType,
        paymentMethod: data.paymentMethod,
        discount: data.discount,
        discountType: data.discountType,
        roomReservationId: data.roomReservationId,
        billingName: data.billingName,
        billingCuit: data.billingCuit,
        ccEntityType: data.ccEntityType,
        ccEntityId: data.ccEntityId,
        emitInvoice: data.emitInvoice,
        vatCondition: data.vatCondition,
        customerRazonSocial: data.customerRazonSocial,
        customerCuit: data.customerCuit,
        puntoVenta: data.puntoVenta,
        reservationAdvanceCredit: data.reservationAdvanceCredit,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      // Auto-complete: if the closed order's table has a check_in reservation today, move it to historical
      if (currentOrder?.tableId) {
        const _closedTableId = currentOrder.tableId;
        const _todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
        const _checkedInRes = reservations.find(r =>
          r.tableId === _closedTableId && r.status === "check_in" && r.reservationDate === _todayStr
        );
        if (_checkedInRes) {
          apiRequest("PATCH", `/api/restaurant/table-reservations/${_checkedInRes.id}`, { status: "historical" })
            .then(() => queryClient.invalidateQueries({ queryKey: ["/api/restaurant/table-reservations"] }));
        }
      }
      setCurrentOrder(null);
      setIsCloseDialogOpen(false);
      setCloseDiscount("");
      setCloseDiscountType("percent");
      setCloseRoomId("");
      setRoomSearchFilter("");
      setCloseBillingName("");
      setCloseBillingCuit("");
      setCloseBillingCompanyId("");
      setCloseCcEntityType("company");
      setCloseCcEntityId("");
      setBillingSearch("");
      setFbIsExento(false);
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/table-reservations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      if (data?.invoiceId) {
        window.open(`/api/billing/invoices/${data.invoiceId}/pdf`, "_blank");
        toast({ title: "Pedido cerrado — Factura emitida", description: "Se abrió el PDF en una nueva pestaña." });
      } else {
        toast({ title: "Pedido cerrado" });
      }
    },
  });

  const updateTableMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/tables/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
    },
  });

  const createTableMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/restaurant/tables", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      setIsAddTableDialogOpen(false);
      setNewTableNumber("");
      setNewTableCapacity(4);
      setNewTableShape("square");
      setNewTableWindow(false);
      toast({ title: "Mesa creada" });
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/tables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/tables"] });
      toast({ title: "Mesa eliminada" });
    },
  });

  const createMenuItemMutation = useMutation({
    mutationFn: async (data: MenuItemFormValues) => {
      const res = await apiRequest("POST", "/api/restaurant/menu/items", {
        ...data,
        price: data.price.toString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/items"] });
      setIsMenuItemDialogOpen(false);
      menuItemForm.reset();
      toast({ title: "Plato creado" });
    },
  });

  const updateMenuItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MenuItemFormValues }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/menu/items/${id}`, {
        ...data,
        price: data.price.toString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/items"] });
      setIsMenuItemDialogOpen(false);
      setEditingMenuItem(null);
      menuItemForm.reset();
      toast({ title: "Plato actualizado" });
    },
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/menu/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/items"] });
      toast({ title: "Plato eliminado" });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: CategoryFormValues) => {
      const res = await apiRequest("POST", "/api/restaurant/menu/categories", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/categories"] });
      setIsCategoryDialogOpen(false);
      categoryForm.reset();
      toast({ title: "Categoria creada" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CategoryFormValues }) => {
      const res = await apiRequest("PATCH", `/api/restaurant/menu/categories/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/categories"] });
      setIsCategoryDialogOpen(false);
      setEditingCategory(null);
      categoryForm.reset();
      toast({ title: "Categoria actualizada" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/menu/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/menu/categories"] });
      toast({ title: "Categoria eliminada" });
    },
  });

  const createTimeSlotMutation = useMutation({
    mutationFn: async (data: { time: string; areaId?: string | null }) => {
      const res = await apiRequest("POST", "/api/restaurant/time-slots", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/time-slots"] });
      setNewTimeSlot("");
      setNewTimeSlotArea("__none__");
      toast({ title: "Horario agregado" });
    },
  });

  const deleteTimeSlotMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/restaurant/time-slots/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/time-slots"] });
      toast({ title: "Horario eliminado" });
    },
  });

  const { data: billingInvoices = [], isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery<any[]>({
    queryKey: ["/api/billing/invoices", ncDateFrom, ncDateTo],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/billing/invoices?desde=${ncDateFrom}&hasta=${ncDateTo}`);
      return res.json();
    },
    enabled: activeTab === "notas_credito",
  });

  const createQuickClientMutation = useMutation({
    mutationFn: async (data: { razonSocial: string; cuilCuit: string; condicionIva: string }) => {
      const res = await apiRequest("POST", "/api/companies", {
        razonSocial: data.razonSocial,
        cuilCuit: data.cuilCuit,
        condicionIva: data.condicionIva,
        isActive: "true",
        pais: "Argentina",
      });
      return res.json();
    },
    onSuccess: (company) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setCloseBillingName(company.razonSocial);
      setCloseBillingCuit(formatCuit(company.cuilCuit || ""));
      setCloseBillingCompanyId(company.id);
      setBillingSearch(company.razonSocial);
      setIsNewClientDialogOpen(false);
      setNewClientRazonSocial(""); setNewClientCuit(""); setNewClientCondicionIva("exento");
      toast({ title: "Cliente creado y seleccionado" });
    },
    onError: () => toast({ title: "Error al crear cliente", variant: "destructive" }),
  });

  const emitirNCMutation = useMutation({
    mutationFn: async ({ invoiceId, motivo }: { invoiceId: number; motivo: string }) => {
      const res = await apiRequest("POST", `/api/billing/invoices/${invoiceId}/nota-credito`, { motivo });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Error al emitir NC"); }
      return res.json();
    },
    onSuccess: () => {
      setInvoiceForNC(null);
      setNcMotivo("");
      refetchInvoices();
      toast({ title: "Nota de Crédito emitida", description: "La factura original quedó anulada." });
    },
    onError: (e: any) => {
      toast({ title: "Error al emitir NC", description: e.message, variant: "destructive" });
    },
  });

  const filteredTables = selectedArea === "all"
    ? tables
    : tables.filter((t) => t.areaId === selectedArea);

  const activeOrders = orders.filter((o) => o.status !== "closed" && o.status !== "cancelled");

  const handleTableClick = (table: RestaurantTable) => {
    if (isEditMode) return;
    setSelectedTable(table);
    if (table.status === "available") {
      setCurrentOrder(null);
      setNewCovers(table.capacity);
      setNewWaiterName("");
      setIsNewOrderDialogOpen(true);
    } else if (table.status === "occupied") {
      // Defensa frontend: solo considerar órdenes de HOY en Argentina.
      // Aunque el backend ya filtra por fecha, esta capa extra previene que
      // órdenes viejas (de días anteriores) que escaparon el filtro abran el dialog.
      const todayArgentina = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const tableOrder = orders.find((o) => {
        if (o.tableId !== table.id || o.status === "closed" || o.status === "cancelled") return false;
        const orderDate = new Date(o.openedAt).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
        return orderDate === todayArgentina;
      });
      if (tableOrder) {
        setCurrentOrder(tableOrder);
        const orderItems = (tableOrder as any).items || [];
        setOrderView(orderItems.length > 0 ? "comanda" : "menu");
        setSelectedCategory(null);
        setIsOrderDialogOpen(true);
      } else {
        // Mesa trabada como "occupied" sin pedido válido de hoy (quedó de jornada anterior).
        // El backend ya la habrá liberado en el próximo refetch; tratarla como disponible.
        setCurrentOrder(null);
        setNewCovers(table.capacity);
        setNewWaiterName("");
        setIsNewOrderDialogOpen(true);
      }
    }
  };

  const handleCheckIn = (reservation: TableReservation) => {
    updateReservationMutation.mutate({ id: reservation.id, data: { status: "check_in" } });
    if (reservation.tableId) {
      const table = tables.find(t => t.id === reservation.tableId);
      if (table) {
        const advAmt = parseFloat(reservation.advanceAmount || "0");
        if (table.status === "available") {
          pendingCheckInReservationRef.current = reservation;
          createOrderMutation.mutate({
            tableId: reservation.tableId,
            covers: reservation.partySize,
            waiterName: "",
          });
        } else if (table.status === "occupied") {
          const tableOrder = orders.find(o => o.tableId === table.id && o.status !== "closed" && o.status !== "cancelled");
          if (tableOrder) {
            setCurrentOrder(tableOrder);
            setOrderView(((tableOrder as any).items || []).length > 0 ? "comanda" : "menu");
            setSelectedCategory(null);
            setIsOrderDialogOpen(true);
          }
          toast({
            title: `Check-in — ${reservation.guestName}`,
            description: advAmt > 0
              ? `Seña aplicada a la comanda: $${advAmt.toLocaleString("es-AR")}`
              : `Check-in registrado.`,
          });
        } else {
          toast({ title: `Check-in — ${reservation.guestName}`, description: `Mesa ${table.tableNumber} marcada.` });
        }
      }
    } else {
      toast({ title: `Check-in — ${reservation.guestName}`, description: "Reserva sin mesa asignada. Asignar mesa para abrir comanda." });
    }
  };

  const handleConfirmItem = () => {
    if (currentOrder && pendingItem) {
      if (isEditableItem && (!customItemName.trim() || !customItemPrice)) {
        toast({ title: "Complete descripción y precio", variant: "destructive" });
        return;
      }
      addItemMutation.mutate({
        orderId: currentOrder.id,
        menuItemId: pendingItem.id,
        quantity: itemQuantity,
        notes: itemNotes || undefined,
        course: (() => {
          const cat = menuCategories.find(c => c.id === pendingItem.categoryId);
          const bevCats = ["bebidas sin alcohol", "cervezas", "vinos", "espumantes", "vinos de ríos", "bebidas"];
          return cat && bevCats.some(bc => cat.name.toLowerCase().includes(bc)) ? null : itemCourse;
        })(),
        customPrice: isEditableItem ? customItemPrice : undefined,
        customName: isEditableItem ? customItemName : undefined,
      });
    }
    setMenuSearch("");
    setShowItemNotes(false);
    setItemNotes("");
  };

  const handleCancelItem = () => {
    setPendingItem(null);
    setItemNotes("");
    setItemQuantity(1);
    setIsEditableItem(false);
    setCustomItemName("");
    setCustomItemPrice("");
    setMenuSearch("");
    setShowItemNotes(false);
  };

  const getUpdatedOrder = () => {
    if (!currentOrder) return null;
    return orders.find(o => o.id === currentOrder.id) || currentOrder;
  };

  const getOrderItems = () => {
    const order = getUpdatedOrder();
    return order?.items || [];
  };

  const handleDragStart = (table: RestaurantTable) => {
    if (!isEditMode) return;
    setDraggedTable(table);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (x: number, y: number, areaId: string) => {
    if (!draggedTable || !isEditMode) return;
    const existingTable = tables.find(t => t.positionX === x && t.positionY === y && t.areaId === areaId && t.id !== draggedTable.id);
    if (existingTable) return;
    updateTableMutation.mutate({
      id: draggedTable.id,
      data: { positionX: x, positionY: y },
    });
    setDraggedTable(null);
  };

  const todayForFilter = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const filteredReservations = reservations
    .filter(r => {
      if (reservationViewMode === "day") {
        if (r.reservationDate !== reservationDateFilter) return false;
      } else if (reservationViewMode === "past") {
        if (r.reservationDate >= todayForFilter) return false;
      }
      if (reservationStatusFilter !== "all" && r.status !== reservationStatusFilter) return false;
      if (reservationAreaFilter !== "all") {
        const resAreaId = (r as any).areaId;
        const tableAreaId = tables.find(t => t.id === r.tableId)?.areaId;
        const effectiveArea = resAreaId || tableAreaId;
        if (effectiveArea !== reservationAreaFilter) return false;
      }
      const search = (reservationSearch || reservationSearchText).toLowerCase();
      if (search) {
        return r.guestName.toLowerCase().includes(search) ||
          (r.guestPhone && r.guestPhone.includes(search));
      }
      return true;
    })
    .sort((a, b) => {
      const dateCompare = a.reservationDate.localeCompare(b.reservationDate);
      if (dateCompare !== 0) return dateCompare;
      if (reservationSortBy === "time") return a.reservationTime.localeCompare(b.reservationTime);
      return a.guestName.localeCompare(b.guestName);
    });

  const dayStats = reservations.filter(r => r.reservationDate === reservationDateFilter).reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  const openMenuItemDialog = (item?: MenuItem) => {
    if (item) {
      setEditingMenuItem(item);
      menuItemForm.reset({
        name: item.name,
        categoryId: item.categoryId,
        description: item.description || "",
        price: parseFloat(item.price),
        preparationTime: item.preparationTime || 0,
        isAvailable: item.isAvailable || "true",
        isEditable: (item as any).isEditable || "false",
        defaultCourse: item.defaultCourse ?? undefined,
      });
    } else {
      setEditingMenuItem(null);
      menuItemForm.reset({
        name: "",
        categoryId: sortedCategories[0]?.id || "",
        description: "",
        price: 0,
        preparationTime: 0,
        isAvailable: "true",
        isEditable: "false",
        defaultCourse: undefined,
      });
    }
    setIsMenuItemDialogOpen(true);
  };

  const openCategoryDialog = (cat?: MenuCategory) => {
    if (cat) {
      setEditingCategory(cat);
      categoryForm.reset({
        name: cat.name,
        description: cat.description || "",
        displayOrder: cat.displayOrder || 0,
      });
    } else {
      setEditingCategory(null);
      categoryForm.reset({ name: "", description: "", displayOrder: 0 });
    }
    setIsCategoryDialogOpen(true);
  };

  const printBillPreview = () => {
    const order = getUpdatedOrder();
    if (!order) return;
    const items = getOrderItems();
    const win = window.open("", "_blank");
    if (!win) return;
    const esc = (s: string) => { const d = win.document.createElement("div"); d.textContent = s; return d.innerHTML; };

    const subtotal = parseFloat(order.total || "0");
    const disc = parseFloat(closeDiscount || "0");
    const discAmount = disc > 0
      ? (closeDiscountType === "percent" ? subtotal * disc / 100 : disc)
      : 0;
    const finalTotal = Math.max(0, subtotal - discAmount);

    const rows = items.map(item => `
      <tr>
        <td style="padding:4px 8px">${esc(item.menuItem?.name || "Item")}</td>
        <td style="padding:4px 8px;text-align:center">${item.quantity}</td>
        <td style="padding:4px 8px;text-align:right">$${parseFloat(item.subtotal).toLocaleString("es-AR",{minimumFractionDigits:2})}</td>
      </tr>`).join("");

    const discountRows = discAmount > 0 ? `
      <tr>
        <td colspan="2" style="padding:4px 8px;font-size:12px">Subtotal:</td>
        <td style="padding:4px 8px;text-align:right;font-size:12px">$${subtotal.toLocaleString("es-AR",{minimumFractionDigits:2})}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:4px 8px;font-size:12px;color:#2a7a2a">Descuento (${closeDiscountType === "percent" ? `${disc}%` : "$" + disc.toLocaleString("es-AR",{minimumFractionDigits:2})}):</td>
        <td style="padding:4px 8px;text-align:right;font-size:12px;color:#2a7a2a">-$${discAmount.toLocaleString("es-AR",{minimumFractionDigits:2})}</td>
      </tr>` : "";

    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cuenta</title>
    <style>body{font-family:Arial,sans-serif;max-width:500px;margin:30px auto;padding:16px}h2,h3{text-align:center;margin:4px 0}
    table{width:100%;border-collapse:collapse;margin:12px 0}th{background:#f0f0f0;padding:6px 8px;text-align:left;font-size:12px}
    td{font-size:12px;border-bottom:1px solid #eee}
    .total-row{font-weight:bold;font-size:13px;border-top:2px solid #333}
    .total-row td{padding:6px 8px}
    hr{border:none;border-top:1px dashed #ccc;margin:10px 0}
    @media print{body{margin:10px}}</style></head><body>
    <h2>MARAN SUITES &amp; TOWERS</h2>
    <h3>Restaurante</h3>
    <hr>
    <p style="font-size:12px;margin:4px 0"><b>Mesa/Pedido:</b> ${esc(order.orderLabel || String(order.orderNumber))}</p>
    ${order.waiterName ? `<p style="font-size:12px;margin:4px 0"><b>Mozo:</b> ${esc(order.waiterName)}</p>` : ""}
    <p style="font-size:12px;margin:4px 0"><b>Fecha:</b> ${esc(format(new Date(), "dd/MM/yyyy HH:mm"))}</p>
    <hr>
    <table><thead><tr><th>Ítem</th><th style="text-align:center">Cant.</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <hr>
    <table><tbody>
      ${discountRows}
      <tr class="total-row">
        <td colspan="2">TOTAL${discAmount > 0 ? " CON DESCUENTO" : ""}:</td>
        <td style="text-align:right;font-size:15px">$${finalTotal.toLocaleString("es-AR",{minimumFractionDigits:2})}</td>
      </tr>
    </tbody></table>
    <hr>
    <p style="text-align:center;font-size:11px;color:#666">Este no es el comprobante fiscal final.</p>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
    win.document.close();
  };

  const printCancellationComanda = (order: any, items: any[], reason: string) => {
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = items.map((item: any) => `
      <tr>
        <td style="padding:5px 8px;font-size:13px">${esc(item.menuItem?.name || "Item")}</td>
        <td style="padding:5px 8px;text-align:center;font-size:13px">${item.quantity}</td>
        <td style="padding:5px 8px;text-align:left;font-size:11px;color:#888">${item.notes && !item.notes.startsWith("[") ? esc(item.notes) : ""}</td>
      </tr>`).join("");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ANULACIÓN</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:400px;margin:20px auto;padding:16px}
      h2,h3{text-align:center;margin:4px 0;font-size:14px}
      .anulado{text-align:center;font-size:22px;font-weight:bold;color:#cc0000;border:3px solid #cc0000;padding:10px 16px;margin:14px 0;letter-spacing:3px}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      th{background:#f0f0f0;padding:6px 8px;text-align:left;font-size:11px;font-weight:bold}
      td{border-bottom:1px solid #eee}
      hr{border:none;border-top:1px dashed #999;margin:8px 0}
      .meta{font-size:12px;margin:3px 0}
      .motivo{font-size:11px;color:#333;margin-top:10px;border-top:1px solid #ccc;padding-top:8px}
      @media print{body{margin:4px}}
    </style></head><body>
    <h2>MARAN SUITES &amp; TOWERS</h2>
    <h3>Restaurante — Cocina</h3>
    <div class="anulado">⚠&nbsp;ANULACIÓN</div>
    <hr>
    <p class="meta"><b>Mesa/Pedido:</b> ${esc(order?.orderLabel || String(order?.orderNumber || ""))}</p>
    ${order?.waiterName ? `<p class="meta"><b>Mozo:</b> ${esc(order.waiterName)}</p>` : ""}
    <p class="meta"><b>Hora:</b> ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</p>
    <hr>
    <table>
      <thead><tr><th>Ítem ANULADO</th><th style="text-align:center">Cant.</th><th>Obs.</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="motivo"><b>Motivo:</b> ${esc(reason)}</p>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
    win.document.close();
  };

  if (areasLoading || tablesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Restaurante</h1>
          <p className="text-muted-foreground">Gestiona mesas, pedidos y menu</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/mozo">
            <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-goto-mozo">
              <Smartphone className="h-4 w-4" />
              Vista Mozo
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => setIsDailyReservationsOpen(true)}
            data-testid="button-daily-reservations"
          >
            <CalendarDays className="h-4 w-4 mr-2" />
            Reservas del dia
            {todayReservations.length > 0 && (
              <Badge variant="secondary" className="ml-2">{todayReservations.length}</Badge>
            )}
          </Button>
          <Badge variant="outline" className="gap-1">
            <UtensilsCrossed className="h-3 w-3" />
            {activeOrders.length} pedidos activos
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="floor" data-testid="tab-floor">
            <MapPin className="h-4 w-4 mr-2" />
            Plano de Mesas
          </TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">
            <Clock className="h-4 w-4 mr-2" />
            Pedidos
          </TabsTrigger>
          <TabsTrigger value="menu" data-testid="tab-menu">
            <UtensilsCrossed className="h-4 w-4 mr-2" />
            Menu
          </TabsTrigger>
          <TabsTrigger value="reservations" data-testid="tab-reservations">
            <CalendarDays className="h-4 w-4 mr-2" />
            Reservas
          </TabsTrigger>
          <TabsTrigger value="notas_credito" data-testid="tab-notas-credito">
            <FileX className="h-4 w-4 mr-2" />
            Notas de Crédito
          </TabsTrigger>
          <TabsTrigger value="clientes" data-testid="tab-clientes">
            <Users className="h-4 w-4 mr-2" />
            Clientes
          </TabsTrigger>
        </TabsList>

        {/* ==================== FLOOR PLAN TAB ==================== */}
        <TabsContent value="floor" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedArea} onValueChange={setSelectedArea}>
              <SelectTrigger className="w-48" data-testid="select-area">
                <SelectValue placeholder="Filtrar por area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las areas</SelectItem>
                {areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 text-sm text-muted-foreground">
              {Object.entries(tableStatusLabels).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1">
                  <div className={`w-3 h-3 rounded-full ${tableStatusColors[key]}`} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {canEditLayout && (
                <Button
                  variant={isEditMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsEditMode(!isEditMode)}
                  data-testid="button-edit-layout"
                >
                  {isEditMode ? <Check className="h-4 w-4 mr-2" /> : <Settings className="h-4 w-4 mr-2" />}
                  {isEditMode ? "Guardar Layout" : "Editar Layout"}
                </Button>
              )}
              {isEditMode && (
                <Button
                  size="sm"
                  onClick={() => {
                    if (areas.length > 0) {
                      setNewTableArea(areas[0].id);
                      setIsAddTableDialogOpen(true);
                    }
                  }}
                  data-testid="button-add-table"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Mesa
                </Button>
              )}
            </div>
          </div>

          {/* Reservas sin mesa asignada — hoy */}
          {(() => {
            const todayFloor = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
            const tablelessToday = reservations.filter(
              r => !r.tableId && r.reservationDate === todayFloor && ["pending","confirmed","check_in"].includes(r.status)
            ).sort((a,b) => a.reservationTime.localeCompare(b.reservationTime));
            if (tablelessToday.length === 0) return null;
            return (
              <div className="mb-2 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <span className="text-sm font-semibold text-violet-800 dark:text-violet-300">Reservas sin mesa asignada — hoy</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tablelessToday.map(r => {
                    const advAmt = parseFloat(r.advanceAmount || "0");
                    return (
                      <div key={r.id} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-violet-950/40 border border-violet-200 dark:border-violet-700 rounded-md shadow-sm">
                        <div className="text-sm">
                          <span className="font-medium">{r.guestName.split(" ")[0]}</span>
                          <span className="text-muted-foreground ml-1">{r.reservationTime.slice(0,5)}</span>
                          <span className="text-muted-foreground ml-1">({r.partySize}p)</span>
                          {advAmt > 0 && (
                            <span className="ml-2 text-xs font-semibold text-green-700 dark:text-green-400">
                              <CreditCard className="inline h-3 w-3 mr-0.5" />${advAmt.toLocaleString("es-AR")}
                            </span>
                          )}
                        </div>
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs"
                          onClick={() => { setAssignTableReservation(r); setIsAssignTableDialogOpen(true); }}
                          data-testid={`button-floor-assign-${r.id}`}>
                          <MapPin className="h-3 w-3 mr-1" />Asignar
                        </Button>
                        {r.status !== "check_in" && (
                          <Button size="sm" className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700"
                            onClick={() => handleCheckIn(r)}
                            data-testid={`button-floor-checkin-${r.id}`}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Check-in
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {areas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin areas configuradas</h3>
                <p className="text-muted-foreground mb-4">Agrega areas y mesas para comenzar</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {(selectedArea === "all" ? areas : areas.filter((a) => a.id === selectedArea)).map((area) => {
                if (area.hasTables === "false") {
                  const areaOrders = activeOrders.filter((o) => o.areaId === area.id);
                  return (
                    <Card key={area.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{area.name}</CardTitle>
                          <Button
                            size="sm"
                            onClick={() => {
                              setDirectOrderAreaId(area.id);
                              setNewWaiterName("");
                              setNewOrderLabel("");
                              setNewCovers(1);
                              setIsDirectOrderDialogOpen(true);
                            }}
                            data-testid={`button-new-direct-order-${area.id}`}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Nueva Orden
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {areaOrders.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">Sin órdenes activas</p>
                        ) : (
                          <div className="space-y-2">
                            {areaOrders.map((order) => (
                              <button
                                key={order.id}
                                className="w-full flex items-center justify-between p-3 border rounded-md hover-elevate text-left"
                                onClick={() => {
                                  setCurrentOrder(order);
                                  const orderItems = (order as any).items || [];
                                  setOrderView(orderItems.length > 0 ? "comanda" : "menu");
                                  setSelectedCategory(null);
                                  setIsOrderDialogOpen(true);
                                }}
                                data-testid={`direct-order-${order.id}`}
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{order.orderLabel || order.orderNumber}</span>
                                    <Badge variant="outline" className="text-xs">{order.orderNumber}</Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    Mozo: {order.waiterName || "—"} | {new Date(order.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                                    {order.items && order.items.length > 0 && ` | ${order.items.length} items`}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="font-semibold">${parseFloat(order.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                                  <div className="text-xs">
                                    <Badge variant={order.status === "open" ? "default" : order.status === "in_progress" ? "secondary" : "outline"} className="text-xs">
                                      {order.status === "open" ? "Abierto" : order.status === "in_progress" ? "En curso" : order.status}
                                    </Badge>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                }

                const areaTables = filteredTables.filter((t) => t.areaId === area.id);
                const gridCols = 8;
                const gridRows = 6;

                return (
                  <Card key={area.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {isEditMode && editingAreaId === area.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editingAreaName}
                                onChange={(e) => setEditingAreaName(e.target.value)}
                                className="h-8 text-base font-semibold w-40"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveAreaName(area.id);
                                  if (e.key === "Escape") setEditingAreaId(null);
                                }}
                                autoFocus
                              />
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSaveAreaName(area.id)}>
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingAreaId(null)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {area.name}
                              {isEditMode && (
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingAreaId(area.id); setEditingAreaName(area.name); }} data-testid={`button-edit-area-${area.id}`}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </CardTitle>
                        <span className="text-sm text-muted-foreground">
                          {areaTables.length} mesas | Capacidad: {area.capacity}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div
                        className="grid gap-1 p-4 bg-muted/30 rounded-lg relative"
                        style={{
                          gridTemplateColumns: `repeat(${gridCols}, minmax(70px, 1fr))`,
                          gridTemplateRows: `repeat(${gridRows}, 75px)`,
                        }}
                      >
                        {Array.from({ length: gridCols * gridRows }).map((_, idx) => {
                          const x = idx % gridCols;
                          const y = Math.floor(idx / gridCols);
                          const table = areaTables.find(t => t.positionX === x && t.positionY === y);

                          if (table) {
                            const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
                            const todayTableReservations = reservations.filter(
                              (r) => r.tableId === table.id && r.reservationDate === todayISO &&
                                ["pending", "confirmed", "check_in", "seated"].includes(r.status)
                            ).sort((a, b) => a.reservationTime.localeCompare(b.reservationTime));
                            const hasReservationToday = todayTableReservations.length > 0;
                            const nextReservation = todayTableReservations[0];
                            const isCheckedIn = todayTableReservations.some(r => r.status === "check_in" || r.status === "seated");
                            const effectiveStatus = table.status === "available" && hasReservationToday
                              ? (isCheckedIn ? "occupied" : "reserved")
                              : table.status;
                            return (
                              <button
                                key={table.id}
                                draggable={isEditMode}
                                onDragStart={() => handleDragStart(table)}
                                onDragOver={handleDragOver}
                                onDrop={() => handleDrop(x, y, area.id)}
                                onClick={() => handleTableClick(table)}
                                className={`p-2 border-2 transition-all flex flex-col items-center justify-center gap-0.5 relative ${
                                  tableStatusColors[effectiveStatus]
                                } ${table.shape === "round" ? "rounded-full" : "rounded-md"} ${
                                  isEditMode ? "cursor-grab active:cursor-grabbing ring-2 ring-primary/30" : "hover-elevate"
                                } ${draggedTable?.id === table.id ? "opacity-50" : ""}`}
                                style={{
                                  gridColumn: x + 1,
                                  gridRow: y + 1,
                                }}
                                data-testid={`table-${table.tableNumber}`}
                              >
                                {table.hasWindow === "true" && (
                                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-sky-500 rounded-full flex items-center justify-center" title="Ventana">
                                    <Eye className="h-2.5 w-2.5 text-white" />
                                  </div>
                                )}
                                {/* Reservation badge — top-left */}
                                {hasReservationToday && !isCheckedIn && (
                                  <div className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] bg-violet-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center px-1 shadow-sm" title={`Reserva: ${nextReservation?.guestName} ${nextReservation?.reservationTime}`}>
                                    {todayTableReservations.length > 1 ? todayTableReservations.length : nextReservation?.reservationTime?.slice(0, 5)}
                                  </div>
                                )}
                                <span className="font-bold text-sm">{table.tableNumber}</span>
                                <div className="flex items-center gap-0.5 text-[10px]">
                                  <Users className="h-2.5 w-2.5" />
                                  {table.capacity}
                                </div>
                                {table.status === "occupied" && (() => {
                                  const tableOrder = activeOrders.find(o => o.tableId === table.id);
                                  if (!tableOrder) return null;
                                  const tableSplits = (tableOrder as any)?.splits || [];
                                  const paidSplits = tableSplits.filter((s: any) => s.isPaid === "true").length;
                                  const checkedInRes = todayTableReservations.find(r => r.status === "seated")
                                    || todayTableReservations.find(r => r.status === "check_in")
                                    || todayTableReservations.find(r => r.status === "confirmed");
                                  return (
                                    <>
                                      {checkedInRes ? (
                                        <span className="text-[9px] truncate max-w-full opacity-90 font-medium">{checkedInRes.guestName.split(" ")[0]}</span>
                                      ) : tableOrder.waiterName ? (
                                        <span className="text-[9px] truncate max-w-full opacity-80">{tableOrder.waiterName}</span>
                                      ) : null}
                                      <TableElapsedBadge openedAt={tableOrder.openedAt} />
                                      {tableSplits.length > 0 && (
                                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded leading-none ${paidSplits < tableSplits.length ? "bg-amber-400/90 text-amber-900" : "bg-green-500/90 text-white"}`}>
                                          DIV {paidSplits}/{tableSplits.length}
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                                {hasReservationToday && !table.status.includes("occupied") && nextReservation && (
                                  <span className="text-[9px] truncate max-w-full opacity-90 font-medium">
                                    {nextReservation.guestName.split(" ")[0]}
                                  </span>
                                )}
                                {isEditMode && (
                                  <GripVertical className="h-3 w-3 opacity-50" />
                                )}
                              </button>
                            );
                          }

                          return (
                            <div
                              key={`empty-${x}-${y}`}
                              className={`rounded-md transition-all ${
                                isEditMode
                                  ? "border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5"
                                  : "opacity-0"
                              }`}
                              onDragOver={handleDragOver}
                              onDrop={() => handleDrop(x, y, area.id)}
                              style={{
                                gridColumn: x + 1,
                                gridRow: y + 1,
                              }}
                            />
                          );
                        })}
                      </div>
                      {isEditMode && areaTables.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {areaTables.map(t => (
                            <div key={t.id} className="flex items-center gap-1 text-xs border rounded px-2 py-1">
                              <span>Mesa {t.tableNumber}</span>
                              {t.hasWindow === "true" && <Eye className="h-3 w-3 text-sky-500" />}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => {
                                  setEditingTable(t);
                                  setEditTableCapacity(t.capacity);
                                  setEditTableShape(t.shape || "square");
                                  setEditTableWindow(t.hasWindow === "true");
                                  setIsEditTableDialogOpen(true);
                                }}
                                data-testid={`button-edit-table-${t.tableNumber}`}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => deleteTableMutation.mutate(t.id)}
                                data-testid={`button-delete-table-${t.tableNumber}`}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ==================== ORDERS TAB ==================== */}
        <TabsContent value="orders" className="space-y-4">
          {ordersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : activeOrders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <UtensilsCrossed className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin pedidos activos</h3>
                <p className="text-muted-foreground">Los pedidos apareceran aqui cuando las mesas esten ocupadas</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeOrders.map((order) => (
                <Card key={order.id} data-testid={`order-card-${order.orderNumber}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{order.orderLabel || order.orderNumber}</CardTitle>
                      <Badge variant={order.status === "open" ? "default" : "secondary"}>
                        {order.status === "open" ? "Abierto" : order.status === "in_progress" ? "En Proceso" : "Servido"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {order.table && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        Mesa {order.table.tableNumber}
                      </div>
                    )}
                    {!order.tableId && order.areaId && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {areas.find(a => a.id === order.areaId)?.name}
                      </div>
                    )}
                    {order.waiterName && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        Mozo: {order.waiterName}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {order.covers} comensales
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Abierto: {new Date(order.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="pt-2 border-t flex items-center justify-between">
                      <span className="font-semibold">Total:</span>
                      <span className="text-lg font-bold">
                        ${parseFloat(order.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setCurrentOrder(order);
                          const orderItems = (order as any).items || [];
                          setOrderView(orderItems.length > 0 ? "comanda" : "menu");
                          setSelectedCategory(null);
                          setIsOrderDialogOpen(true);
                        }}
                        data-testid={`button-add-items-${order.orderNumber}`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Items
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setCurrentOrder(order);
                          setClosePaymentMethod("efectivo");
                          setCloseDiscount("");
                          setCloseDiscountType("percent");
                          setCloseRoomId("");
                          setRoomSearchFilter("");
                          const _todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
                          const _tableRes = reservations.find(r => r.tableId === order.tableId && (r.status === "check_in" || r.status === "seated" || r.status === "confirmed") && r.reservationDate === _todayISO);
                          const _resClient = (_tableRes as any)?.clientId ? restaurantGuests.find(g => g.id === (_tableRes as any).clientId) : null;
                          const _needsFactura = _resClient && _resClient.vatCondition && !["consumidor_final", ""].includes(_resClient.vatCondition || "");
                          setCloseReceiptType(_needsFactura ? "factura_a" : "cierre_mesa");
                          setCloseBillingName(_needsFactura ? `${_resClient!.firstName} ${_resClient!.lastName}`.toUpperCase() : (_tableRes ? _tableRes.guestName : ""));
                          setCloseBillingCuit(_needsFactura ? (_resClient!.cuilCuit || "") : "");
                          setCloseBillingCompanyId("");
                          setCloseCcEntityType("company");
                          setCloseCcEntityId("");
                          setBillingSearch("");
                          setFbIsExento(false);
                          setSplitCustomerNames({});
                          setSplitCustomerCuits({});
                          setSplitVatConditions({});
                          setSplitFbIsExento({});
                          setIsSplitMode(false);
                          setIsCloseDialogOpen(true);
                        }}
                        data-testid={`button-close-${order.orderNumber}`}
                      >
                        <CreditCard className="h-4 w-4 mr-1" />
                        Cerrar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ==================== MENU TAB ==================== */}
        <TabsContent value="menu" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Carta del Restaurante</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => openCategoryDialog()} data-testid="button-add-category">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Categoria
              </Button>
              <Button onClick={() => openMenuItemDialog()} data-testid="button-add-menu-item">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Plato
              </Button>
            </div>
          </div>
          {sortedCategories.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <UtensilsCrossed className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Menu vacio</h3>
                <p className="text-muted-foreground mb-4">Agrega categorias y platos al menu</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {sortedCategories.map((category) => (
                <Card key={category.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {category.name}
                          <Badge variant="outline" className="text-xs">Orden: {category.displayOrder ?? 0}</Badge>
                        </CardTitle>
                        {category.description && (
                          <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openCategoryDialog(category)} data-testid={`button-edit-category-${category.id}`}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteCategoryMutation.mutate(category.id)} data-testid={`button-delete-category-${category.id}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {menuItems
                        .filter((item) => item.categoryId === category.id)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="p-3 border rounded-md flex items-start justify-between gap-2"
                            data-testid={`menu-item-${item.id}`}
                          >
                            <div className="flex-1">
                              <div className="font-medium">{item.name}</div>
                              {item.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                              )}
                              {item.preparationTime && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                  <Clock className="h-3 w-3" />
                                  {item.preparationTime} min
                                </div>
                              )}
                            </div>
                            <div className="text-right flex flex-col items-end gap-1">
                              <div className="font-semibold">
                                ${parseFloat(item.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </div>
                              {item.isAvailable === "false" && (
                                <Badge variant="destructive" className="text-xs">No disponible</Badge>
                              )}
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openMenuItemDialog(item)} data-testid={`button-edit-item-${item.id}`}>
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteMenuItemMutation.mutate(item.id)} data-testid={`button-delete-item-${item.id}`}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ==================== RESERVATIONS TAB ==================== */}
        <TabsContent value="reservations" className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">Reservas de Mesa</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const date = reservationDateFilter;
                  const dayReservations = reservations.filter(r => r.reservationDate === date && r.status !== "cancelled");
                  const lines = dayReservations
                    .sort((a, b) => a.reservationTime.localeCompare(b.reservationTime))
                    .map(r => {
                      const t = tables.find(x => x.id === r.tableId);
                      const advAmt = parseFloat(r.advanceAmount || "0");
                      const advStr = advAmt > 0 ? `  Seña: $${advAmt.toLocaleString("es-AR")}` : "";
                      return `${r.reservationTime}  ${r.guestName}  (${r.partySize}p)  Mesa: ${t?.tableNumber || "—"}  Tel: ${r.guestPhone || "—"}  ${reservationStatusLabels[r.status]}${advStr}`;
                    }).join("\n");
                  const w = window.open("", "_blank", "width=600,height=700");
                  if (w) {
                    const [y,m,d] = date.split("-").map(Number);
                    const dateStr = format(new Date(y,m-1,d), "EEEE d/MM/yyyy", { locale: es });
                    w.document.write(`<html><head><title>Reservas ${date}</title><style>body{font-family:monospace;padding:20px}h1{font-size:16px}pre{white-space:pre;line-height:1.8}</style></head><body><h1>Reservas del día — ${dateStr}</h1><pre>${lines || "Sin reservas"}</pre></body></html>`);
                    w.document.close();
                    w.print();
                  }
                }}
                data-testid="button-print-reservations"
              >
                <Printer className="h-4 w-4 mr-1" />
                Imprimir lista
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const date = reservationDateFilter;
                  const dayReservations = reservations
                    .filter(r => r.reservationDate === date && r.status !== "cancelled")
                    .sort((a, b) => a.reservationTime.localeCompare(b.reservationTime));
                  const [y,m,d] = date.split("-").map(Number);
                  const dateStr = format(new Date(y,m-1,d), "EEEE d 'de' MMMM yyyy", { locale: es });
                  const rows = dayReservations.map(r => {
                    const t = tables.find(x => x.id === r.tableId);
                    const statusLabel = reservationStatusLabels[r.status] || r.status;
                    const adv = parseFloat(r.advanceAmount || "0") > 0 ? `$${parseFloat(r.advanceAmount!).toLocaleString("es-AR")}` : "";
                    return `<tr>
                      <td>${r.reservationTime}</td>
                      <td><strong>${r.guestName}</strong>${r.notes ? `<br><small style="color:#888">${r.notes}</small>` : ""}</td>
                      <td style="text-align:center">${r.partySize}</td>
                      <td style="text-align:center">${t ? `Mesa ${t.tableNumber}` : "—"}</td>
                      <td>${r.guestPhone || "—"}</td>
                      <td style="text-align:center"><span style="background:${r.status==="confirmed"?"#dbeafe":r.status==="check_in"?"#d1fae5":r.status==="pending"?"#fef9c3":"#f3f4f6"};padding:2px 8px;border-radius:12px;font-size:11px">${statusLabel}</span></td>
                      <td style="text-align:center">${adv}</td>
                    </tr>`;
                  }).join("");
                  const w = window.open("", "_blank", "width=900,height=750");
                  if (w) {
                    w.document.write(`<!DOCTYPE html><html><head><title>Reservas ${date}</title>
                    <style>
                      body{font-family:Arial,sans-serif;padding:30px;color:#111;font-size:13px}
                      h1{font-size:20px;margin:0 0 4px}p.sub{color:#666;font-size:13px;margin:0 0 20px}
                      table{width:100%;border-collapse:collapse}
                      th{background:#1e3a5f;color:#fff;padding:8px 10px;text-align:left;font-size:12px}
                      td{padding:7px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top}
                      tr:nth-child(even){background:#f9fafb}
                      @media print{button{display:none}}
                      .footer{margin-top:20px;font-size:11px;color:#999;text-align:right}
                    </style></head><body>
                    <h1>📋 Lista de Reservas — Maran Suites & Towers</h1>
                    <p class="sub">${dateStr} &nbsp;·&nbsp; ${dayReservations.length} reservas</p>
                    <table>
                      <thead><tr><th>Hora</th><th>Huésped / Notas</th><th style="text-align:center">Pers.</th><th style="text-align:center">Mesa</th><th>Teléfono</th><th style="text-align:center">Estado</th><th style="text-align:center">Seña</th></tr></thead>
                      <tbody>${rows || "<tr><td colspan='7' style='text-align:center;padding:20px;color:#999'>Sin reservas para este día</td></tr>"}</tbody>
                    </table>
                    <div class="footer">Generado: ${new Date().toLocaleString("es-AR")}</div>
                    </body></html>`);
                    w.document.close();
                    w.print();
                  }
                }}
                data-testid="button-print-reservations-styled"
              >
                <Printer className="h-4 w-4 mr-1" />
                Hoja del día
              </Button>
              <Button variant="outline" size="icon" onClick={() => setIsTimeSlotsDialogOpen(true)} data-testid="button-config-time-slots" title="Configurar turnos">
                <Settings className="h-4 w-4" />
              </Button>
              <Button onClick={() => {
                reservationForm.reset({
                  tableId: null, areaId: null, guestName: "", guestPhone: "", guestEmail: "", partySize: 2,
                  reservationDate: reservationDateFilter,
                  reservationTime: timeSlots.find(s => s.isActive === "true")?.time || "20:00",
                  notes: "", clientId: null, cardLast4: null, cardHolder: null,
                });
                setIsReservationDialogOpen(true);
              }} data-testid="button-new-reservation">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Reserva
              </Button>
            </div>
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="date"
              value={reservationDateFilter}
              onChange={(e) => { setReservationDateFilter(e.target.value); setReservationViewMode("day"); }}
              className="w-40"
              data-testid="input-reservation-date-filter"
            />
            <Button
              variant={reservationViewMode === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setReservationViewMode(reservationViewMode === "all" ? "day" : "all")}
              data-testid="button-view-all"
            >
              Todas
            </Button>
            <Select value={reservationStatusFilter} onValueChange={setReservationStatusFilter}>
              <SelectTrigger className="w-44" data-testid="select-status-filter">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="confirmed">Confirmada</SelectItem>
                <SelectItem value="check_in">Check-in</SelectItem>
                <SelectItem value="no_show">No se presentó</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
                <SelectItem value="historical">Histórica</SelectItem>
              </SelectContent>
            </Select>
            {areas.filter(a => a.isActive === "true").length > 1 && (
              <Select value={reservationAreaFilter} onValueChange={setReservationAreaFilter}>
                <SelectTrigger className="w-44" data-testid="select-area-filter">
                  <SelectValue placeholder="Salón" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los salones</SelectItem>
                  {areas.filter(a => a.isActive === "true").map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nombre o teléfono..."
                value={reservationSearch}
                onChange={(e) => setReservationSearch(e.target.value)}
                className="pl-8 w-44"
                data-testid="input-reservation-search"
              />
            </div>
          </div>

          {/* Stats badges for the selected day */}
          {reservationViewMode === "day" && (
            <div className="flex items-center gap-2 flex-wrap text-sm">
              {Object.entries(dayStats).map(([status, count]) => count > 0 && (
                <span key={status} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${reservationStatusColors[status]}`}>
                  {reservationStatusLabels[status] || status}: {count}
                </span>
              ))}
              {Object.keys(dayStats).length === 0 && (
                <span className="text-muted-foreground text-xs">Sin reservas para esta fecha</span>
              )}
            </div>
          )}

          {/* Compact list */}
          {filteredReservations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <CalendarDays className="h-10 w-10 text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">Sin reservas</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {reservationViewMode === "day" ? `No hay reservas para ${reservationDateFilter === todayForFilter ? "hoy" : reservationDateFilter}` : "No hay reservas que coincidan con los filtros"}
                </p>
                <Button size="sm" onClick={() => setIsReservationDialogOpen(true)} data-testid="button-add-first-reservation">
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Reserva
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Hora</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="w-28">Teléfono</TableHead>
                      <TableHead className="w-12 text-center">Pax</TableHead>
                      <TableHead className="w-20">Mesa</TableHead>
                      {areas.length > 1 && <TableHead className="w-24">Salón</TableHead>}
                      {reservationViewMode === "all" && <TableHead className="w-24">Fecha</TableHead>}
                      <TableHead className="w-24">Estado</TableHead>
                      <TableHead className="w-24">Seña</TableHead>
                      <TableHead className="w-40 text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReservations.map((reservation) => {
                      const tbl = tables.find(t => t.id === reservation.tableId);
                      const advanceAmt = parseFloat(reservation.advanceAmount || "0");
                      const isActive = !["cancelled", "no_show", "historical", "completed"].includes(reservation.status);
                      return (
                        <TableRow key={reservation.id} data-testid={`reservation-row-${reservation.id}`}
                          className={!isActive ? "opacity-60" : ""}>
                          <TableCell className="font-mono text-sm font-medium">{reservation.reservationTime}</TableCell>
                          <TableCell>
                            <div className="font-medium">{reservation.guestName}</div>
                            {reservation.notes && (
                              <div className="text-xs text-muted-foreground truncate max-w-[160px]" title={reservation.notes}>
                                {reservation.notes}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{reservation.guestPhone || "—"}</TableCell>
                          <TableCell className="text-center text-sm">{reservation.partySize}</TableCell>
                          <TableCell>
                            {tbl ? (
                              <span className="text-sm">Mesa {tbl.tableNumber}</span>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-muted-foreground"
                                onClick={() => { setAssignTableReservation(reservation); setIsAssignTableDialogOpen(true); }}
                                data-testid={`button-assign-table-${reservation.id}`}
                              >
                                <MapPin className="h-3 w-3 mr-1" />
                                Asignar
                              </Button>
                            )}
                          </TableCell>
                          {areas.length > 1 && (() => {
                            const resAreaId = (reservation as any).areaId;
                            const areaId = resAreaId || tbl?.areaId;
                            const area = areas.find(a => a.id === areaId);
                            return (
                              <TableCell className="text-xs text-muted-foreground">{area?.name || "—"}</TableCell>
                            );
                          })()}
                          {reservationViewMode === "all" && (
                            <TableCell className="text-xs text-muted-foreground">
                              {(() => { const [y,m,d] = reservation.reservationDate.split("-").map(Number); return format(new Date(y,m-1,d), "dd/MM/yy", { locale: es }); })()}
                            </TableCell>
                          )}
                          <TableCell>
                            <Badge className={`text-xs ${reservationStatusColors[reservation.status]}`}>
                              {reservationStatusLabels[reservation.status] || reservation.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {advanceAmt > 0 ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-300 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors cursor-pointer"
                                onClick={() => { setAdvanceDialogReservationId(reservation.id); setIsAdvanceDialogOpen(true); }}
                                data-testid={`button-view-advance-${reservation.id}`}
                                title="Ver detalle de seña"
                              >
                                <CreditCard className="h-3 w-3" />
                                ${advanceAmt.toLocaleString("es-AR")}
                              </button>
                            ) : (isActive && reservation.status !== "check_in") ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground border border-dashed border-muted-foreground/40 hover:border-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                onClick={() => { setAdvanceDialogReservationId(reservation.id); setIsAdvanceDialogOpen(true); }}
                                data-testid={`button-add-advance-${reservation.id}`}
                                title="Registrar seña"
                              >
                                <Plus className="h-3 w-3" />
                                Seña
                              </button>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {reservation.status === "pending" && (
                                <Button size="sm" className="h-7 px-2 text-xs"
                                  onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "confirmed" } })}
                                  data-testid={`button-confirm-${reservation.id}`}>
                                  <Check className="h-3 w-3 mr-1" />Confirmar
                                </Button>
                              )}
                              {reservation.status === "confirmed" && (
                                <Button size="sm" variant="default" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                                  onClick={() => handleCheckIn(reservation)}
                                  data-testid={`button-checkin-${reservation.id}`}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" />Check-in
                                </Button>
                              )}
                              {reservation.status === "check_in" && (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                                  onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "historical" } })}
                                  data-testid={`button-complete-${reservation.id}`}>
                                  <CheckCircle className="h-3 w-3 mr-1" />Completar
                                </Button>
                              )}
                              {isActive && (
                                <>
                                  <Button size="icon" variant="ghost" className="h-7 w-7"
                                    onClick={() => {
                                      const res = { ...(reservation as any) };
                                      if (!res.areaId && res.tableId) {
                                        const tbl = tables.find(t => t.id === res.tableId);
                                        if (tbl?.areaId) res.areaId = tbl.areaId;
                                      }
                                      setEditingReservation(res);
                                      setIsEditReservationOpen(true);
                                    }}
                                    data-testid={`button-edit-${reservation.id}`}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  {reservation.status !== "check_in" && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-orange-500"
                                      onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "no_show" } })}
                                      data-testid={`button-noshow-${reservation.id}`}
                                      title="No se presentó">
                                      <XCircle className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                                    onClick={() => setConfirmCancelReservationId(reservation.id)}
                                    data-testid={`button-cancel-${reservation.id}`}
                                    title="Cancelar reserva">
                                    <X className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                              {(reservation.status === "no_show" || reservation.status === "cancelled") && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                                  onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "pending" } })}
                                  data-testid={`button-reopen-${reservation.id}`}
                                  title="Reabrir como pendiente">
                                  <RotateCcw className="h-3 w-3 mr-1" />Reabrir
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ==================== NOTAS DE CRÉDITO TAB ==================== */}
        <TabsContent value="notas_credito" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileX className="h-5 w-5" />
                Notas de Crédito
              </CardTitle>
              <p className="text-sm text-muted-foreground">Emitir notas de crédito sobre facturas A o B ya cerradas.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">Desde:</Label>
                  <Input type="date" value={ncDateFrom} onChange={e => setNcDateFrom(e.target.value)} className="w-36 h-8" data-testid="input-nc-date-from" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">Hasta:</Label>
                  <Input type="date" value={ncDateTo} onChange={e => setNcDateTo(e.target.value)} className="w-36 h-8" data-testid="input-nc-date-to" />
                </div>
                <Button size="sm" variant="outline" onClick={() => refetchInvoices()} data-testid="button-nc-refresh">
                  <Search className="h-3.5 w-3.5 mr-1" />Buscar
                </Button>
              </div>

              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (() => {
                const facturas = billingInvoices.filter((inv: any) => ["FA", "FB", "FC"].includes(inv.tipo_comprobante));
                if (!facturas.length) return <p className="text-center text-muted-foreground py-8">No hay facturas en el período seleccionado.</p>;
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nro.</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {facturas.map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-sm">{inv.numero_completo || `${inv.tipo_comprobante}-${String(inv.numero).padStart(8,"0")}`}</TableCell>
                          <TableCell><Badge variant="outline">{inv.tipo_comprobante}</Badge></TableCell>
                          <TableCell className="text-sm">{inv.fecha_emision ? format(new Date(inv.fecha_emision), "dd/MM/yyyy") : "-"}</TableCell>
                          <TableCell className="text-sm max-w-[160px] truncate">{inv.cliente_razon_social || "Consumidor Final"}</TableCell>
                          <TableCell className="text-right font-semibold">${parseFloat(inv.total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell>
                            {inv.estado === "anulada"
                              ? <Badge variant="destructive">Anulada</Badge>
                              : <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-300">Activa</Badge>
                            }
                          </TableCell>
                          <TableCell>
                            {inv.estado !== "anulada" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                                onClick={() => { setInvoiceForNC(inv); setNcMotivo(""); }}
                                data-testid={`button-emitir-nc-${inv.id}`}
                              >
                                <FileX className="h-3.5 w-3.5 mr-1" />Emitir NC
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== CLIENTES TAB ==================== */}
        <TabsContent value="clientes" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Clientes del Restaurant
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nombre, doc, email..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="pl-8 w-64"
                      data-testid="input-client-search"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setClientEditingId(null);
                      setClientForm({ tipoPersona: "fisica", firstName: "", lastName: "", email: "", phone: "", documentType: "dni", documentNumber: "", cuilCuit: "", vatCondition: "consumidor_final", direccion: "", provincia: "", localidad: "", condicionVentaPredeterminada: "contado" });
                      setClientDialogOpen(true);
                    }}
                    data-testid="button-new-client"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Nuevo Cliente
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const q = clientSearch.toLowerCase();
                const filtered = restaurantGuests.filter(g =>
                  !q ||
                  `${g.firstName} ${g.lastName}`.toLowerCase().includes(q) ||
                  (g.email || "").toLowerCase().includes(q) ||
                  (g.documentNumber || "").includes(q) ||
                  (g.cuilCuit || "").includes(q) ||
                  (g.phone || "").includes(q)
                );
                if (!filtered.length) return (
                  <div className="text-center py-12 text-muted-foreground">
                    {clientSearch ? "Sin resultados para la búsqueda." : "No hay clientes registrados. Cree el primero."}
                  </div>
                );
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Documento</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Cond. Venta</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(g => (
                        <TableRow key={g.id} data-testid={`row-client-${g.id}`}>
                          <TableCell className="font-medium">{g.firstName} {g.lastName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {g.tipoPersona === "juridica" ? "Jurídica" : "Física"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {g.documentType === "cuit" || g.tipoPersona === "juridica"
                              ? (g.cuilCuit ? formatCuit(g.cuilCuit) : "—")
                              : (g.documentNumber || "—")}
                          </TableCell>
                          <TableCell className="text-sm">{g.phone || "—"}</TableCell>
                          <TableCell className="text-sm">{g.email || "—"}</TableCell>
                          <TableCell>
                            {g.condicionVentaPredeterminada
                              ? { contado: "Contado", cuenta_corriente: "Cta Cte", "30_dias": "30 días", "60_dias": "60 días", "90_dias": "90 días" }[g.condicionVentaPredeterminada] ?? g.condicionVentaPredeterminada
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setClientEditingId(g.id);
                                setClientForm({
                                  tipoPersona: (g.tipoPersona as any) || "fisica",
                                  firstName: g.firstName,
                                  lastName: g.lastName === "-" ? "" : (g.lastName || ""),
                                  email: g.email || "",
                                  phone: g.phone || "",
                                  documentType: g.documentType || "dni",
                                  documentNumber: g.documentNumber || "",
                                  cuilCuit: g.cuilCuit ? formatCuit(g.cuilCuit) : "",
                                  vatCondition: (g as any).vatCondition || ((g.tipoPersona as any) === "juridica" ? "responsable_inscripto" : "consumidor_final"),
                                  direccion: g.direccion || "",
                                  provincia: (g as any).provincia || "",
                                  localidad: g.localidad || "",
                                  condicionVentaPredeterminada: g.condicionVentaPredeterminada || "contado",
                                });
                                setClientDialogOpen(true);
                              }}
                              data-testid={`button-edit-client-${g.id}`}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ==================== DIALOGS ==================== */}

      {/* Clientes Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={(o) => { setClientDialogOpen(o); if (!o) { setClientEditingId(null); setClientCreatedForReservation(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{clientEditingId ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            {/* Tipo de Persona */}
            <div className="flex rounded-md overflow-hidden border">
              <button type="button"
                className={`flex-1 py-2 text-sm font-medium transition-colors ${clientForm.tipoPersona === "fisica" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                onClick={() => setClientForm({ ...clientForm, tipoPersona: "fisica", vatCondition: "consumidor_final" })}
                data-testid="button-client-fisica">Persona Física</button>
              <button type="button"
                className={`flex-1 py-2 text-sm font-medium transition-colors border-l ${clientForm.tipoPersona === "juridica" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                onClick={() => setClientForm({ ...clientForm, tipoPersona: "juridica", vatCondition: "responsable_inscripto" })}
                data-testid="button-client-juridica">Persona Jurídica</button>
            </div>

            {/* Nombre / Razón Social */}
            {clientForm.tipoPersona === "juridica" ? (<>
              <div className="space-y-2">
                <Label>Razón Social <span className="text-red-500">*</span></Label>
                <Input value={clientForm.firstName} onChange={(e) => setClientForm({ ...clientForm, firstName: e.target.value })} placeholder="Empresa S.A." data-testid="input-client-razon-social" />
              </div>
              <div className="space-y-2">
                <Label>Nombre Comercial <span className="text-xs text-muted-foreground">(cómo se conoce al negocio)</span></Label>
                <Input value={clientForm.lastName} onChange={(e) => setClientForm({ ...clientForm, lastName: e.target.value })} placeholder="Acme Corp" data-testid="input-client-nombre-comercial" />
              </div>
            </>) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre <span className="text-red-500">*</span></Label>
                  <Input value={clientForm.firstName} onChange={(e) => setClientForm({ ...clientForm, firstName: e.target.value })} placeholder="Juan" data-testid="input-client-first-name" />
                </div>
                <div className="space-y-2">
                  <Label>Apellido <span className="text-red-500">*</span></Label>
                  <Input value={clientForm.lastName} onChange={(e) => setClientForm({ ...clientForm, lastName: e.target.value })} placeholder="Pérez" data-testid="input-client-last-name" />
                </div>
              </div>
            )}

            {/* Teléfono + Email */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} placeholder="+54 9 11 1234-5678" data-testid="input-client-phone" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} placeholder="email@ejemplo.com" data-testid="input-client-email" />
              </div>
            </div>

            {/* Documento — solo Física */}
            {clientForm.tipoPersona === "fisica" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo Doc.</Label>
                  <Select value={clientForm.documentType} onValueChange={(v) => setClientForm({ ...clientForm, documentType: v })}>
                    <SelectTrigger data-testid="select-client-doc-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dni">DNI</SelectItem>
                      <SelectItem value="passport">Pasaporte</SelectItem>
                      <SelectItem value="cedula">Cédula</SelectItem>
                      <SelectItem value="other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nro. Documento</Label>
                  <Input value={clientForm.documentNumber} onChange={(e) => setClientForm({ ...clientForm, documentNumber: e.target.value })} placeholder="12345678" data-testid="input-client-doc-number" />
                </div>
              </div>
            )}

            {/* CUIT/CUIL + Condición IVA */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{clientForm.tipoPersona === "juridica" ? "CUIT *" : "CUIL / CUIT"}</Label>
                <Input
                  value={clientForm.cuilCuit}
                  onChange={(e) => setClientForm({ ...clientForm, cuilCuit: formatCuit(e.target.value) })}
                  placeholder={clientForm.tipoPersona === "juridica" ? "30-12345678-9" : "20-12345678-9"}
                  maxLength={13}
                  data-testid="input-client-cuit"
                />
              </div>
              <div className="space-y-2">
                <Label>Condición ante IVA <span className="text-red-500">*</span></Label>
                <Select value={clientForm.vatCondition} onValueChange={(v) => setClientForm({ ...clientForm, vatCondition: v })}>
                  <SelectTrigger data-testid="select-client-vat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(VAT_CONDITION_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Domicilio fiscal */}
            <div className="pt-1 border-t">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Domicilio</p>
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input value={clientForm.direccion} onChange={(e) => setClientForm({ ...clientForm, direccion: e.target.value })} placeholder="Av. Ejemplo 123" data-testid="input-client-direccion" />
            </div>
            <ProvinciaCiudadSelect
              provincia={clientForm.provincia}
              localidad={clientForm.localidad}
              onProvinciaChange={(v) => setClientForm({ ...clientForm, provincia: v, localidad: "" })}
              onLocalidadChange={(v) => setClientForm({ ...clientForm, localidad: v })}
              testIdProvincia="select-client-provincia"
              testIdLocalidad="select-client-localidad"
            />

            {/* Condición de Venta */}
            <div className="pt-1 border-t">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Comercial</p>
            </div>
            <div className="space-y-2">
              <Label>Condición de Venta</Label>
              <Select value={clientForm.condicionVentaPredeterminada} onValueChange={(v) => setClientForm({ ...clientForm, condicionVentaPredeterminada: v })}>
                <SelectTrigger data-testid="select-client-condicion-venta"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contado">Contado</SelectItem>
                  <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                  <SelectItem value="30_dias">30 días</SelectItem>
                  <SelectItem value="60_dias">60 días</SelectItem>
                  <SelectItem value="90_dias">90 días</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientDialogOpen(false)} data-testid="button-client-cancel">Cancelar</Button>
            <Button
              disabled={!clientForm.firstName || (clientForm.tipoPersona === "fisica" && !clientForm.lastName) || clientCreateMutation.isPending || clientUpdateMutation.isPending}
              onClick={() => {
                const payload = {
                  tipoPersona: clientForm.tipoPersona,
                  firstName: clientForm.firstName,
                  lastName: clientForm.tipoPersona === "juridica" ? (clientForm.lastName || "-") : clientForm.lastName,
                  email: clientForm.email || null,
                  phone: clientForm.phone || null,
                  documentType: clientForm.tipoPersona === "juridica" ? "cuit" : clientForm.documentType,
                  documentNumber: clientForm.tipoPersona === "juridica" ? (clientForm.cuilCuit.replace(/[-]/g, "") || null) : (clientForm.documentNumber || null),
                  cuilCuit: clientForm.cuilCuit.replace(/[-]/g, "") || null,
                  vatCondition: clientForm.vatCondition || null,
                  direccion: clientForm.direccion || null,
                  provincia: clientForm.provincia || null,
                  localidad: clientForm.localidad || null,
                  condicionVentaPredeterminada: clientForm.condicionVentaPredeterminada,
                };
                if (clientEditingId) {
                  clientUpdateMutation.mutate({ id: clientEditingId, data: payload });
                } else {
                  clientCreateMutation.mutate(payload);
                }
              }}
              data-testid="button-client-save"
            >
              {(clientCreateMutation.isPending || clientUpdateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {clientEditingId ? "Guardar Cambios" : "Crear Cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Order Dialog (table-based) */}
      <Dialog open={isNewOrderDialogOpen} onOpenChange={(open) => { if (open) setIsNewOrderDialogOpen(true); }}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nuevo Pedido — Mesa {selectedTable?.tableNumber}</DialogTitle>
            <DialogDescription>Al crear el pedido se abre la mesa y se habilita la carga de comandas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="waiter-name">Mozo *</Label>
              <Select value={newWaiterName} onValueChange={setNewWaiterName}>
                <SelectTrigger id="waiter-name" data-testid="select-waiter-name">
                  <SelectValue placeholder="Seleccionar mozo..." />
                </SelectTrigger>
                <SelectContent>
                  {restaurantUsers.map(u => (
                    <SelectItem key={u.id} value={u.fullName}>
                      {u.fullName} <span className="text-muted-foreground text-xs ml-1">(@{u.username})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="covers">Cantidad de comensales</Label>
              <Input
                id="covers"
                type="number"
                min={1}
                value={newCovers}
                onChange={(e) => setNewCovers(parseInt(e.target.value) || 1)}
                data-testid="input-covers"
              />
              <p className="text-xs text-muted-foreground">Capacidad de la mesa: {selectedTable?.capacity}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewOrderDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (selectedTable && newWaiterName.trim()) {
                  createOrderMutation.mutate({ tableId: selectedTable.id, covers: newCovers, waiterName: newWaiterName.trim() });
                } else {
                  toast({ title: "Mozo requerido", description: "Ingrese el nombre del mozo", variant: "destructive" });
                }
              }}
              disabled={createOrderMutation.isPending}
              data-testid="button-create-order"
            >
              {createOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Direct Order Dialog (tableless areas) */}
      <Dialog open={isDirectOrderDialogOpen} onOpenChange={(open) => { if (open) setIsDirectOrderDialogOpen(true); }}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nueva Orden — {areas.find(a => a.id === directOrderAreaId)?.name}</DialogTitle>
            <DialogDescription>Al crear la orden se habilita la carga de comandas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="order-label">Etiqueta de orden *</Label>
              <Input
                id="order-label"
                value={newOrderLabel}
                onChange={(e) => setNewOrderLabel(e.target.value)}
                placeholder="Ej: Hab. 305, Mesa Solarium 2"
                data-testid="input-order-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="direct-waiter">Mozo *</Label>
              <Select value={newWaiterName} onValueChange={setNewWaiterName}>
                <SelectTrigger id="direct-waiter" data-testid="select-direct-waiter">
                  <SelectValue placeholder="Seleccionar mozo..." />
                </SelectTrigger>
                <SelectContent>
                  {restaurantUsers.map(u => (
                    <SelectItem key={u.id} value={u.fullName}>
                      {u.fullName} <span className="text-muted-foreground text-xs ml-1">(@{u.username})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="direct-covers">Comensales (opcional)</Label>
              <Input
                id="direct-covers"
                type="number"
                min={1}
                value={newCovers}
                onChange={(e) => setNewCovers(parseInt(e.target.value) || 1)}
                data-testid="input-direct-covers"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDirectOrderDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (newOrderLabel.trim() && newWaiterName.trim()) {
                  createOrderMutation.mutate({
                    areaId: directOrderAreaId,
                    covers: newCovers,
                    waiterName: newWaiterName.trim(),
                    orderLabel: newOrderLabel.trim(),
                  });
                } else {
                  toast({ title: "Campos requeridos", description: "Ingrese etiqueta y mozo", variant: "destructive" });
                }
              }}
              disabled={createOrderMutation.isPending}
              data-testid="button-create-direct-order"
            >
              {createOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Orden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Dialog (menu/folio/delete views) */}
      <Dialog open={isOrderDialogOpen} onOpenChange={(open) => {
        setIsOrderDialogOpen(open);
        if (!open) {
          setPendingItem(null);
          setItemNotes("");
          setSelectedCategory(null);
          setCloseReceiptType("cierre_mesa");
          setClosePaymentMethod("efectivo");
          setCloseDiscount("");
          setCloseDiscountType("percent");
          setCloseRoomId("");
          setRoomSearchFilter("");
          setCloseBillingName("");
          setCloseBillingCuit("");
          setCloseBillingCompanyId("");
          setCloseCcEntityType("company");
          setCloseCcEntityId("");
          setBillingSearch("");
          setFbIsExento(false);
          setIsSplitMode(false);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle>
                  {getUpdatedOrder()?.orderLabel || getUpdatedOrder()?.orderNumber} - {getUpdatedOrder()?.tableId ? `Mesa ${getUpdatedOrder()?.table?.tableNumber || selectedTable?.tableNumber}` : (areas.find(a => a.id === getUpdatedOrder()?.areaId)?.name || "")}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
                  <span>Mozo: {getUpdatedOrder()?.waiterName || "—"}</span>
                  <span>|</span>
                  <span>Abierto: {currentOrder ? new Date(currentOrder.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  <span>|</span>
                  {editingCovers ? (
                    <span className="flex items-center gap-1">
                      <button className="h-5 w-5 rounded border text-xs flex items-center justify-center hover:bg-muted" onClick={() => setCoversInput(c => Math.max(1, c - 1))}>−</button>
                      <span className="min-w-[2ch] text-center font-medium text-foreground">{coversInput}</span>
                      <button className="h-5 w-5 rounded border text-xs flex items-center justify-center hover:bg-muted" onClick={() => setCoversInput(c => c + 1)}>+</button>
                      <button className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { if (currentOrder) updateCoversMutation.mutate({ orderId: currentOrder.id, covers: coversInput }); }}>OK</button>
                      <button className="text-[10px] px-1 py-0.5 rounded hover:bg-muted" onClick={() => setEditingCovers(false)}>✕</button>
                    </span>
                  ) : (
                    <button
                      className="flex items-center gap-0.5 hover:text-foreground transition-colors group"
                      onClick={() => { setCoversInput(getUpdatedOrder()?.covers || 1); setEditingCovers(true); }}
                      data-testid="button-edit-covers"
                    >
                      <span>{getUpdatedOrder()?.covers} comensal{(getUpdatedOrder()?.covers || 1) !== 1 ? "es" : ""}</span>
                      <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 ml-0.5" />
                    </button>
                  )}
                  {(getUpdatedOrder()?.activeCourse || 1) > 1 && <><span>|</span><span>Curso: {courseLabels[getUpdatedOrder()?.activeCourse || 1] || `Curso ${getUpdatedOrder()?.activeCourse}`}</span></>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {getUpdatedOrder() && (getUpdatedOrder()?.activeCourse || 1) < 3 && getOrderItems().some(i => i.course && i.course > (getUpdatedOrder()?.activeCourse || 1)) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (currentOrder) advanceCourseMutation.mutate(currentOrder.id);
                    }}
                    disabled={advanceCourseMutation.isPending}
                    data-testid="button-advance-course"
                  >
                    {advanceCourseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChefHat className="h-4 w-4 mr-1" />}
                    Sale — {courseShortLabels[(getUpdatedOrder()?.activeCourse || 1) + 1] || "Siguiente"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOrderView("comanda")}
                  className={orderView === "comanda" ? "bg-muted" : ""}
                  data-testid="button-view-comanda"
                >
                  <ClipboardList className="h-4 w-4 mr-1" />
                  Comanda
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOrderView("folio")}
                  className={orderView === "folio" ? "bg-muted" : ""}
                  data-testid="button-view-folio"
                >
                  <CircleDollarSign className="h-4 w-4 mr-1" />
                  Folio
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => { setCancelledOrderSnapshot({ order: getUpdatedOrder(), items: getOrderItems() }); setCancelOrderReason(""); setShowCancelOrderDialog(true); }}
                  data-testid="button-cancel-order"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Anular Pedido
                </Button>
              </div>
            </div>
          </DialogHeader>

          {orderView === "folio" && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Resumen de Consumos</h3>
                {!isTransferMode && getOrderItems().length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => { setIsTransferMode(true); setTransferSelectedIds(new Set()); setTransferTargetOrderId(""); setTransferNewWaiter(""); }}
                    data-testid="button-transfer-items"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Transferir ítems
                  </Button>
                )}
                {isTransferMode && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsTransferMode(false)}>
                    Cancelar
                  </Button>
                )}
              </div>

              {isTransferMode && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 text-sm text-orange-800 dark:text-orange-300">
                  Seleccioná los ítems a mover y elegí el destino
                </div>
              )}

              {getOrderItems().length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay items en este pedido</p>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3].map(course => {
                    const courseItems = getOrderItems().filter(i => (i.course || 1) === course);
                    if (courseItems.length === 0) return null;
                    return (
                      <div key={course}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold uppercase text-muted-foreground">{courseLabels[course]}</span>
                          {course === (getUpdatedOrder()?.activeCourse || 1) && (
                            <Badge variant="default" className="text-[10px] h-4">Activo</Badge>
                          )}
                        </div>
                        {courseItems.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-3 border rounded-md mb-1 ${item.status === "waiting_course" ? "opacity-50 border-dashed" : ""} ${isTransferMode && transferSelectedIds.has(item.id) ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : ""} ${isTransferMode ? "cursor-pointer" : ""}`}
                            onClick={isTransferMode ? () => {
                              setTransferSelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                return next;
                              });
                            } : undefined}
                          >
                            <div className="flex items-center gap-2">
                              {isTransferMode && (
                                <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${transferSelectedIds.has(item.id) ? "bg-orange-500 border-orange-500" : "border-muted-foreground"}`}>
                                  {transferSelectedIds.has(item.id) && <Check className="h-2.5 w-2.5 text-white" />}
                                </div>
                              )}
                              <span className="font-medium">
                                {item.notes?.startsWith("[") ? item.notes.match(/^\[(.+?)\]/)?.[1] || item.menuItem?.name || "Item" : item.menuItem?.name || "Item"}
                              </span>
                              <span className="text-muted-foreground">x{item.quantity}</span>
                              {item.notes && !item.notes.startsWith("[") && <span className="text-xs text-muted-foreground italic">({item.notes})</span>}
                              {item.notes?.startsWith("[") && item.notes.replace(/^\[.+?\]\s*/, "") && (
                                <span className="text-xs text-muted-foreground italic">({item.notes.replace(/^\[.+?\]\s*/, "")})</span>
                              )}
                              {item.status === "waiting_course" && <Badge variant="outline" className="text-[10px]">Esperando</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">
                                ${parseFloat(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </span>
                              {!isTransferMode && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => { if (currentOrder) deleteItemMutation.mutate({ orderId: currentOrder.id, itemId: item.id }); }}
                                  data-testid={`button-void-item-${item.id}`}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  <div className="pt-4 border-t flex items-center justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span>
                      ${parseFloat(getUpdatedOrder()?.total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {isTransferMode && (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <p className="text-sm font-medium">Destino ({transferSelectedIds.size} ítem{transferSelectedIds.size !== 1 ? "s" : ""} seleccionado{transferSelectedIds.size !== 1 ? "s" : ""})</p>
                  <select
                    className="w-full h-9 text-sm border rounded-md px-2 bg-background"
                    value={transferTargetOrderId}
                    onChange={e => setTransferTargetOrderId(e.target.value)}
                    data-testid="select-transfer-target"
                  >
                    <option value="">— Elegí el destino —</option>
                    <option value="new">✦ Nuevo ticket (ticket separado)</option>
                    {orders.filter(o => o.id !== currentOrder?.id && o.status === "open").map(o => (
                      <option key={o.id} value={o.id}>
                        {o.tableId
                          ? `Mesa ${(o as any).table?.tableNumber || o.tableId}`
                          : o.orderLabel || o.orderNumber} — #{o.orderNumber}
                      </option>
                    ))}
                  </select>
                  {transferTargetOrderId === "new" && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Mozo del nuevo ticket *</label>
                      <Select value={transferNewWaiter} onValueChange={setTransferNewWaiter}>
                        <SelectTrigger className="h-8 text-sm" data-testid="select-transfer-new-waiter">
                          <SelectValue placeholder="Seleccionar mozo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {restaurantUsers.map(u => (
                            <SelectItem key={u.id} value={u.fullName}>
                              {u.fullName} <span className="text-muted-foreground text-xs ml-1">(@{u.username})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    disabled={
                      transferSelectedIds.size === 0 ||
                      !transferTargetOrderId ||
                      (transferTargetOrderId === "new" && !transferNewWaiter.trim()) ||
                      transferItemsMutation.isPending
                    }
                    onClick={() => {
                      if (!currentOrder) return;
                      transferItemsMutation.mutate({
                        orderId: currentOrder.id,
                        itemIds: Array.from(transferSelectedIds),
                        targetOrderId: transferTargetOrderId,
                        newOrderData: transferTargetOrderId === "new" ? {
                          waiterName: transferNewWaiter.trim(),
                          areaId: currentOrder.areaId,
                          orderLabel: `Ticket separado`,
                          covers: 1,
                        } : undefined,
                      });
                    }}
                    data-testid="button-confirm-transfer"
                  >
                    {transferItemsMutation.isPending ? "Transfiriendo..." : "Confirmar transferencia"}
                  </Button>
                </div>
              )}

              {!isTransferMode && (
                <Button
                  variant="outline"
                  onClick={() => setOrderView("menu")}
                  className="w-full"
                  data-testid="button-back-to-menu"
                >
                  Volver al Menu
                </Button>
              )}
            </div>
          )}

          {orderView === "comanda" && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <h3 className="font-semibold text-lg">Comanda</h3>
              {getOrderItems().length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay items en este pedido</p>
              ) : (
                <div className="space-y-3">
                  {[1, 2, 3].map(course => {
                    const courseItems = getOrderItems().filter(i => (i.course || 1) === course);
                    if (courseItems.length === 0) return null;
                    return (
                      <div key={course}>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={course <= (getUpdatedOrder()?.activeCourse || 1) ? "default" : "secondary"} className="text-xs">
                            {courseLabels[course]}
                          </Badge>
                          {course === (getUpdatedOrder()?.activeCourse || 1) && (
                            <span className="text-xs text-green-600 font-medium">En cocina</span>
                          )}
                          {course < (getUpdatedOrder()?.activeCourse || 1) && (
                            <span className="text-xs text-muted-foreground">Servido</span>
                          )}
                          {course > (getUpdatedOrder()?.activeCourse || 1) && (
                            <span className="text-xs text-orange-500">Pendiente</span>
                          )}
                        </div>
                        {courseItems.map((item) => (
                          <div key={item.id} className={`flex items-center justify-between p-2 border rounded mb-1 ${item.status === "waiting_course" ? "opacity-50 border-dashed bg-muted/30" : "bg-background"}`}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {item.notes?.startsWith("[") ? item.notes.match(/^\[(.+?)\]/)?.[1] || item.menuItem?.name || "Item" : item.menuItem?.name || "Item"}
                              </span>
                              <Badge variant="outline" className="text-xs">x{item.quantity}</Badge>
                              {item.notes && !item.notes.startsWith("[") && <span className="text-xs text-muted-foreground italic">({item.notes})</span>}
                              {item.notes?.startsWith("[") && item.notes.replace(/^\[.+?\]\s*/, "") && (
                                <span className="text-xs text-muted-foreground italic">({item.notes.replace(/^\[.+?\]\s*/, "")})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {item.status === "waiting_course" && currentOrder && (
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3].filter(c => c !== item.course).map(c => (
                                    <Button
                                      key={c}
                                      size="sm"
                                      variant="outline"
                                      className="h-5 px-1 text-[10px]"
                                      onClick={() => updateItemCourseMutation.mutate({ orderId: currentOrder.id, itemId: item.id, course: c })}
                                      data-testid={`button-course-${item.id}-${c}`}
                                    >
                                      {c === 1 ? "1°" : c === 2 ? "2°" : "3°"}
                                    </Button>
                                  ))}
                                </div>
                              )}
                              <span className="text-sm font-semibold">${parseFloat(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { if (currentOrder) { setItemVoidReason(""); setItemToVoid({ orderId: currentOrder.id, item }); } }} data-testid={`button-comanda-void-${item.id}`}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t">
                <span className="font-semibold">Total:</span>
                <span className="font-bold text-lg">${parseFloat(getUpdatedOrder()?.total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}

          {orderView === "review" && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">Confirmar Comanda</h3>
              </div>
              {getOrderItems().length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay items en este pedido</p>
              ) : (
                <div className="space-y-3">
                  {[1, 2, 3].map(course => {
                    const courseItems = getOrderItems().filter(i => (i.course || 1) === course);
                    if (courseItems.length === 0) return null;
                    const nullItems = course === 1 ? getOrderItems().filter(i => i.course === null) : [];
                    const allItems = course === 1 ? [...courseItems, ...nullItems] : courseItems;
                    if (allItems.length === 0) return null;
                    return (
                      <div key={course} className="rounded-lg border overflow-hidden">
                        <div className="bg-muted/60 px-3 py-1.5 flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-semibold">{courseLabels[course]}</Badge>
                        </div>
                        <div className="divide-y">
                          {allItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between px-3 py-2">
                              <div>
                                <span className="font-medium text-sm">
                                  {item.notes?.startsWith("[") ? item.notes.match(/^\[(.+?)\]/)?.[1] || item.menuItem?.name || "Item" : item.menuItem?.name || "Item"}
                                </span>
                                {item.notes && !item.notes.startsWith("[") && (
                                  <span className="text-xs text-muted-foreground ml-1 italic">({item.notes})</span>
                                )}
                                {item.notes?.startsWith("[") && item.notes.replace(/^\[.+?\]\s*/, "") && (
                                  <span className="text-xs text-muted-foreground ml-1 italic">({item.notes.replace(/^\[.+?\]\s*/, "")})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-muted-foreground">x{item.quantity}</span>
                                <span className="text-sm font-medium">${(parseFloat(item.price || "0") * item.quantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between pt-2 border-t text-base font-bold">
                    <span>Total</span>
                    <span>${parseFloat(getUpdatedOrder()?.total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {orderView === "delete" && (
            <div className="flex-1 overflow-y-auto space-y-4">
              <h3 className="font-semibold text-lg">Eliminar Items</h3>
              {getOrderItems().length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No hay items para eliminar</p>
              ) : (
                <div className="space-y-2">
                  {getOrderItems().map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <span className="font-medium">{item.menuItem?.name || "Item"}</span>
                        <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (currentOrder) {
                            deleteItemMutation.mutate({ orderId: currentOrder.id, itemId: item.id });
                          }
                        }}
                        disabled={deleteItemMutation.isPending}
                        data-testid={`button-delete-item-${item.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                onClick={() => setOrderView("menu")}
                className="w-full"
                data-testid="button-back-from-delete"
              >
                Volver al Menu
              </Button>
            </div>
          )}

          {orderView === "menu" && !pendingItem && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Buscador */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={menuSearchRef}
                  value={menuSearch}
                  onChange={(e) => {
                    setMenuSearch(e.target.value);
                    if (e.target.value) setSelectedCategory(null);
                  }}
                  placeholder="Buscar plato o código..."
                  className="pl-9"
                  data-testid="input-menu-search"
                />
                {menuSearch && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setMenuSearch("")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {sortedCategories.map((cat) => (
                  <Button
                    key={cat.id}
                    variant={effectiveCategory === cat.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setSelectedCategory(selectedCategory === cat.id ? null : cat.id); setMenuSearch(""); }}
                    data-testid={`button-category-${cat.id}`}
                  >
                    {cat.name}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const fueraItem = menuItems.find(i => i.id === "mi-fuera-menu");
                    if (fueraItem) {
                      setItemCourse(1);
                      setPendingItem(fueraItem);
                      setMenuSearch("");
                      setSelectedCategory(null);
                      setIsEditableItem(true);
                      setCustomItemName("");
                      setCustomItemPrice("");
                    }
                  }}
                  className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                  data-testid="button-fuera-menu"
                >
                  + Fuera de Menú
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOrderView("delete")}
                  className="text-destructive border-destructive"
                  data-testid="button-delete-mode"
                >
                  <X className="h-4 w-4 mr-1" />
                  Borrar Item
                </Button>
              </div>

              {(() => {
                const selectItem = (item: MenuItem) => {
                  const cat = menuCategories.find(c => c.id === item.categoryId);
                  const isBeverage = cat && inferCourseFromCategory(cat.name) === null && ["bebida", "cerveza", "vino", "espumante", "jugo", "gaseosa"].some(b => cat.name.toLowerCase().includes(b));
                  if (!isBeverage) {
                    const course = item.defaultCourse ?? inferCourseFromCategory(cat?.name || "") ?? 1;
                    setItemCourse(course);
                  }
                  setPendingItem(item);
                  setMenuSearch("");
                  if ((item as any).isEditable === "true") {
                    setIsEditableItem(true);
                    setCustomItemName(item.name);
                    setCustomItemPrice("");
                  } else {
                    setIsEditableItem(false);
                    setCustomItemName("");
                    setCustomItemPrice("");
                  }
                };

                if (menuSearch.trim()) {
                  const visibleItems = menuItems.filter(item =>
                    item.isAvailable !== "false" && (
                      item.name.toLowerCase().includes(menuSearch.toLowerCase()) ||
                      (item.description || "").toLowerCase().includes(menuSearch.toLowerCase())
                    )
                  );
                  if (visibleItems.length === 0) {
                    return <p className="text-center text-muted-foreground py-4 text-sm">Sin resultados para "{menuSearch}"</p>;
                  }
                  return (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {visibleItems.map(item => {
                        const cat = menuCategories.find(c => c.id === item.categoryId);
                        return (
                          <button key={item.id} className="p-3 border rounded-md text-left hover-elevate" onClick={() => selectItem(item)} data-testid={`select-item-${item.id}`}>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{cat?.name}</div>
                            <div className="text-muted-foreground text-sm">${parseFloat(item.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</div>
                          </button>
                        );
                      })}
                    </div>
                  );
                }

                if (effectiveCategory) {
                  return (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {menuItems
                        .filter((item) => item.categoryId === effectiveCategory && item.isAvailable !== "false")
                        .map((item) => (
                          <button
                            key={item.id}
                            className="p-3 border rounded-md text-left hover-elevate flex items-center justify-between"
                            onClick={() => selectItem(item)}
                            data-testid={`select-item-${item.id}`}
                          >
                            <span className="font-medium">{item.name}</span>
                            <span className="text-muted-foreground">
                              ${parseFloat(item.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </span>
                          </button>
                        ))}
                    </div>
                  );
                }

                return (
                  <div className="text-center py-8 text-muted-foreground">
                    Selecciona una categoría o buscá un plato
                  </div>
                );
              })()}
            </div>
          )}

          {orderView === "menu" && pendingItem && (
            <div className="flex-1 space-y-4">
              <div className="p-4 border rounded-md bg-muted/30">
                <h3 className="font-semibold text-lg mb-1">{pendingItem.name}</h3>
                <p className="text-muted-foreground">
                  ${parseFloat(pendingItem.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                {pendingItem.description && (
                  <p className="text-sm text-muted-foreground mt-2">{pendingItem.description}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))} data-testid="button-quantity-minus">
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input type="number" min={1} value={itemQuantity} onChange={(e) => setItemQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="w-16 text-center h-8" data-testid="input-item-quantity" />
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setItemQuantity(itemQuantity + 1)} data-testid="button-quantity-plus">
                    <Plus className="h-4 w-4" />
                  </Button>
                  {itemQuantity > 1 && (
                    <span className="text-sm text-muted-foreground">= ${(parseFloat(pendingItem.price) * itemQuantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  )}
                </div>
              </div>
              {(() => {
                const cat = menuCategories.find(c => c.id === pendingItem.categoryId);
                const inferred = inferCourseFromCategory(cat?.name || "");
                if (inferred !== null) return null;
                const beverageCategories = ["bebidas sin alcohol", "cervezas", "vinos", "espumantes", "vinos de ríos", "bebidas"];
                const isBeverage = cat && beverageCategories.some(bc => cat.name.toLowerCase().includes(bc));
                if (isBeverage) return null;
                return (
                  <div className="space-y-2">
                    <Label>Curso</Label>
                    <div className="flex gap-2">
                      {[1, 2, 3].map(c => (
                        <Button
                          key={c}
                          variant={itemCourse === c ? "default" : "outline"}
                          size="sm"
                          onClick={() => setItemCourse(c)}
                          data-testid={`button-course-${c}`}
                        >
                          {courseLabels[c]}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {isEditableItem && (
                <div className="space-y-2 mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md">
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Fuera de menú — completar descripción y precio</p>
                  <div>
                    <Label className="text-xs">Descripción *</Label>
                    <Input
                      value={customItemName}
                      onChange={(e) => setCustomItemName(e.target.value)}
                      placeholder="Ej: Milanesa napolitana especial"
                      data-testid="input-custom-item-name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Precio <span className="font-normal text-muted-foreground">(con IVA incluido)</span></Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={customItemPrice}
                      onChange={(e) => setCustomItemPrice(e.target.value)}
                      placeholder="0.00"
                      data-testid="input-custom-item-price"
                    />
                  </div>
                </div>
              )}
              <div>
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setShowItemNotes(!showItemNotes)}
                >
                  {showItemNotes ? "Ocultar observaciones" : "+ Agregar observación"}
                </button>
                {showItemNotes && (
                  <Textarea
                    value={itemNotes}
                    onChange={(e) => setItemNotes(e.target.value)}
                    placeholder="Ej: sin sal, término medio, sin gluten..."
                    rows={2}
                    autoFocus
                    className="mt-2"
                    data-testid="input-item-notes"
                  />
                )}
              </div>
              <p className="font-medium">Agregar este item?</p>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={handleConfirmItem}
                  disabled={addItemMutation.isPending}
                  data-testid="button-confirm-item"
                >
                  {addItemMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Si
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleCancelItem}
                  data-testid="button-cancel-item"
                >
                  No
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 border-t pt-4">
            {/* Cerrar sin cobrar — atajo para comandas vacías con total $0 */}
            {orderView !== "delete" && !pendingItem && getOrderItems().length === 0 && parseFloat(getUpdatedOrder()?.total || "0") === 0 && (
              <Button
                variant="destructive"
                size="lg"
                className="w-full sm:w-auto"
                disabled={closeOrderMutation.isPending}
                onClick={() => {
                  if (currentOrder) {
                    closeOrderMutation.mutate({
                      orderId: currentOrder.id,
                      receiptType: "cierre_mesa",
                      paymentMethod: "efectivo",
                    });
                    setIsOrderDialogOpen(false);
                  }
                }}
                data-testid="button-close-empty-order"
              >
                {closeOrderMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-5 w-5 mr-2" />}
                Cerrar esta mesa (sin cobrar)
              </Button>
            )}
            {/* Agregar más — solo en vista comanda con ítems */}
            {orderView === "comanda" && getOrderItems().length > 0 && (
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setOrderView("menu")}
                data-testid="button-comanda-add-more-footer"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar más
              </Button>
            )}
            {/* Agregar más (primera vez) — cuando no hay ítems */}
            {orderView === "comanda" && getOrderItems().length === 0 && (
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setOrderView("menu")}
                data-testid="button-comanda-add-more-empty"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar más
              </Button>
            )}
            {/* Listo / Cerrar — cierra el dialog sin cerrar la mesa */}
            {orderView !== "delete" && !pendingItem && (
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setIsOrderDialogOpen(false)}
                data-testid="button-done"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Listo / Cerrar
              </Button>
            )}
            {/* Cerrar Mesa — visible cuando hay ítems o cuando el total no es cero */}
            {orderView !== "delete" && !pendingItem && (getOrderItems().length > 0 || parseFloat(getUpdatedOrder()?.total || "0") > 0) && (
              <Button
                variant="destructive"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => {
                  const updOrder = orders.find((o: RestaurantOrder) => o.id === currentOrder?.id);
                  const existingSplits = (updOrder as any)?.splits || [];
                  const hasActiveSplits = existingSplits.length > 0 && existingSplits.some((s: any) => s.isPaid !== "true");
                  setIsOrderDialogOpen(false);
                  setClosePaymentMethod("efectivo");
                  setCloseDiscount("");
                  setCloseDiscountType("percent");
                  setCloseRoomId("");
                  setRoomSearchFilter("");
                  const _todayISOc = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
                  const _tableResc = currentOrder ? reservations.find(r => r.tableId === currentOrder.tableId && (r.status === "check_in" || r.status === "seated" || r.status === "confirmed") && r.reservationDate === _todayISOc) : null;
                  const _resClientc = (_tableResc as any)?.clientId ? restaurantGuests.find(g => g.id === (_tableResc as any).clientId) : null;
                  const _needsFacturac = _resClientc && _resClientc.vatCondition && !["consumidor_final", ""].includes(_resClientc.vatCondition || "");
                  setCloseReceiptType(_needsFacturac ? "factura_a" : "cierre_mesa");
                  setCloseBillingName(_needsFacturac ? `${_resClientc!.firstName} ${_resClientc!.lastName}`.toUpperCase() : (_tableResc ? _tableResc.guestName : ""));
                  setCloseBillingCuit(_needsFacturac ? (_resClientc!.cuilCuit || "") : "");
                  setCloseBillingCompanyId("");
                  setCloseCcEntityType("company");
                  setCloseCcEntityId("");
                  setBillingSearch("");
                  setFbIsExento(false);
                  setSplitCustomerNames({});
                  setSplitCustomerCuits({});
                  setSplitVatConditions({});
                  setSplitFbIsExento({});
                  setIsSplitMode(hasActiveSplits);
                  setIsCloseDialogOpen(true);
                }}
                data-testid="button-close-table"
              >
                <CreditCard className="h-5 w-5 mr-2" />
                Cerrar Mesa
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-create client dialog */}
      <Dialog open={isNewClientDialogOpen} onOpenChange={setIsNewClientDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" /> Nuevo cliente fiscal
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Razón Social *</Label>
              <Input
                value={newClientRazonSocial}
                onChange={e => setNewClientRazonSocial(e.target.value)}
                placeholder="Empresa S.A."
                data-testid="input-new-client-razon-social"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-2">
                CUIT *
                {newClientCuit && (
                  <span className={`text-xs font-medium ${validateCuit(newClientCuit) ? "text-green-600" : "text-destructive"}`}>
                    {validateCuit(newClientCuit) ? "✓ válido" : "✗ inválido"}
                  </span>
                )}
              </Label>
              <Input
                value={newClientCuit}
                onChange={e => setNewClientCuit(formatCuit(e.target.value))}
                placeholder="30-12345678-9"
                data-testid="input-new-client-cuit"
              />
            </div>
            <div>
              <Label className="text-xs">Condición IVA</Label>
              <Select value={newClientCondicionIva} onValueChange={(v) => setNewClientCondicionIva(v as typeof newClientCondicionIva)}>
                <SelectTrigger data-testid="select-new-client-condicion-iva">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="responsable_inscripto">Responsable Inscripto</SelectItem>
                  <SelectItem value="exento">Exento</SelectItem>
                  <SelectItem value="monotributista">Monotributista</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewClientDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!newClientRazonSocial.trim() || !newClientCuit || !validateCuit(newClientCuit) || createQuickClientMutation.isPending}
              onClick={() => createQuickClientMutation.mutate({ razonSocial: newClientRazonSocial.trim(), cuilCuit: newClientCuit, condicionIva: newClientCondicionIva })}
              data-testid="button-confirm-new-client"
            >
              {createQuickClientMutation.isPending ? "Creando..." : "Crear y seleccionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Order Dialog with Receipt Type, Payment Method, and Split */}
      <Dialog open={isCloseDialogOpen} onOpenChange={(open) => { setIsCloseDialogOpen(open); if (!open) { setIsSplitMode(false); setSplitDialogMode("equal_parts"); setMoveItemSelectedIds(new Set()); setMoveItemTargetOrderId(""); setPayItemSelectedIds(new Set()); setPayItemDiscount(""); setPayItemRoomId(""); setPayItemRoomSearch(""); setPayItemBillingName(""); setPayItemBillingCuit(""); setPayItemFbIsExento(false); setRoomSearchFilter(""); setCloseDiscount(""); setCloseDiscountType("percent"); setBillingSearch(""); setFbIsExento(false); setCloseBillingName(""); setCloseBillingCuit(""); setCloseBillingCompanyId(""); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Cerrar - {getUpdatedOrder()?.orderLabel || currentOrder?.orderNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {getOrderItems().some(i => i.status === "waiting_course") && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-md p-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-300">
                  <p className="font-semibold">Hay ítems pendientes de curso</p>
                  <p className="text-xs mt-0.5">Algunos platos están en espera y no fueron enviados a cocina. Verificá si corresponde avanzar el Sale antes de cerrar.</p>
                </div>
              </div>
            )}
            <h3 className="font-semibold">Resumen de Consumos</h3>
            {getOrderItems().length === 0 && (
              <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-semibold">Esta comanda está vacía</p>
                  <p className="text-xs mt-0.5">Los ítems fueron cobrados o transferidos. Confirmá el cierre con el botón de abajo para liberar la mesa.</p>
                </div>
              </div>
            )}
            {getOrderItems().length === 0 ? (
              <p className="text-muted-foreground text-center py-2">No hay items en este pedido</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {getOrderItems().map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b">
                    <div>
                      <span>{item.menuItem?.name || "Item"}</span>
                      <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                      {item.course && item.course > 1 && <Badge variant="outline" className="ml-1 text-[10px]">{courseLabels[item.course]}</Badge>}
                    </div>
                    <span>
                      ${parseFloat(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t space-y-1">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${parseFloat(getUpdatedOrder()?.subtotal || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>IVA (21%):</span>
                <span>${parseFloat(getUpdatedOrder()?.tax || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Label className="text-sm whitespace-nowrap">Descuento:</Label>
                <Input type="number" min={0} step="0.01" placeholder="0" value={closeDiscount} onChange={(e) => setCloseDiscount(e.target.value)} className="h-8 w-24" data-testid="input-close-discount" />
                <Select value={closeDiscountType} onValueChange={(v) => setCloseDiscountType(v as "amount" | "percent")}>
                  <SelectTrigger className="h-8 w-20" data-testid="select-discount-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">$</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(() => {
                const total = parseFloat(getUpdatedOrder()?.total || "0");
                const disc = parseFloat(closeDiscount || "0");
                const discAmount = closeDiscountType === "percent" ? total * disc / 100 : disc;
                const afterDiscount = Math.max(0, total - discAmount);
                const finalTotal = Math.max(0, afterDiscount - totalAdvanceCredit);
                return (
                  <>
                    {disc > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Descuento:</span>
                        <span>-${discAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {totalAdvanceCredit > 0 && (
                      <div className="flex justify-between text-sm text-blue-600 dark:text-blue-400 font-medium py-1 border border-blue-200 dark:border-blue-800 rounded px-2 bg-blue-50 dark:bg-blue-950/20">
                        <span className="flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5" />
                          Seña / Anticipo reserva:
                        </span>
                        <span>-${totalAdvanceCredit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xl font-bold pt-2">
                      <span>A cobrar:</span>
                      <span>${finalTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                    {totalAdvanceCredit > 0 && (
                      <p className="text-xs text-muted-foreground text-right">Total consumido: ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                    )}
                  </>
                );
              })()}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={printBillPreview}
              data-testid="button-print-bill-preview"
            >
              <Printer className="h-4 w-4 mr-2" />
              Ver / Imprimir cuenta
            </Button>

            {!isSplitMode ? (
              <>
                {(() => {
                  const updOrder = getUpdatedOrder();
                  const isTableless = updOrder && !updOrder.tableId;
                  const activePaymentMethods = isTableless
                    ? { efectivo: "Efectivo", pedidos_ya: "Pedidos Ya" }
                    : paymentMethodLabels;
                  const activeReceiptTypes = isTableless
                    ? { voucher: "Voucher Justo Resto", voucher_pedidos_ya: "Voucher Pedidos Ya" }
                    : receiptTypeLabels;
                  const effPay = isTableless && !activePaymentMethods[closePaymentMethod] ? "efectivo" : closePaymentMethod;
                  const effRec = isTableless && !activeReceiptTypes[closeReceiptType] ? "voucher" : closeReceiptType;
                  if (effPay !== closePaymentMethod) setTimeout(() => setClosePaymentMethod(effPay), 0);
                  if (effRec !== closeReceiptType) setTimeout(() => setCloseReceiptType(effRec), 0);
                  const isRoomCharge = effPay === "cuenta_habitacion";
                  return (
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div className="space-y-2">
                        <Label>Forma de Cobro</Label>
                        <Select value={effPay} onValueChange={(v) => {
                          setClosePaymentMethod(v);
                          if (v !== "cuenta_habitacion") { setCloseRoomId(""); setRoomSearchFilter(""); }
                        }}>
                          <SelectTrigger data-testid="select-payment-method"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(activePaymentMethods).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isTableless && <p className="text-xs text-muted-foreground">Área sin mesas</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Comprobante</Label>
                        {isRoomCharge ? (
                          <div className="text-sm text-muted-foreground bg-muted/40 rounded-md p-2.5 flex items-center gap-2">
                            <BedDouble className="h-4 w-4 text-blue-500 shrink-0" />
                            <span className="text-xs">Se carga al folio de la habitación</span>
                          </div>
                        ) : (
                          <Select value={effRec} onValueChange={(v) => {
                            setCloseReceiptType(v);
                            const hasRealClient = !!closeBillingName && closeBillingName !== "CONSUMIDOR FINAL";
                            if (v === "factura_b") {
                              if (!hasRealClient) setCloseBillingName("CONSUMIDOR FINAL");
                              setCloseBillingCompanyId("");
                              setBillingSearch(""); setFbIsExento(false);
                            } else if (v !== "factura_a") {
                              if (!hasRealClient) { setCloseBillingName(""); setCloseBillingCuit(""); setCloseBillingCompanyId(""); setBillingSearch(""); }
                            }
                          }}>
                            <SelectTrigger data-testid="select-receipt-type"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(activeReceiptTypes).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Selector de empresa/agencia para CC */}
                {closePaymentMethod === "cuenta_corriente" && (
                  <div className="space-y-3 p-3 border rounded-md bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Cuenta Corriente — ¿A quién se carga?</p>
                    <div className="flex gap-2">
                      <Select value={closeCcEntityType} onValueChange={(v) => { setCloseCcEntityType(v as "company" | "agency"); setCloseCcEntityId(""); }}>
                        <SelectTrigger className="w-32" data-testid="select-cc-entity-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="company">Empresa</SelectItem>
                          <SelectItem value="agency">Agencia</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={closeCcEntityId} onValueChange={setCloseCcEntityId}>
                        <SelectTrigger className="flex-1" data-testid="select-cc-entity">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          {closeCcEntityType === "company"
                            ? companies.filter((c: any) => c.id).map((c: any) => <SelectItem key={c.id} value={c.id}>{(c as any).razonSocial || (c as any).nombreFantasia || (c as any).name || c.id}</SelectItem>)
                            : agencies.filter((a: any) => a.id).map((a: any) => <SelectItem key={a.id} value={a.id}>{(a as any).razonSocial || (a as any).nombreFantasia || (a as any).name || a.id}</SelectItem>)
                          }
                        </SelectContent>
                      </Select>
                    </div>
                    {!closeCcEntityId && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Si no seleccionás una entidad, el cargo no se registrará en ninguna Cuenta Corriente.</p>
                    )}
                  </div>
                )}

                {(closeReceiptType === "factura_a" || closeReceiptType === "factura_b") && (() => {
                  const isFactA = closeReceiptType === "factura_a";
                  const showClientForm = isFactA || fbIsExento;
                  const clientSelected = !!closeBillingName && closeBillingName !== "CONSUMIDOR FINAL";
                  const cuitValid = !closeBillingCuit || !!closeBillingCompanyId || validateCuit(closeBillingCuit);
                  const billingResults: { id: string; label: string; sublabel?: string; cuit: string; type: "company" | "guest" }[] = billingSearch.length >= 2
                    ? [
                        ...companies
                          .filter(c => {
                            const q = billingSearch.toLowerCase();
                            return c.razonSocial.toLowerCase().includes(q)
                              || (c.name || "").toLowerCase().includes(q)
                              || (c.nombreFantasia?.toLowerCase() || "").includes(q)
                              || c.cuilCuit.replace(/-/g,"").includes(billingSearch.replace(/-/g,""));
                          })
                          .slice(0, 6)
                          .map(c => ({ id: c.id, label: c.razonSocial, sublabel: c.nombreFantasia || undefined, cuit: formatCuit(c.cuilCuit), type: "company" as const })),
                        ...restaurantGuests
                          .filter(g => {
                            if (!g.cuilCuit) return false;
                            if (g.vatCondition === "consumidor_final" || !g.vatCondition) return false;
                            const q = billingSearch.toLowerCase();
                            const fullName = `${g.firstName} ${g.lastName}`.toLowerCase();
                            return fullName.includes(q)
                              || g.lastName.toLowerCase().includes(q)
                              || g.cuilCuit.replace(/-/g,"").includes(billingSearch.replace(/-/g,""));
                          })
                          .slice(0, 4)
                          .map(g => ({
                            id: g.id,
                            label: `${g.firstName} ${g.lastName}`.toUpperCase(),
                            sublabel: g.vatCondition === "monotributista" ? "Monotributista" : g.vatCondition === "responsable_inscripto" ? "Resp. Inscripto" : g.vatCondition || undefined,
                            cuit: formatCuit(g.cuilCuit || ""),
                            type: "guest" as const,
                          })),
                      ]
                    : [];

                  return (
                    <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                      <p className="text-sm font-medium">
                        Datos de facturación
                        {!isFactA && <span className="ml-1 text-xs font-normal text-muted-foreground">(cliente opcional para Factura B)</span>}
                      </p>

                      {selectedPosNumero && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
                          <Monitor className="h-3.5 w-3.5 shrink-0" />
                          <span>PV {String(selectedPosNumero).padStart(4, "0")}{selectedPosNombre ? ` — ${selectedPosNombre}` : ""}</span>
                        </div>
                      )}

                      {!isFactA && (
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id="fb-exento" checked={fbIsExento}
                            onChange={e => {
                              setFbIsExento(e.target.checked);
                              if (!e.target.checked) {
                                setCloseBillingName("CONSUMIDOR FINAL");
                                setCloseBillingCuit("");
                                setCloseBillingCompanyId("");
                                setBillingSearch("");
                              } else {
                                setCloseBillingName("");
                              }
                            }}
                            className="h-4 w-4 cursor-pointer"
                          />
                          <label htmlFor="fb-exento" className="text-sm cursor-pointer select-none">
                            Empresa exenta / identificada (no es Consumidor Final)
                          </label>
                        </div>
                      )}

                      {!isFactA && !fbIsExento && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded px-3 py-2">
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                          Consumidor Final
                        </div>
                      )}

                      {showClientForm && (
                        <>
                          {clientSelected ? (
                            <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md">
                              <Building2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{closeBillingName}</p>
                                {closeBillingCuit && (
                                  <p className={`text-xs ${cuitValid ? "text-muted-foreground" : "text-destructive font-medium"}`}>
                                    CUIT: {closeBillingCuit}{!cuitValid ? " ⚠ inválido" : ""}
                                  </p>
                                )}
                              </div>
                              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                                onClick={() => { setCloseBillingName(""); setCloseBillingCuit(""); setCloseBillingCompanyId(""); setBillingSearch(""); }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="relative">
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <Input
                                    placeholder="Buscar empresa o persona por nombre o CUIT..."
                                    value={billingSearch}
                                    onChange={e => { setBillingSearch(e.target.value); setCloseBillingCompanyId(""); setBillingSearchOpen(true); }}
                                    onFocus={() => setBillingSearchOpen(true)}
                                    onBlur={() => setTimeout(() => setBillingSearchOpen(false), 350)}
                                    data-testid="input-billing-search"
                                    autoComplete="off"
                                  />
                                  {billingSearchOpen && billingResults.length > 0 && (
                                    <div
                                      className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-lg max-h-52 overflow-y-auto"
                                      onMouseDown={e => e.preventDefault()}
                                    >
                                      {billingResults.map(item => (
                                        <button key={item.id} type="button"
                                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-start gap-2"
                                          onMouseDown={() => {
                                            setCloseBillingName(item.label);
                                            setCloseBillingCuit(item.cuit);
                                            if (item.type === "company") {
                                              setCloseBillingCompanyId(item.id);
                                              setCloseCcEntityType("company");
                                              setCloseCcEntityId(item.id);
                                            } else {
                                              setCloseBillingCompanyId("");
                                              setCloseCcEntityType("company");
                                              setCloseCcEntityId("");
                                            }
                                            setBillingSearch(item.label);
                                            setBillingSearchOpen(false);
                                          }}
                                        >
                                          <span className="flex-1 min-w-0">
                                            <span className="font-medium block truncate">{item.label}</span>
                                            {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
                                          </span>
                                          <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{item.cuit}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {billingSearchOpen && billingSearch.length >= 2 && billingResults.length === 0 && (
                                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
                                      Sin resultados para "{billingSearch}"
                                    </div>
                                  )}
                                </div>
                                <Button type="button" variant="outline" size="sm"
                                  className="shrink-0 gap-1"
                                  onClick={() => setIsNewClientDialogOpen(true)}
                                  data-testid="button-new-billing-client"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  Nuevo
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">Escribí al menos 2 caracteres para buscar</p>
                            </div>
                          )}

                          {!clientSelected && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">O ingresá razón social</Label>
                                <Input
                                  value={closeBillingName}
                                  onChange={e => { setCloseBillingName(e.target.value); setCloseBillingCompanyId(""); }}
                                  placeholder="Empresa S.A."
                                  data-testid="input-billing-name"
                                />
                              </div>
                              <div>
                                <Label className="text-xs flex items-center gap-1">
                                  CUIT
                                  {closeBillingCuit && (
                                    <span className={`ml-1 text-xs font-medium ${cuitValid ? "text-green-600" : "text-destructive"}`}>
                                      {cuitValid ? "✓ válido" : "✗ inválido"}
                                    </span>
                                  )}
                                </Label>
                                <Input
                                  value={closeBillingCuit}
                                  onChange={e => { setCloseBillingCuit(formatCuit(e.target.value)); setCloseBillingCompanyId(""); }}
                                  placeholder="30-12345678-9"
                                  data-testid="input-billing-cuit"
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                {closePaymentMethod === "cuenta_habitacion" && (
                  <div className="space-y-2">
                    <Label>Habitación</Label>
                    <Input
                      placeholder="Buscar por número o nombre..."
                      value={roomSearchFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRoomSearchFilter(val);
                        setCloseRoomId("");
                        if (val !== "") {
                          const matches = inHouseRooms.filter(r =>
                            r.reservationId &&
                            (r.roomNumber.includes(val) || r.guestName.toLowerCase().includes(val.toLowerCase()))
                          );
                          if (matches.length === 1) {
                            setCloseRoomId(matches[0].reservationId);
                            setRoomSearchFilter("");
                          }
                        }
                      }}
                      data-testid="input-room-search"
                    />
                    {roomSearchFilter !== "" && (() => {
                      const matches = inHouseRooms.filter(r =>
                        r.reservationId &&
                        (r.roomNumber.includes(roomSearchFilter) || r.guestName.toLowerCase().includes(roomSearchFilter.toLowerCase()))
                      );
                      return matches.length > 1 ? (
                        <div className="border rounded-md bg-popover shadow-md max-h-40 overflow-y-auto">
                          {matches.map(r => (
                            <button
                              key={r.roomId}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                              onClick={() => { setCloseRoomId(r.reservationId); setRoomSearchFilter(""); }}
                              data-testid={`option-room-${r.roomNumber}`}
                            >
                              <span className="font-medium">{r.roomNumber}</span> — {r.guestName}
                            </button>
                          ))}
                        </div>
                      ) : matches.length === 0 ? (
                        <p className="text-sm text-muted-foreground px-1">Sin resultados</p>
                      ) : null;
                    })()}
                    {closeRoomId && (() => {
                      const room = inHouseRooms.find(r => r.reservationId === closeRoomId);
                      return room ? (
                        <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm bg-accent/40" data-testid="selected-room-charge">
                          <span><span className="font-medium">{room.roomNumber}</span> — {room.guestName}</span>
                          <button type="button" onClick={() => { setCloseRoomId(""); setRoomSearchFilter(""); }} className="text-muted-foreground hover:text-foreground ml-2 text-xs">✕</button>
                        </div>
                      ) : null;
                    })()}
                    {inHouseRooms.length === 0 && (
                      <p className="text-sm text-muted-foreground">No hay habitaciones ocupadas</p>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => { setIsSplitMode(true); setSplitDialogMode("equal_parts"); }}
                    data-testid="button-split-bill"
                  >
                    <Banknote className="h-4 w-4 mr-2" />
                    Dividir Cuenta
                  </Button>
                </div>
              </>
            ) : (
              <div className="pt-4 border-t space-y-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <Banknote className="h-4 w-4" />
                  Dividir Cuenta
                </h4>

                {/* Mode selector */}
                <div className="grid grid-cols-3 gap-1.5">
                  <Button
                    variant={splitDialogMode === "equal_parts" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-8 px-2"
                    onClick={() => setSplitDialogMode("equal_parts")}
                    data-testid="button-split-mode-equal"
                  >
                    <Banknote className="h-3 w-3 mr-1 shrink-0" />Partes iguales
                  </Button>
                  <Button
                    variant={splitDialogMode === "move_items" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-8 px-2"
                    onClick={() => { setSplitDialogMode("move_items"); setMoveItemSelectedIds(new Set()); setMoveItemTargetOrderId(""); }}
                    data-testid="button-split-mode-move"
                  >
                    <ArrowRightLeft className="h-3 w-3 mr-1 shrink-0" />Mover mesa
                  </Button>
                  <Button
                    variant={splitDialogMode === "pay_items" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-8 px-2"
                    onClick={() => { setSplitDialogMode("pay_items"); setPayItemSelectedIds(new Set()); setPayItemDiscount(""); }}
                    data-testid="button-split-mode-pay"
                  >
                    <CreditCard className="h-3 w-3 mr-1 shrink-0" />Cobrar ítems
                  </Button>
                </div>

                {splitDialogMode === "equal_parts" && (() => {
                  const updatedOrder = orders?.find((o: RestaurantOrder) => o.id === currentOrder?.id);
                  const splits: OrderSplit[] = (updatedOrder as any)?.splits || [];
                  if (splits.length === 0) {
                    return (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Cantidad de partes</Label>
                          <div className="flex gap-2">
                            {[2, 3, 4].map(n => (
                              <Button
                                key={n}
                                variant={splitParts === n ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSplitParts(n)}
                                data-testid={`button-split-${n}`}
                              >
                                {n} partes
                              </Button>
                            ))}
                            <Input
                              type="number"
                              min={2}
                              max={10}
                              value={splitParts}
                              onChange={(e) => setSplitParts(Math.max(2, parseInt(e.target.value) || 2))}
                              className="w-20"
                              data-testid="input-split-parts"
                            />
                          </div>
                        </div>
                        <div className="p-3 bg-muted rounded-md text-sm">
                          Cada parte: <strong>${(parseFloat(getUpdatedOrder()?.total || "0") / splitParts).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setIsSplitMode(false)}
                            className="flex-1"
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={() => {
                              if (currentOrder) createSplitMutation.mutate({ orderId: currentOrder.id, parts: splitParts });
                            }}
                            disabled={createSplitMutation.isPending}
                            className="flex-1"
                            data-testid="button-confirm-split"
                          >
                            {createSplitMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Dividir
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {splits.map((split) => (
                        <div key={split.id} className={`p-3 border rounded-md ${split.isPaid === "true" ? "bg-green-500/10 border-green-500/30" : ""}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">Parte {split.splitNumber}</span>
                            {split.isPaid === "true" ? (
                              <span className="font-bold">${parseFloat(split.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-sm text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="h-7 w-28 text-right font-bold"
                                  value={splitEditAmounts[split.id] ?? split.amount}
                                  onChange={(e) => setSplitEditAmounts(prev => ({ ...prev, [split.id]: e.target.value }))}
                                  onBlur={() => {
                                    const newAmount = splitEditAmounts[split.id];
                                    if (newAmount !== undefined && newAmount !== split.amount && currentOrder) {
                                      updateSplitAmountMutation.mutate({ orderId: currentOrder.id, splitId: split.id, amount: newAmount });
                                    }
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          {split.isPaid === "true" ? (
                            <Badge variant="default" className="bg-green-600">Pagado - {paymentMethodLabels[split.method || ""] || split.method}</Badge>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex gap-2 items-center">
                                <div className="flex-1">
                                  <Select value={splitPayMethods[split.id] || "efectivo"} onValueChange={(v) => setSplitPayMethods(prev => ({ ...prev, [split.id]: v }))}>
                                    <SelectTrigger className="h-8" data-testid={`select-split-method-${split.splitNumber}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(paymentMethodLabels).map(([v, l]) => (
                                        <SelectItem key={v} value={v}>{l}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex-1">
                                  <Select value={splitReceiptTypes[split.id] || "cierre_mesa"} onValueChange={(v) => setSplitReceiptTypes(prev => ({ ...prev, [split.id]: v }))}>
                                    <SelectTrigger className="h-8" data-testid={`select-split-receipt-${split.splitNumber}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(receiptTypeLabels).map(([v, l]) => (
                                        <SelectItem key={v} value={v}>{l}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    if (currentOrder) {
                                      const method = splitPayMethods[split.id] || "efectivo";
                                      if (method === "cuenta_habitacion" && !splitRoomIds[split.id]) {
                                        toast({ title: "Seleccioná una habitación", variant: "destructive" });
                                        return;
                                      }
                                      const sReceipt = splitReceiptTypes[split.id] || "cierre_mesa";
                                      const sIsFactura = ["factura_a","factura_b","factura_c"].includes(sReceipt);
                                      const sVatCond = sReceipt === "factura_a"
                                        ? "responsable_inscripto"
                                        : splitFbIsExento[split.id] ? "exento" : "consumidor_final";
                                      paySplitMutation.mutate({
                                        orderId: currentOrder.id,
                                        splitId: split.id,
                                        method,
                                        receiptType: sReceipt,
                                        roomReservationId: method === "cuenta_habitacion" ? splitRoomIds[split.id] : undefined,
                                        emitInvoice: sIsFactura,
                                        vatCondition: sIsFactura ? sVatCond : undefined,
                                        customerRazonSocial: sIsFactura ? (splitCustomerNames[split.id] || undefined) : undefined,
                                        customerCuit: sIsFactura ? (splitCustomerCuits[split.id] || undefined) : undefined,
                                      });
                                    }
                                  }}
                                  disabled={paySplitMutation.isPending}
                                  data-testid={`button-pay-split-${split.splitNumber}`}
                                >
                                  Cobrar
                                </Button>
                              </div>
                              {(splitPayMethods[split.id] || "efectivo") === "cuenta_habitacion" && (
                                <div className="space-y-1 p-2 bg-muted/50 rounded-md border">
                                  <Label className="text-xs text-muted-foreground">Habitación a cargar</Label>
                                  <Input
                                    placeholder="Buscar por número o nombre..."
                                    value={splitRoomSearchFilters[split.id] || ""}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setSplitRoomSearchFilters(prev => ({ ...prev, [split.id]: val }));
                                      setSplitRoomIds(prev => ({ ...prev, [split.id]: "" }));
                                      if (val !== "") {
                                        const matches = inHouseRooms.filter(r =>
                                          r.reservationId &&
                                          (r.roomNumber.includes(val) || r.guestName.toLowerCase().includes(val.toLowerCase()))
                                        );
                                        if (matches.length === 1) {
                                          setSplitRoomIds(prev => ({ ...prev, [split.id]: matches[0].reservationId }));
                                          setSplitRoomSearchFilters(prev => ({ ...prev, [split.id]: "" }));
                                        }
                                      }
                                    }}
                                    className="h-7 text-sm"
                                    data-testid={`input-split-room-search-${split.splitNumber}`}
                                  />
                                  {(splitRoomSearchFilters[split.id] || "") !== "" && (() => {
                                    const search = splitRoomSearchFilters[split.id] || "";
                                    const matches = inHouseRooms.filter(r =>
                                      r.reservationId &&
                                      (r.roomNumber.includes(search) || r.guestName.toLowerCase().includes(search.toLowerCase()))
                                    );
                                    return matches.length > 1 ? (
                                      <div className="border rounded-md bg-popover shadow-md max-h-32 overflow-y-auto">
                                        {matches.map(r => (
                                          <button
                                            key={r.roomId}
                                            type="button"
                                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                            onClick={() => {
                                              setSplitRoomIds(prev => ({ ...prev, [split.id]: r.reservationId }));
                                              setSplitRoomSearchFilters(prev => ({ ...prev, [split.id]: "" }));
                                            }}
                                            data-testid={`option-split-room-${r.roomNumber}`}
                                          >
                                            <span className="font-medium">{r.roomNumber}</span> — {r.guestName}
                                          </button>
                                        ))}
                                      </div>
                                    ) : matches.length === 0 ? (
                                      <p className="text-xs text-muted-foreground px-1">Sin resultados</p>
                                    ) : null;
                                  })()}
                                  {splitRoomIds[split.id] && (() => {
                                    const room = inHouseRooms.find(r => r.reservationId === splitRoomIds[split.id]);
                                    return room ? (
                                      <div className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm bg-accent/40">
                                        <span><span className="font-medium">{room.roomNumber}</span> — {room.guestName}</span>
                                        <button type="button" onClick={() => { setSplitRoomIds(prev => ({ ...prev, [split.id]: "" })); setSplitRoomSearchFilters(prev => ({ ...prev, [split.id]: "" })); }} className="text-muted-foreground hover:text-foreground ml-2 text-xs">✕</button>
                                      </div>
                                    ) : null;
                                  })()}
                                </div>
                              )}
                              {(() => {
                                const sRec = splitReceiptTypes[split.id] || "cierre_mesa";
                                const isFactA = sRec === "factura_a";
                                const isFactB = sRec === "factura_b";
                                if (!isFactA && !isFactB) return null;
                                const isExento = splitFbIsExento[split.id] || false;
                                const showForm = isFactA || isExento;
                                return (
                                  <div className="mt-2 p-2 border rounded-md bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 space-y-2">
                                    {isFactB && (
                                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input type="checkbox" checked={isExento} onChange={e => setSplitFbIsExento(prev => ({ ...prev, [split.id]: e.target.checked }))} />
                                        Exento / IVA
                                      </label>
                                    )}
                                    {showForm && (
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <Label className="text-xs">Razón Social</Label>
                                          <Input
                                            className="h-7 text-xs"
                                            value={splitCustomerNames[split.id] || ""}
                                            onChange={e => setSplitCustomerNames(prev => ({ ...prev, [split.id]: e.target.value }))}
                                            placeholder="Empresa S.A."
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">CUIT</Label>
                                          <Input
                                            className="h-7 text-xs"
                                            value={splitCustomerCuits[split.id] || ""}
                                            onChange={e => setSplitCustomerCuits(prev => ({ ...prev, [split.id]: formatCuit(e.target.value) }))}
                                            placeholder="30-12345678-9"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (currentOrder) cancelSplitMutation.mutate(currentOrder.id);
                          }}
                          disabled={cancelSplitMutation.isPending || splits.some(s => s.isPaid === "true")}
                          data-testid="button-cancel-split"
                        >
                          Cancelar División
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Modo: Mover ítems a otra mesa ─────────────────── */}
                {splitDialogMode === "move_items" && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Seleccioná los ítems a mover a otra comanda:</p>
                    <div className="border rounded-md divide-y max-h-44 overflow-y-auto">
                      {getOrderItems().filter((i: any) => !i.paid).map((item: any) => (
                        <label key={item.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30">
                          <Checkbox
                            checked={moveItemSelectedIds.has(item.id)}
                            onCheckedChange={() => {
                              const next = new Set(moveItemSelectedIds);
                              if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                              setMoveItemSelectedIds(next);
                            }}
                          />
                          <span className="flex-1 text-sm">{item.menuItem?.name || "Ítem"} <span className="text-muted-foreground text-xs">x{item.quantity}</span></span>
                          <span className="text-sm font-medium">${parseFloat(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                        </label>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Comanda destino</Label>
                      <Select value={moveItemTargetOrderId} onValueChange={setMoveItemTargetOrderId}>
                        <SelectTrigger data-testid="select-move-target-order">
                          <SelectValue placeholder="Seleccionar comanda..." />
                        </SelectTrigger>
                        <SelectContent>
                          {((orders || []) as RestaurantOrder[])
                            .filter((o: RestaurantOrder) => o.id !== currentOrder?.id && o.status === "open")
                            .map((o: RestaurantOrder) => (
                              <SelectItem key={o.id} value={o.id}>
                                {(o as any).orderLabel || o.orderNumber}
                                {(o as any).table ? ` — Mesa ${(o as any).table.tableNumber}` : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSplitDialogMode("equal_parts"); setMoveItemSelectedIds(new Set()); setMoveItemTargetOrderId(""); }}>
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={moveItemSelectedIds.size === 0 || !moveItemTargetOrderId || transferItemsInSplitMutation.isPending}
                        onClick={() => {
                          if (currentOrder && moveItemTargetOrderId) {
                            transferItemsInSplitMutation.mutate({ orderId: currentOrder.id, itemIds: Array.from(moveItemSelectedIds), targetOrderId: moveItemTargetOrderId });
                          }
                        }}
                        data-testid="button-confirm-move-items"
                      >
                        {transferItemsInSplitMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                        Mover {moveItemSelectedIds.size > 0 ? `(${moveItemSelectedIds.size})` : ""}
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── Modo: Cobrar ítems seleccionados ─────────────────── */}
                {splitDialogMode === "pay_items" && (() => {
                  const allItems = getOrderItems().filter((i: any) => !i.paid);
                  const selectedItems = allItems.filter((i: any) => payItemSelectedIds.has(i.id));
                  const rawSub = selectedItems.reduce((s: number, i: any) => s + parseFloat(i.subtotal || "0"), 0);
                  const disc = parseFloat(payItemDiscount || "0");
                  const discAmt = payItemDiscountType === "percent" ? rawSub * disc / 100 : disc;
                  const finalTotal = Math.max(0, rawSub - discAmt);
                  const isFactura = ["factura_a", "factura_b", "factura_c"].includes(payItemReceipt);
                  const isFactA = payItemReceipt === "factura_a";
                  const showBillingForm = isFactA || (payItemReceipt === "factura_b" && payItemFbIsExento);
                  const billingResults = payItemBillingSearch.length >= 2
                    ? companies.filter((c: any) => {
                        const q = payItemBillingSearch.toLowerCase();
                        return (c.razonSocial || "").toLowerCase().includes(q)
                          || (c.nombreFantasia || "").toLowerCase().includes(q)
                          || (c.cuilCuit || "").replace(/-/g, "").includes(payItemBillingSearch.replace(/-/g, ""));
                      }).slice(0, 8)
                    : [];
                  return (
                    <div className="space-y-3">
                      {/* Item selection */}
                      <p className="text-sm text-muted-foreground">Seleccioná los ítems a cobrar:</p>
                      <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                        {allItems.length === 0 && <p className="text-sm text-muted-foreground text-center py-3">No hay ítems pendientes</p>}
                        {allItems.map((item: any) => (
                          <label key={item.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30">
                            <Checkbox
                              checked={payItemSelectedIds.has(item.id)}
                              onCheckedChange={() => {
                                const next = new Set(payItemSelectedIds);
                                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                setPayItemSelectedIds(next);
                              }}
                            />
                            <span className="flex-1 text-sm">{item.menuItem?.name || "Ítem"} <span className="text-muted-foreground text-xs">x{item.quantity}</span></span>
                            <span className="text-sm font-medium">${parseFloat(item.subtotal).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                          </label>
                        ))}
                      </div>

                      {/* Subtotal + discount */}
                      {payItemSelectedIds.size > 0 && (
                        <div className="p-2.5 bg-muted/40 rounded-md space-y-1.5 text-sm border">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs whitespace-nowrap">Descuento:</span>
                            <Input type="number" min={0} placeholder="0" value={payItemDiscount} onChange={e => setPayItemDiscount(e.target.value)} className="h-7 w-20 text-xs" data-testid="input-payitem-discount" />
                            <Select value={payItemDiscountType} onValueChange={v => setPayItemDiscountType(v as any)}>
                              <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="amount">$</SelectItem>
                                <SelectItem value="percent">%</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {disc > 0 && (
                            <div className="flex justify-between text-xs text-green-600">
                              <span>Descuento:</span>
                              <span>-${discAmt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-base border-t pt-1">
                            <span>Total a cobrar:</span>
                            <span>${finalTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )}

                      {/* Payment method + receipt */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Forma de cobro</Label>
                          <Select value={payItemMethod} onValueChange={v => { setPayItemMethod(v); if (v !== "cuenta_habitacion") { setPayItemRoomId(""); setPayItemRoomSearch(""); } if (v !== "cuenta_corriente") { setPayItemCcEntityId(""); } }}>
                            <SelectTrigger className="h-8 text-sm" data-testid="select-payitem-method"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(paymentMethodLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l as string}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Comprobante</Label>
                          {payItemMethod === "cuenta_habitacion" ? (
                            <div className="h-8 flex items-center text-xs text-muted-foreground bg-muted/40 rounded-md px-2.5 gap-1.5 border">
                              <BedDouble className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <span>Folio habitación</span>
                            </div>
                          ) : (
                            <Select value={payItemReceipt} onValueChange={v => { setPayItemReceipt(v); if (v === "factura_b") { setPayItemBillingName("CONSUMIDOR FINAL"); setPayItemBillingCuit(""); setPayItemFbIsExento(false); } else if (v !== "factura_a") { setPayItemBillingName(""); setPayItemBillingCuit(""); } }}>
                              <SelectTrigger className="h-8 text-sm" data-testid="select-payitem-receipt"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(receiptTypeLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l as string}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>

                      {/* Room selection */}
                      {payItemMethod === "cuenta_habitacion" && (
                        <div className="space-y-1.5 p-2.5 bg-blue-50/60 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
                          <Label className="text-xs text-muted-foreground">Habitación a cargar</Label>
                          <Input placeholder="Buscar por número o nombre..." value={payItemRoomSearch} onChange={e => { setPayItemRoomSearch(e.target.value); setPayItemRoomId(""); }} className="h-7 text-sm" data-testid="input-payitem-room-search" />
                          {payItemRoomSearch && (() => {
                            const matches = inHouseRooms.filter((r: any) => r.reservationId && (r.roomNumber.includes(payItemRoomSearch) || r.guestName.toLowerCase().includes(payItemRoomSearch.toLowerCase())));
                            return matches.length > 0 ? (
                              <div className="border rounded bg-popover shadow-md max-h-32 overflow-y-auto">
                                {matches.map((r: any) => (
                                  <button key={r.roomId} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors" onClick={() => { setPayItemRoomId(r.reservationId); setPayItemRoomSearch(""); }}>
                                    <span className="font-medium">{r.roomNumber}</span> — {r.guestName}
                                  </button>
                                ))}
                              </div>
                            ) : <p className="text-xs text-muted-foreground mt-1">Sin resultados</p>;
                          })()}
                          {payItemRoomId && (() => {
                            const room = inHouseRooms.find((r: any) => r.reservationId === payItemRoomId);
                            return room ? (
                              <div className="flex items-center justify-between rounded border px-2.5 py-1.5 text-sm bg-accent/40">
                                <span><span className="font-medium">{(room as any).roomNumber}</span> — {(room as any).guestName}</span>
                                <button type="button" onClick={() => setPayItemRoomId("")} className="text-muted-foreground hover:text-foreground text-xs ml-2">✕</button>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      )}

                      {/* CC entity */}
                      {payItemMethod === "cuenta_corriente" && (
                        <div className="p-2.5 border rounded-md bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 space-y-2">
                          <p className="text-xs font-medium text-blue-800 dark:text-blue-200">Cuenta Corriente — ¿A quién se carga?</p>
                          <div className="flex gap-2">
                            <Select value={payItemCcEntityType} onValueChange={v => { setPayItemCcEntityType(v as any); setPayItemCcEntityId(""); }}>
                              <SelectTrigger className="w-28 h-8 text-sm" data-testid="select-payitem-cc-type"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="company">Empresa</SelectItem>
                                <SelectItem value="agency">Agencia</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={payItemCcEntityId} onValueChange={setPayItemCcEntityId}>
                              <SelectTrigger className="flex-1 h-8 text-sm" data-testid="select-payitem-cc-entity"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                              <SelectContent>
                                {payItemCcEntityType === "company"
                                  ? companies.filter((c: any) => c.id).map((c: any) => <SelectItem key={c.id} value={c.id}>{(c as any).razonSocial || (c as any).nombreFantasia || (c as any).name || c.id}</SelectItem>)
                                  : agencies.filter((a: any) => a.id).map((a: any) => <SelectItem key={a.id} value={a.id}>{(a as any).razonSocial || (a as any).nombreFantasia || (a as any).name || a.id}</SelectItem>)
                                }
                              </SelectContent>
                            </Select>
                          </div>
                          {!payItemCcEntityId && <p className="text-xs text-amber-600 dark:text-amber-400">Si no seleccionás entidad, no se registra en ninguna Cuenta Corriente.</p>}
                        </div>
                      )}

                      {/* Billing data for facturas */}
                      {isFactura && payItemMethod !== "cuenta_habitacion" && (
                        <div className="p-2.5 border rounded-md bg-muted/30 space-y-2">
                          <p className="text-xs font-medium">Datos de facturación</p>
                          {!isFactA && (
                            <label className="flex items-center gap-2 text-xs cursor-pointer">
                              <input type="checkbox" checked={payItemFbIsExento}
                                onChange={e => { setPayItemFbIsExento(e.target.checked); if (!e.target.checked) { setPayItemBillingName("CONSUMIDOR FINAL"); setPayItemBillingCuit(""); } else { setPayItemBillingName(""); } }}
                                className="h-3.5 w-3.5 cursor-pointer"
                              />
                              Exento / empresa identificada (no es Consumidor Final)
                            </label>
                          )}
                          {!isFactA && !payItemFbIsExento && (
                            <div className="text-xs text-muted-foreground bg-muted/40 rounded px-2.5 py-1.5 flex items-center gap-1.5">
                              <CheckCircle className="h-3.5 w-3.5 text-green-500" />Consumidor Final
                            </div>
                          )}
                          {showBillingForm && (
                            <>
                              {payItemBillingName && payItemBillingName !== "CONSUMIDOR FINAL" ? (
                                <div className="flex items-center gap-2 p-1.5 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md">
                                  <Building2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{payItemBillingName}</p>
                                    {payItemBillingCuit && <p className="text-xs text-muted-foreground">CUIT: {payItemBillingCuit}</p>}
                                  </div>
                                  <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={() => { setPayItemBillingName(""); setPayItemBillingCuit(""); setPayItemCompanyId(""); setPayItemBillingSearch(""); }}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="relative">
                                  <Input
                                    className="h-7 text-xs"
                                    placeholder="Buscar empresa o ingresar razón social..."
                                    value={payItemBillingSearch}
                                    onChange={e => { setPayItemBillingSearch(e.target.value); setPayItemBillingName(e.target.value); setPayItemCompanyId(""); }}
                                    onFocus={() => setPayItemBillingSearchOpen(true)}
                                    onBlur={() => setTimeout(() => setPayItemBillingSearchOpen(false), 150)}
                                    data-testid="input-payitem-billing-search"
                                    autoComplete="off"
                                  />
                                  {payItemBillingSearchOpen && billingResults.length > 0 && (
                                    <div className="absolute z-50 w-full mt-1 border rounded-md bg-popover shadow-md max-h-36 overflow-y-auto">
                                      {billingResults.map((c: any) => (
                                        <button key={c.id} type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                                          onClick={() => { setPayItemBillingName(c.razonSocial); setPayItemBillingCuit(c.cuilCuit || ""); setPayItemCompanyId(c.id); setPayItemBillingSearch(""); }}>
                                          <span className="font-medium">{c.razonSocial}</span>
                                          {c.cuilCuit && <span className="text-muted-foreground ml-2">{c.cuilCuit}</span>}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">Razón Social</Label>
                                  <Input className="h-7 text-xs" value={payItemBillingName === "CONSUMIDOR FINAL" ? "" : (payItemBillingName || "")} onChange={e => setPayItemBillingName(e.target.value)} placeholder="Empresa S.A." />
                                </div>
                                <div>
                                  <Label className="text-xs">CUIT</Label>
                                  <Input className="h-7 text-xs" value={payItemBillingCuit} onChange={e => setPayItemBillingCuit(formatCuit(e.target.value))} placeholder="30-12345678-9" />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSplitDialogMode("equal_parts"); setPayItemSelectedIds(new Set()); setPayItemDiscount(""); }}>
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={payItemSelectedIds.size === 0 || payItemsMutation.isPending || (payItemMethod === "cuenta_habitacion" && !payItemRoomId)}
                          onClick={() => {
                            if (!currentOrder) return;
                            const vatCond = payItemReceipt === "factura_a" ? "responsable_inscripto" : (payItemFbIsExento ? "exento" : "consumidor_final");
                            payItemsMutation.mutate({
                              orderId: currentOrder.id,
                              itemIds: Array.from(payItemSelectedIds),
                              method: payItemMethod,
                              receiptType: payItemReceipt,
                              roomReservationId: payItemMethod === "cuenta_habitacion" ? payItemRoomId : undefined,
                              ccEntityType: payItemMethod === "cuenta_corriente" ? payItemCcEntityType : undefined,
                              ccEntityId: payItemMethod === "cuenta_corriente" ? payItemCcEntityId : undefined,
                              emitInvoice: isFactura,
                              vatCondition: isFactura ? vatCond : undefined,
                              customerRazonSocial: isFactura ? (payItemBillingName || undefined) : undefined,
                              customerCuit: isFactura ? (payItemBillingCuit || undefined) : undefined,
                              discount: payItemDiscount || undefined,
                              discountType: payItemDiscountType,
                            });
                          }}
                          data-testid="button-confirm-pay-items"
                        >
                          {payItemsMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                          Cobrar {payItemSelectedIds.size > 0 ? `(${payItemSelectedIds.size})` : ""}
                        </Button>
                      </div>
                    </div>
                  );
                })()}

              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsCloseDialogOpen(false);
                setIsSplitMode(false);
                setCloseDiscount("");
                setCloseDiscountType("percent");
                setCloseRoomId("");
                setRoomSearchFilter("");
                setBillingSearch("");
                setFbIsExento(false);
                setCloseBillingName("");
                setCloseBillingCuit("");
                setCloseBillingCompanyId("");
                setSplitCustomerNames({});
                setSplitCustomerCuits({});
                setSplitVatConditions({});
                setSplitBillingSearches({});
                setSplitFbIsExento({});
              }}
              className="w-full sm:w-auto"
            >
              Volver
            </Button>
            {!isSplitMode && (() => {
              const updatedOrder = orders?.find((o: RestaurantOrder) => o.id === currentOrder?.id);
              const splits = (updatedOrder as any)?.splits || [];
              const hasSplits = splits.length > 0;
              const handleConfirmClose = () => {
                if (currentOrder) {
                  const disc = parseFloat(closeDiscount || "0");
                  const isFactura = ["factura_a","factura_b","factura_c"].includes(closeReceiptType);
                  const vatCond = closeReceiptType === "factura_a"
                    ? "responsable_inscripto"
                    : fbIsExento ? "exento" : "consumidor_final";
                  closeOrderMutation.mutate({
                    orderId: currentOrder.id,
                    receiptType: closeReceiptType,
                    paymentMethod: closePaymentMethod,
                    discount: disc > 0 ? disc : undefined,
                    discountType: disc > 0 ? closeDiscountType : undefined,
                    roomReservationId: closePaymentMethod === "cuenta_habitacion" && closeRoomId ? closeRoomId : undefined,
                    billingName: closeBillingName || undefined,
                    billingCuit: closeBillingCuit || undefined,
                    ccEntityType: closePaymentMethod === "cuenta_corriente" && closeCcEntityId ? closeCcEntityType : undefined,
                    ccEntityId: closePaymentMethod === "cuenta_corriente" && closeCcEntityId ? closeCcEntityId : undefined,
                    emitInvoice: isFactura,
                    vatCondition: isFactura ? vatCond : undefined,
                    customerRazonSocial: isFactura ? (closeBillingName || undefined) : undefined,
                    customerCuit: isFactura ? (closeBillingCuit || undefined) : undefined,
                    puntoVenta: isFactura && selectedPosNumero ? selectedPosNumero : undefined,
                    reservationAdvanceCredit: totalAdvanceCredit > 0 ? totalAdvanceCredit : undefined,
                  });
                }
              };
              return (
                <>
                  {hasSplits && (
                    <Button
                      variant="outline"
                      onClick={() => setIsSplitMode(true)}
                      className="w-full sm:w-auto"
                      data-testid="button-view-splits"
                    >
                      Ver División ({splits.filter((s: OrderSplit) => s.isPaid === "true").length}/{splits.length} pagadas)
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={handleConfirmClose}
                    disabled={closeOrderMutation.isPending}
                    className="w-full sm:w-auto"
                    data-testid="button-confirm-close"
                  >
                    {closeOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Confirmar Cierre
                  </Button>
                </>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nota de Crédito Confirmation Dialog */}
      <Dialog open={!!invoiceForNC} onOpenChange={(open) => { if (!open) { setInvoiceForNC(null); setNcMotivo(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <FileX className="h-5 w-5" />
              Emitir Nota de Crédito
            </DialogTitle>
            <DialogDescription>
              Se emitirá una NC sobre la factura <strong>{invoiceForNC?.numero_completo || invoiceForNC?.tipo_comprobante}</strong> por <strong>${parseFloat(invoiceForNC?.total || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>. La factura original quedará <strong>anulada</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">Motivo <span className="text-muted-foreground text-xs">(requerido)</span></label>
            <Textarea
              placeholder="Ej: Error en facturación, devolución de consumo..."
              value={ncMotivo}
              onChange={(e) => setNcMotivo(e.target.value)}
              rows={3}
              data-testid="input-nc-motivo"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInvoiceForNC(null); setNcMotivo(""); }}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!ncMotivo.trim() || emitirNCMutation.isPending}
              onClick={() => { if (invoiceForNC) emitirNCMutation.mutate({ invoiceId: invoiceForNC.id, motivo: ncMotivo }); }}
              data-testid="button-confirm-nc"
            >
              {emitirNCMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Emitiendo...</> : "Confirmar NC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Void Confirmation Dialog */}
      <Dialog open={!!itemToVoid} onOpenChange={(open) => { if (!open) { setItemToVoid(null); setItemVoidReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Anular ítem
            </DialogTitle>
            <DialogDescription>
              Se anulará <strong>x{itemToVoid?.item?.quantity} {itemToVoid?.item?.menuItem?.name || "ítem"}</strong> y se imprimirá una comanda de anulación para cocina.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">Motivo <span className="text-muted-foreground text-xs">(opcional)</span></label>
            <Textarea
              placeholder="Ej: Pedido equivocado, el cliente cambió de opinión..."
              value={itemVoidReason}
              onChange={(e) => setItemVoidReason(e.target.value)}
              rows={2}
              data-testid="input-void-item-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setItemToVoid(null); setItemVoidReason(""); }}>
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={deleteItemMutation.isPending}
              onClick={() => { if (itemToVoid) deleteItemMutation.mutate({ orderId: itemToVoid.orderId, itemId: itemToVoid.item.id }); }}
              data-testid="button-confirm-void-item"
            >
              {deleteItemMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Anulando...</> : "Confirmar anulación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Confirmation Dialog */}
      <Dialog open={showCancelOrderDialog} onOpenChange={(open) => { if (!open) { setShowCancelOrderDialog(false); setCancelOrderReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Anular Pedido
            </DialogTitle>
            <DialogDescription>
              Se anulará el pedido <strong>{getUpdatedOrder()?.orderLabel || getUpdatedOrder()?.orderNumber}</strong> y se imprimirá una comanda de anulación para cocina. La mesa quedará disponible. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">Motivo de cancelación <span className="text-destructive">*</span></label>
            <Textarea
              placeholder="Ej: Cliente se fue, pedido erróneo, error de apertura..."
              value={cancelOrderReason}
              onChange={(e) => setCancelOrderReason(e.target.value)}
              rows={3}
              data-testid="input-cancel-order-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCancelOrderDialog(false); setCancelOrderReason(""); }}>
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelOrderReason.trim() || cancelOrderMutation.isPending}
              onClick={() => { if (currentOrder) cancelOrderMutation.mutate({ orderId: currentOrder.id, reason: cancelOrderReason }); }}
              data-testid="button-confirm-cancel-order"
            >
              {cancelOrderMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelando...</> : "Confirmar Cancelación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reservation Dialog */}
      <Dialog open={isReservationDialogOpen} onOpenChange={setIsReservationDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Nueva Reserva</DialogTitle>
          </DialogHeader>
          <Form {...reservationForm}>
            <form id="reservation-form" onSubmit={reservationForm.handleSubmit((data) => {
              const payload = { ...data, tableId: data.tableId || null, status: "confirmed" };
              createReservationMutation.mutate(payload as any);
            })} className="space-y-3 overflow-y-auto flex-1 pr-1">
              {/* Buscador combinado: clientes del restaurant + empresas */}
              {(() => {
                const selectedClientId = reservationForm.watch("clientId");
                const selectedName = reservationForm.watch("guestName");
                const q = reservationClientSearch.toLowerCase();
                const guestResults = q.length >= 2 ? restaurantGuests.filter(g =>
                  `${g.firstName} ${g.lastName}`.toLowerCase().includes(q) ||
                  (g.phone || "").includes(q) ||
                  (g.email || "").toLowerCase().includes(q) ||
                  (g.documentNumber || "").includes(q)
                ).slice(0, 6).map(g => ({
                  id: g.id, label: `${g.firstName} ${g.lastName || ""}`.trim(),
                  sublabel: [g.phone, g.email].filter(Boolean).join(" · "), type: "guest" as const,
                  phone: g.phone, email: g.email,
                })) : [];
                const companyResults = q.length >= 2 ? companies.filter(c =>
                  (c.razonSocial || "").toLowerCase().includes(q) ||
                  (c.nombreFantasia || "").toLowerCase().includes(q) ||
                  (c.cuilCuit || "").includes(q)
                ).slice(0, 4).map(c => ({
                  id: `company-${c.id}`, label: c.razonSocial,
                  sublabel: [c.nombreFantasia, c.cuilCuit].filter(Boolean).join(" · "), type: "company" as const,
                  phone: null, email: null,
                })) : [];
                const allResults = [...guestResults, ...companyResults];
                return (
                  <div className="space-y-1.5 relative" data-testid="reservation-guest-search">
                    <Label className="text-sm font-medium">Buscar cliente o empresa (opcional)</Label>
                    {selectedClientId && selectedName ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/40">
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-sm flex-1 font-medium">{selectedName}</span>
                        <button type="button" onClick={() => { reservationForm.setValue("clientId", null); setReservationClientSearch(""); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                          value={reservationClientSearch}
                          onChange={(e) => { setReservationClientSearch(e.target.value); setShowReservationClientDropdown(true); }}
                          onFocus={() => reservationClientSearch.length >= 2 && setShowReservationClientDropdown(true)}
                          onBlur={() => setTimeout(() => setShowReservationClientDropdown(false), 200)}
                          placeholder="Nombre, empresa, teléfono o CUIT..."
                          className="pl-8"
                          data-testid="reservation-guest-search-input"
                        />
                      </div>
                    )}
                    {showReservationClientDropdown && !selectedClientId && allResults.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-56 overflow-y-auto">
                        {guestResults.length > 0 && <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40">Clientes</div>}
                        {guestResults.map(r => (
                          <button key={r.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex flex-col gap-0.5 border-b last:border-0"
                            onMouseDown={(e) => { e.preventDefault(); reservationForm.setValue("clientId", r.id); reservationForm.setValue("guestName", r.label); reservationForm.setValue("guestPhone", r.phone || ""); reservationForm.setValue("guestEmail", r.email || ""); setReservationClientSearch(""); setShowReservationClientDropdown(false); }}>
                            <span className="font-medium">{r.label}</span>
                            {r.sublabel && <span className="text-xs text-muted-foreground">{r.sublabel}</span>}
                          </button>
                        ))}
                        {companyResults.length > 0 && <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40 border-t">Empresas</div>}
                        {companyResults.map(r => (
                          <button key={r.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex flex-col gap-0.5 border-b last:border-0"
                            onMouseDown={(e) => { e.preventDefault(); reservationForm.setValue("clientId", r.id); reservationForm.setValue("guestName", r.label); reservationForm.setValue("guestPhone", ""); reservationForm.setValue("guestEmail", ""); setReservationClientSearch(""); setShowReservationClientDropdown(false); }}>
                            <span className="font-medium flex items-center gap-1.5">🏢 {r.label}</span>
                            {r.sublabel && <span className="text-xs text-muted-foreground">{r.sublabel}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {showReservationClientDropdown && !selectedClientId && q.length >= 2 && allResults.length === 0 && (
                      <div className="absolute z-50 left-0 right-0 mt-1 bg-background border rounded-md shadow-sm px-3 py-2 text-sm text-muted-foreground">Sin resultados para &quot;{reservationClientSearch}&quot;</div>
                    )}
                  </div>
                );
              })()}
              <FormField control={reservationForm.control} name="guestName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl><Input {...field} placeholder="Nombre completo" data-testid="input-guest-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={reservationForm.control} name="guestPhone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono *</FormLabel>
                    <FormControl><Input {...field} placeholder="+54 11 xxxx-xxxx" data-testid="input-guest-phone" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={reservationForm.control} name="guestEmail" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input {...field} type="email" placeholder="email@ejemplo.com" data-testid="input-guest-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {areas.filter(a => a.isActive === "true").length > 1 && (
                <FormField control={reservationForm.control} name="areaId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salón <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                    <Select
                      onValueChange={(v) => {
                        const areaId = v === "__none__" ? null : v;
                        field.onChange(areaId);
                        const currentTableId = reservationForm.getValues("tableId");
                        if (currentTableId && areaId) {
                          const currentTable = tables.find(t => t.id === currentTableId);
                          if (currentTable && currentTable.areaId !== areaId) {
                            reservationForm.setValue("tableId", null);
                          }
                        }
                      }}
                      value={field.value || "__none__"}
                    >
                      <FormControl><SelectTrigger data-testid="select-reservation-area"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Sin especificar</SelectItem>
                        {areas.filter(a => a.isActive === "true").map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              )}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={reservationForm.control} name="reservationDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha *</FormLabel>
                    <FormControl><Input {...field} type="date" data-testid="input-reservation-date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={reservationForm.control} name="reservationTime" render={({ field }) => {
                  const selectedTblId = reservationForm.watch("tableId");
                  const selectedAreaId = reservationForm.watch("areaId");
                  const selectedTblAreaId = tables.find(t => t.id === selectedTblId)?.areaId;
                  const effectiveAreaId = selectedAreaId || selectedTblAreaId;
                  const visibleSlots = timeSlots.filter(s =>
                    s.isActive === "true" && (!s.areaId || !effectiveAreaId || s.areaId === effectiveAreaId)
                  );
                  return (
                    <FormItem>
                      <FormLabel>Hora *</FormLabel>
                      {visibleSlots.length > 0 ? (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger data-testid="select-reservation-time"><SelectValue placeholder="Seleccionar turno" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {visibleSlots.map((slot) => (
                              <SelectItem key={slot.id} value={slot.time}>{slot.time}{slot.label ? ` (${slot.label})` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <FormControl><Input {...field} type="time" data-testid="input-reservation-time" /></FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={reservationForm.control} name="tableId" render={({ field }) => {
                  const watchedAreaId = reservationForm.watch("areaId");
                  const watchedDate = reservationForm.watch("reservationDate");
                  const watchedTime = reservationForm.watch("reservationTime");
                  // Tables blocked by an existing reservation on same date+time
                  const reservedTableIds = new Set(
                    reservations
                      .filter(r =>
                        r.tableId &&
                        r.reservationDate === watchedDate &&
                        r.reservationTime === watchedTime &&
                        r.status !== "cancelled" && r.status !== "completed"
                      )
                      .map(r => r.tableId!)
                  );
                  // Tables blocked by an active order (only relevant for today)
                  const orderTableIds = new Set(
                    watchedDate === todayStr
                      ? activeOrders.filter(o => o.tableId).map(o => o.tableId!)
                      : []
                  );
                  const activeTables = tables.filter(t =>
                    t.isActive === "true" && (!watchedAreaId || t.areaId === watchedAreaId)
                  );
                  return (
                    <FormItem>
                      <FormLabel>Mesa <span className="text-muted-foreground text-xs">(opcional)</span></FormLabel>
                      <Select
                        onValueChange={(v) => {
                          const tableId = v === "__none__" ? null : v;
                          field.onChange(tableId);
                          if (tableId) {
                            const tbl = tables.find(t => t.id === tableId);
                            if (tbl?.areaId) reservationForm.setValue("areaId", tbl.areaId);
                          }
                        }}
                        value={field.value || "__none__"}
                      >
                        <FormControl><SelectTrigger data-testid="select-table"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Sin asignar</SelectItem>
                          {activeTables.map((t) => {
                            const isOccupied = reservedTableIds.has(t.id) || orderTableIds.has(t.id);
                            return (
                              <SelectItem key={t.id} value={t.id} disabled={isOccupied}>
                                Mesa {t.tableNumber} ({t.capacity}p){t.hasWindow === "true" ? " 🪟" : ""}{isOccupied ? " — Ocupada" : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }} />
                <FormField control={reservationForm.control} name="partySize" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personas *</FormLabel>
                    <FormControl><Input {...field} type="number" min={1} data-testid="input-party-size" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={reservationForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl><Textarea {...field} rows={2} placeholder="Preferencias, alergias, ocasión especial..." data-testid="input-reservation-notes" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {/* Tarjeta de garantía (opcional) */}
              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tarjeta de garantía (opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={reservationForm.control} name="cardLast4" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Últimos 4 dígitos</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} maxLength={4} placeholder="1234" data-testid="input-card-last4" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={reservationForm.control} name="cardHolder" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Titular</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} placeholder="Nombre en tarjeta" data-testid="input-card-holder" /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>
              <div className="pb-1" />
            </form>
          </Form>
          <DialogFooter className="shrink-0 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setIsReservationDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" form="reservation-form" disabled={createReservationMutation.isPending} data-testid="button-save-reservation">
              {createReservationMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar Reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Reservation Dialog */}
      <Dialog open={isEditReservationOpen} onOpenChange={setIsEditReservationOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Reserva</DialogTitle>
          </DialogHeader>
          {editingReservation && (
            <div className="space-y-4">
              {/* Seña info block */}
              {(() => {
                const advAmt = parseFloat((editingReservation as any).advanceAmount || "0");
                return advAmt > 0 ? (
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <div>
                        <span className="text-sm font-semibold text-green-800 dark:text-green-300">Seña registrada</span>
                        <span className="ml-2 text-sm font-bold text-green-700 dark:text-green-400">${advAmt.toLocaleString("es-AR")}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-400"
                      onClick={() => { setIsEditReservationOpen(false); setAdvanceDialogReservationId(editingReservation.id); setIsAdvanceDialogOpen(true); }}
                      data-testid="button-edit-view-advance">
                      Ver detalle
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-muted/40 border border-dashed rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CreditCard className="h-4 w-4" />
                      <span className="text-sm">Sin seña registrada</span>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => { setIsEditReservationOpen(false); setAdvanceDialogReservationId(editingReservation.id); setIsAdvanceDialogOpen(true); }}
                      data-testid="button-edit-add-advance">
                      <Plus className="h-3 w-3 mr-1" />Agregar seña
                    </Button>
                  </div>
                );
              })()}
              <div className="grid gap-2">
                <Label>Nombre *</Label>
                <Input value={editingReservation.guestName} onChange={(e) => setEditingReservation({...editingReservation, guestName: e.target.value})} data-testid="input-edit-guest-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Teléfono *</Label>
                  <Input value={editingReservation.guestPhone || ""} onChange={(e) => setEditingReservation({...editingReservation, guestPhone: e.target.value})} data-testid="input-edit-phone" />
                </div>
                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input type="email" value={editingReservation.guestEmail || ""} onChange={(e) => setEditingReservation({...editingReservation, guestEmail: e.target.value})} data-testid="input-edit-email" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Fecha</Label>
                  <Input type="date" value={editingReservation.reservationDate} onChange={(e) => setEditingReservation({...editingReservation, reservationDate: e.target.value})} data-testid="input-edit-date" />
                </div>
                <div className="grid gap-2">
                  <Label>Hora</Label>
                  {timeSlots.length > 0 ? (
                    <Select value={editingReservation.reservationTime} onValueChange={(v) => setEditingReservation({...editingReservation, reservationTime: v})}>
                      <SelectTrigger data-testid="select-edit-time"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {timeSlots.map((slot) => (
                          <SelectItem key={slot.id} value={slot.time}>{slot.time}{slot.label ? ` (${slot.label})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input type="time" value={editingReservation.reservationTime} onChange={(e) => setEditingReservation({...editingReservation, reservationTime: e.target.value})} data-testid="input-edit-time" />
                  )}
                </div>
              </div>
              {areas.filter(a => a.isActive === "true").length > 1 && (
                <div className="grid gap-2">
                  <Label>Salón <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                  <Select
                    value={(editingReservation as any).areaId || "__none__"}
                    onValueChange={(v) => {
                      const areaId = v === "__none__" ? null : v;
                      const currentTableId = editingReservation.tableId;
                      if (currentTableId && areaId) {
                        const currentTable = tables.find(t => t.id === currentTableId);
                        if (currentTable && currentTable.areaId !== areaId) {
                          setEditingReservation({...editingReservation, areaId, tableId: null} as any);
                          return;
                        }
                      }
                      setEditingReservation({...editingReservation, areaId} as any);
                    }}
                  >
                    <SelectTrigger data-testid="select-edit-area"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin especificar</SelectItem>
                      {areas.filter(a => a.isActive === "true").map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Mesa <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                  <Select
                    value={editingReservation.tableId || "__none__"}
                    onValueChange={(v) => {
                      const tableId = v === "__none__" ? null : v;
                      if (tableId) {
                        const tbl = tables.find(t => t.id === tableId);
                        setEditingReservation({...editingReservation, tableId, areaId: tbl?.areaId || (editingReservation as any).areaId || null} as any);
                      } else {
                        setEditingReservation({...editingReservation, tableId: null} as any);
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-edit-table"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin asignar</SelectItem>
                      {tables.filter(t => {
                        if (t.isActive !== "true") return false;
                        const editAreaId = (editingReservation as any).areaId;
                        return !editAreaId || t.areaId === editAreaId;
                      }).map((t) => (
                        <SelectItem key={t.id} value={t.id}>Mesa {t.tableNumber} ({t.capacity}p)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Personas</Label>
                  <Input type="number" min={1} value={editingReservation.partySize} onChange={(e) => setEditingReservation({...editingReservation, partySize: parseInt(e.target.value) || 1})} data-testid="input-edit-party-size" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notas</Label>
                <Textarea rows={2} value={editingReservation.notes || ""} onChange={(e) => setEditingReservation({...editingReservation, notes: e.target.value})} data-testid="input-edit-notes" />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setIsEditReservationOpen(false)}>Cancelar</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditReservationOpen(false);
                    setAdvanceDialogReservationId(editingReservation.id);
                    setIsAdvanceDialogOpen(true);
                  }}
                  data-testid="button-open-advance-from-edit"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Seña/Adelanto
                </Button>
                <Button onClick={() => {
                  updateReservationMutation.mutate({ id: editingReservation.id, data: {
                    guestName: editingReservation.guestName,
                    guestPhone: editingReservation.guestPhone,
                    guestEmail: editingReservation.guestEmail,
                    reservationDate: editingReservation.reservationDate,
                    reservationTime: editingReservation.reservationTime,
                    tableId: editingReservation.tableId,
                    areaId: (editingReservation as any).areaId || null,
                    partySize: editingReservation.partySize,
                    notes: editingReservation.notes,
                  }});
                  setIsEditReservationOpen(false);
                }} disabled={updateReservationMutation.isPending} data-testid="button-save-edit-reservation">
                  {updateReservationMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Guardar Cambios
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Advance Dialog — Seña / Anticipo */}
      <AdvanceDialog
        reservationId={advanceDialogReservationId}
        open={isAdvanceDialogOpen}
        onOpenChange={(v) => { setIsAdvanceDialogOpen(v); if (!v) { setAdvanceDialogReservationId(null); setAdvanceAmount(""); setAdvanceNotes(""); setAdvancePaymentMethod("efectivo"); } }}
        reservations={reservations}
        advanceAmount={advanceAmount}
        setAdvanceAmount={setAdvanceAmount}
        advancePaymentMethod={advancePaymentMethod}
        setAdvancePaymentMethod={setAdvancePaymentMethod}
        advanceNotes={advanceNotes}
        setAdvanceNotes={setAdvanceNotes}
        createAdvanceMutation={createAdvanceMutation}
        deleteAdvanceMutation={deleteAdvanceMutation}
        posConfigsData={posConfigsData}
        restaurantGuests={restaurantGuests}
      />

      {/* Confirm Cancel Reservation AlertDialog */}
      <AlertDialog open={!!confirmCancelReservationId} onOpenChange={(open) => { if (!open) setConfirmCancelReservationId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar reserva?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción cambiará el estado de la reserva a <strong>Cancelada</strong>. No se puede deshacer desde la lista.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmCancelReservationId(null)}>Volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (confirmCancelReservationId) {
                  updateReservationMutation.mutate({ id: confirmCancelReservationId, data: { status: "cancelled" } });
                  setConfirmCancelReservationId(null);
                }
              }}
            >
              Sí, cancelar reserva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Table Dialog */}
      <Dialog open={isAssignTableDialogOpen} onOpenChange={setIsAssignTableDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Asignar Mesa</DialogTitle>
            <DialogDescription>
              {assignTableReservation && `Reserva: ${assignTableReservation.guestName} — ${assignTableReservation.partySize} personas`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2 max-h-64 overflow-y-auto">
            {tables.filter(t => t.isActive === "true").sort((a,b) => a.tableNumber.localeCompare(b.tableNumber, undefined, {numeric: true})).map((t) => {
              const hasOrder = orders.some(o => o.tableId === t.id && ["open","in_progress","served"].includes(o.status));
              const isAlreadyAssigned = assignTableReservation?.tableId === t.id;
              return (
                <button
                  key={t.id}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors flex items-center justify-between ${isAlreadyAssigned ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 cursor-default" : hasOrder ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 cursor-pointer" : "hover:bg-accent cursor-pointer"}`}
                  onClick={() => {
                    if (!assignTableReservation || isAlreadyAssigned) return;
                    updateReservationMutation.mutate({ id: assignTableReservation.id, data: { tableId: t.id } });
                    setIsAssignTableDialogOpen(false);
                    setAssignTableReservation(null);
                  }}
                  data-testid={`button-assign-table-option-${t.id}`}
                >
                  <span className="font-medium">Mesa {t.tableNumber}</span>
                  <span className={`text-xs ${hasOrder ? "text-amber-600 dark:text-amber-400" : isAlreadyAssigned ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                    {t.capacity} pers.
                    {isAlreadyAssigned ? " — Ya asignada" : hasOrder ? " — Ocupada (asignable)" : " — Libre"}
                  </span>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignTableDialogOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Daily Reservations Dialog */}
      <Dialog open={isDailyReservationsOpen} onOpenChange={setIsDailyReservationsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reservas de Restaurant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Mode selector + date filter */}
            <div className="flex gap-2 items-center flex-wrap">
              <Button size="sm" variant={reservationViewMode === "day" ? "default" : "outline"} onClick={() => setReservationViewMode("day")}>
                Por día
              </Button>
              <Button size="sm" variant={reservationViewMode === "all" ? "default" : "outline"} onClick={() => setReservationViewMode("all")}>
                Próximas
              </Button>
              <Button size="sm" variant={reservationViewMode === "past" ? "default" : "outline"} onClick={() => setReservationViewMode("past")}>
                Pasadas
              </Button>
              {reservationViewMode === "day" && (
                <Input
                  type="date"
                  value={reservationDateFilter}
                  onChange={(e) => setReservationDateFilter(e.target.value)}
                  className="h-8 w-40"
                />
              )}
            </div>
            <Input
              placeholder="Buscar por nombre, teléfono o email..."
              value={reservationSearchText}
              onChange={(e) => setReservationSearchText(e.target.value)}
            />
            {(() => {
              const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
              const filteredRes = reservations.filter(r => {
                if (r.status === "cancelled") return false;
                if (reservationViewMode === "day" && r.reservationDate !== reservationDateFilter) return false;
                if (reservationViewMode === "all" && r.reservationDate < todayStr) return false;
                if (reservationViewMode === "past" && r.reservationDate >= todayStr) return false;
                if (reservationSearchText) {
                  const q = reservationSearchText.toLowerCase();
                  return (
                    r.guestName.toLowerCase().includes(q) ||
                    (r.guestPhone || "").includes(q) ||
                    (r.guestEmail || "").toLowerCase().includes(q) ||
                    r.reservationDate.includes(q)
                  );
                }
                return true;
              }).sort((a, b) => {
                if (reservationViewMode === "all") return a.reservationDate.localeCompare(b.reservationDate) || a.reservationTime.localeCompare(b.reservationTime);
                if (reservationViewMode === "past") return b.reservationDate.localeCompare(a.reservationDate) || b.reservationTime.localeCompare(a.reservationTime);
                return a.reservationTime.localeCompare(b.reservationTime);
              });

              if (filteredRes.length === 0) {
                return (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay reservas para este filtro</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredRes.map((reservation) => {
                    const table = tables.find(t => t.id === reservation.tableId);
                    return (
                      <div
                        key={reservation.id}
                        className="flex items-center justify-between p-3 border rounded-md gap-4"
                        data-testid={`daily-reservation-${reservation.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <div className="text-lg font-bold">{reservation.reservationTime}</div>
                            {reservationViewMode === "all" && (
                              <div className="text-xs text-muted-foreground">{new Date(reservation.reservationDate + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</div>
                            )}
                          </div>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {reservation.guestName}
                              {parseFloat((reservation as any).advanceAmount || "0") > 0 && (
                                <Badge variant="outline" className="text-xs text-green-700 border-green-400">
                                  Seña ${parseFloat((reservation as any).advanceAmount).toLocaleString("es-AR")}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Mesa {table?.tableNumber || "?"} — {reservation.partySize} personas
                              {table?.hasWindow === "true" && " (Ventana)"}
                            </div>
                          </div>
                        </div>
                        {(() => {
                          const todayStr2 = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
                          const isPast = reservation.reservationDate < todayStr2;
                          const isFinished = isPast && (reservation.status === "confirmed" || reservation.status === "pending");
                          return (
                            <div className="flex items-center gap-2">
                              <Badge className={isFinished ? "bg-gray-400/20 text-gray-600 dark:text-gray-400" : reservationStatusColors[reservation.status]}>
                                {isFinished ? "Finalizada" : reservationStatusLabels[reservation.status]}
                              </Badge>
                              {reservation.status === "pending" && !isPast && (
                                <Button size="sm" onClick={() => updateReservationMutation.mutate({ id: reservation.id, data: { status: "confirmed" } })}>
                                  <Check className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsDailyReservationsOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Table Dialog */}
      <Dialog open={isAddTableDialogOpen} onOpenChange={setIsAddTableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Mesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Numero de Mesa *</Label>
                <Input
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(e.target.value)}
                  placeholder="Ej: 1, 2, A1"
                  data-testid="input-new-table-number"
                />
              </div>
              <div className="space-y-2">
                <Label>Capacidad</Label>
                <Input
                  type="number"
                  min={1}
                  value={newTableCapacity}
                  onChange={(e) => setNewTableCapacity(parseInt(e.target.value) || 1)}
                  data-testid="input-new-table-capacity"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Forma</Label>
                <Select value={newTableShape} onValueChange={setNewTableShape}>
                  <SelectTrigger data-testid="select-new-table-shape">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="square">Cuadrada</SelectItem>
                    <SelectItem value="round">Redonda</SelectItem>
                    <SelectItem value="rectangular">Rectangular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Area</Label>
                <Select value={newTableArea} onValueChange={setNewTableArea}>
                  <SelectTrigger data-testid="select-new-table-area">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-md">
              <Switch
                checked={newTableWindow}
                onCheckedChange={setNewTableWindow}
                data-testid="switch-new-table-window"
              />
              <div>
                <Label className="cursor-pointer">Mesa con ventana</Label>
                <p className="text-xs text-muted-foreground">Visible al hacer reservas</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddTableDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!newTableNumber || !newTableArea) return;
                const areaTbls = tables.filter(t => t.areaId === newTableArea);
                let px = 0, py = 0;
                if (areaTbls.length > 0) {
                  const maxX = Math.max(...areaTbls.map(t => t.positionX));
                  px = maxX + 1;
                  if (px >= 8) {
                    px = 0;
                    py = Math.max(...areaTbls.map(t => t.positionY)) + 1;
                  }
                }
                createTableMutation.mutate({
                  tableNumber: newTableNumber,
                  areaId: newTableArea,
                  capacity: newTableCapacity,
                  shape: newTableShape,
                  hasWindow: newTableWindow ? "true" : "false",
                  positionX: px,
                  positionY: py,
                });
              }}
              disabled={createTableMutation.isPending}
              data-testid="button-save-table"
            >
              {createTableMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Mesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Table Dialog */}
      <Dialog open={isEditTableDialogOpen} onOpenChange={setIsEditTableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Mesa {editingTable?.tableNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Capacidad</Label>
                <Input
                  type="number"
                  min={1}
                  value={editTableCapacity}
                  onChange={(e) => setEditTableCapacity(parseInt(e.target.value) || 1)}
                  data-testid="input-edit-table-capacity"
                />
              </div>
              <div className="space-y-2">
                <Label>Forma</Label>
                <Select value={editTableShape} onValueChange={setEditTableShape}>
                  <SelectTrigger data-testid="select-edit-table-shape">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="square">Cuadrada</SelectItem>
                    <SelectItem value="round">Redonda</SelectItem>
                    <SelectItem value="rectangular">Rectangular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-md">
              <Switch
                checked={editTableWindow}
                onCheckedChange={setEditTableWindow}
                data-testid="switch-edit-table-window"
              />
              <div>
                <Label className="cursor-pointer">Mesa con ventana</Label>
                <p className="text-xs text-muted-foreground">Visible al hacer reservas</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditTableDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!editingTable) return;
                updateTableMutation.mutate({
                  id: editingTable.id,
                  data: {
                    capacity: editTableCapacity,
                    shape: editTableShape,
                    hasWindow: editTableWindow ? "true" : "false",
                  },
                });
                setIsEditTableDialogOpen(false);
                toast({ title: "Mesa actualizada" });
              }}
              disabled={updateTableMutation.isPending}
              data-testid="button-save-edit-table"
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Menu Item Dialog (Create/Edit) */}
      <Dialog open={isMenuItemDialogOpen} onOpenChange={setIsMenuItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMenuItem ? "Editar Plato" : "Nuevo Plato"}</DialogTitle>
          </DialogHeader>
          <Form {...menuItemForm}>
            <form
              onSubmit={menuItemForm.handleSubmit((data) => {
                if (editingMenuItem) {
                  updateMenuItemMutation.mutate({ id: editingMenuItem.id, data });
                } else {
                  createMenuItemMutation.mutate(data);
                }
              })}
              className="space-y-4"
            >
              <FormField
                control={menuItemForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nombre del plato" data-testid="input-menu-item-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={menuItemForm.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-menu-item-category">
                          <SelectValue placeholder="Seleccionar categoria" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sortedCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={menuItemForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripcion</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Descripcion del plato" data-testid="input-menu-item-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={menuItemForm.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio <span className="text-xs font-normal text-muted-foreground">(con IVA incluido)</span></FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" min={0} data-testid="input-menu-item-price" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={menuItemForm.control}
                  name="preparationTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tiempo prep. (min)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0} data-testid="input-menu-item-prep-time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={menuItemForm.control}
                name="defaultCourse"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Curso predeterminado <span className="text-xs font-normal text-muted-foreground">(se asigna automáticamente al agregar el plato al pedido)</span></FormLabel>
                    <div className="flex gap-2">
                      {[
                        { value: 1, label: "1° Entradas" },
                        { value: 2, label: "2° Principal" },
                        { value: 3, label: "3° Postres" },
                      ].map(({ value, label }) => (
                        <Button
                          key={value}
                          type="button"
                          variant={field.value === value ? "default" : "outline"}
                          size="sm"
                          onClick={() => field.onChange(value)}
                          data-testid={`button-default-course-${value}`}
                        >
                          {label}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant={!field.value ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => field.onChange(undefined)}
                        data-testid="button-default-course-none"
                      >
                        Sin curso
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Usar "Sin curso" para bebidas o ítems que no tienen curso fijo.</p>
                  </FormItem>
                )}
              />
              <div className="flex gap-4">
                <FormField
                  control={menuItemForm.control}
                  name="isAvailable"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 p-3 border rounded-md flex-1">
                      <FormControl>
                        <Switch
                          checked={field.value === "true"}
                          onCheckedChange={(checked) => field.onChange(checked ? "true" : "false")}
                          data-testid="switch-menu-item-available"
                        />
                      </FormControl>
                      <FormLabel className="cursor-pointer !mt-0">Disponible</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={menuItemForm.control}
                  name="isEditable"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 p-3 border rounded-md flex-1">
                      <FormControl>
                        <Switch
                          checked={field.value === "true"}
                          onCheckedChange={(checked) => field.onChange(checked ? "true" : "false")}
                          data-testid="switch-menu-item-editable"
                        />
                      </FormControl>
                      <FormLabel className="cursor-pointer !mt-0">Fuera de menú</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsMenuItemDialogOpen(false)}>Cancelar</Button>
                <Button
                  type="submit"
                  disabled={createMenuItemMutation.isPending || updateMenuItemMutation.isPending}
                  data-testid="button-save-menu-item"
                >
                  {(createMenuItemMutation.isPending || updateMenuItemMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingMenuItem ? "Actualizar" : "Crear Plato"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Category Dialog (Create/Edit) */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Editar Categoria" : "Nueva Categoria"}</DialogTitle>
          </DialogHeader>
          <Form {...categoryForm}>
            <form
              onSubmit={categoryForm.handleSubmit((data) => {
                if (editingCategory) {
                  updateCategoryMutation.mutate({ id: editingCategory.id, data });
                } else {
                  createCategoryMutation.mutate(data);
                }
              })}
              className="space-y-4"
            >
              <FormField
                control={categoryForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ej: Bebidas con alcohol, Entradas, etc." data-testid="input-category-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripcion</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Descripcion de la categoria" data-testid="input-category-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={categoryForm.control}
                name="displayOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orden de Visualizacion</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} data-testid="input-category-order" />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">Orden sugerido: 1) Bebidas 2) Entradas 3) Principales 4) Postres</p>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancelar</Button>
                <Button
                  type="submit"
                  disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}
                  data-testid="button-save-category"
                >
                  {(createCategoryMutation.isPending || updateCategoryMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingCategory ? "Actualizar" : "Crear Categoria"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Time Slots Configuration Dialog */}
      <Dialog open={isTimeSlotsDialogOpen} onOpenChange={setIsTimeSlotsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Configurar Turnos de Reserva
            </DialogTitle>
            <DialogDescription>
              Define los horarios disponibles para reservas
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="time"
                value={newTimeSlot}
                onChange={(e) => setNewTimeSlot(e.target.value)}
                className="w-32"
                data-testid="input-new-time-slot"
              />
              <Select value={newTimeSlotArea} onValueChange={setNewTimeSlotArea}>
                <SelectTrigger className="w-40" data-testid="select-new-time-slot-area">
                  <SelectValue placeholder="Todos los salones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Todos los salones</SelectItem>
                  {areas.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => {
                  if (newTimeSlot) createTimeSlotMutation.mutate({
                    time: newTimeSlot,
                    areaId: newTimeSlotArea === "__none__" ? null : newTimeSlotArea,
                  });
                }}
                disabled={!newTimeSlot || createTimeSlotMutation.isPending}
                data-testid="button-add-time-slot"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </div>
            {timeSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin turnos configurados. Las reservas usaran horario libre.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {timeSlots.map((slot) => (
                  <Badge key={slot.id} variant="secondary" className="gap-1 text-sm py-1.5 px-3">
                    {slot.time}
                    <button
                      onClick={() => deleteTimeSlotMutation.mutate(slot.id)}
                      className="ml-1 hover:text-destructive"
                      data-testid={`button-delete-slot-${slot.id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsTimeSlotsDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
