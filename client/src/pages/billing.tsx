import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

const TIPO_LABELS: Record<string, { nombre: string; color: string }> = {
  FA:  { nombre: "Factura A",    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  FB:  { nombre: "Factura B",    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  FC:  { nombre: "Factura C",    color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
  NCA: { nombre: "Nota Créd. A", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  NCB: { nombre: "Nota Créd. B", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
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
  const [showEmitir, setShowEmitir] = useState(false);
  const [showNC, setShowNC] = useState<number | null>(null);
  const [filtroDesde, setFiltroDesde] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [filtroHasta, setFiltroHasta] = useState(today());
  const [filtroTipo, setFiltroTipo] = useState("");

  const qp = new URLSearchParams({ desde: filtroDesde, hasta: filtroHasta, ...(filtroTipo ? { tipo: filtroTipo } : {}) }).toString();

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
            <Button onClick={() => setShowEmitir(true)} data-testid="btn-emitir-factura">
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
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Tipo..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  <SelectItem value="FA">Factura A</SelectItem>
                  <SelectItem value="FB">Factura B</SelectItem>
                  <SelectItem value="FC">Factura C</SelectItem>
                  <SelectItem value="NCA">NC A</SelectItem>
                  <SelectItem value="NCB">NC B</SelectItem>
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
                                  {f.estado === "emitida" && !f.tipo_comprobante?.startsWith("NC") && (
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

      <EmitirFacturaDialog open={showEmitir} onClose={() => setShowEmitir(false)} config={config} />
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
  items?: Array<{ descripcion: string; precioUnitario: number }>;
};

export function EmitirFacturaDialog({ open, onClose, config, initialValues }: {
  open: boolean;
  onClose: () => void;
  config: any;
  initialValues?: EmitirFacturaInitialValues;
}) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState<string>("FB");
  const [razonSocial, setRazonSocial] = useState("");
  const [cuit, setCuit] = useState("");
  const [dni, setDni] = useState("");
  const [condicionIva, setCondicionIva] = useState("Consumidor Final");
  const [domicilio, setDomicilio] = useState("");
  const [items, setItems] = useState<Item[]>([newItem()]);

  useEffect(() => {
    if (open && initialValues) {
      if (initialValues.razonSocial !== undefined) setRazonSocial(initialValues.razonSocial);
      if (initialValues.cuit !== undefined) { setCuit(initialValues.cuit); if (initialValues.cuit) setTipo("FA"); }
      if (initialValues.dni !== undefined) setDni(initialValues.dni);
      if (initialValues.condicionIva !== undefined) setCondicionIva(initialValues.condicionIva);
      if (initialValues.items && initialValues.items.length > 0) {
        setItems(initialValues.items.map(it => {
          const base = it.precioUnitario;
          const neto = parseFloat((base / 1.21).toFixed(2));
          return { descripcion: it.descripcion, cantidad: 1, precioUnitario: base, alicuotaIva: "21" as const, subtotalNeto: neto, subtotal: base };
        }));
      }
    }
    if (!open) resetForm();
  }, [open]);

  function newItem(): Item {
    return { descripcion: "", cantidad: 1, precioUnitario: 0, alicuotaIva: "21", subtotalNeto: 0, subtotal: 0 };
  }

  function updateItem(idx: number, field: keyof Item, value: any) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx], [field]: value };
      const base = item.cantidad * item.precioUnitario;
      const fa = tipo === "FA";
      if (!fa) {
        if (item.alicuotaIva === "21") { item.subtotalNeto = parseFloat((base / 1.21).toFixed(2)); item.subtotal = base; }
        else if (item.alicuotaIva === "10.5") { item.subtotalNeto = parseFloat((base / 1.105).toFixed(2)); item.subtotal = base; }
        else { item.subtotalNeto = base; item.subtotal = base; }
      } else {
        if (item.alicuotaIva === "21" || item.alicuotaIva === "10.5") {
          item.subtotalNeto = base; item.subtotal = base * (1 + (item.alicuotaIva === "21" ? 0.21 : 0.105));
        } else { item.subtotalNeto = base; item.subtotal = base; }
      }
      updated[idx] = item;
      return updated;
    });
  }

  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  const preview = items.reduce((acc, it) => {
    acc.neto += it.subtotalNeto;
    if (it.alicuotaIva === "21") acc.iva21 += it.subtotalNeto * 0.21;
    if (it.alicuotaIva === "10.5") acc.iva105 += it.subtotalNeto * 0.105;
    if (it.alicuotaIva === "exento") acc.exento += it.subtotalNeto;
    if (it.alicuotaIva === "no_gravado") acc.ng += it.subtotalNeto;
    return acc;
  }, { neto: 0, iva21: 0, iva105: 0, exento: 0, ng: 0 });
  const totalPreview = preview.neto + preview.iva21 + preview.iva105 + preview.exento + preview.ng;

  const mutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/billing/invoices", body),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      toast({ title: "Factura emitida", description: `${data.tipo_comprobante} ${padNum(data.punto_venta, 4)}-${padNum(data.numero, 8)} — CAE: ${data.cae}` });
      onClose(); resetForm();
      setTimeout(() => window.open(`/api/billing/invoices/${data.id}/pdf`, "_blank"), 200);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setTipo("FB"); setRazonSocial(""); setCuit(""); setDni("");
    setCondicionIva("Consumidor Final"); setDomicilio(""); setItems([newItem()]);
  }

  const isFA = tipo === "FA";
  const ambiente: AmbienteMode = config?.arcaAmbiente ?? "ficticio";

  function handleSubmit() {
    if (!razonSocial.trim()) return toast({ title: "Ingrese Razón Social / Nombre", variant: "destructive" });
    if (isFA && !cuit.trim()) return toast({ title: "CUIT es requerido para Factura A", variant: "destructive" });
    if (items.some(it => !it.descripcion.trim())) return toast({ title: "Todos los ítems deben tener descripción", variant: "destructive" });
    mutation.mutate({ tipoComprobante: tipo, cliente: { razonSocial, cuit: cuit || undefined, dni: dni || undefined, condicionIva, domicilio: domicilio || undefined }, items });
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { onClose(); resetForm(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Emitir comprobante</DialogTitle></DialogHeader>

        <div className="space-y-1">
          <Label>Tipo de comprobante</Label>
          <Select value={tipo} onValueChange={v => { setTipo(v); setCondicionIva(v === "FA" ? "Responsable Inscripto" : "Consumidor Final"); }}>
            <SelectTrigger data-testid="select-tipo-factura"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FA">Factura A — Responsable Inscripto</SelectItem>
              <SelectItem value="FB">Factura B — Consumidor Final / Persona Física</SelectItem>
              <SelectItem value="FC">Factura C — Monotributista</SelectItem>
            </SelectContent>
          </Select>
          {ambiente === "ficticio" && (
            <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3" />
              Modo ficticio — se generará un CAE simulado (no válido fiscalmente)
            </p>
          )}
          {ambiente === "homologacion" && (
            <p className="text-xs text-blue-700 dark:text-blue-400 flex items-center gap-1 mt-1">
              <FlaskConical className="w-3 h-3" />
              Homologación — CAE real de ARCA pero sin efecto fiscal (ambiente de pruebas)
            </p>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <Label className="text-sm font-semibold">Datos del receptor</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">{isFA ? "Razón Social *" : "Nombre / Razón Social *"}</Label>
              <Input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="EMPRESA S.A." data-testid="input-razon-social" />
            </div>
            {isFA ? (
              <div className="space-y-1"><Label className="text-xs">CUIT *</Label><Input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="XX-XXXXXXXX-X" data-testid="input-cuit" /></div>
            ) : (
              <div className="space-y-1"><Label className="text-xs">DNI (opcional)</Label><Input value={dni} onChange={e => setDni(e.target.value)} placeholder="00000000" data-testid="input-dni" /></div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Condición IVA</Label>
              <Select value={condicionIva} onValueChange={setCondicionIva}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONDICION_IVA_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
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
          <div className="text-xs text-muted-foreground">{isFA ? "Ingrese precios sin IVA (neto)" : "Ingrese precios con IVA incluido"}</div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2" data-testid={`item-row-${idx}`}>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6 space-y-1"><Label className="text-xs">Descripción *</Label><Input value={item.descripcion} onChange={e => updateItem(idx, "descripcion", e.target.value)} placeholder="Hospedaje habitación..." /></div>
                  <div className="col-span-2 space-y-1"><Label className="text-xs">Cant.</Label><Input type="number" min="1" value={item.cantidad} onChange={e => updateItem(idx, "cantidad", parseFloat(e.target.value) || 1)} /></div>
                  <div className="col-span-2 space-y-1"><Label className="text-xs">P. Unit.</Label><Input type="number" min="0" step="0.01" value={item.precioUnitario || ""} onChange={e => updateItem(idx, "precioUnitario", parseFloat(e.target.value) || 0)} placeholder="0.00" /></div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Alíc. IVA</Label>
                    <Select value={item.alicuotaIva} onValueChange={v => updateItem(idx, "alicuotaIva", v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="21">21%</SelectItem>
                        <SelectItem value="10.5">10.5%</SelectItem>
                        <SelectItem value="exento">Exento</SelectItem>
                        <SelectItem value="no_gravado">No Grav.</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {isFA
                      ? `Neto: $${fPeso(item.subtotalNeto)} + IVA ${item.alicuotaIva === "21" ? "21%" : item.alicuotaIva === "10.5" ? "10.5%" : ""} = Total: $${fPeso(item.subtotal)}`
                      : `Total con IVA: $${fPeso(item.subtotal)} (neto: $${fPeso(item.subtotalNeto)})`}
                  </span>
                  {items.length > 1 && <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 h-6 text-xs" onClick={() => removeItem(idx)}>Quitar</Button>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between text-muted-foreground text-xs"><span>Importe Neto:</span><span>${fPeso(preview.neto)}</span></div>
          {preview.iva21 > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>IVA 21%:</span><span>${fPeso(preview.iva21)}</span></div>}
          {preview.iva105 > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>IVA 10.5%:</span><span>${fPeso(preview.iva105)}</span></div>}
          {preview.exento > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>Exento:</span><span>${fPeso(preview.exento)}</span></div>}
          <div className="flex justify-between font-bold"><span>TOTAL:</span><span>${fPeso(totalPreview)}</span></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); resetForm(); }}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending} data-testid="btn-emitir-confirmar">
            {mutation.isPending ? "Emitiendo..." : "Emitir y descargar PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Nota de Crédito Dialog ────────────────────────────────────────────────────

function NotaCreditoDialog({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data: invoice } = useQuery<any>({
    queryKey: ["/api/billing/invoices", invoiceId],
    queryFn: () => fetch(`/api/billing/invoices/${invoiceId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!invoiceId,
  });
  const [motivo, setMotivo] = useState("");

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
  const tipoNC = invoice.tipo_comprobante === "FA" ? "Nota de Crédito A" : "Nota de Crédito B";

  return (
    <Dialog open={!!invoiceId} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Emitir {tipoNC}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
            <div className="font-medium">Factura original:</div>
            <div className="text-muted-foreground text-xs">{invoice.tipo_comprobante} {padNum(invoice.punto_venta, 4)}-{padNum(invoice.numero, 8)} — {invoice.cliente_razon_social}</div>
            <div className="text-muted-foreground text-xs">Total: ${fPeso(invoice.monto_total)}</div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 rounded-lg p-3 text-sm text-yellow-800 dark:text-yellow-200">
            Se emitirá una {tipoNC} por el mismo importe que anula la factura original. La factura original quedará marcada como anulada.
          </div>
          <div className="space-y-1"><Label>Motivo (opcional)</Label><Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Error en facturación, devolución de servicio..." rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate({ motivo })} disabled={mutation.isPending} className="bg-orange-600 hover:bg-orange-700" data-testid="btn-nc-confirmar">
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
      const resp = await fetch("/api/billing/test-connection", { method: "POST", credentials: "include" });
      const data = await resp.json();
      setTestResult({ ok: data.ok, mensaje: data.mensaje ?? data.error ?? "Error desconocido" });
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
