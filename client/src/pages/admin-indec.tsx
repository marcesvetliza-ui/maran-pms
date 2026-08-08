import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList, Download, Globe, Bed, CalendarDays, Users,
} from "lucide-react";

/* ─── CSV export ─────────────────────────────────────────── */
function exportCSV(filename: string, sections: { title: string; headers: string[]; rows: (string | number)[][] }[]) {
  const lines: string[] = [];
  for (const s of sections) {
    lines.push(s.title);
    lines.push(s.headers.join(","));
    for (const row of s.rows) {
      lines.push(row.map(v => {
        const val = String(v ?? "");
        return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(","));
    }
    lines.push("");
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Types ──────────────────────────────────────────────── */
type IndecRow = {
  nights: number;
  nationality: string | null;
  roomTypeName: string | null;
  finalRatePerNight: string | null;
  baseRatePerNight: string | null;
};

/* ─── Helpers ────────────────────────────────────────────── */
function getArgentinaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

function getArgentinaFirstOfMonth() {
  const d = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  // d is "YYYY-MM-DD"
  return d.slice(0, 7) + "-01";
}

/* ─── Page ───────────────────────────────────────────────── */
export default function AdminIndecPage() {
  const today = getArgentinaToday();
  const firstOfMonth = getArgentinaFirstOfMonth();

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo]     = useState(today);

  const { data: rows = [], isFetching } = useQuery<IndecRow[]>({
    queryKey: ["/api/reports/indec", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/reports/indec?from=${from}&to=${to}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar datos INDEC");
      return res.json();
    },
    enabled: !!from && !!to,
  });

  /* ── Agregación 1: por nacionalidad ── */
  const byNat: Record<string, { stays: number; totalNights: number }> = {};
  for (const r of rows) {
    const key = r.nationality?.trim() || "No especificada";
    if (!byNat[key]) byNat[key] = { stays: 0, totalNights: 0 };
    byNat[key].stays++;
    byNat[key].totalNights += r.nights ?? 0;
  }
  const natRows = Object.entries(byNat)
    .map(([nat, v]) => ({ nat, ...v, avgNights: v.totalNights / v.stays }))
    .sort((a, b) => b.stays - a.stays);
  const totalStays = rows.length;

  /* ── Agregación 2: distribución de noches ── */
  const dist: Record<string, number> = { "1 noche": 0, "2-3 noches": 0, "4-7 noches": 0, "8+ noches": 0 };
  let sumNights = 0;
  for (const r of rows) {
    const n = r.nights ?? 1;
    sumNights += n;
    if (n === 1) dist["1 noche"]++;
    else if (n <= 3) dist["2-3 noches"]++;
    else if (n <= 7) dist["4-7 noches"]++;
    else dist["8+ noches"]++;
  }
  const avgNightsGlobal = totalStays > 0 ? sumNights / totalStays : 0;

  /* ── Agregación 3: tarifa promedio por categoría ── */
  const byCat: Record<string, { stays: number; totalRate: number; rateCount: number; totalNights: number }> = {};
  for (const r of rows) {
    const key = r.roomTypeName || "Sin categoría";
    if (!byCat[key]) byCat[key] = { stays: 0, totalRate: 0, rateCount: 0, totalNights: 0 };
    byCat[key].stays++;
    byCat[key].totalNights += r.nights ?? 0;
    const rate = parseFloat(r.finalRatePerNight ?? r.baseRatePerNight ?? "0");
    if (rate > 0) {
      byCat[key].totalRate += rate;
      byCat[key].rateCount++;
    }
  }
  const catRows = Object.entries(byCat)
    .map(([cat, v]) => ({ cat, ...v, avgRate: v.rateCount > 0 ? v.totalRate / v.rateCount : 0 }))
    .sort((a, b) => b.stays - a.stays);

  /* ── Export ── */
  const handleExport = () => {
    const label = `${from}_${to}`;
    exportCSV(`INDEC-${label}.csv`, [
      {
        title: "1. Estadías por Nacionalidad",
        headers: ["País/Región", "N° Estadías", "% del Total", "Noches Totales", "Prom. Noches"],
        rows: natRows.map(r => [
          r.nat,
          r.stays,
          totalStays ? ((r.stays / totalStays) * 100).toFixed(1) + "%" : "0%",
          r.totalNights,
          r.avgNights.toFixed(1),
        ]),
      },
      {
        title: "2. Distribución de Estadías por Duración",
        headers: ["Duración", "N° Estadías", "% del Total"],
        rows: Object.entries(dist).map(([k, v]) => [
          k, v, totalStays ? ((v / totalStays) * 100).toFixed(1) + "%" : "0%",
        ]),
      },
      {
        title: "3. Tarifa Promedio por Categoría de Habitación",
        headers: ["Categoría", "N° Estadías", "Noches Totales", "Tarifa Prom. por Noche ($)"],
        rows: catRows.map(r => [
          r.cat, r.stays, r.totalNights,
          r.avgRate > 0 ? r.avgRate.toLocaleString("es-AR", { minimumFractionDigits: 2 }) : "—",
        ]),
      },
    ]);
  };

  const fmt = (n: number) => n.toLocaleString("es-AR");
  const fmtRate = (n: number) => "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2 });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Reportes INDEC</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Estadísticas hoteleras para el Instituto Nacional de Estadística y Censos · Argentina
          </p>
        </div>
        {rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar CSV
          </Button>
        )}
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-5 items-end">
            <div className="grid gap-1 min-w-[160px]">
              <Label className="text-xs">Desde (check-out)</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1 min-w-[160px]">
              <Label className="text-xs">Hasta (check-out)</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            {!isFetching && rows.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pb-0.5">
                <Badge variant="secondary" className="text-xs">{fmt(totalStays)} estadías</Badge>
                <Badge variant="secondary" className="text-xs">{fmt(sumNights)} pernoctaciones</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isFetching ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground border rounded-xl bg-muted/20">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Sin estadías con check-out en el período seleccionado</p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* ─── 1. Por Nacionalidad ─────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                1. Estadías por Nacionalidad
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs border-b">
                    <th className="text-left px-4 py-2.5 font-medium">País / Región</th>
                    <th className="text-right px-4 py-2.5 font-medium">Estadías</th>
                    <th className="text-right px-4 py-2.5 font-medium">% del total</th>
                    <th className="text-right px-4 py-2.5 font-medium">Noches totales</th>
                    <th className="text-right px-4 py-2.5 font-medium">Prom. noches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {natRows.map(r => (
                    <tr key={r.nat} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">
                        {r.nat === "No especificada" ? (
                          <span className="text-muted-foreground italic">{r.nat}</span>
                        ) : r.nat}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(r.stays)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {totalStays ? ((r.stays / totalStays) * 100).toFixed(1) : 0}%
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(r.totalNights)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.avgNights.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 font-semibold border-t">
                    <td className="px-4 py-2.5">TOTAL</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totalStays)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">100%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(sumNights)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{avgNightsGlobal.toFixed(1)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* ─── 2. Promedio de noches ───────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                2. Promedio de Noches por Viajero
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 rounded-lg bg-muted/30 border">
                  <p className="text-3xl font-bold">{avgNightsGlobal.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground mt-1">noches promedio / viajero</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/30 border">
                  <p className="text-3xl font-bold">{fmt(totalStays)}</p>
                  <p className="text-xs text-muted-foreground mt-1">viajeros (check-outs)</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/30 border">
                  <p className="text-3xl font-bold">{fmt(sumNights)}</p>
                  <p className="text-xs text-muted-foreground mt-1">pernoctaciones totales</p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs border-b">
                    <th className="text-left px-4 py-2 font-medium">Duración de estadía</th>
                    <th className="text-right px-4 py-2 font-medium">N° estadías</th>
                    <th className="text-right px-4 py-2 font-medium">% del total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(dist).map(([label, count]) => (
                    <tr key={label} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">{label}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(count)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {totalStays ? ((count / totalStays) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* ─── 3. Tarifa por categoría ─────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bed className="h-4 w-4 text-muted-foreground" />
                3. Tarifa Promedio por Categoría de Habitación
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs border-b">
                    <th className="text-left px-4 py-2.5 font-medium">Categoría</th>
                    <th className="text-right px-4 py-2.5 font-medium">Estadías</th>
                    <th className="text-right px-4 py-2.5 font-medium">Noches totales</th>
                    <th className="text-right px-4 py-2.5 font-medium">Tarifa prom./noche</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {catRows.map(r => (
                    <tr key={r.cat} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{r.cat}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(r.stays)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmt(r.totalNights)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                        {r.avgRate > 0 ? fmtRate(r.avgRate) : <span className="text-muted-foreground font-normal">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}
