import { useState, useMemo, useEffect } from "react";
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
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
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
  CreditCard, Landmark, Receipt, ChevronRight, CheckCircle2, Clock, FileDown, Package,
  ChevronsUpDown, Check, Eye, Pencil,
} from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "wouter";
import { getLocalToday, fmtMoney } from "@/lib/utils";

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
  cuentaContableId?: number;
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
  { value: "RETENCION", label: "Retención Recibida" },
  { value: "RECIBO-A", label: "Recibo A" },
  { value: "RECIBO-B", label: "Recibo B" },
  { value: "RECIBO-C", label: "Recibo C" },
];

const CENTROS_COSTO = ["Hotel", "Restaurant", "Spa", "Administración", "Mantenimiento", "Housekeeping", "Marketing", "RRHH", "Lavadero"];
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
  subtipoRetencion: "",
});

// ─── Subcomponent: New Invoice Dialog ────────────────────────────────────────

interface InvItemRow {
  mode: "new" | "existing";
  name: string;
  existingItemId: string;
  categoryId: string;
  supplierId: string;
  itemKind: string;
  minStock: string;
  quantity: string;
  unit: string;
  costPrice: string;
  warehouseId: string;
}

const UNITS = ["unidad", "kg", "g", "litro", "ml", "caja", "paquete", "rollo", "metro", "par"];

const emptyQuickSupplier = {
  razonSocial: "", cuit: "", condicionIva: "Responsable Inscripto", cuentaContableId: "",
};

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

function calcFromLines(lines: NetoLine[]): Record<string, string> {
  const ivaTotals: Record<string, number> = {};
  let netoTotal = 0;
  for (const line of lines) {
    const n = parseFloat(line.neto) || 0;
    netoTotal += n;
    const entry = IVA_MAP[line.alicuota];
    if (entry && n > 0) {
      ivaTotals[entry.field] = (ivaTotals[entry.field] || 0) + n * entry.rate / 100;
    }
  }
  return {
    montoNeto: netoTotal > 0 ? netoTotal.toFixed(2) : "",
    montoIva5:   ivaTotals.montoIva5   ? ivaTotals.montoIva5.toFixed(2)   : "",
    montoIva25:  ivaTotals.montoIva25  ? ivaTotals.montoIva25.toFixed(2)  : "",
    montoIva105: ivaTotals.montoIva105 ? ivaTotals.montoIva105.toFixed(2) : "",
    montoIva21:  ivaTotals.montoIva21  ? ivaTotals.montoIva21.toFixed(2)  : "",
    montoIva27:  ivaTotals.montoIva27  ? ivaTotals.montoIva27.toFixed(2)  : "",
  };
}

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

function InvoiceDialog({
  open,
  onClose,
  suppliers,
  accounts,
  editingInvoice,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  accounts: AccountingAccount[];
  editingInvoice?: Invoice | null;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(emptyForm());
  const [step, setStep] = useState(0);
  const [invItems, setInvItems] = useState<InvItemRow[]>([]);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickForm, setQuickForm] = useState({ ...emptyQuickSupplier });
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [existingItemOpen, setExistingItemOpen] = useState<Record<number, boolean>>({});
  const [netoLines, setNetoLines] = useState<NetoLine[]>([emptyNetoLine()]);

  const TIPOS_C = ["FACT-C", "NC-C", "RECIBO-C"];

  const applyNetoLines = (updated: NetoLine[]) => {
    setForm(p => {
      if (TIPOS_C.includes(p.tipoComprobante)) {
        // Factura C: no IVA — el neto es el total, no calcular IVA
        const netoTotal = updated.reduce((sum, l) => sum + (parseFloat(l.neto) || 0), 0);
        return { ...p, montoNeto: netoTotal > 0 ? netoTotal.toFixed(2) : "", ...ALL_IVA_FIELDS };
      }
      return { ...p, ...calcFromLines(updated) };
    });
  };

  const updateNetoLine = (i: number, field: keyof NetoLine, val: string) => {
    setNetoLines(prev => {
      const updated = prev.map((l, j) => j === i ? { ...l, [field]: val } : l);
      applyNetoLines(updated);
      return updated;
    });
  };
  const addNetoLine = () => setNetoLines(prev => [...prev, emptyNetoLine()]);
  const removeNetoLine = (i: number) => {
    setNetoLines(prev => {
      const updated = prev.filter((_, j) => j !== i);
      applyNetoLines(updated);
      return updated;
    });
  };

  const isEditing = !!editingInvoice;

  const f = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const qf = (k: string, v: string) => setQuickForm((p) => ({ ...p, [k]: v }));

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
        condicionPago: editingInvoice.condicionPago || "contado",
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
        impuestosInternos: editingInvoice.impuestosInternos || "",
        ley25413: editingInvoice.ley25413 || "",
        cuentaContableId: editingInvoice.cuentaContableId ? String(editingInvoice.cuentaContableId) : "",
        centroCosto: editingInvoice.centroCosto || "",
        observaciones: editingInvoice.observaciones || "",
      });
      setNetoLines(linesFromInvoice(editingInvoice));
      setStep(1);
    } else if (open && !editingInvoice) {
      setForm(emptyForm());
      setNetoLines([emptyNetoLine()]);
      setStep(0);
    }
  }, [open, editingInvoice]);

  const quickCreateMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accounting-suppliers", data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers"] });
      setQuickCreateOpen(false);
      setQuickForm({ ...emptyQuickSupplier });
      if (res?.id) {
        f("supplierId", String(res.id));
        f("proveedorNombre", res.razon_social || "");
        f("proveedorCuit", res.cuit || "");
        if (res.cuenta_contable_id) f("cuentaContableId", String(res.cuenta_contable_id));
      }
      toast({ title: "Proveedor creado y seleccionado" });
    },
    onError: (e: any) => toast({ title: "Error al crear proveedor", description: e.message, variant: "destructive" }),
  });

  const handleQuickCreateSubmit = () => {
    if (!quickForm.razonSocial || !quickForm.cuit || !quickForm.condicionIva) {
      toast({ title: "Complete razón social, CUIT y condición IVA", variant: "destructive" });
      return;
    }
    quickCreateMut.mutate({
      razonSocial: quickForm.razonSocial,
      cuit: quickForm.cuit,
      condicionIva: quickForm.condicionIva,
      cuentaContableId: quickForm.cuentaContableId || null,
    });
  };

  const { data: itemCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/categories"],
    enabled: open,
  });

  const { data: invWarehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/warehouses"],
    enabled: open,
  });

  const addInvRow = () => setInvItems((p) => [...p, { mode: "new", name: "", existingItemId: "", categoryId: "", supplierId: "", itemKind: "materia_prima", minStock: "0", quantity: "1", unit: "unidad", costPrice: "0", warehouseId: "" }]);
  const removeInvRow = (i: number) => setInvItems((p) => p.filter((_, j) => j !== i));
  const updateInvRow = (i: number, field: keyof InvItemRow, val: string) =>
    setInvItems((p) => p.map((r, j) => j === i ? { ...r, [field]: val } : r));
  const toggleInvRowMode = (i: number, mode: "new" | "existing") =>
    setInvItems((p) => p.map((r, j) => j === i ? { ...r, mode, name: "", existingItemId: "" } : r));

  const { data: existingInvItems = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/items"],
    enabled: open && step === 4,
  });

  const handleSupplierChange = (id: string) => {
    const s = suppliers.find((x) => String(x.id) === id);
    if (s) {
      f("supplierId", id);
      f("proveedorNombre", s.razonSocial);
      f("proveedorCuit", s.cuit);
      if (s.alicuotaIibb) f("alicuotaIibbProveedor", String(s.alicuotaIibb));
      if (s.cuentaContableId) f("cuentaContableId", String(s.cuentaContableId));
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

  const resetDialog = () => { onClose(); setForm(emptyForm()); setStep(0); setInvItems([]); setNetoLines([emptyNetoLine()]); };

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/purchase-invoices", data);
      return res.json();
    },
    onSuccess: async (invoice: any) => {
      let inventoryCount = 0;
      const invoiceRef = `Comprobante ${invoice.numero_comprobante_ext || invoice.numero_comprobante || invoice.id} — ${form.proveedorNombre}`;

      const validNew = invItems.filter((r) => r.mode === "new" && r.name.trim());
      const validExisting = invItems.filter((r) => r.mode === "existing" && r.existingItemId);

      // Create new inventory items
      for (const row of validNew) {
        try {
          const itemRes = await apiRequest("POST", "/api/inventory/items", {
            name: row.name.trim(),
            categoryId: row.categoryId || undefined,
            supplierId: form.supplierId ? parseInt(form.supplierId) : undefined,
            unit: row.unit,
            costPrice: row.costPrice,
            currentStock: row.quantity,
            minStock: parseInt(row.minStock) || 0,
            itemKind: row.itemKind || "materia_prima",
            warehouseId: row.warehouseId || undefined,
          });
          const item = await itemRes.json();
          // Only create a generic movement if no warehouse was selected (warehouse route already recorded it)
          if (!row.warehouseId) {
            await apiRequest("POST", "/api/inventory/movements", {
              itemId: item.id,
              type: "entrada",
              quantity: row.quantity,
              reason: invoiceRef,
              sourceType: "purchase_invoice",
              sourceId: String(invoice.id),
            });
          }
          inventoryCount++;
        } catch (e) {
          console.warn("Error creating inventory item:", e);
        }
      }

      // Add stock to existing inventory items
      for (const row of validExisting) {
        try {
          if (row.warehouseId) {
            await apiRequest("POST", `/api/inventory/warehouses/${row.warehouseId}/movements`, {
              itemId: row.existingItemId,
              movementType: "entrada",
              quantity: row.quantity,
              notes: invoiceRef,
              unitCost: parseFloat(row.costPrice) > 0 ? row.costPrice : undefined,
            });
          } else {
            await apiRequest("POST", "/api/inventory/movements", {
              itemId: row.existingItemId,
              type: "entrada",
              quantity: row.quantity,
              reason: invoiceRef,
              sourceType: "purchase_invoice",
              sourceId: String(invoice.id),
            });
            // Update cost price on the item if provided
            if (parseFloat(row.costPrice) > 0) {
              await apiRequest("PATCH", `/api/inventory/items/${row.existingItemId}`, {
                costPrice: row.costPrice,
              });
            }
          }
          inventoryCount++;
        } catch (e) {
          console.warn("Error updating existing inventory item:", e);
        }
      }

      if (inventoryCount > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
        queryClient.invalidateQueries({ queryKey: ["/api/inventory/movements"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting-suppliers"] });
      resetDialog();
      const desc = inventoryCount > 0
        ? `El asiento contable fue generado. Se ingresaron ${inventoryCount} artículo(s) al inventario.`
        : "El asiento contable fue generado automáticamente.";
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
    if (isEditing) {
      patchMut.mutate({ ...form, cuentaContableId: form.cuentaContableId ? parseInt(form.cuentaContableId) : null });
      return;
    }
    if (!form.numeroComprobante) {
      toast({ title: "Ingrese el número de comprobante", variant: "destructive" });
      return;
    }
    const validItems = invItems.filter(
      (r) => (r.mode === "new" && r.name.trim()) || (r.mode === "existing" && r.existingItemId)
    );
    // Nota: no se valida que la suma de artículos coincida con el neto —
    // los precios de costo en inventario pueden diferir del total facturado
    // (descuentos exclusivos, artículos sin cargo, etc.).
    createMut.mutate({ ...form, supplierId: form.supplierId ? parseInt(form.supplierId) : null, cuentaContableId: form.cuentaContableId ? parseInt(form.cuentaContableId) : null });
  };

  const steps = isEditing
    ? ["Encabezado", "Montos", "Retenciones", "Clasificación"]
    : ["Encabezado", "Montos", "Retenciones", "Clasificación", "Inventario"];
  const isResumen = form.tipoComprobante === "RESUMEN-BANCO" || form.tipoComprobante === "LIQ-TARJETA";
  const isNC = form.tipoComprobante.startsWith("NC");
  const isRetencion = form.tipoComprobante === "RETENCION";
  const isFacturaC = ["FACT-C", "NC-C", "RECIBO-C"].includes(form.tipoComprobante);

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); }}>
      <DialogContent
        className="max-w-2xl max-h-[92vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{isEditing ? `Editar Comprobante — ${editingInvoice?.numeroComprobanteExt || editingInvoice?.numeroComprobante}` : "Registrar Comprobante"}</DialogTitle>
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
                  <Select value={form.tipoComprobante} onValueChange={(v) => {
                    // Factura C: sin IVA, forzar alícuota 0 y limpiar campos IVA
                    if (v === "FACT-C" || v === "NC-C" || v === "RECIBO-C") {
                      setForm((p) => ({ ...p, tipoComprobante: v, alicuotaIva: "0", ...ALL_IVA_FIELDS }));
                    } else {
                      f("tipoComprobante", v);
                    }
                  }}>
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
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="Buscar proveedor..."
                        value={supplierDropdownOpen
                          ? supplierSearch
                          : form.supplierId === "manual"
                          ? "— Ingreso manual —"
                          : form.supplierId
                          ? suppliers.find((s) => String(s.id) === form.supplierId)?.razonSocial || ""
                          : ""}
                        onChange={(e) => { setSupplierSearch(e.target.value); setSupplierDropdownOpen(true); }}
                        onFocus={() => { setSupplierSearch(""); setSupplierDropdownOpen(true); }}
                        onBlur={() => setTimeout(() => setSupplierDropdownOpen(false), 150)}
                        data-testid="select-supplier"
                        autoComplete="off"
                      />
                      {supplierDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-md border bg-popover shadow-md">
                          <div
                            className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                            onMouseDown={() => { handleSupplierChange("manual"); setSupplierSearch(""); setSupplierDropdownOpen(false); }}
                          >
                            <Check className={`h-4 w-4 shrink-0 ${form.supplierId === "manual" ? "opacity-100" : "opacity-0"}`} />
                            — Ingresar manual —
                          </div>
                          {[...suppliers]
                            .filter((s) => !supplierSearch || s.razonSocial.toLowerCase().includes(supplierSearch.toLowerCase()) || s.cuit.includes(supplierSearch))
                            .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, "es"))
                            .slice(0, 60)
                            .map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                                onMouseDown={() => { handleSupplierChange(String(s.id)); setSupplierSearch(""); setSupplierDropdownOpen(false); }}
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
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onMouseDown={(e) => { e.preventDefault(); setSupplierDropdownOpen(false); setQuickCreateOpen(true); }}
                      title="Crear nuevo proveedor"
                      data-testid="btn-quick-create-supplier"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
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
                  <Select value={form.subtipoRetencion || "__none__"} onValueChange={(v) => f("subtipoRetencion", v === "__none__" ? "" : v)}>
                    <SelectTrigger data-testid="select-subtipo-retencion">
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Sin especificar —</SelectItem>
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
                    {isFacturaC ? "Importe" : "Netos Gravados"}
                    {isResumen && !isFacturaC && <span className="ml-1 text-xs font-normal text-muted-foreground">(base para IVA)</span>}
                  </Label>
                  {!isFacturaC && (
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
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">{isFacturaC ? "Importe total $" : "Neto gravado $"}</th>
                        {!isFacturaC && <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs w-2/5">Alícuota IVA</th>}
                        {!isFacturaC && <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">IVA calculado $</th>}
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {netoLines.map((line, i) => {
                        const n = parseFloat(line.neto) || 0;
                        const entry = IVA_MAP[line.alicuota];
                        const ivaCalc = !isFacturaC && entry && n > 0 ? n * entry.rate / 100 : 0;
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
                            {!isFacturaC && (
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
                            {!isFacturaC && (
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
                        <td colSpan={isFacturaC ? 2 : 2} className="px-3 py-2 text-xs text-muted-foreground">
                          {isFacturaC ? "Total:" : "Total neto:"} <span className="font-bold text-foreground font-mono">${fmt(form.montoNeto || "0")}</span>
                        </td>
                        {!isFacturaC && (
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
              <div className="grid grid-cols-2 gap-3">
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
                        .filter((a) => a.id && a.tipo === "egreso")
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

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30">
                <Package className="h-4 w-4 shrink-0" />
                <span>Opcional — Agregá los productos recibidos. Podés sumar stock a artículos existentes o crear artículos nuevos.</span>
              </div>

              {invItems.length > 0 && (
                <div className="space-y-3">
                  {invItems.map((row, i) => (
                    <div key={i} data-testid={`row-inv-item-${i}`} className="border rounded-lg p-3 space-y-3 bg-muted/20">
                      {/* Mode toggle */}
                      <div className="flex items-center gap-2">
                        <div className="flex rounded-md border overflow-hidden text-xs">
                          <button
                            type="button"
                            className={`px-3 py-1.5 font-medium transition-colors ${row.mode === "existing" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                            onClick={() => toggleInvRowMode(i, "existing")}
                            data-testid={`btn-mode-existing-${i}`}
                          >
                            Artículo existente
                          </button>
                          <button
                            type="button"
                            className={`px-3 py-1.5 font-medium transition-colors ${row.mode === "new" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                            onClick={() => toggleInvRowMode(i, "new")}
                            data-testid={`btn-mode-new-${i}`}
                          >
                            Artículo nuevo
                          </button>
                        </div>
                        <div className="flex-1" />
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeInvRow(i)} data-testid={`btn-remove-inv-${i}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Article selector / name */}
                      {row.mode === "existing" ? (
                        <div>
                          <Label className="text-xs mb-1 block">Artículo del inventario</Label>
                          <Popover modal={true} open={!!existingItemOpen[i]} onOpenChange={(v) => setExistingItemOpen((p) => ({ ...p, [i]: v }))}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between font-normal h-8 text-sm"
                                data-testid={`select-existing-item-${i}`}
                              >
                                <span className="truncate">
                                  {row.existingItemId
                                    ? (existingInvItems.find((it: any) => String(it.id) === row.existingItemId) as any)?.name || "Seleccionar artículo..."
                                    : "Seleccionar artículo..."}
                                </span>
                                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[340px] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Buscar artículo..." />
                                <CommandList>
                                  <CommandEmpty>No se encontraron artículos</CommandEmpty>
                                  <CommandGroup>
                                    {[...existingInvItems]
                                      .sort((a: any, b: any) => a.name.localeCompare(b.name, "es"))
                                      .map((item: any) => (
                                        <CommandItem
                                          key={item.id}
                                          value={item.name}
                                          onMouseDown={(e) => e.preventDefault()}
                                          onSelect={() => {
                                            updateInvRow(i, "existingItemId", String(item.id));
                                            setExistingItemOpen((p) => ({ ...p, [i]: false }));
                                          }}
                                        >
                                          <Check className={`mr-2 h-4 w-4 ${row.existingItemId === String(item.id) ? "opacity-100" : "opacity-0"}`} />
                                          <span className="flex-1">{item.name}</span>
                                          <span className="text-xs text-muted-foreground ml-2">Stock: {item.currentStock} {item.unit}</span>
                                        </CommandItem>
                                      ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs mb-1 block">Nombre del artículo *</Label>
                              <Input value={row.name} onChange={(e) => updateInvRow(i, "name", e.target.value)} placeholder="Ej: Aceite de Oliva 1L" className="h-8 text-sm" data-testid={`input-inv-name-${i}`} />
                            </div>
                            <div>
                              <Label className="text-xs mb-1 block">Categoría</Label>
                              <Select value={row.categoryId || "__none__"} onValueChange={(v) => updateInvRow(i, "categoryId", v === "__none__" ? "" : v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— Sin categoría —</SelectItem>
                                  {(() => {
                                    const cats = (itemCategories as any[]);
                                    const groups = cats.filter((c: any) => c.isGroup);
                                    const leafCats = cats.filter((c: any) => !c.isGroup && c.id);
                                    const result: JSX.Element[] = [];
                                    for (const g of groups) {
                                      const children = leafCats.filter((c: any) => c.parentId === g.id);
                                      if (!children.length) continue;
                                      result.push(
                                        <SelectGroup key={g.id}>
                                          <SelectLabel>{g.name}</SelectLabel>
                                          {children.map((cat: any) => (
                                            <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                                          ))}
                                        </SelectGroup>
                                      );
                                    }
                                    const ungrouped = leafCats.filter((c: any) => !c.parentId);
                                    if (ungrouped.length) {
                                      if (result.length) result.push(<SelectSeparator key="sep" />);
                                      ungrouped.forEach((cat: any) => result.push(
                                        <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                                      ));
                                    }
                                    return result;
                                  })()}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs mb-1 block">Tipo de artículo</Label>
                              <Select value={row.itemKind || "materia_prima"} onValueChange={(v) => updateInvRow(i, "itemKind", v)}>
                                <SelectTrigger className="h-8 text-xs" data-testid={`select-inv-kind-${i}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="materia_prima">Materia Prima</SelectItem>
                                  <SelectItem value="venta_directa">Venta Directa</SelectItem>
                                  <SelectItem value="activo_fijo">Activo Fijo</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs mb-1 block">Stock mínimo</Label>
                              <Input type="number" min="0" step="1" value={row.minStock} onChange={(e) => updateInvRow(i, "minStock", e.target.value)} className="h-8 text-sm" data-testid={`input-inv-minstock-${i}`} />
                            </div>
                          </div>
                        </div>
                      )}

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
                          <Label className="text-xs mb-1 block">Costo unit. ($)</Label>
                          <Input type="number" min="0" step="0.01" value={row.costPrice} onChange={(e) => updateInvRow(i, "costPrice", e.target.value)} className="h-8 text-sm" data-testid={`input-inv-cost-${i}`} />
                        </div>
                      </div>

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

              {invItems.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Sin artículos — el comprobante se registrará sin modificar el inventario.
                </p>
              )}
            </div>
          )}

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
                disabled={createMut.isPending || patchMut.isPending}
                data-testid="btn-submit-invoice"
              >
                {(createMut.isPending || patchMut.isPending) && <span className="h-4 w-4 mr-2 animate-spin border-2 border-current border-t-transparent rounded-full inline-block" />}
                {isEditing ? "Guardar cambios" : "Factura completa"}
              </Button>
            )}
          </div>
        </DialogFooter>
        </div>
      </DialogContent>

    </Dialog>

    {/* Quick-create supplier dialog — rendered OUTSIDE main Dialog to avoid Radix nesting issues */}
    <Dialog open={quickCreateOpen} onOpenChange={setQuickCreateOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo Proveedor</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <Label>Razón Social *</Label>
            <Input value={quickForm.razonSocial} onChange={(e) => qf("razonSocial", e.target.value)} data-testid="input-quick-razon-social" />
          </div>
          <div>
            <Label>CUIT *</Label>
            <Input value={quickForm.cuit} onChange={(e) => qf("cuit", e.target.value)} placeholder="20-12345678-9" data-testid="input-quick-cuit" />
          </div>
          <div>
            <Label>Condición IVA *</Label>
            <Select value={quickForm.condicionIva} onValueChange={(v) => qf("condicionIva", v)}>
              <SelectTrigger data-testid="select-quick-condicion-iva">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Responsable Inscripto","Monotributo","Exento","No Responsable","Consumidor Final"].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Cuenta contable por defecto</Label>
            <Select value={quickForm.cuentaContableId || "__none__"} onValueChange={(v) => qf("cuentaContableId", v === "__none__" ? "" : v)}>
              <SelectTrigger data-testid="select-quick-cuenta-contable">
                <SelectValue placeholder="Sin cuenta por defecto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin cuenta por defecto</SelectItem>
                {accounts.filter((a: any) => a.id).map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.codigo} — {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setQuickCreateOpen(false)}>Cancelar</Button>
          <Button onClick={handleQuickCreateSubmit} disabled={quickCreateMut.isPending} data-testid="btn-submit-quick-supplier">
            {quickCreateMut.isPending && <span className="h-4 w-4 mr-2 animate-spin border-2 border-current border-t-transparent rounded-full inline-block" />}
            Crear proveedor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Subcomponent: Invoice Detail Dialog ─────────────────────────────────────

function InvoiceDetailDialog({ invoice, accounts, onClose }: { invoice: Invoice | null; accounts: AccountingAccount[]; onClose: () => void }) {
  if (!invoice) return null;
  const fmt2 = (v?: string | number) => {
    const n = parseFloat(String(v || "0"));
    return n !== 0 ? `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "—";
  };
  const account = accounts.find((a) => a.id === invoice.cuentaContableId);

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
    ["Monto Neto (gravado)", fmt2(invoice.montoNeto)],
    ["IVA 21%", fmt2(invoice.montoIva21)],
    ["IVA 10.5%", fmt2(invoice.montoIva105)],
    ["IVA 27%", fmt2(invoice.montoIva27)],
    ...(invoice.percepcionIibb && parseFloat(invoice.percepcionIibb) !== 0 ? [["Percep. IIBB", fmt2(invoice.percepcionIibb)] as [string, string]] : []),
    ...(invoice.percepcionIva && parseFloat(invoice.percepcionIva) !== 0 ? [["Percep. IVA", fmt2(invoice.percepcionIva)] as [string, string]] : []),
    ...(invoice.percepcionGanancias && parseFloat(invoice.percepcionGanancias) !== 0 ? [["Percep. Ganancias", fmt2(invoice.percepcionGanancias)] as [string, string]] : []),
    ...(invoice.retencionIibb && parseFloat(invoice.retencionIibb) !== 0 ? [["Ret. IIBB", `−${fmt2(invoice.retencionIibb)}`] as [string, string]] : []),
    ...(invoice.retencionGanancias && parseFloat(invoice.retencionGanancias) !== 0 ? [["Ret. Ganancias", `−${fmt2(invoice.retencionGanancias)}`] as [string, string]] : []),
    ...(invoice.retencionIva && parseFloat(invoice.retencionIva) !== 0 ? [["Ret. IVA", `−${fmt2(invoice.retencionIva)}`] as [string, string]] : []),
    ...(invoice.retencionSuss && parseFloat(invoice.retencionSuss) !== 0 ? [["Ret. SUSS", `−${fmt2(invoice.retencionSuss)}`] as [string, string]] : []),
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
          {invoice.centroCosto && (
            <div>
              <div className="text-xs text-muted-foreground">Centro de costo</div>
              <div className="text-sm">{invoice.centroCosto}</div>
            </div>
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
  const totalSelected = selectedFacturas.reduce((s, inv) => s + $n(inv.montoTotal), 0);
  const baseNetosIibb = selectedFacturas.reduce((s, inv) => s + $n(inv.montoNeto), 0);

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
                                  <Button
                                    variant="ghost" size="icon"
                                    onClick={() => setAnularId(inv.id)}
                                    title="Anular"
                                    data-testid={`btn-anular-invoice-${inv.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
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
