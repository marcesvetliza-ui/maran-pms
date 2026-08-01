import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getLocalToday, fmtMoney, formatDateAR } from "@/lib/utils";
import type { ReservationWithDetails, PaymentMethod } from "@shared/schema";
import {
  LogOut, Receipt, Printer, Plus, Trash2, ChevronLeft, ChevronRight,
  CircleCheck, AlertCircle, Loader2, Percent, Building2, User,
  Edit2, Check, X, FileText, AlertTriangle, MinusCircle, PlusCircle, ArrowRightLeft, RotateCcw,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrefacturaFolioData {
  reservationCode: string;
  guestName: string;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  roomRate: string;
  roomTotal: number;
  charges: any[];
  totalCharges: number;
  payments: any[];
  totalPayments: number;
  grandTotal: number;
  balance: number;
}

interface PaymentRow {
  id: string;
  amount: string;
  method: PaymentMethod;
  reference: string;
  retencionEnabled: boolean;
  retencionTipo: "iibb" | "ganancias";
  retencionMonto: string;
}

export interface PrefacturaDialogProps {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  reservation?: ReservationWithDetails | null;
  mode: "checkout" | "billing";
  onCheckoutComplete?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta_debito: "Tarjeta Débito",
  tarjeta_credito: "Tarjeta Crédito",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
  cuenta_corriente: "Cuenta Corriente",
};

const TIPO_OPTIONS = [
  { value: "FA",  label: "Factura A",           fiscal: true },
  { value: "FB",  label: "Factura B",           fiscal: true },
  { value: "FT",  label: "Factura T",           fiscal: true },
  { value: "FM",  label: "Factura MiPyme A",    fiscal: true },
  { value: "NCA", label: "Nota de Crédito A",   fiscal: true },
  { value: "NCB", label: "Nota de Crédito B",   fiscal: true },
  { value: "NCT", label: "Nota de Crédito T",   fiscal: true },
  { value: "NCM", label: "Nota de Crédito MiPyme A", fiscal: true },
  { value: "cierre_habitacion", label: "Cierre de habitación (no fiscal)", fiscal: false },
  { value: "ticket", label: "Ticket (no fiscal)", fiscal: false },
];

const NON_FISCAL = new Set(["cierre_habitacion", "ticket", "voucher_justo", "voucher_pedidos_ya", "cierre_spa"]);

const RECEIPT_TYPE_MAP: Record<string, string> = {
  FA: "factura_a", FB: "factura_b", FC: "factura_c",
  FT: "factura_t", FM: "factura_mipyme_a",
  NCA: "factura_a", NCB: "factura_b", NCT: "factura_t", NCM: "factura_mipyme_a",
  cierre_habitacion: "cierre_habitacion", ticket: "ticket",
};

const VAT_MAP: Record<string, string> = {
  responsable_inscripto: "Responsable Inscripto",
  monotributista: "Monotributista",
  exento: "Exento",
  consumidor_final: "Consumidor Final",
  no_responsable: "No Responsable",
  no_categorizado: "No Categorizado (Extranjero)",
};

function padNum(n: number | undefined, len: number) {
  return String(n ?? 0).padStart(len, "0");
}

// ─── Invoice items builder ────────────────────────────────────────────────────

function buildInvoiceItems(
  selectedIds: Set<string>,
  itemDescriptions: Record<string, string>,
  folio: PrefacturaFolioData,
  tipo: string
) {
  const isFiscal = !NON_FISCAL.has(tipo);
  // FC (Monotributista) no discrimina IVA — todo "no gravado"
  // FT (Turismo) tampoco discrimina IVA en el comprobante
  const esNoGravado = tipo === "FC" || tipo === "FT";

  function computeItem(descripcion: string, precio: number) {
    const base = precio;
    if (!isFiscal || esNoGravado) {
      return { descripcion, cantidad: 1, precioUnitario: base, alicuotaIva: "no_gravado" as const, subtotalNeto: base, subtotal: base };
    }
    const neto = Number((base / 1.21).toFixed(2));
    return { descripcion, cantidad: 1, precioUnitario: base, alicuotaIva: "21" as const, subtotalNeto: neto, subtotal: base };
  }

  const items: any[] = [];
  if (selectedIds.has("accommodation") && folio.roomTotal > 0) {
    const desc = itemDescriptions["accommodation"] ||
      `Alojamiento Hab. ${folio.roomNumber} (${folio.nights} noche${folio.nights !== 1 ? "s" : ""})`;
    items.push(computeItem(desc, folio.roomTotal));
  }
  for (const charge of folio.charges || []) {
    // Never invoice transfer entries — they are folio adjustments, not billable items
    if (charge.category === "transfer_out" || charge.category === "transfer_in") continue;
    if (selectedIds.has(String(charge.id))) {
      const desc = itemDescriptions[String(charge.id)] || charge.description;
      items.push(computeItem(desc, parseFloat(charge.amount)));
    }
  }
  return items;
}

// ─── Auto-suggest tipo from condicionIva / cuit ───────────────────────────────

function suggestTipo(cuit: string, condicionIva: string): string {
  if (!cuit) return "cierre_habitacion";
  if (condicionIva === "Responsable Inscripto" || condicionIva === "Exento") return "FA";
  if (condicionIva === "Monotributista") return "FB";
  return "FB";
}

let rowIdCounter = 0;
function newRowId() { return `row_${++rowIdCounter}`; }

// ─── Component ────────────────────────────────────────────────────────────────

export function PrefacturaDialog({
  open, onClose, reservationId, reservation, mode, onCheckoutComplete,
}: PrefacturaDialogProps) {
  const { toast } = useToast();

  // Steps
  const [step, setStep] = useState(1);

  // Step 1: which items to include & descriptions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [itemDescriptions, setItemDescriptions] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Step 1: who to bill
  const [billingTarget, setBillingTarget] = useState<"guest" | "company" | "agency">("guest");
  const [billingEntityId, setBillingEntityId] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [cuit, setCuit] = useState("");
  const [dni, setDni] = useState("");
  const [condicionIva, setCondicionIva] = useState("Consumidor Final");
  const [domicilio, setDomicilio] = useState("");

  // Step 1: invoice config
  const [tipo, setTipo] = useState("cierre_habitacion");
  const [puntoVenta, setPuntoVenta] = useState("");
  const [doCheckout, setDoCheckout] = useState(true);

  // Step 2: payments
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    { id: newRowId(), amount: "", method: "efectivo", reference: "", retencionEnabled: false, retencionTipo: "iibb", retencionMonto: "" },
  ]);

  // Step 3: result
  const [emittedInvoice, setEmittedInvoice] = useState<any>(null);
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Transfer charge sub-dialog (single charge)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferCharge, setTransferCharge] = useState<{ id: string; description: string; maxAmount: number; originalAmount?: number } | null>(null);

  // Bulk transfer dialog
  const [showBulkTransfer, setShowBulkTransfer] = useState(false);

  // Partial payment warning
  const [showPartialWarning, setShowPartialWarning] = useState(false);

  // Reversal confirmation
  const [revertCharge, setRevertCharge] = useState<{ id: string; description: string; amount: number; category: string } | null>(null);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);

  // NC sub-dialog
  const [ncDialogOpen, setNcDialogOpen] = useState(false);

  // ND sub-dialog
  const [ndDialogOpen, setNdDialogOpen] = useState(false);

  // Queries
  const { data: folio, isLoading: folioLoading, refetch: refetchFolio } = useQuery<PrefacturaFolioData>({
    queryKey: ["/api/reservations", String(reservationId), "folio"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservationId}/folio`);
      if (!res.ok) throw new Error("No se pudo cargar el folio");
      return res.json();
    },
    enabled: open && !!reservationId,
  });
  const { data: billingConfig } = useQuery<any>({ queryKey: ["/api/billing/config"], enabled: open });
  const { data: posConfigs = [] } = useQuery<any[]>({ queryKey: ["/api/pos-configs"], enabled: open });
  const { data: companies = [] } = useQuery<any[]>({ queryKey: ["/api/companies"], enabled: open });
  const { data: agencies = [] } = useQuery<any[]>({ queryKey: ["/api/agencies"], enabled: open });

  // Emitted fiscal invoices for this reservation (for NC flow)
  const { data: emittedInvoices = [], refetch: refetchEmittedInvoices } = useQuery<any[]>({
    queryKey: ["/api/reservations", String(reservationId), "invoices"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservationId}/invoices`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!reservationId,
  });

  // Remaining transferable amounts per source item (re-fetched after each transfer)
  const { data: transferRemaining, refetch: refetchTransferRemaining } = useQuery<{
    accommodation: number;
    charges: Record<string, number>;
  }>({
    queryKey: ["/api/reservations", String(reservationId), "transfer-remaining"],
    queryFn: async () => {
      const res = await fetch(`/api/reservations/${reservationId}/transfer-remaining`);
      if (!res.ok) return { accommodation: 0, charges: {} };
      return res.json();
    },
    enabled: open && !!reservationId,
  });

  // On open: reset step
  useEffect(() => {
    if (open) {
      setStep(1);
      setEmittedInvoice(null);
      setCheckoutDone(false);
      setSubmitError(null);
      setItemDescriptions({});
      setEditingId(null);
    }
  }, [open]);

  // When folio loads: select all billable items (exclude transfer entries), pre-fill payment amount
  useEffect(() => {
    if (!folio || !open) return;
    const allIds = new Set<string>(["accommodation"]);
    (folio.charges || []).forEach((c: any) => {
      if (c.category !== "transfer_out" && c.category !== "transfer_in") {
        allIds.add(String(c.id));
      }
    });
    setSelectedIds(allIds);
    if (folio.balance > 0.01) {
      setPaymentRows([{
        id: newRowId(), amount: String(folio.balance.toFixed(2)), method: "efectivo",
        reference: "", retencionEnabled: false, retencionTipo: "iibb", retencionMonto: "",
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folio?.grandTotal, open]);

  // When reservation loads: auto-fill client data
  useEffect(() => {
    if (!reservation || !open) return;
    fillFromReservation(reservation, "init");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation?.id, open]);

  // Auto-suggest default POS
  useEffect(() => {
    if (posConfigs.length > 0 && !puntoVenta) {
      const def = posConfigs.find((p: any) => p.isDefault) || posConfigs[0];
      if (def) setPuntoVenta(String(def.puntoVenta));
    }
  }, [posConfigs]);

  function fillFromReservation(res: ReservationWithDetails, _source: string) {
    const g = res.guest as any;
    const comp = res.company as any;
    const ag = res.agency as any;

    if (comp) {
      setBillingTarget("company");
      setBillingEntityId(String(comp.id || res.companyId || ""));
      applyEntity(comp, "company");
    } else if (ag) {
      setBillingTarget("agency");
      setBillingEntityId(String(ag.id || res.agencyId || ""));
      applyEntity(ag, "agency");
    } else if (g) {
      setBillingTarget("guest");
      setBillingEntityId("");
      const isJuridica = g.tipoPersona === "juridica";
      const name = isJuridica ? (g.firstName || "") : [g.lastName, g.firstName].filter(Boolean).join(" ");
      const cuitVal = g.cuilCuit || "";
      const dniVal = !cuitVal && g.documentNumber ? g.documentNumber : "";
      const condVal = VAT_MAP[g.vatCondition || "consumidor_final"] || "Consumidor Final";
      setRazonSocial(name);
      setCuit(cuitVal);
      setDni(dniVal);
      setCondicionIva(condVal);
      setDomicilio([g.direccion, g.localidad].filter(Boolean).join(", "));
      setTipo(suggestTipo(cuitVal, condVal));
    }
  }

  function applyEntity(e: any, type: "company" | "agency") {
    const rs = e.razonSocial || e.nombreFantasia || "";
    const cuitVal = e.cuilCuit || "";
    const condVal = e.condicionIva || (cuitVal ? "Responsable Inscripto" : "Consumidor Final");
    const dom = e.domicilio || e.direccion || "";
    setRazonSocial(rs);
    setCuit(cuitVal);
    setDni("");
    setCondicionIva(condVal);
    setDomicilio(dom);
    setTipo(suggestTipo(cuitVal, condVal));
  }

  function handleBillingTargetChange(target: "guest" | "company" | "agency") {
    setBillingTarget(target);
    setBillingEntityId("");
    if (target === "guest" && reservation) {
      fillFromReservation(reservation, "target_change");
    } else {
      setRazonSocial(""); setCuit(""); setDni(""); setCondicionIva("Consumidor Final"); setDomicilio("");
      setTipo("cierre_habitacion");
    }
  }

  function handleEntitySelect(id: string, entityType: "company" | "agency") {
    setBillingEntityId(id);
    const list = entityType === "company" ? companies : agencies;
    const entity = list.find((e: any) => String(e.id) === id);
    if (entity) applyEntity(entity, entityType);
  }

  // Payment row helpers
  function updateRow(id: string, field: keyof PaymentRow, value: any) {
    setPaymentRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }
  function addRow() {
    setPaymentRows(prev => [...prev, {
      id: newRowId(), amount: "", method: "efectivo", reference: "",
      retencionEnabled: false, retencionTipo: "iibb", retencionMonto: "",
    }]);
  }
  function removeRow(id: string) {
    setPaymentRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
  }

  // Computed totals
  const totalSelected = (() => {
    let t = 0;
    if (folio) {
      if (selectedIds.has("accommodation")) t += folio.roomTotal;
      (folio.charges || []).forEach((c: any) => { if (selectedIds.has(String(c.id))) t += parseFloat(c.amount); });
    }
    return t;
  })();

  const totalPayments = paymentRows.reduce((acc, r) => {
    const net = parseFloat(r.amount) || 0;
    const ret = r.retencionEnabled ? (parseFloat(r.retencionMonto) || 0) : 0;
    return acc + net + ret;
  }, 0);

  const saldoRestante = (folio?.balance || 0) - totalPayments;
  const isFiscalTipo = !NON_FISCAL.has(tipo);
  const ambiente: string = billingConfig?.arcaAmbiente ?? "ficticio";

  // Description editing helpers
  function startEdit(id: string, current: string) {
    setEditingId(id);
    setEditingValue(current);
  }
  function saveEdit() {
    if (editingId) {
      setItemDescriptions(prev => ({ ...prev, [editingId]: editingValue }));
      setEditingId(null);
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  // Gate: warn if user enters less than the full balance before actually submitting
  function handleSubmit() {
    if (paymentRows.some(r => !r.amount || parseFloat(r.amount) <= 0)) {
      toast({ title: "Ingresá un monto en cada forma de pago", variant: "destructive" });
      return;
    }
    if (saldoRestante > 0.01) {
      setShowPartialWarning(true);
      return;
    }
    doSubmit();
  }

  async function doSubmit() {
    if (paymentRows.some(r => !r.amount || parseFloat(r.amount) <= 0)) {
      toast({ title: "Ingresá un monto en cada forma de pago", variant: "destructive" });
      return;
    }
    if (billingTarget === "company" && !billingEntityId) {
      toast({ title: "Seleccioná la empresa a facturar", variant: "destructive" });
      return;
    }
    if (billingTarget === "agency" && !billingEntityId) {
      toast({ title: "Seleccioná la agencia a facturar", variant: "destructive" });
      return;
    }
    if (isFiscalTipo && !razonSocial.trim()) {
      toast({ title: "Ingresá el nombre / razón social", variant: "destructive" });
      return;
    }
    if (tipo === "FA") {
      const cuitClean = cuit.replace(/-/g, "");
      if (!cuitClean || !/^\d{11}$/.test(cuitClean)) {
        toast({ title: "Factura A requiere CUIT válido (11 dígitos)", variant: "destructive" });
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const receiptType = RECEIPT_TYPE_MAP[tipo] || "cierre_habitacion";

      // 1. Register each payment row — collect IDs for invoice linking
      const createdPaymentIds: number[] = [];
      for (const row of paymentRows) {
        const netAmount = parseFloat(row.amount) || 0;
        const retMonto = row.retencionEnabled ? (parseFloat(row.retencionMonto) || 0) : 0;
        const grossAmount = (netAmount + retMonto).toFixed(2);
        const notes = retMonto > 0
          ? JSON.stringify({ retencion: { tipo: row.retencionTipo, monto: retMonto, neto: netAmount } })
          : null;

        const res = await apiRequest("POST", "/api/payments", {
          reservationId,
          amount: grossAmount,
          method: row.method,
          date: getLocalToday(),
          reference: row.reference || null,
          notes,
          receiptType,
          billingTarget,
          companyId: billingTarget === "company" ? billingEntityId : null,
          agencyId: billingTarget === "agency" ? billingEntityId : null,
        });
        const resBody = await res.json();
        if (!res.ok) throw new Error(resBody?.error || "Error al registrar pago");
        if (resBody?.id) createdPaymentIds.push(resBody.id);
      }

      // 2. Emit invoice/comprobante
      let invoiceData: any = null;
      const invoiceItems = folio ? buildInvoiceItems(selectedIds, itemDescriptions, folio, tipo) : [];
      if (invoiceItems.length > 0) {
        const invoiceRes = await apiRequest("POST", "/api/billing/invoices", {
          tipoComprobante: tipo,
          cliente: {
            razonSocial: razonSocial || "Consumidor Final",
            cuit: cuit || undefined,
            dni: dni || undefined,
            condicionIva,
            domicilio: domicilio || undefined,
          },
          items: invoiceItems,
          reservaId: reservationId ? String(reservationId) : undefined,
          puntoVentaOverride: puntoVenta ? parseInt(puntoVenta) : undefined,
        });
        const invoiceBody = await invoiceRes.json();
        if (!invoiceRes.ok) throw new Error(invoiceBody?.error || invoiceBody?.message || "Error al emitir comprobante");
        invoiceData = invoiceBody;
        setTimeout(() => window.open(`/api/billing/invoices/${invoiceData.id}/pdf`, "_blank"), 300);

        // 2.5 Link each newly-created payment to this invoice (fire-and-forget, non-blocking)
        const invoiceRef = {
          id: invoiceData.id,
          tipoComprobante: invoiceData.tipo_comprobante,
          puntoVenta: invoiceData.punto_venta,
          numero: invoiceData.numero,
          cae: invoiceData.cae,
          total: invoiceData.monto_total,
        };
        for (const payId of createdPaymentIds) {
          apiRequest("PATCH", `/api/payments/${payId}/invoice`, { invoiceData: invoiceRef }).catch((e) =>
            console.warn("[PrefacturaDialog] invoice link failed for payment", payId, e)
          );
        }
      }

      // 3. Checkout if applicable
      if (mode === "checkout" && doCheckout) {
        const coRes = await apiRequest("POST", `/api/reservations/${reservationId}/check-out`, {});
        if (!coRes.ok) {
          const coBody = await coRes.json().catch(() => ({}));
          throw new Error(coBody?.error || "Error al realizar check-out");
        }
        setCheckoutDone(true);
        queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-out"] });
        queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/planning" });
        queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "folio"] });

      await refetchFolio();
      setEmittedInvoice(invoiceData);
      setStep(3);
      onCheckoutComplete?.();

    } catch (err: any) {
      setSubmitError(err.message || "Error inesperado");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    if (isSubmitting) return;
    onClose();
  }

  function resetForAnother() {
    setStep(1);
    setEmittedInvoice(null);
    setCheckoutDone(false);
    setSubmitError(null);
    setPaymentRows([{
      id: newRowId(), amount: String((folio?.balance || 0).toFixed(2)),
      method: "efectivo", reference: "", retencionEnabled: false, retencionTipo: "iibb", retencionMonto: "",
    }]);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // Invoices eligible for a Nota de Crédito (only FA / FB / FC / FT / FM)
  const ncEligibleInvoices = emittedInvoices.filter((inv: any) =>
    ["FA", "FB", "FT", "FM", "FC"].includes(inv.tipo_comprobante)
  );
  const ncDisabled = ncEligibleInvoices.length === 0;

  // Invoices eligible for a Nota de Débito (only FA / FB / FC / FT / FM)
  const ndEligibleInvoices = emittedInvoices.filter((inv: any) =>
    ["FA", "FB", "FT", "FM", "FC"].includes(inv.tipo_comprobante)
  );
  const ndDisabled = ndEligibleInvoices.length === 0;

  const reservationData = reservation as any;
  const isHistorical = reservationData?.checkOutDate < getLocalToday();
  const isEarlyCheckout = reservationData?.checkOutDate > getLocalToday();

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 1 && <><FileText className="h-5 w-5" />Prefactura</>}
            {step === 2 && <><Receipt className="h-5 w-5" />Registrar cobro</>}
            {step === 3 && <><CircleCheck className="h-5 w-5 text-green-600" />Resultado</>}
            {reservation && (
              <span className="font-normal text-muted-foreground text-sm ml-2">
                — {(reservation.guest as any)?.lastName} {(reservation.guest as any)?.firstName} · Hab. {(reservation.room as any)?.roomNumber}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        {step < 3 && (
          <div className="flex items-center gap-2 mb-1">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  step === s ? "bg-primary text-primary-foreground" : step > s ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {step > s ? <Check className="h-3.5 w-3.5" /> : s}
                </div>
                <span className={`text-sm ${step === s ? "font-semibold" : "text-muted-foreground"}`}>
                  {s === 1 ? "Prefactura" : "Cobro"}
                </span>
                {s < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            ))}
          </div>
        )}

        {/* ── STEP 1: Prefactura ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Alerts for checkout mode */}
            {mode === "checkout" && reservation && (reservation as any).status !== "checked_in" && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300">Check-in no procesado en el sistema. El check-out se registrará directamente.</p>
              </div>
            )}
            {mode === "checkout" && isHistorical && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300">Cierre histórico — salida programada: {formatDateAR(reservationData?.checkOutDate)}.</p>
              </div>
            )}
            {mode === "checkout" && isEarlyCheckout && (
              <div className="flex items-start gap-3 rounded-lg border border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/40 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                <p className="text-sm text-orange-800 dark:text-orange-300">Salida anticipada — la salida programada era {formatDateAR(reservationData?.checkOutDate)}.</p>
              </div>
            )}

            {/* Charges table */}
            {folioLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : folio ? (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="w-28 text-right">Total</TableHead>
                      <TableHead className="w-24 text-right">Ya cobrado</TableHead>
                      <TableHead className="w-24 text-right">Pendiente</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Accommodation row */}
                    {folio.roomTotal > 0 && (
                      <ChargeRow
                        id="accommodation"
                        amount={folio.roomTotal}
                        description={itemDescriptions["accommodation"] || `Alojamiento Hab. ${folio.roomNumber} (${folio.nights} noche${folio.nights !== 1 ? "s" : ""})`}
                        alreadyPaid={0}
                        selected={selectedIds.has("accommodation")}
                        onToggle={() => setSelectedIds(prev => { const n = new Set(prev); n.has("accommodation") ? n.delete("accommodation") : n.add("accommodation"); return n; })}
                        editing={editingId === "accommodation"}
                        editingValue={editingValue}
                        onStartEdit={() => startEdit("accommodation", itemDescriptions["accommodation"] || `Alojamiento Hab. ${folio.roomNumber} (${folio.nights} noche${folio.nights !== 1 ? "s" : ""})`)}
                        onEditChange={setEditingValue}
                        onSaveEdit={saveEdit}
                        onCancelEdit={() => setEditingId(null)}
                        onTransfer={() => { setTransferCharge({ id: "accommodation", description: `Alojamiento Hab. ${folio.roomNumber}`, maxAmount: transferRemaining?.accommodation ?? folio.roomTotal, originalAmount: folio.roomTotal }); setTransferDialogOpen(true); }}
                      />
                    )}
                    {/* Extra charges */}
                    {(() => {
                      // Build set of already-reversed charge IDs by scanning [rev:X] tags
                      const reversedIds = new Set<string>();
                      (folio.charges || []).forEach((c: any) => {
                        const m = c.description?.match(/\[rev:([^\]]+)\]/);
                        if (m) reversedIds.add(m[1]);
                      });
                      return (folio.charges || []).map((charge: any) => {
                        const isTransfer = charge.category === "transfer_out" || charge.category === "transfer_in";
                        const isReversal = charge.description?.includes("[rev:") ?? false;
                        const alreadyReversed = reversedIds.has(String(charge.id));
                        return (
                          <ChargeRow
                            key={charge.id}
                            id={String(charge.id)}
                            amount={parseFloat(charge.amount)}
                            description={itemDescriptions[String(charge.id)] || charge.description}
                            date={charge.date}
                            alreadyPaid={0}
                            selected={!isTransfer && selectedIds.has(String(charge.id))}
                            onToggle={() => { if (isTransfer) return; setSelectedIds(prev => { const n = new Set(prev); const k = String(charge.id); n.has(k) ? n.delete(k) : n.add(k); return n; }); }}
                            editing={editingId === String(charge.id)}
                            editingValue={editingValue}
                            onStartEdit={() => startEdit(String(charge.id), itemDescriptions[String(charge.id)] || charge.description)}
                            onEditChange={setEditingValue}
                            onSaveEdit={saveEdit}
                            onCancelEdit={() => setEditingId(null)}
                            onTransfer={isTransfer ? undefined : () => { setTransferCharge({ id: String(charge.id), description: charge.description, maxAmount: transferRemaining?.charges?.[String(charge.id)] ?? parseFloat(charge.amount), originalAmount: parseFloat(charge.amount) }); setTransferDialogOpen(true); }}
                            onRevert={(isTransfer && !isReversal && !alreadyReversed) ? () => { setRevertCharge({ id: String(charge.id), description: charge.description, amount: Math.abs(parseFloat(charge.amount)), category: charge.category }); setRevertDialogOpen(true); } : undefined}
                            alreadyReversed={alreadyReversed}
                            category={charge.category}
                          />
                        );
                      });
                    })()}
                    {/* Payments / advances already made */}
                    {(folio.payments || []).length > 0 && (
                      <>
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={6} className="py-1 px-3 text-xs text-muted-foreground font-medium">Cobros ya registrados</TableCell>
                        </TableRow>
                        {(folio.payments || []).map((p: any) => (
                          <TableRow key={p.id} className="opacity-60">
                            <TableCell />
                            <TableCell className="text-sm">
                              {PAYMENT_METHOD_LABELS[p.method] || p.method}
                              {p.date ? <span className="text-xs text-muted-foreground ml-2">{formatDateAR(p.date)}</span> : null}
                            </TableCell>
                            <TableCell className="text-right text-sm text-green-700 dark:text-green-400" colSpan={4}>
                              − ${fmtMoney(p.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
                {/* Totals row */}
                <div className="border-t bg-muted/30 px-4 py-3 flex flex-wrap gap-6 justify-end text-sm">
                  <div className="text-right">
                    <div className="text-muted-foreground text-xs">Total cargos seleccionados</div>
                    <div className="font-bold">${fmtMoney(totalSelected)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground text-xs">Ya cobrado</div>
                    <div className="font-medium text-green-700 dark:text-green-400">${fmtMoney(folio.totalPayments)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground text-xs">Saldo pendiente</div>
                    <div className={`font-bold text-base ${folio.balance > 0.01 ? "text-red-600" : "text-green-600"}`}>
                      ${fmtMoney(Math.max(0, folio.balance))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No se pudo cargar el folio.</p>
            )}

            {/* Facturar a */}
            <div className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Facturar a</Label>
                  <Select value={billingTarget} onValueChange={(v) => handleBillingTargetChange(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="guest"><span className="flex items-center gap-2"><User className="h-3.5 w-3.5" />Huésped</span></SelectItem>
                      <SelectItem value="company"><span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" />Empresa</span></SelectItem>
                      <SelectItem value="agency"><span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" />Agencia</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {billingTarget === "company" && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Empresa</Label>
                    <Select value={billingEntityId} onValueChange={(v) => handleEntitySelect(v, "company")}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar empresa..." /></SelectTrigger>
                      <SelectContent>
                        {companies.filter((c: any) => c.id).map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.razonSocial || c.nombreFantasia}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {billingTarget === "agency" && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Agencia</Label>
                    <Select value={billingEntityId} onValueChange={(v) => handleEntitySelect(v, "agency")}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar agencia..." /></SelectTrigger>
                      <SelectContent>
                        {agencies.filter((a: any) => a.id).map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.razonSocial || a.nombreFantasia}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Client info (editable) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Razón social / Nombre</Label>
                  <Input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Nombre o razón social" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">CUIT</Label>
                  <Input value={cuit} onChange={e => { setCuit(e.target.value); if (e.target.value) setTipo(suggestTipo(e.target.value, condicionIva)); }} placeholder="Sin CUIT" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Condición IVA</Label>
                  <Select value={condicionIva} onValueChange={v => { setCondicionIva(v); setTipo(suggestTipo(cuit, v)); }}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Responsable Inscripto","Consumidor Final","Monotributista","Exento","No Responsable"].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Domicilio (opcional)</Label>
                  <Input value={domicilio} onChange={e => setDomicilio(e.target.value)} placeholder="Dirección" className="h-8 text-sm" />
                </div>
              </div>

              {/* Invoice type & POS */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Tipo de comprobante</Label>
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPO_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isFiscalTipo && ambiente === "ficticio" && (
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />Modo ficticio — CAE simulado
                    </p>
                  )}
                  {!isFiscalTipo && (
                    <p className="text-xs text-muted-foreground mt-1">Comprobante interno, sin CAE</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Punto de venta</Label>
                  <Select value={puntoVenta} onValueChange={setPuntoVenta}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="PV..." /></SelectTrigger>
                    <SelectContent>
                      {posConfigs.map((p: any) => (
                        <SelectItem key={p.id} value={String(p.puntoVenta)}>
                          PV {String(p.puntoVenta).padStart(4, "0")} {p.nombre ? `— ${p.nombre}` : ""}
                          {p.isDefault ? " (predeterminado)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Checkout option */}
            {mode === "checkout" && (
              <div className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20 px-4 py-3">
                <Checkbox
                  id="do-checkout"
                  checked={doCheckout}
                  onCheckedChange={v => setDoCheckout(!!v)}
                />
                <label htmlFor="do-checkout" className="text-sm cursor-pointer">
                  <span className="font-medium">Hacer check-out al confirmar</span>
                  <span className="text-muted-foreground ml-1">— libera la habitación y registra la salida</span>
                </label>
              </div>
            )}

            <DialogFooter className="gap-2 flex-wrap">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              {emittedInvoices.length > 0 && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={ncDisabled ? 0 : undefined}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950/30 disabled:pointer-events-none"
                            onClick={() => setNcDialogOpen(true)}
                            disabled={ncDisabled}
                          >
                            <MinusCircle className="h-4 w-4 mr-1" />Nota de Crédito
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {ncDisabled && (
                        <TooltipContent side="top">
                          No hay facturas (FA/FB/FC/FT/FM) emitidas para esta reserva. La Nota de Crédito requiere al menos una factura base.
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={ndDisabled ? 0 : undefined}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-blue-700 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-950/30 disabled:pointer-events-none"
                            onClick={() => setNdDialogOpen(true)}
                            disabled={ndDisabled}
                          >
                            <PlusCircle className="h-4 w-4 mr-1" />Nota de Débito
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {ndDisabled && (
                        <TooltipContent side="top">
                          No hay facturas (FA/FB/FC/FT/FM) emitidas para esta reserva. La Nota de Débito requiere al menos una factura base.
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/reservations/${reservationId}/folio/pdf`, "_blank")}
              >
                <Printer className="h-4 w-4 mr-1" />Imprimir resumen
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-orange-700 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950/30"
                onClick={() => setShowBulkTransfer(true)}
                disabled={folioLoading || !folio}
              >
                <ArrowRightLeft className="h-4 w-4 mr-1" />Transferir a otra hab.
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={folioLoading || selectedIds.size === 0}
              >
                Siguiente — Cobro <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── STEP 2: Cobro ──────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Summary recap */}
            <div className="rounded-lg border bg-muted/20 px-4 py-3 flex flex-wrap gap-4 text-sm">
              <div><span className="text-muted-foreground">A facturar a: </span><span className="font-medium">{razonSocial || "—"}</span></div>
              <div><span className="text-muted-foreground">Tipo: </span>
                <span className="font-medium">{TIPO_OPTIONS.find(t => t.value === tipo)?.label || tipo}</span>
              </div>
              <div><span className="text-muted-foreground">Saldo: </span>
                <span className={`font-bold ${(folio?.balance || 0) > 0.01 ? "text-red-600" : "text-green-600"}`}>
                  ${fmtMoney(folio?.balance || 0)}
                </span>
              </div>
            </div>

            {/* Payment rows */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Formas de cobro</Label>
              <div className="space-y-3">
                {paymentRows.map((row, idx) => (
                  <div key={row.id} className="rounded-lg border p-3 space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
                        <Label className="text-xs text-muted-foreground mb-1 block">Monto</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.amount}
                          onChange={e => updateRow(row.id, "amount", e.target.value)}
                          placeholder="0.00"
                          className="h-8 text-sm"
                          data-testid={`input-payment-amount-${idx}`}
                        />
                      </div>
                      <div className="col-span-4">
                        <Label className="text-xs text-muted-foreground mb-1 block">Método</Label>
                        <Select value={row.method} onValueChange={v => updateRow(row.id, "method", v)}>
                          <SelectTrigger className="h-8 text-sm" data-testid={`select-payment-method-${idx}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                              <SelectItem key={v} value={v}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-4">
                        <Label className="text-xs text-muted-foreground mb-1 block">Referencia (opcional)</Label>
                        <Input
                          value={row.reference}
                          onChange={e => updateRow(row.id, "reference", e.target.value)}
                          placeholder="Nro. comprobante..."
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {paymentRows.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeRow(row.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Retention toggle */}
                    {!row.retencionEnabled ? (
                      <Button
                        type="button" variant="ghost" size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground"
                        onClick={() => updateRow(row.id, "retencionEnabled", true)}
                      >
                        <Percent className="h-3 w-3 mr-1" />Agregar retención impositiva
                      </Button>
                    ) : (
                      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1"><Percent className="h-3 w-3" />Retención impositiva</span>
                          <Button type="button" variant="ghost" size="sm" className="h-5 w-5 p-0 text-amber-700" onClick={() => { updateRow(row.id, "retencionEnabled", false); updateRow(row.id, "retencionMonto", ""); }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs mb-1 block">Tipo</Label>
                            <Select value={row.retencionTipo} onValueChange={v => updateRow(row.id, "retencionTipo", v)}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="iibb">IIBB (Ingresos Brutos)</SelectItem>
                                <SelectItem value="ganancias">Ganancias</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs mb-1 block">Monto retenido</Label>
                            <Input type="number" step="0.01" min="0" value={row.retencionMonto} onChange={e => updateRow(row.id, "retencionMonto", e.target.value)} placeholder="0.00" className="h-7 text-xs" />
                          </div>
                        </div>
                        {row.retencionMonto && parseFloat(row.retencionMonto) > 0 && row.amount && parseFloat(row.amount) > 0 && (
                          <p className="text-xs text-amber-800 dark:text-amber-300">
                            Neto ${fmtMoney(row.amount)} + Ret. {row.retencionTipo === "iibb" ? "IIBB" : "Ganancias"} ${fmtMoney(row.retencionMonto)} = <strong>Total cubierto: ${fmtMoney(parseFloat(row.amount) + parseFloat(row.retencionMonto))}</strong>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={addRow}>
                <Plus className="h-4 w-4 mr-1" />Agregar forma de pago
              </Button>
            </div>

            {/* Running totals */}
            <Card className={saldoRestante > 0.01 ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10" : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/10"}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="space-y-1">
                    <div className="flex gap-6">
                      <span className="text-muted-foreground">Total a cobrar: <span className="font-medium text-foreground">${fmtMoney(folio?.balance || 0)}</span></span>
                      <span className="text-muted-foreground">Registrado: <span className="font-medium text-green-600">${fmtMoney(totalPayments)}</span></span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Saldo restante</div>
                    <div className={`text-xl font-bold ${saldoRestante > 0.01 ? "text-red-600" : "text-green-600"}`}>
                      ${fmtMoney(Math.max(0, saldoRestante))}
                    </div>
                    {saldoRestante < -0.01 && <div className="text-xs text-amber-600">Sobrepago: ${fmtMoney(Math.abs(saldoRestante))}</div>}
                  </div>
                </div>
              </CardContent>
            </Card>

            {submitError && (
              <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 px-4 py-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-400">{submitError}</p>
              </div>
            )}

            <DialogFooter className="gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setStep(1)} disabled={isSubmitting}>
                <ChevronLeft className="h-4 w-4 mr-1" />Volver
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-orange-700 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950/30"
                onClick={() => setShowBulkTransfer(true)}
                disabled={isSubmitting || !folio}
              >
                <ArrowRightLeft className="h-4 w-4 mr-1" />Transferir a otra hab.
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                data-testid="button-registrar-emitir"
              >
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</>
                ) : (
                  <><Receipt className="h-4 w-4 mr-1" />Registrar y emitir</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── STEP 3: Resultado ──────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Success banner */}
            <Card className="border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/10">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40 shrink-0">
                  <CircleCheck className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  {checkoutDone
                    ? <p className="font-bold text-green-700 dark:text-green-400">Check-out completado</p>
                    : <p className="font-bold text-green-700 dark:text-green-400">Cobro registrado</p>
                  }
                  {emittedInvoice && (
                    <p className="text-sm text-green-700 dark:text-green-300 mt-0.5">
                      {emittedInvoice.tipo_comprobante} {padNum(emittedInvoice.punto_venta, 4)}-{padNum(emittedInvoice.numero, 8)}
                      {emittedInvoice.cae ? ` — CAE: ${emittedInvoice.cae}` : " (sin CAE)"}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Result table */}
            {folio && (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Cobrado</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-sm">Total cargos</TableCell>
                      <TableCell className="text-right font-medium">${fmtMoney(folio.grandTotal)}</TableCell>
                      <TableCell className="text-right text-green-700 dark:text-green-400">${fmtMoney(folio.totalPayments)}</TableCell>
                      <TableCell className={`text-right font-bold ${folio.balance > 0.01 ? "text-red-600" : "text-green-600"}`}>
                        ${fmtMoney(Math.max(0, folio.balance))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}

            {checkoutDone && (
              <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 px-4 py-3">
                <LogOut className="h-4 w-4 text-blue-600 shrink-0" />
                <p className="text-sm">La habitación <strong>{(reservation?.room as any)?.roomNumber}</strong> fue enviada a Housekeeping para limpieza.</p>
              </div>
            )}

            {emittedInvoice && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/billing/invoices/${emittedInvoice.id}/pdf`, "_blank")}
              >
                <Printer className="h-4 w-4 mr-1" />Ver / reimprimir comprobante
              </Button>
            )}

            <DialogFooter className="gap-2">
              {!checkoutDone && (folio?.balance || 0) > 0.01 && (
                <Button variant="outline" onClick={resetForAnother}>
                  <Receipt className="h-4 w-4 mr-1" />Emitir otro comprobante
                </Button>
              )}
              <Button onClick={onClose}>Cerrar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>

      {/* Transfer charge sub-dialog (single charge) */}
      <TransferChargeDialog
        open={transferDialogOpen}
        onClose={() => setTransferDialogOpen(false)}
        reservationId={reservationId}
        charge={transferCharge}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "folio"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "transfer-remaining"] });
          refetchFolio();
          refetchTransferRemaining();
        }}
      />

      {/* Bulk transfer sub-dialog */}
      <BulkTransferDialog
        open={showBulkTransfer}
        onClose={() => setShowBulkTransfer(false)}
        reservationId={reservationId}
        folio={folio ?? null}
        onSuccess={() => {
          setShowBulkTransfer(false);
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "folio"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "transfer-remaining"] });
          refetchFolio();
          refetchTransferRemaining();
        }}
      />

      {/* Partial payment warning dialog */}
      <Dialog open={showPartialWarning} onOpenChange={o => { if (!o) setShowPartialWarning(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Saldo sin abonar
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p>
              El monto ingresado cubre <strong>${fmtMoney(totalPayments)}</strong> pero el saldo del folio es{" "}
              <strong className="text-red-600 dark:text-red-400">${fmtMoney(folio?.balance || 0)}</strong>.
              Quedarán <strong className="text-red-600 dark:text-red-400">${fmtMoney(saldoRestante)}</strong> sin abonar.
            </p>
            <p className="text-muted-foreground">
              Si continuás, se emitirá el comprobante fiscal por el total de los cargos seleccionados
              y se registrará el pago parcial. El saldo restante quedará pendiente en el folio.
            </p>
            <p className="font-medium">¿Querés continuar igual?</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPartialWarning(false)}>
              Volver a revisar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => { setShowPartialWarning(false); doSubmit(); }}
            >
              Sí, continuar con saldo pendiente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reversal confirmation dialog */}
      <RevertTransferDialog
        open={revertDialogOpen}
        onClose={() => setRevertDialogOpen(false)}
        reservationId={reservationId}
        charge={revertCharge}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "folio"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "transfer-remaining"] });
          refetchFolio();
          refetchTransferRemaining();
        }}
      />

      {/* Nota de Crédito sub-dialog */}
      <NotaCreditoDialog
        open={ncDialogOpen}
        onClose={() => setNcDialogOpen(false)}
        reservationId={reservationId}
        invoices={emittedInvoices}
        payments={(folio?.payments || []).filter((p: any) => p.status !== "anulado")}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "folio"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "invoices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
          refetchFolio();
          refetchEmittedInvoices();
        }}
      />

      {/* Nota de Débito sub-dialog */}
      <NotaDebitoDialog
        open={ndDialogOpen}
        onClose={() => setNdDialogOpen(false)}
        reservationId={reservationId}
        invoices={ndEligibleInvoices}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "folio"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "invoices"] });
          queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
          refetchFolio();
          refetchEmittedInvoices();
        }}
      />
    </Dialog>
  );
}

// ─── NotaCreditoDialog sub-component ─────────────────────────────────────────

interface NcInvoice {
  id: number;
  tipo_comprobante: string;
  punto_venta: number;
  numero: number;
  fecha_emision: string;
  cliente_razon_social: string;
  cliente_cuit: string | null;
  cliente_condicion_iva: string;
  monto_total: string;
  monto_acreditado: string | null;
  estado: string;
  items: any[] | null;
}

interface NcItemRow {
  key: string;
  descripcion: string;
  subtotal: number;
  amount: string; // editable partial amount
  selected: boolean;
}

function NotaCreditoDialog({
  open, onClose, reservationId, invoices, payments, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  invoices: NcInvoice[];
  payments: any[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [ncItems, setNcItems] = useState<NcItemRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emittedNc, setEmittedNc] = useState<any>(null);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set());

  const selectedInvoice = invoices.find(inv => String(inv.id) === selectedInvoiceId) ?? null;

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedInvoiceId(invoices.length === 1 ? String(invoices[0].id) : "");
      setMotivo("");
      setNcItems([]);
      setEmittedNc(null);
      setSelectedPaymentIds(new Set());
    }
  }, [open]);

  // Build item rows when invoice changes
  useEffect(() => {
    if (!selectedInvoice) { setNcItems([]); return; }
    const montoTotal = parseFloat(selectedInvoice.monto_total);
    const montoAcreditado = parseFloat(selectedInvoice.monto_acreditado || "0");
    const saldoPendiente = montoTotal - montoAcreditado;

    const rawItems: any[] = Array.isArray(selectedInvoice.items) ? selectedInvoice.items : [];

    if (rawItems.length === 0) {
      // Single synthetic item for the full pending amount
      setNcItems([{
        key: "total",
        descripcion: `${selectedInvoice.tipo_comprobante} ${String(selectedInvoice.punto_venta).padStart(4,"0")}-${String(selectedInvoice.numero).padStart(8,"0")}`,
        subtotal: saldoPendiente,
        amount: saldoPendiente.toFixed(2),
        selected: true,
      }]);
    } else {
      // Scale items proportionally if there's already a partial credit
      const scaleFactor = saldoPendiente / montoTotal;
      setNcItems(rawItems.map((item: any, idx: number) => {
        const originalAmount = parseFloat(String(item.subtotal ?? item.precioUnitario ?? 0));
        const available = Math.max(0, originalAmount * scaleFactor);
        return {
          key: String(idx),
          descripcion: item.descripcion || `Ítem ${idx + 1}`,
          subtotal: available,
          amount: available.toFixed(2),
          selected: true,
        };
      }));
    }
  }, [selectedInvoiceId]);

  function toggleItem(key: string) {
    setNcItems(prev => prev.map(it => it.key === key ? { ...it, selected: !it.selected } : it));
  }

  function updateAmount(key: string, val: string) {
    setNcItems(prev => prev.map(it => it.key === key ? { ...it, amount: val } : it));
  }

  const totalNc = ncItems
    .filter(it => it.selected)
    .reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);

  const saldoPendienteInvoice = selectedInvoice
    ? parseFloat(selectedInvoice.monto_total) - parseFloat(selectedInvoice.monto_acreditado || "0")
    : 0;

  function togglePayment(payId: string) {
    setSelectedPaymentIds(prev => {
      const next = new Set(prev);
      next.has(payId) ? next.delete(payId) : next.add(payId);
      return next;
    });
  }

  async function handleSubmit() {
    if (!selectedInvoice) {
      toast({ title: "Seleccioná una factura", variant: "destructive" }); return;
    }
    if (totalNc <= 0) {
      toast({ title: "El monto de la NC debe ser mayor a $0", variant: "destructive" }); return;
    }
    if (totalNc > saldoPendienteInvoice + 0.01) {
      toast({ title: `El monto ($${fmtMoney(totalNc)}) supera el saldo pendiente de la factura ($${fmtMoney(saldoPendienteInvoice)})`, variant: "destructive" }); return;
    }
    if (!motivo.trim()) {
      toast({ title: "Ingresá un motivo para la Nota de Crédito", variant: "destructive" }); return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/billing/invoices/${selectedInvoice.id}/nota-credito`, {
        motivo: motivo.trim(),
        monto: totalNc,
        paymentIdsToVoid: Array.from(selectedPaymentIds),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || body?.message || "Error al emitir NC");

      setEmittedNc(body);
      const ncLabel = `${body.tipoComprobante ?? body.tipo_comprobante} ${String(body.puntoVenta ?? body.punto_venta ?? 0).padStart(4,"0")}-${String(body.numero ?? 0).padStart(8,"0")}`;
      const voidCount = body.voidedPaymentIds?.length ?? 0;
      toast({
        title: `NC emitida: ${ncLabel}`,
        description: voidCount > 0 ? `${voidCount} pago${voidCount !== 1 ? "s" : ""} anulado${voidCount !== 1 ? "s" : ""} — saldo del folio restaurado` : undefined,
      });
      onSuccess();

      // Auto-open PDF
      setTimeout(() => window.open(`/api/billing/invoices/${body.id}/pdf`, "_blank"), 300);
    } catch (err: any) {
      toast({ title: err.message || "Error inesperado", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (emittedNc) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleCheck className="h-5 w-5 text-green-600" />
              Nota de Crédito emitida
            </DialogTitle>
          </DialogHeader>
          <Card className="border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/10">
            <CardContent className="p-4 space-y-1 text-sm">
              <div className="font-bold text-green-700 dark:text-green-400">
                {emittedNc.tipoComprobante ?? emittedNc.tipo_comprobante}{" "}
                {String(emittedNc.puntoVenta ?? emittedNc.punto_venta ?? 0).padStart(4,"0")}-{String(emittedNc.numero ?? 0).padStart(8,"0")}
              </div>
              <div className="text-muted-foreground">Monto: <span className="font-medium text-foreground">${fmtMoney(emittedNc.montoTotal ?? emittedNc.monto_total)}</span></div>
              {emittedNc.cae && <div className="text-muted-foreground">CAE: <span className="font-mono text-xs">{emittedNc.cae}</span></div>}
            </CardContent>
          </Card>
          <DialogFooter className="gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => window.open(`/api/billing/invoices/${emittedNc.id}/pdf`, "_blank")}
            >
              <Printer className="h-4 w-4 mr-1" />Ver PDF
            </Button>
            <Button onClick={onClose}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MinusCircle className="h-5 w-5 text-amber-600" />
            Emitir Nota de Crédito
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Invoice selector */}
          {invoices.length > 1 && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Factura a acreditar</Label>
              <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar factura..." />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map(inv => {
                    const saldo = parseFloat(inv.monto_total) - parseFloat(inv.monto_acreditado || "0");
                    return (
                      <SelectItem key={inv.id} value={String(inv.id)}>
                        {inv.tipo_comprobante} {String(inv.punto_venta).padStart(4,"0")}-{String(inv.numero).padStart(8,"0")} — ${fmtMoney(saldo)} pendiente
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Invoice summary */}
          {selectedInvoice && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-1">
              <div className="font-medium">
                {selectedInvoice.tipo_comprobante}{" "}
                {String(selectedInvoice.punto_venta).padStart(4,"0")}-{String(selectedInvoice.numero).padStart(8,"0")}
                {" · "}{formatDateAR(selectedInvoice.fecha_emision)}
              </div>
              <div className="text-muted-foreground">
                <span>Cliente: </span><span className="text-foreground">{selectedInvoice.cliente_razon_social}</span>
                {selectedInvoice.cliente_cuit && <span className="ml-2 text-xs">CUIT {selectedInvoice.cliente_cuit}</span>}
              </div>
              <div className="text-muted-foreground flex gap-4">
                <span>Total: <span className="text-foreground font-medium">${fmtMoney(selectedInvoice.monto_total)}</span></span>
                {parseFloat(selectedInvoice.monto_acreditado || "0") > 0 && (
                  <span>Ya acreditado: <span className="text-amber-700 font-medium">${fmtMoney(selectedInvoice.monto_acreditado || "0")}</span></span>
                )}
                <span>Saldo disponible: <span className="font-bold text-green-700 dark:text-green-400">${fmtMoney(saldoPendienteInvoice)}</span></span>
              </div>
            </div>
          )}

          {/* Items table */}
          {ncItems.length > 0 && (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-32 text-right">Disponible</TableHead>
                    <TableHead className="w-36 text-right">Monto NC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ncItems.map(item => (
                    <TableRow key={item.key} className={!item.selected ? "opacity-40" : undefined}>
                      <TableCell>
                        <Checkbox checked={item.selected} onCheckedChange={() => toggleItem(item.key)} />
                      </TableCell>
                      <TableCell className="text-sm">{item.descripcion}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">${fmtMoney(item.subtotal)}</TableCell>
                      <TableCell className="text-right">
                        {item.selected ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={item.subtotal}
                            value={item.amount}
                            onChange={e => updateAmount(item.key, e.target.value)}
                            className="h-7 text-sm w-28 text-right ml-auto"
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t bg-muted/30 px-4 py-2 flex justify-end text-sm gap-2">
                <span className="text-muted-foreground">Total NC:</span>
                <span className="font-bold">${fmtMoney(totalNc)}</span>
              </div>
            </div>
          )}

          {/* Payment void selection — shown when there are active payments on the folio */}
          {selectedInvoice && payments.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-3 space-y-2">
              <div className="text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1">
                <RotateCcw className="h-3 w-3" />
                Anular cobros para restaurar el saldo del folio (opcional)
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Seleccioná los pagos que deben anularse. El monto volverá a aparecer como deuda pendiente en el folio.
              </p>
              <div className="space-y-1">
                {payments.map((p: any) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  >
                    <Checkbox
                      checked={selectedPaymentIds.has(String(p.id))}
                      onCheckedChange={() => togglePayment(String(p.id))}
                    />
                    <span className="text-sm flex-1">
                      {PAYMENT_METHOD_LABELS[p.method] || p.method}
                      {p.date ? <span className="text-xs text-muted-foreground ml-2">{formatDateAR(p.date)}</span> : null}
                      {p.reference ? <span className="text-xs text-muted-foreground ml-2">({p.reference})</span> : null}
                    </span>
                    <span className="text-sm font-medium text-amber-900 dark:text-amber-200">${fmtMoney(p.amount)}</span>
                  </label>
                ))}
              </div>
              {selectedPaymentIds.size > 0 && (
                <div className="text-xs text-amber-800 dark:text-amber-300 pt-1 border-t border-amber-200 dark:border-amber-700">
                  Se anularán {selectedPaymentIds.size} pago{selectedPaymentIds.size !== 1 ? "s" : ""} por un total de{" "}
                  <strong>
                    ${fmtMoney(payments.filter((p: any) => selectedPaymentIds.has(String(p.id))).reduce((acc: number, p: any) => acc + parseFloat(p.amount), 0))}
                  </strong>
                </div>
              )}
              {payments.some((p: any) => selectedPaymentIds.has(String(p.id)) && p.invoiceRef) && (
                <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40 px-3 py-2 mt-1">
                  <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-800 dark:text-blue-300 font-medium">
                    Uno o más pagos seleccionados están vinculados a una factura — revisá con administración antes de anular
                  </p>
                </div>
              )}
              {payments.some((p: any) => selectedPaymentIds.has(String(p.id)) && p.date < getLocalToday()) && (
                <div className="flex items-start gap-2 rounded-md border border-orange-300 bg-orange-100 dark:border-orange-700 dark:bg-orange-950/40 px-3 py-2 mt-1">
                  <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-orange-800 dark:text-orange-300 font-medium">
                    Estás anulando pagos de fechas anteriores — coordiná con administración
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Motivo */}
          {selectedInvoice && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Motivo <span className="text-red-500">*</span></Label>
              <Input
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: Error en facturación, devolución de servicio..."
                className="text-sm"
              />
            </div>
          )}

          {!selectedInvoice && invoices.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No hay facturas emitidas para esta reserva.</p>
          )}

          {!selectedInvoice && invoices.length > 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Seleccioná una factura para continuar.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedInvoice || totalNc <= 0 || !motivo.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" />Emitiendo...</>
            ) : (
              <><MinusCircle className="h-4 w-4 mr-1" />Emitir NC por ${fmtMoney(totalNc)}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── NotaDebitoDialog sub-component ──────────────────────────────────────────

function NotaDebitoDialog({
  open, onClose, reservationId, invoices, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  invoices: NcInvoice[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [monto, setMonto] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emittedNd, setEmittedNd] = useState<any>(null);

  const selectedInvoice = invoices.find(inv => String(inv.id) === selectedInvoiceId) ?? null;

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedInvoiceId(invoices.length === 1 ? String(invoices[0].id) : "");
      setMotivo("");
      setMonto("");
      setEmittedNd(null);
    }
  }, [open]);

  const montoNum = parseFloat(monto) || 0;

  async function handleSubmit() {
    if (!selectedInvoice) {
      toast({ title: "Seleccioná una factura de referencia", variant: "destructive" }); return;
    }
    if (montoNum <= 0) {
      toast({ title: "El monto debe ser mayor a $0", variant: "destructive" }); return;
    }
    if (!motivo.trim()) {
      toast({ title: "Ingresá un motivo para la Nota de Débito", variant: "destructive" }); return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/billing/invoices/${selectedInvoice.id}/nota-debito`, {
        motivo: motivo.trim(),
        monto: montoNum,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || body?.message || "Error al emitir ND");

      setEmittedNd(body);
      toast({ title: `ND emitida: ${body.tipoComprobante ?? body.tipo_comprobante} ${String(body.puntoVenta ?? body.punto_venta ?? 0).padStart(4,"0")}-${String(body.numero ?? 0).padStart(8,"0")}` });
      onSuccess();

      // Auto-open PDF
      setTimeout(() => window.open(`/api/billing/invoices/${body.id}/pdf`, "_blank"), 300);
    } catch (err: any) {
      toast({ title: err.message || "Error inesperado", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (emittedNd) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleCheck className="h-5 w-5 text-blue-600" />
              Nota de Débito emitida
            </DialogTitle>
          </DialogHeader>
          <Card className="border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/10">
            <CardContent className="p-4 space-y-1 text-sm">
              <div className="font-bold text-blue-700 dark:text-blue-400">
                {emittedNd.tipoComprobante ?? emittedNd.tipo_comprobante}{" "}
                {String(emittedNd.puntoVenta ?? emittedNd.punto_venta ?? 0).padStart(4,"0")}-{String(emittedNd.numero ?? 0).padStart(8,"0")}
              </div>
              <div className="text-muted-foreground">Monto: <span className="font-medium text-foreground">${fmtMoney(emittedNd.montoTotal ?? emittedNd.monto_total)}</span></div>
              {emittedNd.cae && <div className="text-muted-foreground">CAE: <span className="font-mono text-xs">{emittedNd.cae}</span></div>}
            </CardContent>
          </Card>
          <DialogFooter className="gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => window.open(`/api/billing/invoices/${emittedNd.id}/pdf`, "_blank")}
            >
              <Printer className="h-4 w-4 mr-1" />Ver PDF
            </Button>
            <Button onClick={onClose}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-blue-600" />
            Emitir Nota de Débito
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
            La Nota de Débito se emite cuando se facturó un monto menor al que correspondía. Se emite una ND por la diferencia.
          </div>

          {/* Invoice selector */}
          {invoices.length > 1 ? (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Factura de referencia</Label>
              <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar factura..." />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map(inv => (
                    <SelectItem key={inv.id} value={String(inv.id)}>
                      {inv.tipo_comprobante} {String(inv.punto_venta).padStart(4,"0")}-{String(inv.numero).padStart(8,"0")} — ${fmtMoney(inv.monto_total)} · {inv.cliente_razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : invoices.length === 1 && !selectedInvoiceId ? (
            // auto-select handled by useEffect; show nothing extra
            null
          ) : null}

          {/* Invoice summary */}
          {selectedInvoice && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-1">
              <div className="font-medium">
                {selectedInvoice.tipo_comprobante}{" "}
                {String(selectedInvoice.punto_venta).padStart(4,"0")}-{String(selectedInvoice.numero).padStart(8,"0")}
                {" · "}{formatDateAR(selectedInvoice.fecha_emision)}
              </div>
              <div className="text-muted-foreground">
                <span>Cliente: </span><span className="text-foreground">{selectedInvoice.cliente_razon_social}</span>
                {selectedInvoice.cliente_cuit && <span className="ml-2 text-xs">CUIT {selectedInvoice.cliente_cuit}</span>}
              </div>
              <div className="text-muted-foreground">
                Total facturado: <span className="text-foreground font-medium">${fmtMoney(selectedInvoice.monto_total)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                La ND se emitirá como <strong>{{
                  FA: "NDA (Nota de Débito A)",
                  FT: "NDT (Nota de Débito T)",
                  FM: "NDM (Nota de Débito MiPyme A)",
                  FC: "NDC (Nota de Débito C)",
                }[selectedInvoice.tipo_comprobante] ?? "NDB (Nota de Débito B)"}</strong>
              </div>
            </div>
          )}

          {/* Motivo */}
          {selectedInvoice && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Motivo / Descripción <span className="text-red-500">*</span></Label>
                <Input
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej: Diferencia de tarifa no facturada, cargo adicional..."
                  className="text-sm"
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Monto adicional a cobrar <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="text-sm"
                />
                {montoNum > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Se emitirá una ND por <strong>${fmtMoney(montoNum)}</strong> adicionales.
                  </p>
                )}
              </div>
            </>
          )}

          {invoices.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No hay facturas emitidas para esta reserva.</p>
          )}

          {invoices.length > 1 && !selectedInvoice && (
            <p className="text-sm text-muted-foreground text-center py-4">Seleccioná una factura para continuar.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedInvoice || montoNum <= 0 || !motivo.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" />Emitiendo...</>
            ) : (
              <><PlusCircle className="h-4 w-4 mr-1" />Emitir ND por ${fmtMoney(montoNum)}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ChargeRow sub-component ──────────────────────────────────────────────────

function ChargeRow({
  id, amount, description, date, alreadyPaid, selected, onToggle,
  editing, editingValue, onStartEdit, onEditChange, onSaveEdit, onCancelEdit,
  onTransfer, onRevert, alreadyReversed, category,
}: {
  id: string; amount: number; description: string; date?: string; alreadyPaid: number;
  selected: boolean; onToggle: () => void;
  editing: boolean; editingValue: string;
  onStartEdit: () => void; onEditChange: (v: string) => void;
  onSaveEdit: () => void; onCancelEdit: () => void;
  onTransfer?: () => void;
  onRevert?: () => void;
  alreadyReversed?: boolean;
  category?: string;
}) {
  const pending = Math.max(0, amount - alreadyPaid);
  const isTransferOut = category === "transfer_out";
  const isTransferIn = category === "transfer_in";
  const isTransfer = isTransferOut || isTransferIn;
  // A reversal counter-entry should not itself show a Revertir button
  const isReversal = isTransfer && description.includes("[rev:");

  // Strip machine-readable tags from visible description
  const cleanDescription = description
    .replace(/\s*\[xfer:[^\]]+\]/g, "")
    .replace(/\s*\[corr:[^\]]+\]/g, "")
    .replace(/\s*\[rev:[^\]]+\]/g, "")
    .replace(/\s*\[res:[^\]]+\]/g, "")
    .trim();

  // Parse paired reservation ID for transfer entries (embedded as [res:ID])
  const pairedResMatch = isTransfer ? description.match(/\[res:([^\]]+)\]/) : null;
  const pairedResId = pairedResMatch ? pairedResMatch[1] : null;

  // Render transfer description with the room number portion as a clickable link
  function renderTransferDescription() {
    if (!pairedResId) return <span className="text-sm">{cleanDescription}</span>;
    // Match "Hab.XXX" in the clean description and wrap it in a link
    const roomMatch = cleanDescription.match(/(.*?)(Hab\.\S+)(.*)/);
    if (!roomMatch) return <span className="text-sm">{cleanDescription}</span>;
    const [, before, roomPart, after] = roomMatch;
    return (
      <span className="text-sm">
        {before}
        <a
          href={`/reservations?view=${pairedResId}`}
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
          style={{ color: isTransferOut ? "#c2410c" : "#1d4ed8" }}
          title="Ver folio de la reserva relacionada"
          target="_blank"
          rel="noreferrer"
        >
          {roomPart}
        </a>
        {after}
      </span>
    );
  }

  const rowCls = isTransfer
    ? (isTransferOut
        ? "bg-orange-50/60 dark:bg-orange-950/20 opacity-80"
        : "bg-blue-50/60 dark:bg-blue-950/20 opacity-80")
    : (!selected ? "opacity-40" : undefined);

  return (
    <TableRow className={`${rowCls ?? ""} ${alreadyReversed ? "opacity-40" : ""}`}>
      <TableCell className="w-8">
        {isTransfer ? (
          <ArrowRightLeft className={`h-3.5 w-3.5 mx-auto ${isTransferOut ? "text-orange-500" : "text-blue-500"}`} />
        ) : (
          <Checkbox checked={selected} onCheckedChange={onToggle} />
        )}
      </TableCell>
      <TableCell>
        {editing && !isTransfer ? (
          <div className="flex items-center gap-1">
            <Input
              value={editingValue}
              onChange={e => onEditChange(e.target.value)}
              className="h-7 text-sm flex-1"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") onCancelEdit(); }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onSaveEdit}><Check className="h-3.5 w-3.5 text-green-600" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancelEdit}><X className="h-3.5 w-3.5 text-muted-foreground" /></Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            {isTransfer && (
              <Badge variant="outline" className={`text-[10px] px-1 py-0 shrink-0 ${isTransferOut ? "border-orange-400 text-orange-700 dark:text-orange-400" : "border-blue-400 text-blue-700 dark:text-blue-400"}`}>
                {isReversal ? "Reversa" : (isTransferOut ? "Transferencia salida" : "Transferencia entrada")}
              </Badge>
            )}
            {alreadyReversed && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 border-gray-400 text-gray-500 dark:text-gray-400">
                Revertida
              </Badge>
            )}
            {isTransfer ? renderTransferDescription() : <span className="text-sm">{cleanDescription}</span>}
            {date && <span className="text-xs text-muted-foreground">{formatDateAR(date)}</span>}
            {!isTransfer && (
              <Button
                size="icon" variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={onStartEdit}
              >
                <Edit2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            )}
          </div>
        )}
      </TableCell>
      <TableCell className={`text-right text-sm ${isTransferOut ? "text-orange-700 dark:text-orange-400" : isTransferIn ? "text-blue-700 dark:text-blue-400" : ""}`}>
        ${fmtMoney(amount)}
      </TableCell>
      <TableCell className="text-right text-sm text-green-700 dark:text-green-400">
        {alreadyPaid > 0 ? `$${fmtMoney(alreadyPaid)}` : "—"}
      </TableCell>
      <TableCell className="text-right text-sm font-medium">
        {isTransfer ? "—" : `$${fmtMoney(pending)}`}
      </TableCell>
      <TableCell className="w-10 text-right">
        {!isTransfer && onTransfer ? (
          <Button
            size="icon" variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-blue-600 shrink-0"
            title="Transferir a otra habitación"
            onClick={e => { e.stopPropagation(); onTransfer(); }}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </Button>
        ) : isTransfer && !isReversal && !alreadyReversed && onRevert ? (
          <Button
            size="icon" variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-red-600 shrink-0"
            title="Revertir transferencia"
            onClick={e => { e.stopPropagation(); onRevert(); }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

// ─── RevertTransferDialog sub-component ──────────────────────────────────────

export function RevertTransferDialog({
  open, onClose, reservationId, charge, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  charge: { id: string; description: string; amount: number; category: string } | null;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [partialResult, setPartialResult] = useState<{ otherRoom: string | null } | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) setPartialResult(null);
  }, [open]);

  if (!charge) return null;

  const isOut = charge.category === "transfer_out";
  const cleanDesc = charge.description
    .replace(/\s*\[xfer:[^\]]+\]/g, "")
    .replace(/\s*\[corr:[^\]]+\]/g, "")
    .replace(/\s*\[rev:[^\]]+\]/g, "")
    .trim();

  async function handleRevert() {
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/reservations/${reservationId}/reverse-transfer-charge`, {
        chargeId: charge!.id,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Error al revertir");

      if (!body.pairedReversed) {
        // Partial reversal — stay open to show the warning
        setPartialResult({ otherRoom: body.otherRoom ?? null });
        onSuccess();
      } else {
        toast({ title: body.message || "Transferencia revertida en ambos folios" });
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      toast({ title: err.message || "Error inesperado", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Partial-reversal result view
  if (partialResult !== null) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Reversión parcial
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/40 px-4 py-3">
              <CircleCheck className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <p className="text-sm text-green-800 dark:text-green-300">
                El cargo en <strong>este folio</strong> fue revertido correctamente.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                No se encontró el cargo correspondiente en el folio{partialResult.otherRoom ? ` de Hab. ${partialResult.otherRoom}` : " destino/origen"}.
                Revisá ese folio manualmente para completar la reversión.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-red-600" />
            Revertir transferencia
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Esto creará un cargo compensatorio para cancelar esta transferencia. La operación afectará ambos folios.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-2">
            <div>
              <span className="text-muted-foreground">Cargo a revertir: </span>
              <span className="font-medium">{cleanDesc}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Monto: </span>
              <span className="font-semibold">${fmtMoney(charge.amount)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Tipo: </span>
              <span className={isOut ? "text-orange-700 dark:text-orange-400" : "text-blue-700 dark:text-blue-400"}>
                {isOut ? "Transferencia salida (cargo negativo en este folio)" : "Transferencia entrada (cargo positivo en este folio)"}
              </span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Se creará un contra-cargo de <strong>${fmtMoney(charge.amount)}</strong> en este folio para neutralizar la transferencia, y se buscará el cargo correspondiente en el folio {isOut ? "destino" : "origen"} para revertirlo también.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleRevert}
            disabled={isSubmitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1" />Revirtiendo...</>
            ) : (
              <><RotateCcw className="h-4 w-4 mr-1" />Revertir transferencia</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── BulkTransferDialog sub-component ────────────────────────────────────────

function BulkTransferDialog({
  open, onClose, reservationId, folio, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  folio: PrefacturaFolioData | null;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [targetReservationId, setTargetReservationId] = useState("");
  const [includeAccommodation, setIncludeAccommodation] = useState(false);
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set());
  const [transferNote, setTransferNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch active reservations for the target picker
  const { data: activeReservations = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations", "active-for-transfer"],
    queryFn: async () => {
      const res = await fetch("/api/reservations");
      if (!res.ok) throw new Error("Error cargando reservas");
      const all: any[] = await res.json();
      return all.filter((r: any) =>
        (r.status === "checked_in" || r.status === "confirmed") &&
        String(r.id) !== String(reservationId)
      );
    },
    enabled: open,
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      setTargetReservationId("");
      setIncludeAccommodation(false);
      setSelectedChargeIds(new Set());
      setTransferNote("");
    }
  }, [open]);

  const billableCharges = (folio?.charges || []).filter(
    (c: any) => c.category !== "transfer_out" && c.category !== "transfer_in" && parseFloat(c.amount) > 0
  );

  const nothingSelected = !includeAccommodation && selectedChargeIds.size === 0;

  async function handleSubmit() {
    if (!targetReservationId) {
      toast({ title: "Seleccioná una habitación destino", variant: "destructive" }); return;
    }
    if (nothingSelected) {
      toast({ title: "Seleccioná al menos un cargo para transferir", variant: "destructive" }); return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/reservations/${reservationId}/bulk-transfer`, {
        targetReservationId,
        chargeIds: Array.from(selectedChargeIds),
        includeAccommodation,
        transferNote: transferNote.trim(),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Error al transferir");
      const parts: string[] = [];
      if (body.accommodationTransferred) parts.push("alojamiento");
      if (body.chargesTransferred > 0) parts.push(`${body.chargesTransferred} cargo(s)`);
      toast({ title: `Transferencia realizada: ${parts.join(" y ")} → otra habitación` });
      onSuccess();
    } catch (err: any) {
      toast({ title: err.message || "Error inesperado", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const targetRes = activeReservations.find((r: any) => String(r.id) === targetReservationId);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-orange-600" />
            Transferir a otra habitación
          </DialogTitle>
          <DialogDescription>
            Seleccioná los cargos que querés mover. El folio destino los recibirá para facturar allí.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Target reservation */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Habitación destino</Label>
            <Select value={targetReservationId} onValueChange={setTargetReservationId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar habitación activa..." />
              </SelectTrigger>
              <SelectContent>
                {activeReservations.map((r: any) => {
                  const roomNum = r.room?.roomNumber || "?";
                  const guestName = r.guest
                    ? `${r.guest.lastName ?? ""} ${r.guest.firstName ?? ""}`.trim()
                    : "Huésped";
                  const statusLabel = r.status === "checked_in" ? "CI" : "Conf.";
                  return (
                    <SelectItem key={r.id} value={String(r.id)}>
                      Hab. {roomNum} — {guestName} ({statusLabel})
                    </SelectItem>
                  );
                })}
                {activeReservations.length === 0 && (
                  <SelectItem value="_none" disabled>Sin reservas activas disponibles</SelectItem>
                )}
              </SelectContent>
            </Select>
            {targetRes && (
              <p className="text-xs text-muted-foreground">
                Destino: Hab. {targetRes.room?.roomNumber} — {targetRes.guest?.lastName} {targetRes.guest?.firstName}
              </p>
            )}
          </div>

          {/* Charges to transfer */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Cargos a transferir</Label>
            <div className="border rounded-lg divide-y">
              {/* Accommodation */}
              {(folio?.roomTotal ?? 0) > 0 && (
                <div className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    id="bulk-pfx-accommodation"
                    className="h-4 w-4 rounded border-gray-300 shrink-0"
                    checked={includeAccommodation}
                    onChange={e => setIncludeAccommodation(e.target.checked)}
                  />
                  <label htmlFor="bulk-pfx-accommodation" className="flex-1 flex justify-between items-center cursor-pointer text-sm gap-2">
                    <span className="font-medium">Alojamiento Hab. {folio?.roomNumber} ({folio?.nights} noche{folio?.nights !== 1 ? "s" : ""})</span>
                    <span className="font-semibold tabular-nums shrink-0">${fmtMoney(folio?.roomTotal ?? 0)}</span>
                  </label>
                </div>
              )}
              {/* Extra charges */}
              {billableCharges.length === 0 && (folio?.roomTotal ?? 0) === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">Sin cargos disponibles</div>
              ) : billableCharges.length > 0 ? (
                <>
                  {billableCharges.length > 1 && (
                    <div className="flex items-center gap-3 p-2 bg-muted/30">
                      <input
                        type="checkbox"
                        id="bulk-pfx-all"
                        className="h-4 w-4 rounded border-gray-300 shrink-0"
                        checked={selectedChargeIds.size === billableCharges.length}
                        onChange={e => {
                          if (e.target.checked) setSelectedChargeIds(new Set(billableCharges.map((c: any) => String(c.id))));
                          else setSelectedChargeIds(new Set());
                        }}
                      />
                      <label htmlFor="bulk-pfx-all" className="text-xs text-muted-foreground cursor-pointer">Seleccionar todos los consumos</label>
                    </div>
                  )}
                  {billableCharges.map((charge: any) => (
                    <div key={charge.id} className="flex items-center gap-3 p-3">
                      <input
                        type="checkbox"
                        id={`bulk-pfx-${charge.id}`}
                        className="h-4 w-4 rounded border-gray-300 shrink-0"
                        checked={selectedChargeIds.has(String(charge.id))}
                        onChange={e => {
                          const next = new Set(selectedChargeIds);
                          if (e.target.checked) next.add(String(charge.id));
                          else next.delete(String(charge.id));
                          setSelectedChargeIds(next);
                        }}
                      />
                      <label htmlFor={`bulk-pfx-${charge.id}`} className="flex-1 flex justify-between items-center cursor-pointer text-sm gap-2">
                        <span className="truncate">{charge.description}</span>
                        <span className="font-medium tabular-nums shrink-0">${fmtMoney(charge.amount)}</span>
                      </label>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Nota (opcional)</Label>
            <Input
              value={transferNote}
              onChange={e => setTransferNote(e.target.value)}
              placeholder="Ej: Folio Maestro grupo, pedido del huésped..."
              className="text-sm"
            />
          </div>

          {/* Preview */}
          {!nothingSelected && targetReservationId && (
            <div className="rounded-lg border bg-orange-50/60 dark:bg-orange-950/20 px-4 py-3 text-sm space-y-1">
              <p className="font-medium text-orange-700 dark:text-orange-400">Resultado de la transferencia</p>
              <p className="text-muted-foreground text-xs">
                Los cargos seleccionados se moverán al folio de Hab. {targetRes?.room?.roomNumber ?? "destino"}.
                Este folio quedará sin esos cargos y el destino los recibirá para facturar allí.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || nothingSelected || !targetReservationId}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {isSubmitting
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Transfiriendo...</>
              : <><ArrowRightLeft className="h-4 w-4 mr-1" />Transferir</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TransferChargeDialog({
  open, onClose, reservationId, charge, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  charge: { id: string; description: string; maxAmount: number; originalAmount?: number } | null;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [targetReservationId, setTargetReservationId] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch active reservations (checked_in and confirmed) for the target picker
  const { data: activeReservations = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations", "active-for-transfer"],
    queryFn: async () => {
      const res = await fetch("/api/reservations");
      if (!res.ok) throw new Error("Error cargando reservas");
      const all: any[] = await res.json();
      return all.filter((r: any) =>
        (r.status === "checked_in" || r.status === "confirmed") &&
        String(r.id) !== String(reservationId)
      );
    },
    enabled: open,
  });

  // Reset on open — default to the full remaining amount
  useEffect(() => {
    if (open && charge) {
      setAmount(charge.maxAmount > 0 ? String(charge.maxAmount.toFixed(2)) : "");
      setTargetReservationId("");
    }
  }, [open, charge?.id]);

  async function handleSubmit() {
    if (!targetReservationId) {
      toast({ title: "Seleccioná una habitación destino", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ title: "El monto debe ser mayor a 0", variant: "destructive" });
      return;
    }
    if (charge && amt > charge.maxAmount + 0.01) {
      toast({ title: `El monto no puede superar $${fmtMoney(charge.maxAmount)}`, variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/reservations/${reservationId}/transfer-charge`, {
        chargeId: charge?.id,
        amount: amt,
        targetReservationId,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Error al transferir");
      toast({ title: `Transferencia realizada: $${fmtMoney(amt)} → Hab. ${body.targetRoom}` });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: err.message || "Error inesperado", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!charge) return null;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transferir cargo a otra habitación
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Charge info */}
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">Cargo: </span><span className="font-medium">{charge.description}</span></div>
            {charge.originalAmount !== undefined && charge.originalAmount !== charge.maxAmount ? (
              <>
                <div><span className="text-muted-foreground">Total original: </span><span className="font-medium">${fmtMoney(charge.originalAmount)}</span></div>
                <div>
                  <span className="text-muted-foreground">Disponible para transferir: </span>
                  <span className={`font-semibold ${charge.maxAmount <= 0 ? "text-red-600" : "text-blue-700 dark:text-blue-400"}`}>
                    ${fmtMoney(charge.maxAmount)}
                  </span>
                  <span className="text-muted-foreground ml-1">(ya transferido: ${fmtMoney(charge.originalAmount - charge.maxAmount)})</span>
                </div>
              </>
            ) : (
              <div><span className="text-muted-foreground">Monto total: </span><span className="font-medium">${fmtMoney(charge.maxAmount)}</span></div>
            )}
          </div>

          {charge.maxAmount <= 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">Este cargo ya fue transferido en su totalidad. No hay saldo disponible para transferir.</p>
            </div>
          ) : (
            <>
              {/* Target room picker */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Habitación destino</Label>
                <Select value={targetReservationId} onValueChange={setTargetReservationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar habitación activa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeReservations.map((r: any) => {
                      const roomNum = r.room?.roomNumber || r.roomId || "?";
                      const guestName = r.guest
                        ? `${r.guest.lastName ?? ""} ${r.guest.firstName ?? ""}`.trim()
                        : "Huésped";
                      const statusLabel = r.status === "checked_in" ? "CI" : "Conf.";
                      return (
                        <SelectItem key={r.id} value={String(r.id)}>
                          Hab. {roomNum} — {guestName} ({statusLabel})
                        </SelectItem>
                      );
                    })}
                    {activeReservations.length === 0 && (
                      <SelectItem value="_none" disabled>Sin reservas activas disponibles</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Monto a transferir (máx. ${fmtMoney(charge.maxAmount)})
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={charge.maxAmount}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Se creará un descuento en este folio y se agregará el cargo al folio destino.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          {charge.maxAmount > 0 && (
            <Button onClick={handleSubmit} disabled={isSubmitting || !targetReservationId}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ArrowRightLeft className="h-4 w-4 mr-1" />}
              Transferir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
