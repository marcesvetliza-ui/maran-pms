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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function AdminPage() {
  const [, navigate] = useLocation();

  const { data: accountSummary } = useQuery<{
    companies: { id: string; name: string; balance: number }[];
    agencies: { id: string; name: string; balance: number }[];
  }>({
    queryKey: ["/api/account-summary"],
  });

  const totalCompaniesDebt = accountSummary?.companies.reduce((sum, c) => sum + c.balance, 0) || 0;
  const totalAgenciesDebt = accountSummary?.agencies.reduce((sum, a) => sum + a.balance, 0) || 0;

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
      title: "Cuenta Corriente Empresas",
      description: "Estado de cuenta, saldos pendientes y movimientos por empresa.",
      icon: Building2,
      href: "/companies",
      status: "available" as const,
      color: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-950/30",
      extra: totalCompaniesDebt > 0 ? (
        <div className="mt-2">
          <p className="text-2xl font-bold text-red-600" data-testid="text-companies-debt">${totalCompaniesDebt.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{accountSummary?.companies.length || 0} empresas con saldo</p>
        </div>
      ) : null,
    },
    {
      title: "Cuenta Corriente Agencias",
      description: "Comisiones pendientes, pagos y estado de cuenta por agencia.",
      icon: Plane,
      href: "/agencies",
      status: "available" as const,
      color: "text-indigo-600",
      bg: "bg-indigo-50 dark:bg-indigo-950/30",
      extra: totalAgenciesDebt > 0 ? (
        <div className="mt-2">
          <p className="text-2xl font-bold text-red-600" data-testid="text-agencies-debt">${totalAgenciesDebt.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{accountSummary?.agencies.length || 0} agencias con saldo</p>
        </div>
      ) : null,
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
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-admin-title">Administración</h1>
        <p className="text-muted-foreground" data-testid="text-admin-description">
          Gestión financiera, facturación y cuentas corrientes del hotel.
        </p>
      </div>

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
    </div>
  );
}
