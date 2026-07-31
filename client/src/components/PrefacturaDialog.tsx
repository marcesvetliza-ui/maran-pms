import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getLocalToday, fmtMoney, formatDateAR } from "@/lib/utils";
import type { ReservationWithDetails, PaymentMethod } from "@shared/schema";
import {
  LogOut, Receipt, Printer, Plus, Trash2, ChevronLeft, ChevronRight,
  CircleCheck, AlertCircle, Loader2, Percent, Building2, User,
  Edit2, Check, X, FileText, AlertTriangle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  { value: "FA", label: "Factura A", fiscal: true },
  { value: "FB", label: "Factura B", fiscal: true },
  { value: "FC", label: "Factura C (Monotributista)", fiscal: true },
  { value: "NCA", label: "Nota de Crédito A", fiscal: true },
  { value: "NCB", label: "Nota de Crédito B", fiscal: true },
  { value: "cierre_habitacion", label: "Cierre de habitación (no fiscal)", fiscal: false },
  { value: "ticket", label: "Ticket (no fiscal)", fiscal: false },
];

const NON_FISCAL = new Set(["cierre_habitacion", "ticket", "voucher_justo", "voucher_pedidos_ya", "cierre_spa"]);

const RECEIPT_TYPE_MAP: Record<string, string> = {
  FA: "factura_a", FB: "factura_b", FC: "factura_c",
  NCA: "factura_a", NCB: "factura_b",
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
  const isFC = tipo === "FC";

  function computeItem(descripcion: string, precio: number) {
    const base = precio;
    if (!isFiscal || isFC) {
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
  if (condicionIva === "Monotributista") return "FC";
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

  // When folio loads: select all items, pre-fill payment amount
  useEffect(() => {
    if (!folio || !open) return;
    const allIds = new Set<string>(["accommodation"]);
    (folio.charges || []).forEach((c: any) => allIds.add(String(c.id)));
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

  async function handleSubmit() {
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

      // 1. Register each payment row
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
          reservaId: Number(reservationId),
          puntoVentaOverride: puntoVenta ? parseInt(puntoVenta) : undefined,
        });
        const invoiceBody = await invoiceRes.json();
        if (!invoiceRes.ok) throw new Error(invoiceBody?.error || invoiceBody?.message || "Error al emitir comprobante");
        invoiceData = invoiceBody;
        setTimeout(() => window.open(`/api/billing/invoices/${invoiceData.id}/pdf`, "_blank"), 300);
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
                      />
                    )}
                    {/* Extra charges */}
                    {(folio.charges || []).map((charge: any) => (
                      <ChargeRow
                        key={charge.id}
                        id={String(charge.id)}
                        amount={parseFloat(charge.amount)}
                        description={itemDescriptions[String(charge.id)] || charge.description}
                        date={charge.date}
                        alreadyPaid={0}
                        selected={selectedIds.has(String(charge.id))}
                        onToggle={() => setSelectedIds(prev => { const n = new Set(prev); const k = String(charge.id); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                        editing={editingId === String(charge.id)}
                        editingValue={editingValue}
                        onStartEdit={() => startEdit(String(charge.id), itemDescriptions[String(charge.id)] || charge.description)}
                        onEditChange={setEditingValue}
                        onSaveEdit={saveEdit}
                        onCancelEdit={() => setEditingId(null)}
                      />
                    ))}
                    {/* Payments / advances already made */}
                    {(folio.payments || []).length > 0 && (
                      <>
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={5} className="py-1 px-3 text-xs text-muted-foreground font-medium">Cobros ya registrados</TableCell>
                        </TableRow>
                        {(folio.payments || []).map((p: any) => (
                          <TableRow key={p.id} className="opacity-60">
                            <TableCell />
                            <TableCell className="text-sm">
                              {PAYMENT_METHOD_LABELS[p.method] || p.method}
                              {p.date ? <span className="text-xs text-muted-foreground ml-2">{formatDateAR(p.date)}</span> : null}
                            </TableCell>
                            <TableCell className="text-right text-sm text-green-700 dark:text-green-400" colSpan={3}>
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

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/reservations/${reservationId}/folio/pdf`, "_blank")}
              >
                <Printer className="h-4 w-4 mr-1" />Imprimir resumen
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

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={isSubmitting}>
                <ChevronLeft className="h-4 w-4 mr-1" />Volver
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
    </Dialog>
  );
}

// ─── ChargeRow sub-component ──────────────────────────────────────────────────

function ChargeRow({
  id, amount, description, date, alreadyPaid, selected, onToggle,
  editing, editingValue, onStartEdit, onEditChange, onSaveEdit, onCancelEdit,
}: {
  id: string; amount: number; description: string; date?: string; alreadyPaid: number;
  selected: boolean; onToggle: () => void;
  editing: boolean; editingValue: string;
  onStartEdit: () => void; onEditChange: (v: string) => void;
  onSaveEdit: () => void; onCancelEdit: () => void;
}) {
  const pending = Math.max(0, amount - alreadyPaid);

  return (
    <TableRow className={!selected ? "opacity-40" : undefined}>
      <TableCell className="w-8">
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </TableCell>
      <TableCell>
        {editing ? (
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
            <span className="text-sm">{description}</span>
            {date && <span className="text-xs text-muted-foreground">{formatDateAR(date)}</span>}
            <Button
              size="icon" variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={onStartEdit}
            >
              <Edit2 className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
        )}
      </TableCell>
      <TableCell className="text-right text-sm">${fmtMoney(amount)}</TableCell>
      <TableCell className="text-right text-sm text-green-700 dark:text-green-400">
        {alreadyPaid > 0 ? `$${fmtMoney(alreadyPaid)}` : "—"}
      </TableCell>
      <TableCell className="text-right text-sm font-medium">
        ${fmtMoney(pending)}
      </TableCell>
    </TableRow>
  );
}
