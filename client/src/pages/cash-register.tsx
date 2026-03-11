import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Clock,
  Plus,
  Printer,
  History,
  Eye,
  CircleDot,
  XCircle,
} from "lucide-react";

type CashConfig = {
  area: string;
  areaLabel: string;
  shiftsPerDay: number;
  isActive: boolean;
};

type CashShift = {
  id: string;
  area: string;
  shiftNumber: number;
  openedBy?: string | null;
  closedBy?: string;
  openedAt: string;
  closedAt?: string;
  notes?: string;
  status: string;
  autoCreado?: boolean;
  turnoAnteriorId?: string | null;
};

type CashMovement = {
  id: number;
  shiftId: number;
  area: string;
  sourceType: string;
  sourceLabel?: string;
  paymentMethod: string;
  amount: number;
  movementType: string;
  receiptType?: string;
  description?: string;
  createdAt: string;
};

type ShiftDetail = {
  shift: CashShift;
  movements: CashMovement[];
  summary: Record<string, { count: number; total: number }>;
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: "Efectivo",
  debit_card: "Débito",
  credit_card: "Crédito",
  transfer: "Transferencia",
  mercadopago: "MercadoPago",
  current_account: "Cuenta Corriente",
  room_charge: "Cargo a Habitación",
};

const AREA_COLORS: Record<string, string> = {
  reception: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  restaurant: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  spa: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  events: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const AREA_LABEL_MAP: Record<string, string> = {
  reception: "Recepción",
  restaurant: "Restaurante",
  spa: "SPA",
  events: "Eventos",
};

function formatCurrency(value: number): string {
  return "$ " + Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-AR");
}

function buildSummaryFromMovements(movements: CashMovement[]) {
  const summary: Record<string, { count: number; total: number }> = {};
  for (const m of movements) {
    if (!summary[m.paymentMethod]) {
      summary[m.paymentMethod] = { count: 0, total: 0 };
    }
    summary[m.paymentMethod].count += 1;
    const amt = parseFloat(String(m.amount)) || 0;
    summary[m.paymentMethod].total += m.movementType === "income" ? amt : -amt;
  }
  return summary;
}

function SummaryTable({ movements }: { movements: CashMovement[] }) {
  const summary = buildSummaryFromMovements(movements);
  const totalGeneral = Object.values(summary).reduce((s, v) => s + v.total, 0);
  const totalTx = Object.values(summary).reduce((s, v) => s + v.count, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Método</TableHead>
          <TableHead className="text-center">Transacciones</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.entries(summary).map(([method, data]) => (
          <TableRow key={method}>
            <TableCell>{PAYMENT_METHOD_MAP[method] || method}</TableCell>
            <TableCell className="text-center">{data.count}</TableCell>
            <TableCell className="text-right">{formatCurrency(data.total)}</TableCell>
          </TableRow>
        ))}
        <TableRow className="font-bold border-t-2">
          <TableCell>TOTAL GENERAL</TableCell>
          <TableCell className="text-center">{totalTx}</TableCell>
          <TableCell className="text-right">{formatCurrency(totalGeneral)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function printClosingSummary(shift: CashShift, movements: CashMovement[]) {
  const summary = buildSummaryFromMovements(movements);
  const totalGeneral = Object.values(summary).reduce((s, v) => s + v.total, 0);
  const areaLabel = AREA_LABEL_MAP[shift.area] || shift.area;

  const html = `<!DOCTYPE html><html><head><title>Cierre de Turno - ${areaLabel}</title>
<style>body{font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto}
table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ccc;padding:8px;text-align:left}
th{background:#f5f5f5}.total{font-weight:bold;background:#eee}h1{font-size:18px}h2{font-size:14px;color:#666}</style>
</head><body>
<h1>Cierre de Turno - ${areaLabel}</h1>
<h2>Turno #${shift.shiftNumber}</h2>
<p><strong>Abierto por:</strong> ${shift.openedBy} - ${formatTime(shift.openedAt)}</p>
<p><strong>Cerrado por:</strong> ${shift.closedBy || "-"} - ${shift.closedAt ? formatTime(shift.closedAt) : "-"}</p>
<table><thead><tr><th>Método</th><th>Transacciones</th><th>Total</th></tr></thead><tbody>
${Object.entries(summary).map(([m, d]) => `<tr><td>${PAYMENT_METHOD_MAP[m] || m}</td><td>${d.count}</td><td>${formatCurrency(d.total)}</td></tr>`).join("")}
<tr class="total"><td>TOTAL GENERAL</td><td>${Object.values(summary).reduce((s, v) => s + v.count, 0)}</td><td>${formatCurrency(totalGeneral)}</td></tr>
</tbody></table>
<h2>Movimientos</h2>
<table><thead><tr><th>Hora</th><th>Descripción</th><th>Método</th><th>Tipo</th><th>Monto</th></tr></thead><tbody>
${movements.map(m => `<tr><td>${formatTime(m.createdAt)}</td><td>${m.description || m.sourceLabel || "-"}</td><td>${PAYMENT_METHOD_MAP[m.paymentMethod] || m.paymentMethod}</td><td>${m.movementType === "income" ? "Ingreso" : "Egreso"}</td><td>${formatCurrency(m.amount)}</td></tr>`).join("")}
</tbody></table>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    w.print();
  }
}

function AreaTab({ area, config }: { area: string; config: CashConfig }) {
  const { toast } = useToast();
  const [openShiftDialog, setOpenShiftDialog] = useState(false);
  const [closeShiftDialog, setCloseShiftDialog] = useState(false);
  const [closeStep, setCloseStep] = useState<1 | 2>(1);
  const [movementDialog, setMovementDialog] = useState(false);
  const [tomarTurnoDialog, setTomarTurnoDialog] = useState(false);
  const [openedBy, setOpenedBy] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [closedBy, setClosedBy] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [operadorSiguiente, setOperadorSiguiente] = useState("");
  const [enviarAdmin, setEnviarAdmin] = useState(true);
  const [billetes1000, setBilletes1000] = useState(0);
  const [billetes500, setBilletes500] = useState(0);
  const [billetes200, setBilletes200] = useState(0);
  const [billetes100, setBilletes100] = useState(0);
  const [billetes50, setBilletes50] = useState(0);
  const [monedas, setMonedas] = useState(0);
  const [movType, setMovType] = useState("income");
  const [movDesc, setMovDesc] = useState("");
  const [movMethod, setMovMethod] = useState("cash");
  const [movAmount, setMovAmount] = useState("");
  const [movReceipt, setMovReceipt] = useState("");
  const [closingSummaryData, setClosingSummaryData] = useState<{ shift: CashShift; movements: CashMovement[]; turnoNuevo?: CashShift } | null>(null);

  const efectivoContado =
    billetes1000 * 1000 + billetes500 * 500 + billetes200 * 200 +
    billetes100 * 100 + billetes50 * 50 + monedas;

  function resetCloseDialog() {
    setCloseStep(1);
    setClosedBy("");
    setCloseNotes("");
    setOperadorSiguiente("");
    setEnviarAdmin(true);
    setBilletes1000(0); setBilletes500(0); setBilletes200(0);
    setBilletes100(0); setBilletes50(0); setMonedas(0);
  }

  const { data: currentShift, isLoading: shiftLoading } = useQuery<CashShift | null>({
    queryKey: ["/api/cash/shifts/current", `?area=${area}`],
    queryFn: async () => {
      const res = await fetch(`/api/cash/shifts/current?area=${area}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Error loading shift");
      }
      const data = await res.json();
      return data || null;
    },
  });

  const { data: movements = [], isLoading: movementsLoading } = useQuery<CashMovement[]>({
    queryKey: ["/api/cash/movements", `?shiftId=${currentShift?.id}`],
    queryFn: async () => {
      if (!currentShift?.id) return [];
      const res = await fetch(`/api/cash/movements?shiftId=${currentShift.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error loading movements");
      return res.json();
    },
    enabled: !!currentShift?.id,
  });

  const efectivoSistema = movements.filter(m => m.paymentMethod === "cash").reduce((s, m) => s + (m.movementType === "income" ? 1 : -1) * parseFloat(String(m.amount)), 0);
  const diferencia = efectivoContado - efectivoSistema;

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/cash/shifts/open", {
        area,
        openedBy,
        notes: openNotes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shifts/current"] });
      toast({ title: "Turno abierto", description: `Turno abierto para ${config.areaLabel}` });
      setOpenShiftDialog(false);
      setOpenedBy("");
      setOpenNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addMovementMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/cash/movements", {
        shiftId: currentShift!.id,
        area,
        sourceType: "manual",
        sourceLabel: movDesc,
        paymentMethod: movMethod,
        amount: parseFloat(movAmount),
        movementType: movType,
        receiptType: movReceipt || undefined,
        description: movDesc,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/movements"] });
      toast({ title: "Movimiento registrado", description: "El movimiento fue agregado correctamente" });
      setMovementDialog(false);
      setMovType("income");
      setMovDesc("");
      setMovMethod("cash");
      setMovAmount("");
      setMovReceipt("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/cash/shifts/${currentShift!.id}/close`, {
        closedBy,
        efectivoContado,
        operadorSiguiente: operadorSiguiente.trim() || null,
        enviarAAdministracion: enviarAdmin,
        notes: closeNotes || undefined,
      });
    },
    onSuccess: (result: any) => {
      setClosingSummaryData({ shift: { ...currentShift!, closedBy, closedAt: new Date().toISOString() }, movements, turnoNuevo: result.turnoNuevo });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shifts/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/movements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shifts/autocreados"] });
      toast({ title: "Turno cerrado", description: `Turno #${currentShift!.shiftNumber} cerrado. Nuevo turno abierto automáticamente.` });
      setCloseShiftDialog(false);
      resetCloseDialog();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const tomarTurnoMutation = useMutation({
    mutationFn: async (operador: string) => {
      return apiRequest("PATCH", `/api/cash/shifts/${currentShift!.id}/tomar`, { operador });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shifts/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash/shifts/autocreados"] });
      toast({ title: "Turno tomado", description: "El operador fue asignado al turno activo." });
      setTomarTurnoDialog(false);
      setOpenedBy("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (shiftLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CircleDot className="h-5 w-5" />
            Estado del Turno - {config.areaLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!currentShift ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-muted-foreground" data-testid={`text-no-shift-${area}`}>
                No hay turno abierto para {config.areaLabel}
              </p>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white no-default-hover-elevate"
                onClick={() => setOpenShiftDialog(true)}
                data-testid={`btn-open-shift-${area}`}
              >
                <Plus className="h-4 w-4 mr-2" />
                Abrir Turno
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {currentShift.autoCreado && !currentShift.openedBy ? (
                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                  ⚠ Turno autocreado — sin operador
                </Badge>
              ) : (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  Turno abierto
                </Badge>
              )}
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatTime(currentShift.openedAt)}
                {currentShift.openedBy ? ` — ${currentShift.openedBy}` : ""}
              </span>
              <span className="text-sm" data-testid={`text-shift-info-${area}`}>
                Turno #{currentShift.shiftNumber}
              </span>
              {(!currentShift.openedBy || currentShift.autoCreado) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTomarTurnoDialog(true)}
                  data-testid={`btn-tomar-turno-${area}`}
                  className="text-yellow-700 border-yellow-400 hover:bg-yellow-50"
                >
                  Tomar turno
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {currentShift && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Movimientos
              </CardTitle>
              <Button
                onClick={() => setMovementDialog(true)}
                data-testid={`btn-manual-movement-${area}`}
              >
                <Plus className="h-4 w-4 mr-2" />
                Registrar movimiento manual
              </Button>
            </CardHeader>
            <CardContent>
              {movementsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : movements.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay movimientos registrados</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Origen</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Método de pago</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={m.id} data-testid={`movement-row-${m.id}`}>
                        <TableCell>{formatTime(m.createdAt)}</TableCell>
                        <TableCell>
                          <Badge className={AREA_COLORS[m.area] || ""}>
                            {AREA_LABEL_MAP[m.area] || m.area}
                          </Badge>
                        </TableCell>
                        <TableCell>{m.description || m.sourceLabel || "-"}</TableCell>
                        <TableCell>{PAYMENT_METHOD_MAP[m.paymentMethod] || m.paymentMethod}</TableCell>
                        <TableCell>
                          {m.movementType === "income" ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Ingreso</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Egreso</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(m.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumen Parcial</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryTable movements={movements} />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              variant="destructive"
              onClick={() => setCloseShiftDialog(true)}
              data-testid={`btn-close-shift-${area}`}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cerrar Turno
            </Button>
          </div>
        </>
      )}

      <Dialog open={openShiftDialog} onOpenChange={setOpenShiftDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir Turno - {config.areaLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Responsable *</label>
              <Input
                value={openedBy}
                onChange={(e) => setOpenedBy(e.target.value)}
                placeholder="Nombre del responsable"
                data-testid={`input-opened-by-${area}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Observaciones</label>
              <Textarea
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                placeholder="Observaciones opcionales"
                data-testid={`input-open-notes-${area}`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => openShiftMutation.mutate()}
              disabled={!openedBy.trim() || openShiftMutation.isPending}
              data-testid={`btn-confirm-open-shift-${area}`}
            >
              Confirmar apertura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={movementDialog} onOpenChange={setMovementDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Movimiento Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <Select value={movType} onValueChange={setMovType}>
                <SelectTrigger data-testid={`select-mov-type-${area}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Ingreso</SelectItem>
                  <SelectItem value="expense">Egreso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Descripción</label>
              <Input
                value={movDesc}
                onChange={(e) => setMovDesc(e.target.value)}
                placeholder="Descripción del movimiento"
                data-testid={`input-mov-desc-${area}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Método de pago</label>
              <Select value={movMethod} onValueChange={setMovMethod}>
                <SelectTrigger data-testid={`select-mov-method-${area}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_MAP).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Monto</label>
              <Input
                type="number"
                value={movAmount}
                onChange={(e) => setMovAmount(e.target.value)}
                placeholder="0"
                data-testid={`input-mov-amount-${area}`}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Comprobante (opcional)</label>
              <Select value={movReceipt} onValueChange={setMovReceipt}>
                <SelectTrigger data-testid={`select-mov-receipt-${area}`}>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ticket">Ticket</SelectItem>
                  <SelectItem value="factura_a">Factura A</SelectItem>
                  <SelectItem value="factura_b">Factura B</SelectItem>
                  <SelectItem value="factura_c">Factura C</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => addMovementMutation.mutate()}
              disabled={!movDesc.trim() || !movAmount || addMovementMutation.isPending}
              data-testid={`btn-confirm-movement-${area}`}
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeShiftDialog} onOpenChange={(open) => { if (!open) { setCloseShiftDialog(false); resetCloseDialog(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Cerrar Turno — {config.areaLabel}
              {currentShift && <span className="ml-2 text-sm font-normal text-muted-foreground">Turno #{currentShift.shiftNumber}</span>}
            </DialogTitle>
          </DialogHeader>

          {closeStep === 1 && (
            <div className="space-y-4">
              <SummaryTable movements={movements} />

              <div className="border rounded-lg p-4 space-y-2 bg-muted/20">
                <p className="text-sm font-semibold">Conteo de efectivo físico</p>
                {[
                  { label: "Billetes $1.000", val: billetes1000, set: setBilletes1000, mult: 1000 },
                  { label: "Billetes $500",   val: billetes500,  set: setBilletes500,  mult: 500  },
                  { label: "Billetes $200",   val: billetes200,  set: setBilletes200,  mult: 200  },
                  { label: "Billetes $100",   val: billetes100,  set: setBilletes100,  mult: 100  },
                  { label: "Billetes $50",    val: billetes50,   set: setBilletes50,   mult: 50   },
                  { label: "Monedas ($)",     val: monedas,      set: setMonedas,      mult: 1    },
                ].map(({ label, val, set, mult }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs w-36 shrink-0">{label}</span>
                    <Input type="number" min={0} value={val || ""} onChange={e => set(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-20 h-7 text-sm" />
                    {mult > 1 && <span className="text-xs text-muted-foreground">= ${(val * mult).toLocaleString("es-AR")}</span>}
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                  <span>Total contado:</span>
                  <span>${efectivoContado.toLocaleString("es-AR")}</span>
                </div>
                <div className={`flex justify-between text-sm ${diferencia !== 0 ? "text-red-600" : "text-green-600"}`}>
                  <span>Sistema (efectivo):</span>
                  <span>${efectivoSistema.toLocaleString("es-AR")}</span>
                </div>
                {diferencia !== 0 && (
                  <div className="flex justify-between text-sm font-semibold text-red-600">
                    <span>Diferencia:</span>
                    <span>{diferencia > 0 ? "+" : ""}{diferencia.toLocaleString("es-AR")}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id={`enviar-admin-${area}`} checked={enviarAdmin} onChange={e => setEnviarAdmin(e.target.checked)} className="w-4 h-4" />
                <label htmlFor={`enviar-admin-${area}`} className="text-sm">Enviar efectivo a Caja Administración</label>
              </div>

              <div>
                <label className="text-sm font-medium">Cerrado por *</label>
                <Input value={closedBy} onChange={e => setClosedBy(e.target.value)} placeholder="Nombre de quien cierra" data-testid={`input-closed-by-${area}`} />
              </div>
              <div>
                <label className="text-sm font-medium">Observaciones</label>
                <Textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Observaciones opcionales" data-testid={`input-close-notes-${area}`} />
              </div>
            </div>
          )}

          {closeStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-700">
                <span className="text-lg">✓</span>
                <span className="font-medium">Turno #{currentShift?.shiftNumber} listo para cerrarse</span>
              </div>
              <div className="border rounded-lg p-4 bg-muted/20 space-y-1">
                <p className="text-sm font-semibold">Próximo turno</p>
                <p className="text-xs text-muted-foreground">El sistema abrirá automáticamente el siguiente turno con saldo inicial $0.</p>
                <p className="text-xs text-muted-foreground mt-1">Efectivo contado: <strong>${efectivoContado.toLocaleString("es-AR")}</strong> {enviarAdmin ? "(se registrará en Caja Adm.)" : ""}</p>
              </div>
              <div>
                <label className="text-sm font-medium">¿Quién toma el siguiente turno? <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <Input value={operadorSiguiente} onChange={e => setOperadorSiguiente(e.target.value)} placeholder="Dejar vacío si no hay relevo inmediato" data-testid={`input-next-operator-${area}`} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {closeStep === 2 && (
              <Button variant="outline" onClick={() => setCloseStep(1)}>← Atrás</Button>
            )}
            {closeStep === 1 && area === "recepcion" ? (
              <Button onClick={() => setCloseStep(2)} disabled={!closedBy.trim()} data-testid={`btn-next-close-step-${area}`}>
                Siguiente →
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => closeShiftMutation.mutate()}
                disabled={!closedBy.trim() || closeShiftMutation.isPending} data-testid={`btn-confirm-close-shift-${area}`}>
                {closeShiftMutation.isPending ? "Cerrando..." : "Confirmar y cerrar turno"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tomarTurnoDialog} onOpenChange={setTomarTurnoDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tomar turno — {config.areaLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Este turno fue creado automáticamente. Ingresá tu nombre para tomarlo.</p>
            <Input value={openedBy} onChange={e => setOpenedBy(e.target.value)} placeholder="Tu nombre" data-testid={`input-tomar-turno-operador-${area}`} autoFocus />
          </div>
          <DialogFooter>
            <Button onClick={() => tomarTurnoMutation.mutate(openedBy)} disabled={!openedBy.trim() || tomarTurnoMutation.isPending} data-testid={`btn-confirm-tomar-turno-${area}`}>
              {tomarTurnoMutation.isPending ? "Guardando..." : "Tomar turno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!closingSummaryData} onOpenChange={() => setClosingSummaryData(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Resumen de Cierre</DialogTitle>
          </DialogHeader>
          {closingSummaryData && (
            <div className="space-y-4">
              <SummaryTable movements={closingSummaryData.movements} />
              <DialogFooter>
                <Button
                  onClick={() => printClosingSummary(closingSummaryData.shift, closingSummaryData.movements)}
                  data-testid={`btn-print-closing-${area}`}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistorialTab() {
  const [areaFilter, setAreaFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detailShiftId, setDetailShiftId] = useState<number | null>(null);

  const queryParams = new URLSearchParams();
  if (areaFilter !== "all") queryParams.set("area", areaFilter);
  if (dateFrom) queryParams.set("from", dateFrom);
  if (dateTo) queryParams.set("to", dateTo);
  const qs = queryParams.toString();

  const { data: history = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/cash/summary", qs],
    queryFn: async () => {
      const res = await fetch(`/api/cash/summary${qs ? "?" + qs : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error loading history");
      return res.json();
    },
  });

  const { data: shiftDetail, isLoading: detailLoading } = useQuery<ShiftDetail>({
    queryKey: ["/api/cash/shifts", detailShiftId],
    queryFn: async () => {
      const res = await fetch(`/api/cash/shifts/${detailShiftId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Error loading detail");
      return res.json();
    },
    enabled: !!detailShiftId,
  });

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Caja
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4 mb-6">
            <div>
              <label className="text-sm font-medium">Área</label>
              <Select value={areaFilter} onValueChange={setAreaFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-history-area">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="reception">Recepción</SelectItem>
                  <SelectItem value="restaurant">Restaurante</SelectItem>
                  <SelectItem value="spa">SPA</SelectItem>
                  <SelectItem value="events">Eventos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Desde</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-history-from"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Hasta</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-history-to"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay registros para los filtros seleccionados</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead>Abierto por</TableHead>
                  <TableHead>Cerrado por</TableHead>
                  <TableHead>Hora apertura</TableHead>
                  <TableHead>Hora cierre</TableHead>
                  <TableHead className="text-right">Total general</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row: any) => (
                  <TableRow key={row.id} data-testid={`history-row-${row.id}`}>
                    <TableCell>{row.shift ? formatDate(row.shift.openedAt) : formatDate(row.closedAt)}</TableCell>
                    <TableCell>
                      <Badge className={AREA_COLORS[row.area] || ""}>
                        {AREA_LABEL_MAP[row.area] || row.area}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.shift?.shiftNumber || "-"}</TableCell>
                    <TableCell>{row.shift?.openedBy || "-"}</TableCell>
                    <TableCell>{row.shift?.closedBy || row.closedBy || "-"}</TableCell>
                    <TableCell>{row.shift ? formatTime(row.shift.openedAt) : "-"}</TableCell>
                    <TableCell>{row.shift?.closedAt ? formatTime(row.shift.closedAt) : (row.closedAt ? formatTime(row.closedAt) : "-")}</TableCell>
                    <TableCell className="text-right font-medium">
                      {row.totalGeneral != null ? formatCurrency(row.totalGeneral) : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailShiftId(row.shiftId)}
                        data-testid={`btn-view-detail-${row.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailShiftId} onOpenChange={() => setDetailShiftId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del Turno</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : shiftDetail ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <Badge className={AREA_COLORS[shiftDetail.shift.area] || ""}>
                  {AREA_LABEL_MAP[shiftDetail.shift.area] || shiftDetail.shift.area}
                </Badge>
                <span className="text-sm">Turno #{shiftDetail.shift.shiftNumber}</span>
                <span className="text-sm text-muted-foreground">
                  {shiftDetail.shift.openedBy} - {formatTime(shiftDetail.shift.openedAt)}
                  {shiftDetail.shift.closedAt && ` / ${shiftDetail.shift.closedBy} - ${formatTime(shiftDetail.shift.closedAt)}`}
                </span>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Resumen por método</h3>
                <SummaryTable movements={shiftDetail.movements} />
              </div>

              <div>
                <h3 className="font-semibold mb-2">Movimientos</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shiftDetail.movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{formatTime(m.createdAt)}</TableCell>
                        <TableCell>{m.description || m.sourceLabel || "-"}</TableCell>
                        <TableCell>{PAYMENT_METHOD_MAP[m.paymentMethod] || m.paymentMethod}</TableCell>
                        <TableCell>
                          {m.movementType === "income" ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Ingreso</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Egreso</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(m.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <DialogFooter>
                <Button
                  onClick={() => printClosingSummary(shiftDetail.shift, shiftDetail.movements)}
                  data-testid={`btn-print-detail-${detailShiftId}`}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CashRegister() {
  const { data: configs, isLoading } = useQuery<CashConfig[]>({
    queryKey: ["/api/cash/configs"],
    queryFn: async () => {
      const res = await fetch("/api/cash/configs", { credentials: "include" });
      if (!res.ok) throw new Error("Error loading configs");
      return res.json();
    },
  });

  const activeConfigs = configs?.filter((c) => c.isActive) || [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const defaultTab = activeConfigs.length > 0 ? activeConfigs[0].area : "historial";

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-3xl font-bold tracking-tight" data-testid="text-cash-register-title">
        Caja
      </h1>

      <Tabs defaultValue={defaultTab}>
        <TabsList data-testid="tabs-cash-areas">
          {activeConfigs.map((c) => (
            <TabsTrigger key={c.area} value={c.area} data-testid={`tab-${c.area}`}>
              {c.areaLabel}
            </TabsTrigger>
          ))}
          <TabsTrigger value="historial" data-testid="tab-historial">
            Historial
          </TabsTrigger>
        </TabsList>

        {activeConfigs.map((c) => (
          <TabsContent key={c.area} value={c.area}>
            <AreaTab area={c.area} config={c} />
          </TabsContent>
        ))}

        <TabsContent value="historial">
          <HistorialTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}