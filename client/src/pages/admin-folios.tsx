import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, ReceiptText, RefreshCw, Search,
  TrendingDown, TrendingUp, Wallet, AlertCircle,
  Download, BarChart3, Hotel, Utensils, Sparkles, Users, CalendarDays, Building2
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
import { useAuth } from "@/App";

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
  closedBy?: string;
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
  restaurant_order: "Orden Restaurant",
  spa_account: "Cuenta SPA",
  group: "Grupo",
  event: "Evento",
  company: "Empresa",
  agency: "Agencia",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  open: { label: "Abierto", variant: "secondary" },
  closed: { label: "Cerrado", variant: "outline" },
  invoiced: { label: "Facturado", variant: "default" },
};

function formatCurrency(n: number | string) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(n));
}

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yy HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

export default function AdminFoliosPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedFolio, setSelectedFolio] = useState<Folio | null>(null);

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

  const { data: folios = [], isLoading, refetch } = useQuery<Folio[]>({
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
          <p className="text-muted-foreground text-sm">
            Vista consolidada de todos los folios del sistema
          </p>
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

      {/* Pending Balance Breakdown */}
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
                          <span className="text-sm font-medium">
                            {ENTITY_TYPE_LABELS[b.entity_type] ?? b.entity_type}
                          </span>
                          <span className="text-sm font-bold text-orange-600">
                            {formatCurrency(b.pending_balance)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-orange-400 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                        {Number(b.open_folios)} ab.
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 shrink-0"
                        title="Filtrar por este tipo"
                        data-testid={`button-filter-breakdown-${b.entity_type}`}
                        onClick={() => setEntityTypeFilter(b.entity_type)}
                      >
                        <Search className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* List */}
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

          {isLoading ? (
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
                    const isSelected = selectedFolio?.id === folio.id;
                    return (
                      <TableRow
                        key={folio.id}
                        className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/50"}`}
                        onClick={() => setSelectedFolio(isSelected ? null : folio)}
                        data-testid={`row-folio-${folio.id}`}
                      >
                        <TableCell>
                          <span className="font-mono text-sm font-medium">{folio.codigo}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {ENTITY_TYPE_LABELS[folio.entityType] ?? folio.entityType}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_LABELS[folio.status]?.variant ?? "outline"}>
                            {STATUS_LABELS[folio.status]?.label ?? folio.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm text-red-600">
                          {formatCurrency(folio.totalCharges)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-green-600">
                          {formatCurrency(folio.totalPayments)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-bold text-sm ${balance > 0 ? "text-orange-600" : balance < 0 ? "text-blue-600" : "text-muted-foreground"}`}>
                            {formatCurrency(balance)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(folio.openedAt)}
                        </TableCell>
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
                <FolioViewer entityType={selectedFolio.entityType} entityId={selectedFolio.entityId} />
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
    </div>
  );
}
