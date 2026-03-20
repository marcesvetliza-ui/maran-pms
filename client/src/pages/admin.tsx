import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Receipt,
  Building2,
  Plane,
  FileText,
  TrendingUp,
  CreditCard,
  ArrowRight,
  Clock,
  CheckCircle2,
  Download,
  Landmark,
  BarChart2,
  Plus,
  ChevronDown,
  BarChart3,
  Users2,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export default function AdminPage() {
  const [, navigate] = useLocation();
  const [isReporteOpen, setIsReporteOpen] = useState(false);
  const [reporteFrom, setReporteFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [reporteTo, setReporteTo] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: accountSummary } = useQuery<{
    companies: { id: string; name: string; balance: number }[];
    agencies: { id: string; name: string; balance: number }[];
  }>({
    queryKey: ["/api/account-summary"],
  });

  const { data: reporteMovements = [], isFetching: isReporteFetching } = useQuery<Movement[]>({
    queryKey: ["/api/account-movements/report", reporteFrom, reporteTo],
    queryFn: async () => {
      const res = await fetch(`/api/account-movements/report?from=${reporteFrom}&to=${reporteTo}`);
      return res.json();
    },
    enabled: isReporteOpen,
  });

  const totalCompaniesDebt = accountSummary?.companies.reduce((sum, c) => sum + c.balance, 0) || 0;
  const totalAgenciesDebt = accountSummary?.agencies.reduce((sum, a) => sum + a.balance, 0) || 0;
  const totalDebt = totalCompaniesDebt + totalAgenciesDebt;

  const modules = [
    {
      title: "Facturación",
      description: "Emitir comprobantes, gestionar folios y registrar pagos de reservas.",
      icon: Receipt,
      href: "/admin/billing",
      status: "coming_soon" as const,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      extra: null,
    },
    {
      title: "Comprobantes de Compra",
      description: "Registro de facturas de proveedores, NC, resúmenes bancarios y liquidaciones de tarjeta. Asientos automáticos.",
      icon: FileText,
      href: "/purchase-invoices",
      status: "available" as const,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-950/30",
      extra: null,
    },
    {
      title: "Proveedores Contables",
      description: "ABM de proveedores con CUIT, condición IVA y alícuotas de retención (IIBB, Ganancias, IVA).",
      icon: Building2,
      href: "/accounting-suppliers",
      status: "available" as const,
      color: "text-violet-600",
      bg: "bg-violet-50 dark:bg-violet-950/30",
      extra: null,
    },
    {
      title: "Reportes Contables",
      description: "Ingresos por período, métodos de pago, comparativas mensuales.",
      icon: TrendingUp,
      href: "/reports",
      status: "available" as const,
      color: "text-orange-600",
      bg: "bg-orange-50 dark:bg-orange-950/30",
      extra: null,
    },
    {
      title: "Caja",
      description: "Movimientos de caja por área, turnos y cierre de caja.",
      icon: CreditCard,
      href: "/cash-register",
      status: "available" as const,
      color: "text-teal-600",
      bg: "bg-teal-50 dark:bg-teal-950/30",
      extra: null,
    },
    {
      title: "Consultas Contables",
      description: "SIRCAR, Libro IVA Compras/Ventas, Mayor de Cuentas, Retenciones IIBB, Cuenta Corriente Proveedores.",
      icon: Download,
      href: "/admin/consultas",
      status: "available" as const,
      color: "text-rose-600",
      bg: "bg-rose-50 dark:bg-rose-950/30",
      extra: null,
    },
    {
      title: "Facturación Electrónica",
      description: "Emisión de Facturas A/B, Notas de Crédito, CAE ficticio y modo ARCA para producción.",
      icon: Receipt,
      href: "/billing",
      status: "available" as const,
      color: "text-violet-600",
      bg: "bg-violet-50 dark:bg-violet-950/30",
      extra: null,
    },
    {
      title: "Caja de Administración",
      description: "Consolida efectivo de todas las áreas. Gastos de caja chica, arqueos, rendición diaria y cierre mensual.",
      icon: Landmark,
      href: "/admin/caja",
      status: "available" as const,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      extra: null,
    },
    {
      title: "Reportes Gerenciales",
      description: "Estado de Resultados, KPIs hoteleros (RevPAR, ADR, Ocupación), Ingresos por área, Costos, Ranking proveedores y Comparativo mensual.",
      icon: BarChart2,
      href: "/admin/reportes",
      status: "available" as const,
      color: "text-sky-600",
      bg: "bg-sky-50 dark:bg-sky-950/30",
      extra: null,
    },
    {
      title: "Pago de Proveedores",
      description: "Emitir órdenes de pago y gestionar cuenta corriente de proveedores con saldo pendiente.",
      icon: CreditCard,
      href: "/purchase-invoices?tab=pagos",
      status: "available" as const,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-950/30",
      extra: null,
    },
  ];

  const reporteTotal = reporteMovements.reduce((sum, m) => sum + parseFloat(m.amount || "0"), 0);
  const reporteCharges = reporteMovements.filter(m => parseFloat(m.amount) > 0);
  const reportePayments = reporteMovements.filter(m => parseFloat(m.amount) < 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-admin-title">Administración</h1>
        <p className="text-muted-foreground" data-testid="text-admin-description">
          Gestión financiera, facturación y cuentas corrientes del hotel.
        </p>
      </div>

      {/* Cuenta Corriente — card unificado */}
      <Card className="border-2 border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/10" data-testid="card-cuenta-corriente">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2.5 bg-purple-100 dark:bg-purple-900/40">
                <Users2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <CardTitle className="text-base">Cuenta Corriente</CardTitle>
                <CardDescription className="text-sm">Empresas y Agencias — saldos pendientes y movimientos</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-3 w-3" />
              Disponible
            </Badge>
          </div>

          {/* Resumen de deuda */}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-md bg-background border p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <Building2 className="h-3 w-3" /> Empresas
              </p>
              <p className={`text-lg font-bold ${totalCompaniesDebt > 0 ? "text-red-600" : "text-green-600"}`} data-testid="text-companies-debt">
                ${totalCompaniesDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted-foreground">{accountSummary?.companies.length || 0} con saldo</p>
            </div>
            <div className="rounded-md bg-background border p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <Plane className="h-3 w-3" /> Agencias
              </p>
              <p className={`text-lg font-bold ${totalAgenciesDebt > 0 ? "text-red-600" : "text-green-600"}`} data-testid="text-agencies-debt">
                ${totalAgenciesDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted-foreground">{accountSummary?.agencies.length || 0} con saldo</p>
            </div>
            <div className="rounded-md bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total pendiente</p>
              <p className={`text-lg font-bold ${totalDebt > 0 ? "text-red-600" : "text-green-600"}`}>
                ${totalDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-muted-foreground">combinado</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {/* Ver Empresas */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/companies")}
              data-testid="button-cc-empresas"
            >
              <Building2 className="h-4 w-4 mr-1" />
              Ver Empresas
            </Button>

            {/* Ver Agencias */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/agencies")}
              data-testid="button-cc-agencias"
            >
              <Plane className="h-4 w-4 mr-1" />
              Ver Agencias
            </Button>

            {/* Comisiones de Agencias */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/agencies?tab=comisiones")}
              data-testid="button-cc-comisiones"
            >
              <BarChart3 className="h-4 w-4 mr-1" />
              Comisiones
            </Button>

            {/* Reporte de Facturación */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReporteOpen(true)}
              data-testid="button-cc-reporte"
            >
              <CalendarDays className="h-4 w-4 mr-1" />
              Reporte de Facturación
            </Button>

            {/* Nuevo — con dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" data-testid="button-cc-nuevo">
                  <Plus className="h-4 w-4 mr-1" />
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
        </CardContent>
      </Card>

      {/* Módulos normales */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <Card
            key={mod.href}
            className={`transition-all ${
              mod.status === "coming_soon" ? "opacity-80" : "cursor-pointer hover:shadow-md"
            }`}
            onClick={() => mod.status !== "coming_soon" && navigate(mod.href)}
            data-testid={`card-admin-module-${mod.title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className={`rounded-lg p-2.5 ${mod.bg}`}>
                  <mod.icon className={`h-5 w-5 ${mod.color}`} />
                </div>
                {mod.status === "coming_soon" ? (
                  <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Próximamente
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-3 w-3" />
                    Disponible
                  </Badge>
                )}
              </div>
              <CardTitle className="text-base mt-3">{mod.title}</CardTitle>
              <CardDescription className="text-sm">{mod.description}</CardDescription>
              {mod.extra}
            </CardHeader>
            <CardContent className="pt-0">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-muted-foreground"
                disabled={mod.status === "coming_soon"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (mod.status !== "coming_soon") navigate(mod.href);
                }}
                data-testid={`button-admin-go-${mod.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {mod.status === "coming_soon" ? "Próximamente" : "Ir al módulo"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sheet: Reporte de Facturación */}
      <Sheet open={isReporteOpen} onOpenChange={setIsReporteOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Reporte de Facturación en CC
            </SheetTitle>
          </SheetHeader>

          {/* Filtros de fecha */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1 grid gap-1">
              <Label className="text-xs">Desde</Label>
              <Input
                type="date"
                value={reporteFrom}
                onChange={(e) => setReporteFrom(e.target.value)}
                data-testid="input-reporte-from"
              />
            </div>
            <div className="flex-1 grid gap-1">
              <Label className="text-xs">Hasta</Label>
              <Input
                type="date"
                value={reporteTo}
                onChange={(e) => setReporteTo(e.target.value)}
                data-testid="input-reporte-to"
              />
            </div>
          </div>

          {/* Resumen */}
          {!isReporteFetching && reporteMovements.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="rounded-md border p-2 text-center">
                <p className="text-xs text-muted-foreground">Cargos</p>
                <p className="font-bold text-red-600">
                  ${reporteCharges.reduce((s, m) => s + parseFloat(m.amount), 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground">{reporteCharges.length} mov.</p>
              </div>
              <div className="rounded-md border p-2 text-center">
                <p className="text-xs text-muted-foreground">Pagos</p>
                <p className="font-bold text-green-600">
                  ${Math.abs(reportePayments.reduce((s, m) => s + parseFloat(m.amount), 0)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-muted-foreground">{reportePayments.length} mov.</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-2 text-center">
                <p className="text-xs text-muted-foreground">Saldo neto</p>
                <p className={`font-bold ${reporteTotal > 0 ? "text-red-600" : "text-green-600"}`}>
                  ${reporteTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}

          {/* Tabla de movimientos */}
          {isReporteFetching ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Cargando...</p>
          ) : reporteMovements.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Sin movimientos en el período seleccionado
            </p>
          ) : (
            <div className="space-y-2">
              {reporteMovements.map((m) => (
                <div key={m.id} className="flex items-start justify-between p-3 rounded-md border bg-background gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {m.entityTypeName}
                      </Badge>
                      <span className="font-medium text-sm truncate">{m.entityName}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.description}</p>
                    <p className="text-[10px] text-muted-foreground">{m.date}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold text-sm ${parseFloat(m.amount) > 0 ? "text-red-600" : "text-green-600"}`}>
                      {parseFloat(m.amount) > 0 ? "+" : ""}${parseFloat(m.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{parseFloat(m.amount) > 0 ? "Cargo" : "Pago"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
