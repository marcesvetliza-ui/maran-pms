import { useState, useMemo } from "react";
import { getArgentinaToday, toArgentinaDateStr, getArgentinaFirstOfMonth } from "@/lib/date-utils";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  DollarSign,
  Bed,
  BarChart3,
  LogIn,
  LogOut,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

type ChannelData = {
  source: string;
  reservations: number;
  revenue: number;
  percentage: number;
};

type RoomsByStatus = {
  available: number;
  occupied: number;
  cleaning: number;
  maintenance: number;
  oos: number;
};

type PreviousYear = {
  occupancyRate: number;
  totalRevenue: number;
  adr: number;
  revpar: number;
};

type ExecutiveStats = {
  occupancyRate: number;
  occupiedRooms: number;
  availableRooms: number;
  totalRooms: number;
  totalRevenue: number;
  accommodationRevenue: number;
  extrasRevenue: number;
  adr: number;
  revpar: number;
  byChannel: ChannelData[];
  previousYear: PreviousYear;
  todayCheckIns: number;
  todayCheckOuts: number;
  pendingCheckIns: number;
  roomsByStatus: RoomsByStatus;
};

type OccupancyData = {
  date: string;
  available: number;
  occupied: number;
  occupancy: number;
  totalRooms: number;
};

type PeriodType = "today" | "week" | "month" | "year";

function formatCurrency(value: number): string {
  return (
    "$ " +
    Math.round(value)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  );
}

function getDateRange(period: PeriodType): { from: string; to: string } {
  const to = getArgentinaToday();
  let from = to;
  if (period === "week") {
    const now = new Date();
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    from = toArgentinaDateStr(d);
  } else if (period === "month") {
    from = getArgentinaFirstOfMonth();
  } else if (period === "year") {
    from = to.slice(0, 4) + "-01-01";
  }
  return { from, to };
}

function TrendIndicator({
  current,
  previous,
  suffix = "",
  invert = false,
}: {
  current: number;
  previous: number;
  suffix?: string;
  invert?: boolean;
}) {
  if (!previous || previous === 0) return null;
  const diff = ((current - previous) / previous) * 100;
  const isPositive = invert ? diff < 0 : diff > 0;
  return (
    <div className="flex items-center gap-1 mt-1">
      {isPositive ? (
        <ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <ArrowDownRight className="h-4 w-4 text-red-600 dark:text-red-400" />
      )}
      <span
        className={`text-sm font-medium ${
          isPositive
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
        }`}
      >
        {diff > 0 ? "+" : ""}
        {diff.toFixed(1)}%{suffix} vs año anterior
      </span>
    </div>
  );
}

const CHANNEL_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function DashboardExecutive() {
  const [period, setPeriod] = useState<PeriodType>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const queryParams = useMemo(() => {
    if (useCustom && customFrom && customTo) {
      return `from=${customFrom}&to=${customTo}`;
    }
    return `period=${period}`;
  }, [period, useCustom, customFrom, customTo]);

  const dateRange = useMemo(() => {
    if (useCustom && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    return getDateRange(period);
  }, [period, useCustom, customFrom, customTo]);

  const { data: stats, isLoading: statsLoading } = useQuery<ExecutiveStats>({
    queryKey: ["/api/executive/stats", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/executive/stats?${queryParams}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Error fetching stats");
      return res.json();
    },
  });

  const { data: occupancyData, isLoading: occupancyLoading } = useQuery<
    OccupancyData[]
  >({
    queryKey: ["/api/reports/occupancy", dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/occupancy?from=${dateRange.from}&to=${dateRange.to}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Error fetching occupancy");
      return res.json();
    },
  });

  const { data: roomStatus } = useQuery<ExecutiveStats>({
    queryKey: ["/api/executive/stats", "roomStatus"],
    queryFn: async () => {
      const res = await fetch(`/api/executive/stats?period=today`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Error fetching room status");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const handlePeriodChange = (p: PeriodType) => {
    setPeriod(p);
    setUseCustom(false);
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      setUseCustom(true);
    }
  };

  const channelTotal = useMemo(() => {
    if (!stats?.byChannel) return 0;
    return stats.byChannel.reduce((sum, ch) => sum + ch.revenue, 0);
  }, [stats?.byChannel]);

  const periods: { label: string; value: PeriodType }[] = [
    { label: "Hoy", value: "today" },
    { label: "Semana", value: "week" },
    { label: "Mes", value: "month" },
    { label: "Año", value: "year" },
  ];

  const roomStatusData = roomStatus?.roomsByStatus || stats?.roomsByStatus;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1
          className="text-3xl font-bold tracking-tight"
          data-testid="text-executive-title"
        >
          Dashboard Ejecutivo
        </h1>
        <p className="text-muted-foreground">
          Indicadores clave de rendimiento del hotel
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {periods.map((p) => (
          <Button
            key={p.value}
            variant={!useCustom && period === p.value ? "default" : "outline"}
            size="sm"
            onClick={() => handlePeriodChange(p.value)}
            data-testid={`btn-period-${p.value}`}
          >
            {p.label}
          </Button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            data-testid="input-date-from"
            className="w-auto"
          />
          <span className="text-muted-foreground text-sm">hasta</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            data-testid="input-date-to"
            className="w-auto"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleCustomApply}
            disabled={!customFrom || !customTo}
            data-testid="btn-apply-custom"
          >
            Aplicar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-4 w-32 mt-2" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : stats ? (
          <>
            <Card data-testid="kpi-occupancy">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Ocupación
                </CardTitle>
                <Bed className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {stats.occupancyRate?.toFixed(1)}%
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {stats.occupiedRooms} de {stats.totalRooms} habitaciones
                </p>
                <TrendIndicator
                  current={stats.occupancyRate}
                  previous={stats.previousYear?.occupancyRate}
                />
              </CardContent>
            </Card>

            <Card data-testid="kpi-revenue">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenue Total
                </CardTitle>
                <DollarSign className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatCurrency(stats.totalRevenue || 0)}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Aloj. {formatCurrency(stats.accommodationRevenue || 0)} |
                  Extras {formatCurrency(stats.extrasRevenue || 0)}
                </p>
                <TrendIndicator
                  current={stats.totalRevenue}
                  previous={stats.previousYear?.totalRevenue}
                />
              </CardContent>
            </Card>

            <Card data-testid="kpi-adr">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  ADR
                </CardTitle>
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatCurrency(stats.adr || 0)}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Tarifa diaria promedio
                </p>
                <TrendIndicator
                  current={stats.adr}
                  previous={stats.previousYear?.adr}
                />
              </CardContent>
            </Card>

            <Card data-testid="kpi-revpar">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  RevPAR
                </CardTitle>
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatCurrency(stats.revpar || 0)}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Revenue por hab. disponible
                </p>
                <TrendIndicator
                  current={stats.revpar}
                  previous={stats.previousYear?.revpar}
                />
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <Card data-testid="chart-occupancy">
        <CardHeader>
          <CardTitle>Ocupación por Día</CardTitle>
        </CardHeader>
        <CardContent>
          {occupancyLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : occupancyData && occupancyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={occupancyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val: string) => {
                    const d = new Date(val);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                  fontSize={12}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(val: number) => `${val}%`}
                  fontSize={12}
                />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(1)}%`, "Ocupación"]}
                  labelFormatter={(label: string) => {
                    const d = new Date(label);
                    return d.toLocaleDateString("es-AR");
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="occupancy"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Sin datos de ocupación para el período seleccionado
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="chart-channels">
          <CardHeader>
            <CardTitle>Revenue por Canal</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : stats?.byChannel && stats.byChannel.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={stats.byChannel}
                  layout="vertical"
                  margin={{ left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickFormatter={(val: number) => formatCurrency(val)}
                    fontSize={12}
                  />
                  <YAxis
                    type="category"
                    dataKey="source"
                    fontSize={12}
                    width={75}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      formatCurrency(value),
                      "Revenue",
                    ]}
                  />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                    {stats.byChannel.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                Sin datos de canales
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="table-channels">
          <CardHeader>
            <CardTitle>Detalle por Canal</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : stats?.byChannel && stats.byChannel.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground">
                        Canal
                      </th>
                      <th className="text-right py-2 font-medium text-muted-foreground">
                        Reservas
                      </th>
                      <th className="text-right py-2 font-medium text-muted-foreground">
                        Revenue
                      </th>
                      <th className="text-right py-2 font-medium text-muted-foreground">
                        % del total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byChannel.map((ch, idx) => (
                      <tr
                        key={ch.source}
                        className="border-b last:border-0"
                        data-testid={`channel-row-${idx}`}
                      >
                        <td className="py-2 font-medium">{ch.source}</td>
                        <td className="text-right py-2">{ch.reservations}</td>
                        <td className="text-right py-2">
                          {formatCurrency(ch.revenue)}
                        </td>
                        <td className="text-right py-2">
                          {channelTotal > 0
                            ? ((ch.revenue / channelTotal) * 100).toFixed(1)
                            : 0}
                          %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground">
                Sin datos de canales
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="section-room-status">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Estado de Habitaciones</CardTitle>
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 no-default-hover-elevate no-default-active-elevate"
              data-testid="badge-available"
            >
              Disponibles: {roomStatusData?.available ?? 0}
            </Badge>
            <Badge
              className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 no-default-hover-elevate no-default-active-elevate"
              data-testid="badge-occupied"
            >
              Ocupadas: {roomStatusData?.occupied ?? 0}
            </Badge>
            <Badge
              className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 no-default-hover-elevate no-default-active-elevate"
              data-testid="badge-cleaning"
            >
              Limpieza: {roomStatusData?.cleaning ?? 0}
            </Badge>
            <Badge
              className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 no-default-hover-elevate no-default-active-elevate"
              data-testid="badge-maintenance"
            >
              Mantenimiento: {roomStatusData?.maintenance ?? 0}
            </Badge>
            <Badge
              className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 no-default-hover-elevate no-default-active-elevate"
              data-testid="badge-out-of-service"
            >
              Fuera de servicio: {roomStatusData?.oos ?? 0}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="section-operations">
        <CardHeader>
          <CardTitle>Operaciones de Hoy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div
              className="flex items-center gap-3 p-4 rounded-md border"
              data-testid="ops-checkins"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-green-100 dark:bg-green-900/30">
                <LogIn className="h-5 w-5 text-green-700 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {stats?.todayCheckIns ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">
                  Check-ins esperados
                </p>
              </div>
            </div>
            <div
              className="flex items-center gap-3 p-4 rounded-md border"
              data-testid="ops-checkouts"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-100 dark:bg-orange-900/30">
                <LogOut className="h-5 w-5 text-orange-700 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {stats?.todayCheckOuts ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">
                  Check-outs esperados
                </p>
              </div>
            </div>
            <div
              className="flex items-center gap-3 p-4 rounded-md border"
              data-testid="ops-pending"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/30">
                <Clock className="h-5 w-5 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {stats?.pendingCheckIns ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">
                  Check-ins pendientes
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
