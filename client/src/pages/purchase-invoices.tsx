import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Plus, Trash2, Search, ArrowLeft, Building2,
  CreditCard, Landmark, Receipt, ChevronRight, CheckCircle2, Clock, FileDown,
} from "lucide-react";
import { Link } from "wouter";
import { getLocalToday } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Invoice {
  id: number;
  tipoComprobante: string;
  supplierNombre?: string;
  proveedorNombre?: string;
  proveedorCuit?: string;
  puntoVenta?: number;
  numeroComprobante: string;
  numeroComprobanteExt?: string;
  fechaEmision: string;
  periodo?: string;
  condicionPago: string;
  montoNeto: string;
  montoIva21: string;
  montoIva105: string;
  montoIva27: string;
  percepcionIibb?: string;
  percepcionIva?: string;
  percepcionGanancias?: string;
  retencionIibb?: string;
  retencionGanancias?: string;
  retencionIva?: string;
  retencionSuss?: string;
  impuestosInternos?: string;
  ley25413?: string;
  montoTotal: string;
  estado: "pendiente" | "pagado" | "anulado";
  centroCosto?: string;
  observaciones?: string;
  supplierId?: number;
  cuentaContableId?: number;
}

interface Supplier {
  id: number;
  razonSocial: string;
  cuit: string;
  condicionIva: string;
  alicuotaIibb?: number;
  alicuotaGanancias?: number;
  alicuotaIva?: number;
}

interface AccountingAccount {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string;
}

interface CCItem {
  id: number;
  razonSocial: string;
  cuit: string;
  facturasPendientes: number;
  totalSaldo: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPOS = [
  { value: "FACT-A", label: "Factura A" },
  { value: "FACT-B", label: "Factura B" },
  { value: "FACT-C", label: "Factura C" },
  { value: "FACT-M", label: "Factura M" },
  { value: "NC-A", label: "Nota de Crédito A" },
  { value: "NC-B", label: "Nota de Crédito B" },
  { value: "NC-C", label: "Nota de Crédito C" },
  { value: "RESUMEN-BANCO", label: "Resumen Bancario" },
  { value: "LIQ-TARJETA", label: "Liquidación Tarjeta" },
];

const CENTROS_COSTO = ["Hotel", "Restaurant", "Spa", "Administración", "Mantenimiento"];
const FORMAS_PAGO = [
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "cheque", label: "Cheque" },
  { value: "dep_bancario", label: "Depósito Bancario" },
];

const $n = (v: string | undefined | null) => parseFloat(v || "0") || 0;
const fmt = (v: string | number) =>
  Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function calcPeriodo(fecha: string): string {
  if (!fecha) return "";
  const d = new Date(fecha + "T12:00:00");
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function camelInvoice(r: any): Invoice {
  return {
    id: r.id,
    tipoComprobante: r.tipo_comprobante,
    supplierNombre: r.supplier_nombre,
    proveedorNombre: r.proveedor_nombre,
    proveedorCuit: r.proveedor_cuit,
    puntoVenta: r.punto_venta,
    numeroComprobante: r.numero_comprobante,
    numeroComprobanteExt: r.numero_comprobante_ext,
    fechaEmision: r.fecha_emision,
    periodo: r.periodo,
    condicionPago: r.condicion_pago,
    montoNeto: r.monto_neto || "0",
    montoIva21: r.monto_iva21 || "0",
    montoIva105: r.monto_iva105 || "0",
    montoIva27: r.monto_iva27 || "0",
    percepcionIibb: r.percepcion_iibb || "0",
    percepcionIva: r.percepcion_iva || "0",
    percepcionGanancias: r.percepcion_ganancias || "0",
    retencionIibb: r.retencion_iibb || "0",
    retencionGanancias: r.retencion_ganancias || "0",
    retencionIva: r.retencion_iva || "0",
    retencionSuss: r.retencion_suss || "0",
    impuestosInternos: r.impuestos_internos || "0",
    ley25413: r.ley_25413 || "0",
    montoTotal: r.monto_total || "0",
    estado: r.estado,
    centroCosto: r.centro_costo,
    observaciones: r.observaciones,
    supplierId: r.supplier_id,
    cuentaContableId: r.cuenta_contable_id,
  };
}

// ─── Empty form ───────────────────────────────────────────────────────────────

const emptyForm = () => ({
  tipoComprobante: "FACT-A",
  supplierId: "",
  proveedorNombre: "",
  proveedorCuit: "",
  puntoVenta: "",
  numeroComprobante: "",
  fechaEmision: getLocalToday(),
  periodo: calcPeriodo(getLocalToday()),
  condicionPago: "contado",
  alicuotaIva: "21",
  montoNeto: "",
  montoIva21: "",
  montoIva105: "",
  montoIva27: "",
  montoIva5: "",
  montoIva25: "",
  montoExento: "",
  montoNoGravado: "",
  percepcionIibb: "",
  percepcionIva: "",
  percepcionGanancias: "",
  retencionIibb: "",
  retencionGanancias: "",
  retencionIva: "",
  retencionSuss: "",
  impuestosInternos: "",
  ley25413: "",
  cuentaContableId: "",
  centroCosto: "",
  observaciones: "",
});

// ─── Subcomponent: New Invoice Dialog ────────────────────────────────────────

function InvoiceDialog({
  open,
  onClose,
  suppliers,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  accounts: AccountingAccount[];
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm());
  const [step, setStep] = useState(0);

  const f = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSupplierChange = (id: string) => {
    const s = suppliers.find((x) => String(x.id) === id);
    if (s) {
      f("supplierId", id);
      f("proveedorNombre", s.razonSocial);
      f("proveedorCuit", s.cuit);
      if (s.alicuotaIibb) f("alicuotaIibbProveedor", String(s.alicuotaIibb));
    } else {
      f("supplierId", "");
    }
  };

  const total = useMemo(() => {
    return (
      $n(form.montoNeto) + $n(form.montoIva21) + $n(form.montoIva105) + $n(form.montoIva27) +
      $n(form.montoIva5) + $n(form.montoIva25) + $n(form.montoExento) + $n(form.montoNoGravado) +
      $n(form.impuestosInternos) + $n(form.ley25413) + $n(form.percepcionIibb) +
      $n(form.percepcionIva) + $n(form.percepcionGanancias) -
      $n(form.retencionIibb) - $n(form.retencionGanancias) - $n(form.retencionIva) - $n(form.retencionSuss)
    );
  }, [form]);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/purchase-invoices", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers"] });
      onClose();
      setForm(emptyForm());
      setStep(0);
      toast({ title: "Comprobante registrado", description: "El asiento contable fue generado automáticamente." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!form.numeroComprobante) {
      toast({ title: "Ingrese el número de comprobante", variant: "destructive" });
      return;
    }
    createMut.mutate({ ...form, supplierId: form.supplierId ? parseInt(form.supplierId) : null, cuentaContableId: form.cuentaContableId ? parseInt(form.cuentaContableId) : null });
  };

  const steps = ["Encabezado", "Montos", "Retenciones", "Clasificación"];
  const isResumen = form.tipoComprobante === "RESUMEN-BANCO" || form.tipoComprobante === "LIQ-TARJETA";
  const isNC = form.tipoComprobante.startsWith("NC");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setStep(0); setForm(emptyForm()); } }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar Comprobante</DialogTitle>
          {/* Step indicator */}
          <div className="flex gap-1 mt-2">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center">
                <button
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
                  onClick={() => i < step && setStep(i)}
                >
                  {i + 1}. {s}
                </button>
                {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {/* STEP 0: Encabezado */}
          {step === 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de Comprobante</Label>
                  <Select value={form.tipoComprobante} onValueChange={(v) => f("tipoComprobante", v)}>
                    <SelectTrigger data-testid="select-tipo-comprobante">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Condición de Pago</Label>
                  <Select value={form.condicionPago} onValueChange={(v) => f("condicionPago", v)}>
                    <SelectTrigger data-testid="select-condicion-pago">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contado">Contado</SelectItem>
                      <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Proveedor</Label>
                  <Select value={form.supplierId} onValueChange={handleSupplierChange}>
                    <SelectTrigger data-testid="select-supplier">
                      <SelectValue placeholder="Seleccionar proveedor..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">— Ingresar manual —</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.razonSocial} ({s.cuit})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(form.supplierId === "manual" || !form.supplierId) && (
                  <>
                    <div>
                      <Label>Razón Social</Label>
                      <Input value={form.proveedorNombre} onChange={(e) => f("proveedorNombre", e.target.value)} data-testid="input-proveedor-nombre" />
                    </div>
                    <div>
                      <Label>CUIT</Label>
                      <Input value={form.proveedorCuit} onChange={(e) => f("proveedorCuit", e.target.value)} data-testid="input-proveedor-cuit" />
                    </div>
                  </>
                )}
                <div>
                  <Label>Punto de Venta</Label>
                  <Input type="number" value={form.puntoVenta} onChange={(e) => f("puntoVenta", e.target.value)} placeholder="0001" data-testid="input-punto-venta" />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input value={form.numeroComprobante} onChange={(e) => f("numeroComprobante", e.target.value)} placeholder="00000001" data-testid="input-numero-comprobante" />
                </div>
                <div>
                  <Label>Fecha de Emisión</Label>
                  <Input type="date" value={form.fechaEmision} onChange={(e) => { f("fechaEmision", e.target.value); f("periodo", calcPeriodo(e.target.value)); }} data-testid="input-fecha-emision" />
                </div>
                <div>
                  <Label>Período</Label>
                  <Input value={form.periodo} onChange={(e) => f("periodo", e.target.value)} placeholder="MM/AAAA" data-testid="input-periodo" />
                </div>
              </div>
            </>
          )}

          {/* STEP 1: Montos */}
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {!isResumen && (
                  <>
                    <div>
                      <Label>Neto Gravado</Label>
                      <Input type="number" step="0.01" value={form.montoNeto} onChange={(e) => f("montoNeto", e.target.value)} data-testid="input-monto-neto" />
                    </div>
                    <div>
                      <Label>Alícuota IVA</Label>
                      <Select value={form.alicuotaIva} onValueChange={(v) => f("alicuotaIva", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0%</SelectItem>
                          <SelectItem value="5">5%</SelectItem>
                          <SelectItem value="10.5">10.5%</SelectItem>
                          <SelectItem value="21">21%</SelectItem>
                          <SelectItem value="25">25%</SelectItem>
                          <SelectItem value="27">27%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div><Label>IVA 21%</Label><Input type="number" step="0.01" value={form.montoIva21} onChange={(e) => f("montoIva21", e.target.value)} data-testid="input-iva21" /></div>
                <div><Label>IVA 10.5%</Label><Input type="number" step="0.01" value={form.montoIva105} onChange={(e) => f("montoIva105", e.target.value)} data-testid="input-iva105" /></div>
                <div><Label>IVA 27%</Label><Input type="number" step="0.01" value={form.montoIva27} onChange={(e) => f("montoIva27", e.target.value)} data-testid="input-iva27" /></div>
                <div><Label>IVA 5%</Label><Input type="number" step="0.01" value={form.montoIva5} onChange={(e) => f("montoIva5", e.target.value)} data-testid="input-iva5" /></div>
                <div><Label>IVA 2.5%</Label><Input type="number" step="0.01" value={form.montoIva25} onChange={(e) => f("montoIva25", e.target.value)} data-testid="input-iva25" /></div>
                <div><Label>Exento</Label><Input type="number" step="0.01" value={form.montoExento} onChange={(e) => f("montoExento", e.target.value)} data-testid="input-exento" /></div>
                <div><Label>No Gravado</Label><Input type="number" step="0.01" value={form.montoNoGravado} onChange={(e) => f("montoNoGravado", e.target.value)} data-testid="input-no-gravado" /></div>
                <div><Label>Imp. Internos</Label><Input type="number" step="0.01" value={form.impuestosInternos} onChange={(e) => f("impuestosInternos", e.target.value)} data-testid="input-imp-internos" /></div>
                <div><Label>Ley 25.413</Label><Input type="number" step="0.01" value={form.ley25413} onChange={(e) => f("ley25413", e.target.value)} data-testid="input-ley25413" /></div>
              </div>
            </>
          )}

          {/* STEP 2: Retenciones / Percepciones */}
          {step === 2 && (
            <>
              <p className="text-sm font-semibold text-muted-foreground">Percepciones (DEBE)</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Percep. IIBB</Label><Input type="number" step="0.01" value={form.percepcionIibb} onChange={(e) => f("percepcionIibb", e.target.value)} data-testid="input-percep-iibb" /></div>
                <div><Label>Percep. IVA</Label><Input type="number" step="0.01" value={form.percepcionIva} onChange={(e) => f("percepcionIva", e.target.value)} data-testid="input-percep-iva" /></div>
                <div><Label>Percep. Ganancias</Label><Input type="number" step="0.01" value={form.percepcionGanancias} onChange={(e) => f("percepcionGanancias", e.target.value)} data-testid="input-percep-ganancias" /></div>
              </div>
              <Separator />
              <p className="text-sm font-semibold text-muted-foreground">Retenciones (HABER — descuentan el pago)</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Ret. IIBB</Label><Input type="number" step="0.01" value={form.retencionIibb} onChange={(e) => f("retencionIibb", e.target.value)} data-testid="input-ret-iibb" /></div>
                <div><Label>Ret. Ganancias</Label><Input type="number" step="0.01" value={form.retencionGanancias} onChange={(e) => f("retencionGanancias", e.target.value)} data-testid="input-ret-ganancias" /></div>
                <div><Label>Ret. IVA</Label><Input type="number" step="0.01" value={form.retencionIva} onChange={(e) => f("retencionIva", e.target.value)} data-testid="input-ret-iva" /></div>
                <div><Label>Ret. SUSS</Label><Input type="number" step="0.01" value={form.retencionSuss} onChange={(e) => f("retencionSuss", e.target.value)} data-testid="input-ret-suss" /></div>
              </div>
            </>
          )}

          {/* STEP 3: Clasificación */}
          {step === 3 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Cuenta Contable de Gasto</Label>
                  <Select value={form.cuentaContableId || "__none__"} onValueChange={(v) => f("cuentaContableId", v === "__none__" ? "" : v)}>
                    <SelectTrigger data-testid="select-cuenta-contable">
                      <SelectValue placeholder="Seleccionar cuenta..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Sin clasificar —</SelectItem>
                      {accounts
                        .filter((a) => a.tipo === "egreso")
                        .map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.codigo} — {a.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Centro de Costo</Label>
                  <Select value={form.centroCosto || "__none__"} onValueChange={(v) => f("centroCosto", v === "__none__" ? "" : v)}>
                    <SelectTrigger data-testid="select-centro-costo">
                      <SelectValue placeholder="Seleccionar área..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Sin clasificar —</SelectItem>
                      {CENTROS_COSTO.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Observaciones</Label>
                  <Textarea value={form.observaciones} onChange={(e) => f("observaciones", e.target.value)} rows={2} data-testid="input-observaciones" />
                </div>
              </div>

              {/* Total preview */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total Comprobante</span>
                    <span className="text-2xl font-bold text-primary">${fmt(total)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Condición: {form.condicionPago === "contado" ? "Contado (pago inmediato)" : "Cuenta Corriente (queda pendiente)"}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div>
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((p) => p - 1)}>Anterior</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { onClose(); setStep(0); setForm(emptyForm()); }}>Cancelar</Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep((p) => p + 1)} data-testid="btn-next-step">Siguiente</Button>
            ) : (
              <Button onClick={handleSubmit} disabled={createMut.isPending} data-testid="btn-submit-invoice">
                Registrar comprobante
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Subcomponent: Payment Order Dialog ──────────────────────────────────────

function PaymentOrderDialog({
  supplier,
  open,
  onClose,
}: {
  supplier: CCItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [createdOpId, setCreatedOpId] = useState<number | null>(null);
  const [form, setForm] = useState({
    fecha: getLocalToday(),
    formaPago: "transferencia",
    depBancario: "",
    efectivo: "",
    retencionIibb: "",
    retencionGanancias: "",
    retencionIva: "",
    compensacion: "",
    observaciones: "",
  });

  const { data: ccData } = useQuery<any>({
    queryKey: ["/api/accounting-suppliers", supplier?.id, "cuenta-corriente"],
    queryFn: () =>
      supplier
        ? fetch(`/api/accounting-suppliers/${supplier.id}/cuenta-corriente`, { credentials: "include" }).then((r) => r.json())
        : Promise.resolve(null),
    enabled: !!supplier && open,
  });

  const facturas: Invoice[] = (ccData?.facturasPendientes || []).map(camelInvoice);

  const f = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const toggleInv = (id: number) =>
    setSelectedInvoices((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const totalSelected = facturas
    .filter((f) => selectedInvoices.includes(f.id))
    .reduce((s, f) => s + $n(f.montoTotal), 0);

  const totalAbonado =
    totalSelected -
    $n(form.retencionIibb) -
    $n(form.retencionGanancias) -
    $n(form.retencionIva) -
    $n(form.compensacion);

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/payment-orders", data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers", supplier?.id, "cuenta-corriente"] });
      setCreatedOpId(data?.id ?? null);
      toast({ title: "Orden de Pago generada", description: `OP ${data?.numero || ""} emitida correctamente.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleDownloadOpPdf = () => {
    if (!createdOpId) return;
    window.open(`/api/payment-orders/${createdOpId}/pdf`, "_blank");
  };

  const handleDownloadCertPdf = () => {
    if (!createdOpId) return;
    window.open(`/api/exports/cert-retencion/${createdOpId}`, "_blank");
  };

  const handleSubmit = () => {
    if (!selectedInvoices.length) {
      toast({ title: "Seleccione al menos una factura", variant: "destructive" });
      return;
    }
    createMut.mutate({
      supplierId: Number(supplier?.id),
      fecha: form.fecha,
      facturaIds: selectedInvoices,
      formaPago: form.formaPago,
      depBancario: form.depBancario || 0,
      efectivo: form.efectivo || 0,
      retencionIibb: form.retencionIibb || 0,
      retencionGanancias: form.retencionGanancias || 0,
      retencionIva: form.retencionIva || 0,
      compensacion: form.compensacion || 0,
      observaciones: form.observaciones,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Emitir Orden de Pago — {supplier?.razonSocial}</DialogTitle>
        </DialogHeader>
        {createdOpId ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-700 dark:text-green-400">Orden de Pago emitida correctamente</p>
                <p className="text-sm text-green-600 dark:text-green-500">Los documentos también están disponibles en el historial de OPs.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-16 flex-col gap-1" onClick={handleDownloadOpPdf} data-testid="btn-op-pdf">
                <FileDown className="h-5 w-5" />
                <span className="text-sm font-medium">Orden de Pago</span>
                <span className="text-xs text-muted-foreground">Para el proveedor</span>
              </Button>
              <Button variant="outline" className="h-16 flex-col gap-1" onClick={handleDownloadCertPdf} data-testid="btn-cert-retencion-pdf">
                <FileDown className="h-5 w-5" />
                <span className="text-sm font-medium">Cert. Retención IIBB</span>
                <span className="text-xs text-muted-foreground">Constancia fiscal</span>
              </Button>
            </div>
          </div>
        ) : (
        <div className="space-y-4">
          {/* Facturas pendientes */}
          <div>
            <Label className="text-sm font-semibold">Seleccionar facturas a cancelar</Label>
            <div className="border rounded-md mt-2 divide-y">
              {facturas.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">Sin facturas pendientes</div>
              )}
              {facturas.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 p-3 hover:bg-muted/50">
                  <Checkbox
                    checked={selectedInvoices.includes(inv.id)}
                    onCheckedChange={() => toggleInv(inv.id)}
                    data-testid={`chk-invoice-${inv.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{inv.tipoComprobante} {inv.numeroComprobanteExt || inv.numeroComprobante}</div>
                    <div className="text-xs text-muted-foreground">{inv.fechaEmision}</div>
                  </div>
                  <div className="font-semibold">${fmt(inv.montoTotal)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Forma de pago */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha} onChange={(e) => f("fecha", e.target.value)} data-testid="input-op-fecha" />
            </div>
            <div>
              <Label>Forma de Pago</Label>
              <Select value={form.formaPago} onValueChange={(v) => f("formaPago", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGO.map((fp) => <SelectItem key={fp.value} value={fp.value}>{fp.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Dep. Bancario</Label><Input type="number" step="0.01" value={form.depBancario} onChange={(e) => f("depBancario", e.target.value)} data-testid="input-dep-bancario" /></div>
            <div><Label>Efectivo</Label><Input type="number" step="0.01" value={form.efectivo} onChange={(e) => f("efectivo", e.target.value)} data-testid="input-efectivo-op" /></div>
          </div>

          <Separator />
          <p className="text-sm font-semibold text-muted-foreground">Retenciones a practicar</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Ret. IIBB</Label><Input type="number" step="0.01" value={form.retencionIibb} onChange={(e) => f("retencionIibb", e.target.value)} data-testid="input-op-ret-iibb" /></div>
            <div><Label>Ret. Ganancias</Label><Input type="number" step="0.01" value={form.retencionGanancias} onChange={(e) => f("retencionGanancias", e.target.value)} data-testid="input-op-ret-ganancias" /></div>
            <div><Label>Ret. IVA</Label><Input type="number" step="0.01" value={form.retencionIva} onChange={(e) => f("retencionIva", e.target.value)} data-testid="input-op-ret-iva" /></div>
            <div><Label>Compensación</Label><Input type="number" step="0.01" value={form.compensacion} onChange={(e) => f("compensacion", e.target.value)} data-testid="input-op-compensacion" /></div>
          </div>

          <div><Label>Observaciones</Label><Textarea value={form.observaciones} onChange={(e) => f("observaciones", e.target.value)} rows={2} /></div>

          {/* Resumen */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 space-y-1">
              <div className="flex justify-between text-sm"><span>Facturas seleccionadas:</span><span className="font-medium">${fmt(totalSelected)}</span></div>
              <div className="flex justify-between text-sm text-destructive">
                <span>Retenciones:</span>
                <span>- ${fmt($n(form.retencionIibb) + $n(form.retencionGanancias) + $n(form.retencionIva) + $n(form.compensacion))}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold"><span>Total a abonar:</span><span className="text-primary">${fmt(totalAbonado)}</span></div>
            </CardContent>
          </Card>
        </div>
        )} {/* fin bloque form */}

        <DialogFooter>
          {createdOpId ? (
            <Button onClick={onClose} data-testid="btn-close-op-dialog">Cerrar</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createMut.isPending || !selectedInvoices.length} data-testid="btn-submit-payment-order">
                {createMut.isPending ? "Generando..." : "Emitir Orden de Pago"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pagos a Proveedores Tab ──────────────────────────────────────────────────

function PagosProveedoresTab({ onEmitirOP }: { onEmitirOP: (prov: CCItem) => void }) {
  const { data: proveedores = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/accounting-suppliers/cuenta-corriente"],
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">Cargando proveedores...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Proveedores con facturas pendientes</CardTitle>
        <CardDescription>Seleccioná un proveedor para emitir la orden de pago</CardDescription>
      </CardHeader>
      <CardContent>
        {proveedores.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay facturas pendientes de pago</p>
          </div>
        ) : (
          <div className="space-y-2">
            {proveedores.map((prov: any) => (
              <div
                key={prov.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/40 transition-colors"
                data-testid={`row-proveedor-pago-${prov.id}`}
              >
                <div>
                  <div className="font-medium">{prov.razon_social}</div>
                  <div className="text-sm text-muted-foreground">
                    {prov.facturas_pendientes} factura(s) pendiente(s)
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-semibold text-destructive">
                      ${parseFloat(prov.total_saldo || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground">saldo pendiente</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onEmitirOP({ id: prov.id, razonSocial: prov.razon_social, cuit: prov.cuit, condicionIva: prov.condicion_iva, saldoPendiente: parseFloat(prov.total_saldo || 0), facturasPendientes: parseInt(prov.facturas_pendientes || 0) })}
                    data-testid={`btn-emitir-op-${prov.id}`}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Emitir OP
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Órdenes de Pago Tab ─────────────────────────────────────────────────────

function OrdenesDePagoTab() {
  const [search, setSearch] = useState("");
  const [filterPeriodo, setFilterPeriodo] = useState("");

  const { data: ops = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/payment-orders"],
  });

  const filtered = ops.filter((op) => {
    const matchSearch =
      !search ||
      op.supplier_nombre?.toLowerCase().includes(search.toLowerCase()) ||
      op.numero?.includes(search);
    const matchPeriodo = !filterPeriodo || op.fecha?.startsWith(filterPeriodo);
    return matchSearch && matchPeriodo;
  });

  const fmtDate = (d: string) => {
    if (!d) return "-";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };
  const fmtMoney = (v: any) =>
    parseFloat(v || "0").toLocaleString("es-AR", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por proveedor o número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-op-search"
          />
        </div>
        <Input
          type="month"
          value={filterPeriodo}
          onChange={(e) => setFilterPeriodo(e.target.value)}
          className="w-44"
          placeholder="Filtrar período"
          data-testid="input-op-periodo"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No hay órdenes de pago registradas</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Forma de Pago</TableHead>
              <TableHead className="text-right">Total Facturas</TableHead>
              <TableHead className="text-right">Total Abonado</TableHead>
              <TableHead className="w-[120px]">Documentos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((op) => (
              <TableRow key={op.id} data-testid={`row-op-${op.id}`}>
                <TableCell className="font-mono text-sm">{op.numero}</TableCell>
                <TableCell>{fmtDate(op.fecha)}</TableCell>
                <TableCell className="font-medium">{op.supplier_nombre}</TableCell>
                <TableCell className="capitalize">{op.forma_pago?.replace("_", " ") || "-"}</TableCell>
                <TableCell className="text-right">${fmtMoney(op.total_facturas)}</TableCell>
                <TableCell className="text-right font-semibold">${fmtMoney(op.total_abonado)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      title="Descargar Orden de Pago"
                      onClick={() => window.open(`/api/payment-orders/${op.id}/pdf`, "_blank")}
                      data-testid={`btn-op-pdf-${op.id}`}
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1" />
                      OP
                    </Button>
                    {parseFloat(op.retencion_iibb || "0") > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        title="Certificado Retención IIBB"
                        onClick={() => window.open(`/api/exports/cert-retencion/${op.id}`, "_blank")}
                        data-testid={`btn-cert-iibb-${op.id}`}
                      >
                        <FileDown className="h-3.5 w-3.5 mr-1" />
                        IIBB
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {filtered.length > 0 && (
        <div className="flex justify-end gap-6 text-sm border-t pt-3">
          <span className="text-muted-foreground">
            {filtered.length} OP{filtered.length !== 1 ? "s" : ""}
          </span>
          <span>
            Total abonado:{" "}
            <span className="font-semibold">
              ${fmtMoney(filtered.reduce((s, op) => s + parseFloat(op.total_abonado || "0"), 0))}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PurchaseInvoices() {
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") || "comprobantes";
  });
  const [newOpen, setNewOpen] = useState(false);
  const [opSupplier, setOpSupplier] = useState<CCItem | null>(null);
  const [anularId, setAnularId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [filterPeriodo, setFilterPeriodo] = useState("");

  const { data: rawInvoices = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/purchase-invoices"],
  });
  const invoices = rawInvoices.map(camelInvoice);

  const { data: rawSuppliers = [] } = useQuery<any[]>({
    queryKey: ["/api/accounting-suppliers"],
  });
  const suppliers: Supplier[] = rawSuppliers.map((r: any) => ({
    id: r.id, razonSocial: r.razon_social, cuit: r.cuit, condicionIva: r.condicion_iva,
    alicuotaIibb: parseFloat(r.alicuota_iibb || "0"),
    alicuotaGanancias: parseFloat(r.alicuota_ganancias || "0"),
    alicuotaIva: parseFloat(r.alicuota_iva || "0"),
  }));

  const { data: rawAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/accounting-accounts"],
  });
  const accounts: AccountingAccount[] = rawAccounts.map((r: any) => ({
    id: r.id, codigo: r.codigo, nombre: r.nombre, tipo: r.tipo,
  }));

  const { data: rawCC = [] } = useQuery<any[]>({
    queryKey: ["/api/accounting-suppliers/cuenta-corriente"],
    enabled: tab === "cc",
  });
  const ccItems: CCItem[] = rawCC.map((r: any) => ({
    id: r.id, razonSocial: r.razon_social, cuit: r.cuit, condicionIva: r.condicion_iva,
    facturasPendientes: parseInt(r.facturas_pendientes),
    totalSaldo: r.total_saldo,
  }));

  const anularMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/purchase-invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers"] });
      setAnularId(null);
    },
    onError: (e: any) => {},
  });

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch =
        !search ||
        (inv.supplierNombre || inv.proveedorNombre || "").toLowerCase().includes(search.toLowerCase()) ||
        (inv.proveedorCuit || "").includes(search) ||
        (inv.numeroComprobanteExt || inv.numeroComprobante).includes(search);
      const matchEstado = filterEstado === "todos" || inv.estado === filterEstado;
      const matchPeriodo = !filterPeriodo || inv.periodo === filterPeriodo;
      return matchSearch && matchEstado && matchPeriodo;
    });
  }, [invoices, search, filterEstado, filterPeriodo]);

  const totalSaldo = ccItems.reduce((s, c) => s + $n(c.totalSaldo), 0);

  const estadoBadge = (estado: string) => {
    if (estado === "pendiente") return <Badge variant="outline" className="border-amber-500 text-amber-600"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>;
    if (estado === "pagado") return <Badge variant="outline" className="border-green-500 text-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Pagado</Badge>;
    return <Badge variant="secondary">Anulado</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="icon" data-testid="btn-back-admin">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Receipt className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Comprobantes de Compra</h1>
            <p className="text-sm text-muted-foreground">Facturas, NC, resúmenes bancarios y liquidaciones</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Link href="/accounting-suppliers">
              <Button variant="outline" data-testid="btn-go-suppliers">
                <Building2 className="h-4 w-4 mr-2" />Proveedores
              </Button>
            </Link>
            <Button onClick={() => setNewOpen(true)} data-testid="btn-new-invoice">
              <Plus className="h-4 w-4 mr-2" />Nuevo Comprobante
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{invoices.length}</div>
              <div className="text-xs text-muted-foreground">Comprobantes totales</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-amber-600">{invoices.filter((i) => i.estado === "pendiente").length}</div>
              <div className="text-xs text-muted-foreground">Pendientes de pago</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-destructive">
                ${invoices.filter((i) => i.estado === "pendiente").reduce((s, i) => s + $n(i.montoTotal), 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-muted-foreground">Deuda total en CC</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{ccItems.length}</div>
              <div className="text-xs text-muted-foreground">Proveedores con deuda</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="comprobantes" data-testid="tab-comprobantes">Comprobantes</TabsTrigger>
            <TabsTrigger value="cc" data-testid="tab-cc">Cuenta Corriente</TabsTrigger>
            <TabsTrigger value="pagos" data-testid="tab-pagos">Pagos a Proveedores</TabsTrigger>
            <TabsTrigger value="ordenes-pago" data-testid="tab-ordenes-pago">Historial de OPs</TabsTrigger>
          </TabsList>

          {/* Tab: Comprobantes */}
          <TabsContent value="comprobantes">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar proveedor, CUIT, número..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-invoice"
                    />
                  </div>
                  <Select value={filterEstado} onValueChange={setFilterEstado}>
                    <SelectTrigger className="w-[140px]" data-testid="select-filter-estado">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="pagado">Pagado</SelectItem>
                      <SelectItem value="anulado">Anulado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Período MM/AAAA"
                    value={filterPeriodo}
                    onChange={(e) => setFilterPeriodo(e.target.value)}
                    className="w-[140px]"
                    data-testid="input-filter-periodo"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="text-center py-12 text-muted-foreground">Cargando...</div>
                ) : filteredInvoices.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    No hay comprobantes que coincidan con los filtros
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Número</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.map((inv) => (
                        <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`} className={inv.estado === "anulado" ? "opacity-50" : ""}>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono text-xs">{inv.tipoComprobante}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{inv.numeroComprobanteExt || inv.numeroComprobante}</TableCell>
                          <TableCell className="max-w-[160px] truncate" title={inv.supplierNombre || inv.proveedorNombre}>
                            {inv.supplierNombre || inv.proveedorNombre || "—"}
                          </TableCell>
                          <TableCell>{inv.fechaEmision}</TableCell>
                          <TableCell>{inv.periodo || "—"}</TableCell>
                          <TableCell className="text-right font-semibold">${fmt(inv.montoTotal)}</TableCell>
                          <TableCell>{estadoBadge(inv.estado)}</TableCell>
                          <TableCell>
                            {inv.estado === "pendiente" && (
                              <Button
                                variant="ghost" size="icon"
                                onClick={() => setAnularId(inv.id)}
                                data-testid={`btn-anular-invoice-${inv.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Cuenta Corriente */}
          <TabsContent value="cc">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Proveedores con saldo pendiente</span>
                  <span className="text-base font-normal text-destructive">Total: ${fmt(totalSaldo)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {ccItems.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    No hay saldos pendientes
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Proveedor</TableHead>
                        <TableHead>CUIT</TableHead>
                        <TableHead className="text-center">Facturas</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead>Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ccItems.map((item) => (
                        <TableRow key={item.id} data-testid={`row-cc-${item.id}`}>
                          <TableCell className="font-medium">{item.razonSocial}</TableCell>
                          <TableCell className="font-mono text-sm">{item.cuit}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{item.facturasPendientes}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold text-destructive">
                            ${fmt(item.totalSaldo)}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => setOpSupplier(item)}
                              data-testid={`btn-emitir-op-${item.id}`}
                            >
                              <CreditCard className="h-3.5 w-3.5 mr-1" />
                              Emitir OP
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Pagos a Proveedores */}
          <TabsContent value="pagos" className="mt-4">
            <PagosProveedoresTab onEmitirOP={(prov) => setOpSupplier(prov)} />
          </TabsContent>
          <TabsContent value="ordenes-pago" className="mt-4">
            <OrdenesDePagoTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <InvoiceDialog open={newOpen} onClose={() => setNewOpen(false)} suppliers={suppliers} accounts={accounts} />
      <PaymentOrderDialog supplier={opSupplier} open={!!opSupplier} onClose={() => setOpSupplier(null)} />

      <AlertDialog open={!!anularId} onOpenChange={() => setAnularId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular comprobante?</AlertDialogTitle>
            <AlertDialogDescription>El comprobante quedará marcado como anulado. Esta acción no se puede revertir.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => anularId && anularMut.mutate(anularId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-anular"
            >
              Anular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
