import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { PrefacturaDialog } from "@/components/PrefacturaDialog";
import { fmtMoney, getArgentinaToday } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, parseApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { allocateGroupInvoiceSources, grossItemsTotal } from "@/lib/group-invoice-allocation";
import { ToastAction } from "@/components/ui/toast";
import { format } from "date-fns";
import {
  FileText, Plus, Download, Settings, Search, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  FlaskConical, ShieldCheck, ShieldAlert, Upload, Wifi, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const today = () => getArgentinaToday();
const firstOfCurrentMonth = () => today().slice(0, 7) + "-01";

function fPeso(n: number | string | undefined | null) {
  const num = parseFloat(String(n ?? 0)) || 0;
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function fDate(d: string | undefined | null) {
  if (!d) return "—";
  const dt = new Date(d + "T12:00:00");
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

function padNum(n: number | undefined, len: number) {
  return String(n ?? 0).padStart(len, "0");
}

const CONDICION_IVA_OPTIONS = [
  "Responsable Inscripto", "Consumidor Final", "Monotributista", "Exento",
];

const AREA_LABELS: Record<string, { label: string; color: string }> = {
  recepcion: { label: "Recepción", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  restaurant: { label: "Restaurant", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  spa: { label: "SPA", color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300" },
  eventos: { label: "Eventos", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  cocina: { label: "Cocina", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  bar: { label: "Bar", color: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300" },
};

const TIPO_LABELS: Record<string, { nombre: string; color: string }> = {
  FA:  { nombre: "Factura A",    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  FB:  { nombre: "Factura B",    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  FC:  { nombre: "Factura C",    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
  NCA: { nombre: "Nota Créd. A", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  NCB: { nombre: "Nota Créd. B", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  NDA: { nombre: "Nota Déb. A",  color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300" },
  NDB: { nombre: "Nota Déb. B",  color: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300" },
  NDC: { nombre: "Nota Déb. C",  color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300" },
  ticket: { nombre: "Ticket", color: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300" },
  voucher_justo: { nombre: "Voucher Justo", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  voucher_pedidos_ya: { nombre: "Voucher PedidosYa", color: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300" },
  cierre_habitacion: { nombre: "Voucher Habitaciones", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
  cierre_spa: { nombre: "Voucher SPA", color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300" },
};

// Tipos no-fiscales: no llaman a ARCA, no generan CAE real (solo numeración local interna).
const NON_FISCAL_TIPOS_SET = new Set(["ticket", "voucher_justo", "voucher_pedidos_ya", "cierre_habitacion", "cierre_spa"]);
const NON_FISCAL_LABELS: Record<string, string> = {
  ticket: "Ticket — Comprobante interno",
  voucher_justo: "Voucher Justo — Comprobante interno",
  voucher_pedidos_ya: "Voucher PedidosYa — Comprobante interno",
  cierre_habitacion: "Voucher Habitaciones — Comprobante interno",
  cierre_spa: "Voucher SPA — Comprobante interno",
};

type AmbienteMode = "ficticio" | "homologacion" | "produccion";

function AmbienteBadge({ ambiente }: { ambiente: AmbienteMode | undefined }) {
  if (!ambiente || ambiente === "ficticio")
    return <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20"><AlertTriangle className="w-3 h-3 mr-1" />Ficticio</Badge>;
  if (ambiente === "homologacion")
    return <Badge variant="outline" className="text-xs text-blue-700 border-blue-400 bg-blue-50 dark:bg-blue-950/20"><FlaskConical className="w-3 h-3 mr-1" />Homologación</Badge>;
  return <Badge variant="outline" className="text-xs text-red-700 border-red-400 bg-red-50 dark:bg-red-950/20"><ShieldAlert className="w-3 h-3 mr-1" />Producción ARCA</Badge>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("facturas");
  const [showResPicker, setShowResPicker] = useState(false);
  const [resPickerSearch, setResPickerSearch] = useState("");
  const [prefacturaResId, setPrefacturaResId] = useState<number | null>(null);

  // Fetch the full reservation detail so PrefacturaDialog always receives a
  // complete object (guest.vatCondition, guest.cuilCuit, company.*, agency.*),
  // regardless of what the list endpoint returns.
  const { data: prefacturaRes = null } = useQuery<any | null>({
    queryKey: ["/api/reservations", prefacturaResId, "detail"],
    queryFn: () =>
      fetch(`/api/reservations/${prefacturaResId}`, { credentials: "include" }).then(r => r.json()),
    enabled: prefacturaResId !== null,
    staleTime: 0,
  });

  // Debounced search: only send a request after the user stops typing for 300 ms.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(resPickerSearch), 300);
    return () => clearTimeout(id);
  }, [resPickerSearch]);

  const pickerQs = new URLSearchParams({
    dateMode: "all",
    statuses: "confirmed,checked_in,checked_out",
    limit: debouncedSearch.trim() ? "15" : "10",
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
  }).toString();

  const { data: pickerReservations = [], isFetching: pickerFetching } = useQuery<any[]>({
    queryKey: ["/api/reservations", "picker", pickerQs],
    queryFn: () => fetch(`/api/reservations?${pickerQs}`, { credentials: "include" }).then(r => r.json()),
    enabled: showResPicker,
    staleTime: 30_000,
  });
  const [showNC, setShowNC] = useState<number | null>(null);
  const [filtroDesde, setFiltroDesde] = useState(firstOfCurrentMonth());
  const [filtroHasta, setFiltroHasta] = useState(today());
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroArea, setFiltroArea] = useState("");

  const qp = new URLSearchParams({
    desde: filtroDesde,
    hasta: filtroHasta,
    ...(filtroTipo ? { tipo: filtroTipo } : {}),
    ...(filtroArea ? { area: filtroArea } : {}),
  }).toString();

  const { data: invoices = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/billing/invoices", qp],
    queryFn: () => fetch(`/api/billing/invoices?${qp}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: pendingCreditNotes = [] } = useQuery<any[]>({
    queryKey: ["/api/billing/credit-note-reconciliations/pending"],
    queryFn: async () => {
      const response = await fetch("/api/billing/credit-note-reconciliations/pending", { credentials: "include" });
      if (!response.ok) throw new Error("No se pudieron cargar las conciliaciones pendientes");
      return response.json();
    },
  });

  const reconcileCreditNoteMutation = useMutation({
    mutationFn: (creditNoteId: number) => apiRequest("POST", `/api/billing/credit-notes/${creditNoteId}/reconcile`),
    onSuccess: async (response: Response) => {
      const data = await response.json();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/billing/credit-note-reconciliations/pending"] }),
      ]);
      toast({
        title: "NC conciliada",
        description: `${data.tipo_comprobante} ${padNum(data.punto_venta, 4)}-${padNum(data.numero, 8)} ya corrigió la factura y el Folio.`,
      });
    },
    onError: (error: any) => toast({
      title: "La NC sigue pendiente",
      description: parseApiError(error),
      variant: "destructive",
    }),
  });

  const { data: config } = useQuery<any>({ queryKey: ["/api/billing/config"] });

  const totales = (invoices as any[]).reduce((acc, f) => {
    if (f.estado !== "anulada") { acc.count++; acc.total += parseFloat(f.monto_total ?? "0") || 0; }
    return acc;
  }, { count: 0, total: 0 });

  const ambiente: AmbienteMode = config?.arcaAmbiente ?? "ficticio";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Facturación Electrónica</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-muted-foreground text-sm">
                {ambiente === "ficticio" ? "Modo Prueba (ficticio)"
                  : ambiente === "homologacion" ? "Homologación ARCA — pruebas sin efecto fiscal"
                  : "Producción ARCA — comprobantes válidos fiscalmente"}
              </p>
              <AmbienteBadge ambiente={ambiente} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setActiveTab("config")} data-testid="btn-billing-config">
              <Settings className="w-4 h-4 mr-1" />
              Configuración
            </Button>
            <Button onClick={() => { setResPickerSearch(""); setShowResPicker(true); }} data-testid="btn-emitir-factura">
              <Plus className="w-4 h-4 mr-1" />
              Emitir Factura
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="facturas">Comprobantes emitidos</TabsTrigger>
            <TabsTrigger value="config">Configuración</TabsTrigger>
          </TabsList>

          {/* ── FACTURAS TAB ─────────────────────────────────── */}
          <TabsContent value="facturas">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <Card><CardContent className="pt-4 pb-3"><div className="text-xs text-muted-foreground">Período</div><div className="font-semibold text-sm">{fDate(filtroDesde)} — {fDate(filtroHasta)}</div></CardContent></Card>
              <Card><CardContent className="pt-4 pb-3"><div className="text-xs text-muted-foreground">Comprobantes emitidos</div><div className="font-bold text-xl">{totales.count}</div></CardContent></Card>
              <Card><CardContent className="pt-4 pb-3"><div className="text-xs text-muted-foreground">Total facturado</div><div className="font-bold text-xl text-green-600">${fPeso(totales.total)}</div></CardContent></Card>
            </div>

            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <div className="flex items-center gap-1">
                <Input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} className="w-36 text-sm h-8" />
                <span className="text-muted-foreground text-sm">a</span>
                <Input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} className="w-36 text-sm h-8" />
              </div>
              <Select value={filtroTipo || "__all__"} onValueChange={(v) => setFiltroTipo(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-filtro-tipo"><SelectValue placeholder="Tipo..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos los tipos</SelectItem>
                  <SelectItem value="FA">Factura A</SelectItem>
                  <SelectItem value="FB">Factura B</SelectItem>
                  <SelectItem value="FT">Factura T</SelectItem>
                  <SelectItem value="FM">Factura MiPyme A</SelectItem>
                  <SelectItem value="FC">Factura C</SelectItem>
                  <SelectItem value="NCA">NC A</SelectItem>
                  <SelectItem value="NCB">NC B</SelectItem>
                  <SelectItem value="NCT">NC T</SelectItem>
                  <SelectItem value="NCM">NC MiPyme A</SelectItem>
                  <SelectItem value="NDA">ND A</SelectItem>
                  <SelectItem value="NDB">ND B</SelectItem>
                  <SelectItem value="NDT">ND T</SelectItem>
                  <SelectItem value="NDM">ND MiPyme A</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroArea || "__all__"} onValueChange={(v) => setFiltroArea(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-filtro-area"><SelectValue placeholder="Área..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas las áreas</SelectItem>
                  <SelectItem value="recepcion">Recepción</SelectItem>
                  <SelectItem value="restaurant">Restaurant</SelectItem>
                  <SelectItem value="spa">SPA</SelectItem>
                  <SelectItem value="eventos">Eventos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Actualizar
              </Button>
            </div>

            {(pendingCreditNotes as any[]).length > 0 && (
              <Card className="mb-4 border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-amber-900 dark:text-amber-100">
                    <AlertTriangle className="w-4 h-4" />
                    Conciliaciones fiscales pendientes ({(pendingCreditNotes as any[]).length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(pendingCreditNotes as any[]).map((nc: any) => (
                    <div key={nc.id} className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between rounded-md border border-amber-200 bg-background/70 p-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {TIPO_LABELS[nc.tipo_comprobante]?.nombre || nc.tipo_comprobante} {padNum(nc.punto_venta, 4)}-{padNum(nc.numero, 8)}
                          <span className="font-normal text-muted-foreground"> · Reserva #{nc.reserva_id}</span>
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          Factura original {nc.original_tipo_comprobante} {padNum(nc.original_punto_venta, 4)}-{padNum(nc.original_numero, 8)} · ${fPeso(nc.monto_total)}
                        </div>
                        {nc.reconciliation_error && (
                          <div className="text-amber-800 dark:text-amber-200 mt-1">{nc.reconciliation_error}</div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-amber-400 text-amber-900 hover:bg-amber-100 dark:text-amber-100"
                        onClick={() => reconcileCreditNoteMutation.mutate(Number(nc.id))}
                        disabled={reconcileCreditNoteMutation.isPending}
                        data-testid={`btn-reconcile-credit-note-${nc.id}`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${reconcileCreditNoteMutation.isPending ? "animate-spin" : ""}`} />
                        Reintentar y conciliar
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Cargando...</div>
                ) : (invoices as any[]).length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No hay comprobantes en el período seleccionado</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                          <th className="px-3 py-2 text-left">Tipo / N°</th>
                          <th className="px-3 py-2 text-left">Área</th>
                          <th className="px-3 py-2 text-left">Fecha</th>
                          <th className="px-3 py-2 text-left">Cliente</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-left">CAE</th>
                          <th className="px-3 py-2 text-left">Estado</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(invoices as any[]).map((f: any) => {
                          const tl = TIPO_LABELS[f.tipo_comprobante] ?? { nombre: f.tipo_comprobante, color: "bg-gray-100 text-gray-700" };
                          return (
                            <tr key={f.id} className={`hover:bg-muted/20 ${f.estado === "anulada" ? "opacity-50" : ""}`} data-testid={`row-invoice-${f.id}`}>
                              <td className="px-3 py-2">
                                <div className="flex flex-col gap-0.5">
                                  <Badge variant="outline" className={`text-xs w-fit px-1.5 ${tl.color}`}>{tl.nombre}</Badge>
                                  <span className="text-xs font-mono">{padNum(f.punto_venta, 4)}-{padNum(f.numero, 8)}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                {f.area_name ? (
                                  <Badge variant="outline" className={`text-[10px] px-1.5 ${AREA_LABELS[f.area_name]?.color || "bg-gray-100 text-gray-700"}`}>
                                    {AREA_LABELS[f.area_name]?.label || f.area_name}
                                  </Badge>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                              <td className="px-3 py-2 text-xs">{fDate(f.fecha_emision)}</td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-xs truncate max-w-[160px]">{f.cliente_razon_social}</div>
                                <div className="text-xs text-muted-foreground">{f.cliente_cuit || f.cliente_dni || f.cliente_condicion_iva}</div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="font-semibold">${fPeso(f.monto_total)}</div>
                                {f.cash_forma_pago && <div className="text-xs text-muted-foreground">{f.cash_forma_pago === "transferencia" ? "Transferencia" : f.cash_forma_pago === "echeq" ? "eCheq" : f.cash_forma_pago === "cheque" ? "Cheque" : f.cash_forma_pago === "efectivo" ? "Efectivo" : f.cash_forma_pago === "compensacion" ? "Compensación" : f.cash_forma_pago === "tarjeta" ? "Tarjeta" : f.cash_forma_pago === "cuenta_corriente" ? "Cta. Corriente" : f.cash_forma_pago}</div>}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-mono">{f.cae ? f.cae.substring(0, 8) + "..." : "—"}</span>
                                  {f.modo_ficticio && <Badge variant="outline" className="text-xs px-1 text-yellow-600 border-yellow-400">Ficticio</Badge>}
                                </div>
                                <div className="text-xs text-muted-foreground">Vto: {fDate(f.cae_fecha_vto)}</div>
                              </td>
                              <td className="px-3 py-2">
                                {f.reconciliation_status === "pendiente" ? (
                                  <div>
                                    <Badge variant="outline" className="text-xs text-amber-800 border-amber-400 bg-amber-50 dark:bg-amber-950/20">
                                      <AlertTriangle className="w-3 h-3 mr-1" />Pendiente de conciliar
                                    </Badge>
                                    <div className="text-[10px] text-amber-700 dark:text-amber-300">No emitir otra NC</div>
                                  </div>
                                ) : f.estado === "emitida" || f.estado === "parcial" ? (
                                  <Badge variant="outline" className="text-xs text-green-700 border-green-400 bg-green-50 dark:bg-green-950/20"><CheckCircle2 className="w-3 h-3 mr-1" />Emitida</Badge>
                                ) : (
                                  <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1" />Anulada</Badge>
                                )}
                                {f.estado === "parcial" && <div className="text-[10px] text-amber-700 dark:text-amber-300">Saldo pendiente</div>}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-1 justify-end">
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(`/api/billing/invoices/${f.id}/pdf`, "_blank")} title="Descargar PDF" data-testid={`btn-pdf-${f.id}`}>
                                    <Download className="w-3.5 h-3.5" />
                                  </Button>
                                  {(f.estado === "emitida" || f.estado === "parcial") && !f.tipo_comprobante?.startsWith("NC") && !f.tipo_comprobante?.startsWith("ND") && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700"
                                      onClick={() => setShowNC(f.id)}
                                      title={f.estado === "parcial" ? "Emitir otra Nota de Crédito sobre el saldo pendiente" : "Emitir Nota de Crédito"}
                                      data-testid={`btn-nc-${f.id}`}
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── CONFIG TAB ───────────────────────────────────── */}
          <TabsContent value="config">
            <BillingConfigPanel config={config} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Selector de reserva → PrefacturaDialog */}
      <Dialog open={showResPicker} onOpenChange={v => { if (!v) setShowResPicker(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Emitir comprobante — seleccioná una reserva</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Input
              placeholder="Buscar por huésped, habitación o ID..."
              value={resPickerSearch}
              onChange={e => setResPickerSearch(e.target.value)}
              autoFocus
              data-testid="input-res-picker-search"
            />
            <div className="max-h-72 overflow-y-auto divide-y rounded-md border">
              {pickerFetching ? (
                <p className="text-sm text-muted-foreground text-center py-6">Buscando...</p>
              ) : pickerReservations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin reservas encontradas</p>
              ) : null}
              {pickerReservations.map((r: any) => {
                const name = [r.guest?.firstName, r.guest?.lastName].filter(Boolean).join(" ") || "Sin huésped";
                const room = r.room?.number || r.roomNumber || "—";
                const ci = r.checkInDate ? r.checkInDate.slice(8, 10) + "/" + r.checkInDate.slice(5, 7) : "";
                const co = r.checkOutDate ? r.checkOutDate.slice(8, 10) + "/" + r.checkOutDate.slice(5, 7) : "";
                const statusLabel: Record<string, string> = {
                  confirmed: "Confirmada", checked_in: "Check-in", checked_out: "Check-out"
                };
                return (
                  <button
                    key={r.id}
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setShowResPicker(false);
                      setPrefacturaResId(r.id);
                    }}
                    data-testid={`row-res-picker-${r.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-sm">{name}</span>
                        <span className="text-xs text-muted-foreground ml-2">Hab. {room}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{ci}–{co}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{statusLabel[r.status] || r.status} · ID {r.id}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {prefacturaResId !== null && (
        <PrefacturaDialog
          open={prefacturaResId !== null}
          onClose={() => { setPrefacturaResId(null); }}
          reservationId={prefacturaResId}
          reservation={prefacturaRes}
          mode="billing"
        />
      )}

      {showNC !== null && <NotaCreditoDialog invoiceId={showNC} onClose={() => setShowNC(null)} />}
    </div>
  );
}

// ─── Emitir Factura Dialog ────────────────────────────────────────────────────

type Item = {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  alicuotaIva: "21" | "10.5" | "exento" | "no_gravado";
  subtotalNeto: number;
  subtotal: number;
};

export type EmitirFacturaInitialValues = {
  razonSocial?: string;
  cuit?: string;
  dni?: string;
  documentType?: string;
  paymentMethod?: string;
  condicionIva?: string;
  domicilio?: string;
  items?: Array<{ descripcion: string; precioUnitario: number }>;
};

type RecipientProfile = {
  type: "guest" | "company" | "agency";
  id: string;
  firstName?: string;
  lastName?: string;
};

type GroupInvoiceSourcePreview = {
  id: string;
  concept: string;
  destination: string;
  eligible: number;
  invoiced: number;
  available: number;
};

type GroupPaymentDestinationPreview = {
  id: string;
  concept: string;
  destination: string;
  eligible: number;
  invoiced: number;
  available: number;
};

export function EmitirFacturaDialog({ open, onClose, config, initialValues, onSuccess, allowedTipos, cashArea, showPaymentMethod, requiresEmission, paymentId, groupId, groupPaymentId, groupPaymentGroupId, groupInvoiceSources, groupPaymentDestinations, lockCondicionIva, hideAddItems, lockItems, billingEntityType, billingEntityId, recipientProfile, compactMode, skipReview }: {
  open: boolean;
  onClose: () => void;
  config: any;
  initialValues?: EmitirFacturaInitialValues;
  onSuccess?: (invoiceData?: any) => void;
  allowedTipos?: Array<string>;
  cashArea?: string;
  /** Show the payment method without registering another cash movement. */
  showPaymentMethod?: boolean;
  requiresEmission?: boolean;
  paymentId?: string;
  /** When set, the emitted invoice will be automatically linked to the group folio (for invoices emitted from the Resumen del Grupo without a payment) */
  groupId?: string;
  /** Parent receipt for a group payment; unlike paymentId it works even when no room allocation exists. */
  groupPaymentId?: string;
  /** Group owning groupPaymentId. */
  groupPaymentGroupId?: string;
  /** Server snapshot shown before group emission and used for partial projections. */
  groupInvoiceSources?: GroupInvoiceSourcePreview[];
  /** Parent collection destinations, independently auditable from service concepts. */
  groupPaymentDestinations?: GroupPaymentDestinationPreview[];
  /** When true, the condición IVA field is read-only (pre-set from entity) */
  lockCondicionIva?: boolean;
  /** When true, the "Agregar ítem" button and extra item rows are hidden */
  hideAddItems?: boolean;
  /** When true, the pre-filled item cannot be modified or removed. */
  lockItems?: boolean;
  /** Pre-set billing entity — its address will be updated if the user changes domicilio */
  billingEntityType?: "company" | "agency";
  /** ID of the pre-set billing entity */
  billingEntityId?: string;
  /** Reservation profile whose fiscal data was pre-filled. */
  recipientProfile?: RecipientProfile;
  /**
   * When true, skip the form screen and open directly on the confirmation/summary panel.
   * Use when all data is already pre-filled via initialValues (e.g. from a groups payment dialog).
   * The user can still click "← Editar" to expand the full form.
   */
  compactMode?: boolean;
  /** Emit directly after validation instead of showing a redundant review step. */
  skipReview?: boolean;
}) {
  const { toast } = useToast();
  const tipos = allowedTipos && allowedTipos.length > 0 ? allowedTipos : ["FA", "FB"];
  const [tipo, setTipo] = useState<string>(tipos.includes("FB") ? "FB" : tipos[0]);
  const [cashFormaPago, setCashFormaPago] = useState("efectivo");
  const [ccEntityType, setCcEntityType] = useState<"company" | "agency">("company");
  const [ccEntityId, setCcEntityId] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [cuit, setCuit] = useState("");
  const [dni, setDni] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [condicionIva, setCondicionIva] = useState("Consumidor Final");
  const [domicilio, setDomicilio] = useState("");
  const [items, setItems] = useState<Item[]>([newItem()]);
  // Track the billing entity so we can update its address if the user edits domicilio
  const [selectedEntityInfo, setSelectedEntityInfo] = useState<{ type: "company" | "agency"; id: string } | null>(null);
  const originalDomicilioRef = useRef<string>("");
  const [puntoVentaNum, setPuntoVentaNum] = useState("");
  const [entitySearch, setEntitySearch] = useState("");
  const [showEntityDropdown, setShowEntityDropdown] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDuplicateAmountConfirm, setShowDuplicateAmountConfirm] = useState(false);
  const [duplicateAmountWarnings, setDuplicateAmountWarnings] = useState<string[]>([]);
  const [duplicateAmountAcknowledged, setDuplicateAmountAcknowledged] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [showRecipientChangeWarning, setShowRecipientChangeWarning] = useState(false);
  const [pendingEntity, setPendingEntity] = useState<any>(null);
  const [showEntityChangeWarning, setShowEntityChangeWarning] = useState(false);
  const [emitted, setEmitted] = useState(false);
  const [linkPending, setLinkPending] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [linkRetrying, setLinkRetrying] = useState(false);
  const [emittedInvoiceData, setEmittedInvoiceData] = useState<any>(null);
  const originalRecipientRef = useRef<Record<string, string>>({});
  const saveRecipientOnEmitRef = useRef(false);
  const { data: posConfigsData = [] } = useQuery<any[]>({ queryKey: ["/api/pos-configs"] });
  const { data: companies = [] } = useQuery<any[]>({ queryKey: ["/api/companies"] });
  const { data: agencies = [] } = useQuery<any[]>({ queryKey: ["/api/agencies"] });

  const entityResults: any[] = entitySearch.length >= 2
    ? [
        ...companies.map((c: any) => ({ ...c, _type: "Empresa" })),
        ...agencies.map((a: any) => ({ ...a, _type: "Agencia" })),
      ].filter((e: any) => {
        const name = (e.razonSocial || e.nombreFantasia || "").toLowerCase();
        const cuitVal = (e.cuilCuit || "").replace(/-/g, "");
        return name.includes(entitySearch.toLowerCase()) || cuitVal.includes(entitySearch.replace(/-/g, ""));
      }).slice(0, 8)
    : [];

  useEffect(() => {
    if (open && initialValues) {
      if (initialValues.razonSocial !== undefined) setRazonSocial(initialValues.razonSocial);
      if (initialValues.cuit !== undefined) setCuit(initialValues.cuit);
      if (initialValues.dni !== undefined) setDni(initialValues.dni);
      if (initialValues.paymentMethod) setCashFormaPago(initialValues.paymentMethod);
      setGuestFirstName(recipientProfile?.firstName || "");
      setGuestLastName(recipientProfile?.lastName || "");
      const initDom = initialValues.domicilio ?? "";
      if (initialValues.domicilio !== undefined) setDomicilio(initDom);
      originalDomicilioRef.current = initDom;
      originalRecipientRef.current = {
        razonSocial: initialValues.razonSocial || "",
        cuit: initialValues.cuit || "",
        dni: initialValues.dni || "",
        condicionIva: initialValues.condicionIva || "Consumidor Final",
        domicilio: initDom,
        firstName: recipientProfile?.firstName || "",
        lastName: recipientProfile?.lastName || "",
      };
      if (initialValues.condicionIva !== undefined) setCondicionIva(initialValues.condicionIva);
      // Auto-select comprobante type based on cuit + condición IVA
      if (initialValues.cuit) {
        const iva = initialValues.condicionIva || "";
        const preferido = (iva === "Responsable Inscripto" || iva === "Exento") ? "FA" : "FB";
        setTipo(tipos.includes(preferido) ? preferido : tipos.includes("FA") ? "FA" : tipos[0]);
      } else {
        setTipo(tipos.includes("FB") ? "FB" : tipos[0]);
      }
      if (initialValues.items && initialValues.items.length > 0) {
        setItems(initialValues.items.map(it => {
          const base = it.precioUnitario;
          const neto = Number((base / 1.21).toFixed(2));
          return { descripcion: it.descripcion, cantidad: 1, precioUnitario: base, alicuotaIva: "21" as const, subtotalNeto: neto, subtotal: base };
        }));
      }
      // compactMode: jump straight to the confirm/summary screen — all data is pre-filled.
      // The user can still click "← Editar" to expand the full form if needed.
      if (compactMode) {
        setShowConfirm(true);
      }
    }
    if (open) {
      // Set entity info from props if provided (e.g. from grupos module)
      if (billingEntityType && billingEntityId) {
        setSelectedEntityInfo({ type: billingEntityType, id: billingEntityId });
      }
    }
    if (!open) resetForm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValues]);

  function applyEntity(entity: any) {
    const rs = entity.razonSocial || entity.nombreFantasia || "";
    const cuitVal = entity.cuilCuit || "";
    const condVal = entity.condicionIva || (cuitVal ? "Responsable Inscripto" : "Consumidor Final");
    const domVal = entity.domicilio || entity.direccion || "";
    setRazonSocial(rs);
    setCuit(cuitVal);
    setCondicionIva(condVal);
    const nextDom = domVal || "";
    setDomicilio(nextDom);
    originalDomicilioRef.current = nextDom;
    // Track the entity so we can update its address if domicilio is edited
    const eType: "company" | "agency" = entity._type === "Agencia" ? "agency" : "company";
    setSelectedEntityInfo({ type: eType, id: entity.id });
    if (cuitVal || condVal === "Responsable Inscripto" || condVal === "Exento" || condVal === "Monotributista") {
      // FA requiere CUIT; sin CUIT usar FB como fallback
      const auto = (condVal === "Responsable Inscripto" || condVal === "Exento") ? (cuitVal ? "FA" : "FB") : "FB";
      const nextTipo = tipos.includes(auto) ? auto : tipos.includes("FB") ? "FB" : tipos[0];
      setTipo(nextTipo);
      recalcForTipo(nextTipo, tipo);
    }
    setEntitySearch("");
    setShowEntityDropdown(false);
    setFieldErrors({});
  }

  function selectEntity(entity: any) {
    const entityType = entity._type === "Agencia" ? "agency" : "company";
    const isChangingAssociatedRecipient = !!recipientProfile
      && recipientProfile.type !== "guest"
      && (recipientProfile.type !== entityType || recipientProfile.id !== entity.id);
    if (isChangingAssociatedRecipient) {
      setPendingEntity(entity);
      setShowEntityChangeWarning(true);
      return;
    }
    applyEntity(entity);
  }

  function validateForm(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!razonSocial.trim()) errs.razonSocial = "Requerido";
    if (tipo === "FA") {
      const cuitClean = cuit.replace(/-/g, "");
      if (!cuitClean) errs.cuit = "Requerido para Factura A";
      else if (!/^\d{11}$/.test(cuitClean)) errs.cuit = "Debe tener 11 dígitos (ej: 20123456789)";
      if (condicionIva === "Consumidor Final") errs.condicionIva = "Factura A no aplica para Consumidor Final";
    }
    items.forEach((it, i) => {
      if (!it.descripcion.trim()) errs[`desc_${i}`] = "Descripción requerida";
      if (it.precioUnitario === 0) errs[`precio_${i}`] = "Precio debe ser distinto de 0";
    });
    if (cashArea && cashFormaPago === "cuenta_corriente" && !ccEntityId) {
      errs.ccEntity = `Seleccione ${ccEntityType === "company" ? "una empresa" : "una agencia"}`;
    }
    return errs;
  }

  function newItem(): Item {
    return { descripcion: "", cantidad: 1, precioUnitario: 0, alicuotaIva: (tipo === "FC" || tipo === "FT") ? "no_gravado" : "21", subtotalNeto: 0, subtotal: 0 };
  }

  function recalcForTipo(nextTipo: string, prevTipo?: string) {
    setItems(prev => prev.map(item => {
      // Si el ítem venía de Factura C, la alícuota fue forzada a "no_gravado" automáticamente;
      // al salir de FC hay que restaurar una alícuota real (21%) para que no quede "huérfano".
      const esNoGravadoViejo = (prevTipo === "FC" || prevTipo === "FT") && (nextTipo !== "FC" && nextTipo !== "FT");
      const alicuota = esNoGravadoViejo && item.alicuotaIva === "no_gravado" ? "21" : item.alicuotaIva;
      const base = item.cantidad * item.precioUnitario;
      if (nextTipo === "FC" || nextTipo === "FT") {
        return { ...item, alicuotaIva: "no_gravado" as const, subtotalNeto: base, subtotal: base };
      }
      // FA, FB, FM: el precio ingresado ya incluye IVA → extraer el neto dividiendo
      if (alicuota === "21") return { ...item, alicuotaIva: alicuota, subtotalNeto: Number((base / 1.21).toFixed(2)), subtotal: base };
      if (alicuota === "10.5") return { ...item, alicuotaIva: alicuota, subtotalNeto: Number((base / 1.105).toFixed(2)), subtotal: base };
      // exento / no_gravado: el monto ingresado es el total
      return { ...item, alicuotaIva: alicuota, subtotalNeto: base, subtotal: base };
    }));
  }

  function updateItem(idx: number, field: keyof Item, value: any) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx], [field]: value };
      const base = item.cantidad * item.precioUnitario;
      const fa = tipo === "FA";
      const fc = tipo === "FC";
      if (fc) {
        // Factura C no discrimina IVA: el importe ingresado es el total final.
        item.alicuotaIva = "no_gravado";
        item.subtotalNeto = base; item.subtotal = base;
      } else if (!fa) {
        if (item.alicuotaIva === "21") { item.subtotalNeto = Number((base / 1.21).toFixed(2)); item.subtotal = base; }
        else if (item.alicuotaIva === "10.5") { item.subtotalNeto = Number((base / 1.105).toFixed(2)); item.subtotal = base; }
        else { item.subtotalNeto = base; item.subtotal = base; }
      } else {
        // FA: el precio ingresado ya incluye IVA → extraer el neto dividiendo (igual que FB)
        if (item.alicuotaIva === "21") { item.subtotalNeto = Number((base / 1.21).toFixed(2)); item.subtotal = base; }
        else if (item.alicuotaIva === "10.5") { item.subtotalNeto = Number((base / 1.105).toFixed(2)); item.subtotal = base; }
        else { item.subtotalNeto = base; item.subtotal = base; }
      }
      updated[idx] = item;
      return updated;
    });
  }

  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  // Mirrors calcularMontos() in server/billing/invoiceService.ts: accumulate the
  // *gross* per-bucket amounts first, then round once at the aggregate level.
  // Rounding each item's neto/IVA individually before summing (the previous
  // approach) can drift the displayed total by a cent from the authoritative
  // gross sum the backend actually invoices.
  const brutos = items.reduce((acc, it) => {
    const bruto = round2(it.subtotal);
    if (it.alicuotaIva === "21") acc.bruto21 += bruto;
    else if (it.alicuotaIva === "10.5") acc.bruto105 += bruto;
    else if (it.alicuotaIva === "exento") acc.exento += bruto;
    else if (it.alicuotaIva === "no_gravado") acc.ng += bruto;
    return acc;
  }, { bruto21: 0, bruto105: 0, exento: 0, ng: 0 });
  const neto21 = round2(brutos.bruto21 / 1.21);
  const neto105 = round2(brutos.bruto105 / 1.105);
  const preview = {
    neto: round2(neto21 + neto105),
    iva21: round2(brutos.bruto21 - neto21),
    iva105: round2(brutos.bruto105 - neto105),
    exento: round2(brutos.exento),
    ng: round2(brutos.ng),
  };
  const totalPreview = round2(brutos.bruto21 + brutos.bruto105 + brutos.exento + brutos.ng);

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/billing/invoices", body),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/account-movements"] });
      const esNoFiscal = NON_FISCAL_TIPOS_SET.has(data.tipo_comprobante);
      toast({
        title: esNoFiscal ? "Comprobante emitido" : "Factura emitida",
        description: esNoFiscal
          ? `${TIPO_LABELS[data.tipo_comprobante]?.nombre ?? data.tipo_comprobante} ${padNum(data.punto_venta, 4)}-${padNum(data.numero, 8)}`
          : `${data.tipo_comprobante} ${padNum(data.punto_venta, 4)}-${padNum(data.numero, 8)} — CAE: ${data.cae}`,
      });
      setEmitted(true);
      setTimeout(() => window.open(`/api/billing/invoices/${data.id}/pdf`, "_blank"), 200);

      // Persist only changes the operator explicitly confirmed. This keeps the
      // reservation's guest/company/agency profile aligned with the receipt.
      if (saveRecipientOnEmitRef.current && recipientProfile) {
        try {
          if (recipientProfile.type === "guest") {
            await apiRequest("PATCH", `/api/guests/${recipientProfile.id}`, {
              firstName: guestFirstName.trim(),
              lastName: guestLastName.trim(),
              documentNumber: dni.trim(),
              cuilCuit: cuit.trim(),
              vatCondition: condicionIva,
              direccion: domicilio.trim(),
            });
            queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
          } else {
            const target = selectedEntityInfo || { type: recipientProfile.type, id: recipientProfile.id };
            const endpoint = target.type === "company"
              ? `/api/companies/${target.id}`
              : `/api/agencies/${target.id}`;
            await apiRequest("PATCH", endpoint, {
              razonSocial: razonSocial.trim(),
              cuilCuit: cuit.trim(),
              condicionIva,
              domicilio: domicilio.trim(),
            });
            queryClient.invalidateQueries({ queryKey: [target.type === "company" ? "/api/companies" : "/api/agencies"] });
          }
        } catch {
          toast({ title: "Factura emitida", description: "No se pudieron actualizar los datos de la ficha.", variant: "destructive" });
        } finally {
          saveRecipientOnEmitRef.current = false;
        }
      }

      // Automatically link the emitted invoice to the payment if paymentId was provided
      if (paymentId) {
        setEmittedInvoiceData(data);
        setLinkPending(true);
        try {
          if (showPaymentMethod) {
            const paymentUpdate = await apiRequest("PATCH", `/api/payments/${paymentId}`, { method: cashFormaPago });
            if (!paymentUpdate.ok) throw new Error("No se pudo actualizar la forma de pago");
          }
          const linkRes = await apiRequest("PATCH", `/api/payments/${paymentId}/invoice`, { invoiceData: data });
          setLinkPending(false);
          if (linkRes.ok) {
            queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
            onSuccess?.(data);
            onClose(); resetForm();
          } else {
            // Link failed — persist the flag so the payment can be found and re-linked later
            setLinkError(true);
            try { await apiRequest("PATCH", `/api/payments/${paymentId}/invoice-link-failed`, { invoiceData: data }); } catch {}
            queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
          }
        } catch {
          // Network error — persist the flag so the payment can be found and re-linked later
          setLinkPending(false);
          setLinkError(true);
          try { await apiRequest("PATCH", `/api/payments/${paymentId}/invoice-link-failed`, { invoiceData: data }); } catch {}
          queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
        }
      } else if (groupPaymentId && groupPaymentGroupId) {
        setEmittedInvoiceData(data);
        setLinkPending(true);
        try {
          const linkRes = await apiRequest(
            "PATCH",
            `/api/groups/${groupPaymentGroupId}/payments/${groupPaymentId}/invoice`,
            { invoiceData: data }
          );
          setLinkPending(false);
          if (linkRes.ok) {
            queryClient.invalidateQueries({ queryKey: ["/api/groups", groupPaymentGroupId, "folio"] });
            queryClient.invalidateQueries({ queryKey: ["/api/groups", groupPaymentGroupId, "master-folio"] });
            queryClient.invalidateQueries({ queryKey: ["/api/groups", groupPaymentGroupId, "invoice-snapshot"] });
            onSuccess?.(data);
            onClose(); resetForm();
          } else {
            setLinkError(true);
          }
        } catch {
          setLinkPending(false);
          setLinkError(true);
        }
      } else if (groupId) {
        // Link the invoice directly to the group folio (emitted from Resumen sin pago)
        // Uses the same durable pattern as paymentId: dialog stays open on failure, operator can retry
        setEmittedInvoiceData(data);
        setLinkPending(true);
        try {
          const linkRes = await apiRequest("POST", `/api/groups/${groupId}/direct-invoice`, { invoiceData: data });
          setLinkPending(false);
          if (linkRes.ok) {
            queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "direct-invoices"] });
            queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "invoice-snapshot"] });
            onSuccess?.(data);
            onClose(); resetForm();
          } else {
            setLinkError(true);
          }
        } catch {
          setLinkPending(false);
          setLinkError(true);
        }
      } else {
        onSuccess?.(data);
        onClose(); resetForm();
      }
    },
    onError: (e: any) => toast({ title: "Error", description: parseApiError(e), variant: "destructive" }),
  });

  function resetForm() {
    setTipo("FB"); setRazonSocial(""); setCuit(""); setDni("");
    setGuestFirstName(""); setGuestLastName("");
    setCondicionIva("Consumidor Final"); setDomicilio(""); setItems([newItem()]);
    setPuntoVentaNum(""); setCashFormaPago("efectivo"); setCcEntityType("company"); setCcEntityId("");
    setEntitySearch(""); setShowEntityDropdown(false); setFieldErrors({});
    setShowConfirm(false); setShowCloseWarning(false); setEmitted(false);
    setShowRecipientChangeWarning(false); setPendingEntity(null); setShowEntityChangeWarning(false);
    setLinkPending(false); setLinkError(false); setLinkRetrying(false); setEmittedInvoiceData(null);
    setSelectedEntityInfo(null); originalDomicilioRef.current = "";
    setShowDuplicateAmountConfirm(false); setDuplicateAmountWarnings([]); setDuplicateAmountAcknowledged(false);
  }

  const isFA = tipo === "FA" || tipo === "FM";
  const isFC = tipo === "FC" || tipo === "FT";
  const isNonFiscal = NON_FISCAL_TIPOS_SET.has(tipo);
  const ambiente: AmbienteMode = config?.arcaAmbiente ?? "ficticio";
  const faNeedsCuit = isFA && !cuit.replace(/-/g, ""); // FA/FM requires a CUIT before proceeding

  function handleClose() {
    if (linkPending || linkError) {
      // Linking in progress or link failed — don't allow silent close
      return;
    }
    if (requiresEmission && !emitted) {
      setShowCloseWarning(true);
    } else {
      onClose(); resetForm();
    }
  }

  async function handleRetryLink() {
    if (!emittedInvoiceData || (!paymentId && !groupId && !(groupPaymentId && groupPaymentGroupId))) return;
    setLinkRetrying(true);
    try {
      if (paymentId) {
        const linkRes = await apiRequest("PATCH", `/api/payments/${paymentId}/invoice`, { invoiceData: emittedInvoiceData });
        if (linkRes.ok) {
          queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
          toast({ title: "Vínculo exitoso", description: "La factura quedó vinculada al pago." });
          onSuccess?.(emittedInvoiceData);
          onClose(); resetForm();
        } else {
          toast({ title: "Reintento fallido", description: "No se pudo vincular la factura. Intente nuevamente.", variant: "destructive" });
        }
      } else if (groupPaymentId && groupPaymentGroupId) {
        const linkRes = await apiRequest(
          "PATCH",
          `/api/groups/${groupPaymentGroupId}/payments/${groupPaymentId}/invoice`,
          { invoiceData: emittedInvoiceData }
        );
        if (linkRes.ok) {
          queryClient.invalidateQueries({ queryKey: ["/api/groups", groupPaymentGroupId, "folio"] });
          queryClient.invalidateQueries({ queryKey: ["/api/groups", groupPaymentGroupId, "master-folio"] });
          toast({ title: "Vínculo exitoso", description: "La factura quedó vinculada al cobro grupal." });
          onSuccess?.(emittedInvoiceData);
          onClose(); resetForm();
        } else {
          toast({ title: "Reintento fallido", description: "No se pudo vincular la factura. Intente nuevamente.", variant: "destructive" });
        }
      } else if (groupId) {
        const linkRes = await apiRequest("POST", `/api/groups/${groupId}/direct-invoice`, { invoiceData: emittedInvoiceData });
        if (linkRes.ok) {
          queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "direct-invoices"] });
          toast({ title: "Vínculo exitoso", description: "La factura quedó vinculada al folio del grupo." });
          onSuccess?.(emittedInvoiceData);
          onClose(); resetForm();
        } else {
          toast({ title: "Reintento fallido", description: "No se pudo vincular la factura. Intente nuevamente.", variant: "destructive" });
        }
      }
    } catch {
      toast({ title: "Reintento fallido", description: "Error de red. Intente nuevamente.", variant: "destructive" });
    } finally {
      setLinkRetrying(false);
    }
  }

  function recipientHasChanges() {
    if (!recipientProfile) return false;
    const original = originalRecipientRef.current;
    return original.razonSocial !== razonSocial
      || original.cuit !== cuit
      || original.dni !== dni
      || original.condicionIva !== condicionIva
      || original.domicilio !== domicilio
      || (recipientProfile.type === "guest"
        && (original.firstName !== guestFirstName || original.lastName !== guestLastName));
  }

  /**
   * Flags group sources/destinations where the amount about to be invoiced
   * matches (or nearly matches) an amount already invoiced for the same
   * concept. The backend still hard-blocks any amount beyond what's
   * available; this is an extra sanity check for the case where an operator
   * accidentally re-selects a concept that was already billed and the
   * repeated amount would otherwise still fit within the available balance.
   */
  function computeGroupDuplicateWarnings(): string[] {
    const resolvedGroupId = groupId || groupPaymentGroupId;
    if (!resolvedGroupId) return [];
    const total = grossItemsTotal(items);
    if (total <= 0) return [];
    const warnings: string[] = [];
    const nearlyEquals = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, b * 0.01);
    if (groupPaymentId) {
      const destination = (groupPaymentDestinations || []).find(d => d.id === groupPaymentId);
      if (destination && destination.invoiced > 0 && nearlyEquals(total, destination.invoiced)) {
        warnings.push(`"${destination.destination}" ya tiene $${fPeso(destination.invoiced)} facturado y este comprobante es por $${fPeso(total)}, un importe igual o muy cercano.`);
      }
    } else {
      const allocation = allocateGroupInvoiceSources(groupInvoiceSources || [], total);
      for (const [sourceId, amount] of Object.entries(allocation)) {
        const source = (groupInvoiceSources || []).find(s => s.id === sourceId);
        if (source && source.invoiced > 0 && nearlyEquals(amount, source.invoiced)) {
          warnings.push(`"${source.destination} · ${source.concept}" ya tiene $${fPeso(source.invoiced)} facturado y este comprobante agregaría $${fPeso(amount)}, un importe igual o muy cercano.`);
        }
      }
    }
    return warnings;
  }

  function continueAfterValidation(saveRecipientProfile = false) {
    if (skipReview) handleConfirmEmit(saveRecipientProfile);
    else setShowConfirm(true);
  }

  function handleSubmit() {
    const errs = validateForm();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (recipientHasChanges()) {
      setShowRecipientChangeWarning(true);
      return;
    }
    continueAfterValidation();
  }

  function handleConfirmEmit(saveRecipientProfile = false) {
    setShowConfirm(false);
    saveRecipientOnEmitRef.current = saveRecipientProfile;
    const resolvedGroupId = groupId || groupPaymentGroupId;
    const groupSourceAmounts = resolvedGroupId && !groupPaymentId
      ? allocateGroupInvoiceSources(groupInvoiceSources || [], grossItemsTotal(items))
      : undefined;
    mutation.mutate({
      tipoComprobante: tipo,
      cliente: { razonSocial, cuit: cuit || undefined, dni: dni || undefined, condicionIva, domicilio: domicilio || undefined },
      items,
      puntoVenta: puntoVentaNum ? parseInt(puntoVentaNum) : undefined,
      ...(resolvedGroupId ? {
        groupId: resolvedGroupId,
        ...(groupPaymentId ? { groupPaymentId } : {
          sourceChargeIds: Object.keys(groupSourceAmounts || {}),
          sourceChargeAmounts: groupSourceAmounts,
        }),
      } : {}),
      ...((cashArea || showPaymentMethod)
        ? {
            ...(cashArea ? { cashArea } : {}),
            cashFormaPago,
            ...(cashArea ? {
              cashLabel: `${TIPO_LABELS[tipo]?.nombre ?? tipo} — ${razonSocial}`,
              ...(cashFormaPago === "cuenta_corriente" ? { ccEntityType, ccEntityId } : {}),
            } : {}),
          }
        : {}),
    });
  }

  return (
    <>
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{linkPending ? ((groupId || groupPaymentGroupId) ? "Vinculando factura al folio del grupo…" : "Vinculando factura al pago…") : linkError ? "Factura emitida — vínculo pendiente" : showConfirm ? "Revisar y confirmar" : "Emitir comprobante"}</DialogTitle></DialogHeader>

        {linkPending ? (
          <div className="space-y-4 py-2">
            {/* Invoice emitted — link request in progress */}
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-green-800 dark:text-green-300">Factura emitida correctamente</p>
                {emittedInvoiceData && (
                  <p className="text-green-700 dark:text-green-400 text-xs mt-0.5">
                    {emittedInvoiceData.tipo_comprobante} {padNum(emittedInvoiceData.punto_venta, 4)}-{padNum(emittedInvoiceData.numero, 8)}
                    {emittedInvoiceData.cae ? ` — CAE: ${emittedInvoiceData.cae}` : ""}
                  </p>
                )}
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-blue-800 dark:text-blue-300">{(groupId || groupPaymentGroupId) ? "Vinculando al folio del grupo…" : "Vinculando al registro de pago…"}</p>
                <p className="text-blue-700 dark:text-blue-400 text-xs mt-0.5">Por favor espere. No cierre este diálogo.</p>
              </div>
            </div>
          </div>
        ) : linkError && emittedInvoiceData ? (
          <div className="space-y-4 py-2">
            {/* Success: invoice was emitted */}
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-green-800 dark:text-green-300">Factura emitida correctamente</p>
                <p className="text-green-700 dark:text-green-400 text-xs mt-0.5">
                  {emittedInvoiceData.tipo_comprobante} {padNum(emittedInvoiceData.punto_venta, 4)}-{padNum(emittedInvoiceData.numero, 8)}
                  {emittedInvoiceData.cae ? ` — CAE: ${emittedInvoiceData.cae}` : ""}
                </p>
              </div>
            </div>

            {/* Error: link to payment failed */}
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm flex-1">
                <p className="font-semibold text-red-800 dark:text-red-300">{(groupId || groupPaymentGroupId) ? "No se pudo vincular la factura al folio del grupo" : "No se pudo vincular la factura al pago"}</p>
                <p className="text-red-700 dark:text-red-400 text-xs mt-1">
                  {(groupId || groupPaymentGroupId)
                    ? "La factura fue generada correctamente en ARCA, pero ocurrió un error al registrarla en el folio del grupo. Puede reintentar ahora."
                    : "La factura fue generada correctamente en ARCA, pero ocurrió un error al asociarla al registro de pago. Puede reintentar ahora o cerrar y vincularlo manualmente desde el panel de pagos."}
                </p>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => { onClose(); resetForm(); }}
                data-testid="btn-cerrar-sin-vincular"
              >
                Cerrar sin vincular
              </Button>
              <Button
                onClick={handleRetryLink}
                disabled={linkRetrying}
                data-testid="btn-reintentar-vinculo"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${linkRetrying ? "animate-spin" : ""}`} />
                {linkRetrying ? "Reintentando..." : "Reintentar vínculo"}
              </Button>
            </DialogFooter>
          </div>
        ) : showConfirm ? (
          <div className="space-y-4">
            {groupInvoiceSources && groupInvoiceSources.length > 0 && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-800 dark:bg-violet-950/20">
                <p className="mb-2 text-sm font-semibold text-violet-900 dark:text-violet-200">Disponibilidad fiscal del grupo</p>
                <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
                  {groupInvoiceSources.map((source) => (
                    <div key={source.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3">
                      <span className="truncate" title={`${source.destination} — ${source.concept}`}>{source.destination} · {source.concept}</span>
                      <span>Elegible ${fPeso(source.eligible)}</span>
                      <span>Fact. ${fPeso(source.invoiced)}</span>
                      <span className={source.available > 0 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>Disp. ${fPeso(source.available)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {groupPaymentDestinations && groupPaymentDestinations.length > 0 && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-800 dark:bg-sky-950/20">
                <p className="mb-2 text-sm font-semibold text-sky-900 dark:text-sky-200">Cobros grupales</p>
                <div className="space-y-1 text-xs">
                  {groupPaymentDestinations.map((destination) => (
                    <div key={destination.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3">
                      <span>{destination.destination}</span>
                      <span>Elegible ${fPeso(destination.eligible)}</span>
                      <span>Fact. ${fPeso(destination.invoiced)}</span>
                      <span className={destination.available > 0 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>Disp. ${fPeso(destination.available)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-sm">Vista previa del comprobante</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Tipo:</span>
                <span className="font-medium text-sm">{TIPO_LABELS[tipo]?.nombre ?? tipo}</span>
                {isNonFiscal && <span className="text-xs text-amber-600">(sin CAE)</span>}
                {!isNonFiscal && <span className="text-xs text-green-700 dark:text-green-400">(fiscal ARCA)</span>}
              </div>
              <Separator />
              <div>
                <div className="font-semibold text-sm">{razonSocial}</div>
                {cuit && <div className="text-xs text-muted-foreground">CUIT: {cuit}</div>}
                {!cuit && dni && <div className="text-xs text-muted-foreground">DNI: {dni}</div>}
                <div className="text-xs text-muted-foreground">{condicionIva}</div>
                {domicilio && <div className="text-xs text-muted-foreground">{domicilio}</div>}
              </div>
              <Separator />
              <div className="space-y-1">
                {items.map((it, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{it.descripcion}{it.cantidad > 1 ? ` ×${it.cantidad}` : ""}</span>
                    <span className="font-medium">${fPeso(it.subtotal)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              {isFC ? (
                <div className="text-xs text-muted-foreground">Factura C — no discrimina IVA</div>
              ) : (
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Neto:</span><span>${fPeso(preview.neto)}</span></div>
                  {preview.iva21 > 0 && <div className="flex justify-between"><span>IVA 21%:</span><span>${fPeso(preview.iva21)}</span></div>}
                  {preview.iva105 > 0 && <div className="flex justify-between"><span>IVA 10.5%:</span><span>${fPeso(preview.iva105)}</span></div>}
                  {preview.exento > 0 && <div className="flex justify-between"><span>Exento:</span><span>${fPeso(preview.exento)}</span></div>}
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1">
                <span>TOTAL:</span><span>${fPeso(totalPreview)}</span>
              </div>
              {(cashArea || showPaymentMethod) && (
                <div className="text-xs text-muted-foreground pt-1 border-t">
                  Forma de pago: {cashFormaPago === "efectivo" ? "Efectivo" : cashFormaPago === "tarjeta_credito" ? "Tarjeta Crédito" : cashFormaPago === "tarjeta_debito" ? "Tarjeta Débito" : cashFormaPago === "transferencia" ? "Transferencia" : cashFormaPago === "mercadopago" ? "MercadoPago" : cashFormaPago === "cuenta_corriente" ? "Cuenta Corriente" : cashFormaPago}
                </div>
              )}
            </div>
            {!isNonFiscal && ambiente === "ficticio" && (
              <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />Modo ficticio — CAE simulado (no válido fiscalmente)
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirm(false)}>← Editar</Button>
              <Button
                onClick={() => {
                  if (!duplicateAmountAcknowledged) {
                    const warnings = computeGroupDuplicateWarnings();
                    if (warnings.length > 0) {
                      setDuplicateAmountWarnings(warnings);
                      setShowDuplicateAmountConfirm(true);
                      return;
                    }
                  }
                  handleConfirmEmit(recipientHasChanges());
                }}
                disabled={mutation.isPending}
                data-testid="btn-confirmar-emitir"
              >
                {mutation.isPending ? "Emitiendo..." : "Confirmar y emitir PDF"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
        <>

        <div className="space-y-1">
          <Label>Tipo de comprobante</Label>
          <Select value={tipo} onValueChange={v => {
            const prevTipo = tipo; setTipo(v);
            const cIva = (v === "FA" || v === "FM") ? "Responsable Inscripto" : (v === "FC" || v === "FT") ? "Consumidor Final" : "Consumidor Final";
            setCondicionIva(cIva); recalcForTipo(v, prevTipo);
          }}>
            <SelectTrigger data-testid="select-tipo-factura"><SelectValue /></SelectTrigger>
            <SelectContent>
              {tipos.includes("FA") && <SelectItem value="FA">Factura A</SelectItem>}
              {tipos.includes("FB") && <SelectItem value="FB">Factura B</SelectItem>}
              {tipos.includes("FT") && <SelectItem value="FT">Factura T</SelectItem>}
              {tipos.includes("FM") && <SelectItem value="FM">Factura MiPyme A</SelectItem>}
              {tipos.filter(t => NON_FISCAL_TIPOS_SET.has(t)).map(t => (
                <SelectItem key={t} value={t}>{NON_FISCAL_LABELS[t] ?? t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isNonFiscal && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3" />
              Comprobante interno — no es una factura fiscal (sin CAE)
            </p>
          )}
          {!isNonFiscal && ambiente === "ficticio" && (
            <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3" />
              Modo ficticio — se generará un CAE simulado (no válido fiscalmente)
            </p>
          )}
          {!isNonFiscal && ambiente === "homologacion" && (
            <p className="text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1 mt-1">
              <FlaskConical className="w-3 h-3" />
              Homologación — CAE real de ARCA pero sin efecto fiscal (ambiente de pruebas)
            </p>
          )}
          {faNeedsCuit && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Factura A requiere <strong>CUIT</strong>. Buscá la empresa o agencia en el buscador de abajo para autocompletar, o ingresá el CUIT manualmente.</span>
            </div>
          )}
        </div>

        {(cashArea || showPaymentMethod) && (
          <div className="space-y-1">
            <Label>Forma de pago</Label>
            <Select value={cashFormaPago} onValueChange={v => { setCashFormaPago(v); if (v !== "cuenta_corriente") setCcEntityId(""); }}>
              <SelectTrigger data-testid="select-cash-forma-pago"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="tarjeta_debito">Tarjeta Débito</SelectItem>
                <SelectItem value="tarjeta_credito">Tarjeta Crédito</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="mercadopago">MercadoPago</SelectItem>
                <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
              </SelectContent>
            </Select>
            {cashArea && cashFormaPago === "cuenta_corriente" && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Select value={ccEntityType} onValueChange={v => { setCcEntityType(v as "company" | "agency"); setCcEntityId(""); }}>
                  <SelectTrigger data-testid="select-cc-entity-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Empresa</SelectItem>
                    <SelectItem value="agency">Agencia</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={ccEntityId} onValueChange={setCcEntityId}>
                  <SelectTrigger data-testid="select-cc-entity-id"><SelectValue placeholder={ccEntityType === "company" ? "Seleccionar empresa..." : "Seleccionar agencia..."} /></SelectTrigger>
                  <SelectContent>
                    {(ccEntityType === "company" ? companies : agencies).map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.razonSocial || e.nombreFantasia || e.name || e.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {posConfigsData.filter((p: any) => p.activo && p.tipo === "electronico").length > 0 && (
          <div className="space-y-1">
            <Label>Punto de Venta (ARCA)</Label>
            <Select value={puntoVentaNum} onValueChange={setPuntoVentaNum}>
              <SelectTrigger data-testid="select-punto-venta"><SelectValue placeholder="PV por defecto (configuración)" /></SelectTrigger>
              <SelectContent>
                {posConfigsData.filter((p: any) => p.activo && p.tipo === "electronico").map((p: any) => (
                  <SelectItem key={p.id} value={String(p.numero)}>
                    PV {String(p.numero).padStart(4, "0")} — {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Si no se selecciona, se usa el PV configurado en Facturación.</p>
          </div>
        )}

        <Separator />

        <div className="space-y-3">
          <Label className="text-sm font-semibold">Datos del receptor</Label>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Search className="w-3 h-3" /> Buscar empresa/agencia para autocompletar</Label>
            <div className="relative">
              <Input
                value={entitySearch}
                onChange={e => { setEntitySearch(e.target.value); setShowEntityDropdown(true); }}
                onFocus={() => setShowEntityDropdown(true)}
                onBlur={() => setTimeout(() => setShowEntityDropdown(false), 200)}
                placeholder="Nombre o CUIT de empresa/agencia..."
                className="text-sm"
                data-testid="input-entity-search"
              />
              {showEntityDropdown && entityResults.length > 0 && (
                <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {entityResults.map((e: any) => (
                    <button
                      key={e.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted cursor-pointer flex items-center justify-between"
                      onMouseDown={() => selectEntity(e)}
                    >
                      <span>
                        <span className="font-medium">{e.razonSocial || e.nombreFantasia}</span>
                        <span className="text-muted-foreground text-xs ml-2">{e._type}</span>
                      </span>
                      {e.cuilCuit && <span className="text-muted-foreground text-xs">{e.cuilCuit}</span>}
                    </button>
                  ))}
                </div>
              )}
              {showEntityDropdown && entitySearch.length >= 2 && entityResults.length === 0 && (
                <div className="absolute z-50 w-full bg-popover border rounded-md shadow-sm mt-1 px-3 py-2 text-sm text-muted-foreground">
                  Sin resultados
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">{isFA ? "Razón Social *" : "Nombre / Razón Social *"}</Label>
              {recipientProfile?.type === "guest" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Input value={guestLastName} onChange={e => { const value = e.target.value; setGuestLastName(value); setRazonSocial(`${value} ${guestFirstName}`.trim()); }} placeholder="Apellido" data-testid="input-guest-last-name" />
                  <Input value={guestFirstName} onChange={e => { const value = e.target.value; setGuestFirstName(value); setRazonSocial(`${guestLastName} ${value}`.trim()); }} placeholder="Nombre" data-testid="input-guest-first-name" />
                </div>
              ) : (
                <Input value={razonSocial} onChange={e => { setRazonSocial(e.target.value); if (fieldErrors.razonSocial) setFieldErrors(p => ({ ...p, razonSocial: "" })); }} placeholder="EMPRESA S.A." data-testid="input-razon-social" className={fieldErrors.razonSocial ? "border-red-500" : ""} />
              )}
              {fieldErrors.razonSocial && <p className="text-xs text-red-500">{fieldErrors.razonSocial}</p>}
            </div>
            {isFA ? (
              <div className="space-y-1">
                <Label className="text-xs">CUIT *</Label>
                <Input value={cuit} onChange={e => { const d = e.target.value.replace(/\D/g, "").slice(0, 11); const f = d.length <= 2 ? d : d.length <= 10 ? `${d.slice(0,2)}-${d.slice(2)}` : `${d.slice(0,2)}-${d.slice(2,10)}-${d[10]}`; setCuit(f); if (fieldErrors.cuit) setFieldErrors(p => ({ ...p, cuit: "" })); }} placeholder="XX-XXXXXXXX-X" data-testid="input-cuit" className={fieldErrors.cuit ? "border-red-500" : ""} />
                {fieldErrors.cuit && <p className="text-xs text-red-500">{fieldErrors.cuit}</p>}
                {initialValues?.documentType && dni && <p className="text-[11px] text-muted-foreground">{initialValues.documentType}: {dni}</p>}
              </div>
            ) : (
              <div className="space-y-1"><Label className="text-xs">{initialValues?.documentType || "DNI"} (opcional)</Label><Input value={dni} onChange={e => setDni(e.target.value)} placeholder="00000000" data-testid="input-dni" /></div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Condición IVA</Label>
              {lockCondicionIva ? (
                <div className="h-9 flex items-center px-3 border rounded-md bg-muted/30 text-sm text-muted-foreground">{condicionIva}</div>
              ) : (
                <Select value={condicionIva} onValueChange={v => { setCondicionIva(v); if (fieldErrors.condicionIva) setFieldErrors(p => ({ ...p, condicionIva: "" })); }}>
                  <SelectTrigger className={fieldErrors.condicionIva ? "border-red-500" : ""}><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDICION_IVA_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              )}
              {fieldErrors.condicionIva && <p className="text-xs text-red-500">{fieldErrors.condicionIva}</p>}
            </div>
            <div className="col-span-2 space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Domicilio (opcional)</Label>
                {selectedEntityInfo && domicilio.trim() && domicilio.trim() !== originalDomicilioRef.current.trim() && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    Se actualizará en la ficha al emitir
                  </span>
                )}
              </div>
              <Input value={domicilio} onChange={e => setDomicilio(e.target.value)} placeholder="Calle 123, Ciudad" data-testid="input-domicilio" />
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Ítems</Label>
             {!hideAddItems && !lockItems && <Button variant="outline" size="sm" onClick={() => setItems(p => [...p, newItem()])} data-testid="btn-add-item"><Plus className="w-3.5 h-3.5 mr-1" /> Agregar ítem</Button>}
          </div>
          <div className="text-xs text-muted-foreground">{isFA ? "Ingrese precios sin IVA (neto)" : isFC ? "Factura C: no discrimina IVA. Ingrese el precio final (el neto es igual al total)." : "Ingrese precios con IVA incluido"}</div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2" data-testid={`item-row-${idx}`}>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6 space-y-1">
                    <Label className="text-xs">Descripción *</Label>
                     <Input disabled={lockItems} value={item.descripcion} onChange={e => { updateItem(idx, "descripcion", e.target.value); if (fieldErrors[`desc_${idx}`]) setFieldErrors(p => ({ ...p, [`desc_${idx}`]: "" })); }} placeholder="Hospedaje habitación..." className={fieldErrors[`desc_${idx}`] ? "border-red-500" : ""} />
                    {fieldErrors[`desc_${idx}`] && <p className="text-xs text-red-500">{fieldErrors[`desc_${idx}`]}</p>}
                  </div>
                   <div className="col-span-2 space-y-1"><Label className="text-xs">Cant.</Label><Input disabled={lockItems} type="number" min="1" value={item.cantidad} onChange={e => updateItem(idx, "cantidad", parseFloat(e.target.value) || 1)} /></div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">P. Unit.</Label>
                     <Input disabled={lockItems} type="number" step="0.01" value={item.precioUnitario || ""} onChange={e => { updateItem(idx, "precioUnitario", parseFloat(e.target.value) || 0); if (fieldErrors[`precio_${idx}`]) setFieldErrors(p => ({ ...p, [`precio_${idx}`]: "" })); }} placeholder="0.00" className={fieldErrors[`precio_${idx}`] ? "border-red-500" : ""} />
                    {fieldErrors[`precio_${idx}`] && <p className="text-xs text-red-500">{fieldErrors[`precio_${idx}`]}</p>}
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Alíc. IVA</Label>
                    {isFC ? (
                      <div className="h-9 flex items-center text-xs text-muted-foreground border rounded-md px-2 bg-muted/30">Sin IVA</div>
                    ) : (
                       <Select disabled={lockItems} value={item.alicuotaIva} onValueChange={v => updateItem(idx, "alicuotaIva", v)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="21">21%</SelectItem>
                          <SelectItem value="10.5">10.5%</SelectItem>
                          <SelectItem value="exento">Exento</SelectItem>
                          <SelectItem value="no_gravado">No Grav.</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {isFA
                      ? `Neto: $${fPeso(item.subtotalNeto)} + IVA ${item.alicuotaIva === "21" ? "21%" : item.alicuotaIva === "10.5" ? "10.5%" : ""} = Total: $${fPeso(item.subtotal)}`
                      : isFC
                      ? `Total (sin IVA): $${fPeso(item.subtotal)}`
                      : `Total con IVA: $${fPeso(item.subtotal)} (neto: $${fPeso(item.subtotalNeto)})`}
                  </span>
                   {!lockItems && items.length > 1 && <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 h-6 text-xs" onClick={() => removeItem(idx)}>Quitar</Button>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
          {isFC ? (
            <div className="text-muted-foreground text-xs">Factura C — no discrimina IVA</div>
          ) : (
            <>
              <div className="flex justify-between text-muted-foreground text-xs"><span>Importe Neto:</span><span>${fPeso(preview.neto)}</span></div>
              {preview.iva21 > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>IVA 21%:</span><span>${fPeso(preview.iva21)}</span></div>}
              {preview.iva105 > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>IVA 10.5%:</span><span>${fPeso(preview.iva105)}</span></div>}
              {preview.exento > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>Exento:</span><span>${fPeso(preview.exento)}</span></div>}
            </>
          )}
          <div className="flex justify-between font-bold"><span>TOTAL:</span><span>${fPeso(totalPreview)}</span></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || faNeedsCuit} data-testid="btn-emitir-confirmar">
            {skipReview ? "Emitir comprobante" : "Revisar →"}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={showCloseWarning} onOpenChange={o => { if (!o) setShowCloseWarning(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            ¿Cerrar sin emitir comprobante?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          El huésped ya realizó el check-out. Se recomienda emitir un comprobante fiscal (Factura A, B o C) o interno antes de cerrar.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setShowCloseWarning(false)}>
            Volver a facturar
          </Button>
          <Button variant="destructive" onClick={() => { setShowCloseWarning(false); onClose(); resetForm(); }}>
            Cerrar sin comprobante
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={showRecipientChangeWarning} onOpenChange={o => { if (!o) setShowRecipientChangeWarning(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Guardar cambios fiscales en la ficha</DialogTitle>
          <DialogDescription>
            Los datos del receptor cambiaron. Si continuás, se emitirán en el comprobante y también se guardarán en su ficha para futuras facturas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowRecipientChangeWarning(false)}>Seguir editando</Button>
          <Button onClick={() => { setShowRecipientChangeWarning(false); continueAfterValidation(true); }}>
            Guardar y emitir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={showEntityChangeWarning} onOpenChange={o => { if (!o) setShowEntityChangeWarning(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>¿Cambiar el receptor asociado?</DialogTitle>
          <DialogDescription>
            La reserva ya tiene una empresa o agencia asociada. Confirmá el cambio antes de usar otro receptor en este comprobante.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setPendingEntity(null); setShowEntityChangeWarning(false); }}>Cancelar</Button>
          <Button onClick={() => { if (pendingEntity) applyEntity(pendingEntity); setPendingEntity(null); setShowEntityChangeWarning(false); }}>
            Cambiar receptor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={showDuplicateAmountConfirm} onOpenChange={setShowDuplicateAmountConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Importe igual o muy cercano a uno ya facturado</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-foreground">
              {duplicateAmountWarnings.map((w, i) => <p key={i}>{w}</p>)}
              <p className="text-muted-foreground">Verificá que no se trate del mismo concepto ya facturado antes de continuar.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setShowDuplicateAmountConfirm(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setDuplicateAmountAcknowledged(true);
              setShowDuplicateAmountConfirm(false);
              handleConfirmEmit(recipientHasChanges());
            }}
            data-testid="btn-confirmar-importe-duplicado"
          >
            Sí, es correcto — continuar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ─── Nota de Crédito Dialog ────────────────────────────────────────────────────

type AdminNcChargeRow = {
  sourceId: string;
  description: string;
  originalAmount: number;
  availableAmount: number;
  amount: string;
  selected: boolean;
};

function parseAdminNcJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

export function NotaCreditoDialog({ invoiceId, onClose, onSuccess }: { invoiceId: number; onClose: () => void; onSuccess?: (ncData: any) => void }) {
  const { toast } = useToast();
  const { data: invoice } = useQuery<any>({
    queryKey: ["/api/billing/invoices", invoiceId],
    queryFn: () => fetch(`/api/billing/invoices/${invoiceId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!invoiceId,
  });
  const [motivo, setMotivo] = useState("");
  const [modoParcial, setModoParcial] = useState(false);
  const [montoParcial, setMontoParcial] = useState("");
  const [ncItems, setNcItems] = useState<AdminNcChargeRow[]>([]);
  const [mappingWarning, setMappingWarning] = useState<string | null>(null);

  const isReservationInvoice = Boolean(invoice?.reserva_id);
  const isSourceMappedInvoice = isReservationInvoice || Boolean(invoice?.group_id && invoice?.source_charge_amounts);

  useEffect(() => {
    if (!invoice || !isSourceMappedInvoice) {
      setNcItems([]);
      setMappingWarning(null);
      return;
    }

    const rawItems = parseAdminNcJson(invoice.items);
    const sourceIdsValue = parseAdminNcJson(invoice.source_charge_ids);
    const sourceAmountsValue = parseAdminNcJson(invoice.source_charge_amounts);
    const creditMapsValue = parseAdminNcJson(invoice.credit_source_charge_amounts);
    const sourceIds = Array.isArray(sourceIdsValue) ? sourceIdsValue.map(String) : [];
    const sourceAmounts = sourceAmountsValue && typeof sourceAmountsValue === "object" && !Array.isArray(sourceAmountsValue)
      ? sourceAmountsValue as Record<string, unknown>
      : null;
    const creditMaps = Array.isArray(creditMapsValue) ? creditMapsValue : [];
    const montoAcreditado = parseFloat(String(invoice.monto_acreditado || "0")) || 0;

    if (!Array.isArray(rawItems) || !sourceAmounts || sourceIds.length === 0) {
      setNcItems([]);
      setMappingWarning("Esta factura no tiene un detalle seguro por concepto. Revisá el vínculo original antes de emitir la NC.");
      return;
    }

    const originalAmountsBySource: Record<string, number> = {};
    for (const [sourceId, rawAmount] of Object.entries(sourceAmounts)) {
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setNcItems([]);
        setMappingWarning("Esta factura tiene un importe histórico inválido por cargo. Revisá el Folio antes de emitir una corrección.");
        return;
      }
      originalAmountsBySource[sourceId] = amount;
    }

    const creditedBySource: Record<string, number> = {};
    for (const creditMap of creditMaps) {
      if (!creditMap || typeof creditMap !== "object" || Array.isArray(creditMap)) {
        setNcItems([]);
        setMappingWarning("Esta factura tiene una NC anterior sin detalle por cargo. Revisá el Folio antes de emitir una nueva corrección.");
        return;
      }
      for (const [sourceId, amount] of Object.entries(creditMap as Record<string, unknown>)) {
        const creditAmount = Number(amount);
        if (!Object.prototype.hasOwnProperty.call(originalAmountsBySource, sourceId) ||
          !Number.isFinite(creditAmount) ||
          creditAmount <= 0 ||
          (creditedBySource[sourceId] || 0) + creditAmount > originalAmountsBySource[sourceId] + 0.01) {
          setNcItems([]);
          setMappingWarning("Esta factura tiene una NC anterior con cargos o importes inconsistentes. Revisá el Folio antes de emitir una nueva corrección.");
          return;
        }
        creditedBySource[sourceId] = (creditedBySource[sourceId] || 0) + creditAmount;
      }
    }
    const totalMappedCredits = Object.values(creditedBySource).reduce((sum, amount) => sum + amount, 0);
    if (Math.abs(totalMappedCredits - montoAcreditado) > 0.01) {
      setNcItems([]);
      setMappingWarning("El detalle por cargo de las NC anteriores no coincide con el total acreditado. Revisá el Folio antes de continuar.");
      return;
    }

    const rows: AdminNcChargeRow[] = [];
    for (const [sourceId, rawAmount] of Object.entries(sourceAmounts)) {
      const originalAmount = originalAmountsBySource[sourceId];
      const itemIndex = sourceIds.indexOf(sourceId);
      const item = itemIndex >= 0 ? rawItems[itemIndex] as any : null;
      const credited = creditedBySource[sourceId] || 0;
      const availableAmount = Math.max(0, originalAmount - credited);

      if (originalAmount <= 0 || !item) {
        setNcItems([]);
        setMappingWarning("No se pudo conservar el concepto fiscal original de uno de los cargos. Revisá el Folio antes de emitir la NC.");
        return;
      }
      if (availableAmount <= 0.009) continue;
      rows.push({
        sourceId,
        description: item.descripcion || `Cargo ${sourceId}`,
        originalAmount,
        availableAmount,
        amount: availableAmount.toFixed(2),
        selected: false,
      });
    }

    setNcItems(rows);
    setMappingWarning(rows.length > 0
      ? null
      : "La factura de reserva ya no tiene cargos disponibles para acreditar.");
  }, [invoice, isSourceMappedInvoice]);

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/billing/invoices/${invoiceId}/nota-credito`, body),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      // Group invoices claim fiscal availability from the group; refresh every
      // group-scoped view so facturado/disponible reflects the NC immediately,
      // regardless of which screen opened this dialog.
      if (invoice?.group_id) {
        queryClient.invalidateQueries({ queryKey: ["/api/groups", invoice.group_id, "invoice-snapshot"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", invoice.group_id, "folio"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", invoice.group_id, "master-folio"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups", invoice.group_id, "direct-invoices"] });
      }
      toast({ title: "Nota de Crédito emitida", description: `${data.tipo_comprobante} N° ${padNum(data.punto_venta, 4)}-${padNum(data.numero, 8)}` });
      onSuccess?.(data);
      onClose();
      setTimeout(() => window.open(`/api/billing/invoices/${data.id}/pdf`, "_blank"), 200);
    },
    onError: (e: any) => toast({ title: "Error", description: parseApiError(e), variant: "destructive" }),
  });

  if (!invoice) return null;

  // A partial NC leaves the original invoice in estado=parcial, so it is
  // intentionally possible to open this dialog again for the remaining balance.
  if (invoice.estado === "anulada") {
    return (
      <Dialog open={!!invoiceId} onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nota de Crédito</DialogTitle></DialogHeader>
          <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-300 text-sm text-amber-800 dark:text-amber-200">
            Ya existe una NC en curso para este comprobante. No es posible emitir una segunda nota de crédito.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const tipoNC: Record<string, string> = { FA: "Nota de Crédito A", FT: "Nota de Crédito T", FM: "Nota de Crédito MiPyme A" };
  const tipoNCLabel = tipoNC[invoice.tipo_comprobante] ?? "Nota de Crédito B";
  const totalOriginal = parseFloat(invoice.monto_total) || 0;
  const saldoPendiente = Math.max(0, totalOriginal - (parseFloat(invoice.monto_acreditado || "0") || 0));
  const totalNcByCharge = ncItems
    .filter(item => item.selected)
    .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const montoNC = isSourceMappedInvoice
    ? totalNcByCharge
    : modoParcial ? parseFloat(montoParcial) || 0 : saldoPendiente;
  const montoInvalido = isSourceMappedInvoice
    ? Boolean(mappingWarning) ||
      montoNC <= 0 ||
      montoNC > saldoPendiente + 0.01 ||
      ncItems.some(item => item.selected && ((parseFloat(item.amount) || 0) <= 0 || (parseFloat(item.amount) || 0) > item.availableAmount + 0.01))
    : modoParcial && (!montoParcial || montoNC <= 0 || montoNC > saldoPendiente + 0.01);

  function handleSubmit() {
    if (montoInvalido) return;
    if (!motivo.trim()) {
      toast({ title: "Ingresá un motivo para la Nota de Crédito", variant: "destructive" });
      return;
    }
    mutation.mutate({
      motivo: motivo.trim(),
      ...(isSourceMappedInvoice
        ? {
            items: ncItems
              .filter(item => item.selected && (parseFloat(item.amount) || 0) > 0)
              .map(item => ({ sourceId: item.sourceId, amount: parseFloat(item.amount) })),
          }
        : { monto: modoParcial ? montoNC : undefined }),
    });
  }

  return (
    <Dialog open={!!invoiceId} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90dvh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4"><DialogTitle>Emitir {tipoNCLabel}</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
            <div className="font-medium">Factura original:</div>
            <div className="text-muted-foreground text-xs">{invoice.tipo_comprobante} {padNum(invoice.punto_venta, 4)}-{padNum(invoice.numero, 8)} — {invoice.cliente_razon_social}</div>
            <div className="text-muted-foreground text-xs">Total: ${fPeso(invoice.monto_total)} · Saldo pendiente: ${fPeso(saldoPendiente)}</div>
            {isReservationInvoice && <div className="text-xs text-muted-foreground">Reserva #{invoice.reserva_id}</div>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="rounded border bg-muted/20 p-2">
              <div className="text-muted-foreground">Receptor heredado</div>
              <div className="font-medium truncate">{invoice.cliente_razon_social || "—"}</div>
              <div className="text-muted-foreground">{invoice.cliente_cuit || invoice.cliente_dni || invoice.cliente_condicion_iva || "—"}</div>
            </div>
            <div className="rounded border bg-muted/20 p-2">
              <div className="text-muted-foreground">Punto de venta</div>
              <div className="font-medium">{padNum(invoice.punto_venta, 4)}</div>
              <div className="text-muted-foreground">Heredado y bloqueado</div>
            </div>
            <div className="rounded border bg-muted/20 p-2">
              <div className="text-muted-foreground">Forma de pago</div>
              <div className="font-medium">{invoice.cash_forma_pago || "No informada"}</div>
              <div className="text-muted-foreground">Heredada y bloqueada</div>
            </div>
          </div>
          {isSourceMappedInvoice ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conceptos a acreditar *</Label>
                <span className="text-xs text-muted-foreground">Seleccioná el cargo exacto; podés ajustar el importe.</span>
              </div>
              {mappingWarning ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-2">
                  <p>{mappingWarning}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/reservations?view=${invoice.reserva_id}`, "_blank", "noopener,noreferrer")}
                    data-testid="btn-nc-open-folio"
                  >
                    Abrir reserva y revisar Folio
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                  {ncItems.map(item => (
                    <div key={item.sourceId} className="flex items-center gap-2 p-2.5">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => setNcItems(prev => prev.map(row => row.sourceId === item.sourceId ? { ...row, selected: !row.selected } : row))}
                        data-testid={`checkbox-nc-cargo-${item.sourceId}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{item.description}</div>
                        <div className="text-[11px] text-muted-foreground">Disponible: ${fPeso(item.availableAmount)}</div>
                      </div>
                      <Input
                        className="w-28 h-8 text-right"
                        type="number"
                        min="0"
                        max={item.availableAmount}
                        step="0.01"
                        value={item.amount}
                        disabled={!item.selected}
                        onChange={e => setNcItems(prev => prev.map(row => row.sourceId === item.sourceId ? { ...row, amount: e.target.value } : row))}
                        data-testid={`input-nc-cargo-${item.sourceId}`}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-sm font-medium">
                <span>Total seleccionado</span>
                <span>${fPeso(montoNC)}</span>
              </div>
              {montoInvalido && !mappingWarning && <p className="text-xs text-red-600">Seleccioná al menos un cargo e ingresá importes válidos dentro del saldo disponible.</p>}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="nc-parcial" checked={modoParcial} onChange={e => { setModoParcial(e.target.checked); if (!e.target.checked) setMontoParcial(""); }} data-testid="checkbox-nc-parcial" />
                <Label htmlFor="nc-parcial" className="cursor-pointer">Nota de crédito parcial</Label>
              </div>
              {modoParcial ? (
                <div className="space-y-1">
                  <Label className="text-xs">Monto a acreditar *</Label>
                  <Input type="number" min="0" max={saldoPendiente} step="0.01" value={montoParcial} onChange={e => setMontoParcial(e.target.value)} placeholder="0.00" data-testid="input-monto-parcial" />
                  {montoInvalido && <p className="text-xs text-red-600">Ingrese un monto válido entre $0 y ${fPeso(saldoPendiente)}</p>}
                </div>
              ) : null}
            </>
          )}
          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 rounded-lg p-3 text-sm text-yellow-800 dark:text-yellow-200">
            {isSourceMappedInvoice
              ? `Se emitirá una ${tipoNC} por $${fPeso(montoNC)} con el concepto seleccionado. Receptor, punto de venta y forma de pago se heredan de la factura original.`
              : modoParcial
                ? `Se emitirá una ${tipoNC} parcial por $${fPeso(montoNC)}. La factura original permanece vigente (no se anula).`
                : `Se emitirá una ${tipoNC} por el mismo importe que anula la factura original. La factura original quedará marcada como anulada.`}
          </div>
          <div className="space-y-1"><Label>Motivo *</Label><Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Error en facturación, devolución de servicio..." rows={2} /></div>
        </div>
        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || montoInvalido} className="bg-orange-600 hover:bg-orange-700" data-testid="btn-nc-confirmar">
            {mutation.isPending ? "Emitiendo NC..." : `Emitir ${tipoNC}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Logo Upload Panel ────────────────────────────────────────────────────────

function LogoUploadPanel() {
  const { toast } = useToast();
  const { data: config, refetch } = useQuery<any>({ queryKey: ["/api/billing/config"] });
  const logoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const hasCustomLogo = !!config?.logoUrl;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Archivo inválido", description: "Seleccioná una imagen PNG o JPG.", variant: "destructive" });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast({ title: "Imagen demasiado grande", description: "El máximo es 3 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      const imageData = await new Promise<string>((res, rej) => {
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const resp = await apiRequest("POST", "/api/billing/config/logo", { imageData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Error al subir logo");
      }
      await refetch();
      toast({ title: "Logo actualizado", description: "Aparecerá en las próximas facturas." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (logoRef.current) logoRef.current.value = "";
    }
  }

  async function handleDelete() {
    setUploading(true);
    try {
      await apiRequest("DELETE", "/api/billing/config/logo", undefined);
      await refetch();
      toast({ title: "Logo eliminado", description: "Se usará el logo del hotel por defecto." });
    } catch {
      toast({ title: "Error al eliminar logo", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30">
      {/* Preview */}
      <div className="w-28 h-14 flex items-center justify-center rounded border bg-white overflow-hidden shrink-0">
        {hasCustomLogo
          ? <img src={config.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
          : <span className="text-[10px] text-muted-foreground text-center px-1">Logo del hotel (predeterminado)</span>
        }
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => logoRef.current?.click()}>
          {uploading ? "Subiendo…" : hasCustomLogo ? "Cambiar logo" : "Subir logo"}
        </Button>
        {hasCustomLogo && (
          <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={handleDelete}
            className="text-destructive hover:text-destructive text-xs h-7">
            Usar logo predeterminado
          </Button>
        )}
        <p className="text-[10px] text-muted-foreground">PNG, JPG o WebP · máx. 3 MB</p>
      </div>
    </div>
  );
}

// ─── Billing Config Panel ─────────────────────────────────────────────────────

function BillingConfigPanel({ config }: { config: any }) {
  const { toast } = useToast();
  const certRef = useRef<HTMLInputElement>(null);
  const keyRef  = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    razonSocial: "", cuit: "", iibb: "", telefono: "", logoUrl: "", domicilioComercial: "", localidad: "",
    provincia: "", cp: "", condicionIva: "Responsable Inscripto",
    inicioActividades: "", puntoVenta: 1, puntoVentaHomolog: 99,
    arcaAmbiente: "ficticio" as AmbienteMode, arcaCuit: "",
    arcaCert: "", arcaKey: "",
  });

  const [testResult, setTestResult] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (config) setForm({
      razonSocial: config.razonSocial ?? "MARAN S.A.",
      cuit: config.cuit ?? "33-68110008-9",
      iibb: config.iibb ?? "",
      telefono: config.telefono ?? "",
      logoUrl: config.logoUrl ?? "",
      domicilioComercial: config.domicilioComercial ?? "",
      localidad: config.localidad ?? "",
      provincia: config.provincia ?? "",
      cp: config.cp ?? "",
      condicionIva: config.condicionIva ?? "Responsable Inscripto",
      inicioActividades: config.inicioActividades ?? "",
      puntoVenta: config.puntoVenta ?? 1,
      puntoVentaHomolog: config.puntoVentaHomolog ?? 99,
      arcaAmbiente: config.arcaAmbiente ?? "ficticio",
      arcaCuit: config.arcaCuit ?? "",
      arcaCert: "",
      arcaKey: "",
    });
  }, [config]);

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", "/api/billing/config", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/config"] });
      toast({ title: "Configuración guardada" });
    },
    onError: (e: any) => toast({ title: "Error", description: parseApiError(e), variant: "destructive" }),
  });

  function readFile(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target?.result as string);
      r.onerror = rej;
      r.readAsText(file);
    });
  }

  async function handleCertFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await readFile(file);
    setForm(p => ({ ...p, arcaCert: content }));
    toast({ title: "Certificado cargado", description: file.name });
  }

  async function handleKeyFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await readFile(file);
    setForm(p => ({ ...p, arcaKey: content }));
    toast({ title: "Clave privada cargada", description: file.name });
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch("/api/billing/test-arca", { credentials: "include" });
      const data = await resp.json();
      if (data.ok) {
        const pv = data.proximoFB != null ? ` | Próximo FB: #${data.proximoFB}` : "";
        const tipos = data.tiposComprobante?.length ? ` | ${data.tiposComprobante.length} tipos habilitados` : "";
        setTestResult({ ok: true, mensaje: `ARCA OK — WSAA ✓ · WSFE ✓${tipos}${pv}` });
      } else {
        setTestResult({ ok: false, mensaje: data.error ?? "Error de conexión con ARCA" });
      }
    } catch (e: any) {
      setTestResult({ ok: false, mensaje: parseApiError(e) });
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    const body: any = { ...form };
    if (!body.arcaCert) delete body.arcaCert;
    if (!body.arcaKey) delete body.arcaKey;
    mutation.mutate(body);
  }

  const f = (field: keyof typeof form) => (e: any) => setForm(p => ({ ...p, [field]: e.target.value }));
  const needsArca = form.arcaAmbiente !== "ficticio";

  return (
    <div className="max-w-2xl space-y-6">

      {/* Emisor */}
      <Card>
        <CardHeader><CardTitle className="text-base">Datos del emisor</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Razón Social</Label><Input value={form.razonSocial} onChange={f("razonSocial")} data-testid="cfg-razon-social" /></div>
            <div className="space-y-1"><Label className="text-xs">CUIT</Label><Input value={form.cuit} onChange={f("cuit")} placeholder="XX-XXXXXXXX-X" /></div>
            <div className="space-y-1"><Label className="text-xs">Ingresos Brutos (IIBB)</Label><Input value={form.iibb} onChange={f("iibb")} placeholder="Igual al CUIT si no corresponde" /></div>
            <div className="space-y-1"><Label className="text-xs">Teléfono</Label><Input value={form.telefono} onChange={f("telefono")} placeholder="343-XXXXXXX" /></div>
            <div className="col-span-2 space-y-2">
              <Label className="text-xs">Logo en la factura</Label>
              <LogoUploadPanel />
            </div>
            <div className="col-span-2 space-y-1"><Label className="text-xs">Domicilio Comercial</Label><Input value={form.domicilioComercial} onChange={f("domicilioComercial")} /></div>
            <div className="space-y-1"><Label className="text-xs">Localidad</Label><Input value={form.localidad} onChange={f("localidad")} /></div>
            <div className="space-y-1"><Label className="text-xs">Provincia</Label><Input value={form.provincia} onChange={f("provincia")} /></div>
            <div className="space-y-1"><Label className="text-xs">CP</Label><Input value={form.cp} onChange={f("cp")} /></div>
            <div className="space-y-1"><Label className="text-xs">Inicio Actividades</Label><Input value={form.inicioActividades} onChange={f("inicioActividades")} placeholder="DD/MM/YYYY" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Punto de Venta (producción)</Label>
              <Input type="number" min="1" value={form.puntoVenta} onChange={e => setForm(p => ({ ...p, puntoVenta: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modo de operación */}
      <Card>
        <CardHeader><CardTitle className="text-base">Modo de operación ARCA</CardTitle></CardHeader>
        <CardContent className="space-y-4">

          {/* Mode selector */}
          <div className="grid grid-cols-1 gap-2">

            {/* Ficticio */}
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, arcaAmbiente: "ficticio" }))}
              className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${form.arcaAmbiente === "ficticio" ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}
              data-testid="modo-ficticio"
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.arcaAmbiente === "ficticio" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
              <div>
                <div className="font-medium text-sm flex items-center gap-2">
                  Modo Ficticio
                  {form.arcaAmbiente === "ficticio" && <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-400">Activo</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Sin conexión a ARCA. Genera CAE simulado — los PDFs son idénticos pero no son válidos fiscalmente.</div>
              </div>
            </button>

            {/* Homologación */}
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, arcaAmbiente: "homologacion" }))}
              className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${form.arcaAmbiente === "homologacion" ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : "hover:bg-muted/30"}`}
              data-testid="modo-homologacion"
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.arcaAmbiente === "homologacion" ? "border-blue-500 bg-blue-500" : "border-muted-foreground"}`} />
              <div>
                <div className="font-medium text-sm flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-blue-600" />
                  Homologación (pruebas ARCA)
                  {form.arcaAmbiente === "homologacion" && <Badge variant="outline" className="text-xs text-blue-700 border-blue-400">Activo</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Se conecta a los servidores de prueba de ARCA. Obtiene CAE real pero sin efecto fiscal — no interfiere con el sistema tributario real.</div>
              </div>
            </button>

            {/* Producción */}
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, arcaAmbiente: "produccion" }))}
              className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${form.arcaAmbiente === "produccion" ? "border-red-500 bg-red-50/50 dark:bg-red-950/20" : "hover:bg-muted/30"}`}
              data-testid="modo-produccion"
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.arcaAmbiente === "produccion" ? "border-red-500 bg-red-500" : "border-muted-foreground"}`} />
              <div>
                <div className="font-medium text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  Producción ARCA
                  {form.arcaAmbiente === "produccion" && <Badge variant="outline" className="text-xs text-red-700 border-red-400">Activo</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Servidores reales de ARCA. Los comprobantes son válidos fiscalmente. Activar solo cuando todo esté validado.</div>
              </div>
            </button>
          </div>

          {/* ARCA credentials (shown for homolog + producción) */}
          {needsArca && (
            <div className="space-y-4 border rounded-lg p-4 bg-muted/10">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                <ShieldCheck className="w-4 h-4" />
                Credenciales ARCA
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">CUIT del representante autorizado</Label>
                  <Input value={form.arcaCuit} onChange={f("arcaCuit")} placeholder="XX-XXXXXXXX-X" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Punto de Venta (homologación)</Label>
                  <Input
                    type="number" min="1"
                    value={form.puntoVentaHomolog}
                    onChange={e => setForm(p => ({ ...p, puntoVentaHomolog: parseInt(e.target.value) || 99 }))}
                    disabled={form.arcaAmbiente === "produccion"}
                    title={form.arcaAmbiente === "produccion" ? "En producción se usa el Punto de Venta principal" : "PV separado para pruebas — evita mezclar numeración"}
                  />
                  {form.arcaAmbiente === "homologacion" && (
                    <p className="text-xs text-muted-foreground">PV exclusivo para pruebas. Evita mezclar numeración con el PV de producción.</p>
                  )}
                </div>
              </div>

              {/* Certificate upload */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Certificado X.509 (.crt / .pem)</Label>
                  <div className="flex gap-2 items-center">
                    <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={() => certRef.current?.click()}>
                      <Upload className="w-3.5 h-3.5 mr-1" /> Cargar .crt
                    </Button>
                    {(form.arcaCert || config?.hasArcaCert) && (
                      <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{form.arcaCert ? "Nuevo cargado" : "Guardado"}</span>
                    )}
                  </div>
                  <input ref={certRef} type="file" accept=".crt,.pem,.cer" className="hidden" onChange={handleCertFile} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Clave privada (.key / .pem)</Label>
                  <div className="flex gap-2 items-center">
                    <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={() => keyRef.current?.click()}>
                      <Upload className="w-3.5 h-3.5 mr-1" /> Cargar .key
                    </Button>
                    {(form.arcaKey || config?.hasArcaKey) && (
                      <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{form.arcaKey ? "Nueva cargada" : "Guardada"}</span>
                    )}
                  </div>
                  <input ref={keyRef} type="file" accept=".key,.pem" className="hidden" onChange={handleKeyFile} />
                </div>
              </div>

              {/* Test connection */}
              <div className="pt-1 flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing || (!config?.hasArcaCert && !form.arcaCert)}
                  data-testid="btn-test-connection"
                >
                  <Wifi className="w-3.5 h-3.5 mr-1" />
                  {testing ? "Probando conexión..." : "Probar conexión con ARCA"}
                </Button>
                {testResult && (
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${testResult.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                    {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {testResult.mensaje}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={mutation.isPending} data-testid="btn-guardar-billing-config">
        {mutation.isPending ? "Guardando..." : "Guardar configuración"}
      </Button>

      <DeleteNonFiscalSection />
    </div>
  );
}

function DeleteNonFiscalSection() {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lastResult, setLastResult] = useState<{ deleted: number } | null>(null);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await apiRequest("DELETE", `/api/billing/invoices/non-fiscal?startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      setLastResult(data);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      toast({
        title: data.deleted === 0 ? "Sin comprobantes para borrar" : `${data.deleted} comprobante(s) eliminado(s)`,
        description: data.deleted > 0 ? `Período: ${startDate} → ${endDate}` : undefined,
      });
    } catch (e: any) {
      toast({ title: "Error al borrar", description: parseApiError(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  const canDelete = !!startDate && !!endDate && startDate <= endDate;

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" />
            Borrar comprobantes no fiscales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Elimina permanentemente todos los <strong>Tickets, Vouchers y Cierres</strong> (comprobantes no fiscales)
            emitidos en el rango de fechas indicado. Esta acción no puede deshacerse.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="del-start">Desde</Label>
              <Input id="del-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="del-end">Hasta</Label>
              <Input id="del-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          {lastResult && (
            <p className="text-xs text-muted-foreground">
              Último borrado: <strong>{lastResult.deleted}</strong> comprobante(s) eliminado(s).
            </p>
          )}
          <Button
            variant="destructive"
            disabled={!canDelete}
            onClick={() => setConfirmOpen(true)}
            data-testid="btn-delete-non-fiscal"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Borrar comprobantes del período
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar eliminación
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Se eliminarán <strong>todos los comprobantes no fiscales</strong> (Tickets, Vouchers, Cierres) emitidos
            entre el <strong>{startDate}</strong> y el <strong>{endDate}</strong>.
          </p>
          <p className="text-sm text-destructive font-medium">Esta acción es irreversible.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} data-testid="btn-confirm-delete-non-fiscal">
              {deleting ? "Borrando..." : "Sí, borrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
