import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Link } from "wouter";
import {
  ArrowUpCircle, ArrowDownCircle, RefreshCw, Plus, Ban,
  Settings, FileDown, ClipboardList, AlertTriangle, CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const toArg = (d: Date) => format(d, "yyyy-MM-dd");
const today = () => toArg(new Date());

function fPeso(n: number | string | undefined | null) {
  const num = parseFloat(String(n ?? 0)) || 0;
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

const TIPO_LABELS: Record<string, string> = {
  ingreso_recepcion: "Recepción",
  ingreso_restaurant: "Restaurante",
  ingreso_spa: "Spa",
  ingreso_manual: "Ingreso Manual",
  egreso_proveedor: "Pago Proveedor",
  egreso_gasto: "Gasto Chico",
  egreso_manual: "Egreso Manual",
  arqueo: "Ajuste Arqueo",
};

function tipoLabel(tipo: string) {
  return TIPO_LABELS[tipo] || tipo;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminCajaPage() {
  const { toast } = useToast();
  const [periodo, setPeriodo] = useState<"hoy" | "semana" | "mes" | "rango">("hoy");
  const [rangoDesde, setRangoDesde] = useState(today());
  const [rangoHasta, setRangoHasta] = useState(today());
  const [showMovDialog, setShowMovDialog] = useState(false);
  const [showArqueoDialog, setShowArqueoDialog] = useState(false);
  const [anularId, setAnularId] = useState<number | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");

  // Calculate date range
  const getRange = () => {
    const now = new Date();
    if (periodo === "hoy") return { fecha: today() };
    if (periodo === "semana") return { desde: toArg(startOfWeek(now, { weekStartsOn: 1 })), hasta: toArg(endOfWeek(now, { weekStartsOn: 1 })) };
    if (periodo === "mes") return { desde: toArg(startOfMonth(now)), hasta: toArg(endOfMonth(now)) };
    return { desde: rangoDesde, hasta: rangoHasta };
  };

  const rangeParams = getRange();
  const qpString = new URLSearchParams(rangeParams as any).toString();

  const { data: saldoData } = useQuery<{ saldoActual: number; fondoFijo: number; alertaBajo: number; enAlerta: boolean }>({
    queryKey: ["/api/admin-cash/saldo"],
    refetchInterval: 30000,
  });

  const { data: movimientos = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin-cash/movimientos", qpString],
    queryFn: () => fetch(`/api/admin-cash/movimientos?${qpString}`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: resumenDia } = useQuery<{
    hoyIngresos: number;
    hoyEgresos: number;
    porModulo?: { hotel: number; restaurant: number; spa: number; otros: number };
  }>({
    queryKey: ["/api/admin-cash/resumen-dia", today()],
    queryFn: () => fetch(`/api/admin-cash/resumen-dia?fecha=${today()}`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const anularMutation = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      apiRequest("PATCH", `/api/admin-cash/movimientos/${id}/anular`, { motivoAnulacion: motivo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-cash"] });
      setAnularId(null);
      setMotivoAnulacion("");
      toast({ title: "Movimiento anulado" });
    },
  });

  const downloadRendicion = () => {
    const fecha = rangeParams.fecha || today();
    window.open(`/api/admin-cash/cierre-diario?fecha=${fecha}`, "_blank");
  };

  const downloadCierreMensual = () => {
    const now = new Date();
    const periodo = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    window.open(`/api/admin-cash/cierre-mensual?periodo=${encodeURIComponent(periodo)}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Caja de Administración</h1>
            <p className="text-muted-foreground text-sm">Saldo acumulativo — gestión de ingresos y egresos en efectivo</p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/caja/configuracion">
              <Button variant="outline" size="sm" data-testid="btn-config-caja">
                <Settings className="w-4 h-4 mr-1" />
                Configuración
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={downloadCierreMensual} data-testid="btn-cierre-mensual">
              <FileDown className="w-4 h-4 mr-1" />
              Cierre Mensual PDF
            </Button>
            <Button onClick={() => setShowMovDialog(true)} data-testid="btn-nuevo-movimiento">
              <Plus className="w-4 h-4 mr-1" />
              Movimiento
            </Button>
          </div>
        </div>

        {/* Alert */}
        {saldoData?.enAlerta && (
          <div className="mb-4 flex items-center gap-2 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-700 rounded-lg px-4 py-3 text-yellow-800 dark:text-yellow-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">
              Saldo por debajo del mínimo (${fPeso(saldoData.alertaBajo)}). Considerar reposición.
            </span>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className={saldoData?.enAlerta ? "border-yellow-400" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Saldo Actual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${saldoData?.enAlerta ? "text-yellow-600" : "text-green-600"}`}>
                ${fPeso(saldoData?.saldoActual)}
              </div>
              {saldoData?.fondoFijo && Number(saldoData.fondoFijo) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Fondo fijo: ${fPeso(saldoData.fondoFijo)}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Hoy Ingresó</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">${fPeso(resumenDia?.hoyIngresos)}</div>
              {resumenDia?.porModulo && resumenDia.hoyIngresos > 0 && (
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {resumenDia.porModulo.hotel > 0 && (
                    <div className="flex justify-between"><span>Hotel</span><span className="font-medium">${fPeso(resumenDia.porModulo.hotel)}</span></div>
                  )}
                  {resumenDia.porModulo.restaurant > 0 && (
                    <div className="flex justify-between"><span>Restaurante</span><span className="font-medium">${fPeso(resumenDia.porModulo.restaurant)}</span></div>
                  )}
                  {resumenDia.porModulo.spa > 0 && (
                    <div className="flex justify-between"><span>SPA</span><span className="font-medium">${fPeso(resumenDia.porModulo.spa)}</span></div>
                  )}
                  {resumenDia.porModulo.otros > 0 && (
                    <div className="flex justify-between"><span>Otros</span><span className="font-medium">${fPeso(resumenDia.porModulo.otros)}</span></div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Hoy Egresó</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">${fPeso(resumenDia?.hoyEgresos)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center justify-between mb-4">
          <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as any)}>
            <TabsList>
              <TabsTrigger value="hoy">Hoy</TabsTrigger>
              <TabsTrigger value="semana">Esta semana</TabsTrigger>
              <TabsTrigger value="mes">Este mes</TabsTrigger>
              <TabsTrigger value="rango">Rango</TabsTrigger>
            </TabsList>
          </Tabs>

          {periodo === "rango" && (
            <div className="flex gap-2 items-center">
              <Input type="date" value={rangoDesde} onChange={e => setRangoDesde(e.target.value)} className="w-36 text-sm" />
              <span className="text-muted-foreground text-sm">a</span>
              <Input type="date" value={rangoHasta} onChange={e => setRangoHasta(e.target.value)} className="w-36 text-sm" />
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadRendicion} data-testid="btn-rendicion-pdf">
              <ClipboardList className="w-4 h-4 mr-1" />
              Rendición PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowArqueoDialog(true)} data-testid="btn-arquear">
              <RefreshCw className="w-4 h-4 mr-1" />
              Arquear caja
            </Button>
          </div>
        </div>

        {/* Movement list */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Cargando movimientos...</div>
            ) : movimientos.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No hay movimientos para el período seleccionado</div>
            ) : (
              <div className="divide-y">
                {movimientos.map((m: any) => (
                  <div key={m.id} className={`flex items-center gap-3 px-4 py-3 ${m.anulado ? "opacity-40" : ""}`} data-testid={`row-mov-${m.id}`}>
                    {m.tipo === "arqueo" ? (
                      <CircleDot className="w-5 h-5 text-gray-400 shrink-0" />
                    ) : m.signo === "+" ? (
                      <ArrowUpCircle className="w-5 h-5 text-green-500 shrink-0" />
                    ) : (
                      <ArrowDownCircle className="w-5 h-5 text-red-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{m.concepto}</span>
                        {m.anulado && <Badge variant="destructive" className="text-xs shrink-0">Anulado</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {m.hora || ""} · {tipoLabel(m.tipo)}
                        {m.cuenta_nombre ? ` · ${m.cuenta_nombre}` : ""}
                        {m.operador ? ` · ${m.operador}` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-semibold ${m.signo === "+" ? "text-green-600" : m.tipo === "arqueo" ? "text-gray-500" : "text-red-600"}`}>
                        {m.signo === "+" ? "+" : "-"}${fPeso(m.importe)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Saldo: ${fPeso(m.saldoAcumulado)}
                      </div>
                    </div>
                    {!m.anulado && m.tipo !== "arqueo" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 shrink-0"
                        onClick={() => setAnularId(m.id)}
                        data-testid={`btn-anular-${m.id}`}
                      >
                        <Ban className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Nuevo Movimiento Dialog */}
      <NuevoMovimientoDialog open={showMovDialog} onClose={() => setShowMovDialog(false)} />

      {/* Arqueo Dialog */}
      <ArqueoDialog open={showArqueoDialog} onClose={() => setShowArqueoDialog(false)} saldoActual={saldoData?.saldoActual ?? 0} />

      {/* Anular confirmation */}
      <AlertDialog open={anularId !== null} onOpenChange={(o) => !o && setAnularId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular movimiento?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción ajustará el saldo de caja.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2">
            <Label>Motivo (opcional)</Label>
            <Input value={motivoAnulacion} onChange={e => setMotivoAnulacion(e.target.value)} placeholder="Ingresado por error..." className="mt-1" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => anularId && anularMutation.mutate({ id: anularId, motivo: motivoAnulacion })}
            >
              Anular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Nuevo Movimiento Dialog ───────────────────────────────────────────────────

function NuevoMovimientoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState("ingreso_manual");
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [cuentaContableId, setCuentaContableId] = useState("");
  const [centroCosto, setCentroCosto] = useState("");
  const [fecha, setFecha] = useState(today());
  const [hora, setHora] = useState(format(new Date(), "HH:mm"));

  const { data: cuentas = [] } = useQuery<any[]>({
    queryKey: ["/api/accounting-accounts"],
    enabled: open && (tipo === "egreso_gasto" || tipo === "egreso_proveedor"),
  });

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin-cash/movimientos", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-cash"] });
      toast({ title: "Movimiento registrado" });
      onClose();
      resetForm();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setTipo("ingreso_manual");
    setConcepto("");
    setImporte("");
    setCuentaContableId("");
    setCentroCosto("");
    setFecha(today());
    setHora(format(new Date(), "HH:mm"));
  };

  const signo = tipo.startsWith("ingreso") ? "+" : "-";

  const handleSubmit = () => {
    if (!concepto.trim() || !importe) {
      toast({ title: "Campos requeridos", description: "Concepto e importe son obligatorios", variant: "destructive" });
      return;
    }
    mutation.mutate({
      tipo, concepto, importe: parseFloat(importe), signo,
      cuentaContableId: cuentaContableId ? parseInt(cuentaContableId) : null,
      centroCosto: centroCosto || null,
      fecha, hora,
    });
  };

  const TIPOS_INGRESO = [
    { value: "ingreso_manual", label: "Ingreso manual (seña, reintegro, etc.)" },
    { value: "ingreso_recepcion", label: "Transferencia desde Recepción" },
    { value: "ingreso_restaurant", label: "Transferencia desde Restaurante" },
    { value: "ingreso_spa", label: "Transferencia desde Spa" },
  ];
  const TIPOS_EGRESO = [
    { value: "egreso_gasto", label: "Gasto de caja chica" },
    { value: "egreso_proveedor", label: "Pago a proveedor" },
    { value: "egreso_manual", label: "Egreso manual" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo movimiento de caja</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Tipo de movimiento</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger data-testid="select-tipo-mov">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">INGRESOS</div>
                {TIPOS_INGRESO.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
                <Separator className="my-1" />
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">EGRESOS</div>
                {TIPOS_EGRESO.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Concepto *</Label>
            <Input
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
              placeholder="Descripción del movimiento"
              data-testid="input-concepto-mov"
            />
          </div>

          <div className="space-y-1">
            <Label>Importe *</Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={importe}
                onChange={e => setImporte(e.target.value)}
                className="pl-7"
                placeholder="0.00"
                data-testid="input-importe-mov"
              />
            </div>
          </div>

          {tipo === "egreso_gasto" && (
            <div className="space-y-1">
              <Label>Centro de costo</Label>
              <Select value={centroCosto} onValueChange={setCentroCosto}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recepcion">Recepción</SelectItem>
                  <SelectItem value="restaurant">Restaurante</SelectItem>
                  <SelectItem value="spa">Spa</SelectItem>
                  <SelectItem value="administracion">Administración</SelectItem>
                  <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {tipo === "egreso_proveedor" && (
            <>
              <div className="space-y-1">
                <Label>Cuenta contable</Label>
                <Select value={cuentaContableId} onValueChange={setCuentaContableId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cuenta..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(cuentas as any[])
                      .filter((c: any) =>
                        c.tipo === "egreso" ||
                        c.codigo?.startsWith("4") ||
                        c.codigo?.startsWith("5") ||
                        c.codigo?.startsWith("6")
                      )
                      .map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.codigo} — {c.nombre}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Centro de costo</Label>
                <Select value={centroCosto} onValueChange={setCentroCosto}>
                  <SelectTrigger>
                    <SelectValue placeholder="Opcional..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recepcion">Recepción</SelectItem>
                    <SelectItem value="restaurant">Restaurante</SelectItem>
                    <SelectItem value="spa">Spa</SelectItem>
                    <SelectItem value="administracion">Administración</SelectItem>
                    <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} data-testid="input-fecha-mov" />
            </div>
            <div className="space-y-1">
              <Label>Hora</Label>
              <Input type="time" value={hora} onChange={e => setHora(e.target.value)} data-testid="input-hora-mov" />
            </div>
          </div>

          <div className={`rounded-md px-3 py-2 text-sm font-medium ${signo === "+" ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"}`}>
            {signo === "+" ? "↑ Ingreso" : "↓ Egreso"} — impacto en saldo: {signo}${fPeso(parseFloat(importe) || 0)}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="btn-confirmar-mov">
            {mutation.isPending ? "Guardando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Arqueo Dialog ─────────────────────────────────────────────────────────────

function ArqueoDialog({ open, onClose, saldoActual }: { open: boolean; onClose: () => void; saldoActual: number }) {
  const { toast } = useToast();
  const [fecha, setFecha] = useState(today());
  const [billetes1000, setBilletes1000] = useState("");
  const [billetes500, setBilletes500] = useState("");
  const [billetes200, setBilletes200] = useState("");
  const [billetes100, setBilletes100] = useState("");
  const [billetes50, setBilletes50] = useState("");
  const [billetes20, setBilletes20] = useState("");
  const [billetes10, setBilletes10] = useState("");
  const [monedas, setMonedas] = useState("");
  const [extrasConteo, setExtrasConteo] = useState<{ label: string; amount: string }[]>([]);
  const [observaciones, setObservaciones] = useState("");
  const [confirmDif, setConfirmDif] = useState(false);

  const totalFisico =
    (parseInt(billetes1000) || 0) * 1000 +
    (parseInt(billetes500) || 0) * 500 +
    (parseInt(billetes200) || 0) * 200 +
    (parseInt(billetes100) || 0) * 100 +
    (parseInt(billetes50) || 0) * 50 +
    (parseInt(billetes20) || 0) * 20 +
    (parseInt(billetes10) || 0) * 10 +
    (parseFloat(monedas) || 0) +
    extrasConteo.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  const diferencia = totalFisico - saldoActual;

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin-cash/arqueo", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-cash"] });
      toast({ title: "Arqueo registrado", description: diferencia !== 0 ? "Se generó un ajuste automático en el saldo." : undefined });
      onClose();
      resetForm();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setBilletes1000(""); setBilletes500(""); setBilletes200(""); setBilletes100("");
    setBilletes50(""); setBilletes20(""); setBilletes10(""); setMonedas("");
    setExtrasConteo([]); setObservaciones(""); setConfirmDif(false);
  };

  const handleConfirm = () => {
    if (Math.abs(diferencia) > 0.01 && !confirmDif) {
      setConfirmDif(true);
      return;
    }
    mutation.mutate({ fecha, saldoFisico: totalFisico, observaciones });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); resetForm(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Arqueo de caja</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Fecha del arqueo</Label>
            <Input type="date" value={fecha} onChange={e => { setFecha(e.target.value); setConfirmDif(false); }} data-testid="input-fecha-arqueo" />
          </div>

          <div className="bg-muted/40 rounded-lg p-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Saldo según sistema:</span>
              <span className="font-semibold">${fPeso(saldoActual)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Conteo físico</Label>
            {[
              { label: "Billetes $1.000", val: billetes1000, set: setBilletes1000, mult: 1000 },
              { label: "Billetes $500", val: billetes500, set: setBilletes500, mult: 500 },
              { label: "Billetes $200", val: billetes200, set: setBilletes200, mult: 200 },
              { label: "Billetes $100", val: billetes100, set: setBilletes100, mult: 100 },
              { label: "Billetes $50", val: billetes50, set: setBilletes50, mult: 50 },
              { label: "Billetes $20", val: billetes20, set: setBilletes20, mult: 20 },
              { label: "Billetes $10", val: billetes10, set: setBilletes10, mult: 10 },
            ].map(({ label, val, set, mult }) => (
              <div key={label} className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={val}
                  onChange={e => { set(e.target.value); setConfirmDif(false); }}
                  className="text-center"
                  data-testid={`input-arqueo-${mult}`}
                />
                <span className="text-sm text-right">${fPeso((parseInt(val) || 0) * mult)}</span>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2 items-center">
              <span className="text-sm text-muted-foreground">Monedas</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={monedas}
                onChange={e => { setMonedas(e.target.value); setConfirmDif(false); }}
                className="text-center"
                data-testid="input-arqueo-monedas"
              />
              <span className="text-sm text-right">${fPeso(parseFloat(monedas) || 0)}</span>
            </div>

            {/* Extras: cheques, moneda extranjera, otros */}
            <div className="border-t pt-2 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Otros (cheques, moneda extranjera, etc.)</p>
              {extrasConteo.map((ex, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 items-center">
                  <Input
                    value={ex.label}
                    onChange={e => { setExtrasConteo(prev => prev.map((r, j) => j === i ? { ...r, label: e.target.value } : r)); setConfirmDif(false); }}
                    placeholder="Descripción (ej: USD 50)"
                    className="text-xs col-span-1"
                  />
                  <Input
                    type="number" min="0" step="0.01"
                    value={ex.amount}
                    onChange={e => { setExtrasConteo(prev => prev.map((r, j) => j === i ? { ...r, amount: e.target.value } : r)); setConfirmDif(false); }}
                    placeholder="Monto $"
                    className="text-center"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">${fPeso(parseFloat(ex.amount) || 0)}</span>
                    <button onClick={() => { setExtrasConteo(prev => prev.filter((_, j) => j !== i)); setConfirmDif(false); }} className="text-muted-foreground hover:text-destructive text-xs ml-2">✕</button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => setExtrasConteo(prev => [...prev, { label: "", amount: "" }])}
                className="text-xs text-primary hover:underline"
                data-testid="button-add-extra-conteo"
              >+ Agregar fila</button>
            </div>
          </div>

          <Separator />

          <div className="space-y-1">
            <div className="flex justify-between font-semibold">
              <span>Total físico:</span>
              <span>${fPeso(totalFisico)}</span>
            </div>
            <div className={`flex justify-between text-sm font-medium ${diferencia > 0 ? "text-green-600" : diferencia < 0 ? "text-red-600" : "text-muted-foreground"}`}>
              <span>Diferencia:</span>
              <span>
                {diferencia >= 0 ? "+" : ""}${fPeso(diferencia)}
                {Math.abs(diferencia) > 0.01 && (
                  <span className="ml-2">({diferencia > 0 ? "Sobrante" : "Faltante"})</span>
                )}
              </span>
            </div>
          </div>

          {confirmDif && (
            <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 rounded-lg px-3 py-2 text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Confirmar:</strong> Hay una diferencia de ${fPeso(Math.abs(diferencia))} ({diferencia > 0 ? "sobrante" : "faltante"}).
              Se creará un movimiento de ajuste automático. ¿Continuar?
            </div>
          )}

          <div className="space-y-1">
            <Label>Observaciones</Label>
            <Textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Notas opcionales sobre el arqueo..."
              rows={2}
              data-testid="input-obs-arqueo"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); resetForm(); }}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={mutation.isPending} data-testid="btn-confirmar-arqueo">
            {mutation.isPending ? "Guardando..." : confirmDif ? "Sí, confirmar arqueo" : "Confirmar arqueo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Configuración Page ───────────────────────────────────────────────────────

export function AdminCajaConfigPage() {
  const { toast } = useToast();
  const { data: config } = useQuery<any>({ queryKey: ["/api/admin-cash/config"] });

  const [fondoFijo, setFondoFijo] = useState("");
  const [alertaBajo, setAlertaBajo] = useState("");

  // Sync when config loads
  useState(() => {
    if (config) {
      setFondoFijo(config.fondoFijo || "0");
      setAlertaBajo(config.alertaBajo || "0");
    }
  });

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest("PUT", "/api/admin-cash/config", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-cash"] });
      toast({ title: "Configuración guardada" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin/caja">
            <Button variant="ghost" size="sm">← Volver</Button>
          </Link>
          <h1 className="text-xl font-bold">Configuración de Caja</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parámetros de Caja de Administración</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1">
              <Label>Fondo fijo de caja ($)</Label>
              <p className="text-xs text-muted-foreground">Monto base de referencia para la caja</p>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  value={fondoFijo}
                  onChange={e => setFondoFijo(e.target.value)}
                  className="pl-7"
                  placeholder="0.00"
                  data-testid="input-fondo-fijo"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Alerta cuando saldo sea menor a ($)</Label>
              <p className="text-xs text-muted-foreground">Se mostrará una alerta visible cuando el saldo caiga por debajo de este valor</p>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  value={alertaBajo}
                  onChange={e => setAlertaBajo(e.target.value)}
                  className="pl-7"
                  placeholder="0.00"
                  data-testid="input-alerta-bajo"
                />
              </div>
            </div>

            <Button
              onClick={() => mutation.mutate({ fondoFijo: parseFloat(fondoFijo) || 0, alertaBajo: parseFloat(alertaBajo) || 0 })}
              disabled={mutation.isPending}
              data-testid="btn-guardar-config"
            >
              {mutation.isPending ? "Guardando..." : "Guardar configuración"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
