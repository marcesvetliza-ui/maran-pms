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
  createdAt: string;
};

function EntityMovementsInline({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data: movements = [], isLoading } = useQuery<AccountMovement[]>({
    queryKey: ["/api/account-movements", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/account-movements/${entityType}/${entityId}`);
      if (!res.ok) throw new Error("Error fetching movements");
      return res.json();
    },
  });

  const fmt = (n: string | number) =>
    `$${parseFloat(String(n)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;

  const typeLabel: Record<string, string> = {
    cargo: "Cargo",
    pago: "Pago",
    nota_credito: "Nota Cred.",
    ajuste: "Ajuste",
  };

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

  const balance = movements.reduce((s, m) => s + parseFloat(m.amount), 0);

  return (
    <div className="mt-1 mb-2 border rounded-md overflow-hidden bg-muted/20">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 text-muted-foreground">
            <th className="text-left px-3 py-1.5 font-medium">Fecha</th>
            <th className="text-left px-3 py-1.5 font-medium">Tipo</th>
            <th className="text-left px-3 py-1.5 font-medium">Descripción</th>
            <th className="text-left px-3 py-1.5 font-medium">Reserva</th>
            <th className="text-right px-3 py-1.5 font-medium">Importe</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {movements.map((m) => {
            const isDebt = parseFloat(m.amount) > 0;
            return (
              <tr key={m.id} className="hover:bg-muted/30">
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{m.date}</td>
                <td className="px-3 py-1.5">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${
                      m.type === "cargo"
                        ? "text-red-600 border-red-300"
                        : m.type === "pago"
                        ? "text-green-600 border-green-300"
                        : "text-blue-600 border-blue-300"
                    }`}
                  >
                    {typeLabel[m.type] ?? m.type}
                  </Badge>
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
                  {fmt(m.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted/50 font-semibold">
            <td colSpan={4} className="px-3 py-1.5 text-xs text-right text-muted-foreground">Saldo total:</td>
            <td className={`px-3 py-1.5 text-right tabular-nums text-xs ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
              {fmt(balance)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
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
                {expandedCard === "all" && (
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Empresas</p>
                  </div>
                )}
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
                              <EntityMovementsInline entityType="company" entityId={c.id} />
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
                {expandedCard === "all" && (
                  <div className="flex items-center gap-2 mb-2">
                    <Plane className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Agencias</p>
                  </div>
                )}
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
                              <EntityMovementsInline entityType="agency" entityId={a.id} />
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
                {expandedCard === "all" && (
                  <div className="flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">Clientes</p>
                  </div>
                )}
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
                              <EntityMovementsInline entityType="guest" entityId={g.id} />
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
