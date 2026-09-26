import { useState, useMemo, useEffect, useRef } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  CreditCard, Landmark, Receipt, ChevronRight, CheckCircle2, Clock, FileDown, Package,
  ChevronsUpDown, Check, Eye, Pencil,
} from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "wouter";
import { getLocalToday, fmtMoney, getArgentinaToday } from "@/lib/utils";
import {
  calculatePurchaseInvoiceAmountsFromNetLines,
  calculatePurchaseInvoiceTotal,
  isCardSettlement,
  isReceivedRetention,
  isSupplierPayableDocument,
  isValidPurchaseInvoiceTotal,
  mapPurchaseInvoiceAmountFields,
  receivedRetentionAccountCode,
  suggestPurchaseAmountsFromArticles,
} from "@shared/purchaseInvoiceTotals";

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
  retencionMunicipal?: string;
  impuestosInternos?: string;
  ley25413?: string;
  montoTotal: string;
  saldoPendiente?: string;
  estado: "pendiente" | "parcial" | "pagado" | "registrado" | "anulado";
  centroCosto?: string;
  observaciones?: string;
  supplierId?: number;
  cuentaContableId?: number;
  montoIva5?: string;
  montoIva25?: string;
  montoExento?: string;
  montoNoGravado?: string;
  subtipoRetencion?: string;
}

export interface Supplier {
  id: number;
  razonSocial: string;
  cuit: string;
  condicionIva: string;
  alicuotaIibb?: number;
  alicuotaGanancias?: number;
  alicuotaIva?: number;
  cuentaContableId?: number;
}

export interface AccountingAccount {
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
  condicionIva?: string;
  alicuotaIibb?: number;
  alicuotaGanancias?: number;
  alicuotaIva?: number;
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
  { value: "NC-M", label: "Nota de Crédito M" },
  { value: "ND-A", label: "Nota de Débito A" },
  { value: "ND-B", label: "Nota de Débito B" },
  { value: "ND-C", label: "Nota de Débito C" },
  { value: "RESUMEN-BANCO", label: "Resumen Bancario" },
  { value: "LIQ-TARJETA", label: "Liquidación Tarjeta" },
  { value: "RETENCION", label: "Retención Recibida" },
  { value: "RECIBO-A", label: "Recibo A" },
  { value: "RECIBO-B", label: "Recibo B" },
  { value: "RECIBO-C", label: "Recibo C" },
];

// Solo para el layout unificado del Centro de Comprobantes — el asistente
// original (Facturas de Compra) sigue usando TIPOS sin Remito, sin cambios.
const TIPOS_UNIFIED = [...TIPOS, { value: "REMITO", label: "Remito" }];

// Sugerencia (no validación dura, confirmado con el usuario): al elegir un
// proveedor, la letra del comprobante se ajusta según su condición IVA —
// Responsable Inscripto → A, Monotributo → C, Exento → B — pero el
// operador la puede cambiar a mano (hay proveedores RI cuyo concepto es
// exento). Solo toca comprobantes "con letra" (Factura/NC/Recibo); no
// altera Factura M, Remito, Resumen Bancario, Liquidación de Tarjeta ni
// Retención, que no siguen esa regla.
const LETRA_POR_CONDICION_IVA: Record<string, "A" | "B" | "C"> = {
  "Responsable Inscripto": "A",
  "Monotributo": "C",
  "Exento": "B",
};
const TIPOS_CON_LETRA = new Set(["FACT-A", "FACT-B", "FACT-C", "NC-A", "NC-B", "NC-C", "ND-A", "ND-B", "ND-C", "RECIBO-A", "RECIBO-B", "RECIBO-C"]);
function sugerirTipoPorCondicionIva(tipoActual: string, condicionIva: string | undefined | null): string {
  const letra = condicionIva ? LETRA_POR_CONDICION_IVA[condicionIva] : undefined;
  if (!letra || !TIPOS_CON_LETRA.has(tipoActual)) return tipoActual;
  const familia = tipoActual.split("-")[0];
  return `${familia}-${letra}`;
}
const FORMAS_PAGO = [
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "cheque", label: "Cheque" },
  { value: "dep_bancario", label: "Depósito Bancario" },
];

export type PurchaseInventoryOption = {
  id: string;
  name: string;
  isActive?: string | null;
  sku?: string | null;
  category?: { name: string } | null;
  currentStock?: string | null;
  unit?: string | null;
  costPrice?: string | null;
};

export function PurchaseInventoryPicker({ items, selectedId, open, onOpenChange, onSelect, index }: {
  items: PurchaseInventoryOption[];
  selectedId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  index: number;
}) {
  const selected = items.find(item => String(item.id) === selectedId);
  return (
    <div>
      <Label className="text-xs mb-1 block">Artículo del inventario</Label>
      <Popover modal={true} open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-8 text-sm" data-testid={`select-existing-item-${index}`}>
            <span className="truncate">{selected?.name || "Seleccionar artículo..."}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(520px,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar por nombre o SKU..." />
            <CommandList>
              <CommandEmpty>No se encontraron artículos</CommandEmpty>
              <CommandGroup>
                {[...items].sort((a, b) => a.name.localeCompare(b.name, "es")).map(item => (
                  <CommandItem key={item.id} value={`${item.name} ${item.sku || ""}`} onMouseDown={e => e.preventDefault()} onSelect={() => onSelect(String(item.id))} className="items-start gap-2 py-2">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${selectedId === String(item.id) ? "opacity-100" : "opacity-0"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium break-words">{item.name}</span>
                      <span className="block text-xs text-muted-foreground break-words">SKU: {item.sku || "Sin código"} · {item.category?.name || "Sin categoría"}</span>
                      <span className="block text-xs text-muted-foreground">Stock: {item.currentStock ?? "—"} {item.unit || ""} · Costo registrado: {item.costPrice == null ? "—" : `$${fmtMoney(item.costPrice)}`}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

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
    ...mapPurchaseInvoiceAmountFields(r),
    estado: r.estado,
    centroCosto: r.centro_costo,
    observaciones: r.observaciones,
    supplierId: r.supplier_id,
    cuentaContableId: r.cuenta_contable_id,
    subtipoRetencion: r.subtipo_retencion,
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
  condicionPago: "cuenta_corriente",
  formaPagoInmediata: "cuenta_corriente",
  montoPagadoAhora: "",
  // Formas de pago adicionales cuando se combina más de una al cargar el
  // comprobante (ej. parte efectivo, parte transferencia) — formaPagoInmediata
  // + montoPagadoAhora siguen siendo la primera fila.
  formasPagoExtra: [] as Array<{ formaPago: string; monto: string }>,
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
  retencionMunicipal: "",
  impuestosInternos: "",
  ley25413: "",
  cuentaContableId: "",
  observaciones: "",
  subtipoRetencion: "",
});

// ─── Subcomponent: New Invoice Dialog ────────────────────────────────────────

interface InvItemRow {
  existingItemId: string;
  quantity: string;
  unit: string;
  costPrice: string;
  warehouseId: string;
  vatRate: string;
}

const UNITS = ["unidad", "kg", "g", "litro", "ml", "caja", "paquete", "rollo", "metro", "par"];

const IVA_MAP: Record<string, { field: string; rate: number }> = {
  "5":   { field: "montoIva5",   rate: 5 },
  "10.5":{ field: "montoIva105", rate: 10.5 },
  "21":  { field: "montoIva21",  rate: 21 },
  "25":  { field: "montoIva25",  rate: 2.5 },
  "27":  { field: "montoIva27",  rate: 27 },
};

const ALL_IVA_FIELDS = { montoIva5: "", montoIva25: "", montoIva105: "", montoIva21: "", montoIva27: "" };

type NetoLine = { neto: string; alicuota: string };
const emptyNetoLine = (): NetoLine => ({ neto: "", alicuota: "21" });

function linesFromInvoice(inv: Invoice): NetoLine[] {
  const result: NetoLine[] = [];
  const pairs: Array<{ alicuota: string; field: string; rate: number }> = [
    { alicuota: "5",    field: "montoIva5",   rate: 0.05 },
    { alicuota: "10.5", field: "montoIva105", rate: 0.105 },
    { alicuota: "21",   field: "montoIva21",  rate: 0.21 },
    { alicuota: "25",   field: "montoIva25",  rate: 0.025 },
    { alicuota: "27",   field: "montoIva27",  rate: 0.27 },
  ];
  for (const { alicuota, field, rate } of pairs) {
    const iva = parseFloat((inv as any)[field] || "0");
    if (iva > 0.001) {
      result.push({ neto: (iva / rate).toFixed(2), alicuota });
    }
  }
  if (result.length === 0) {
    const neto = parseFloat(inv.montoNeto || "0");
    result.push({ neto: neto > 0 ? String(neto) : "", alicuota: "21" });
  }
  return result;
}

function calcIvaField(neto: string, alicuota: string): Record<string, string> {
  const n = parseFloat(neto);
  const entry = IVA_MAP[alicuota];
  if (!entry || isNaN(n) || n <= 0) return { ...ALL_IVA_FIELDS };
  return { ...ALL_IVA_FIELDS, [entry.field]: (n * entry.rate / 100).toFixed(2) };
}

/**
 * Renders InvoiceDialog's form content either as a real modal (default,
 * unchanged behavior) or inline with no Dialog chrome, so the exact same
 * content — same handlers, same fiscal logic — can be embedded inside a host
 * page's own layout (the unified Centro de Comprobantes). Only the wrapper
 * changes; nothing about what is inside `header`/`children` is touched.
 */
function InvoiceFormShell({ embedded, open, onOpenChange, title, headerExtra, children }: {
  embedded?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Plain text/node — rendered as a real Radix DialogTitle in modal mode, or a plain heading when embedded (DialogTitle requires a real <Dialog> ancestor and throws otherwise). */
  title: React.ReactNode;
  /** Non-title header content (e.g. the step indicator) — rendered the same way in both modes. */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (embedded) {
    return (
      <div className="space-y-4" data-testid="invoice-form-embedded">
        <div>
          <h2 className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
          {headerExtra}
        </div>
        {children}
      </div>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[92vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {headerExtra}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceDialog({
  open,
  onClose,
  suppliers,
  accounts,
  editingInvoice,
  embedded,
  unifiedLayout,
  initialTipo,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  accounts: AccountingAccount[];
  editingInvoice?: Invoice | null;
  embedded?: boolean;
  /** Tipo elegido en el Centro de Comprobantes antes de abrir este formulario. */
  initialTipo?: string;
  /**
   * Renders the same form as one continuous page (Tipo/Condición → Datos del
   * emisor → Artículos → Impuestos y totales) matching EmitirFacturaDialog's
   * layout, instead of the original 5-step wizard. Same state, validation and
   * submit as the wizard — only the JSX arrangement differs. Used by the
   * Centro de Comprobantes; the standalone Facturas de Compra page keeps the
   * wizard unchanged.
   */
  unifiedLayout?: boolean;
}) {
  const { toast } = useToast();
  const newForm = () => {
    const result = emptyForm();
    if (initialTipo) {
      result.tipoComprobante = initialTipo;
      if (["FACT-C", "NC-C", "ND-C", "RECIBO-C", "RETENCION"].includes(initialTipo)) {
        result.alicuotaIva = "0";
      }
    }
    return result;
  };
  const [form, setForm] = useState(newForm);
  const [step, setStep] = useState(0);
  const [invItems, setInvItems] = useState<InvItemRow[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const supplierBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSupplierBlur = () => {
    if (supplierBlurTimer.current) clearTimeout(supplierBlurTimer.current);
    supplierBlurTimer.current = null;
  };
  useEffect(() => () => cancelSupplierBlur(), []);
  const [existingItemOpen, setExistingItemOpen] = useState<Record<number, boolean>>({});
  const [netoLines, setNetoLines] = useState<NetoLine[]>([emptyNetoLine()]);
  const [automaticNetos, setAutomaticNetos] = useState(true);

  const TIPOS_C = ["FACT-C", "NC-C", "ND-C", "RECIBO-C"];
  // Comprobantes sin desglose de IVA, donde el importe cargado ES el total del comprobante
  const TIPOS_IMPORTE_UNICO = [...TIPOS_C, "RETENCION"];

  const applyNetoLines = (updated: NetoLine[]) => {
    setForm(p => {
      if (TIPOS_IMPORTE_UNICO.includes(p.tipoComprobante) || (p.tipoComprobante === "FACT-B" && !isEditing)) {
        // Factura C / Retención Recibida: no IVA — el importe cargado es el total, no calcular IVA
        const netoTotal = updated.reduce((sum, l) => sum + (parseFloat(l.neto) || 0), 0);
        return { ...p, montoNeto: netoTotal > 0 ? netoTotal.toFixed(2) : "", ...ALL_IVA_FIELDS };
      }
      return { ...p, ...calculatePurchaseInvoiceAmountsFromNetLines(updated) };
    });
  };

  const updateNetoLine = (i: number, field: keyof NetoLine, val: string) => {
    setAutomaticNetos(false);
    setNetoLines(prev => {
      const updated = prev.map((l, j) => j === i ? { ...l, [field]: val } : l);
      applyNetoLines(updated);
      return updated;
    });
  };
  const addNetoLine = () => { setAutomaticNetos(false); setNetoLines(prev => [...prev, emptyNetoLine()]); };
  const removeNetoLine = (i: number) => {
    setAutomaticNetos(false);
    setNetoLines(prev => {
      const updated = prev.filter((_, j) => j !== i);
      applyNetoLines(updated);
      return updated;
    });
  };

  const isEditing = !!editingInvoice;

  const f = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Si se abandona una liquidación antes de guardar, sus retenciones no deben
  // quedar ocultas en otro tipo de comprobante y alterar el total enviado.
  const clearCardRetentions = (previous: ReturnType<typeof emptyForm>, nextType: string) =>
    previous.tipoComprobante === "LIQ-TARJETA" && nextType !== "LIQ-TARJETA"
      ? { retencionIibb: "", retencionGanancias: "", retencionIva: "", retencionSuss: "", retencionMunicipal: "" }
      : {};

  useEffect(() => {
    if (open && editingInvoice) {
      setForm({
        tipoComprobante: editingInvoice.tipoComprobante || "FACT-A",
        supplierId: editingInvoice.supplierId ? String(editingInvoice.supplierId) : "",
        proveedorNombre: editingInvoice.proveedorNombre || editingInvoice.supplierNombre || "",
        proveedorCuit: editingInvoice.proveedorCuit || "",
        puntoVenta: editingInvoice.puntoVenta ? String(editingInvoice.puntoVenta) : "",
        numeroComprobante: editingInvoice.numeroComprobante || "",
        fechaEmision: editingInvoice.fechaEmision || "",
        periodo: editingInvoice.periodo || "",
        condicionPago: editingInvoice.condicionPago || "cuenta_corriente",
        formaPagoInmediata: "cuenta_corriente",
        montoPagadoAhora: "",
        formasPagoExtra: [],
        alicuotaIva: "21",
        montoNeto: editingInvoice.montoNeto || "",
        montoIva21: editingInvoice.montoIva21 || "",
        montoIva105: editingInvoice.montoIva105 || "",
        montoIva27: editingInvoice.montoIva27 || "",
        montoIva5: (editingInvoice as any).montoIva5 || "",
        montoIva25: (editingInvoice as any).montoIva25 || "",
        montoExento: (editingInvoice as any).montoExento || "",
        montoNoGravado: (editingInvoice as any).montoNoGravado || "",
        percepcionIibb: editingInvoice.percepcionIibb || "",
        percepcionIva: editingInvoice.percepcionIva || "",
        percepcionGanancias: editingInvoice.percepcionGanancias || "",
        retencionIibb: editingInvoice.retencionIibb || "",
        retencionGanancias: editingInvoice.retencionGanancias || "",
        retencionIva: editingInvoice.retencionIva || "",
        retencionSuss: editingInvoice.retencionSuss || "",
        retencionMunicipal: editingInvoice.retencionMunicipal || "",
        impuestosInternos: editingInvoice.impuestosInternos || "",
        ley25413: editingInvoice.ley25413 || "",
        cuentaContableId: editingInvoice.cuentaContableId ? String(editingInvoice.cuentaContableId) : "",
        observaciones: editingInvoice.observaciones || "",
        subtipoRetencion: editingInvoice.subtipoRetencion || "",
      });
      setNetoLines(linesFromInvoice(editingInvoice));
      setAutomaticNetos(false);
      setStep(1);
    } else if (open && !editingInvoice) {
      setForm(newForm());
      setNetoLines([emptyNetoLine()]);
      setAutomaticNetos(true);
      setStep(0);
    }
  }, [open, editingInvoice, initialTipo]);

  const { data: itemCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/categories"],
    enabled: open,
  });

  const { data: invWarehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/warehouses"],
    enabled: open,
  });

  const defaultWarehouseId = useMemo(() => {
    const general = (invWarehouses as any[]).find((w: any) => String(w.name || "").trim().toLowerCase() === "depósito general" || String(w.name || "").trim().toLowerCase() === "deposito general");
    return general ? String(general.id) : "";
  }, [invWarehouses]);

  const addInvRow = () => setInvItems((p) => [...p, { existingItemId: "", quantity: "1", unit: "unidad", costPrice: "0", warehouseId: defaultWarehouseId, vatRate: "" }]);

  // Un Remito solo existe para sumar artículos al inventario (sin
  // impuestos/total) — a diferencia de una Factura, donde no tener artículos
  // es válido (servicio sin movimiento de stock), acá arrancar sin ningún
  // renglón para completar no tiene sentido. Mismo criterio que ya usa
  // TransferForm (Transferencia entre Depósitos).
  useEffect(() => {
    if (!open || editingInvoice || initialTipo !== "REMITO") return;
    setInvItems((current) => current.length > 0 ? current : [
      { existingItemId: "", quantity: "1", unit: "unidad", costPrice: "0", warehouseId: defaultWarehouseId, vatRate: "" },
    ]);
  }, [open, editingInvoice, initialTipo, defaultWarehouseId]);
  const removeInvRow = (i: number) => setInvItems((p) => p.filter((_, j) => j !== i));
  const updateInvRow = (i: number, field: keyof InvItemRow, val: string) =>
    setInvItems((p) => p.map((r, j) => j === i ? { ...r, [field]: val } : r));

  const { data: existingInvItems = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/items"],
    enabled: open && (unifiedLayout || step === 4),
  });

  const selectExistingInvItem = (i: number, id: string) => {
    const selected = (existingInvItems as any[]).find((it: any) => String(it.id) === id);
    setInvItems((p) => p.map((r, j) => j === i ? {
      ...r,
      existingItemId: id,
      vatRate: r.vatRate || (selected?.ivaRate ? String(selected.ivaRate) : r.vatRate),
    } : r));
  };

  const canSuggestArticles = !isEditing && ["FACT-A", "FACT-B", "FACT-M", "FACT-C"].includes(form.tipoComprobante);
  const completedArticles = invItems.filter(row => row.existingItemId && Number(row.quantity) > 0 && Number(row.costPrice) >= 0);
  const vatSelectionComplete = ["FACT-B", "FACT-C"].includes(form.tipoComprobante) || completedArticles.every(row => row.vatRate);
  const articleSuggestion = useMemo(() => suggestPurchaseAmountsFromArticles(
    completedArticles.map(row => ({ quantity: row.quantity, unitPrice: row.costPrice, vatRate: row.vatRate })),
    form.tipoComprobante,
  ), [invItems, form.tipoComprobante]);

  useEffect(() => {
    if (!canSuggestArticles || !automaticNetos || !completedArticles.length || !vatSelectionComplete) return;
    setNetoLines(articleSuggestion.lines);
    setForm(previous => ({ ...previous, ...articleSuggestion.fields }));
  }, [articleSuggestion, automaticNetos, canSuggestArticles, vatSelectionComplete]);

  const restoreArticleSuggestion = () => {
    setAutomaticNetos(true);
    setNetoLines(articleSuggestion.lines);
    setForm(previous => ({ ...previous, ...articleSuggestion.fields }));
  };

  const handleSupplierChange = (id: string) => {
    const s = suppliers.find((x) => String(x.id) === id);
    if (s) {
      f("supplierId", id);
      f("proveedorNombre", s.razonSocial);
      f("proveedorCuit", s.cuit);
      if (!initialTipo) {
        f("tipoComprobante", sugerirTipoPorCondicionIva(form.tipoComprobante, s.condicionIva));
      }
      if (s.alicuotaIibb) f("alicuotaIibbProveedor", String(s.alicuotaIibb));
      if (!isReceivedRetention(form.tipoComprobante) && s.cuentaContableId) {
        f("cuentaContableId", String(s.cuentaContableId));
      }
    } else {
      setForm((p) => ({ ...p, supplierId: "", proveedorNombre: "", proveedorCuit: "" }));
    }
  };

  // Si todavía no hay Cuenta Contable de Gasto asignada, la sugiere a partir
  // de la categoría de los artículos cargados (cuando todos comparten una
  // misma cuenta configurada en su categoría). No pisa un valor ya elegido
  // (por proveedor o elegido en el formulario).
  useEffect(() => {
    if (isReceivedRetention(form.tipoComprobante) || form.cuentaContableId) return;
    const resolvedAccountIds = new Set<string>();
    for (const row of invItems) {
      const categoryId = existingInvItems.find((it: any) => String(it.id) === row.existingItemId)?.categoryId;
      if (!categoryId) continue;
      const accountId = itemCategories.find((c: any) => c.id === categoryId)?.accountId;
      if (accountId) resolvedAccountIds.add(String(accountId));
    }
    if (resolvedAccountIds.size === 1) {
      f("cuentaContableId", [...resolvedAccountIds][0]);
    }
  }, [invItems, itemCategories, existingInvItems, form.tipoComprobante, form.cuentaContableId]);

  const total = useMemo(() => {
    return calculatePurchaseInvoiceTotal(form);
  }, [form]);

  // Se puede combinar más de una forma de pago real al cargar el comprobante
  // (ej. parte efectivo, parte transferencia), igual que en Ventas — antes
  // solo admitía una. formaPagoInmediata/montoPagadoAhora son la primera
  // fila; formasPagoExtra son las que se van agregando. Compartido entre el
  // layout unificado (Centro de Comprobantes) y el asistente clásico.
  const montoPagadoAhoraTotal = $n(form.montoPagadoAhora) + form.formasPagoExtra.reduce((s, r) => s + $n(r.monto), 0);
  const formaPagoInmediataSection = (
    <div>
      <Label>Forma de Pago</Label>
      <Select
        value={form.formaPagoInmediata}
        onValueChange={(v) => setForm((p) => ({
          ...p,
          formaPagoInmediata: v,
          montoPagadoAhora: v === "cuenta_corriente" ? "" : (p.montoPagadoAhora || total.toFixed(2)),
          formasPagoExtra: v === "cuenta_corriente" ? [] : p.formasPagoExtra,
        }))}
      >
        <SelectTrigger data-testid="select-forma-pago-inmediata"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
          {FORMAS_PAGO.map((fp) => <SelectItem key={fp.value} value={fp.value}>{fp.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {form.formaPagoInmediata !== "cuenta_corriente" && (
        <>
          <div className="mt-2">
            <Label>Monto a pagar ahora ($)</Label>
            <Input
              type="number" min="0" step="0.01" max={total}
              value={form.montoPagadoAhora}
              onChange={(e) => f("montoPagadoAhora", e.target.value)}
              data-testid="input-monto-pagado-ahora"
            />
          </div>
          {form.formasPagoExtra.map((row, i) => (
            <div key={i} className="flex gap-2 items-end mt-2">
              <div className="flex-1">
                <Label>Otra forma de pago</Label>
                <Select
                  value={row.formaPago}
                  onValueChange={(v) => setForm((p) => {
                    const extra = [...p.formasPagoExtra];
                    extra[i] = { ...extra[i], formaPago: v };
                    return { ...p, formasPagoExtra: extra };
                  })}
                >
                  <SelectTrigger data-testid={`select-forma-pago-extra-${i}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMAS_PAGO.map((fp) => <SelectItem key={fp.value} value={fp.value}>{fp.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label>Monto ($)</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={row.monto}
                  onChange={(e) => setForm((p) => {
                    const extra = [...p.formasPagoExtra];
                    extra[i] = { ...extra[i], monto: e.target.value };
                    return { ...p, formasPagoExtra: extra };
                  })}
                  data-testid={`input-monto-pagado-extra-${i}`}
                />
              </div>
              <Button
                type="button" variant="ghost" size="icon" className="text-destructive"
                onClick={() => setForm((p) => ({ ...p, formasPagoExtra: p.formasPagoExtra.filter((_, idx) => idx !== i) }))}
                data-testid={`button-remove-forma-pago-extra-${i}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button" variant="ghost" size="sm" className="mt-2 px-0"
            onClick={() => setForm((p) => ({ ...p, formasPagoExtra: [...p.formasPagoExtra, { formaPago: "transferencia", monto: "" }] }))}
            data-testid="button-add-forma-pago-extra"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar otra forma de pago
          </Button>
        </>
      )}
      <p className="text-xs text-muted-foreground mt-1">
        {form.formaPagoInmediata === "cuenta_corriente"
          ? "El pago se registra desde la cuenta corriente del proveedor."
          : montoPagadoAhoraTotal < total - 0.005
            ? `Se genera la OP por $${fmt(montoPagadoAhoraTotal)} y el resto ($${fmt(total - montoPagadoAhoraTotal)}) queda pendiente en cuenta corriente.`
            : "Se genera la Orden de Pago automáticamente y el comprobante queda registrado como pagado."}
      </p>
    </div>
  );

  const articleAmountComparison = canSuggestArticles && completedArticles.length > 0 && vatSelectionComplete && (
    <div className={`rounded-md border p-3 text-xs ${Math.abs(total - articleSuggestion.articleTotal) > 0.01 ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-green-300 bg-green-50 dark:bg-green-950/20"}`} data-testid="article-amount-comparison">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Artículos: ${fmt(articleSuggestion.articleTotal)} · Total comprobante: ${fmt(total)}</span>
        {!automaticNetos && <Button type="button" size="sm" variant="outline" onClick={restoreArticleSuggestion}>Volver a sugerir desde artículos</Button>}
      </div>
      {Math.abs(total - articleSuggestion.articleTotal) > 0.01 && <p className="mt-1">Diferencia: ${fmt(total - articleSuggestion.articleTotal)}. Revisá artículos, servicios, percepciones o ajustes manuales antes de guardar.</p>}
      {automaticNetos && <p className="mt-1 text-muted-foreground">Importes sugeridos desde artículos; podés corregirlos manualmente.</p>}
    </div>
  );

  const resetDialog = () => { onClose(); setForm(newForm()); setStep(0); setInvItems([]); setNetoLines([emptyNetoLine()]); setAutomaticNetos(true); };

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/purchase-invoices", {
        ...data,
        // Un renglón sin artículo elegido (p. ej. el que arranca precargado
        // en Remito) no se manda — el servidor rechaza cualquier fila sin
        // itemId (parsePurchaseStockRows).
        stockItems: invItems.filter((row) => row.existingItemId).map((row) => ({
          itemId: row.existingItemId,
          warehouseId: row.warehouseId || null,
          quantity: row.quantity,
          unitCost: row.costPrice,
          vatRate: row.vatRate || null,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      if (invItems.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
        queryClient.invalidateQueries({ queryKey: ["/api/inventory/movements"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers"] });
      resetDialog();
      const desc = invItems.length > 0
        ? `Se ingresaron ${invItems.length} artículo(s) al inventario con el comprobante.`
        : "El comprobante fue registrado correctamente.";
      toast({ title: "Comprobante registrado", description: desc });
    },
    onError: (e: any) => {
      // apiRequest throws "STATUS: {json body}" — extract JSON to get the server message
      const raw = e.message || "";
      const jsonStart = raw.indexOf("{");
      let description = raw;
      if (jsonStart >= 0) {
        try { description = JSON.parse(raw.substring(jsonStart)).error || raw; } catch {}
      }
      const isDuplicate = raw.startsWith("409");
      toast({
        title: isDuplicate ? "Comprobante duplicado" : "Error al registrar comprobante",
        description,
        variant: "destructive",
        duration: isDuplicate ? 8000 : 5000,
      });
    },
  });

  const patchMut = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/purchase-invoices/${editingInvoice!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      resetDialog();
      toast({ title: "Comprobante actualizado correctamente" });
    },
    onError: (e: any) => toast({ title: "Error al actualizar", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (form.tipoComprobante === "RETENCION" && !form.subtipoRetencion) {
      toast({ title: "Seleccioná el tipo de retención recibida", variant: "destructive" });
      setStep(0);
      return;
    }
    if (!isValidPurchaseInvoiceTotal(form.tipoComprobante, total)) {
      toast({ title: "El total del comprobante debe ser mayor a $0,00", variant: "destructive" });
      return;
    }
    if (isEditing) {
      patchMut.mutate({ ...form, cuentaContableId: form.cuentaContableId ? parseInt(form.cuentaContableId) : null });
      return;
    }
    if (!form.numeroComprobante) {
      toast({ title: "Ingrese el número de comprobante", variant: "destructive" });
      return;
    }
    if (!suppliers.some((supplier) => String(supplier.id) === form.supplierId)) {
      toast({ title: "Elegí un proveedor cargado en el ABM", variant: "destructive" });
      return;
    }
    if (canSuggestArticles && completedArticles.length > 0 && !vatSelectionComplete) {
      toast({ title: "Elegí la alícuota de IVA de cada artículo", variant: "destructive" });
      return;
    }
    if (form.formaPagoInmediata !== "cuenta_corriente") {
      if (!form.montoPagadoAhora || $n(form.montoPagadoAhora) <= 0) {
        toast({ title: "El monto a pagar ahora debe ser mayor a $0,00 y no superar el total del comprobante", variant: "destructive" });
        return;
      }
      if (form.formasPagoExtra.some((r) => $n(r.monto) <= 0)) {
        toast({ title: "Cada forma de pago agregada necesita un monto mayor a $0,00", variant: "destructive" });
        return;
      }
      if (montoPagadoAhoraTotal > total + 0.005) {
        toast({ title: "El monto a pagar ahora debe ser mayor a $0,00 y no superar el total del comprobante", variant: "destructive" });
        return;
      }
    }
    // Nota: no se valida que la suma de artículos coincida con el neto —
    // los precios de costo en inventario pueden diferir del total facturado
    // (descuentos exclusivos, artículos sin cargo, etc.).
    createMut.mutate({
      ...form,
      supplierId: form.supplierId ? parseInt(form.supplierId) : null,
      cuentaContableId: form.cuentaContableId ? parseInt(form.cuentaContableId) : null,
      formasPago: form.formaPagoInmediata !== "cuenta_corriente"
        ? [{ formaPago: form.formaPagoInmediata, monto: form.montoPagadoAhora }, ...form.formasPagoExtra]
        : [],
    });
  };

  const steps = isEditing
    ? ["Encabezado", "Montos", "Retenciones", "Clasificación"]
    : ["Encabezado", "Montos", "Retenciones", "Clasificación", "Inventario"];
  const isResumen = form.tipoComprobante === "RESUMEN-BANCO" || form.tipoComprobante === "LIQ-TARJETA";
  const isLiquidacionTarjeta = isCardSettlement(form.tipoComprobante);
  const hasHistoricalRetentions = isEditing && !isLiquidacionTarjeta && !isReceivedRetention(form.tipoComprobante) &&
    [form.retencionIibb, form.retencionGanancias, form.retencionIva, form.retencionSuss, form.retencionMunicipal]
      .some((value) => Number(value) !== 0);
  const historicalRetentionsNote = hasHistoricalRetentions && (
    <p className="text-xs text-muted-foreground" data-testid="historical-purchase-retentions">
      Este comprobante conserva retenciones cargadas anteriormente por ${fmt(
        $n(form.retencionIibb) + $n(form.retencionGanancias) + $n(form.retencionIva) +
        $n(form.retencionSuss) + $n(form.retencionMunicipal)
      )}. Siguen descontándose del total; consultá el detalle antes de modificarlo.
    </p>
  );
  const isNC = form.tipoComprobante.startsWith("NC");
  const isRetencion = form.tipoComprobante === "RETENCION";
  const isFacturaC = ["FACT-C", "NC-C", "ND-C", "RECIBO-C"].includes(form.tipoComprobante);
  // Remito: solo existe en el layout unificado — llega mercadería sin datos de
  // facturación (sin proveedor con CAE, sin IVA/totales), solo se registran
  // los datos del emisor y los artículos recibidos.
  const isRemito = form.tipoComprobante === "REMITO";
  const isSupplierPayable = isSupplierPayableDocument(form.tipoComprobante);
  // Factura C y Retención Recibida comparten el mismo paso de Montos simplificado:
  // un único importe que ES el total, sin desglose de IVA.
  const isImporteUnico = isFacturaC || isRetencion || (form.tipoComprobante === "FACT-B" && !isEditing);

  useEffect(() => {
    if (!isRetencion) return;
    const code = receivedRetentionAccountCode(form.subtipoRetencion);
    const account = code ? accounts.find((candidate) => candidate.codigo === code) : null;
    const nextId = account ? String(account.id) : "";
    setForm((current) => current.cuentaContableId === nextId
      ? current
      : { ...current, cuentaContableId: nextId });
  }, [isRetencion, form.subtipoRetencion, accounts]);

  return (
    <>
    <InvoiceFormShell
      embedded={embedded}
      open={open}
      onOpenChange={(v) => { if (!v) resetDialog(); }}
      title={isEditing ? `Editar Comprobante — ${editingInvoice?.numeroComprobanteExt || editingInvoice?.numeroComprobante}` : "Registrar Comprobante"}
      headerExtra={
        unifiedLayout ? undefined : (
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
        )
      }
    >
        <div className="py-2 space-y-4">
          {unifiedLayout ? (
          <>
          <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de Comprobante</Label>
                  <Select value={form.tipoComprobante} disabled={isEditing || !!initialTipo} onValueChange={(v) => {
                    // Factura C / Retención Recibida: sin IVA, forzar alícuota 0 y limpiar campos IVA
                    if (v === "FACT-C" || v === "NC-C" || v === "ND-C" || v === "RECIBO-C" || v === "RETENCION") {
                      setForm((p) => ({
                        ...p,
                        ...clearCardRetentions(p, v),
                        tipoComprobante: v,
                        alicuotaIva: "0",
                        cuentaContableId: v === "RETENCION" ? "" : p.cuentaContableId,
                        subtipoRetencion: v === "RETENCION" ? p.subtipoRetencion : "",
                        ...ALL_IVA_FIELDS,
                      }));
                    } else if (v === "REMITO") {
                      // Remito: no lleva impuestos ni totales — limpiar cualquier importe
                      // cargado antes de cambiar de tipo para no enviarlo oculto.
                      setForm((p) => ({
                        ...p,
                        tipoComprobante: v,
                        montoNeto: "",
                        montoExento: "",
                        montoNoGravado: "",
                        impuestosInternos: "",
                        ley25413: "",
                        percepcionIibb: "",
                        percepcionIva: "",
                        percepcionGanancias: "",
                        retencionIibb: "",
                        retencionGanancias: "",
                        retencionIva: "",
                        retencionSuss: "",
                        retencionMunicipal: "",
                        subtipoRetencion: "",
                        ...ALL_IVA_FIELDS,
                      }));
                      setNetoLines([emptyNetoLine()]);
                      // Un Remito solo existe para sumar artículos al inventario — a
                      // diferencia de una Factura, arrancar sin ningún renglón para
                      // completar no tiene sentido acá.
                      setInvItems((current) => current.length > 0 ? current : [
                        { existingItemId: "", quantity: "1", unit: "unidad", costPrice: "0", warehouseId: defaultWarehouseId, vatRate: "" },
                      ]);
                    } else {
                      setForm((p) => ({ ...p, ...clearCardRetentions(p, v), tipoComprobante: v }));
                    }
                  }}>
                    <SelectTrigger data-testid="select-tipo-comprobante">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_UNIFIED.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {isSupplierPayable ? (
                  isEditing || form.tipoComprobante.startsWith("NC") ? (
                    <div className="text-sm text-muted-foreground" data-testid="supplier-payment-notice">
                      El pago se registra desde la cuenta corriente del proveedor.
                    </div>
                  ) : formaPagoInmediataSection
                ) : (
                  <div>
                    <Label>Condición de Pago</Label>
                    <Select value={form.condicionPago} onValueChange={(v) => f("condicionPago", v)}>
                      <SelectTrigger data-testid="select-condicion-pago"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contado">Contado</SelectItem>
                        <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
          </div>
              {isRetencion && (
                <div>
                  <Label>Tipo de Retención</Label>
                  <Select value={form.subtipoRetencion || undefined} onValueChange={(v) => f("subtipoRetencion", v)}>
                    <SelectTrigger data-testid="select-subtipo-retencion">
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="municipal">Municipal</SelectItem>
                      <SelectItem value="iibb">Ingresos Brutos (IIBB)</SelectItem>
                      <SelectItem value="ganancias">Ganancias</SelectItem>
                      <SelectItem value="iva">IVA</SelectItem>
                      <SelectItem value="suss">SUSS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Datos del emisor</Label>
            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Proveedor</Label>
                <p className="text-xs text-muted-foreground">¿No aparece? <Link href="/accounting-suppliers" className="text-primary underline">Cargar proveedor en el ABM</Link></p>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="Buscar proveedor..."
                        value={supplierDropdownOpen
                          ? supplierSearch
                          : form.supplierId
                          ? suppliers.find((s) => String(s.id) === form.supplierId)?.razonSocial || ""
                          : ""}
                        onChange={(e) => { cancelSupplierBlur(); setSupplierSearch(e.target.value); setSupplierDropdownOpen(true); }}
                        onFocus={() => { cancelSupplierBlur(); setSupplierSearch(""); setSupplierDropdownOpen(true); }}
                        onClick={() => { cancelSupplierBlur(); if (!supplierDropdownOpen) { setSupplierSearch(""); setSupplierDropdownOpen(true); } }}
                        onBlur={() => { supplierBlurTimer.current = setTimeout(() => setSupplierDropdownOpen(false), 150); }}
                        data-testid="select-supplier"
                        autoComplete="off"
                      />
                      {supplierDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-md border bg-popover shadow-md">
                          {[...suppliers]
                            .filter((s) => !supplierSearch || s.razonSocial.toLowerCase().includes(supplierSearch.toLowerCase()) || s.cuit.includes(supplierSearch))
                            .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, "es"))
                            .slice(0, 60)
                            .map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                                onMouseDown={() => { cancelSupplierBlur(); handleSupplierChange(String(s.id)); setSupplierSearch(""); setSupplierDropdownOpen(false); }}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Check className={`h-4 w-4 shrink-0 ${form.supplierId === String(s.id) ? "opacity-100" : "opacity-0"}`} />
                                  <span className="truncate">{s.razonSocial}</span>
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0">{s.cuit}</span>
                              </div>
                            ))}
                          {suppliers.filter((s) => !supplierSearch || s.razonSocial.toLowerCase().includes(supplierSearch.toLowerCase()) || s.cuit.includes(supplierSearch)).length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Razón Social</Label>
                  <Input value={form.proveedorNombre} readOnly data-testid="input-proveedor-nombre" />
                </div>
                <div>
                  <Label>CUIT</Label>
                  <Input value={form.proveedorCuit} readOnly data-testid="input-proveedor-cuit" />
                </div>
                <div>
                  <Label>Punto de Venta</Label>
                  <Input type="number" value={form.puntoVenta} onChange={(e) => { const v = e.target.value; if (v === "" || (parseInt(v) >= 1 && parseInt(v) <= 99999)) f("puntoVenta", v); }} placeholder="00001" min="1" max="99999" data-testid="input-punto-venta" />
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
                <div className="col-span-2">
                  <Label>{isRetencion ? "Cuenta Contable de Activo" : "Cuenta Contable de Gasto"}</Label>
                  <Select
                    value={form.cuentaContableId || "__none__"}
                    disabled={isRetencion}
                    onValueChange={(v) => f("cuentaContableId", v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger data-testid="select-cuenta-contable">
                      <SelectValue placeholder="Seleccionar cuenta..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Sin clasificar —</SelectItem>
                      {accounts
                        .filter((a) => a.id && (
                          isRetencion
                            ? a.tipo === "activo" && a.codigo.startsWith("1.1.")
                            : a.tipo === "egreso"
                        ))
                        .map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.codigo} — {a.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isRetencion
                      ? "Se asigna automáticamente según el tipo de retención y nunca se registra como gasto."
                      : 'Esta es la cuenta que determina el departamento en el reporte "Costos por Departamento". Se sugiere sola según la categoría de los artículos cargados.'}
                  </p>
                </div>
            </div>
          </div>

          <Separator />

          {!isEditing && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Artículos</Label>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30">
                <Package className="h-4 w-4 shrink-0" />
                <span>Si recibiste mercadería, elegí artículos del Inventario para registrar su ingreso. Los servicios se cargan en Importes e impuestos, sin movimiento de stock.</span>
              </div>

              {invItems.length > 0 && (
                <div className="space-y-3">
                  {invItems.map((row, i) => (
                    <div key={i} data-testid={`row-inv-item-${i}`} className="border rounded-lg p-3 space-y-3 bg-muted/20">
                      <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeInvRow(i)} data-testid={`btn-remove-inv-${i}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Article selector / name */}
                      <PurchaseInventoryPicker items={existingInvItems} selectedId={row.existingItemId} open={!!existingItemOpen[i]} onOpenChange={(v) => setExistingItemOpen(p => ({ ...p, [i]: v }))} onSelect={(id) => { selectExistingInvItem(i, id); setExistingItemOpen(p => ({ ...p, [i]: false })); }} index={i} />
                      {row.existingItemId && <p className="text-xs text-muted-foreground">SKU: {(existingInvItems.find((it: any) => String(it.id) === row.existingItemId) as any)?.sku || "Sin código"}</p>}

                      {/* Quantity, unit, cost */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs mb-1 block">Cantidad</Label>
                          <Input type="number" min="0" step="0.001" value={row.quantity} onChange={(e) => updateInvRow(i, "quantity", e.target.value)} className="h-8 text-sm" data-testid={`input-inv-qty-${i}`} />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">Unidad</Label>
                          <Select value={row.unit} onValueChange={(v) => updateInvRow(i, "unit", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">{form.tipoComprobante === "FACT-B" ? "Precio final unit. ($)" : "Costo unit. neto ($)"}</Label>
                          <Input type="number" min="0" step="0.01" value={row.costPrice} onChange={(e) => updateInvRow(i, "costPrice", e.target.value)} className="h-8 text-sm" data-testid={`input-inv-cost-${i}`} />
                        </div>
                      </div>

                      {canSuggestArticles && form.tipoComprobante !== "FACT-C" && (
                        <div>
                          <Label className="text-xs mb-1 block">IVA del artículo {form.tipoComprobante === "FACT-B" ? "(informativo; precio final)" : ""}</Label>
                          <Select value={row.vatRate || undefined} onValueChange={value => updateInvRow(i, "vatRate", value)}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-inv-vat-${i}`}><SelectValue placeholder="Elegir alícuota" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="2.5">2,5%</SelectItem><SelectItem value="5">5%</SelectItem>
                              <SelectItem value="10.5">10,5%</SelectItem><SelectItem value="21">21%</SelectItem>
                              <SelectItem value="27">27%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <p className="text-sm text-right">Subtotal: <strong>${fmt((Number(row.quantity) || 0) * (Number(row.costPrice) || 0))}</strong></p>

                      {/* Warehouse selector */}
                      {invWarehouses.length > 0 && (
                        <div>
                          <Label className="text-xs mb-1 block">Depósito destino</Label>
                          <Select value={row.warehouseId || "__none__"} onValueChange={(v) => updateInvRow(i, "warehouseId", v === "__none__" ? "" : v)}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-inv-warehouse-${i}`}><SelectValue placeholder="Sin depósito (stock general)" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Sin depósito —</SelectItem>
                              {(invWarehouses as any[]).filter((w: any) => w.id).map((wh: any) => (
                                <SelectItem key={wh.id} value={String(wh.id)}>{wh.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <Button type="button" variant="outline" size="sm" onClick={addInvRow} data-testid="btn-add-inv-item">
                <Plus className="h-4 w-4 mr-2" />Agregar artículo
              </Button>

              {articleAmountComparison}

              {invItems.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Sin artículos — el comprobante se registrará sin modificar el inventario.
                </p>
              )}
            </div>
            </div>
          )}

          {isRemito && (
            <p className="text-xs text-muted-foreground text-center py-2" data-testid="text-remito-sin-impuestos">
              Remito — no lleva impuestos ni total, solo suma los artículos al inventario.
            </p>
          )}

          {!isRemito && (
          <>
          <Separator />

          <div className="space-y-4">
            <Label className="text-sm font-semibold">Impuestos y totales</Label>
              {/* ── Netos gravados — multi-línea ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {isImporteUnico ? "Importe" : "Netos Gravados"}
                    {isResumen && !isImporteUnico && <span className="ml-1 text-xs font-normal text-muted-foreground">(base para IVA)</span>}
                  </Label>
                  {!isImporteUnico && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={addNetoLine}
                      data-testid="btn-add-neto-line"
                    >
                      <Plus className="h-3 w-3" /> Agregar línea
                    </Button>
                  )}
                </div>

                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">{isImporteUnico ? "Importe total $" : "Neto gravado $"}</th>
                        {!isImporteUnico && <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-2/5">Alícuota IVA</th>}
                        {!isImporteUnico && <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">IVA calculado $</th>}
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {netoLines.map((line, i) => {
                        const n = parseFloat(line.neto) || 0;
                        const entry = IVA_MAP[line.alicuota];
                        const ivaCalc = !isImporteUnico && entry && n > 0 ? n * entry.rate / 100 : 0;
                        return (
                          <tr key={i} className="bg-background">
                            <td className="px-2 py-1.5">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={line.neto}
                                onChange={e => updateNetoLine(i, "neto", e.target.value)}
                                className="h-8 text-sm"
                                data-testid={`input-neto-line-${i}`}
                              />
                            </td>
                            {!isImporteUnico && (
                              <td className="px-2 py-1.5">
                                <Select
                                  value={line.alicuota}
                                  onValueChange={v => updateNetoLine(i, "alicuota", v)}
                                >
                                  <SelectTrigger className="h-8 text-sm" data-testid={`select-alicuota-line-${i}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="5">5%</SelectItem>
                                    <SelectItem value="10.5">10.5%</SelectItem>
                                    <SelectItem value="21">21%</SelectItem>
                                    <SelectItem value="25">2.5%</SelectItem>
                                    <SelectItem value="27">27%</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                            )}
                            {!isImporteUnico && (
                              <td className="px-3 py-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap">
                                {ivaCalc > 0 ? `$${fmt(ivaCalc)}` : "—"}
                              </td>
                            )}
                            <td className="px-1 py-1.5 text-center">
                              {netoLines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeNetoLine(i)}
                                  className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 mx-auto"
                                  data-testid={`btn-remove-neto-line-${i}`}
                                  title="Quitar línea"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t bg-muted/30">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground">
                          {isImporteUnico ? "Total:" : "Total neto:"} <span className="font-bold text-foreground font-mono">${fmt(form.montoNeto || "0")}</span>
                        </td>
                        {!isImporteUnico && (
                          <td className="px-3 py-2 text-xs text-right text-muted-foreground">
                            Total IVA: <span className="font-bold text-foreground font-mono">
                              ${fmt($n(form.montoIva5) + $n(form.montoIva25) + $n(form.montoIva105) + $n(form.montoIva21) + $n(form.montoIva27))}
                            </span>
                          </td>
                        )}
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* IVA desagregado — solo se muestra si hay importes */}
                {($n(form.montoIva21) > 0 || $n(form.montoIva105) > 0 || $n(form.montoIva27) > 0 || $n(form.montoIva5) > 0 || $n(form.montoIva25) > 0) && (
                  <div className="rounded-md bg-blue-50 border border-blue-100 dark:bg-blue-950/20 dark:border-blue-900 px-3 py-2 space-y-1">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400">IVA desagregado por alícuota</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                      {$n(form.montoIva21)  > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IVA 21%</span><span className="font-mono font-medium">${fmt(form.montoIva21)}</span></div>}
                      {$n(form.montoIva105) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IVA 10.5%</span><span className="font-mono font-medium">${fmt(form.montoIva105)}</span></div>}
                      {$n(form.montoIva27)  > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IVA 27%</span><span className="font-mono font-medium">${fmt(form.montoIva27)}</span></div>}
                      {$n(form.montoIva5)   > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IVA 5%</span><span className="font-mono font-medium">${fmt(form.montoIva5)}</span></div>}
                      {$n(form.montoIva25)  > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IVA 2.5%</span><span className="font-mono font-medium">${fmt(form.montoIva25)}</span></div>}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Otros conceptos ── */}
              {!isRetencion && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Exento</Label><Input type="number" step="0.01" value={form.montoExento} onChange={(e) => f("montoExento", e.target.value)} data-testid="input-exento" /></div>
                  <div><Label>No Gravado</Label><Input type="number" step="0.01" value={form.montoNoGravado} onChange={(e) => f("montoNoGravado", e.target.value)} data-testid="input-no-gravado" /></div>
                  <div><Label>Imp. Internos</Label><Input type="number" step="0.01" value={form.impuestosInternos} onChange={(e) => f("impuestosInternos", e.target.value)} data-testid="input-imp-internos" /></div>
                  <div><Label>Ley 25.413</Label><Input type="number" step="0.01" value={form.ley25413} onChange={(e) => f("ley25413", e.target.value)} data-testid="input-ley25413" /></div>
                </div>
              )}
              {isRetencion ? (
                <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Una retención recibida ya representa el crédito fiscal final. No lleva percepciones ni retenciones adicionales.
                </div>
              ) : (
                <>
              <p className="text-sm font-semibold text-muted-foreground">Percepciones (DEBE)</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Percep. IIBB</Label><Input type="number" step="0.01" value={form.percepcionIibb} onChange={(e) => f("percepcionIibb", e.target.value)} data-testid="input-percep-iibb" /></div>
                <div><Label>Percep. IVA</Label><Input type="number" step="0.01" value={form.percepcionIva} onChange={(e) => f("percepcionIva", e.target.value)} data-testid="input-percep-iva" /></div>
                <div><Label>Percep. Ganancias</Label><Input type="number" step="0.01" value={form.percepcionGanancias} onChange={(e) => f("percepcionGanancias", e.target.value)} data-testid="input-percep-ganancias" /></div>
              </div>
              {isLiquidacionTarjeta && (
              <>
              <Separator />
              <p className="text-sm font-semibold text-muted-foreground">Retenciones sufridas (DEBE — suman al total)</p>
                <p className="text-xs text-muted-foreground">
                  Son retenciones realizadas a Maran por la tarjeta; se consideran importes a favor y no reducen este comprobante.
                </p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Ret. IIBB</Label><Input type="number" step="0.01" value={form.retencionIibb} onChange={(e) => f("retencionIibb", e.target.value)} data-testid="input-ret-iibb" /></div>
                <div><Label>Ret. Ganancias</Label><Input type="number" step="0.01" value={form.retencionGanancias} onChange={(e) => f("retencionGanancias", e.target.value)} data-testid="input-ret-ganancias" /></div>
                <div><Label>Ret. IVA</Label><Input type="number" step="0.01" value={form.retencionIva} onChange={(e) => f("retencionIva", e.target.value)} data-testid="input-ret-iva" /></div>
                <div><Label>Ret. SUSS</Label><Input type="number" step="0.01" value={form.retencionSuss} onChange={(e) => f("retencionSuss", e.target.value)} data-testid="input-ret-suss" /></div>
                <div><Label>Ret. Municipal</Label><Input type="number" step="0.01" value={form.retencionMunicipal} onChange={(e) => f("retencionMunicipal", e.target.value)} data-testid="input-ret-municipal" /></div>
              </div>
              </>
              )}
              {historicalRetentionsNote}
                </>
              )}
                <div className="col-span-2">
                  <Label>Observaciones</Label>
                  <Textarea value={form.observaciones} onChange={(e) => f("observaciones", e.target.value)} rows={2} data-testid="input-observaciones" />
                </div>
              {/* Total preview */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total Comprobante</span>
                    <span className="text-2xl font-bold text-primary">${fmt(total)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {isSupplierPayable
                      ? (!isEditing && form.formaPagoInmediata !== "cuenta_corriente" && !form.tipoComprobante.startsWith("NC")
                        ? ($n(form.montoPagadoAhora) < total - 0.005
                          ? `Se paga $${fmt(form.montoPagadoAhora)} al guardar (${FORMAS_PAGO.find(fp => fp.value === form.formaPagoInmediata)?.label || form.formaPagoInmediata}); resto en cuenta corriente`
                          : `Se paga al guardar (${FORMAS_PAGO.find(fp => fp.value === form.formaPagoInmediata)?.label || form.formaPagoInmediata})`)
                        : "Pendiente de pago en cuenta corriente")
                      : `Condición: ${form.condicionPago === "contado" ? "Contado (pago inmediato)" : "Cuenta Corriente (queda pendiente)"}`}
                  </div>
                </CardContent>
              </Card>
          </div>
          </>
          )}
          </>
          ) : (
          <>
          {/* STEP 0: Encabezado */}
          {step === 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de Comprobante</Label>
                  <Select value={form.tipoComprobante} disabled={isEditing} onValueChange={(v) => {
                    // Factura C / Retención Recibida: sin IVA, forzar alícuota 0 y limpiar campos IVA
                    if (v === "FACT-C" || v === "NC-C" || v === "ND-C" || v === "RECIBO-C" || v === "RETENCION") {
                      setForm((p) => ({
                        ...p,
                        ...clearCardRetentions(p, v),
                        tipoComprobante: v,
                        alicuotaIva: "0",
                        cuentaContableId: v === "RETENCION" ? "" : p.cuentaContableId,
                        subtipoRetencion: v === "RETENCION" ? p.subtipoRetencion : "",
                        ...ALL_IVA_FIELDS,
                      }));
                    } else {
                      setForm((p) => ({ ...p, ...clearCardRetentions(p, v), tipoComprobante: v }));
                    }
                  }}>
                    <SelectTrigger data-testid="select-tipo-comprobante">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS.filter(t => isEditing || !["RESUMEN-BANCO", "RETENCION"].includes(t.value)).map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      {/* Un Remito solo se crea desde el Centro de Comprobantes (layout
                          unificado) — esta opción no se ofrece acá, solo se muestra si
                          se está editando uno ya existente para no dejar el select en blanco. */}
                      {isEditing && form.tipoComprobante === "REMITO" && (
                        <SelectItem value="REMITO">Remito</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {isSupplierPayable ? (
                  isEditing || form.tipoComprobante.startsWith("NC") ? (
                    <div className="text-sm text-muted-foreground" data-testid="supplier-payment-notice">
                      El pago se registra desde la cuenta corriente del proveedor.
                    </div>
                  ) : formaPagoInmediataSection
                ) : (
                  <div>
                    <Label>Condición de Pago</Label>
                    <Select value={form.condicionPago} onValueChange={(v) => f("condicionPago", v)}>
                      <SelectTrigger data-testid="select-condicion-pago"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contado">Contado</SelectItem>
                        <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="col-span-2">
                  <Label>Proveedor</Label>
                <p className="text-xs text-muted-foreground">¿No aparece? <Link href="/accounting-suppliers" className="text-primary underline">Cargar proveedor en el ABM</Link></p>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="Buscar proveedor..."
                        value={supplierDropdownOpen
                          ? supplierSearch
                          : form.supplierId
                          ? suppliers.find((s) => String(s.id) === form.supplierId)?.razonSocial || ""
                          : ""}
                        onChange={(e) => { cancelSupplierBlur(); setSupplierSearch(e.target.value); setSupplierDropdownOpen(true); }}
                        onFocus={() => { cancelSupplierBlur(); setSupplierSearch(""); setSupplierDropdownOpen(true); }}
                        onClick={() => { cancelSupplierBlur(); if (!supplierDropdownOpen) { setSupplierSearch(""); setSupplierDropdownOpen(true); } }}
                        onBlur={() => { supplierBlurTimer.current = setTimeout(() => setSupplierDropdownOpen(false), 150); }}
                        data-testid="select-supplier"
                        autoComplete="off"
                      />
                      {supplierDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-md border bg-popover shadow-md">
                          {[...suppliers]
                            .filter((s) => !supplierSearch || s.razonSocial.toLowerCase().includes(supplierSearch.toLowerCase()) || s.cuit.includes(supplierSearch))
                            .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, "es"))
                            .slice(0, 60)
                            .map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                                onMouseDown={() => { cancelSupplierBlur(); handleSupplierChange(String(s.id)); setSupplierSearch(""); setSupplierDropdownOpen(false); }}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Check className={`h-4 w-4 shrink-0 ${form.supplierId === String(s.id) ? "opacity-100" : "opacity-0"}`} />
                                  <span className="truncate">{s.razonSocial}</span>
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0">{s.cuit}</span>
                              </div>
                            ))}
                          {suppliers.filter((s) => !supplierSearch || s.razonSocial.toLowerCase().includes(supplierSearch.toLowerCase()) || s.cuit.includes(supplierSearch)).length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Razón Social</Label>
                  <Input value={form.proveedorNombre} readOnly data-testid="input-proveedor-nombre" />
                </div>
                <div>
                  <Label>CUIT</Label>
                  <Input value={form.proveedorCuit} readOnly data-testid="input-proveedor-cuit" />
                </div>
                <div>
                  <Label>Punto de Venta</Label>
                  <Input type="number" value={form.puntoVenta} onChange={(e) => { const v = e.target.value; if (v === "" || (parseInt(v) >= 1 && parseInt(v) <= 99999)) f("puntoVenta", v); }} placeholder="00001" min="1" max="99999" data-testid="input-punto-venta" />
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
              {isRetencion && (
                <div>
                  <Label>Tipo de Retención</Label>
                  <Select value={form.subtipoRetencion || undefined} onValueChange={(v) => f("subtipoRetencion", v)}>
                    <SelectTrigger data-testid="select-subtipo-retencion">
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="municipal">Municipal</SelectItem>
                      <SelectItem value="iibb">Ingresos Brutos (IIBB)</SelectItem>
                      <SelectItem value="ganancias">Ganancias</SelectItem>
                      <SelectItem value="iva">IVA</SelectItem>
                      <SelectItem value="suss">SUSS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {/* STEP 1: Montos */}
          {step === 1 && (
            <>
              {/* ── Netos gravados — multi-línea ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {isImporteUnico ? "Importe" : "Netos Gravados"}
                    {isResumen && !isImporteUnico && <span className="ml-1 text-xs font-normal text-muted-foreground">(base para IVA)</span>}
                  </Label>
                  {!isImporteUnico && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={addNetoLine}
                      data-testid="btn-add-neto-line"
                    >
                      <Plus className="h-3 w-3" /> Agregar línea
                    </Button>
                  )}
                </div>

                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">{isImporteUnico ? "Importe total $" : "Neto gravado $"}</th>
                        {!isImporteUnico && <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-2/5">Alícuota IVA</th>}
                        {!isImporteUnico && <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">IVA calculado $</th>}
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {netoLines.map((line, i) => {
                        const n = parseFloat(line.neto) || 0;
                        const entry = IVA_MAP[line.alicuota];
                        const ivaCalc = !isImporteUnico && entry && n > 0 ? n * entry.rate / 100 : 0;
                        return (
                          <tr key={i} className="bg-background">
                            <td className="px-2 py-1.5">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={line.neto}
                                onChange={e => updateNetoLine(i, "neto", e.target.value)}
                                className="h-8 text-sm"
                                data-testid={`input-neto-line-${i}`}
                              />
                            </td>
                            {!isImporteUnico && (
                              <td className="px-2 py-1.5">
                                <Select
                                  value={line.alicuota}
                                  onValueChange={v => updateNetoLine(i, "alicuota", v)}
                                >
                                  <SelectTrigger className="h-8 text-sm" data-testid={`select-alicuota-line-${i}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="5">5%</SelectItem>
                                    <SelectItem value="10.5">10.5%</SelectItem>
                                    <SelectItem value="21">21%</SelectItem>
                                    <SelectItem value="25">2.5%</SelectItem>
                                    <SelectItem value="27">27%</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                            )}
                            {!isImporteUnico && (
                              <td className="px-3 py-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap">
                                {ivaCalc > 0 ? `$${fmt(ivaCalc)}` : "—"}
                              </td>
                            )}
                            <td className="px-1 py-1.5 text-center">
                              {netoLines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeNetoLine(i)}
                                  className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 mx-auto"
                                  data-testid={`btn-remove-neto-line-${i}`}
                                  title="Quitar línea"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t bg-muted/30">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground">
                          {isImporteUnico ? "Total:" : "Total neto:"} <span className="font-bold text-foreground font-mono">${fmt(form.montoNeto || "0")}</span>
                        </td>
                        {!isImporteUnico && (
                          <td className="px-3 py-2 text-xs text-right text-muted-foreground">
                            Total IVA: <span className="font-bold text-foreground font-mono">
                              ${fmt($n(form.montoIva5) + $n(form.montoIva25) + $n(form.montoIva105) + $n(form.montoIva21) + $n(form.montoIva27))}
                            </span>
                          </td>
                        )}
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* IVA desagregado — solo se muestra si hay importes */}
                {($n(form.montoIva21) > 0 || $n(form.montoIva105) > 0 || $n(form.montoIva27) > 0 || $n(form.montoIva5) > 0 || $n(form.montoIva25) > 0) && (
                  <div className="rounded-md bg-blue-50 border border-blue-100 dark:bg-blue-950/20 dark:border-blue-900 px-3 py-2 space-y-1">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400">IVA desagregado por alícuota</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                      {$n(form.montoIva21)  > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IVA 21%</span><span className="font-mono font-medium">${fmt(form.montoIva21)}</span></div>}
                      {$n(form.montoIva105) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IVA 10.5%</span><span className="font-mono font-medium">${fmt(form.montoIva105)}</span></div>}
                      {$n(form.montoIva27)  > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IVA 27%</span><span className="font-mono font-medium">${fmt(form.montoIva27)}</span></div>}
                      {$n(form.montoIva5)   > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IVA 5%</span><span className="font-mono font-medium">${fmt(form.montoIva5)}</span></div>}
                      {$n(form.montoIva25)  > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IVA 2.5%</span><span className="font-mono font-medium">${fmt(form.montoIva25)}</span></div>}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Otros conceptos ── */}
              {!isRetencion && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Exento</Label><Input type="number" step="0.01" value={form.montoExento} onChange={(e) => f("montoExento", e.target.value)} data-testid="input-exento" /></div>
                  <div><Label>No Gravado</Label><Input type="number" step="0.01" value={form.montoNoGravado} onChange={(e) => f("montoNoGravado", e.target.value)} data-testid="input-no-gravado" /></div>
                  <div><Label>Imp. Internos</Label><Input type="number" step="0.01" value={form.impuestosInternos} onChange={(e) => f("impuestosInternos", e.target.value)} data-testid="input-imp-internos" /></div>
                  <div><Label>Ley 25.413</Label><Input type="number" step="0.01" value={form.ley25413} onChange={(e) => f("ley25413", e.target.value)} data-testid="input-ley25413" /></div>
                </div>
              )}
            </>
          )}

          {/* STEP 2: Retenciones / Percepciones */}
          {step === 2 && (
            <>
              {isRetencion ? (
                <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Una retención recibida ya representa el crédito fiscal final. No lleva percepciones ni retenciones adicionales.
                </div>
              ) : (
                <>
              <p className="text-sm font-semibold text-muted-foreground">Percepciones (DEBE)</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Percep. IIBB</Label><Input type="number" step="0.01" value={form.percepcionIibb} onChange={(e) => f("percepcionIibb", e.target.value)} data-testid="input-percep-iibb" /></div>
                <div><Label>Percep. IVA</Label><Input type="number" step="0.01" value={form.percepcionIva} onChange={(e) => f("percepcionIva", e.target.value)} data-testid="input-percep-iva" /></div>
                <div><Label>Percep. Ganancias</Label><Input type="number" step="0.01" value={form.percepcionGanancias} onChange={(e) => f("percepcionGanancias", e.target.value)} data-testid="input-percep-ganancias" /></div>
              </div>
              {isLiquidacionTarjeta && (
              <>
              <Separator />
              <p className="text-sm font-semibold text-muted-foreground">Retenciones sufridas (DEBE — suman al total)</p>
                <p className="text-xs text-muted-foreground">
                  Son retenciones realizadas a Maran por la tarjeta; se consideran importes a favor y no reducen este comprobante.
                </p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Ret. IIBB</Label><Input type="number" step="0.01" value={form.retencionIibb} onChange={(e) => f("retencionIibb", e.target.value)} data-testid="input-ret-iibb" /></div>
                <div><Label>Ret. Ganancias</Label><Input type="number" step="0.01" value={form.retencionGanancias} onChange={(e) => f("retencionGanancias", e.target.value)} data-testid="input-ret-ganancias" /></div>
                <div><Label>Ret. IVA</Label><Input type="number" step="0.01" value={form.retencionIva} onChange={(e) => f("retencionIva", e.target.value)} data-testid="input-ret-iva" /></div>
                <div><Label>Ret. SUSS</Label><Input type="number" step="0.01" value={form.retencionSuss} onChange={(e) => f("retencionSuss", e.target.value)} data-testid="input-ret-suss" /></div>
                <div><Label>Ret. Municipal</Label><Input type="number" step="0.01" value={form.retencionMunicipal} onChange={(e) => f("retencionMunicipal", e.target.value)} data-testid="input-ret-municipal" /></div>
              </div>
              </>
              )}
              {historicalRetentionsNote}
                </>
              )}
            </>
          )}

          {/* STEP 3: Clasificación */}
          {step === 3 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>{isRetencion ? "Cuenta Contable de Activo" : "Cuenta Contable de Gasto"}</Label>
                  <Select
                    value={form.cuentaContableId || "__none__"}
                    disabled={isRetencion}
                    onValueChange={(v) => f("cuentaContableId", v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger data-testid="select-cuenta-contable">
                      <SelectValue placeholder="Seleccionar cuenta..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Sin clasificar —</SelectItem>
                      {accounts
                        .filter((a) => a.id && (
                          isRetencion
                            ? a.tipo === "activo" && a.codigo.startsWith("1.1.")
                            : a.tipo === "egreso"
                        ))
                        .map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.codigo} — {a.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isRetencion
                      ? "Se asigna automáticamente según el tipo de retención y nunca se registra como gasto."
                      : 'Esta es la cuenta que determina el departamento en el reporte "Costos por Departamento". Se sugiere sola según la categoría de los artículos cargados.'}
                  </p>
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
                    {isSupplierPayable
                      ? (!isEditing && form.formaPagoInmediata !== "cuenta_corriente" && !form.tipoComprobante.startsWith("NC")
                        ? ($n(form.montoPagadoAhora) < total - 0.005
                          ? `Se paga $${fmt(form.montoPagadoAhora)} al guardar (${FORMAS_PAGO.find(fp => fp.value === form.formaPagoInmediata)?.label || form.formaPagoInmediata}); resto en cuenta corriente`
                          : `Se paga al guardar (${FORMAS_PAGO.find(fp => fp.value === form.formaPagoInmediata)?.label || form.formaPagoInmediata})`)
                        : "Pendiente de pago en cuenta corriente")
                      : `Condición: ${form.condicionPago === "contado" ? "Contado (pago inmediato)" : "Cuenta Corriente (queda pendiente)"}`}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30">
                <Package className="h-4 w-4 shrink-0" />
                <span>Si recibiste mercadería, elegí artículos del Inventario para registrar su ingreso. Los servicios se cargan en Importes e impuestos, sin movimiento de stock.</span>
              </div>

              {invItems.length > 0 && (
                <div className="space-y-3">
                  {invItems.map((row, i) => (
                    <div key={i} data-testid={`row-inv-item-${i}`} className="border rounded-lg p-3 space-y-3 bg-muted/20">
                      <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeInvRow(i)} data-testid={`btn-remove-inv-${i}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Article selector / name */}
                      <PurchaseInventoryPicker items={existingInvItems} selectedId={row.existingItemId} open={!!existingItemOpen[i]} onOpenChange={(v) => setExistingItemOpen(p => ({ ...p, [i]: v }))} onSelect={(id) => { selectExistingInvItem(i, id); setExistingItemOpen(p => ({ ...p, [i]: false })); }} index={i} />
                      {row.existingItemId && <p className="text-xs text-muted-foreground">SKU: {(existingInvItems.find((it: any) => String(it.id) === row.existingItemId) as any)?.sku || "Sin código"}</p>}

                      {/* Quantity, unit, cost */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs mb-1 block">Cantidad</Label>
                          <Input type="number" min="0" step="0.001" value={row.quantity} onChange={(e) => updateInvRow(i, "quantity", e.target.value)} className="h-8 text-sm" data-testid={`input-inv-qty-${i}`} />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">Unidad</Label>
                          <Select value={row.unit} onValueChange={(v) => updateInvRow(i, "unit", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block">{form.tipoComprobante === "FACT-B" ? "Precio final unit. ($)" : "Costo unit. neto ($)"}</Label>
                          <Input type="number" min="0" step="0.01" value={row.costPrice} onChange={(e) => updateInvRow(i, "costPrice", e.target.value)} className="h-8 text-sm" data-testid={`input-inv-cost-${i}`} />
                        </div>
                      </div>

                      {canSuggestArticles && form.tipoComprobante !== "FACT-C" && (
                        <div>
                          <Label className="text-xs mb-1 block">IVA del artículo {form.tipoComprobante === "FACT-B" ? "(informativo; precio final)" : ""}</Label>
                          <Select value={row.vatRate || undefined} onValueChange={value => updateInvRow(i, "vatRate", value)}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-inv-vat-${i}`}><SelectValue placeholder="Elegir alícuota" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="2.5">2,5%</SelectItem><SelectItem value="5">5%</SelectItem>
                              <SelectItem value="10.5">10,5%</SelectItem><SelectItem value="21">21%</SelectItem>
                              <SelectItem value="27">27%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <p className="text-sm text-right">Subtotal: <strong>${fmt((Number(row.quantity) || 0) * (Number(row.costPrice) || 0))}</strong></p>

                      {/* Warehouse selector */}
                      {invWarehouses.length > 0 && (
                        <div>
                          <Label className="text-xs mb-1 block">Depósito destino</Label>
                          <Select value={row.warehouseId || "__none__"} onValueChange={(v) => updateInvRow(i, "warehouseId", v === "__none__" ? "" : v)}>
                            <SelectTrigger className="h-8 text-xs" data-testid={`select-inv-warehouse-${i}`}><SelectValue placeholder="Sin depósito (stock general)" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Sin depósito —</SelectItem>
                              {(invWarehouses as any[]).filter((w: any) => w.id).map((wh: any) => (
                                <SelectItem key={wh.id} value={String(wh.id)}>{wh.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <Button type="button" variant="outline" size="sm" onClick={addInvRow} data-testid="btn-add-inv-item">
                <Plus className="h-4 w-4 mr-2" />Agregar artículo
              </Button>

              {articleAmountComparison}

              {invItems.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Sin artículos — el comprobante se registrará sin modificar el inventario.
                </p>
              )}
            </div>
          )}
          </>
          )}

          {unifiedLayout ? (
        <DialogFooter>
          <Button variant="ghost" onClick={resetDialog}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={createMut.isPending || patchMut.isPending || !isValidPurchaseInvoiceTotal(form.tipoComprobante, total) || (!isEditing && !suppliers.some((supplier) => String(supplier.id) === form.supplierId))}
            data-testid="btn-submit-invoice"
          >
            {(createMut.isPending || patchMut.isPending) && <span className="h-4 w-4 mr-2 animate-spin border-2 border-current border-t-transparent rounded-full inline-block" />}
            {isEditing ? "Guardar cambios" : isRemito ? "Registrar remito" : "Factura completa"}
          </Button>
        </DialogFooter>
          ) : (
        <DialogFooter className="flex items-center justify-between">
          <div>
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((p) => p - 1)}>Anterior</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={resetDialog}>Cancelar</Button>
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep((p) => p + 1)} data-testid="btn-next-step">Siguiente</Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={createMut.isPending || patchMut.isPending || !isValidPurchaseInvoiceTotal(form.tipoComprobante, total) || (!isEditing && !suppliers.some((supplier) => String(supplier.id) === form.supplierId))}
                data-testid="btn-submit-invoice"
              >
                {(createMut.isPending || patchMut.isPending) && <span className="h-4 w-4 mr-2 animate-spin border-2 border-current border-t-transparent rounded-full inline-block" />}
                {isEditing ? "Guardar cambios" : "Factura completa"}
              </Button>
            )}
          </div>
        </DialogFooter>
          )}
        </div>
    </InvoiceFormShell>

    </>
  );
}

// ─── Subcomponent: Invoice Detail Dialog ─────────────────────────────────────

function InvoiceDetailDialog({ invoice, accounts, onClose }: { invoice: Invoice | null; accounts: AccountingAccount[]; onClose: () => void }) {
  const { data: detail } = useQuery<any>({
    queryKey: ["/api/purchase-invoices", invoice?.id],
    queryFn: () => fetch(`/api/purchase-invoices/${invoice!.id}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!invoice && invoice.estado === "pagado",
  });
  if (!invoice) return null;
  const fmt2 = (v?: string | number) => {
    const n = parseFloat(String(v || "0"));
    return n !== 0 ? `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—";
  };
  const account = accounts.find((a) => a.id === invoice.cuentaContableId);
  const isRetencion = isReceivedRetention(invoice.tipoComprobante);
  const ordenesPago: any[] = detail?.ordenesPago || [];
  const isLiquidacionTarjeta = isCardSettlement(invoice.tipoComprobante);
  const retentionValue = (value?: string | number) =>
    `${isLiquidacionTarjeta ? "+" : "−"}${fmt2(value)}`;
  const retentionLabel = (label: string) =>
    isLiquidacionTarjeta ? `${label} sufrida` : label;

  const rows: [string, string][] = [
    ["Tipo", invoice.tipoComprobante],
    ["Número", invoice.numeroComprobanteExt || invoice.numeroComprobante],
    ["Proveedor", invoice.supplierNombre || invoice.proveedorNombre || "—"],
    ["CUIT", invoice.proveedorCuit || "—"],
    ["Fecha de Emisión", invoice.fechaEmision],
    ["Período", invoice.periodo || "—"],
    ["Condición de Pago", invoice.condicionPago],
    ["Estado", invoice.estado],
    ["Cuenta contable", account ? `${account.codigo} — ${account.nombre}` : "—"],
  ];
  const montos: [string, string][] = [
    [isRetencion ? "Importe final" : "Monto Neto (gravado)", fmt2(invoice.montoNeto)],
    ["IVA 21%", fmt2(invoice.montoIva21)],
    ["IVA 10.5%", fmt2(invoice.montoIva105)],
    ["IVA 27%", fmt2(invoice.montoIva27)],
    ...(invoice.percepcionIibb && parseFloat(invoice.percepcionIibb) !== 0 ? [["Percep. IIBB", fmt2(invoice.percepcionIibb)] as [string, string]] : []),
    ...(invoice.percepcionIva && parseFloat(invoice.percepcionIva) !== 0 ? [["Percep. IVA", fmt2(invoice.percepcionIva)] as [string, string]] : []),
    ...(invoice.percepcionGanancias && parseFloat(invoice.percepcionGanancias) !== 0 ? [["Percep. Ganancias", fmt2(invoice.percepcionGanancias)] as [string, string]] : []),
    ...(invoice.retencionIibb && parseFloat(invoice.retencionIibb) !== 0 ? [[retentionLabel("Ret. IIBB"), retentionValue(invoice.retencionIibb)] as [string, string]] : []),
    ...(invoice.retencionGanancias && parseFloat(invoice.retencionGanancias) !== 0 ? [[retentionLabel("Ret. Ganancias"), retentionValue(invoice.retencionGanancias)] as [string, string]] : []),
    ...(invoice.retencionIva && parseFloat(invoice.retencionIva) !== 0 ? [[retentionLabel("Ret. IVA"), retentionValue(invoice.retencionIva)] as [string, string]] : []),
    ...(invoice.retencionSuss && parseFloat(invoice.retencionSuss) !== 0 ? [[retentionLabel("Ret. SUSS"), retentionValue(invoice.retencionSuss)] as [string, string]] : []),
    ...(invoice.retencionMunicipal && parseFloat(invoice.retencionMunicipal) !== 0 ? [[retentionLabel("Ret. Municipal"), retentionValue(invoice.retencionMunicipal)] as [string, string]] : []),
    ...(invoice.impuestosInternos && parseFloat(invoice.impuestosInternos) !== 0 ? [["Imp. Internos", fmt2(invoice.impuestosInternos)] as [string, string]] : []),
    ...(invoice.ley25413 && parseFloat(invoice.ley25413) !== 0 ? [["Ley 25.413", fmt2(invoice.ley25413)] as [string, string]] : []),
  ];
  return (
    <Dialog open={!!invoice} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Detalle del Comprobante
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {rows.map(([label, val]) => (
              <div key={label}>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-sm font-medium">{val}</div>
              </div>
            ))}
          </div>
          <Separator />
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Desglose de Montos</div>
            <div className="space-y-1">
              {montos.map(([label, val]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono">{val}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm font-semibold border-t pt-2 mt-2">
                <span>TOTAL</span>
                <span className="font-mono text-base">{fmt2(invoice.montoTotal)}</span>
              </div>
            </div>
          </div>
          {invoice.estado === "pagado" && (
            <>
              <Separator />
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pago</div>
                {ordenesPago.length > 0 ? (
                  <div className="space-y-2">
                    {ordenesPago.map((op) => (
                      <div key={op.id} className="flex items-center justify-between text-sm bg-muted/50 rounded-md px-3 py-2">
                        <div>
                          <div className="font-medium">OP {op.numero}</div>
                          <div className="text-xs text-muted-foreground capitalize">{op.forma_pago?.replace(/_/g, " ")}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Fecha de pago</div>
                          <div className="font-medium">{op.fecha}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Pagado de contado (sin Orden de Pago asociada)</div>
                )}
              </div>
            </>
          )}
          {invoice.observaciones && (
            <div>
              <div className="text-xs text-muted-foreground">Observaciones</div>
              <div className="text-sm text-muted-foreground">{invoice.observaciones}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
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
  const [autoCalcActive, setAutoCalcActive] = useState(true);
  const [alicuotaIibbForm, setAlicuotaIibbForm] = useState("");
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
  // When user edits a retention field manually, disable auto-calc
  const fRetention = (k: string, v: string) => {
    setAutoCalcActive(false);
    setForm((p) => ({ ...p, [k]: v }));
  };
  const toggleInv = (id: number) =>
    setSelectedInvoices((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const selectedFacturas = facturas.filter((inv) => selectedInvoices.includes(inv.id));
  const isNC = (inv: Invoice) => (inv.tipoComprobante || "").startsWith("NC");
  // NCs restan del total a abonar; solo las facturas positivas forman la base de retenciones.
  // Para una factura "parcial" se usa el saldo pendiente, no el total original.
  const totalSelected = selectedFacturas.reduce(
    (s, inv) => isNC(inv) ? s - $n(inv.montoTotal) : s + $n(inv.saldoPendiente ?? inv.montoTotal), 0);
  const baseNetosIibb = selectedFacturas.reduce(
    (s, inv) => isNC(inv) ? s : s + $n(inv.montoNeto), 0);

  // Al abrir el diálogo (para cualquier proveedor), resetear todo el estado.
  // Sin esto, `selectedInvoices` y `createdOpId` quedaban de la OP anterior
  // (el diálogo no se desmonta entre aperturas), y al emitir una segunda OP
  // se reenviaba el ID de la factura ya pagada, causando el error
  // "Facturas no pendientes: #N (pagado)" hasta reiniciar sesión.
  useEffect(() => {
    if (supplier && open) {
      setAlicuotaIibbForm(String(supplier.alicuotaIibb ?? ""));
      setSelectedInvoices([]);
      setCreatedOpId(null);
      setAutoCalcActive(true);
      setForm({
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
    }
  }, [supplier?.id, open]);

  // Auto-calculate retenciones from supplier alícuotas whenever selection changes
  useEffect(() => {
    if (!autoCalcActive || !supplier) return;
    const alicuotaIibb = parseFloat(alicuotaIibbForm) || supplier.alicuotaIibb || 0;
    const calcIibb = baseNetosIibb > 0 ? (baseNetosIibb * (alicuotaIibb / 100)).toFixed(2) : "";
    const calcOther = (alicuota: number) =>
      totalSelected > 0 ? (totalSelected * (alicuota / 100)).toFixed(2) : "";
    setForm((p) => ({
      ...p,
      retencionIibb: calcIibb,
      retencionGanancias: calcOther(supplier.alicuotaGanancias ?? 0),
      retencionIva: calcOther(supplier.alicuotaIva ?? 0),
    }));
  }, [totalSelected, baseNetosIibb, supplier, autoCalcActive, alicuotaIibbForm]);

  const handleRecalcular = () => {
    setAutoCalcActive(true);
  };

  const totalAbonado =
    totalSelected -
    $n(form.retencionIibb) -
    $n(form.retencionGanancias) -
    $n(form.retencionIva) -
    $n(form.compensacion);

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/payment-orders", data);
      return res.json();
    },
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
      alicuotaIibb: parseFloat(alicuotaIibbForm) || 0,
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
              {facturas.map((inv) => {
                const esNC = isNC(inv);
                return (
                  <div key={inv.id} className="flex items-center gap-3 p-3 hover:bg-muted/50">
                    <Checkbox
                      checked={selectedInvoices.includes(inv.id)}
                      onCheckedChange={() => toggleInv(inv.id)}
                      data-testid={`chk-invoice-${inv.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        {inv.tipoComprobante} {inv.numeroComprobanteExt || inv.numeroComprobante}
                        {esNC && <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded font-normal">resta del total</span>}
                        {inv.estado === "parcial" && <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-normal">saldo parcial</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {inv.fechaEmision}
                        {inv.estado === "parcial" && ` · Total ${fmt(inv.montoTotal)}, ya pagado ${fmt($n(inv.montoTotal) - $n(inv.saldoPendiente))}`}
                      </div>
                    </div>
                    <div className={`font-semibold ${esNC ? "text-orange-600 dark:text-orange-400" : ""}`}>
                      {esNC ? "−" : ""}${fmt(esNC ? inv.montoTotal : (inv.saldoPendiente ?? inv.montoTotal))}
                    </div>
                  </div>
                );
              })}
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
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted-foreground">Retenciones a practicar</p>
            {!autoCalcActive ? (
              <Button type="button" variant="outline" size="sm" onClick={handleRecalcular} data-testid="btn-recalcular-retenciones">
                ↻ Recalcular desde alícuotas
              </Button>
            ) : (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Auto-calculado desde alícuotas del proveedor</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Alíc. IIBB (%) <span className="text-xs text-muted-foreground">base netos: ${fmt(baseNetosIibb)}</span></Label>
              <Input
                type="number"
                step="0.01"
                value={alicuotaIibbForm}
                onChange={(e) => { setAlicuotaIibbForm(e.target.value); setAutoCalcActive(false); }}
                placeholder="ej. 3.5"
                data-testid="input-op-alicuota-iibb"
              />
            </div>
            <div>
              <Label>Ret. IIBB</Label>
              <Input type="number" step="0.01" value={form.retencionIibb} onChange={(e) => fRetention("retencionIibb", e.target.value)} data-testid="input-op-ret-iibb" />
            </div>
            <div>
              <Label>Ret. Ganancias {supplier?.alicuotaGanancias ? <span className="text-xs text-muted-foreground">({supplier.alicuotaGanancias}%)</span> : null}</Label>
              <Input type="number" step="0.01" value={form.retencionGanancias} onChange={(e) => fRetention("retencionGanancias", e.target.value)} data-testid="input-op-ret-ganancias" />
            </div>
            <div>
              <Label>Ret. IVA {supplier?.alicuotaIva ? <span className="text-xs text-muted-foreground">({supplier.alicuotaIva}%)</span> : null}</Label>
              <Input type="number" step="0.01" value={form.retencionIva} onChange={(e) => fRetention("retencionIva", e.target.value)} data-testid="input-op-ret-iva" />
            </div>
            <div>
              <Label>Compensación</Label>
              <Input type="number" step="0.01" value={form.compensacion} onChange={(e) => f("compensacion", e.target.value)} data-testid="input-op-compensacion" />
            </div>
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
  const todayISO = getArgentinaToday();
  const [fechaCorte, setFechaCorte] = useState(todayISO);
  const [busqueda, setBusqueda] = useState("");

  const { data: proveedores = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/accounting-suppliers/cuenta-corriente", fechaCorte],
    queryFn: () =>
      fetch(`/api/accounting-suppliers/cuenta-corriente?fechaCorte=${fechaCorte}`, { credentials: "include" }).then((r) => r.json()),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">Cargando proveedores...</div>;

  const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

  const proveedoresFiltrados = busqueda.trim()
    ? proveedores.filter((p: any) =>
        p.razon_social?.toLowerCase().includes(busqueda.toLowerCase())
      )
    : proveedores;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-base">Proveedores con facturas pendientes</CardTitle>
            <CardDescription>Seleccioná un proveedor para emitir la orden de pago</CardDescription>
          </div>
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <Input
              type="search"
              placeholder="Buscar proveedor..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-8 text-sm w-52"
            />
            <div className="flex items-center gap-2">
              <Label htmlFor="pagos-fecha-corte" className="text-xs whitespace-nowrap text-muted-foreground">Saldo al:</Label>
              <Input
                id="pagos-fecha-corte"
                type="date"
                value={fechaCorte}
                onChange={(e) => setFechaCorte(e.target.value)}
                className="h-8 text-sm w-44"
              />
            </div>
          </div>
        </div>
        {fechaCorte !== todayISO && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Mostrando facturas emitidas hasta el {fmtDate(fechaCorte)} que aún están pendientes.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {/* ── Saldo total a la fecha ────────────────────────────────────── */}
        {proveedores.length > 0 && (() => {
          const total = proveedoresFiltrados.reduce((sum: number, p: any) => sum + parseFloat(p.total_saldo || 0), 0);
          const esFiltrado = busqueda.trim().length > 0;
          return (
            <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-3 mb-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {esFiltrado ? "Saldo filtrado" : "Saldo total a la fecha"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {proveedoresFiltrados.length} proveedor{proveedoresFiltrados.length !== 1 ? "es" : ""}
                  {esFiltrado ? ` coinciden con "${busqueda}"` : ` con deuda al ${fmtDate(fechaCorte)}`}
                </p>
              </div>
              <p className="text-2xl font-bold text-destructive">
                ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          );
        })()}
        {proveedoresFiltrados.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {busqueda.trim() ? `Sin resultados para "${busqueda}"` : "No hay facturas pendientes de pago"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {proveedoresFiltrados.map((prov: any) => (
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
                    onClick={() => onEmitirOP({ id: prov.id, razonSocial: prov.razon_social, cuit: prov.cuit, condicionIva: prov.condicion_iva, totalSaldo: String(prov.total_saldo || 0), facturasPendientes: parseInt(prov.facturas_pendientes || 0) })}
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
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [opSupplier, setOpSupplier] = useState<CCItem | null>(null);
  const [anularId, setAnularId] = useState<number | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
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
    cuentaContableId: r.cuenta_contable_id ? parseInt(r.cuenta_contable_id) : undefined,
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

  const [clearAllOpen, setClearAllOpen] = useState(false);

  const anularMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/purchase-invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers"] });
      setAnularId(null);
    },
    onError: (e: any) => {},
  });

  const { toast } = useToast();

  const clearAllMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/purchase-invoices/truncate-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-orders"] });
      setClearAllOpen(false);
      toast({ title: "Listo", description: "Todos los comprobantes y OPs fueron eliminados." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo limpiar. Verificá que tenés rol admin.", variant: "destructive" });
    },
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
    if (estado === "parcial") return <Badge variant="outline" className="border-blue-500 text-blue-600"><Clock className="h-3 w-3 mr-1" />Parcial</Badge>;
    if (estado === "pagado") return <Badge variant="outline" className="border-green-500 text-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Pagado</Badge>;
    if (estado === "registrado") return <Badge variant="outline">Solo gasto</Badge>;
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
              <div className="text-2xl font-bold text-amber-600">{invoices.filter((i) => i.estado === "pendiente" || i.estado === "parcial").length}</div>
              <div className="text-xs text-muted-foreground">Pendientes de pago</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-destructive">
                ${invoices.filter((i) => i.estado === "pendiente" || i.estado === "parcial").reduce((s, i) => s + $n(i.saldoPendiente ?? i.montoTotal), 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
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
                      <SelectItem value="parcial">Parcial</SelectItem>
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
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost" size="icon"
                                onClick={() => setDetailInvoice(inv)}
                                title="Ver detalle"
                                data-testid={`btn-detail-invoice-${inv.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {inv.estado === "pendiente" && (
                                <>
                                  <Button
                                    variant="ghost" size="icon"
                                    onClick={() => setEditingInvoice(inv)}
                                    title="Editar"
                                    data-testid={`btn-edit-invoice-${inv.id}`}
                                  >
                                    <Pencil className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </>
                              )}
                              {(inv.estado === "pendiente" || inv.estado === "registrado") && (
                                <Button variant="ghost" size="icon" onClick={() => setAnularId(inv.id)}
                                  title="Anular" data-testid={`btn-anular-invoice-${inv.id}`}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
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
      <InvoiceDialog open={newOpen || !!editingInvoice} onClose={() => { setNewOpen(false); setEditingInvoice(null); }} suppliers={suppliers} accounts={accounts} editingInvoice={editingInvoice} />
      <PaymentOrderDialog supplier={opSupplier} open={!!opSupplier} onClose={() => setOpSupplier(null)} />
      <InvoiceDetailDialog invoice={detailInvoice} accounts={accounts} onClose={() => setDetailInvoice(null)} />

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

      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todos los comprobantes?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción borrará <strong>permanentemente</strong> todos los comprobantes de compra registrados. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearAllMut.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={clearAllMut.isPending}
              data-testid="btn-confirm-clear-all"
            >
              {clearAllMut.isPending ? "Eliminando..." : "Sí, eliminar todo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
