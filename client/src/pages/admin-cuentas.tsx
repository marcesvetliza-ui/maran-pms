import { useState } from "react";
import { fmtMoney } from "@/lib/utils";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Users2,
  Building2,
  Plane,
  BarChart3,
  CalendarDays,
  Plus,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertCircle,
  User,
  ExternalLink,
  ChevronRight,
  Printer,
  Clock,
  FileText,
  Search,
  Receipt,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Movement = {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string;
  entityTypeName: string;
  description: string;
  amount: string;
  date: string;
  type: string;
};

type ExpandedCard = "companies" | "agencies" | "guests" | "all" | null;

type AccountMovement = {
  id: string;
  entityType: string;
  entityId: string;
  date: string;
  type: "cargo" | "pago" | "nota_credito" | "ajuste";
  description: string;
  amount: string;
  reservationCode?: string | null;
  guestName?: string | null;
  reference?: string | null;
  paymentMethod?: string | null;
  saldoPendiente?: number;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  company: "Empresa",
  agency: "Agencia",
  guest: "Cliente",
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  cargo: "Cargo",
  pago: "Pago",
  nota_credito: "Nota Crédito",
  ajuste: "Ajuste",
};

function fmtMoney(n: string | number) {
  return `$${parseFloat(String(n)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

function printEntityStatement(entityName: string, entityType: string, movements: AccountMovement[]) {
  const balance = movements.reduce((s, m) => s + parseFloat(m.amount), 0);
  const today = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  const entityTypeName = TYPE_LABELS[entityType] ?? entityType;

  const rows = movements.map((m) => {
    const amt = parseFloat(m.amount);
    const ref = m.reservationCode ?? m.guestName ?? m.reference ?? "—";
    const color = amt > 0 ? "#dc2626" : "#16a34a";
    const typeColor = m.type === "cargo" ? "#dc2626" : m.type === "pago" ? "#16a34a" : "#2563eb";
    return `
      <tr>
        <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;">${m.date}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;">
          <span style="background:#f3f4f6;color:${typeColor};border:1px solid ${typeColor}33;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:600;">
            ${MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
          </span>
        </td>
        <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;">${m.description}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:11px;">${ref}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:${color};">${fmtMoney(m.amount)}</td>
      </tr>`;
  }).join("");

  const balanceColor = balance > 0 ? "#dc2626" : "#16a34a";
  const balanceLabel = balance > 0 ? "SALDO DEUDOR" : "SALDO ACREEDOR";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Estado de Cuenta — ${entityName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; padding: 32px 40px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 2px solid #1e3a5f; padding-bottom: 18px; }
    .hotel-name { font-size: 22px; font-weight: 800; color: #1e3a5f; letter-spacing: -0.5px; }
    .hotel-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .doc-info { text-align: right; }
    .doc-title { font-size: 18px; font-weight: 700; color: #1e3a5f; }
    .doc-meta { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .entity-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 22px; }
    .entity-type { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; font-weight: 600; }
    .entity-name { font-size: 20px; font-weight: 700; color: #111; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    thead tr { background: #1e3a5f; color: #fff; }
    thead th { padding: 9px 10px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    thead th:last-child { text-align: right; }
    tbody tr:hover { background: #f9fafb; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    .balance-row { margin-top: 0; }
    .balance-row td { padding: 10px 10px; font-weight: 700; font-size: 14px; background: #f1f5f9; }
    .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 14px; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="hotel-name">Maran Suites &amp; Torres</div>
      <div class="hotel-sub">Sistema de Gestión Hotelera</div>
    </div>
    <div class="doc-info">
      <div class="doc-title">Estado de Cuenta</div>
      <div class="doc-meta">Emitido: ${today}</div>
    </div>
  </div>

  <div class="entity-box">
    <div class="entity-type">${entityTypeName}</div>
    <div class="entity-name">${entityName}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Tipo</th>
        <th>Descripción</th>
        <th>Referencia</th>
        <th style="text-align:right;">Importe</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#9ca3af;">Sin movimientos</td></tr>'}
    </tbody>
    <tfoot>
      <tr class="balance-row">
        <td colspan="3"></td>
        <td style="text-align:right;color:#6b7280;font-size:12px;">${balanceLabel}:</td>
        <td style="text-align:right;color:${balanceColor};">${fmtMoney(Math.abs(balance))}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <span>Maran Suites &amp; Torres — Documento generado automáticamente</span>
    <span>${today}</span>
  </div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (w) { w.document.write(html); w.document.close(); }
}

function printDebtListing(
  title: string,
  entities: { id: string; name: string; balance: number }[]
) {
  const today = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  const sorted = [...entities].sort((a, b) => b.balance - a.balance);
  const total = sorted.reduce((s, e) => s + e.balance, 0);

  const rows = sorted.map((e, i) => {
    const color = e.balance > 0 ? "#dc2626" : "#16a34a";
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:500;">${e.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${color};">${fmtMoney(e.balance)}</td>
      </tr>`;
  }).join("");

  const totalColor = total > 0 ? "#dc2626" : "#16a34a";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; padding: 32px 40px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 2px solid #1e3a5f; padding-bottom: 18px; }
    .hotel-name { font-size: 22px; font-weight: 800; color: #1e3a5f; letter-spacing: -0.5px; }
    .hotel-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .doc-info { text-align: right; }
    .doc-title { font-size: 18px; font-weight: 700; color: #1e3a5f; }
    .doc-meta { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .summary { display: flex; gap: 24px; margin-bottom: 22px; }
    .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 18px; flex: 1; text-align: center; }
    .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; font-weight: 600; }
    .stat-value { font-size: 22px; font-weight: 800; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1e3a5f; color: #fff; }
    thead th { padding: 9px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    thead th:last-child { text-align: right; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    .total-row td { padding: 10px 12px; font-weight: 700; font-size: 14px; background: #f1f5f9; border-top: 2px solid #1e3a5f; }
    .footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 14px; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="hotel-name">Maran Suites &amp; Torres</div>
      <div class="hotel-sub">Sistema de Gestión Hotelera</div>
    </div>
    <div class="doc-info">
      <div class="doc-title">${title}</div>
      <div class="doc-meta">Emitido: ${today}</div>
    </div>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="stat-label">Cantidad</div>
      <div class="stat-value" style="color:#1e3a5f;">${sorted.length}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total adeudado</div>
      <div class="stat-value" style="color:${totalColor};">${fmtMoney(total)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;">#</th>
        <th>Nombre</th>
        <th style="text-align:right;">Saldo</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="3" style="text-align:center;padding:20px;color:#9ca3af;">Sin registros con saldo</td></tr>'}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="2" style="text-align:right;color:#6b7280;font-size:12px;">TOTAL:</td>
        <td style="text-align:right;color:${totalColor};">${fmtMoney(total)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <span>Maran Suites &amp; Torres — Documento generado automáticamente</span>
    <span>${today}</span>
  </div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=800,height=650");
  if (w) { w.document.write(html); w.document.close(); }
}

function EntityMovementsInline({
  entityType,
  entityId,
  entityName,
  summaryBalance,
}: {
  entityType: string;
  entityId: string;
  entityName: string;
  summaryBalance?: number;
}) {
  const { data: movements = [], isLoading } = useQuery<AccountMovement[]>({
    queryKey: ["/api/account-movements", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/account-movements/${entityType}/${entityId}`);
      if (!res.ok) throw new Error("Error fetching movements");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="mt-1 px-3 py-2 bg-muted/40 rounded-md space-y-1">
        {[1, 2, 3].map((i) => <div key={i} className="h-4 bg-muted animate-pulse rounded" />)}
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="mt-1 px-3 py-2 bg-muted/30 rounded-md text-xs text-muted-foreground text-center">
        Sin movimientos registrados
      </div>
    );
  }

  const balance = summaryBalance !== undefined
    ? summaryBalance
    : movements.reduce((s, m) => s + parseFloat(m.amount), 0);

  return (
    <div className="mt-1 mb-2 border rounded-md overflow-hidden bg-muted/20">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b">
        <span className="text-xs text-muted-foreground font-medium">
          {movements.length} movimiento{movements.length !== 1 ? "s" : ""}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={() => printEntityStatement(entityName, entityType, movements)}
          data-testid={`button-print-statement-${entityId}`}
        >
          <Printer className="h-3 w-3" />
          Imprimir estado de cuenta
        </Button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground">
            <th className="text-left px-3 py-1.5 font-medium">Fecha</th>
            <th className="text-left px-3 py-1.5 font-medium">Tipo</th>
            <th className="text-left px-3 py-1.5 font-medium">Descripción</th>
            <th className="text-left px-3 py-1.5 font-medium">Reserva / Ref.</th>
            <th className="text-right px-3 py-1.5 font-medium">Importe</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {movements.map((m) => {
            const amount = parseFloat(m.amount);
            const isDebt = amount > 0;

            // Cargo payment status
            let cargoStatus: "pendiente" | "parcial" | "cobrado" | null = null;
            if (m.type === "cargo") {
              if (m.saldoPendiente === undefined) cargoStatus = "pendiente";
              else if (m.saldoPendiente <= 0.009) cargoStatus = "cobrado";
              else if (m.saldoPendiente < amount - 0.009) cargoStatus = "parcial";
              else cargoStatus = "pendiente";
            }

            const rowClass = cargoStatus === "cobrado"
              ? "hover:bg-muted/30 opacity-60"
              : "hover:bg-muted/30";

            return (
              <tr key={m.id} className={rowClass}>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{m.date}</td>
                <td className="px-3 py-1.5">
                  {m.type === "cargo" ? (
                    <span className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${
                          cargoStatus === "cobrado"
                            ? "text-green-700 border-green-400 bg-green-50"
                            : cargoStatus === "parcial"
                            ? "text-amber-600 border-amber-400 bg-amber-50"
                            : "text-red-600 border-red-300"
                        }`}
                      >
                        {cargoStatus === "cobrado" ? "Cobrado" : cargoStatus === "parcial" ? "Parcial" : "Cargo"}
                      </Badge>
                    </span>
                  ) : (
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${
                        m.type === "pago"
                          ? "text-green-600 border-green-300"
                          : "text-blue-600 border-blue-300"
                      }`}
                    >
                      {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-1.5 max-w-[200px] truncate">{m.description}</td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {m.reservationCode ? (
                    <span className="font-mono">{m.reservationCode}</span>
                  ) : m.guestName ? (
                    m.guestName
                  ) : (
                    m.reference ?? "—"
                  )}
                </td>
                <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${isDebt ? "text-red-600" : "text-green-600"}`}>
                  <div>{fmtMoney(m.amount)}</div>
                  {cargoStatus === "parcial" && m.saldoPendiente !== undefined && (
                    <div className="text-[10px] text-amber-600 font-normal">
                      Pdte: {fmtMoney(m.saldoPendiente)}
                    </div>
                  )}
                </td>
                <td className="px-1 py-1">
                  {m.type === "pago" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Ver recibo PDF"
                      onClick={() => window.open(`/api/account-movements/${m.id}/receipt-pdf`, "_blank")}
                      data-testid={`button-receipt-${m.id}`}
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted/50 font-semibold">
            <td colSpan={4} className="px-3 py-1.5 text-xs text-right text-muted-foreground">Saldo total:</td>
            <td className={`px-3 py-1.5 text-right tabular-nums text-xs ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
              {fmtMoney(balance)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Aging Report Section ────────────────────────────────────────────────────
// Calcula cuántos días tiene el saldo deudor más antiguo de cada entidad
// basado en los movimientos inline ya cargados.
// Como los movimientos se cargan lazy (EntityMovementsInline), usamos el
// endpoint /api/account-movements/report sin filtro de fechas para calcular
// la antigüedad global.

type AgingBucket = { label: string; days: [number, number]; color: string; bg: string };
const AGING_BUCKETS: AgingBucket[] = [
  { label: "0–30 días",  days: [0, 30],   color: "text-green-700 dark:text-green-400",  bg: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"  },
  { label: "31–60 días", days: [31, 60],  color: "text-amber-700 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"  },
  { label: "61–90 días", days: [61, 90],  color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800" },
  { label: "+90 días",   days: [91, Infinity], color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" },
];

function AgingReportSection({ accountSummary }: {
  accountSummary: { companies: { id: string; name: string; balance: number }[]; agencies: { id: string; name: string; balance: number }[]; guests: { id: string; name: string; balance: number }[] }
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Aggregate all debtors from the summary (only those with positive balance = debt)
  const allDebtors = [
    ...accountSummary.companies.filter(e => e.balance > 0).map(e => ({ ...e, type: "Empresa" })),
    ...accountSummary.agencies.filter(e => e.balance > 0).map(e => ({ ...e, type: "Agencia" })),
    ...(accountSummary.guests ?? []).filter(e => e.balance > 0).map(e => ({ ...e, type: "Cliente" })),
  ];

  // Fetch all movements without date filter to calculate aging from oldest unpaid charge
  const { data: allMovementsRaw, isLoading } = useQuery<AccountMovement[]>({
    queryKey: ["/api/account-movements/report-aging"],
    queryFn: async () => {
      const from = "2000-01-01";
      const to = new Date().toISOString().split("T")[0];
      const res = await apiRequest("GET", `/api/account-movements/report?from=${from}&to=${to}`);
      return res.json();
    },
  });
  const allMovements = Array.isArray(allMovementsRaw) ? allMovementsRaw : [];

  // For each debtor, find the oldest outstanding charge date
  function getOldestChargeAge(entityId: string): number {
    const charges = allMovements
      .filter(m => m.entityId === entityId && parseFloat(m.amount) > 0)
      .map(m => new Date(m.date).getTime());
    if (charges.length === 0) return 0;
    const oldest = Math.min(...charges);
    return Math.floor((today.getTime() - oldest) / (1000 * 60 * 60 * 24));
  }

  // Bucket debtors by age of oldest charge
  const bucketed = AGING_BUCKETS.map(bucket => ({
    ...bucket,
    debtors: allDebtors.filter(d => {
      const age = getOldestChargeAge(d.id);
      return age >= bucket.days[0] && age <= bucket.days[1];
    }),
    total: 0 as number,
  }));
  bucketed.forEach(b => { b.total = b.debtors.reduce((s, d) => s + d.balance, 0); });

  const hasAnyAging = bucketed.some(b => b.debtors.length > 0);

  return (
    <Card data-testid="card-aging-report">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Antigüedad de Deuda</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Clasificación por tiempo transcurrido desde el cargo más antiguo sin saldar
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : !hasAnyAging ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin datos suficientes para calcular antigüedad</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {bucketed.map(bucket => (
                <div key={bucket.label} className={`rounded-lg border p-3 text-center ${bucket.bg}`}>
                  <p className={`text-xs font-semibold mb-1 ${bucket.color}`}>{bucket.label}</p>
                  <p className={`text-xl font-bold tabular-nums ${bucket.color}`}>
                    {bucket.debtors.length}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bucket.debtors.length === 1 ? "deudor" : "deudores"}
                  </p>
                  {bucket.total > 0 && (
                    <p className={`text-xs font-semibold mt-1 tabular-nums ${bucket.color}`}>
                      ${bucket.total.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Detail rows for critical buckets (61+ days) */}
            {bucketed.filter(b => b.days[0] >= 61 && b.debtors.length > 0).map(bucket => (
              <div key={bucket.label} className="mb-3">
                <p className={`text-xs font-semibold mb-1.5 ${bucket.color}`}>
                  ⚠ {bucket.label} — deudores críticos
                </p>
                <div className="space-y-1">
                  {bucket.debtors.slice(0, 5).map(d => (
                    <div key={d.id} className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded border ${bucket.bg}`} data-testid={`aging-row-${d.id}`}>
                      <span className="font-medium truncate mr-2">{d.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground">{d.type}</span>
                        <span className={`font-bold tabular-nums ${bucket.color}`}>
                          ${d.balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ))}
                  {bucket.debtors.length > 5 && (
                    <p className="text-xs text-muted-foreground pl-2">
                      +{bucket.debtors.length - 5} más...
                    </p>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminCuentasPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [expandedCard, setExpandedCard] = useState<ExpandedCard>(null);
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);
  const [expandedEntityType, setExpandedEntityType] = useState<string | null>(null);

  const toggleEntityDetail = (type: string, id: string) => {
    if (expandedEntityId === id && expandedEntityType === type) {
      setExpandedEntityId(null);
      setExpandedEntityType(null);
    } else {
      setExpandedEntityId(id);
      setExpandedEntityType(type);
    }
  };

  const toggleCard = (card: ExpandedCard) =>
    setExpandedCard((prev) => (prev === card ? null : card));

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/reconcile-cc-payments");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Reconciliación completada",
        description: data.message || `${data.created} movimientos creados`,
      });
    },
    onError: () => {
      toast({ title: "Error en reconciliación", variant: "destructive" });
    },
  });

  const reconcileCheckoutDebtsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/reconcile-checkout-debts");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/account-summary"] });
      toast({
        title: "Revisión completada",
        description: data.message || `${data.created} cargo(s) creado(s)`,
      });
    },
    onError: () => {
      toast({ title: "Error al revisar saldos pendientes", variant: "destructive" });
    },
  });

  const [reporteFrom, setReporteFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [reporteTo, setReporteTo] = useState(() => new Date().toISOString().split("T")[0]);

  // Recibos emitidos filters
  const [recibosFrom, setRecibosFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [recibosTo, setRecibosTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [recibosEntityType, setRecibosEntityType] = useState("");
  const [recibosSearch, setRecibosSearch] = useState("");

  const { data: accountSummary, isLoading: summaryLoading } = useQuery<{
    companies: { id: string; name: string; balance: number }[];
    agencies: { id: string; name: string; balance: number }[];
    guests: { id: string; name: string; balance: number }[];
  }>({
    queryKey: ["/api/account-summary"],
  });

  type ReceiptMovement = AccountMovement & { entityName: string; entityTypeName: string };

  const { data: recibosRaw, isFetching: isRecibosFetching } = useQuery<ReceiptMovement[]>({
    queryKey: ["/api/account-movements/receipts", recibosFrom, recibosTo, recibosEntityType, recibosSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ from: recibosFrom, to: recibosTo });
      if (recibosEntityType) params.set("entityType", recibosEntityType);
      if (recibosSearch) params.set("search", recibosSearch);
      const res = await fetch(`/api/account-movements/receipts?${params}`);
      if (!res.ok) throw new Error("Error fetching receipts");
      return res.json();
    },
  });
  const recibos: ReceiptMovement[] = Array.isArray(recibosRaw) ? recibosRaw : [];

  const { data: reporteMovementsRaw, isFetching: isReporteFetching } = useQuery<Movement[]>({
    queryKey: ["/api/account-movements/report", reporteFrom, reporteTo],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/account-movements/report?from=${reporteFrom}&to=${reporteTo}`,
      );
      return res.json();
    },
  });
  const reporteMovements = Array.isArray(reporteMovementsRaw) ? reporteMovementsRaw : [];

  const totalCompaniesDebt = accountSummary?.companies.reduce((sum, c) => sum + c.balance, 0) || 0;
  const totalAgenciesDebt = accountSummary?.agencies.reduce((sum, a) => sum + a.balance, 0) || 0;
  const totalGuestsDebt = accountSummary?.guests?.reduce((sum, g) => sum + g.balance, 0) || 0;
  const totalDebt = totalCompaniesDebt + totalAgenciesDebt + totalGuestsDebt;

  const reporteCharges = reporteMovements.filter(m => parseFloat(m.amount) > 0);
  const reportePayments = reporteMovements.filter(m => parseFloat(m.amount) < 0);
  const reporteTotal = reporteMovements.reduce((sum, m) => sum + parseFloat(m.amount || "0"), 0);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin")}
          data-testid="button-back-admin"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-cuentas-title">
            Cuentas Corrientes
          </h1>
          <p className="text-muted-foreground text-sm">Empresas, Agencias y Clientes — saldos pendientes y movimientos</p>
        </div>
      </div>

      {/* Resumen de deuda — cards clickeables */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {summaryLoading ? (
          <>
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </>
        ) : (
          <>
            {/* Empresas */}
            <Card
              className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${expandedCard === "companies" ? "border-primary ring-1 ring-primary/20" : ""}`}
              onClick={() => toggleCard("companies")}
              data-testid="card-cc-empresas-total"
            >
              <CardContent className="pt-5 pb-4 text-center relative">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Empresas</p>
                </div>
                <p className={`text-2xl font-bold ${totalCompaniesDebt > 0 ? "text-red-600" : "text-green-600"}`} data-testid="text-companies-debt">
                  ${totalCompaniesDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {accountSummary?.companies.length || 0} empresa(s) con saldo
                </p>
                <div className="absolute bottom-2 right-2 text-muted-foreground">
                  {expandedCard === "companies" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </div>
              </CardContent>
            </Card>

            {/* Agencias */}
            <Card
              className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${expandedCard === "agencies" ? "border-primary ring-1 ring-primary/20" : ""}`}
              onClick={() => toggleCard("agencies")}
              data-testid="card-cc-agencias-total"
            >
              <CardContent className="pt-5 pb-4 text-center relative">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Plane className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Agencias</p>
                </div>
                <p className={`text-2xl font-bold ${totalAgenciesDebt > 0 ? "text-red-600" : "text-green-600"}`} data-testid="text-agencies-debt">
                  ${totalAgenciesDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {accountSummary?.agencies.length || 0} agencia(s) con saldo
                </p>
                <div className="absolute bottom-2 right-2 text-muted-foreground">
                  {expandedCard === "agencies" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </div>
              </CardContent>
            </Card>

            {/* Clientes */}
            <Card
              className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${expandedCard === "guests" ? "border-primary ring-1 ring-primary/20" : ""}`}
              onClick={() => toggleCard("guests")}
              data-testid="card-cc-huespedes-total"
            >
              <CardContent className="pt-5 pb-4 text-center relative">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Clientes</p>
                </div>
                <p className={`text-2xl font-bold ${totalGuestsDebt > 0 ? "text-red-600" : "text-green-600"}`} data-testid="text-guests-debt">
                  ${totalGuestsDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {accountSummary?.guests?.length || 0} cliente(s) con saldo
                </p>
                <div className="absolute bottom-2 right-2 text-muted-foreground">
                  {expandedCard === "guests" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </div>
              </CardContent>
            </Card>

            {/* Total */}
            <Card
              className={`border-2 border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20 cursor-pointer transition-all hover:shadow-md ${expandedCard === "all" ? "ring-2 ring-purple-400/40" : ""}`}
              onClick={() => toggleCard("all")}
              data-testid="card-cc-total"
            >
              <CardContent className="pt-5 pb-4 text-center relative">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Users2 className="h-4 w-4 text-purple-600" />
                  <p className="text-sm text-muted-foreground">Total pendiente</p>
                </div>
                <p className={`text-2xl font-bold ${totalDebt > 0 ? "text-red-600" : "text-green-600"}`}>
                  ${totalDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">combinado</p>
                <div className="absolute bottom-2 right-2 text-muted-foreground">
                  {expandedCard === "all" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Panel expandible — lista de deudores */}
      {expandedCard && accountSummary && (
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4">
            {/* Empresas */}
            {(expandedCard === "companies" || expandedCard === "all") && (
              <div className={expandedCard === "all" ? "mb-5" : ""}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Empresas</p>
                    <span className="text-xs text-muted-foreground">({accountSummary.companies.length})</span>
                  </div>
                  {accountSummary.companies.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => printDebtListing("Listado de Deudas — Empresas", accountSummary.companies)}
                      data-testid="button-print-companies"
                    >
                      <Printer className="h-3 w-3" />
                      Imprimir listado
                    </Button>
                  )}
                </div>
                {accountSummary.companies.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">Sin empresas con saldo pendiente</p>
                ) : (
                  <div className="space-y-0.5">
                    {[...accountSummary.companies]
                      .sort((a, b) => a.name.localeCompare(b.name, "es"))
                      .map((c) => {
                        const isExpanded = expandedEntityId === c.id && expandedEntityType === "company";
                        return (
                          <div key={c.id} data-testid={`row-deuda-empresa-${c.id}`}>
                            <div
                              className={`flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer select-none gap-3 transition-colors ${isExpanded ? "bg-muted/60" : "hover:bg-muted/50"}`}
                              onClick={() => toggleEntityDetail("company", c.id)}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium truncate">{c.name}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className={`text-sm font-bold tabular-nums ${c.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                                  ${c.balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/companies?search=${encodeURIComponent(c.name)}`); }}
                                  data-testid={`button-ver-empresa-${c.id}`}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Ver
                                </Button>
                              </div>
                            </div>
                            {isExpanded && (
                              <EntityMovementsInline entityType="company" entityId={c.id} entityName={c.name} summaryBalance={c.balance} />
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Agencias */}
            {(expandedCard === "agencies" || expandedCard === "all") && (
              <div className={expandedCard === "all" ? "mb-5" : ""}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Plane className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Agencias</p>
                    <span className="text-xs text-muted-foreground">({accountSummary.agencies.length})</span>
                  </div>
                  {accountSummary.agencies.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => printDebtListing("Listado de Deudas — Agencias", accountSummary.agencies)}
                      data-testid="button-print-agencies"
                    >
                      <Printer className="h-3 w-3" />
                      Imprimir listado
                    </Button>
                  )}
                </div>
                {accountSummary.agencies.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">Sin agencias con saldo pendiente</p>
                ) : (
                  <div className="space-y-0.5">
                    {[...accountSummary.agencies]
                      .sort((a, b) => a.name.localeCompare(b.name, "es"))
                      .map((a) => {
                        const isExpanded = expandedEntityId === a.id && expandedEntityType === "agency";
                        return (
                          <div key={a.id} data-testid={`row-deuda-agencia-${a.id}`}>
                            <div
                              className={`flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer select-none gap-3 transition-colors ${isExpanded ? "bg-muted/60" : "hover:bg-muted/50"}`}
                              onClick={() => toggleEntityDetail("agency", a.id)}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                <Plane className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium truncate">{a.name}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className={`text-sm font-bold tabular-nums ${a.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                                  ${a.balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/agencies?search=${encodeURIComponent(a.name)}`); }}
                                  data-testid={`button-ver-agencia-${a.id}`}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Ver
                                </Button>
                              </div>
                            </div>
                            {isExpanded && (
                              <EntityMovementsInline entityType="agency" entityId={a.id} entityName={a.name} summaryBalance={a.balance} />
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* Clientes */}
            {(expandedCard === "guests" || expandedCard === "all") && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Clientes</p>
                    <span className="text-xs text-muted-foreground">({accountSummary.guests?.length ?? 0})</span>
                  </div>
                  {(accountSummary.guests?.length ?? 0) > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => printDebtListing("Listado de Deudas — Clientes", accountSummary.guests ?? [])}
                      data-testid="button-print-guests"
                    >
                      <Printer className="h-3 w-3" />
                      Imprimir listado
                    </Button>
                  )}
                </div>
                {(accountSummary.guests?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">Sin clientes con saldo pendiente</p>
                ) : (
                  <div className="space-y-0.5">
                    {[...(accountSummary.guests ?? [])]
                      .sort((a, b) => a.name.localeCompare(b.name, "es"))
                      .map((g) => {
                        const isExpanded = expandedEntityId === g.id && expandedEntityType === "guest";
                        return (
                          <div key={g.id} data-testid={`row-deuda-cliente-${g.id}`}>
                            <div
                              className={`flex items-center justify-between px-2.5 py-2 rounded-md cursor-pointer select-none gap-3 transition-colors ${isExpanded ? "bg-muted/60" : "hover:bg-muted/50"}`}
                              onClick={() => toggleEntityDetail("guest", g.id)}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium truncate">{g.name}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className={`text-sm font-bold tabular-nums ${g.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                                  ${g.balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={(e) => { e.stopPropagation(); navigate("/admin/cc-huespedes"); }}
                                  data-testid={`button-ver-cliente-${g.id}`}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Ver
                                </Button>
                              </div>
                            </div>
                            {isExpanded && (
                              <EntityMovementsInline entityType="guest" entityId={g.id} entityName={g.name} summaryBalance={g.balance} />
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => navigate("/companies")}
          data-testid="button-cc-empresas"
        >
          <Building2 className="h-4 w-4 mr-2" />
          Ver Empresas
        </Button>

        <Button
          variant="outline"
          onClick={() => navigate("/agencies")}
          data-testid="button-cc-agencias"
        >
          <Plane className="h-4 w-4 mr-2" />
          Ver Agencias
        </Button>

        <Button
          variant="outline"
          onClick={() => navigate("/admin/cc-huespedes")}
          data-testid="button-cc-otros"
        >
          <User className="h-4 w-4 mr-2" />
          Ver Otros
        </Button>

        <Button
          variant="outline"
          onClick={() => navigate("/admin/deuda-huespedes")}
          data-testid="button-deuda-huespedes"
        >
          <AlertCircle className="h-4 w-4 mr-2" />
          Deuda por Huésped
        </Button>

        <Button
          variant="outline"
          onClick={() => navigate("/agencies?tab=comisiones")}
          data-testid="button-cc-comisiones"
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          Comisiones
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-testid="button-cc-nuevo">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate("/companies?new=1")} data-testid="menu-nueva-empresa">
              <Building2 className="h-4 w-4 mr-2" />
              Nueva Empresa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/agencies?new=1")} data-testid="menu-nueva-agencia">
              <Plane className="h-4 w-4 mr-2" />
              Nueva Agencia
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Reporte de Antigüedad de Deuda */}
      {accountSummary && (totalCompaniesDebt > 0 || totalAgenciesDebt > 0 || totalGuestsDebt > 0) && (
        <AgingReportSection accountSummary={accountSummary} />
      )}

      {/* Reconciliación de pagos CC existentes */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/10">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Sincronizar pagos en CC</p>
                <p className="text-xs text-muted-foreground">
                  Si hay pagos registrados con "Cta. Cte." que no aparecen en las cuentas corrientes, usá este botón para sincronizarlos.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
              className="border-amber-300 dark:border-amber-700 shrink-0"
              data-testid="button-reconcile-cc"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${reconcileMutation.isPending ? "animate-spin" : ""}`} />
              {reconcileMutation.isPending ? "Sincronizando..." : "Sincronizar ahora"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Revisión de saldos pendientes de checkout histórico */}
      <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-950/10">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Revisar saldos pendientes de checkout</p>
                <p className="text-xs text-muted-foreground">
                  Detecta reservas ya cerradas (check-out) que tienen saldo sin registrar en cuentas corrientes y crea los cargos faltantes.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => reconcileCheckoutDebtsMutation.mutate()}
              disabled={reconcileCheckoutDebtsMutation.isPending}
              className="border-orange-300 dark:border-orange-700 shrink-0"
              data-testid="button-reconcile-checkout-debts"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${reconcileCheckoutDebtsMutation.isPending ? "animate-spin" : ""}`} />
              {reconcileCheckoutDebtsMutation.isPending ? "Revisando..." : "Revisar saldos pendientes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Recibos Emitidos */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Recibos Emitidos</h2>
          {recibos.length > 0 && (
            <Badge variant="secondary" className="text-xs">{recibos.length}</Badge>
          )}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-4 p-3 bg-muted/30 rounded-lg border">
          <div className="grid gap-1">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={recibosFrom} onChange={(e) => setRecibosFrom(e.target.value)} className="h-8 text-sm w-36" data-testid="input-recibos-from" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={recibosTo} onChange={(e) => setRecibosTo(e.target.value)} className="h-8 text-sm w-36" data-testid="input-recibos-to" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Tipo</Label>
            <select
              value={recibosEntityType}
              onChange={(e) => setRecibosEntityType(e.target.value)}
              className="h-8 text-sm rounded-md border bg-background px-2 pr-7 w-36"
              data-testid="select-recibos-entity-type"
            >
              <option value="">Todos</option>
              <option value="company">Empresas</option>
              <option value="agency">Agencias</option>
              <option value="guest">Clientes</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Nombre..."
                value={recibosSearch}
                onChange={(e) => setRecibosSearch(e.target.value)}
                className="h-8 text-sm pl-7 w-48"
                data-testid="input-recibos-search"
              />
            </div>
          </div>
        </div>

        {/* Total cobrado en el período */}
        {!isRecibosFetching && recibos.length > 0 && (
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="text-sm text-muted-foreground">Total cobrado en el período:</span>
            <span className="font-bold text-green-600 tabular-nums text-sm">
              ${Math.abs(recibos.reduce((s, r) => s + parseFloat(r.amount), 0)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Tabla */}
        {isRecibosFetching ? (
          <div className="space-y-1.5">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : recibos.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground border rounded-lg bg-muted/20">
            <Receipt className="h-9 w-9 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin recibos en el período seleccionado</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground text-xs">
                  <th className="text-left px-3 py-2 font-medium">Fecha</th>
                  <th className="text-left px-3 py-2 font-medium">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium">Razón social / Cliente</th>
                  <th className="text-left px-3 py-2 font-medium">Concepto</th>
                  <th className="text-left px-3 py-2 font-medium">Medio de pago</th>
                  <th className="text-right px-3 py-2 font-medium">Importe</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recibos.map((r) => {
                  const methodLabels: Record<string, string> = {
                    transferencia: "Transferencia", cheque: "Cheque", efectivo: "Efectivo",
                    compensacion: "Compensación", tarjeta: "Tarjeta crédito",
                  };
                  const methodLabel = r.paymentMethod ? (methodLabels[r.paymentMethod] ?? r.paymentMethod) : "—";
                  return (
                    <tr key={r.id} className="hover:bg-muted/30" data-testid={`row-recibo-${r.id}`}>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px] px-1.5">{r.entityTypeName}</Badge>
                      </td>
                      <td className="px-3 py-2 font-medium max-w-[180px] truncate">{r.entityName}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">{r.description}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{methodLabel}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-green-600">
                        ${Math.abs(parseFloat(r.amount)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-1 py-1 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Ver / reimprimir recibo"
                          onClick={() => window.open(`/api/account-movements/${r.id}/receipt-pdf`, "_blank")}
                          data-testid={`button-reprint-recibo-${r.id}`}
                        >
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Separator />

      {/* Reporte de Facturación en página completa */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Reporte de Facturación</h2>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="grid gap-1 min-w-[140px]">
            <Label className="text-xs">Desde</Label>
            <Input
              type="date"
              value={reporteFrom}
              onChange={(e) => setReporteFrom(e.target.value)}
              data-testid="input-reporte-from"
            />
          </div>
          <div className="grid gap-1 min-w-[140px]">
            <Label className="text-xs">Hasta</Label>
            <Input
              type="date"
              value={reporteTo}
              onChange={(e) => setReporteTo(e.target.value)}
              data-testid="input-reporte-to"
            />
          </div>
        </div>

        {/* Resumen del reporte */}
        {!isReporteFetching && reporteMovements.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                  <p className="text-xs text-muted-foreground">Cargos</p>
                </div>
                <p className="text-xl font-bold text-red-600">
                  ${reporteCharges.reduce((s, m) => s + parseFloat(m.amount), 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-muted-foreground">{reporteCharges.length} movimiento(s)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendingDown className="h-3.5 w-3.5 text-green-500" />
                  <p className="text-xs text-muted-foreground">Pagos</p>
                </div>
                <p className="text-xl font-bold text-green-600">
                  ${Math.abs(reportePayments.reduce((s, m) => s + parseFloat(m.amount), 0)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-muted-foreground">{reportePayments.length} movimiento(s)</p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="pt-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Saldo neto</p>
                </div>
                <p className={`text-xl font-bold ${reporteTotal > 0 ? "text-red-600" : "text-green-600"}`}>
                  ${reporteTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-muted-foreground">del período</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabla de movimientos */}
        {isReporteFetching ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : reporteMovements.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Sin movimientos en el período seleccionado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reporteMovements.map((m) => (
              <div
                key={m.id}
                className="flex items-start justify-between p-3 rounded-lg border bg-background gap-3"
                data-testid={`row-movimiento-${m.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {m.entityTypeName}
                    </Badge>
                    <span className="font-medium text-sm truncate">{m.entityName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{m.description}</p>
                  <p className="text-[11px] text-muted-foreground">{m.date}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-bold text-sm ${parseFloat(m.amount) > 0 ? "text-red-600" : "text-green-600"}`}>
                    {parseFloat(m.amount) > 0 ? "+" : ""}${parseFloat(m.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {parseFloat(m.amount) > 0 ? "Cargo" : "Pago"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
