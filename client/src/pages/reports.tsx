import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  BarChart,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Line,
  Bar,
  Pie,
  Cell,
} from "recharts";
import {
  Download,
  Printer,
  BarChart3,
  TrendingUp,
  Hotel,
  CreditCard,
  Users,
  Brush,
  UtensilsCrossed,
  Globe,
  LogIn,
  LogOut,
  AlertCircle,
  Sparkles,
  PartyPopper,
  Wrench,
  Package,
  ShoppingCart,
} from "lucide-react";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
];

function formatARS(value: number): string {
  return (
    "$ " +
    value
      .toFixed(2)
      .replace(".", ",")
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  );
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPresetDates(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = formatDate(now);
  let from: string;
  switch (preset) {
    case "today":
      from = to;
      break;
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = formatDate(d);
      break;
    }
    case "month": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      from = formatDate(d);
      break;
    }
    case "year": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      from = formatDate(d);
      break;
    }
    default:
      from = to;
  }
  return { from, to };
}

function exportCSV(headers: string[], rows: string[][], filename: string) {
  const csvContent = [
    headers.join(","),
    ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${formatDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

type OccupancyRow = { date: string; available: number; occupied: number; occupancy: number; totalRooms: number };
type RevenueByTypeRow = { type: string; rooms: number; nightsSold: number; revenue: number; adr: number; percentage: number };
type ChannelRow = { source: string; reservations: number; nights: number; revenue: number; commission: number; net: number; percentage: number };
type ReservationRow = { code: string; guest: string; company: string; room: string; type: string; checkIn: string; checkOut: string; nights: number; source: string; status: string; total: number; paid: number; balance: number };
type PaymentMethod = { method: string; count: number; total: number; percentage: number };
type PaymentsData = { byMethod: PaymentMethod[]; grandTotal: number };
type TopGuestRow = { rank: number; guest: string; code: string; stays: number; nights: number; revenue: number; lastVisit: string; segment: string };
type HousekeepingData = { daily: { date: string; completed: number; pending: number; urgent: number }[]; byType: { type: string; count: number }[]; totalCompleted: number; totalPending: number };
type RestaurantData = { totalOrders: number; totalRevenue: number; totalCovers: number; avgTicket: number; topItems: { name: string; count: number; revenue: number }[]; byArea: { name: string; orders: number; revenue: number; covers: number }[] };

export default function ReportsPage() {
  const defaults = getPresetDates("month");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  // "applied" state — lo que realmente usan las queries.
  // Los presets lo actualizan al instante; el input manual requiere "Aplicar".
  const [appliedFrom, setAppliedFrom] = useState(defaults.from);
  const [appliedTo, setAppliedTo] = useState(defaults.to);
  const [activeTab, setActiveTab] = useState("occupancy");
  const [statusFilter, setStatusFilter] = useState("all");

  function applyPreset(preset: string) {
    const d = getPresetDates(preset);
    setFrom(d.from);
    setTo(d.to);
    setAppliedFrom(d.from);
    setAppliedTo(d.to);
  }

  function applyDates() {
    setAppliedFrom(from);
    setAppliedTo(to);
  }

  const datesChanged = from !== appliedFrom || to !== appliedTo;

  const fetchReport = async (url: string) => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  };

  const occupancy = useQuery<OccupancyRow[]>({
    queryKey: ["/api/reports/occupancy", appliedFrom, appliedTo],
    queryFn: () => fetchReport(`/api/reports/occupancy?from=${appliedFrom}&to=${appliedTo}`),
    enabled: activeTab === "occupancy",
  });

  const revenueByType = useQuery<RevenueByTypeRow[]>({
    queryKey: ["/api/reports/revenue-by-room-type", appliedFrom, appliedTo],
    queryFn: () => fetchReport(`/api/reports/revenue-by-room-type?from=${appliedFrom}&to=${appliedTo}`),
    enabled: activeTab === "revenue-type",
  });

  const byChannel = useQuery<ChannelRow[]>({
    queryKey: ["/api/reports/by-channel", appliedFrom, appliedTo],
    queryFn: () => fetchReport(`/api/reports/by-channel?from=${appliedFrom}&to=${appliedTo}`),
    enabled: activeTab === "channel",
  });

  const reservations = useQuery<ReservationRow[]>({
    queryKey: ["/api/reports/reservations", appliedFrom, appliedTo, statusFilter],
    queryFn: () => fetchReport(`/api/reports/reservations?from=${appliedFrom}&to=${appliedTo}&status=${statusFilter === "all" ? "" : statusFilter}`),
    enabled: activeTab === "reservations",
  });

  const payments = useQuery<PaymentsData>({
    queryKey: ["/api/reports/payments", appliedFrom, appliedTo],
    queryFn: () => fetchReport(`/api/reports/payments?from=${appliedFrom}&to=${appliedTo}`),
    enabled: activeTab === "payments",
  });

  const topGuests = useQuery<TopGuestRow[]>({
    queryKey: ["/api/reports/top-guests", appliedFrom, appliedTo],
    queryFn: () => fetchReport(`/api/reports/top-guests?from=${appliedFrom}&to=${appliedTo}&limit=50`),
    enabled: activeTab === "top-guests",
  });

  const housekeeping = useQuery<HousekeepingData>({
    queryKey: ["/api/reports/housekeeping", appliedFrom, appliedTo],
    queryFn: () => fetchReport(`/api/reports/housekeeping?from=${appliedFrom}&to=${appliedTo}`),
    enabled: activeTab === "housekeeping",
  });

  const restaurant = useQuery<RestaurantData>({
    queryKey: ["/api/reports/restaurant", appliedFrom, appliedTo],
    queryFn: () => fetchReport(`/api/reports/restaurant?from=${appliedFrom}&to=${appliedTo}`),
    enabled: activeTab === "restaurant",
  });

  type BillingPaymentRow = { id: string; reservation_id: string; amount: string; method: string; date: string; reference: string; billing_target: string; reservation_code: string; room_number: string; guest_name: string; company_name: string };
  type BillingData = { payments: BillingPaymentRow[]; summary: { totalPayments: number; totalAmount: number; guestTotal: number; companyTotal: number; byMethod: Record<string, { count: number; total: number }> } };

  const billing = useQuery<BillingData>({
    queryKey: ["/api/reports/billing", appliedFrom, appliedTo],
    queryFn: () => fetchReport(`/api/reports/billing?from=${appliedFrom}&to=${appliedTo}`),
    enabled: activeTab === "billing",
  });

  type ArrDepRow = { code: string; guest: string; room: string; roomType: string; checkIn: string; checkOut: string; nights: number; pax: number; status: string; total: number; paid: number; balance: number };
  type ArrDepData = { arrivals: ArrDepRow[]; departures: ArrDepRow[] };

  const arrDep = useQuery<ArrDepData>({
    queryKey: ["/api/reports/arrivals-departures", appliedFrom, appliedTo],
    queryFn: () => fetchReport(`/api/reports/arrivals-departures?from=${appliedFrom}&to=${appliedTo}`),
    enabled: activeTab === "arrivals-departures",
  });

  const pendingBalances = useQuery<ArrDepRow[]>({
    queryKey: ["/api/reports/pending-balances"],
    queryFn: () => fetchReport("/api/reports/pending-balances"),
    enabled: activeTab === "pending-balances",
  });

  const periodoFromDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };
  const periodo = periodoFromDate(to);

  type SpaReportData = {
    ingresosTotales: number; cantidadPagos: number; totalTurnos: number; turnosCompletados: number;
    turnosCancelados: number; turnosNoShow: number; tasaAsistencia: number;
    porEstado: { estado: string; cantidad: number }[];
    porProfesional: { profesional: string; turnos: number; completados: number; cancelados: number }[];
    tratamientosMasSolicitados: { tratamiento: string; cantidad: number; ingresoEstimado: number }[];
    ocupacionPorCabina: { cabina: string; turnos: number }[];
  };
  const spaReport = useQuery<SpaReportData>({
    queryKey: ["/api/reports/spa", periodo],
    queryFn: () => fetchReport(`/api/reports/spa?periodo=${encodeURIComponent(periodo)}`),
    enabled: activeTab === "spa",
  });

  type EventsReportData = {
    cantidadEventos: number; totalFacturado: number; totalCobrado: number; saldoPendiente: number; cobrosDelPeriodo: number;
    porEstado: { estado: string; cantidad: number }[];
    porTipo: { tipo: string; cantidad: number; total: number }[];
    eventos: { id: string; codigo: string; nombre: string; tipo: string; estado: string; fechaInicio: string; fechaFin: string; asistentes: number; totalFacturado: number; totalCobrado: number; saldo: number }[];
  };
  const eventsReport = useQuery<EventsReportData>({
    queryKey: ["/api/reports/events", periodo],
    queryFn: () => fetchReport(`/api/reports/events?periodo=${encodeURIComponent(periodo)}`),
    enabled: activeTab === "events",
  });

  type MaintenanceReportData = {
    totalOrdenes: number; costoTotal: number; costoEstimado: number; horasPromedioResolucion: number;
    porEstado: { estado: string; cantidad: number }[];
    porCategoria: { categoria: string; cantidad: number }[];
    porPrioridad: { prioridad: string; cantidad: number }[];
    ubicacionesRecurrentes: { ubicacion: string; cantidad: number }[];
    porTecnico: { tecnico: string; asignadas: number; completadas: number }[];
  };
  const maintenanceReport = useQuery<MaintenanceReportData>({
    queryKey: ["/api/reports/maintenance", periodo],
    queryFn: () => fetchReport(`/api/reports/maintenance?periodo=${encodeURIComponent(periodo)}`),
    enabled: activeTab === "maintenance",
  });

  type InventoryReportData = {
    valorTotalStock: number;
    itemsBajoMinimo: { id: string; sku: string; nombre: string; stockActual: number; stockMinimo: number; unidad: string }[];
    porTipoMovimiento: { tipo: string; cantidad: number; cantidadTotal: number }[];
    itemsSinMovimiento: { id: string; sku: string; nombre: string; stockActual: number; unidad: string }[];
    topValorStock: { sku: string; nombre: string; stockActual: number; costoUnitario: number; valorTotal: number }[];
  };
  const inventoryReport = useQuery<InventoryReportData>({
    queryKey: ["/api/reports/inventory", periodo],
    queryFn: () => fetchReport(`/api/reports/inventory?periodo=${encodeURIComponent(periodo)}`),
    enabled: activeTab === "inventory",
  });

  type RestaurantCmvData = {
    ingresos: number; costo: number; margen: number; cmvPorcentaje: number;
    porPlato: { plato: string; cantidadVendida: number; ingresos: number; costo: number; cmvPorcentaje: number }[];
  };
  const restaurantCmvReport = useQuery<RestaurantCmvData>({
    queryKey: ["/api/reports/restaurant-cmv", periodo],
    queryFn: () => fetchReport(`/api/reports/restaurant-cmv?periodo=${encodeURIComponent(periodo)}`),
    enabled: activeTab === "restaurant-cmv",
  });

  type RestaurantMozoData = {
    resumen: { totalVentas: number; totalOrdenes: number; totalCubiertos: number; ticketPromedio: number };
    porMozo: { mozo: string; revenue: number; ordenes: number; cubiertos: number; ticketPromedio: number; pct: number }[];
  };
  const restaurantMozoReport = useQuery<RestaurantMozoData>({
    queryKey: ["/api/restaurant/reports/sales-stats-mozo", periodo],
    queryFn: () => fetchReport(`/api/restaurant/reports/sales-stats?periodo=${encodeURIComponent(periodo)}`),
    enabled: activeTab === "restaurant-mozo",
  });

  type RestaurantFoodCostData = {
    foodOnlyCostPct: number; beverageCostPct: number; globalCostPct: number;
    ventasFood: number; ventasBeverage: number;
    costoFood: number; costoBeverage: number;
    byDish: { nombre: string; costoTotal: number; ventasTotal: number; foodCostPct: number; tieneReceta: boolean; isBeverage: boolean }[];
  };
  const restaurantFoodCostReport = useQuery<RestaurantFoodCostData>({
    queryKey: ["/api/restaurant/reports/food-cost-tab", periodo],
    queryFn: () => fetchReport(`/api/restaurant/reports/food-cost?periodo=${encodeURIComponent(periodo)}`),
    enabled: activeTab === "restaurant-foodcost",
  });

  type HousekeepingProductivityData = {
    porCamarera: { camarera: string; totalTareas: number; completadas: number; minutosPromedio: number }[];
    porTipoTarea: { tipo: string; cantidad: number }[];
  };
  const hkProductivityReport = useQuery<HousekeepingProductivityData>({
    queryKey: ["/api/reports/housekeeping-productivity", periodo],
    queryFn: () => fetchReport(`/api/reports/housekeeping-productivity?periodo=${encodeURIComponent(periodo)}`),
    enabled: activeTab === "housekeeping-productivity",
  });

  type ForecastData = {
    dias: number; desde: string; hasta: string; totalReservasPrevistas: number; ingresosPrevistos: number;
    cancelacionesRecientes: number; montoCancelacionesRecientes: number;
    porDia: { fecha: string; reservas: number; ingresosPrevistos: number }[];
  };
  const forecastReport = useQuery<ForecastData>({
    queryKey: ["/api/reports/forecast"],
    queryFn: () => fetchReport(`/api/reports/forecast?dias=30`),
    enabled: activeTab === "forecast",
  });

  const AREA_TABS: Record<string, { label: string; tabs: string[] }> = {
    hoteleria: { label: "Hotelería", tabs: ["occupancy", "revenue-type", "channel", "reservations", "arrivals-departures", "pending-balances", "top-guests", "forecast"] },
    restaurant: { label: "Restaurant", tabs: ["restaurant", "restaurant-cmv", "restaurant-mozo", "restaurant-foodcost"] },
    spa: { label: "Spa", tabs: ["spa"] },
    eventos: { label: "Eventos", tabs: ["events"] },
    operaciones: { label: "Operaciones", tabs: ["housekeeping", "housekeeping-productivity", "maintenance", "inventory"] },
    administracion: { label: "Administración", tabs: ["payments", "billing"] },
  };
  const TAB_TO_AREA: Record<string, string> = Object.fromEntries(
    Object.entries(AREA_TABS).flatMap(([area, v]) => v.tabs.map((t) => [t, area]))
  );
  const [activeArea, setActiveArea] = useState(TAB_TO_AREA[activeTab] || "hoteleria");

  function selectArea(area: string) {
    setActiveArea(area);
    setActiveTab(AREA_TABS[area].tabs[0]);
  }

  const handleExportCSV = () => {
    switch (activeTab) {
      case "occupancy":
        if (occupancy.data) {
          exportCSV(
            ["Fecha", "Hab. Disponibles", "Hab. Ocupadas", "% Ocupación"],
            occupancy.data.map((r) => [r.date, String(r.available), String(r.occupied), `${r.occupancy}%`]),
            "ocupacion"
          );
        }
        break;
      case "revenue-type":
        if (revenueByType.data) {
          exportCSV(
            ["Tipo", "Habitaciones", "Noches vendidas", "Revenue", "ADR", "% del total"],
            revenueByType.data.map((r) => [r.type, String(r.rooms), String(r.nightsSold), formatARS(r.revenue), formatARS(r.adr), `${r.percentage}%`]),
            "revenue-por-tipo"
          );
        }
        break;
      case "channel":
        if (byChannel.data) {
          exportCSV(
            ["Canal", "Reservas", "Noches", "Revenue", "Comisión", "Neto", "%"],
            byChannel.data.map((r) => [r.source, String(r.reservations), String(r.nights), formatARS(r.revenue), formatARS(r.commission), formatARS(r.net), `${r.percentage}%`]),
            "por-canal"
          );
        }
        break;
      case "reservations":
        if (reservations.data) {
          exportCSV(
            ["Código", "Huésped", "Empresa", "Habitación", "Tipo", "Check-in", "Check-out", "Noches", "Canal", "Estado", "Total", "Pagado", "Saldo"],
            reservations.data.map((r) => [r.code, r.guest, r.company, r.room, r.type, r.checkIn, r.checkOut, String(r.nights), r.source, r.status, formatARS(r.total), formatARS(r.paid), formatARS(r.balance)]),
            "reservas"
          );
        }
        break;
      case "payments":
        if (payments.data) {
          exportCSV(
            ["Método", "Transacciones", "Monto total", "%"],
            payments.data.byMethod.map((r) => [r.method, String(r.count), formatARS(r.total), `${r.percentage}%`]),
            "pagos"
          );
        }
        break;
      case "top-guests":
        if (topGuests.data) {
          exportCSV(
            ["Ranking", "Huésped", "Código", "Estadías", "Noches", "Revenue", "Última visita", "Segmento"],
            topGuests.data.map((r) => [String(r.rank), r.guest, r.code, String(r.stays), String(r.nights), formatARS(r.revenue), r.lastVisit, r.segment]),
            "huespedes-frecuentes"
          );
        }
        break;
      case "housekeeping":
        if (housekeeping.data) {
          exportCSV(
            ["Tipo de tarea", "Cantidad"],
            housekeeping.data.byType.map((r) => [r.type, String(r.count)]),
            "housekeeping"
          );
        }
        break;
      case "restaurant":
        if (restaurant.data) {
          exportCSV(
            ["Producto", "Cantidad", "Revenue"],
            restaurant.data.topItems.map((r) => [r.name, String(r.count), formatARS(r.revenue)]),
            "restaurante"
          );
        }
        break;
      case "billing":
        if (billing.data) {
          const methodLabels: Record<string, string> = { efectivo: "Efectivo", tarjeta_debito: "Tarjeta Débito", tarjeta_credito: "Tarjeta Crédito", transferencia: "Transferencia", mercadopago: "MercadoPago", cuenta_corriente: "Cta. Corriente" };
          exportCSV(
            ["Fecha", "Reserva", "Habitación", "Huésped", "Empresa", "Método", "Factura a", "Monto", "Referencia"],
            billing.data.payments.map((p) => [
              p.date, p.reservation_code || "-", p.room_number || "-", p.guest_name || "-", p.company_name || "-",
              methodLabels[p.method] || p.method, p.billing_target === "company" ? "Empresa" : "Huésped",
              formatARS(parseFloat(p.amount || "0")), p.reference || ""
            ]),
            "facturacion"
          );
        }
        break;
      case "arrivals-departures": {
        const cols = ["Código", "Huésped", "Hab.", "Tipo", "Check-in", "Check-out", "Noches", "Pax", "Estado", "Total", "Pagado", "Saldo"];
        const toRow = (r: ArrDepRow) => [r.code, r.guest, r.room, r.roomType, r.checkIn, r.checkOut, String(r.nights), String(r.pax), r.status, formatARS(r.total), formatARS(r.paid), formatARS(r.balance)];
        if (arrDep.data) {
          const allRows = [
            ["--- LLEGADAS ---", "", "", "", "", "", "", "", "", "", "", ""],
            ...arrDep.data.arrivals.map(toRow),
            ["--- SALIDAS ---", "", "", "", "", "", "", "", "", "", "", ""],
            ...arrDep.data.departures.map(toRow),
          ];
          exportCSV(cols, allRows, "llegadas-salidas");
        }
        break;
      }
      case "pending-balances":
        if (pendingBalances.data) {
          exportCSV(
            ["Código", "Huésped", "Hab.", "Tipo", "Check-in", "Check-out", "Noches", "Pax", "Estado", "Total", "Pagado", "Saldo"],
            pendingBalances.data.map((r) => [r.code, r.guest, r.room, r.roomType, r.checkIn, r.checkOut, String(r.nights), String(r.pax), r.status, formatARS(r.total), formatARS(r.paid), formatARS(r.balance)]),
            "saldos-pendientes"
          );
        }
        break;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="reports-page">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-reports-title">
          Reportes
        </h1>
        <p className="text-muted-foreground">Análisis y estadísticas del hotel</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => applyPreset("today")} data-testid="button-preset-today">
                Hoy
              </Button>
              <Button variant="outline" size="sm" onClick={() => applyPreset("week")} data-testid="button-preset-week">
                Semana
              </Button>
              <Button variant="outline" size="sm" onClick={() => applyPreset("month")} data-testid="button-preset-month">
                Mes
              </Button>
              <Button variant="outline" size="sm" onClick={() => applyPreset("year")} data-testid="button-preset-year">
                Año
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-muted-foreground">Desde</label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-auto"
                data-testid="input-date-from"
              />
              <label className="text-sm text-muted-foreground">Hasta</label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-auto"
                data-testid="input-date-to"
              />
              <Button
                size="sm"
                onClick={applyDates}
                disabled={!datesChanged}
                data-testid="button-apply-dates"
              >
                Aplicar
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-csv">
                <Download className="h-4 w-4 mr-1" />
                Exportar CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print">
                <Printer className="h-4 w-4 mr-1" />
                Imprimir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-1" data-testid="area-selector">
        {Object.entries(AREA_TABS).map(([area, cfg]) => (
          <Button
            key={area}
            size="sm"
            variant={activeArea === area ? "default" : "outline"}
            onClick={() => selectArea(area)}
            data-testid={`button-area-${area}`}
          >
            {cfg.label}
          </Button>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-reports">
        {activeArea === "hoteleria" && (
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="occupancy" data-testid="tab-occupancy">
              <Hotel className="h-4 w-4 mr-1" />
              Ocupación
            </TabsTrigger>
            <TabsTrigger value="revenue-type" data-testid="tab-revenue-type">
              <TrendingUp className="h-4 w-4 mr-1" />
              Revenue por Tipo
            </TabsTrigger>
            <TabsTrigger value="channel" data-testid="tab-channel">
              <Globe className="h-4 w-4 mr-1" />
              Por Canal
            </TabsTrigger>
            <TabsTrigger value="reservations" data-testid="tab-reservations">
              <BarChart3 className="h-4 w-4 mr-1" />
              Reservas
            </TabsTrigger>
            <TabsTrigger value="arrivals-departures" data-testid="tab-arrivals-departures">
              <LogIn className="h-4 w-4 mr-1" />
              Llegadas / Salidas
            </TabsTrigger>
            <TabsTrigger value="pending-balances" data-testid="tab-pending-balances">
              <AlertCircle className="h-4 w-4 mr-1" />
              Saldos Pendientes
            </TabsTrigger>
            <TabsTrigger value="top-guests" data-testid="tab-top-guests">
              <Users className="h-4 w-4 mr-1" />
              Huéspedes Frecuentes
            </TabsTrigger>
            <TabsTrigger value="forecast" data-testid="tab-forecast">
              <TrendingUp className="h-4 w-4 mr-1" />
              Pronóstico / Pickup
            </TabsTrigger>
          </TabsList>
        )}
        {activeArea === "restaurant" && (
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="restaurant" data-testid="tab-restaurant">
              <UtensilsCrossed className="h-4 w-4 mr-1" />
              Restaurante
            </TabsTrigger>
            <TabsTrigger value="restaurant-cmv" data-testid="tab-restaurant-cmv">
              <UtensilsCrossed className="h-4 w-4 mr-1" />
              Costo de Comida (CMV)
            </TabsTrigger>
            <TabsTrigger value="restaurant-mozo" data-testid="tab-restaurant-mozo">
              <Users className="h-4 w-4 mr-1" />
              Ventas por Mozo
            </TabsTrigger>
            <TabsTrigger value="restaurant-foodcost" data-testid="tab-restaurant-foodcost">
              <ShoppingCart className="h-4 w-4 mr-1" />
              Food & Beverage Cost
            </TabsTrigger>
          </TabsList>
        )}
        {activeArea === "spa" && (
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="spa" data-testid="tab-spa">
              <Sparkles className="h-4 w-4 mr-1" />
              Spa
            </TabsTrigger>
          </TabsList>
        )}
        {activeArea === "eventos" && (
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="events" data-testid="tab-events">
              <PartyPopper className="h-4 w-4 mr-1" />
              Eventos
            </TabsTrigger>
          </TabsList>
        )}
        {activeArea === "operaciones" && (
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="housekeeping" data-testid="tab-housekeeping">
              <Brush className="h-4 w-4 mr-1" />
              Housekeeping
            </TabsTrigger>
            <TabsTrigger value="housekeeping-productivity" data-testid="tab-housekeeping-productivity">
              <Users className="h-4 w-4 mr-1" />
              Productividad Camareras
            </TabsTrigger>
            <TabsTrigger value="maintenance" data-testid="tab-maintenance">
              <Wrench className="h-4 w-4 mr-1" />
              Mantenimiento
            </TabsTrigger>
            <TabsTrigger value="inventory" data-testid="tab-inventory">
              <Package className="h-4 w-4 mr-1" />
              Inventario
            </TabsTrigger>
          </TabsList>
        )}
        {activeArea === "administracion" && (
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="payments" data-testid="tab-payments">
              <CreditCard className="h-4 w-4 mr-1" />
              Pagos
            </TabsTrigger>
            <TabsTrigger value="billing" data-testid="tab-billing">
              <CreditCard className="h-4 w-4 mr-1" />
              Facturación
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="occupancy" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Ocupación Diaria</CardTitle>
            </CardHeader>
            <CardContent>
              {occupancy.isLoading ? (
                <LoadingSkeleton />
              ) : occupancy.data && occupancy.data.length > 0 ? (
                <>
                  <div className="h-72 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={occupancy.data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis unit="%" />
                        <Tooltip formatter={(v: number) => [`${v}%`, "Ocupación"]} />
                        <Legend />
                        <Line type="monotone" dataKey="occupancy" name="% Ocupación" stroke={COLORS[0]} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-auto">
                    <Table data-testid="table-occupancy">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead className="text-right">Hab. Disponibles</TableHead>
                          <TableHead className="text-right">Hab. Ocupadas</TableHead>
                          <TableHead className="text-right">% Ocupación</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {occupancy.data.map((row, i) => (
                          <TableRow key={i} data-testid={`row-occupancy-${i}`}>
                            <TableCell>{row.date}</TableCell>
                            <TableCell className="text-right">{row.available}</TableCell>
                            <TableCell className="text-right">{row.occupied}</TableCell>
                            <TableCell className="text-right">{row.occupancy}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">No hay datos para el período seleccionado</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue-type" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue por Tipo de Habitación</CardTitle>
            </CardHeader>
            <CardContent>
              {revenueByType.isLoading ? (
                <LoadingSkeleton />
              ) : revenueByType.data && revenueByType.data.length > 0 ? (
                <>
                  <div className="h-72 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueByType.data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="type" tick={{ fontSize: 12 }} />
                        <YAxis />
                        <Tooltip formatter={(v: number) => [formatARS(v), "Revenue"]} />
                        <Legend />
                        <Bar dataKey="revenue" name="Revenue" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-auto">
                    <Table data-testid="table-revenue-type">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Habitaciones</TableHead>
                          <TableHead className="text-right">Noches vendidas</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">ADR</TableHead>
                          <TableHead className="text-right">% del total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {revenueByType.data.map((row, i) => (
                          <TableRow key={i} data-testid={`row-revenue-type-${i}`}>
                            <TableCell>{row.type}</TableCell>
                            <TableCell className="text-right">{row.rooms}</TableCell>
                            <TableCell className="text-right">{row.nightsSold}</TableCell>
                            <TableCell className="text-right">{formatARS(row.revenue)}</TableCell>
                            <TableCell className="text-right">{formatARS(row.adr)}</TableCell>
                            <TableCell className="text-right">{row.percentage}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">No hay datos para el período seleccionado</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channel" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue por Canal</CardTitle>
            </CardHeader>
            <CardContent>
              {byChannel.isLoading ? (
                <LoadingSkeleton />
              ) : byChannel.data && byChannel.data.length > 0 ? (
                <>
                  <div className="h-72 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={byChannel.data}
                          dataKey="revenue"
                          nameKey="source"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ source, percentage }: { source: string; percentage: number }) => `${source} (${percentage}%)`}
                        >
                          {byChannel.data.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [formatARS(v), "Revenue"]} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-auto">
                    <Table data-testid="table-channel">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Canal</TableHead>
                          <TableHead className="text-right">Reservas</TableHead>
                          <TableHead className="text-right">Noches</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Comisión</TableHead>
                          <TableHead className="text-right">Neto</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byChannel.data.map((row, i) => (
                          <TableRow key={i} data-testid={`row-channel-${i}`}>
                            <TableCell>{row.source}</TableCell>
                            <TableCell className="text-right">{row.reservations}</TableCell>
                            <TableCell className="text-right">{row.nights}</TableCell>
                            <TableCell className="text-right">{formatARS(row.revenue)}</TableCell>
                            <TableCell className="text-right">{formatARS(row.commission)}</TableCell>
                            <TableCell className="text-right">{formatARS(row.net)}</TableCell>
                            <TableCell className="text-right">{row.percentage}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">No hay datos para el período seleccionado</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reservations" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Detalle de Reservas</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48" data-testid="select-status-filter">
                  <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="confirmed">Confirmada</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="checked_in">Check-in</SelectItem>
                  <SelectItem value="checked_out">Check-out</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                  <SelectItem value="no_show">No Show</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {reservations.isLoading ? (
                <LoadingSkeleton />
              ) : reservations.data && reservations.data.length > 0 ? (
                <div className="overflow-auto">
                  <Table data-testid="table-reservations">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Huésped</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Habitación</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Check-in</TableHead>
                        <TableHead>Check-out</TableHead>
                        <TableHead className="text-right">Noches</TableHead>
                        <TableHead>Canal</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Pagado</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reservations.data.map((row, i) => (
                        <TableRow key={i} data-testid={`row-reservation-${i}`}>
                          <TableCell className="font-mono text-sm">{row.code}</TableCell>
                          <TableCell>{row.guest}</TableCell>
                          <TableCell>{row.company || "-"}</TableCell>
                          <TableCell>{row.room}</TableCell>
                          <TableCell>{row.type}</TableCell>
                          <TableCell>{row.checkIn}</TableCell>
                          <TableCell>{row.checkOut}</TableCell>
                          <TableCell className="text-right">{row.nights}</TableCell>
                          <TableCell>{row.source}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" data-testid={`badge-status-${i}`}>
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatARS(row.total)}</TableCell>
                          <TableCell className="text-right">{formatARS(row.paid)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {row.balance > 0 ? (
                              <span className="text-red-600 dark:text-red-400">{formatARS(row.balance)}</span>
                            ) : (
                              formatARS(row.balance)
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No hay reservas para el período seleccionado</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pagos por Método</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.isLoading ? (
                <LoadingSkeleton />
              ) : payments.data && payments.data.byMethod.length > 0 ? (
                <>
                  <div className="mb-4">
                    <p className="text-lg font-semibold" data-testid="text-payments-grand-total">
                      Total General: {formatARS(payments.data.grandTotal)}
                    </p>
                  </div>
                  <div className="h-72 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={payments.data.byMethod} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="method" type="category" width={120} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v: number) => [formatARS(v), "Monto"]} />
                        <Legend />
                        <Bar dataKey="total" name="Monto total" fill={COLORS[1]} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-auto">
                    <Table data-testid="table-payments">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Método</TableHead>
                          <TableHead className="text-right">Transacciones</TableHead>
                          <TableHead className="text-right">Monto total</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.data.byMethod.map((row, i) => (
                          <TableRow key={i} data-testid={`row-payment-${i}`}>
                            <TableCell>{row.method}</TableCell>
                            <TableCell className="text-right">{row.count}</TableCell>
                            <TableCell className="text-right">{formatARS(row.total)}</TableCell>
                            <TableCell className="text-right">{row.percentage}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">No hay datos de pagos para el período seleccionado</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="top-guests" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Huéspedes Frecuentes</CardTitle>
            </CardHeader>
            <CardContent>
              {topGuests.isLoading ? (
                <LoadingSkeleton />
              ) : topGuests.data && topGuests.data.length > 0 ? (
                <div className="overflow-auto">
                  <Table data-testid="table-top-guests">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">Ranking</TableHead>
                        <TableHead>Huésped</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead className="text-right">Estadías</TableHead>
                        <TableHead className="text-right">Noches</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead>Última visita</TableHead>
                        <TableHead>Segmento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topGuests.data.map((row, i) => (
                        <TableRow key={i} data-testid={`row-top-guest-${i}`}>
                          <TableCell className="text-right font-medium">{row.rank}</TableCell>
                          <TableCell>{row.guest}</TableCell>
                          <TableCell className="font-mono text-sm">{row.code}</TableCell>
                          <TableCell className="text-right">{row.stays}</TableCell>
                          <TableCell className="text-right">{row.nights}</TableCell>
                          <TableCell className="text-right">{formatARS(row.revenue)}</TableCell>
                          <TableCell>{row.lastVisit}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{row.segment}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No hay datos de huéspedes para el período seleccionado</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecast" className="space-y-4 mt-4">
          {forecastReport.isLoading ? (
            <LoadingSkeleton />
          ) : forecastReport.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Reservas previstas ({forecastReport.data.dias} días)</p><p className="text-xl font-bold" data-testid="text-forecast-reservas">{forecastReport.data.totalReservasPrevistas}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ingresos previstos</p><p className="text-xl font-bold">{formatARS(forecastReport.data.ingresosPrevistos)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Cancelaciones recientes</p><p className="text-xl font-bold text-destructive">{forecastReport.data.cancelacionesRecientes}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Monto cancelado</p><p className="text-xl font-bold text-destructive">{formatARS(forecastReport.data.montoCancelacionesRecientes)}</p></CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Pickup Diario ({forecastReport.data.desde} a {forecastReport.data.hasta})</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <Table data-testid="table-forecast">
                      <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead className="text-right">Reservas</TableHead><TableHead className="text-right">Ingresos Previstos</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {forecastReport.data.porDia.map((r, i) => (
                          <TableRow key={i} data-testid={`row-forecast-${i}`}>
                            <TableCell>{new Date(r.fecha + "T12:00:00").toLocaleDateString("es-AR")}</TableCell>
                            <TableCell className="text-right">{r.reservas}</TableCell>
                            <TableCell className="text-right">{formatARS(r.ingresosPrevistos)}</TableCell>
                          </TableRow>
                        ))}
                        {forecastReport.data.porDia.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin reservas previstas en el rango</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="housekeeping" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Housekeeping</CardTitle>
            </CardHeader>
            <CardContent>
              {housekeeping.isLoading ? (
                <LoadingSkeleton />
              ) : housekeeping.data ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold" data-testid="text-hk-completed">{housekeeping.data.totalCompleted}</p>
                        <p className="text-sm text-muted-foreground">Completadas</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold" data-testid="text-hk-pending">{housekeeping.data.totalPending}</p>
                        <p className="text-sm text-muted-foreground">Pendientes</p>
                      </CardContent>
                    </Card>
                  </div>
                  {housekeeping.data.byType.length > 0 && (
                    <div className="overflow-auto">
                      <Table data-testid="table-housekeeping">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tipo de tarea</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {housekeeping.data.byType.map((row, i) => (
                            <TableRow key={i} data-testid={`row-housekeeping-${i}`}>
                              <TableCell>{row.type}</TableCell>
                              <TableCell className="text-right">{row.count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">No hay datos de housekeeping para el período seleccionado</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="housekeeping-productivity" className="space-y-4 mt-4">
          {hkProductivityReport.isLoading ? (
            <LoadingSkeleton />
          ) : hkProductivityReport.data ? (
            <>
              <Card>
                <CardHeader><CardTitle>Productividad por Camarera</CardTitle></CardHeader>
                <CardContent>
                  <Table data-testid="table-hk-productividad">
                    <TableHeader><TableRow><TableHead>Camarera</TableHead><TableHead className="text-right">Tareas Asignadas</TableHead><TableHead className="text-right">Completadas</TableHead><TableHead className="text-right">Minutos Promedio</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {hkProductivityReport.data.porCamarera.map((r, i) => (
                        <TableRow key={i} data-testid={`row-hk-camarera-${i}`}>
                          <TableCell>{r.camarera}</TableCell>
                          <TableCell className="text-right">{r.totalTareas}</TableCell>
                          <TableCell className="text-right">{r.completadas}</TableCell>
                          <TableCell className="text-right">{r.minutosPromedio || "-"}</TableCell>
                        </TableRow>
                      ))}
                      {hkProductivityReport.data.porCamarera.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin datos en el período</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Tareas por Tipo</CardTitle></CardHeader>
                <CardContent>
                  <Table data-testid="table-hk-por-tipo">
                    <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead className="text-right">Cantidad</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {hkProductivityReport.data.porTipoTarea.map((r, i) => (
                        <TableRow key={i}><TableCell>{r.tipo}</TableCell><TableCell className="text-right">{r.cantidad}</TableCell></TableRow>
                      ))}
                      {hkProductivityReport.data.porTipoTarea.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">Sin datos en el período</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="restaurant" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Restaurante</CardTitle>
            </CardHeader>
            <CardContent>
              {restaurant.isLoading ? (
                <LoadingSkeleton />
              ) : restaurant.data ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold" data-testid="text-rest-orders">{restaurant.data.totalOrders}</p>
                        <p className="text-sm text-muted-foreground">Pedidos</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold" data-testid="text-rest-revenue">{formatARS(restaurant.data.totalRevenue)}</p>
                        <p className="text-sm text-muted-foreground">Revenue</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold" data-testid="text-rest-covers">{restaurant.data.totalCovers}</p>
                        <p className="text-sm text-muted-foreground">Cubiertos</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold" data-testid="text-rest-avg-ticket">{formatARS(restaurant.data.avgTicket)}</p>
                        <p className="text-sm text-muted-foreground">Ticket Promedio</p>
                      </CardContent>
                    </Card>
                  </div>

                  {restaurant.data.topItems.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold mb-3">Top 10 Productos</h3>
                      <div className="overflow-auto">
                        <Table data-testid="table-restaurant-top-items">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Producto</TableHead>
                              <TableHead className="text-right">Cantidad</TableHead>
                              <TableHead className="text-right">Revenue</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {restaurant.data.topItems.slice(0, 10).map((row, i) => (
                              <TableRow key={i} data-testid={`row-top-item-${i}`}>
                                <TableCell>{row.name}</TableCell>
                                <TableCell className="text-right">{row.count}</TableCell>
                                <TableCell className="text-right">{formatARS(row.revenue)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {restaurant.data.byArea.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Por Área</h3>
                      <div className="overflow-auto">
                        <Table data-testid="table-restaurant-by-area">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Área</TableHead>
                              <TableHead className="text-right">Pedidos</TableHead>
                              <TableHead className="text-right">Revenue</TableHead>
                              <TableHead className="text-right">Cubiertos</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {restaurant.data.byArea.map((row, i) => (
                              <TableRow key={i} data-testid={`row-area-${i}`}>
                                <TableCell>{row.name}</TableCell>
                                <TableCell className="text-right">{row.orders}</TableCell>
                                <TableCell className="text-right">{formatARS(row.revenue)}</TableCell>
                                <TableCell className="text-right">{row.covers}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">No hay datos de restaurante para el período seleccionado</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restaurant-cmv" className="space-y-4 mt-4">
          {restaurantCmvReport.isLoading ? (
            <LoadingSkeleton />
          ) : restaurantCmvReport.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ingresos del período</p><p className="text-xl font-bold" data-testid="text-cmv-ingresos">{formatARS(restaurantCmvReport.data.ingresos)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Costo de mercadería</p><p className="text-xl font-bold">{formatARS(restaurantCmvReport.data.costo)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Margen</p><p className="text-xl font-bold text-green-600">{formatARS(restaurantCmvReport.data.margen)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">CMV %</p><p className="text-xl font-bold" data-testid="text-cmv-porcentaje">{restaurantCmvReport.data.cmvPorcentaje}%</p></CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Costo de Comida por Plato</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <Table data-testid="table-cmv-por-plato">
                      <TableHeader><TableRow><TableHead>Plato</TableHead><TableHead className="text-right">Cant. Vendida</TableHead><TableHead className="text-right">Ingresos</TableHead><TableHead className="text-right">Costo</TableHead><TableHead className="text-right">CMV %</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {restaurantCmvReport.data.porPlato.map((r, i) => (
                          <TableRow key={i} data-testid={`row-cmv-plato-${i}`}>
                            <TableCell>{r.plato}</TableCell>
                            <TableCell className="text-right">{r.cantidadVendida}</TableCell>
                            <TableCell className="text-right">{formatARS(r.ingresos)}</TableCell>
                            <TableCell className="text-right">{formatARS(r.costo)}</TableCell>
                            <TableCell className="text-right">{r.cmvPorcentaje}%</TableCell>
                          </TableRow>
                        ))}
                        {restaurantCmvReport.data.porPlato.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sin datos en el período (requiere recetas cargadas con costo por ingrediente)</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        {/* ── Ventas por Mozo ── */}
        <TabsContent value="restaurant-mozo" className="space-y-4 mt-4">
          {restaurantMozoReport.isLoading ? <LoadingSkeleton /> : restaurantMozoReport.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Ventas totales",  value: formatARS(restaurantMozoReport.data.resumen.totalVentas) },
                  { label: "Órdenes",         value: String(restaurantMozoReport.data.resumen.totalOrdenes) },
                  { label: "Cubiertos",       value: String(restaurantMozoReport.data.resumen.totalCubiertos) },
                  { label: "Ticket promedio", value: formatARS(restaurantMozoReport.data.resumen.ticketPromedio) },
                ].map(k => (
                  <Card key={k.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k.label}</p><p className="text-xl font-bold">{k.value}</p></CardContent></Card>
                ))}
              </div>
              <Card>
                <CardHeader><CardTitle>Ranking por Mozo</CardTitle></CardHeader>
                <CardContent>
                  {restaurantMozoReport.data.porMozo.length === 0 ? (
                    <p className="text-muted-foreground text-center py-6 text-sm">Sin datos de mozos para el período (las órdenes deben tener mozo asignado)</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead><TableHead>Mozo</TableHead>
                          <TableHead className="text-right">Órdenes</TableHead>
                          <TableHead className="text-right">Cubiertos</TableHead>
                          <TableHead className="text-right">Ticket Prom.</TableHead>
                          <TableHead className="text-right">Facturación</TableHead>
                          <TableHead className="text-right">% Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {restaurantMozoReport.data.porMozo.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground font-medium">{i + 1}</TableCell>
                            <TableCell className="font-medium">{row.mozo}</TableCell>
                            <TableCell className="text-right">{row.ordenes}</TableCell>
                            <TableCell className="text-right">{row.cubiertos}</TableCell>
                            <TableCell className="text-right">{formatARS(row.ticketPromedio)}</TableCell>
                            <TableCell className="text-right font-semibold">{formatARS(row.revenue)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 bg-muted rounded-full h-1.5 hidden md:block">
                                  <div className="bg-primary h-1.5 rounded-full" style={{ width: `${Math.min(row.pct, 100)}%` }} />
                                </div>
                                <span className="text-muted-foreground text-sm">{row.pct.toFixed(1)}%</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : <p className="text-muted-foreground text-center py-8">Sin datos para el período seleccionado</p>}
        </TabsContent>

        {/* ── Food & Beverage Cost ── */}
        <TabsContent value="restaurant-foodcost" className="space-y-4 mt-4">
          {restaurantFoodCostReport.isLoading ? <LoadingSkeleton /> : restaurantFoodCostReport.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: "Food Cost % (comidas)",    value: `${(restaurantFoodCostReport.data.foodOnlyCostPct ?? 0).toFixed(1)}%`, hi: (restaurantFoodCostReport.data.foodOnlyCostPct ?? 0) > 35 },
                  { label: "Beverage Cost % (bebidas)",value: `${(restaurantFoodCostReport.data.beverageCostPct ?? 0).toFixed(1)}%`, hi: (restaurantFoodCostReport.data.beverageCostPct ?? 0) > 30 },
                  { label: "Food Cost % Global",       value: `${(restaurantFoodCostReport.data.globalCostPct ?? 0).toFixed(1)}%`, hi: false },
                  { label: "Ventas Comidas",  value: formatARS(restaurantFoodCostReport.data.ventasFood ?? 0), hi: false },
                  { label: "Ventas Bebidas",  value: formatARS(restaurantFoodCostReport.data.ventasBeverage ?? 0), hi: false },
                  { label: "Costo Total",     value: formatARS((restaurantFoodCostReport.data.costoFood ?? 0) + (restaurantFoodCostReport.data.costoBeverage ?? 0)), hi: false },
                ].map(k => (
                  <Card key={k.label}><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className={`text-xl font-bold ${k.hi ? "text-red-600" : ""}`}>{k.value}</p>
                  </CardContent></Card>
                ))}
              </div>
              <Card>
                <CardHeader><CardTitle>Desglose por Plato</CardTitle></CardHeader>
                <CardContent>
                  {(!restaurantFoodCostReport.data.byDish || restaurantFoodCostReport.data.byDish.length === 0) ? (
                    <p className="text-muted-foreground text-center py-6 text-sm">Sin datos (requiere recetas con costos cargados)</p>
                  ) : (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Plato</TableHead><TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Ventas</TableHead>
                            <TableHead className="text-right">Costo</TableHead>
                            <TableHead className="text-right">Food Cost %</TableHead>
                            <TableHead>Receta</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {restaurantFoodCostReport.data.byDish.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{r.nombre}</TableCell>
                              <TableCell>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${r.isBeverage ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                                  {r.isBeverage ? "Bebida" : "Comida"}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">{formatARS(r.ventasTotal ?? 0)}</TableCell>
                              <TableCell className="text-right">{formatARS(r.costoTotal ?? 0)}</TableCell>
                              <TableCell className="text-right">
                                <span className={(r.foodCostPct ?? 0) > 35 ? "text-red-600 font-semibold" : "text-green-600"}>
                                  {(r.foodCostPct ?? 0).toFixed(1)}%
                                </span>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{r.tieneReceta ? "✓" : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : <p className="text-muted-foreground text-center py-8">Sin datos para el período seleccionado</p>}
        </TabsContent>

        <TabsContent value="billing" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle data-testid="text-billing-title">Reporte de Facturación</CardTitle>
            </CardHeader>
            <CardContent>
              {billing.isLoading ? (
                <LoadingSkeleton />
              ) : billing.data ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card className="border">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">Total Cobrado</p>
                        <p className="text-2xl font-bold text-primary" data-testid="text-billing-total">{formatARS(billing.data.summary.totalAmount)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">Transacciones</p>
                        <p className="text-2xl font-bold">{billing.data.summary.totalPayments}</p>
                      </CardContent>
                    </Card>
                    <Card className="border">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">Facturado a Huéspedes</p>
                        <p className="text-2xl font-bold text-blue-600">{formatARS(billing.data.summary.guestTotal)}</p>
                      </CardContent>
                    </Card>
                    <Card className="border">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">Facturado a Empresas</p>
                        <p className="text-2xl font-bold text-orange-600">{formatARS(billing.data.summary.companyTotal)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {Object.keys(billing.data.summary.byMethod).length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold mb-3">Por Método de Pago</h3>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={Object.entries(billing.data.summary.byMethod).map(([method, data]) => ({
                                name: ({efectivo:"Efectivo",tarjeta_debito:"T. Débito",tarjeta_credito:"T. Crédito",transferencia:"Transferencia",mercadopago:"MercadoPago",cuenta_corriente:"Cta. Corriente"} as Record<string,string>)[method] || method,
                                value: data.total,
                                count: data.count,
                              }))}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                            >
                              {Object.keys(billing.data.summary.byMethod).map((_, i) => (
                                <Cell key={i} fill={COLORS[i % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatARS(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  <h3 className="text-lg font-semibold mb-3">Detalle de Comprobantes</h3>
                  <div className="overflow-auto">
                    <Table data-testid="table-billing">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Reserva</TableHead>
                          <TableHead>Hab.</TableHead>
                          <TableHead>Huésped</TableHead>
                          <TableHead>Método</TableHead>
                          <TableHead>Factura a</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead>Referencia</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billing.data.payments.map((p, i) => (
                          <TableRow key={p.id || i} data-testid={`row-billing-${i}`}>
                            <TableCell className="text-sm">{new Date(p.date + "T12:00:00").toLocaleDateString("es-AR")}</TableCell>
                            <TableCell className="font-mono text-xs">{p.reservation_code || "-"}</TableCell>
                            <TableCell>{p.room_number || "-"}</TableCell>
                            <TableCell>{p.guest_name || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {({efectivo:"Efectivo",tarjeta_debito:"T. Débito",tarjeta_credito:"T. Crédito",transferencia:"Transferencia",mercadopago:"MercadoPago",cuenta_corriente:"Cta. Corriente"} as Record<string,string>)[p.method] || p.method}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={p.billing_target === "company" ? "secondary" : "outline"} className="text-xs">
                                {p.billing_target === "company" ? (p.company_name || "Empresa") : "Huésped"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatARS(parseFloat(p.amount || "0"))}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.reference || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-center py-8">No hay datos de facturación para el período seleccionado</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="arrivals-departures" className="space-y-4 mt-4">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page { size: A4 landscape; margin: 1cm; }
              body { zoom: 0.8; -webkit-print-color-adjust: exact; }
              .print-hide { display: none !important; }
            }
          ` }} />
          {arrDep.isLoading ? <Card><CardContent className="p-8"><LoadingSkeleton /></CardContent></Card> : arrDep.data ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <LogIn className="h-4 w-4 text-green-600" />
                    Llegadas — {arrDep.data.arrivals.length} reservas · {arrDep.data.arrivals.reduce((s, r) => s + r.pax, 0)} pax
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <Table data-testid="table-arrivals">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Huésped</TableHead>
                          <TableHead>Hab.</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Check-in</TableHead>
                          <TableHead>Check-out</TableHead>
                          <TableHead className="text-center">Noches</TableHead>
                          <TableHead className="text-center">Pax</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Pagado</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {arrDep.data.arrivals.length === 0 ? (
                          <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Sin llegadas en el período</TableCell></TableRow>
                        ) : arrDep.data.arrivals.map((r, i) => (
                          <TableRow key={i} data-testid={`row-arrival-${i}`}>
                            <TableCell className="font-medium">{r.guest}</TableCell>
                            <TableCell>{r.room}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{r.roomType}</TableCell>
                            <TableCell className="text-sm">{r.checkIn}</TableCell>
                            <TableCell className="text-sm">{r.checkOut}</TableCell>
                            <TableCell className="text-center">{r.nights}</TableCell>
                            <TableCell className="text-center">{r.pax}</TableCell>
                            <TableCell className="text-right">{formatARS(r.total)}</TableCell>
                            <TableCell className="text-right text-green-600">{formatARS(r.paid)}</TableCell>
                            <TableCell className="text-right font-semibold" style={{ color: r.balance > 0 ? "var(--destructive)" : undefined }}>{formatARS(r.balance)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <LogOut className="h-4 w-4 text-orange-600" />
                    Salidas — {arrDep.data.departures.length} reservas · {arrDep.data.departures.reduce((s, r) => s + r.pax, 0)} pax
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <Table data-testid="table-departures">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Huésped</TableHead>
                          <TableHead>Hab.</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Check-in</TableHead>
                          <TableHead>Check-out</TableHead>
                          <TableHead className="text-center">Noches</TableHead>
                          <TableHead className="text-center">Pax</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Pagado</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {arrDep.data.departures.length === 0 ? (
                          <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Sin salidas en el período</TableCell></TableRow>
                        ) : arrDep.data.departures.map((r, i) => (
                          <TableRow key={i} data-testid={`row-departure-${i}`}>
                            <TableCell className="font-medium">{r.guest}</TableCell>
                            <TableCell>{r.room}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{r.roomType}</TableCell>
                            <TableCell className="text-sm">{r.checkIn}</TableCell>
                            <TableCell className="text-sm">{r.checkOut}</TableCell>
                            <TableCell className="text-center">{r.nights}</TableCell>
                            <TableCell className="text-center">{r.pax}</TableCell>
                            <TableCell className="text-right">{formatARS(r.total)}</TableCell>
                            <TableCell className="text-right text-green-600">{formatARS(r.paid)}</TableCell>
                            <TableCell className="text-right font-semibold" style={{ color: r.balance > 0 ? "var(--destructive)" : undefined }}>{formatARS(r.balance)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : <p className="text-muted-foreground text-center py-8">No hay datos para el período seleccionado</p>}
        </TabsContent>

        <TabsContent value="pending-balances" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Saldos Pendientes
                {pendingBalances.data && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingBalances.data.length} reservas · {formatARS(pendingBalances.data.reduce((s, r) => s + r.balance, 0))} total
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingBalances.isLoading ? <LoadingSkeleton /> : pendingBalances.data && pendingBalances.data.length > 0 ? (
                <div className="overflow-auto">
                  <Table data-testid="table-pending-balances">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Huésped</TableHead>
                        <TableHead>Hab.</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Check-in</TableHead>
                        <TableHead>Check-out</TableHead>
                        <TableHead className="text-center">Noches</TableHead>
                        <TableHead className="text-center">Pax</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Total cargos</TableHead>
                        <TableHead className="text-right">Pagado</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingBalances.data.map((r, i) => (
                        <TableRow key={i} data-testid={`row-pending-${i}`}>
                          <TableCell className="font-mono text-xs">{r.code}</TableCell>
                          <TableCell className="font-medium">{r.guest}</TableCell>
                          <TableCell>{r.room}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.roomType}</TableCell>
                          <TableCell className="text-sm">{r.checkIn}</TableCell>
                          <TableCell className="text-sm">{r.checkOut}</TableCell>
                          <TableCell className="text-center">{r.nights}</TableCell>
                          <TableCell className="text-center">{r.pax}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{r.status}</Badge></TableCell>
                          <TableCell className="text-right">{formatARS(r.total)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatARS(r.paid)}</TableCell>
                          <TableCell className="text-right font-bold text-destructive">{formatARS(r.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : pendingBalances.data ? (
                <p className="text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
                  <AlertCircle className="h-4 w-4 text-green-600" /> No hay saldos pendientes
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spa" className="space-y-4 mt-4">
          {spaReport.isLoading ? (
            <LoadingSkeleton />
          ) : spaReport.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ingresos del período</p><p className="text-xl font-bold" data-testid="text-spa-ingresos">{formatARS(spaReport.data.ingresosTotales)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Turnos totales</p><p className="text-xl font-bold">{spaReport.data.totalTurnos}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Tasa de asistencia</p><p className="text-xl font-bold">{spaReport.data.tasaAsistencia}%</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">No-shows / Cancelados</p><p className="text-xl font-bold text-destructive">{spaReport.data.turnosNoShow} / {spaReport.data.turnosCancelados}</p></CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Producción por Profesional</CardTitle></CardHeader>
                <CardContent>
                  <Table data-testid="table-spa-profesionales">
                    <TableHeader><TableRow><TableHead>Profesional</TableHead><TableHead className="text-right">Turnos</TableHead><TableHead className="text-right">Completados</TableHead><TableHead className="text-right">Cancelados</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {spaReport.data.porProfesional.map((r, i) => (
                        <TableRow key={i}><TableCell>{r.profesional}</TableCell><TableCell className="text-right">{r.turnos}</TableCell><TableCell className="text-right">{r.completados}</TableCell><TableCell className="text-right">{r.cancelados}</TableCell></TableRow>
                      ))}
                      {spaReport.data.porProfesional.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin datos en el período</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Tratamientos más solicitados</CardTitle></CardHeader>
                <CardContent>
                  <Table data-testid="table-spa-tratamientos">
                    <TableHeader><TableRow><TableHead>Tratamiento</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Ingreso estimado</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {spaReport.data.tratamientosMasSolicitados.map((r, i) => (
                        <TableRow key={i}><TableCell>{r.tratamiento}</TableCell><TableCell className="text-right">{r.cantidad}</TableCell><TableCell className="text-right">{formatARS(r.ingresoEstimado)}</TableCell></TableRow>
                      ))}
                      {spaReport.data.tratamientosMasSolicitados.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin datos en el período</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Ocupación por Cabina</CardTitle></CardHeader>
                <CardContent>
                  <Table data-testid="table-spa-cabinas">
                    <TableHeader><TableRow><TableHead>Cabina</TableHead><TableHead className="text-right">Turnos</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {spaReport.data.ocupacionPorCabina.map((r, i) => (
                        <TableRow key={i}><TableCell>{r.cabina}</TableCell><TableCell className="text-right">{r.turnos}</TableCell></TableRow>
                      ))}
                      {spaReport.data.ocupacionPorCabina.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">Sin datos en el período</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="events" className="space-y-4 mt-4">
          {eventsReport.isLoading ? (
            <LoadingSkeleton />
          ) : eventsReport.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Eventos del período</p><p className="text-xl font-bold" data-testid="text-events-cantidad">{eventsReport.data.cantidadEventos}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total facturado</p><p className="text-xl font-bold">{formatARS(eventsReport.data.totalFacturado)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total cobrado</p><p className="text-xl font-bold text-green-600">{formatARS(eventsReport.data.totalCobrado)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Saldo pendiente</p><p className="text-xl font-bold text-destructive">{formatARS(eventsReport.data.saldoPendiente)}</p></CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Eventos del Período</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <Table data-testid="table-events">
                      <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Tipo</TableHead><TableHead>Estado</TableHead><TableHead>Fecha</TableHead><TableHead className="text-center">Asistentes</TableHead><TableHead className="text-right">Facturado</TableHead><TableHead className="text-right">Cobrado</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {eventsReport.data.eventos.map((r) => (
                          <TableRow key={r.id} data-testid={`row-event-${r.id}`}>
                            <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                            <TableCell>{r.nombre}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{r.tipo}</Badge></TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{r.estado}</Badge></TableCell>
                            <TableCell className="text-sm">{r.fechaInicio}</TableCell>
                            <TableCell className="text-center">{r.asistentes}</TableCell>
                            <TableCell className="text-right">{formatARS(r.totalFacturado)}</TableCell>
                            <TableCell className="text-right text-green-600">{formatARS(r.totalCobrado)}</TableCell>
                            <TableCell className="text-right font-bold text-destructive">{formatARS(r.saldo)}</TableCell>
                          </TableRow>
                        ))}
                        {eventsReport.data.eventos.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Sin eventos en el período</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Por Tipo de Evento</CardTitle></CardHeader>
                <CardContent>
                  <Table data-testid="table-events-por-tipo">
                    <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {eventsReport.data.porTipo.map((r, i) => (
                        <TableRow key={i}><TableCell>{r.tipo}</TableCell><TableCell className="text-right">{r.cantidad}</TableCell><TableCell className="text-right">{formatARS(r.total)}</TableCell></TableRow>
                      ))}
                      {eventsReport.data.porTipo.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin datos en el período</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4 mt-4">
          {maintenanceReport.isLoading ? (
            <LoadingSkeleton />
          ) : maintenanceReport.data ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Órdenes del período</p><p className="text-xl font-bold" data-testid="text-maintenance-total">{maintenanceReport.data.totalOrdenes}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Costo total</p><p className="text-xl font-bold">{formatARS(maintenanceReport.data.costoTotal)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Costo estimado</p><p className="text-xl font-bold">{formatARS(maintenanceReport.data.costoEstimado)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Horas promedio resolución</p><p className="text-xl font-bold">{maintenanceReport.data.horasPromedioResolucion} hs</p></CardContent></Card>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader><CardTitle>Por Estado</CardTitle></CardHeader>
                  <CardContent>
                    <Table data-testid="table-maintenance-estado">
                      <TableHeader><TableRow><TableHead>Estado</TableHead><TableHead className="text-right">Cantidad</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {maintenanceReport.data.porEstado.map((r, i) => (
                          <TableRow key={i}><TableCell><Badge variant="outline" className="text-xs">{r.estado}</Badge></TableCell><TableCell className="text-right">{r.cantidad}</TableCell></TableRow>
                        ))}
                        {maintenanceReport.data.porEstado.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">Sin datos</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Por Categoría</CardTitle></CardHeader>
                  <CardContent>
                    <Table data-testid="table-maintenance-categoria">
                      <TableHeader><TableRow><TableHead>Categoría</TableHead><TableHead className="text-right">Cantidad</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {maintenanceReport.data.porCategoria.map((r, i) => (
                          <TableRow key={i}><TableCell>{r.categoria}</TableCell><TableCell className="text-right">{r.cantidad}</TableCell></TableRow>
                        ))}
                        {maintenanceReport.data.porCategoria.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">Sin datos</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Por Prioridad</CardTitle></CardHeader>
                  <CardContent>
                    <Table data-testid="table-maintenance-prioridad">
                      <TableHeader><TableRow><TableHead>Prioridad</TableHead><TableHead className="text-right">Cantidad</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {maintenanceReport.data.porPrioridad.map((r, i) => (
                          <TableRow key={i}><TableCell>{r.prioridad}</TableCell><TableCell className="text-right">{r.cantidad}</TableCell></TableRow>
                        ))}
                        {maintenanceReport.data.porPrioridad.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">Sin datos</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Ubicaciones Recurrentes</CardTitle></CardHeader>
                <CardContent>
                  <Table data-testid="table-maintenance-ubicaciones">
                    <TableHeader><TableRow><TableHead>Ubicación</TableHead><TableHead className="text-right">Órdenes</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {maintenanceReport.data.ubicacionesRecurrentes.map((r, i) => (
                        <TableRow key={i}><TableCell>{r.ubicacion}</TableCell><TableCell className="text-right">{r.cantidad}</TableCell></TableRow>
                      ))}
                      {maintenanceReport.data.ubicacionesRecurrentes.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">Sin datos en el período</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Producción por Técnico</CardTitle></CardHeader>
                <CardContent>
                  <Table data-testid="table-maintenance-tecnico">
                    <TableHeader><TableRow><TableHead>Técnico</TableHead><TableHead className="text-right">Asignadas</TableHead><TableHead className="text-right">Completadas</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {maintenanceReport.data.porTecnico.map((r, i) => (
                        <TableRow key={i}><TableCell>{r.tecnico}</TableCell><TableCell className="text-right">{r.asignadas}</TableCell><TableCell className="text-right">{r.completadas}</TableCell></TableRow>
                      ))}
                      {maintenanceReport.data.porTecnico.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin datos en el período</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4 mt-4">
          {inventoryReport.isLoading ? (
            <LoadingSkeleton />
          ) : inventoryReport.data ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Valor total del stock</p><p className="text-xl font-bold" data-testid="text-inventory-valor">{formatARS(inventoryReport.data.valorTotalStock)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ítems bajo stock mínimo</p><p className="text-xl font-bold text-destructive">{inventoryReport.data.itemsBajoMinimo.length}</p></CardContent></Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Ítems Bajo Stock Mínimo</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <Table data-testid="table-inventory-bajo-minimo">
                      <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Nombre</TableHead><TableHead className="text-right">Stock Actual</TableHead><TableHead className="text-right">Stock Mínimo</TableHead><TableHead>Unidad</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {inventoryReport.data.itemsBajoMinimo.map((r) => (
                          <TableRow key={r.id} data-testid={`row-inventory-low-${r.id}`}>
                            <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                            <TableCell>{r.nombre}</TableCell>
                            <TableCell className="text-right text-destructive font-bold">{r.stockActual}</TableCell>
                            <TableCell className="text-right">{r.stockMinimo}</TableCell>
                            <TableCell>{r.unidad}</TableCell>
                          </TableRow>
                        ))}
                        {inventoryReport.data.itemsBajoMinimo.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Ningún ítem bajo el mínimo</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle>Movimientos por Tipo (período)</CardTitle></CardHeader>
                  <CardContent>
                    <Table data-testid="table-inventory-movimientos">
                      <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead className="text-right">Movimientos</TableHead><TableHead className="text-right">Cantidad Total</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {inventoryReport.data.porTipoMovimiento.map((r, i) => (
                          <TableRow key={i}><TableCell>{r.tipo}</TableCell><TableCell className="text-right">{r.cantidad}</TableCell><TableCell className="text-right">{r.cantidadTotal}</TableCell></TableRow>
                        ))}
                        {inventoryReport.data.porTipoMovimiento.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin datos en el período</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Top 10 Valor en Stock</CardTitle></CardHeader>
                  <CardContent>
                    <Table data-testid="table-inventory-top-valor">
                      <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {inventoryReport.data.topValorStock.map((r, i) => (
                          <TableRow key={i}><TableCell>{r.nombre}</TableCell><TableCell className="text-right">{r.stockActual}</TableCell><TableCell className="text-right">{formatARS(r.valorTotal)}</TableCell></TableRow>
                        ))}
                        {inventoryReport.data.topValorStock.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin datos</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Ítems Sin Movimiento en el Período</CardTitle></CardHeader>
                <CardContent>
                  <Table data-testid="table-inventory-sin-movimiento">
                    <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Nombre</TableHead><TableHead className="text-right">Stock Actual</TableHead><TableHead>Unidad</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {inventoryReport.data.itemsSinMovimiento.map((r) => (
                        <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.sku}</TableCell><TableCell>{r.nombre}</TableCell><TableCell className="text-right">{r.stockActual}</TableCell><TableCell>{r.unidad}</TableCell></TableRow>
                      ))}
                      {inventoryReport.data.itemsSinMovimiento.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Todos los ítems tuvieron movimiento</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}