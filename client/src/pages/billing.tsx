import { useState, useEffect, useRef, useMemo } from "react";
import { PrefacturaDialog } from "@/components/PrefacturaDialog";
import { fmtMoney } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { format } from "date-fns";
import {
  FileText, Plus, Download, Settings, Search, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  FlaskConical, ShieldCheck, ShieldAlert, Upload, Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const today = () => format(new Date(), "yyyy-MM-dd");

function fPeso(n: number | string | undefined | null) {
  const num = parseFloat(String(n ?? 0)) || 0;
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
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
  const [activeTab, setActiveTab] = useState("facturas");
  const [showResPicker, setShowResPicker] = useState(false);
  const [resPickerSearch, setResPickerSearch] = useState("");
  const [prefacturaResId, setPrefacturaResId] = useState<number | null>(null);

  const { data: allReservations = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations", "picker-all"],
    queryFn: () => fetch("/api/reservations?dateMode=all", { credentials: "include" }).then(r => r.json()),
    enabled: showResPicker,
  });

  const pickerReservations = useMemo(() => {
    const src = (allReservations as any[]).filter(r =>
      ["confirmed", "checked_in", "checked_out"].includes(r.status)
    );
    if (!resPickerSearch.trim()) return src.slice(0, 10);
    const q = resPickerSearch.toLowerCase().trim();
    return src.filter(r => {
      const name = `${r.guest?.firstName || ""} ${r.guest?.lastName || ""}`.toLowerCase();
      return name.includes(q) || String(r.id).includes(q) ||
        String(r.room?.number || r.roomNumber || "").includes(q);
    }).slice(0, 15);
  }, [allReservations, resPickerSearch]);
  const [showNC, setShowNC] = useState<number | null>(null);
  const [filtroDesde, setFiltroDesde] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
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
                              <td className="px-3 py-2 text-right font-semibold">${fPeso(f.monto_total)}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-mono">{f.cae ? f.cae.substring(0, 8) + "..." : "—"}</span>
                                  {f.modo_ficticio && <Badge variant="outline" className="text-xs px-1 text-yellow-600 border-yellow-400">Ficticio</Badge>}
                                </div>
                                <div className="text-xs text-muted-foreground">Vto: {fDate(f.cae_fecha_vto)}</div>
                              </td>
                              <td className="px-3 py-2">
                                {f.estado === "emitida" ? (
                                  <Badge variant="outline" className="text-xs text-green-700 border-green-400 bg-green-50 dark:bg-green-950/20"><CheckCircle2 className="w-3 h-3 mr-1" />Emitida</Badge>
                                ) : (
                                  <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1" />Anulada</Badge>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-1 justify-end">
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(`/api/billing/invoices/${f.id}/pdf`, "_blank")} title="Descargar PDF" data-testid={`btn-pdf-${f.id}`}>
                                    <Download className="w-3.5 h-3.5" />
                                  </Button>
                                  {f.estado === "emitida" && !f.tipo_comprobante?.startsWith("NC") && !f.tipo_comprobante?.startsWith("ND") && (
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700" onClick={() => setShowNC(f.id)} title="Emitir Nota de Crédito" data-testid={`btn-nc-${f.id}`}>
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
              {pickerReservations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Sin reservas encontradas</p>
              )}
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
          onClose={() => setPrefacturaResId(null)}
          reservationId={prefacturaResId}
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
  condicionIva?: string;
  domicilio?: string;
  items?: Array<{ descripcion: string; precioUnitario: number }>;
};

export function EmitirFacturaDialog({ open, onClose, config, initialValues, onSuccess, allowedTipos, cashArea, requiresEmission, paymentId }: {
  open: boolean;
  onClose: () => void;
  config: any;
  initialValues?: EmitirFacturaInitialValues;
  onSuccess?: (invoiceData?: any) => void;
  allowedTipos?: Array<string>;
  cashArea?: string;
  requiresEmission?: boolean;
  paymentId?: string;
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
  const [condicionIva, setCondicionIva] = useState("Consumidor Final");
  const [domicilio, setDomicilio] = useState("");
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [puntoVentaNum, setPuntoVentaNum] = useState("");
  const [entitySearch, setEntitySearch] = useState("");
  const [showEntityDropdown, setShowEntityDropdown] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [emitted, setEmitted] = useState(false);
  const [linkPending, setLinkPending] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [linkRetrying, setLinkRetrying] = useState(false);
  const [emittedInvoiceData, setEmittedInvoiceData] = useState<any>(null);
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
      if (initialValues.domicilio !== undefined) setDomicilio(initialValues.domicilio);
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
    }
    if (!open) resetForm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValues]);

  function selectEntity(entity: any) {
    const rs = entity.razonSocial || entity.nombreFantasia || "";
    const cuitVal = entity.cuilCuit || "";
    const condVal = entity.condicionIva || (cuitVal ? "Responsable Inscripto" : "Consumidor Final");
    const domVal = entity.domicilio || entity.direccion || "";
    setRazonSocial(rs);
    setCuit(cuitVal);
    setCondicionIva(condVal);
    if (domVal) setDomicilio(domVal);
    if (cuitVal) {
      const auto = (condVal === "Responsable Inscripto" || condVal === "Exento") ? "FA" : "FB";
      const nextTipo = tipos.includes(auto) ? auto : tipos.includes("FB") ? "FB" : tipos[0];
      setTipo(nextTipo);
      recalcForTipo(nextTipo, tipo);
    }
    setEntitySearch("");
    setShowEntityDropdown(false);
    setFieldErrors({});
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

  const preview = items.reduce((acc, it) => {
    if (it.alicuotaIva === "21") { acc.neto += it.subtotalNeto; acc.iva21 += it.subtotalNeto * 0.21; }
    else if (it.alicuotaIva === "10.5") { acc.neto += it.subtotalNeto; acc.iva105 += it.subtotalNeto * 0.105; }
    else if (it.alicuotaIva === "exento") acc.exento += it.subtotalNeto;
    else if (it.alicuotaIva === "no_gravado") acc.ng += it.subtotalNeto;
    return acc;
  }, { neto: 0, iva21: 0, iva105: 0, exento: 0, ng: 0 });
  const totalPreview = preview.neto + preview.iva21 + preview.iva105 + preview.exento + preview.ng;

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

      // Automatically link the emitted invoice to the payment if paymentId was provided
      if (paymentId) {
        setEmittedInvoiceData(data);
        setLinkPending(true);
        try {
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
      } else {
        onSuccess?.(data);
        onClose(); resetForm();
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setTipo("FB"); setRazonSocial(""); setCuit(""); setDni("");
    setCondicionIva("Consumidor Final"); setDomicilio(""); setItems([newItem()]);
    setPuntoVentaNum(""); setCashFormaPago("efectivo"); setCcEntityType("company"); setCcEntityId("");
    setEntitySearch(""); setShowEntityDropdown(false); setFieldErrors({});
    setShowConfirm(false); setShowCloseWarning(false); setEmitted(false);
    setLinkPending(false); setLinkError(false); setLinkRetrying(false); setEmittedInvoiceData(null);
  }

  const isFA = tipo === "FA" || tipo === "FM";
  const isFC = tipo === "FC" || tipo === "FT";
  const isNonFiscal = NON_FISCAL_TIPOS_SET.has(tipo);
  const ambiente: AmbienteMode = config?.arcaAmbiente ?? "ficticio";

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
    if (!paymentId || !emittedInvoiceData) return;
    setLinkRetrying(true);
    try {
      const linkRes = await apiRequest("PATCH", `/api/payments/${paymentId}/invoice`, { invoiceData: emittedInvoiceData });
      if (linkRes.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
        toast({ title: "Vínculo exitoso", description: "La factura quedó vinculada al pago." });
        onSuccess?.(emittedInvoiceData);
        onClose(); resetForm();
      } else {
        toast({ title: "Reintento fallido", description: "No se pudo vincular la factura. Intente nuevamente.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Reintento fallido", description: "Error de red. Intente nuevamente.", variant: "destructive" });
    } finally {
      setLinkRetrying(false);
    }
  }

  function handleSubmit() {
    const errs = validateForm();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setShowConfirm(true);
  }

  function handleConfirmEmit() {
    setShowConfirm(false);
    mutation.mutate({
      tipoComprobante: tipo,
      cliente: { razonSocial, cuit: cuit || undefined, dni: dni || undefined, condicionIva, domicilio: domicilio || undefined },
      items,
      puntoVenta: puntoVentaNum ? parseInt(puntoVentaNum) : undefined,
      ...(cashArea
        ? {
            cashArea,
            cashFormaPago,
            cashLabel: `${TIPO_LABELS[tipo]?.nombre ?? tipo} — ${razonSocial}`,
            ...(cashFormaPago === "cuenta_corriente" ? { ccEntityType, ccEntityId } : {}),
          }
        : {}),
    });
  }

  return (
    <>
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{linkPending ? "Vinculando factura al pago…" : linkError ? "Factura emitida — vínculo pendiente" : showConfirm ? "Revisar y confirmar" : "Emitir comprobante"}</DialogTitle></DialogHeader>

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
                <p className="font-semibold text-blue-800 dark:text-blue-300">Vinculando al registro de pago…</p>
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
                <p className="font-semibold text-red-800 dark:text-red-300">No se pudo vincular la factura al pago</p>
                <p className="text-red-700 dark:text-red-400 text-xs mt-1">
                  La factura fue generada correctamente en ARCA, pero ocurrió un error al asociarla al registro de pago.
                  Puede reintentar ahora o cerrar y vincularlo manualmente desde el panel de pagos.
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
              {cashArea && (
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
              <Button onClick={handleConfirmEmit} disabled={mutation.isPending} data-testid="btn-confirmar-emitir">
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
        </div>

        {cashArea && (
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
            {cashFormaPago === "cuenta_corriente" && (
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
              <Input value={razonSocial} onChange={e => { setRazonSocial(e.target.value); if (fieldErrors.razonSocial) setFieldErrors(p => ({ ...p, razonSocial: "" })); }} placeholder="EMPRESA S.A." data-testid="input-razon-social" className={fieldErrors.razonSocial ? "border-red-500" : ""} />
              {fieldErrors.razonSocial && <p className="text-xs text-red-500">{fieldErrors.razonSocial}</p>}
            </div>
            {isFA ? (
              <div className="space-y-1">
                <Label className="text-xs">CUIT *</Label>
                <Input value={cuit} onChange={e => { setCuit(e.target.value.replace(/-/g, "")); if (fieldErrors.cuit) setFieldErrors(p => ({ ...p, cuit: "" })); }} placeholder="20-12345678-9" data-testid="input-cuit" className={fieldErrors.cuit ? "border-red-500" : ""} />
                {fieldErrors.cuit && <p className="text-xs text-red-500">{fieldErrors.cuit}</p>}
              </div>
            ) : (
              <div className="space-y-1"><Label className="text-xs">DNI (opcional)</Label><Input value={dni} onChange={e => setDni(e.target.value)} placeholder="00000000" data-testid="input-dni" /></div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Condición IVA</Label>
              <Select value={condicionIva} onValueChange={v => { setCondicionIva(v); if (fieldErrors.condicionIva) setFieldErrors(p => ({ ...p, condicionIva: "" })); }}>
                <SelectTrigger className={fieldErrors.condicionIva ? "border-red-500" : ""}><SelectValue /></SelectTrigger>
                <SelectContent>{CONDICION_IVA_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              {fieldErrors.condicionIva && <p className="text-xs text-red-500">{fieldErrors.condicionIva}</p>}
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Domicilio (opcional)</Label>
              <Input value={domicilio} onChange={e => setDomicilio(e.target.value)} placeholder="Calle 123, Ciudad" data-testid="input-domicilio" />
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Ítems</Label>
            <Button variant="outline" size="sm" onClick={() => setItems(p => [...p, newItem()])} data-testid="btn-add-item"><Plus className="w-3.5 h-3.5 mr-1" /> Agregar ítem</Button>
          </div>
          <div className="text-xs text-muted-foreground">{isFA ? "Ingrese precios sin IVA (neto)" : isFC ? "Factura C: no discrimina IVA. Ingrese el precio final (el neto es igual al total)." : "Ingrese precios con IVA incluido"}</div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2" data-testid={`item-row-${idx}`}>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6 space-y-1">
                    <Label className="text-xs">Descripción *</Label>
                    <Input value={item.descripcion} onChange={e => { updateItem(idx, "descripcion", e.target.value); if (fieldErrors[`desc_${idx}`]) setFieldErrors(p => ({ ...p, [`desc_${idx}`]: "" })); }} placeholder="Hospedaje habitación..." className={fieldErrors[`desc_${idx}`] ? "border-red-500" : ""} />
                    {fieldErrors[`desc_${idx}`] && <p className="text-xs text-red-500">{fieldErrors[`desc_${idx}`]}</p>}
                  </div>
                  <div className="col-span-2 space-y-1"><Label className="text-xs">Cant.</Label><Input type="number" min="1" value={item.cantidad} onChange={e => updateItem(idx, "cantidad", parseFloat(e.target.value) || 1)} /></div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">P. Unit.</Label>
                    <Input type="number" step="0.01" value={item.precioUnitario || ""} onChange={e => { updateItem(idx, "precioUnitario", parseFloat(e.target.value) || 0); if (fieldErrors[`precio_${idx}`]) setFieldErrors(p => ({ ...p, [`precio_${idx}`]: "" })); }} placeholder="0.00" className={fieldErrors[`precio_${idx}`] ? "border-red-500" : ""} />
                    {fieldErrors[`precio_${idx}`] && <p className="text-xs text-red-500">{fieldErrors[`precio_${idx}`]}</p>}
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Alíc. IVA</Label>
                    {isFC ? (
                      <div className="h-9 flex items-center text-xs text-muted-foreground border rounded-md px-2 bg-muted/30">Sin IVA</div>
                    ) : (
                      <Select value={item.alicuotaIva} onValueChange={v => updateItem(idx, "alicuotaIva", v)}>
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
                  {items.length > 1 && <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 h-6 text-xs" onClick={() => removeItem(idx)}>Quitar</Button>}
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
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="btn-emitir-confirmar">
            Revisar →
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
    </>
  );
}

// ─── Nota de Crédito Dialog ────────────────────────────────────────────────────

export function NotaCreditoDialog({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data: invoice } = useQuery<any>({
    queryKey: ["/api/billing/invoices", invoiceId],
    queryFn: () => fetch(`/api/billing/invoices/${invoiceId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!invoiceId,
  });
  const [motivo, setMotivo] = useState("");
  const [modoParcial, setModoParcial] = useState(false);
  const [montoParcial, setMontoParcial] = useState("");

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/billing/invoices/${invoiceId}/nota-credito`, body),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      toast({ title: "Nota de Crédito emitida", description: `${data.tipo_comprobante} N° ${padNum(data.punto_venta, 4)}-${padNum(data.numero, 8)}` });
      onClose();
      setTimeout(() => window.open(`/api/billing/invoices/${data.id}/pdf`, "_blank"), 200);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!invoice) return null;
  const tipoNC: Record<string, string> = { FA: "Nota de Crédito A", FT: "Nota de Crédito T", FM: "Nota de Crédito MiPyme A" };
  const tipoNCLabel = tipoNC[invoice.tipo_comprobante] ?? "Nota de Crédito B";
  const totalOriginal = parseFloat(invoice.monto_total) || 0;
  const montoNC = modoParcial ? parseFloat(montoParcial) || 0 : totalOriginal;
  const montoInvalido = modoParcial && (!montoParcial || montoNC <= 0 || montoNC > totalOriginal);

  function handleSubmit() {
    if (montoInvalido) return;
    mutation.mutate({ motivo, monto: modoParcial ? montoNC : undefined });
  }

  return (
    <Dialog open={!!invoiceId} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Emitir {tipoNCLabel}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
            <div className="font-medium">Factura original:</div>
            <div className="text-muted-foreground text-xs">{invoice.tipo_comprobante} {padNum(invoice.punto_venta, 4)}-{padNum(invoice.numero, 8)} — {invoice.cliente_razon_social}</div>
            <div className="text-muted-foreground text-xs">Total: ${fPeso(invoice.monto_total)}</div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="nc-parcial" checked={modoParcial} onChange={e => { setModoParcial(e.target.checked); if (!e.target.checked) setMontoParcial(""); }} data-testid="checkbox-nc-parcial" />
            <Label htmlFor="nc-parcial" className="cursor-pointer">Nota de crédito parcial</Label>
          </div>
          {modoParcial ? (
            <div className="space-y-1">
              <Label className="text-xs">Monto a acreditar *</Label>
              <Input type="number" min="0" max={totalOriginal} step="0.01" value={montoParcial} onChange={e => setMontoParcial(e.target.value)} placeholder="0.00" data-testid="input-monto-parcial" />
              {montoInvalido && <p className="text-xs text-red-600">Ingrese un monto válido entre $0 y ${fPeso(totalOriginal)}</p>}
            </div>
          ) : null}
          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 rounded-lg p-3 text-sm text-yellow-800 dark:text-yellow-200">
            {modoParcial
              ? `Se emitirá una ${tipoNC} parcial por $${fPeso(montoNC)}. La factura original permanece vigente (no se anula).`
              : `Se emitirá una ${tipoNC} por el mismo importe que anula la factura original. La factura original quedará marcada como anulada.`}
          </div>
          <div className="space-y-1"><Label>Motivo (opcional)</Label><Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Error en facturación, devolución de servicio..." rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || montoInvalido} className="bg-orange-600 hover:bg-orange-700" data-testid="btn-nc-confirmar">
            {mutation.isPending ? "Emitiendo NC..." : `Emitir ${tipoNC}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Billing Config Panel ─────────────────────────────────────────────────────

function BillingConfigPanel({ config }: { config: any }) {
  const { toast } = useToast();
  const certRef = useRef<HTMLInputElement>(null);
  const keyRef  = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    razonSocial: "", cuit: "", domicilioComercial: "", localidad: "",
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
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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
      setTestResult({ ok: false, mensaje: e.message });
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
    </div>
  );
}
