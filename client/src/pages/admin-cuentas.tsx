import { useState } from "react";
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
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertCircle,
  User,
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
import { apiRequest } from "@/lib/queryClient";

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

export default function AdminCuentasPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const reconcileMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/reconcile-cc-payments"),
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

  const [reporteFrom, setReporteFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [reporteTo, setReporteTo] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: accountSummary, isLoading: summaryLoading } = useQuery<{
    companies: { id: string; name: string; balance: number }[];
    agencies: { id: string; name: string; balance: number }[];
    guests: { id: string; name: string; balance: number }[];
  }>({
    queryKey: ["/api/account-summary"],
  });

  const { data: reporteMovements = [], isFetching: isReporteFetching } = useQuery<Movement[]>({
    queryKey: ["/api/account-movements/report", reporteFrom, reporteTo],
    queryFn: async () => {
      const res = await fetch(`/api/account-movements/report?from=${reporteFrom}&to=${reporteTo}`);
      return res.json();
    },
  });

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

      {/* Resumen de deuda */}
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
            <Card data-testid="card-cc-empresas-total">
              <CardContent className="pt-6 text-center">
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
              </CardContent>
            </Card>

            <Card data-testid="card-cc-agencias-total">
              <CardContent className="pt-6 text-center">
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
              </CardContent>
            </Card>

            <Card data-testid="card-cc-huespedes-total">
              <CardContent className="pt-6 text-center">
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
              </CardContent>
            </Card>

            <Card className="border-2 border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20" data-testid="card-cc-total">
              <CardContent className="pt-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Users2 className="h-4 w-4 text-purple-600" />
                  <p className="text-sm text-muted-foreground">Total pendiente</p>
                </div>
                <p className={`text-2xl font-bold ${totalDebt > 0 ? "text-red-600" : "text-green-600"}`}>
                  ${totalDebt.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">combinado</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

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

      {/* Lista de clientes con saldo en CC */}
      {(accountSummary?.guests?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Clientes con saldo pendiente</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {accountSummary!.guests!.map(g => (
              <div
                key={g.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-background"
                data-testid={`row-cc-huesped-${g.id}`}
              >
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{g.name}</span>
                </div>
                <span className={`text-sm font-bold ${g.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                  ${g.balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
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
