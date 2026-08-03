import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, ReceiptText, RefreshCw, Search,
  TrendingDown, TrendingUp, Wallet, BarChart3,
  Hotel, Utensils, Sparkles, Users, CalendarDays, Building2,
  ChevronLeft, ChevronRight, ArrowUpCircle, ArrowDownCircle,
  ChevronsUpDown, FileX, Landmark, Clock, Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FolioViewer from "@/components/FolioViewer";

// ─── Transfer description link helper ────────────────────────────────────────

function TransferDescriptionCell({ description, type }: { description: string; type: string }) {
  const isOut = type === "transfer_out";
  const clean = description
    .replace(/\s*\[xfer:[^\]]+\]/g, "")
    .replace(/\s*\[corr:[^\]]+\]/g, "")
    .replace(/\s*\[rev:[^\]]+\]/g, "")
    .replace(/\s*\[res:[^\]]+\]/g, "")
    .trim();
  const resMatch = description.match(/\[res:([^\]]+)\]/);
  const pairedResId = resMatch ? resMatch[1] : null;
  if (!pairedResId) return <p className="text-sm font-medium truncate max-w-[220px]">{clean}</p>;
  const roomMatch = clean.match(/(.*?)(Hab\.\S+)(.*)/);
  if (!roomMatch) return <p className="text-sm font-medium truncate max-w-[220px]">{clean}</p>;
  const [, before, roomPart, after] = roomMatch;
  return (
    <p className="text-sm font-medium max-w-[220px]">
      {before}
      <a
        href={`/reservations?view=${pairedResId}`}
        onClick={e => e.stopPropagation()}
        className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
        style={{ color: isOut ? "#c2410c" : "#1d4ed8" }}
        title="Ver folio de la reserva relacionada"
        target="_blank"
        rel="noreferrer"
      >
        {roomPart}
      </a>
      {after}
    </p>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Folio {
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
}

interface FolioStats {
  openFolios: number;
  closedFolios: number;
  totalBalance: number;
  totalCharges: number;
  totalPayments: number;
}

interface EntityTypeBreakdown {
  entity_type: string;
  total_folios: string;
  open_folios: string;
  pending_balance: string;
  total_charges: string;
  total_payments: string;
}

interface DailyMovement {
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
  folioCodigo: string;
  entityType: string;
  entityId: string;
}

interface DailyMovementsResponse {
  date: string;
  movements: DailyMovement[];
  totals: { charges: number; payments: number; discounts: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_TYPE_ICONS: Record<string, any> = {
  reservation: Hotel,
  restaurant_order: Utensils,
  spa_account: Sparkles,
  group: Users,
  event: CalendarDays,
  company: Building2,
  agency: Building2,
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  reservation: "Reserva",
  restaurant_order: "Restaurant",
  spa_account: "SPA",
  group: "Grupo",
  event: "Evento",
  company: "Empresa",
  agency: "Agencia",
};

const ENTITY_TYPE_COLORS: Record<string, string> = {
  reservation: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  restaurant_order: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  spa_account: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  group: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  event: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  company: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  agency: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  open: { label: "Abierto", variant: "secondary" },
  closed: { label: "Cerrado", variant: "outline" },
  invoiced: { label: "Facturado", variant: "default" },
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  charge: "Cargo",
  payment: "Pago",
  advance: "Anticipo",
  discount: "Descuento",
  adjustment: "Ajuste",
  transfer_in: "Transfer. entrada",
  transfer_out: "Transfer. salida",
  void: "Anulación",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo", cash: "Efectivo",
  tarjeta_debito: "Débito", debit_card: "Débito",
  tarjeta_credito: "Crédito", credit_card: "Crédito",
  transferencia: "Transferencia", transfer: "Transferencia",
  mercadopago: "MercadoPago",
  cuenta_corriente: "Cta. Cte.", current_account: "Cta. Cte.",
  room_charge: "Cargo hab.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number | string) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(n));
}

function formatDateFull(iso: string) {
  try { return format(new Date(iso), "dd/MM/yy HH:mm", { locale: es }); }
  catch { return iso; }
}

function formatTime(iso: string) {
  try { return format(new Date(iso), "HH:mm", { locale: es }); }
  catch { return ""; }
}

function getArgentinaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

function movementIcon(type: string) {
  switch (type) {
    case "charge":       return <ArrowUpCircle className="h-4 w-4 text-red-500" />;
    case "payment":
    case "advance":      return <ArrowDownCircle className="h-4 w-4 text-green-600" />;
    case "discount":     return <ChevronsUpDown className="h-4 w-4 text-blue-500" />;
    case "void":         return <FileX className="h-4 w-4 text-orange-500" />;
    case "transfer_in":
    case "transfer_out": return <Landmark className="h-4 w-4 text-purple-500" />;
    default:             return <ReceiptText className="h-4 w-4 text-muted-foreground" />;
  }
}

function isDebitType(type: string) {
  return ["charge", "transfer_in"].includes(type);
}

// ─── Movimientos del Día ──────────────────────────────────────────────────────

function MovimientosDiaTab({
  selectedFolio,
  onSelectFolio,
}: {
  selectedFolio: { entityType: string; entityId: string; codigo: string } | null;
  onSelectFolio: (f: { entityType: string; entityId: string; codigo: string } | null) => void;
}) {
  const today = getArgentinaToday();
  const [date, setDate] = useState(today);
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery<DailyMovementsResponse>({
    queryKey: ["/api/folios/movements/by-date", date, entityTypeFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ date });
      if (entityTypeFilter !== "all") params.set("entityType", entityTypeFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`/api/folios/movements/by-date?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const movements = (data?.movements ?? []).filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.description.toLowerCase().includes(q) ||
      m.folioCodigo.toLowerCase().includes(q) ||
      ENTITY_TYPE_LABELS[m.entityType]?.toLowerCase().includes(q) ||
      (m.registeredBy ?? "").toLowerCase().includes(q)
    );
  });

  const totals = data?.totals ?? { charges: 0, payments: 0, discounts: 0 };
  const neto = totals.payments - totals.charges + totals.discounts;

  const isToday = date === today;

  return (
    <div className="space-y-4">
      {/* Date navigation */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 border rounded-lg overflow-hidden">
          <Button
            variant="ghost" size="icon" className="h-9 w-9 rounded-none"
            onClick={() => setDate(d => addDays(d, -1))}
            data-testid="button-prev-day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={date}
              max={today}
              onChange={e => setDate(e.target.value)}
              className="text-sm font-medium bg-transparent border-0 outline-none cursor-pointer"
              data-testid="input-date-filter"
            />
          </div>
          <Button
            variant="ghost" size="icon" className="h-9 w-9 rounded-none"
            onClick={() => setDate(d => addDays(d, 1))}
            disabled={date >= today}
            data-testid="button-next-day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {!isToday && (
          <Button variant="outline" size="sm" onClick={() => setDate(today)} data-testid="button-today">
            Hoy
          </Button>
        )}

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 w-40 text-sm"
              data-testid="input-search-movements"
            />
          </div>
          <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
            <SelectTrigger className="h-9 w-36 text-sm" data-testid="select-module-filter">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Módulo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los módulos</SelectItem>
              {Object.entries(ENTITY_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-32 text-sm" data-testid="select-type-filter">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Cargos y pagos</SelectItem>
              <SelectItem value="charge">Cargos</SelectItem>
              <SelectItem value="payment">Pagos</SelectItem>
              <SelectItem value="advance">Anticipos</SelectItem>
              <SelectItem value="discount">Descuentos</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()} data-testid="button-refresh-movements">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-red-200 dark:border-red-900/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs text-muted-foreground">Total cargado</span>
            </div>
            <p className="text-lg font-bold text-red-600">{formatCurrency(totals.charges)}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-900/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">Total cobrado</span>
            </div>
            <p className="text-lg font-bold text-green-600">{formatCurrency(totals.payments)}</p>
          </CardContent>
        </Card>
        <Card className={neto >= 0 ? "border-orange-200 dark:border-orange-900/50" : "border-blue-200 dark:border-blue-900/50"}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-xs text-muted-foreground">Saldo del día</span>
            </div>
            <p className={`text-lg font-bold ${neto > 0 ? "text-orange-600" : neto < 0 ? "text-blue-600" : "text-muted-foreground"}`}>
              {formatCurrency(Math.abs(neto))}
              <span className="text-xs font-normal ml-1">{neto > 0 ? "pendiente" : neto < 0 ? "a favor" : ""}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Content: list + detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Movement list */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : movements.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground border rounded-lg">
              <ReceiptText className="mx-auto mb-2 h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">Sin movimientos para esta fecha</p>
              <p className="text-xs mt-1">Los movimientos aparecen a medida que se registran cargos y pagos en todos los módulos.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-16">Hora</TableHead>
                    <TableHead className="w-28">Módulo</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-24">Folio</TableHead>
                    <TableHead className="w-20">Método</TableHead>
                    <TableHead className="text-right w-28">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map(mov => {
                    const debit = isDebitType(mov.type);
                    const EntityIcon = ENTITY_TYPE_ICONS[mov.entityType] ?? ReceiptText;
                    const isSelected = selectedFolio?.entityId === mov.entityId && selectedFolio?.entityType === mov.entityType;
                    const isNotaDebito = mov.sourceType === "nota_debito" || (mov.receiptType?.startsWith("ND") ?? false);
                    return (
                      <TableRow
                        key={mov.id}
                        className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5 border-l-4 border-l-primary" : isNotaDebito ? "bg-amber-50/60 hover:bg-amber-100/60 dark:bg-amber-950/10 dark:hover:bg-amber-950/20" : "hover:bg-muted/40"}`}
                        onClick={() => onSelectFolio(isSelected ? null : { entityType: mov.entityType, entityId: mov.entityId, codigo: mov.folioCodigo })}
                        data-testid={`row-movement-${mov.id}`}
                      >
                        <TableCell className="font-mono text-sm text-muted-foreground py-2.5">
                          {formatTime(mov.createdAt)}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${ENTITY_TYPE_COLORS[mov.entityType] ?? "bg-muted text-muted-foreground"}`}>
                            <EntityIcon className="h-3 w-3" />
                            {ENTITY_TYPE_LABELS[mov.entityType] ?? mov.entityType}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-2">
                            {movementIcon(mov.type)}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {(mov.type === "transfer_in" || mov.type === "transfer_out")
                                  ? <TransferDescriptionCell description={mov.description} type={mov.type} />
                                  : <p className="text-sm font-medium truncate max-w-[220px]">{mov.description}</p>
                                }
                                {isNotaDebito && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 h-4 font-semibold shrink-0 bg-amber-50 text-amber-700 border-amber-400 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-700"
                                  >
                                    {mov.receiptType ?? "ND"}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {isNotaDebito ? "Nota de Débito" : (MOVEMENT_TYPE_LABELS[mov.type] ?? mov.type)}
                                {mov.registeredBy && ` · ${mov.registeredBy}`}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className="font-mono text-xs text-muted-foreground">{mov.folioCodigo}</span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          {mov.paymentMethod ? (
                            <span className="text-xs text-muted-foreground">
                              {PAYMENT_METHOD_LABELS[mov.paymentMethod] ?? mov.paymentMethod}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right py-2.5">
                          <span className={`text-sm font-bold ${debit ? "text-red-600" : "text-green-600"}`}>
                            {debit ? "+" : "-"}{formatCurrency(mov.amount)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="px-4 py-2 bg-muted/30 border-t flex items-center justify-between text-xs text-muted-foreground">
                <span>{movements.length} movimiento{movements.length !== 1 ? "s" : ""}</span>
                <span>
                  {movements.filter(m => isDebitType(m.type)).length} cargo{movements.filter(m => isDebitType(m.type)).length !== 1 ? "s" : ""}
                  {" · "}
                  {movements.filter(m => ["payment","advance"].includes(m.type)).length} pago{movements.filter(m => ["payment","advance"].includes(m.type)).length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-1">
          {selectedFolio ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ReceiptText className="h-4 w-4" />
                  Detalle — {selectedFolio.codigo}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FolioViewer entityType={selectedFolio.entityType} entityId={selectedFolio.entityId} allowVoid />
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <ReceiptText className="mx-auto mb-2 h-8 w-8 opacity-30" />
                <p className="text-sm">Hacé clic en un movimiento para ver el folio completo</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminFoliosPage() {
  const [search, setSearch] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedFolio, setSelectedFolio] = useState<{ entityType: string; entityId: string; codigo: string } | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<FolioStats>({
    queryKey: ["/api/folios/stats/summary"],
    queryFn: async () => {
      const res = await fetch("/api/folios/stats/summary", { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const { data: breakdown = [] } = useQuery<EntityTypeBreakdown[]>({
    queryKey: ["/api/folios/stats/by-entity-type"],
    queryFn: async () => {
      const res = await fetch("/api/folios/stats/by-entity-type", { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const { data: folios = [], isLoading: foliosLoading, refetch } = useQuery<Folio[]>({
    queryKey: ["/api/folios", entityTypeFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityTypeFilter !== "all") params.set("entityType", entityTypeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/folios?${params}`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
  });

  const filtered = folios.filter(f => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.codigo.toLowerCase().includes(q) ||
      f.entityId.toLowerCase().includes(q) ||
      ENTITY_TYPE_LABELS[f.entityType]?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/administration">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Administración
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Motor Financiero — Folios</h1>
          <p className="text-muted-foreground text-sm">Vista consolidada de todos los folios del sistema</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))
        ) : stats ? (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ReceiptText className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Folios Abiertos</span>
                </div>
                <p className="text-2xl font-bold">{stats.openFolios}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-muted-foreground">Total Cargado</span>
                </div>
                <p className="text-xl font-bold text-red-600">{formatCurrency(stats.totalCharges)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-muted-foreground">Total Cobrado</span>
                </div>
                <p className="text-xl font-bold text-green-600">{formatCurrency(stats.totalPayments)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="h-4 w-4 text-orange-500" />
                  <span className="text-xs text-muted-foreground">Saldo Pendiente</span>
                </div>
                <p className={`text-xl font-bold ${stats.totalBalance > 0 ? "text-orange-600" : "text-blue-600"}`}>
                  {formatCurrency(stats.totalBalance)}
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Saldos pendientes por módulo */}
      {breakdown.length > 0 && breakdown.some(b => Number(b.pending_balance) > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-orange-500" />
              Saldos Pendientes por Módulo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {breakdown
                .filter(b => Number(b.pending_balance) > 0)
                .map(b => {
                  const Icon = ENTITY_TYPE_ICONS[b.entity_type] ?? ReceiptText;
                  const total = breakdown.reduce((sum, x) => sum + Number(x.pending_balance), 0);
                  const pct = total > 0 ? (Number(b.pending_balance) / total) * 100 : 0;
                  return (
                    <div key={b.entity_type} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{ENTITY_TYPE_LABELS[b.entity_type] ?? b.entity_type}</span>
                          <span className="text-sm font-bold text-orange-600">{formatCurrency(b.pending_balance)}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                        {Number(b.open_folios)} ab.
                      </span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="movimientos">
        <TabsList>
          <TabsTrigger value="movimientos" data-testid="tab-movimientos-dia">
            <Clock className="mr-2 h-4 w-4" />
            Movimientos del Día
          </TabsTrigger>
          <TabsTrigger value="folios" data-testid="tab-folios">
            <ReceiptText className="mr-2 h-4 w-4" />
            Todos los Folios
          </TabsTrigger>
        </TabsList>

        {/* ── Movimientos del Día ── */}
        <TabsContent value="movimientos" className="mt-4">
          <MovimientosDiaTab
            selectedFolio={selectedFolio}
            onSelectFolio={setSelectedFolio}
          />
        </TabsContent>

        {/* ── Lista de Folios ── */}
        <TabsContent value="folios" className="mt-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por código, ID..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-folios"
                  />
                </div>
                <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                  <SelectTrigger className="w-40" data-testid="select-entity-type">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    {Object.entries(ENTITY_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36" data-testid="select-status">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="open">Abierto</SelectItem>
                    <SelectItem value="closed">Cerrado</SelectItem>
                    <SelectItem value="invoiced">Facturado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {foliosLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <ReceiptText className="mx-auto mb-2 h-10 w-10 opacity-30" />
                  <p className="text-sm">No hay folios registrados aún.</p>
                  <p className="text-xs mt-1">Los folios se crean automáticamente al registrar cargos o pagos.</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Código</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Cargos</TableHead>
                        <TableHead className="text-right">Cobrado</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead>Apertura</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(folio => {
                        const balance = Number(folio.balance);
                        const isSelected = selectedFolio?.entityId === folio.entityId && selectedFolio?.entityType === folio.entityType;
                        return (
                          <TableRow
                            key={folio.id}
                            className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50"}`}
                            onClick={() => setSelectedFolio(isSelected ? null : { entityType: folio.entityType, entityId: folio.entityId, codigo: folio.codigo })}
                            data-testid={`row-folio-${folio.id}`}
                          >
                            <TableCell>
                              <span className="font-mono text-sm font-medium">{folio.codigo}</span>
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ENTITY_TYPE_COLORS[folio.entityType] ?? "bg-muted text-muted-foreground"}`}>
                                {ENTITY_TYPE_LABELS[folio.entityType] ?? folio.entityType}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={STATUS_LABELS[folio.status]?.variant ?? "outline"}>
                                {STATUS_LABELS[folio.status]?.label ?? folio.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm text-red-600">{formatCurrency(folio.totalCharges)}</TableCell>
                            <TableCell className="text-right text-sm text-green-600">{formatCurrency(folio.totalPayments)}</TableCell>
                            <TableCell className="text-right">
                              <span className={`font-bold text-sm ${balance > 0 ? "text-orange-600" : balance < 0 ? "text-blue-600" : "text-muted-foreground"}`}>
                                {formatCurrency(balance)}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDateFull(folio.openedAt)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Detail panel */}
            <div className="lg:col-span-1">
              {selectedFolio ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <ReceiptText className="h-4 w-4" />
                      Detalle del Folio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FolioViewer entityType={selectedFolio.entityType} entityId={selectedFolio.entityId} allowVoid />
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <ReceiptText className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    <p className="text-sm">Seleccioná un folio para ver el detalle</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
