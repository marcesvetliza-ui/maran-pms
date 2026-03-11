import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Download, FileText, Building2, BarChart2, Users, ShoppingCart, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fPeso(n: number | undefined | null) {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n ?? 0));
}

function fPct(n: number | undefined | null) {
  const v = n ?? 0;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function currentPeriodo() {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

function genPeriodoOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    opts.push({ value: `${mm}/${yyyy}`, label: `${["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][d.getMonth()]} ${yyyy}` });
  }
  return opts;
}

const PERIODOS = genPeriodoOptions();

function KpiCard({ title, value, delta, unit = "" }: { title: string; value: string | number; delta?: number; unit?: string }) {
  const isPos = (delta ?? 0) > 0;
  const isNeg = (delta ?? 0) < 0;
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="text-xs text-muted-foreground mb-1">{title}</div>
        <div className="text-xl font-bold">{unit}{typeof value === "number" ? fPeso(value) : value}</div>
        {delta !== undefined && (
          <div className={`text-xs mt-1 flex items-center gap-1 ${isPos ? "text-green-600" : isNeg ? "text-red-600" : "text-muted-foreground"}`}>
            {isPos ? <TrendingUp className="w-3 h-3" /> : isNeg ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {isPos ? "+" : ""}{typeof delta === "number" ? delta.toFixed(1) : delta} vs mes ant.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExportButtons({ tipo, params }: { tipo: string; params: Record<string, string> }) {
  const qp = new URLSearchParams(params).toString();
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => window.open(`/api/reports/export-pdf/${tipo}?${qp}`, "_blank")}>
        <FileText className="w-3.5 h-3.5 mr-1" /> PDF
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.open(`/api/reports/export-excel/${tipo}?${qp}`, "_blank")}>
        <Download className="w-3.5 h-3.5 mr-1" /> Excel
      </Button>
    </div>
  );
}

function LineaResultados({ label, value, bold = false, indent = false, color }: { label: string; value: number; bold?: boolean; indent?: boolean; color?: string }) {
  return (
    <div className={`flex justify-between py-1 ${indent ? "pl-4" : ""} ${bold ? "font-semibold" : ""}`} style={color ? { color } : {}}>
      <span className="text-sm">{label}</span>
      <span className={`text-sm font-mono ${value < 0 ? "text-red-600" : ""}`}>${fPeso(value)}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminReportesPage() {
  const [activeTab, setActiveTab] = useState("estado-resultados");

  const NAV = [
    { id: "estado-resultados", label: "Estado de Resultados", icon: BarChart2 },
    { id: "kpis",              label: "KPIs Hoteleros",       icon: TrendingUp },
    { id: "ocupacion",         label: "Análisis de Ocupación", icon: Calendar },
    { id: "ingresos",          label: "Ingresos por Área",     icon: Building2 },
    { id: "costos",            label: "Costos por Departamento", icon: ShoppingCart },
    { id: "proveedores",       label: "Ranking Proveedores",   icon: Users },
    { id: "comparativo",       label: "Comparativo Mensual",   icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar nav */}
      <aside className="w-52 shrink-0 border-r bg-muted/20 p-3">
        <h2 className="text-sm font-bold text-muted-foreground px-2 mb-3">Reportes Gerenciales</h2>
        <div className="space-y-0.5">
          {NAV.map(n => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => setActiveTab(n.id)}
                className={`w-full text-left text-xs flex items-center gap-2 px-2 py-2 rounded-md transition-colors
                  ${activeTab === n.id ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
                data-testid={`nav-report-${n.id}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {n.label}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        {activeTab === "estado-resultados" && <EstadoResultadosReport />}
        {activeTab === "kpis" && <KpisReport />}
        {activeTab === "ocupacion" && <OcupacionReport />}
        {activeTab === "ingresos" && <IngresosReport />}
        {activeTab === "costos" && <CostosReport />}
        {activeTab === "proveedores" && <ProveedoresReport />}
        {activeTab === "comparativo" && <ComparativoReport />}
      </main>
    </div>
  );
}

// ─── Estado de Resultados ─────────────────────────────────────────────────────

function EstadoResultadosReport() {
  const [periodo, setPeriodo] = useState(currentPeriodo());

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/estado-resultados", periodo],
    queryFn: () => fetch(`/api/reports/estado-resultados?periodo=${encodeURIComponent(periodo)}`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Calculando...</div>;
  if (!data) return null;

  const chartData = [
    { name: "Ingresos", value: data.ingresos?.totalIngresos ?? 0, fill: "#3B82F6" },
    { name: "Costos", value: data.costosMercaderia?.totalCostos ?? 0, fill: "#EF4444" },
    { name: "Gastos Op.", value: data.gastosOperativos?.totalGastosOperativos ?? 0, fill: "#F59E0B" },
    { name: "EBITDA", value: Math.abs(data.ebitda ?? 0), fill: (data.ebitda ?? 0) >= 0 ? "#10B981" : "#EF4444" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Estado de Resultados</h1>
          <p className="text-xs text-muted-foreground">Resultado económico del período</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <ExportButtons tipo="estado-resultados" params={{ periodo }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-1 border rounded-lg p-4 bg-card">
          {/* INGRESOS */}
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide pb-1">Ingresos</div>
          <LineaResultados label="Alojamiento" value={data.ingresos?.alojamiento} indent />
          <LineaResultados label="Restaurant" value={data.ingresos?.restaurant} indent />
          <LineaResultados label="Spa" value={data.ingresos?.spa} indent />
          <div className="border-t my-1" />
          <LineaResultados label="TOTAL INGRESOS" value={data.ingresos?.totalIngresos} bold />

          {/* CMV */}
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide pb-1 pt-3">Costo de Mercadería</div>
          <LineaResultados label="Alimentos y bebidas" value={data.costosMercaderia?.alimentosYBebidas} indent />
          <LineaResultados label="Housekeeping" value={data.costosMercaderia?.housekeeping} indent />
          <div className="border-t my-1" />
          <LineaResultados label="TOTAL CMV" value={data.costosMercaderia?.totalCostos} bold />

          {/* Utilidad Bruta */}
          <div className="border-t border-double mt-2 pt-2" />
          <LineaResultados label={`UTILIDAD BRUTA — Margen: ${(data.margenBruto ?? 0).toFixed(1)}%`} value={data.utilidadBruta} bold color={data.utilidadBruta >= 0 ? "#059669" : "#DC2626"} />

          {/* GASTOS */}
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide pb-1 pt-3">Gastos Operativos</div>
          <LineaResultados label="Personal y honorarios" value={(data.gastosOperativos?.personal ?? 0) + (data.gastosOperativos?.honorarios ?? 0)} indent />
          <LineaResultados label="Servicios (luz/gas/tel)" value={data.gastosOperativos?.servicios?.total ?? 0} indent />
          <LineaResultados label="Mantenimiento" value={data.gastosOperativos?.mantenimiento} indent />
          <LineaResultados label="Publicidad y comercial" value={(data.gastosOperativos?.publicidad ?? 0) + (data.gastosOperativos?.gastosComerciales ?? 0)} indent />
          <LineaResultados label="Gastos bancarios" value={data.gastosOperativos?.gastosBancarios} indent />
          <LineaResultados label="Otros gastos" value={(data.gastosOperativos?.gastosGenerales ?? 0) + (data.gastosOperativos?.otrosGastos ?? 0)} indent />
          <div className="border-t my-1" />
          <LineaResultados label="TOTAL GASTOS OPERATIVOS" value={data.gastosOperativos?.totalGastosOperativos} bold />

          {/* EBITDA */}
          <div className="border-t border-double mt-2 pt-2" />
          <LineaResultados label={`EBITDA — Margen: ${(data.margenEbitda ?? 0).toFixed(1)}%`} value={data.ebitda} bold color={data.ebitda >= 0 ? "#059669" : "#DC2626"} />

          {/* Impuestos */}
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide pb-1 pt-3">Impuestos</div>
          <LineaResultados label="IIBB (retenciones)" value={data.impuestos?.iibb} indent />
          <div className="border-t my-1" />
          <LineaResultados label="RESULTADO NETO" value={data.resultadoNeto} bold color={data.resultadoNeto >= 0 ? "#059669" : "#DC2626"} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Resumen visual</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `$${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => `$${fPeso(v)}`} />
                  <Bar dataKey="value" fill="#3B82F6">
                    {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-2">
            <KpiCard title="Ingresos totales" value={data.ingresos?.totalIngresos ?? 0} unit="$" />
            <KpiCard title="EBITDA" value={data.ebitda ?? 0} unit="$" />
            <KpiCard title="Margen neto" value={`${(data.margenNeto ?? 0).toFixed(1)}%`} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPIs Hoteleros ───────────────────────────────────────────────────────────

function KpisReport() {
  const [periodo, setPeriodo] = useState(currentPeriodo());

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/kpis", periodo],
    queryFn: () => fetch(`/api/reports/kpis?periodo=${encodeURIComponent(periodo)}`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Calculando KPIs...</div>;
  if (!data) return null;

  const COLORS = ["#3B82F6","#F59E0B","#10B981","#8B5CF6","#EF4444","#06B6D4","#84CC16","#F43F5E"];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">KPIs Hoteleros</h1>
        <div className="flex gap-3 items-center">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <ExportButtons tipo="kpis" params={{ periodo }} />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard title="Ocupación" value={`${(data.ocupacion ?? 0).toFixed(1)}%`} delta={data.vsMessAnterior?.ocupacion} />
        <KpiCard title="ADR (Tarifa Media)" value={data.tarifaMedia ?? 0} delta={data.vsMessAnterior?.tarifaMedia} unit="$" />
        <KpiCard title="RevPAR" value={data.revpar ?? 0} delta={data.vsMessAnterior?.revpar} unit="$" />
        <KpiCard title="Hab. ocupadas (noc.)" value={`${fPeso(data.habitacionesOcupadas)} noc.`} />
        <KpiCard title="Huéspedes totales" value={fPeso(data.totalHuespedes)} />
        <KpiCard title="Estadía promedio" value={`${data.estanciaPromedio ?? 0} días`} />
      </div>

      {/* Sparkline por día */}
      {data.porDia?.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Ocupación diaria del mes</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data.porDia} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="fecha" tick={{ fontSize: 9 }} tickFormatter={d => d?.slice(8)} />
                <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                <Line type="monotone" dataKey="pct" stroke="#3B82F6" dot={false} strokeWidth={2} name="Ocupación %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Canal distribution */}
      {data.distribucionCanal?.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Distribución por canal</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.distribucionCanal} dataKey="porcentaje" nameKey="canal" cx="50%" cy="50%" outerRadius={80} label={({ canal, porcentaje }) => `${canal}: ${porcentaje}%`} labelLine={false}>
                    {data.distribucionCanal.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v}%`} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Ingresos por canal</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.distribucionCanal.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-sm flex-1">{c.canal}</span>
                    <span className="text-xs text-muted-foreground">{c.porcentaje}%</span>
                    <span className="text-sm font-medium">${fPeso(c.ingresos)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Análisis de Ocupación ────────────────────────────────────────────────────

function OcupacionReport() {
  const now = new Date();
  const [desde, setDesde] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [hasta, setHasta] = useState(format(endOfMonth(now), "yyyy-MM-dd"));

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/ocupacion", desde, hasta],
    queryFn: () => fetch(`/api/reports/ocupacion?desde=${desde}&hasta=${hasta}`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Calculando ocupación...</div>;

  const getHeatColor = (pct: number) => {
    if (pct >= 80) return "bg-green-600 text-white";
    if (pct >= 60) return "bg-green-400 text-white";
    if (pct >= 40) return "bg-yellow-400 text-gray-900";
    if (pct >= 20) return "bg-orange-400 text-white";
    return "bg-red-400 text-white";
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Análisis de Ocupación</h1>
        <div className="flex gap-2 items-center">
          <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="w-36 h-8 text-sm" />
          <span className="text-muted-foreground">a</span>
          <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="w-36 h-8 text-sm" />
          <ExportButtons tipo="ocupacion" params={{ desde, hasta }} />
        </div>
      </div>

      {data && (
        <>
          {/* Heatmap del mes */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Heatmap de ocupación diaria</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {(data.porDia ?? []).map((d: any, i: number) => (
                  <div key={i} title={`${d.fecha}: ${d.porcentaje?.toFixed(1)}% (${d.ocupadas}/${d.disponibles})`}
                    className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${getHeatColor(d.porcentaje ?? 0)}`}>
                    {new Date(d.fecha + "T12:00:00").getDate()}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-400" />{"<20%"}</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-400" />{"20-40%"}</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-400" />{"40-60%"}</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-400" />{"60-80%"}</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-600" />{">80%"}</div>
              </div>
            </CardContent>
          </Card>

          {/* Chart */}
          {data.porDia?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Ocupación e ingresos por día</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.porDia} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="fecha" tick={{ fontSize: 8 }} tickFormatter={d => d?.slice(8)} />
                    <YAxis yAxisId="left" tick={{ fontSize: 9 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => `$${Math.round(v / 1000)}k`} />
                    <Tooltip />
                    <Bar yAxisId="left" dataKey="porcentaje" name="Ocupación %" fill="#3B82F6" opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Por tipo de habitación */}
          {data.porTipoHabitacion?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Por tipo de habitación</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.porTipoHabitacion.map((t: any, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm w-32 shrink-0">{t.tipo}</span>
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div className="bg-blue-500 rounded-full h-2" style={{ width: `${Math.min(t.ocupacion ?? 0, 100)}%` }} />
                      </div>
                      <span className="text-xs w-12 text-right">{(t.ocupacion ?? 0).toFixed(1)}%</span>
                      <span className="text-xs text-muted-foreground w-20 text-right">ADR: ${fPeso(t.tarifaMedia)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Ingresos por Área ────────────────────────────────────────────────────────

function IngresosReport() {
  const [periodo, setPeriodo] = useState(currentPeriodo());

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/ingresos", periodo],
    queryFn: () => fetch(`/api/reports/ingresos?periodo=${encodeURIComponent(periodo)}`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Calculando ingresos...</div>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Ingresos por Área</h1>
        <div className="flex gap-3 items-center">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <ExportButtons tipo="ingresos" params={{ periodo }} />
        </div>
      </div>

      {/* KPI total */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Total ingresos" value={data.totalIngresos ?? 0} unit="$" delta={data.variacionTotal} />
        {(data.areas ?? []).map((a: any) => (
          <KpiCard key={a.nombre} title={a.nombre} value={a.ingresos} unit="$" delta={a.variacionMesAnterior} />
        ))}
      </div>

      {/* Donut + Line chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Distribución por área</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.areas ?? []} dataKey="ingresos" nameKey="nombre" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label={({ nombre, porcentaje }) => `${porcentaje}%`}>
                  {(data.areas ?? []).map((a: any) => <Cell key={a.nombre} fill={a.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `$${fPeso(v)}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Evolución diaria</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.porDia ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="fecha" tick={{ fontSize: 8 }} tickFormatter={d => d?.slice(8)} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `$${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => `$${fPeso(v)}`} />
                <Line type="monotone" dataKey="alojamiento" stroke="#3B82F6" dot={false} name="Alojamiento" />
                <Line type="monotone" dataKey="restaurant" stroke="#F59E0B" dot={false} name="Restaurant" />
                <Line type="monotone" dataKey="spa" stroke="#10B981" dot={false} name="Spa" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top empresas */}
      {(data.topEmpresas ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 empresas (Factura A)</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.topEmpresas.map((e: any, i: number) => (
                <div key={i} className="flex justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium">{i + 1}. {e.razonSocial}</span>
                    <span className="text-xs text-muted-foreground ml-2">{e.cuit}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">${fPeso(e.totalFacturado)}</div>
                    <div className="text-xs text-muted-foreground">{e.cantidadFacturas} fact.</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Costos por Departamento ──────────────────────────────────────────────────

function CostosReport() {
  const [periodo, setPeriodo] = useState(currentPeriodo());

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/costos", periodo],
    queryFn: () => fetch(`/api/reports/costos?periodo=${encodeURIComponent(periodo)}`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Calculando costos...</div>;
  if (!data) return null;

  const COLORS_DEPTO = ["#EF4444","#F97316","#F59E0B","#84CC16","#06B6D4","#8B5CF6","#EC4899"];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Costos por Departamento</h1>
        <div className="flex gap-3 items-center">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <ExportButtons tipo="costos" params={{ periodo }} />
        </div>
      </div>

      <KpiCard title="Costo total del período" value={data.totalGeneral ?? 0} unit="$" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pie chart */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Distribución de costos</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.departamentos ?? []} dataKey="totalDepto" nameKey="nombre" cx="50%" cy="50%" outerRadius={90} label={({ nombre, porcentajeDelTotal }) => `${(porcentajeDelTotal ?? 0).toFixed(0)}%`} labelLine={false}>
                  {(data.departamentos ?? []).map((_: any, i: number) => <Cell key={i} fill={COLORS_DEPTO[i % COLORS_DEPTO.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `$${fPeso(v)}`} />
                <Legend formatter={(v) => v.substring(0, 18)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Horizontal bar chart */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Comparativo por departamento</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data.departamentos ?? []).map((d: any, i: number) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <div className="flex items-center gap-1">
                      <span>{d.nombre}</span>
                      {d.variacionMesAnterior > 10 && <Badge variant="destructive" className="text-xs px-1">↑</Badge>}
                      {d.variacionMesAnterior < -10 && <Badge variant="outline" className="text-xs px-1 text-green-700 border-green-400">↓</Badge>}
                    </div>
                    <span className="font-medium">${fPeso(d.totalDepto)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="rounded-full h-2" style={{ width: `${Math.min(d.porcentajeDelTotal ?? 0, 100)}%`, background: COLORS_DEPTO[i % COLORS_DEPTO.length] }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detalle */}
      <div className="space-y-3">
        {(data.departamentos ?? []).filter((d: any) => d.totalDepto > 0).map((d: any, i: number) => (
          <Card key={i}>
            <CardHeader className="pb-1">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm">{d.nombre}</CardTitle>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${d.variacionMesAnterior > 0 ? "text-red-600" : "text-green-600"}`}>
                    {d.variacionMesAnterior > 0 ? "↑" : "↓"} {Math.abs(d.variacionMesAnterior).toFixed(1)}% vs mes ant.
                  </span>
                  <span className="font-bold">${fPeso(d.totalDepto)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-0.5">
                {d.cuentas.slice(0, 8).map((c: any, j: number) => (
                  <div key={j} className="flex justify-between text-xs py-0.5">
                    <span className="text-muted-foreground">{c.codigo !== "—" ? `[${c.codigo}]` : ""} {c.nombre}</span>
                    <span>${fPeso(c.monto)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Ranking Proveedores ──────────────────────────────────────────────────────

function ProveedoresReport() {
  const [periodo, setPeriodo] = useState(currentPeriodo());

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/proveedores", periodo],
    queryFn: () => fetch(`/api/reports/proveedores?periodo=${encodeURIComponent(periodo)}&top=10`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Calculando ranking...</div>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Ranking de Proveedores</h1>
        <div className="flex gap-3 items-center">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <ExportButtons tipo="proveedores" params={{ periodo }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <KpiCard title="Total compras del período" value={data.totalComprasDelPeriodo ?? 0} unit="$" />
        <KpiCard title="Proveedores activos" value={`${data.cantidadProveedoresActivos ?? 0}`} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Ranking top 10</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-bold text-muted-foreground bg-muted/30">
              <div className="col-span-1">#</div>
              <div className="col-span-4">Proveedor</div>
              <div className="col-span-2">CUIT</div>
              <div className="col-span-2 text-right">Facturas</div>
              <div className="col-span-2 text-right">Total</div>
              <div className="col-span-1 text-right">%</div>
            </div>
            {(data.ranking ?? []).map((r: any) => (
              <div key={r.posicion} className="grid grid-cols-12 gap-2 px-4 py-2 text-sm hover:bg-muted/20" data-testid={`row-prov-${r.posicion}`}>
                <div className="col-span-1 font-bold text-muted-foreground">{r.posicion}</div>
                <div className="col-span-4 font-medium truncate">{r.proveedor}</div>
                <div className="col-span-2 text-xs text-muted-foreground">{r.cuit}</div>
                <div className="col-span-2 text-right">{r.cantidadFacturas}</div>
                <div className="col-span-2 text-right font-semibold">${fPeso(r.totalComprado)}</div>
                <div className="col-span-1 text-right text-xs text-muted-foreground">{r.porcentajeDelTotal}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {(data.mayorAlza?.length > 0 || data.mayorBaja?.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {data.mayorAlza?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600">Mayor alza vs mes anterior</CardTitle></CardHeader>
              <CardContent>
                {data.mayorAlza.map((r: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span className="truncate">{r.proveedor}</span>
                    <Badge variant="destructive" className="text-xs shrink-0">+{r.variacion.toFixed(1)}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {data.mayorBaja?.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-green-600">Mayor baja vs mes anterior</CardTitle></CardHeader>
              <CardContent>
                {data.mayorBaja.map((r: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span className="truncate">{r.proveedor}</span>
                    <Badge variant="outline" className="text-xs shrink-0 text-green-700 border-green-400">{r.variacion.toFixed(1)}%</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Comparativo Mensual ──────────────────────────────────────────────────────

function ComparativoReport() {
  const [año, setAño] = useState(String(new Date().getFullYear()));

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/reports/comparativo", año],
    queryFn: () => fetch(`/api/reports/comparativo?anio=${año}`, { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Calculando comparativo anual...</div>;
  if (!data) return null;

  const validMeses = (data.meses ?? []).filter((m: any) => m.ingresoTotal !== null);

  const YEARS = [2026, 2025, 2024, 2023].map(y => String(y));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Comparativo Mensual {año}</h1>
        <div className="flex gap-3 items-center">
          <Select value={año} onValueChange={setAño}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <ExportButtons tipo="comparativo" params={{ anio: año }} />
        </div>
      </div>

      {/* KPIs acumulados */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Ocupación promedio año" value={`${(data.acumulado?.ocupacionPromedio ?? 0).toFixed(1)}%`} />
        <KpiCard title="Ingresos acumulados" value={data.acumulado?.ingresoTotal ?? 0} unit="$" />
        <KpiCard title="Costos acumulados" value={data.acumulado?.costoTotal ?? 0} unit="$" />
        <KpiCard title="EBITDA acumulado" value={data.acumulado?.ebitda ?? 0} unit="$" />
      </div>

      {/* Chart */}
      {validMeses.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Ingresos vs Costos vs EBITDA por mes</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={validMeses} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `$${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => `$${fPeso(v)}`} />
                <Legend />
                <Line type="monotone" dataKey="ingresoTotal" stroke="#3B82F6" name="Ingresos" strokeWidth={2} dot />
                <Line type="monotone" dataKey="costoTotal" stroke="#EF4444" name="Costos" strokeWidth={2} dot />
                <Line type="monotone" dataKey="ebitda" stroke="#10B981" name="EBITDA" strokeWidth={2} dot strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tabla de 12 columnas */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Tabla resumen anual</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="px-3 py-2 text-left">Indicador</th>
                {(data.meses ?? []).map((m: any) => (
                  <th key={m.mes} className="px-2 py-2 text-right">{m.mes}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                { label: "Ocupación", key: "ocupacion", format: (v: any) => v !== null ? `${v?.toFixed(1)}%` : "—" },
                { label: "RevPAR ($)", key: "revpar", format: (v: any) => v !== null ? `$${fPeso(v)}` : "—" },
                { label: "Ingresos ($)", key: "ingresoTotal", format: (v: any) => v !== null ? `$${fPeso(v)}` : "—" },
                { label: "Costos ($)", key: "costoTotal", format: (v: any) => v !== null ? `$${fPeso(v)}` : "—" },
                { label: "EBITDA ($)", key: "ebitda", format: (v: any) => v !== null ? `$${fPeso(v)}` : "—" },
                { label: "Margen EBITDA", key: "margenEbitda", format: (v: any) => v !== null ? `${v?.toFixed(1)}%` : "—" },
              ].map(row => (
                <tr key={row.key} className="hover:bg-muted/20">
                  <td className="px-3 py-1.5 font-medium text-xs">{row.label}</td>
                  {(data.meses ?? []).map((m: any) => (
                    <td key={m.mes} className={`px-2 py-1.5 text-right text-xs ${m[row.key] < 0 ? "text-red-600" : ""}`}>
                      {row.format(m[row.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
