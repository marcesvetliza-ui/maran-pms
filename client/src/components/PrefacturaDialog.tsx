import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest, parseApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getLocalToday, fmtMoney, formatDateAR } from "@/lib/utils";
import type { ReservationWithDetails, PaymentMethod } from "@shared/schema";
import {
  LogOut, Receipt, Printer, Plus, Trash2, ChevronLeft, ChevronRight,
  CircleCheck, AlertCircle, Loader2, Building2, User,
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

type SaleCondition = "contado" | "cuenta_corriente";

export interface PrefacturaDialogProps {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  reservation?: ReservationWithDetails | null;
  mode: "checkout" | "billing";
  onCheckoutComplete?: () => void;
}

export interface SelectedFolioItem {
  id: string;
  amount: number;
  description: string;
  originalAmount: number;
}

type InvoiceSource = {
  source_charge_ids?: unknown;
  source_charge_amounts?: unknown;
  credit_source_charge_amounts?: unknown;
  items?: unknown;
  monto_total?: string | number | null;
  monto_acreditado?: string | number | null;
};

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function getSourceIds(invoice: InvoiceSource): string[] {
  const ids = parseJsonValue(invoice.source_charge_ids);
  return Array.isArray(ids) ? ids.map(String) : [];
}

/**
 * Returns the still-active invoiced amount per source charge. New invoices
 * persist this mapping explicitly. For invoices issued before the mapping
 * existed, the saved item order is used as a backwards-compatible fallback.
 */
export function getInvoicedAmountsByCharge(invoices: InvoiceSource[]): Record<string, number> {
  const amounts: Record<string, number> = {};

  for (const invoice of invoices) {
    const total = parseFloat(String(invoice.monto_total || 0)) || 0;
    const credited = parseFloat(String(invoice.monto_acreditado || 0)) || 0;
    const explicit = parseJsonValue(invoice.source_charge_amounts);
    const creditMaps = parseJsonValue(invoice.credit_source_charge_amounts);
    const hasPerSourceCredits = Array.isArray(creditMaps);

    if (explicit && typeof explicit === "object" && !Array.isArray(explicit)) {
      for (const [id, value] of Object.entries(explicit as Record<string, unknown>)) {
        const amount = parseFloat(String(value)) || 0;
        const credit = hasPerSourceCredits
          ? creditMaps.reduce((sum, map) => sum + (parseFloat(String((map as Record<string, unknown>)?.[id])) || 0), 0)
          : amount * (total > 0 ? credited / total : 0);
        if (amount > 0) amounts[id] = (amounts[id] || 0) + Math.max(0, amount - credit);
      }
      continue;
    }

    const activeRatio = total > 0 ? Math.max(0, total - credited) / total : 1;
    const ids = getSourceIds(invoice);
    const invoiceItems = parseJsonValue(invoice.items);
    if (Array.isArray(invoiceItems) && invoiceItems.length === ids.length) {
      ids.forEach((id, index) => {
        const item = invoiceItems[index] as any;
        const amount = parseFloat(String(item?.subtotal ?? item?.precioUnitario ?? 0)) || 0;
        if (amount > 0) amounts[id] = (amounts[id] || 0) + amount * activeRatio;
      });
    } else if (ids.length === 1 && total > 0) {
      amounts[ids[0]] = (amounts[ids[0]] || 0) + (total - credited);
    }
  }

  return amounts;
}

export function getRemainingChargeAmounts(
  allOriginalItems: SelectedFolioItem[],
  invoicedAmounts: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(allOriginalItems.map((item) => [
    item.id,
    Math.max(0, item.amount - (invoicedAmounts[item.id] || 0)),
  ]));
}

/**
 * Credit notes retain the original charge and append a tagged negative
 * adjustment. Project those adjustments back onto their source only for
 * operational totals, keeping the original amount visible and auditable.
 */
export function getEffectiveFolioItemAmounts(
  folio: Pick<PrefacturaFolioData, "roomTotal" | "charges">,
): Record<string, number> {
  const amounts: Record<string, number> = { accommodation: folio.roomTotal };
  const adjustments: Record<string, number> = {};

  for (const charge of folio.charges || []) {
    const id = String(charge.id);
    const amount = parseFloat(String(charge.amount)) || 0;
    if (charge.category === "adjustment") {
      const sourceId = String(charge.description || "").match(/\[nc:\d+:([^\]]+)\]/)?.[1];
      if (sourceId) adjustments[sourceId] = (adjustments[sourceId] || 0) + amount;
      continue;
    }
    if (charge.category !== "transfer_out" && charge.category !== "transfer_in") {
      amounts[id] = amount;
    }
  }

  for (const [sourceId, adjustment] of Object.entries(adjustments)) {
    amounts[sourceId] = Math.max(0, (amounts[sourceId] || 0) + adjustment);
  }
  return amounts;
}

/**
 * Single source of truth for the items selected in Prefactura.
 * Transfer movements are folio adjustments and are never billable.
 */
export function getSelectedFolioItems(
  selectedIds: Set<string>,
  folio: Pick<PrefacturaFolioData, "roomTotal" | "roomNumber" | "nights" | "charges">,
  itemDescriptions: Record<string, string> = {},
  remainingAmounts?: Record<string, number>,
): SelectedFolioItem[] {
  const items: SelectedFolioItem[] = [];
  const effectiveAmounts = getEffectiveFolioItemAmounts(folio);

  const accommodationAmount = remainingAmounts?.accommodation ?? effectiveAmounts.accommodation;
  if (selectedIds.has("accommodation") && accommodationAmount > 0.01) {
    items.push({
      id: "accommodation",
      amount: accommodationAmount,
      originalAmount: folio.roomTotal,
      description: itemDescriptions.accommodation ||
        `Alojamiento Hab. ${folio.roomNumber} (${folio.nights} noche${folio.nights !== 1 ? "s" : ""})`,
    });
  }

  for (const charge of folio.charges || []) {
    if (charge.category === "transfer_out" || charge.category === "transfer_in" || charge.category === "adjustment") continue;
    const originalAmount = parseFloat(charge.amount);
    const id = String(charge.id);
    const amount = remainingAmounts?.[id] ?? effectiveAmounts[id] ?? originalAmount;
    if (selectedIds.has(id) && Number.isFinite(amount) && amount > 0.01) {
      items.push({
        id,
        amount,
        originalAmount,
        description: itemDescriptions[id] || charge.description,
      });
    }
  }

  return items;
}

export function getAllBillableFolioItems(
  folio: Pick<PrefacturaFolioData, "roomTotal" | "roomNumber" | "nights" | "charges">,
  itemDescriptions: Record<string, string> = {},
  remainingAmounts?: Record<string, number>,
): SelectedFolioItem[] {
  const allIds = new Set<string>();
  const effectiveAmounts = getEffectiveFolioItemAmounts(folio);
  if (effectiveAmounts.accommodation > 0) allIds.add("accommodation");
  for (const charge of folio.charges || []) {
    if (charge.category !== "transfer_out" && charge.category !== "transfer_in" && charge.category !== "adjustment" &&
      (effectiveAmounts[String(charge.id)] ?? 0) > 0) {
      allIds.add(String(charge.id));
    }
  }
  return getSelectedFolioItems(allIds, folio, itemDescriptions, remainingAmounts);
}

export function getSelectedFolioTotal(items: SelectedFolioItem[]): number {
  return items.reduce((total, item) => total + item.amount, 0);
}

/**
 * Payments belong to the reservation, not to an individual charge. Until a
 * payment is explicitly linked to an invoice, the folio applies it to billable
 * items in the same order shown to staff (accommodation, then charges). This
 * makes a partial selection safe: a payment consumed by an earlier charge
 * cannot silently make a later selected charge look paid.
 */
export function getSelectedFolioBalance(
  selectedItems: SelectedFolioItem[],
  allBillableItems: SelectedFolioItem[],
  payments: Array<{ amount: string | number; status?: string }> = [],
): number {
  const selectedIds = new Set(selectedItems.map((item) => item.id));
  let paymentRemaining = payments
    .filter((payment) => payment.status !== "anulado")
    .reduce((total, payment) => total + (parseFloat(String(payment.amount)) || 0), 0);
  let allocatedToSelection = 0;

  for (const item of allBillableItems) {
    if (paymentRemaining <= 0) break;
    const applied = Math.min(item.amount, paymentRemaining);
    if (selectedIds.has(item.id)) allocatedToSelection += applied;
    paymentRemaining -= applied;
  }

  return Math.max(0, getSelectedFolioTotal(selectedItems) - allocatedToSelection);
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
  // NC/ND types are intentionally excluded here — use the dedicated Nota de Crédito/Débito
  // buttons in the folio view. Showing them in this selector caused accidental NC creation.
  // "ticket" is also excluded — it belongs to restaurant/spa flows, not folio billing.
  { value: "cierre_habitacion", label: "Cierre de habitación (no fiscal)", fiscal: false },
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

const SALE_CONDITION_LABELS: Record<SaleCondition, string> = {
  contado: "Contado",
  cuenta_corriente: "Cuenta Corriente",
};

function normalizeVatCondition(value?: string | null): string {
  const normalized = (value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return VAT_MAP[normalized] || value?.trim() || "Consumidor Final";
}

function cleanIdentifier(value?: string | null): string {
  const cleaned = (value || "").trim();
  return /^0+$/.test(cleaned.replace(/\D/g, "")) ? "" : cleaned;
}

/**
 * A partial collection must generate a partial fiscal document as well.  Keep
 * the allocation deterministic (folio order) and persist the exact source
 * amounts that make up the emitted amount.
 */
export function projectItemsToInvoiceAmount(
  selectedItems: SelectedFolioItem[],
  requestedAmount: number,
): SelectedFolioItem[] {
  let remaining = Math.max(0, requestedAmount);
  const projected: SelectedFolioItem[] = [];
  for (const item of selectedItems) {
    if (remaining <= 0.009) break;
    const amount = Math.min(item.amount, remaining);
    if (amount > 0.009) projected.push({ ...item, amount: Number(amount.toFixed(2)) });
    remaining -= amount;
  }
  return projected;
}

function padNum(n: number | undefined, len: number) {
  return String(n ?? 0).padStart(len, "0");
}

// ─── Invoice items builder ────────────────────────────────────────────────────

function buildInvoiceItems(selectedItems: SelectedFolioItem[], tipo: string) {
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

  return selectedItems.map((item) => computeItem(item.description, item.amount));
}

// ─── Auto-suggest tipo from condicionIva / cuit ───────────────────────────────

export function suggestTipo(cuit: string, condicionIva: string): string {
  if (condicionIva === "Responsable Inscripto" || condicionIva === "Monotributista") {
    // The receiver's fiscal condition determines the document; the UI then
    // clearly asks for the CUIT that is mandatory for A.
    return "FA";
  }
  // Exento y consumidor final se documentan con B.
  return "FB";
}

export function isArgentineNationality(nationality?: string | null, nationalityCode?: string | null): boolean {
  const normalizedNationality = (nationality || "").trim().toLowerCase();
  const normalizedCode = (nationalityCode || "").trim().toUpperCase();
  return normalizedCode === "ARG" ||
    normalizedCode === "AR" ||
    normalizedCode === "200" ||
    ["argentina", "argentino", "argentina/a", "argentine"].includes(normalizedNationality);
}

let rowIdCounter = 0;
function newRowId() { return `row_${++rowIdCounter}`; }

// ─── Component ────────────────────────────────────────────────────────────────

export function PrefacturaDialog({
  open, onClose, reservationId, reservation, mode, onCheckoutComplete,
}: PrefacturaDialogProps) {
  const { toast } = useToast();

  // Tracks whether the folio has been initialized for the current open session
  // (false = first load, true = subsequent re-fetches after NC/ND/reversal)
  const folioInitializedRef = useRef(false);

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
  const [documentType, setDocumentType] = useState("");
  const [nationality, setNationality] = useState("");
  const [nationalityCode, setNationalityCode] = useState("");

  // Step 1: invoice config
  const [tipo, setTipo] = useState("FB");
  const [puntoVenta, setPuntoVenta] = useState("");
  const [saleCondition, setSaleCondition] = useState<SaleCondition>("contado");
  const [doCheckout, setDoCheckout] = useState(true);

  // Step 2: payments
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    { id: newRowId(), amount: "", method: "efectivo", reference: "", retencionEnabled: false, retencionTipo: "iibb", retencionMonto: "" },
  ]);
  const [invoiceObservations, setInvoiceObservations] = useState("");

  // Step 3: result
  const [emittedInvoice, setEmittedInvoice] = useState<any>(null);
  const [checkoutDone, setCheckoutDone] = useState(false);
  // True when payment+invoice succeeded but the checkout API call itself failed —
  // staff must complete checkout manually; the folio data is already persisted.
  const [checkoutFailed, setCheckoutFailed] = useState(false);
  // True when at least one payment row was actually persisted in this submit.
  const [paymentRegistered, setPaymentRegistered] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Transfer charge sub-dialog (single charge)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferCharge, setTransferCharge] = useState<{ id: string; description: string; maxAmount: number; originalAmount?: number } | null>(null);

  // Bulk transfer dialog
  const [showBulkTransfer, setShowBulkTransfer] = useState(false);

  // Partial payment warning
  const [showPartialWarning, setShowPartialWarning] = useState(false);

  // True when a folio re-fetch (after NC/ND/reversal) changed the balance while the
  // user already had multiple payment rows — we leave the rows untouched but surface
  // a visible notice so staff know they need to re-balance their split.
  const [splitBalanceChanged, setSplitBalanceChanged] = useState(false);

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

  // On open: reset step and mark folio as not-yet-initialized for this session
  useEffect(() => {
    if (open) {
      setStep(1);
      setEmittedInvoice(null);
      setCheckoutDone(false);
      setCheckoutFailed(false);
      setPaymentRegistered(false);
      setSubmitError(null);
      setItemDescriptions({});
      setEditingId(null);
      setSplitBalanceChanged(false);
      setInvoiceObservations("");
      setSaleCondition("contado");
      folioInitializedRef.current = false;
    }
  }, [open]);

  // When folio loads or balance changes: sync selected items and payment amount.
  //
  // Initial load (folioInitializedRef = false): full reset — select all billable
  // items and create a fresh single payment row for the full balance.
  //
  // Subsequent re-fetches (folioInitializedRef = true, triggered by NC/ND/reversal
  // actions inside the dialog): keep the user's existing payment rows (method,
  // reference, etc.) but update the amount so the row always reflects the current
  // balance.  If the user split into multiple rows we leave them untouched and let
  // the saldoRestante indicator surface any mismatch — they can adjust manually.
  useEffect(() => {
    if (!folio || !open) return;

    if (!folioInitializedRef.current) {
      // ── Initial load ────────────────────────────────────────────────────────
      folioInitializedRef.current = true;

      const allIds = new Set(getAllBillableFolioItems(folio).map(item => item.id));
      setSelectedIds(allIds);

      const initialItems = getSelectedFolioItems(allIds, folio);
      const initialBalance = getSelectedFolioBalance(
        initialItems,
        initialItems,
        folio.payments || [],
      );
      if (initialBalance > 0.01) {
        setPaymentRows([{
          id: newRowId(), amount: String(initialBalance.toFixed(2)), method: "efectivo",
          reference: "", retencionEnabled: false, retencionTipo: "iibb", retencionMonto: "",
        }]);
      }
    } else {
      // ── Re-fetch after NC / ND / reversal ───────────────────────────────────
      // Also re-sync selected items in case new charges appeared or were voided.
      // Update payment amount only when there is exactly one payment row so we
      // do not silently discard a custom multi-row split the user already set up.
      // When the user has multiple rows we leave them untouched and instead show
      // a visible notice so staff know they need to re-balance their split.
      setPaymentRows(prev => {
        if (prev.length === 1) {
          return [{
            ...prev[0],
            amount: prev[0].amount,
          }];
        }
        // Multiple rows — flag the mismatch but leave amounts intact.
        // Only show the warning when there is actually a balance to re-split;
        // if the balance is now zero (e.g. after a full NC) the warning is misleading.
        if (prev.some(row => (parseFloat(row.amount) || 0) > 0)) setSplitBalanceChanged(true);
        return prev;
      });
    }
  // A refetch must never reselect an already invoiced item or overwrite the
  // selection-specific payment allocation shown to the user.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folio?.balance, open]);

  // When reservation loads: auto-fill client data
  useEffect(() => {
    if (!reservation || !open) return;
    fillFromReservation(reservation, "init");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation?.id, open]);

  // Auto-suggest default POS
  useEffect(() => {
    if (posConfigs.length > 0 && !puntoVenta) {
      const activePos = posConfigs.filter((p: any) => p.activo !== false);
      const configuredPos = activePos.find((p: any) => p.numero === billingConfig?.puntoVenta);
      const defaultPos = configuredPos || activePos[0];
      if (defaultPos) setPuntoVenta(String(defaultPos.numero));
    } else if (!puntoVenta && billingConfig?.puntoVenta) {
      setPuntoVenta(String(billingConfig.puntoVenta));
    }
  }, [posConfigs, billingConfig?.puntoVenta, puntoVenta]);

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
      const rawCuit = cleanIdentifier(g.cuilCuit).replace(/\D/g, "").slice(0, 11);
      const cuitVal = rawCuit.length <= 2 ? rawCuit : rawCuit.length <= 10
        ? `${rawCuit.slice(0,2)}-${rawCuit.slice(2)}`
        : `${rawCuit.slice(0,2)}-${rawCuit.slice(2,10)}-${rawCuit[10]}`;
      const dniVal = !rawCuit ? cleanIdentifier(g.documentNumber) : "";
      const condVal = normalizeVatCondition(g.vatCondition);
      setRazonSocial(name);
      setCuit(cuitVal);
      setDni(dniVal);
      setCondicionIva(condVal);
      setDomicilio([g.direccion, g.localidad].filter(Boolean).join(", "));
      setDocumentType(g.documentType || (cuitVal ? "CUIT" : "DNI"));
      setNationality(g.nationality || "");
      setNationalityCode(g.nationalityCode || "");
      setSaleCondition(g.condicionVentaPredeterminada === "cuenta_corriente" ? "cuenta_corriente" : "contado");
      setTipo(suggestTipo(cuitVal, condVal));
    }
  }

  function applyEntity(e: any, type: "company" | "agency") {
    const rs = e.razonSocial || e.nombreFantasia || "";
    const rawCuit = cleanIdentifier(e.cuilCuit).replace(/\D/g, "").slice(0, 11);
    const cuitVal = rawCuit.length <= 2 ? rawCuit : rawCuit.length <= 10
      ? `${rawCuit.slice(0,2)}-${rawCuit.slice(2)}`
      : `${rawCuit.slice(0,2)}-${rawCuit.slice(2,10)}-${rawCuit[10]}`;
    const condVal = normalizeVatCondition(e.condicionIva || (cuitVal ? "responsable_inscripto" : "consumidor_final"));
    const dom = e.domicilio || e.direccion || "";
    setRazonSocial(rs);
    setCuit(cuitVal);
    setDni("");
    setCondicionIva(condVal);
    setDomicilio(dom);
    setDocumentType("CUIT");
    setNationality("");
    setNationalityCode("");
    setSaleCondition(e.condicionVentaPredeterminada === "cuenta_corriente" ? "cuenta_corriente" : "contado");
    setTipo(suggestTipo(cuitVal, condVal));
  }

  function handleBillingTargetChange(target: "guest" | "company" | "agency") {
    setBillingTarget(target);
    setBillingEntityId("");
    if (target === "guest" && reservation) {
      fillFromReservation(reservation, "target_change");
    } else {
      setRazonSocial(""); setCuit(""); setDni(""); setCondicionIva("Consumidor Final"); setDomicilio("");
      setDocumentType(""); setNationality(""); setNationalityCode("");
      setTipo("FB");
    }
  }

  function handleEntitySelect(id: string, entityType: "company" | "agency") {
    setBillingEntityId(id);
    const list = entityType === "company" ? companies : agencies;
    const entity = list.find((e: any) => String(e.id) === id);
    if (entity) applyEntity(entity, entityType);
  }

  // Clear the split-balance warning whenever rows drop to a single entry,
  // regardless of which action caused the transition (removeRow, method change, etc.)
  useEffect(() => {
    if (paymentRows.length === 1) setSplitBalanceChanged(false);
  }, [paymentRows.length]);

  // Payment row helpers
  function updateRow(id: string, field: keyof PaymentRow, value: any) {
    setPaymentRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    // Any edit to an amount row dismisses the split-balance-changed notice
    if (field === "amount") setSplitBalanceChanged(false);
  }
  function addRow() {
    setPaymentRows(prev => {
      const nextMethod = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[])
        .find(method => !prev.some(row => row.method === method));
      if (!nextMethod) {
        toast({ title: "Ya se agregaron todas las formas de cobro disponibles", variant: "destructive" });
        return prev;
      }
      return [...prev, {
      id: newRowId(), amount: "", method: nextMethod, reference: "",
      retencionEnabled: false, retencionTipo: "iibb", retencionMonto: "",
      }];
    });
  }
  function removeRow(id: string) {
    setPaymentRows(prev => {
      if (prev.length <= 1) return prev;
      const next = prev.filter(r => r.id !== id);
      if (next.length === 1) setSplitBalanceChanged(false);
      return next;
    });
  }

  // Computed totals. All downstream operations use this same selected-item
  // projection so changing the fiscal recipient cannot change the amount.
  const originalBillableItems = folio
    ? getAllBillableFolioItems(folio, itemDescriptions)
    : [];
  const invoicedAmountsByCharge = getInvoicedAmountsByCharge(emittedInvoices);
  const remainingAmountsByCharge = getRemainingChargeAmounts(
    originalBillableItems,
    invoicedAmountsByCharge,
  );
  const selectedItems = folio
    ? getSelectedFolioItems(selectedIds, folio, itemDescriptions, remainingAmountsByCharge)
    : [];
  const allBillableItems = folio
    ? getAllBillableFolioItems(folio, itemDescriptions, remainingAmountsByCharge)
    : [];
  const totalSelected = getSelectedFolioTotal(selectedItems);
  const selectedBalance = getSelectedFolioBalance(
    selectedItems,
    allBillableItems,
    (folio?.payments || []).filter((payment: any) =>
      payment.status !== "anulado" && !payment.invoiceRef && !payment.invoice_ref && !payment.invoiceLinkFailed
    ),
  );
  const selectedAlreadyPaid = totalSelected - selectedBalance;
  const selectedSourceIds = selectedItems.map(item => item.id);
  // Payments are cash received, not a fiscal discount. Once an invoice is
  // emitted for the selected residual, link the fully applied advances to it
  // so they stop appearing as "paid without invoice" on the folio.
  let remainingAdvanceToLink = selectedAlreadyPaid;
  const selectedAdvancePaymentIds = (folio?.payments || [])
    .filter((payment: any) => payment.status !== "anulado" && !payment.invoiceRef && !payment.invoice_ref && !payment.invoiceLinkFailed)
    .filter((payment: any) => {
      const amount = parseFloat(payment.amount || "0");
      if (amount <= 0.01 || amount > remainingAdvanceToLink + 0.01) return false;
      remainingAdvanceToLink -= amount;
      return true;
    })
    .map((payment: any) => payment.id as string);

  const totalPayments = paymentRows.reduce((acc, r) => {
    const net = parseFloat(r.amount) || 0;
    const ret = r.retencionEnabled ? (parseFloat(r.retencionMonto) || 0) : 0;
    return acc + net + ret;
  }, 0);

  const saldoRestante = selectedBalance - totalPayments;
  const invoiceAmount = saleCondition === "cuenta_corriente"
    ? totalSelected
    : Math.min(totalSelected, selectedAlreadyPaid + totalPayments);
  const invoiceItemsToEmit = projectItemsToInvoiceAmount(selectedItems, invoiceAmount);
  const invoiceSourceAmounts = Object.fromEntries(invoiceItemsToEmit.map(item => [item.id, item.amount]));
  const invoiceSourceIds = invoiceItemsToEmit.map(item => item.id);
  const isFiscalTipo = !NON_FISCAL.has(tipo);
  const isFacturaA = tipo === "FA" || tipo === "FM";
  const facturaANeedsCuit = isFacturaA && cuit.replace(/\D/g, "").length !== 11;
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

  // Cash settlement does not mean fiscal settlement: a fully paid folio with
  // an unbilled advance must still allow an invoice. Only block a new invoice
  // when every billable source has no amount left to invoice.
  const alreadyPaidAndInvoiced = originalBillableItems.length > 0
    && originalBillableItems.every((item) => (remainingAmountsByCharge[item.id] || 0) <= 0.01);

  // A source remains selectable after a partial invoice. It is disabled only
  // when its remaining amount reaches zero.
  const fullyInvoicedChargeIds = new Set<string>(
    originalBillableItems
      .filter((item) => (remainingAmountsByCharge[item.id] || 0) <= 0.01)
      .map((item) => item.id)
  );

  // An invoice query may resolve after the folio query. Remove its source
  // charges from the default selection instead of re-offering them on reload.
  useEffect(() => {
    if (!open || fullyInvoicedChargeIds.size === 0) return;
    setSelectedIds(previous => {
      const next = new Set(Array.from(previous).filter(id => !fullyInvoicedChargeIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  // emittedInvoices is the stable query result; fullyInvoicedChargeIds is rebuilt
  // on each render and must not itself be used as an effect dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, emittedInvoices]);

  // A linked company/agency is a billing option, never a forced recipient:
  // reception must still be able to issue the stay to the guest.
  const hasReservationCompany = !!(reservation?.companyId || (reservation as any)?.company?.id);
  const hasReservationAgency = !!(reservation?.agencyId || (reservation as any)?.agency?.id);
  const allowedBillingTargets: Array<"guest" | "company" | "agency"> = hasReservationCompany
    ? ["guest", "company"]
    : hasReservationAgency
      ? ["guest", "agency"]
      : ["guest"];
  const billingTargetLocked = false;
  const hasSelectedAccommodation = selectedSourceIds.includes("accommodation");
  const canIssueFacturaT = billingTarget === "guest" &&
    hasSelectedAccommodation &&
    !!(nationality || nationalityCode) &&
    !isArgentineNationality(nationality, nationalityCode);

  // Comprobante availability is based on the recipient. Factura T is only for a
  // foreign guest with accommodation in the selected items.
  const filteredTipoOptions = TIPO_OPTIONS.filter(opt => {
    if (opt.value === "cierre_habitacion") return true; // always available as fallback
    if (opt.value === "FT") return canIssueFacturaT;
    if (["Responsable Inscripto", "Monotributista"].includes(condicionIva)) return ["FA", "FM"].includes(opt.value);
    return opt.value === "FB";
  });

  useEffect(() => {
    if (!filteredTipoOptions.some(option => option.value === tipo)) {
      setTipo(suggestTipo(cuit, condicionIva));
    }
  }, [tipo, cuit, condicionIva, canIssueFacturaT, filteredTipoOptions]);

  // Keep the single payment row aligned with the selected subset. Clear a stale
  // amount when the user unchecks every item.
  useEffect(() => {
    if (step === 3) return; // don't interfere with result state
    setPaymentRows(prev =>
      prev.length === 1
        ? [{ ...prev[0], amount: selectedBalance > 0.01 ? selectedBalance.toFixed(2) : "" }]
        : prev
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBalance]);

  // ── Submit ──────────────────────────────────────────────────────────────────

  // Gate: warn if user enters less than the full balance before actually submitting
  function handleSubmit() {
    if (totalSelected <= 0.01) {
      toast({ title: "Seleccioná al menos un cargo para facturar", variant: "destructive" });
      return;
    }
    const balanceOwed = selectedBalance;
    // When the folio is already fully covered (zero or negative balance), skip the
    // "must enter an amount" guard — no new payment is needed.
    if (saleCondition === "contado" && balanceOwed > 0.01) {
      if (paymentRows.some(r => !r.amount || parseFloat(r.amount) <= 0)) {
        toast({ title: "Ingresá un monto en cada forma de pago", variant: "destructive" });
        return;
      }
      if (saldoRestante > 0.01) {
        setShowPartialWarning(true);
        return;
      }
    }
    doSubmit();
  }

  async function doSubmit() {
    if (totalSelected <= 0.01 && !alreadyPaidAndInvoiced) {
      toast({ title: "Seleccioná al menos un cargo para facturar", variant: "destructive" });
      return;
    }
    const balanceOwed = selectedBalance;
    // Same guard: only require amounts when there is an actual outstanding balance.
    if (saleCondition === "contado" && balanceOwed > 0.01 && paymentRows.some(r => !r.amount || parseFloat(r.amount) <= 0)) {
      toast({ title: "Ingresá un monto en cada forma de pago", variant: "destructive" });
      return;
    }
    if (!alreadyPaidAndInvoiced && facturaANeedsCuit) {
      toast({ title: "Factura A requiere CUIT válido (11 dígitos)", variant: "destructive" });
      return;
    }
    if (!alreadyPaidAndInvoiced && saleCondition === "cuenta_corriente" &&
      ((billingTarget !== "company" && billingTarget !== "agency") || !billingEntityId)) {
      toast({
        title: "Cuenta Corriente requiere una empresa o agencia",
        description: "Seleccioná una entidad receptora antes de emitir el comprobante.",
        variant: "destructive",
      });
      return;
    }
    // Empresa/Agencia: se puede facturar sin entidad pre-registrada si se ingresó
    // razón social a mano. El CUIT se valida más abajo para Factura A.
    if (!alreadyPaidAndInvoiced && billingTarget === "company" && !billingEntityId && !razonSocial.trim()) {
      toast({ title: "Ingresá la razón social de la empresa o seleccionala del listado", variant: "destructive" });
      return;
    }
    if (!alreadyPaidAndInvoiced && billingTarget === "agency" && !billingEntityId && !razonSocial.trim()) {
      toast({ title: "Ingresá la razón social de la agencia o seleccionala del listado", variant: "destructive" });
      return;
    }
    if (!alreadyPaidAndInvoiced && isFiscalTipo && !razonSocial.trim()) {
      toast({ title: "Ingresá el nombre / razón social", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const receiptType = RECEIPT_TYPE_MAP[tipo] || "cierre_habitacion";

      // Guard: if the folio is already fully paid AND has invoices, skip payment+invoice
      // and go straight to checkout. This prevents duplicate invoices.
      if (alreadyPaidAndInvoiced) {
        let checkoutDidFail = false;
        if (mode === "checkout" && doCheckout) {
          try {
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
            onCheckoutComplete?.();
          } catch (coErr: any) {
            checkoutDidFail = true;
            setCheckoutFailed(true);
          }
        }
        if (checkoutDidFail) {
          setEmittedInvoice(null);
          setStep(3);
        } else {
          onClose();
        }
        return;
      }

      // 1. Emit the invoice before creating any payment. A stale browser tab
      // can be rejected by the server's folio lock; in that case no payment is
      // persisted and staff can refresh the dialog safely.
      let invoiceData: any = null;
      const invoiceItems = folio
        ? buildInvoiceItems(invoiceItemsToEmit, tipo)
        : [];
      if (invoiceItems.length > 0) {
        // Si algún row de cobro es "cuenta_corriente" y hay una empresa/agencia seleccionada,
        // incluir los campos CC para que el billing cree el cargo en la cuenta corriente.
        const isCcPayment = saleCondition === "cuenta_corriente" &&
          (billingTarget === "company" || billingTarget === "agency") && !!billingEntityId;

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
          sourceChargeIds: invoiceSourceIds,
          sourceChargeAmounts: invoiceSourceAmounts,
          folioContext: {
            billingTarget,
            nationality,
            nationalityCode,
            hasAccommodation: hasSelectedAccommodation,
          },
          ...(isCcPayment ? {
            cashFormaPago: "cuenta_corriente",
            ccEntityType: billingTarget,
            ccEntityId: billingEntityId,
          } : {}),
          observaciones: invoiceObservations.trim() || undefined,
        });
        const invoiceBody = await invoiceRes.json();
        if (!invoiceRes.ok) throw new Error(invoiceBody?.error || invoiceBody?.message || "Error al emitir comprobante");
        invoiceData = invoiceBody;
        setTimeout(() => window.open(`/api/billing/invoices/${invoiceData.id}/pdf`, "_blank"), 300);

        // Apply prior advances only after the fiscal document exists. A failed
        // link is persisted for manual retry, never silently discarded.
        for (const paymentId of selectedAdvancePaymentIds) {
          const linkRes = await apiRequest("PATCH", `/api/payments/${paymentId}/invoice`, { invoiceData });
          if (!linkRes.ok) {
            await apiRequest("PATCH", `/api/payments/${paymentId}/invoice-link-failed`, { invoiceData }).catch(() => undefined);
            toast({
              title: "Factura emitida con vínculo pendiente",
              description: "Un anticipo previo no pudo vincularse automáticamente. Quedó marcado para reintento.",
              variant: "destructive",
            });
          }
        }
      }

      // 2. Register payments only after the invoice has been accepted. The
      // invoice reference is persisted during payment creation, so there is no
      // later best-effort link request that can leave an orphaned payment.
      const invoiceRef = invoiceData ? {
        id: invoiceData.id,
        tipoComprobante: invoiceData.tipoComprobante ?? invoiceData.tipo_comprobante,
        puntoVenta: invoiceData.puntoVenta ?? invoiceData.punto_venta,
        numero: invoiceData.numero,
        cae: invoiceData.cae,
        total: invoiceData.montoTotal ?? invoiceData.monto_total,
      } : undefined;
      let paymentCount = 0;
      for (const row of saleCondition === "contado" && selectedBalance > 0.01 ? paymentRows : []) {
        const netAmount = parseFloat(row.amount) || 0;
        const retMonto = row.retencionEnabled ? (parseFloat(row.retencionMonto) || 0) : 0;
        if (netAmount <= 0 && retMonto <= 0) continue;
        const grossAmount = (netAmount + retMonto).toFixed(2);
        const notes = retMonto > 0
          ? JSON.stringify({ retencion: { tipo: row.retencionTipo, monto: retMonto, neto: netAmount } })
          : null;

        const res = await apiRequest("POST", "/api/payments", {
          reservationId,
          amount: grossAmount,
          method: row.method,
          date: getLocalToday(),
          reference: null,
          notes,
          receiptType,
          billingTarget,
          companyId: billingTarget === "company" ? billingEntityId : null,
          agencyId: billingTarget === "agency" ? billingEntityId : null,
          invoiceData: invoiceRef,
        });
        const resBody = await res.json();
        if (!res.ok) throw new Error(resBody?.error || "La factura fue emitida, pero no se pudo registrar el pago");
        paymentCount++;
      }
      if (paymentCount > 0) setPaymentRegistered(true);

      // 3. Checkout if applicable
      // Use a local flag so we can gate onCheckoutComplete reliably within this
      // async function (React state updates are async and not readable immediately).
      let checkoutSucceeded = false;
      if (mode === "checkout" && doCheckout) {
        try {
          const coRes = await apiRequest("POST", `/api/reservations/${reservationId}/check-out`, {});
          if (!coRes.ok) {
            const coBody = await coRes.json().catch(() => ({}));
            throw new Error(coBody?.error || "Error al realizar check-out");
          }
          checkoutSucceeded = true;
          setCheckoutDone(true);
          queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });
          queryClient.invalidateQueries({ queryKey: ["/api/reservations/check-out"] });
          queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
          queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "/api/planning" });
          queryClient.invalidateQueries({ queryKey: ["/api/housekeeping"] });
        } catch (coErr: any) {
          // Payment and invoice already persisted — do NOT re-throw.
          // Advance to step 3 with a warning so staff know to fix checkout manually.
          // checkoutSucceeded remains false, so onCheckoutComplete will NOT fire.
          setCheckoutFailed(true);
          console.error("[PrefacturaDialog] checkout failed after payment/invoice:", coErr);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "folio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId), "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations", String(reservationId)] });
      queryClient.invalidateQueries({ queryKey: ["/api/reservations"] });

      const refreshed = await refetchFolio();
      const [refreshedInvoices] = await Promise.all([refetchEmittedInvoices(), refetchTransferRemaining()]);
      if (mode === "checkout" && doCheckout && !checkoutSucceeded) {
        // Payment and invoice have been saved, but the room must not be treated
        // as closed until staff resolve the failed checkout.
        setEmittedInvoice(invoiceData);
        setStep(3);
        return;
      }

      if (mode === "checkout" && doCheckout && checkoutSucceeded) {
        onCheckoutComplete?.();
        onClose();
        return;
      }

      // Keep the user in Prefactura only when a fresh folio still contains
      // billable, not-yet-invoiced items. Do not reselect this submission's
      // source IDs and accidentally issue the same charge twice.
      const freshFolio = refreshed.data;
      const nextSelection = new Set<string>();
      const freshInvoicedAmounts = getInvoicedAmountsByCharge(refreshedInvoices.data || []);
      if (freshFolio) {
        if (freshFolio.roomTotal > 0 &&
          (freshFolio.roomTotal - (freshInvoicedAmounts.accommodation || 0)) > 0.01) {
          nextSelection.add("accommodation");
        }
        for (const charge of freshFolio.charges || []) {
          const id = String(charge.id);
          if (charge.category !== "transfer_out" &&
            charge.category !== "transfer_in" &&
            parseFloat(charge.amount) > 0 &&
            (parseFloat(charge.amount) - (freshInvoicedAmounts[id] || 0)) > 0.01) {
            nextSelection.add(id);
          }
        }
      }
      if (nextSelection.size > 0) {
        const freshOriginalItems = getAllBillableFolioItems(freshFolio!, itemDescriptions);
        const freshRemainingAmounts = getRemainingChargeAmounts(
          freshOriginalItems,
           freshInvoicedAmounts,
        );
        const nextItems = getSelectedFolioItems(
          nextSelection,
          freshFolio!,
          itemDescriptions,
          freshRemainingAmounts,
        );
        const nextBalance = getSelectedFolioBalance(
          nextItems,
          getAllBillableFolioItems(freshFolio!, itemDescriptions, freshRemainingAmounts),
          (freshFolio!.payments || []).filter((payment: any) =>
            !payment.invoiceRef && !payment.invoice_ref && !payment.invoiceLinkFailed
          ),
        );
        setSelectedIds(nextSelection);
        setPaymentRows([{
          id: newRowId(),
          amount: nextBalance > 0.01 ? nextBalance.toFixed(2) : "",
          method: "efectivo",
          reference: "",
          retencionEnabled: false,
          retencionTipo: "iibb",
          retencionMonto: "",
        }]);
        setInvoiceObservations("");
        setEmittedInvoice(null);
        setStep(1);
        return;
      }

      onCheckoutComplete?.();
      onClose();

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
      id: newRowId(), amount: String(selectedBalance.toFixed(2)),
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
  const noMovements = !paymentRegistered && !emittedInvoice;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92dvh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            {step < 3 && <><FileText className="h-5 w-5" />Prefactura</>}
            {step === 3 && <><CircleCheck className="h-5 w-5 text-green-600" />Resultado</>}
            {reservation && (
              <span className="font-normal text-muted-foreground text-sm ml-2">
                — {(reservation.guest as any)?.lastName} {(reservation.guest as any)?.firstName} · Hab. {(reservation.room as any)?.roomNumber}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>



        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {/* ── Prefactura (cargos + cobro en una sola pantalla) ──────────── */}
          {step < 3 && (
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
            {/* Already-paid-and-invoiced: block new invoice, only allow checkout */}
            {alreadyPaidAndInvoiced && (
              <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/40 px-4 py-3">
                <CircleCheck className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm text-green-800 dark:text-green-300 space-y-0.5">
                  <p className="font-semibold">Esta reserva ya está cobrada y facturada.</p>
                  <p>El saldo es $0 y ya existe un comprobante emitido. No se puede generar una nueva factura — solo podés dar el check-out.</p>
                </div>
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
                      <TableHead className="w-24 text-right">Ya facturado</TableHead>
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
                        alreadyPaid={Math.max(0, folio.roomTotal - (remainingAmountsByCharge.accommodation ?? folio.roomTotal))}
                        alreadyInvoiced={fullyInvoicedChargeIds.has("accommodation")}
                        selected={selectedIds.has("accommodation")}
                        onToggle={() => { if (fullyInvoicedChargeIds.has("accommodation")) return; setSelectedIds(prev => { const n = new Set(prev); n.has("accommodation") ? n.delete("accommodation") : n.add("accommodation"); return n; }); }}
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
                            alreadyPaid={Math.max(0, parseFloat(charge.amount) - (remainingAmountsByCharge[String(charge.id)] ?? parseFloat(charge.amount)))}
                            alreadyInvoiced={!isTransfer && fullyInvoicedChargeIds.has(String(charge.id))}
                            selected={!isTransfer && selectedIds.has(String(charge.id))}
                            onToggle={() => { if (isTransfer || fullyInvoicedChargeIds.has(String(charge.id))) return; setSelectedIds(prev => { const n = new Set(prev); const k = String(charge.id); n.has(k) ? n.delete(k) : n.add(k); return n; }); }}
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
                    <div className="text-muted-foreground text-xs">Pendiente de facturación</div>
                    <div className="font-bold">${fmtMoney(totalSelected)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground text-xs">Anticipos aplicados al cobro</div>
                    <div className="font-medium text-green-700 dark:text-green-400">${fmtMoney(selectedAlreadyPaid)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground text-xs">Pendiente de cobro</div>
                    <div className={`font-bold text-base ${selectedBalance > 0.01 ? "text-red-600" : "text-green-600"}`}>
                      ${fmtMoney(selectedBalance)}
                    </div>
                  </div>
                </div>
                {(folio.payments || []).length > 0 && (
                  <p className="px-4 pb-3 text-xs text-muted-foreground">
                    Los anticipos reducen solamente el cobro. El importe a facturar se calcula con el saldo fiscal pendiente de cada cargo.
                  </p>
                )}
                <div className="border-t px-4 py-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set(allBillableItems.map(item => item.id)))}
                    disabled={allBillableItems.length === 0}
                  >
                    Seleccionar todos los cargos elegibles
                  </Button>
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
                  <Select
                    value={billingTarget}
                    onValueChange={(v) => handleBillingTargetChange(v as any)}
                    disabled={billingTargetLocked}
                  >
                    <SelectTrigger title={billingTargetLocked ? "La reserva tiene una entidad asociada — no se puede cambiar el destinatario aquí" : undefined}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedBillingTargets.includes("guest") && (
                        <SelectItem value="guest"><span className="flex items-center gap-2"><User className="h-3.5 w-3.5" />Huésped</span></SelectItem>
                      )}
                      {allowedBillingTargets.includes("company") && (
                        <SelectItem value="company"><span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" />Empresa</span></SelectItem>
                      )}
                      {allowedBillingTargets.includes("agency") && (
                        <SelectItem value="agency"><span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" />Agencia</span></SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                   {hasReservationCompany && (
                     <p className="text-xs text-muted-foreground mt-1">La empresa asociada también puede ser receptora</p>
                  )}
                   {hasReservationAgency && (
                     <p className="text-xs text-muted-foreground mt-1">La agencia asociada también puede ser receptora</p>
                  )}
                </div>
                {billingTarget === "company" && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Empresa</Label>
                    {billingTargetLocked ? (
                      <Input value={razonSocial} readOnly className="h-8 text-sm bg-muted" />
                    ) : (
                      <Select value={billingEntityId} onValueChange={(v) => handleEntitySelect(v, "company")}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar empresa..." /></SelectTrigger>
                        <SelectContent>
                          {companies.filter((c: any) => c.id).map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.razonSocial || c.nombreFantasia}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
                {billingTarget === "agency" && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Agencia</Label>
                    {billingTargetLocked ? (
                      <Input value={razonSocial} readOnly className="h-8 text-sm bg-muted" />
                    ) : (
                      <Select value={billingEntityId} onValueChange={(v) => handleEntitySelect(v, "agency")}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar agencia..." /></SelectTrigger>
                        <SelectContent>
                          {agencies.filter((a: any) => a.id).map((a: any) => (
                            <SelectItem key={a.id} value={String(a.id)}>{a.razonSocial || a.nombreFantasia}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              {/* Fiscal data is derived from the reservation and stays read-only here. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Razón social / Nombre</Label>
                  <Input value={razonSocial} readOnly className="h-8 text-sm bg-muted" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">{documentType || (cuit ? "CUIT" : "Documento")}</Label>
                  <Input value={cleanIdentifier(cuit) || cleanIdentifier(dni)} readOnly placeholder="Sin identificación registrada" className="h-8 text-sm bg-muted" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Condición IVA</Label>
                  <Input value={condicionIva} readOnly className="h-8 text-sm bg-muted" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Nacionalidad</Label>
                  <Input value={nationality || nationalityCode || "No registrada"} readOnly className="h-8 text-sm bg-muted" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground mb-1 block">Domicilio</Label>
                  <Input value={domicilio || "No registrado"} readOnly className="h-8 text-sm bg-muted" />
                </div>
              </div>

              {/* Invoice type & POS */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Tipo de comprobante</Label>
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {filteredTipoOptions.map(opt => (
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
                  {!canIssueFacturaT && billingTarget === "guest" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Factura T solo está disponible para huéspedes extranjeros con alojamiento seleccionado.
                    </p>
                  )}
                   {facturaANeedsCuit && (
                    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                       <span>Factura A requiere un <strong>CUIT válido de 11 dígitos</strong> y condición fiscal compatible.</span>
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Punto de venta</Label>
                  <Select value={puntoVenta} onValueChange={setPuntoVenta}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="PV..." /></SelectTrigger>
                    <SelectContent>
                      {posConfigs.filter((p: any) => p.activo !== false).map((p: any) => (
                        <SelectItem key={p.id} value={String(p.numero)}>
                          PV {String(p.numero).padStart(4, "0")} {p.nombre ? `— ${p.nombre}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {puntoVenta && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Se emitirá con PV {puntoVenta.padStart(4, "0")}.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Condición de venta</Label>
                <Select value={saleCondition} onValueChange={(value) => setSaleCondition(value as SaleCondition)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contado">{SALE_CONDITION_LABELS.contado}</SelectItem>
                    <SelectItem value="cuenta_corriente" disabled={billingTarget === "guest" || !billingEntityId}>
                      {SALE_CONDITION_LABELS.cuenta_corriente}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {saleCondition === "cuenta_corriente" && (
                  <p className="text-xs text-muted-foreground mt-1">El total se registra como cargo a la cuenta de la entidad; no genera un cobro de caja.</p>
                )}
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
                disabled={folioLoading || !folio || totalSelected <= 0.01}
              >
                <ArrowRightLeft className="h-4 w-4 mr-1" />Transferir a otra hab.
              </Button>
              {alreadyPaidAndInvoiced ? (
                mode === "checkout" ? (
                  <Button onClick={doSubmit} disabled={isSubmitting}>
                    {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</> : <><LogOut className="h-4 w-4 mr-1" />Dar check-out</>}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={handleClose}>Cerrar</Button>
                )
              ) : (
                <Button
                  onClick={() => {
                    // Sync payment amount to match only the selected items (not full balance)
                    if (totalSelected > 0) {
                      setPaymentRows(prev =>
                        prev.length === 1
                          ? [{ ...prev[0], amount: String(totalSelected.toFixed(2)) }]
                          : prev
                      );
                    }
                    // amount already synced via useEffect on totalSelected
                  }}
                  disabled={true}
                  className="hidden"
                >
                  hidden
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {/* ── STEP 2: Cobro ──────────────────────────────────────────────────── */}
        {true && (
          <div className="space-y-0">
            {/* Cobro section — directly below prefactura on same screen */}
            <div className="rounded-lg border bg-muted/20 px-4 py-3 flex flex-wrap gap-4 text-sm mt-4 mb-4">
              <div><span className="text-muted-foreground">A facturar a: </span><span className="font-medium">{razonSocial || "—"}</span></div>
              <div><span className="text-muted-foreground">Tipo: </span>
                <span className="font-medium">{TIPO_OPTIONS.find(t => t.value === tipo)?.label || tipo}</span>
              </div>
                <div><span className="text-muted-foreground">A cobrar ahora: </span>
                  <span className={`font-bold ${selectedBalance > 0.01 ? "text-red-600" : "text-green-600"}`}>
                    ${fmtMoney(selectedBalance)}
                </span>
              </div>
            </div>

            {/* Zero-balance notice: no new payment required */}
            {totalSelected > 0.01 && selectedBalance <= 0.01 && (
              <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/40 px-4 py-3">
                <CircleCheck className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <p className="text-sm text-green-800 dark:text-green-300">
                  El saldo está cubierto por pagos anteriores — no es necesario registrar un nuevo cobro. Podés confirmar directamente.
                </p>
              </div>
            )}

            {/* Payment rows — only shown when there is an outstanding balance */}
            {saleCondition === "contado" && selectedBalance > 0.01 && (
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
                              <SelectItem key={v} value={v} disabled={paymentRows.some(other => other.id !== row.id && other.method === v)}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-4">
                        <p className="text-xs text-muted-foreground pb-2">
                          La referencia se registra una sola vez en el comprobante.
                        </p>
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
                        Agregar retención impositiva
                      </Button>
                    ) : (
                      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-amber-800 dark:text-amber-300">Retención impositiva</span>
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
            )}

            <div className="space-y-1.5 mt-4">
              <Label className="text-sm font-medium">Referencia / Observaciones del comprobante</Label>
              <Input
                value={invoiceObservations}
                onChange={e => setInvoiceObservations(e.target.value)}
                placeholder="Ej: transferencia bancaria, cheque 1234, observación interna…"
                className="text-sm"
              />
            </div>

            {/* Split-balance-changed notice — shown when a reversal/NC changed the
                folio balance after the user already split into multiple rows */}
            {splitBalanceChanged && paymentRows.length > 1 && selectedBalance > 0.01 && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  El balance del folio cambió. Revisá los montos de pago.
                </p>
              </div>
            )}

            {/* Running totals — only shown when there is an outstanding balance */}
            {saleCondition === "contado" && selectedBalance > 0.01 && (
            <Card className={saldoRestante > 0.01 ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10" : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/10"}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="space-y-1">
                    <div className="flex gap-6">
                      <span className="text-muted-foreground">Total a cobrar: <span className="font-medium text-foreground">${fmtMoney(selectedBalance)}</span></span>
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
            )}

            {submitError && (
              <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 px-4 py-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-400">{submitError}</p>
              </div>
            )}

            <DialogFooter className="gap-2 flex-wrap">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || totalSelected <= 0.01}
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
            {/* Success / partial-success / no-movements banner */}
            {(() => {
              const bannerClass = checkoutFailed
                ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/10"
                : noMovements
                  ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/10"
                  : "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-900/10";
              const iconBg = checkoutFailed
                ? "bg-amber-100 dark:bg-amber-900/40"
                : noMovements
                  ? "bg-blue-100 dark:bg-blue-900/40"
                  : "bg-green-100 dark:bg-green-900/40";
              const icon = checkoutFailed
                ? <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                : noMovements
                  ? <CircleCheck className="h-7 w-7 text-blue-500 dark:text-blue-400" />
                  : <CircleCheck className="h-7 w-7 text-green-600 dark:text-green-400" />;
              const headlineClass = checkoutFailed
                ? "font-bold text-amber-700 dark:text-amber-400"
                : noMovements
                  ? "font-bold text-blue-700 dark:text-blue-400"
                  : "font-bold text-green-700 dark:text-green-400";
              const headline = checkoutDone
                ? "Check-out completado"
                : checkoutFailed
                  ? noMovements
                    ? "Check-out pendiente"
                    : "Cobro e factura registrados — check-out pendiente"
                  : noMovements
                    ? "Sin movimientos pendientes"
                    : "Cobro registrado";
              const sublineClass = checkoutFailed
                ? "text-amber-700 dark:text-amber-300"
                : noMovements
                  ? "text-blue-600 dark:text-blue-300"
                  : "text-green-700 dark:text-green-300";
              return (
                <Card className={bannerClass}>
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full shrink-0 ${iconBg}`}>
                      {icon}
                    </div>
                    <div>
                      <p className={headlineClass}>{headline}</p>
                      {noMovements && (
                        <p className={`text-sm mt-0.5 ${sublineClass}`}>
                          El saldo de la reserva es cero — no se registró ningún cobro ni se emitió comprobante.
                        </p>
                      )}
                      {emittedInvoice && (
                        <p className={`text-sm mt-0.5 ${sublineClass}`}>
                          {emittedInvoice.tipo_comprobante} {padNum(emittedInvoice.punto_venta, 4)}-{padNum(emittedInvoice.numero, 8)}
                          {emittedInvoice.cae ? ` — CAE: ${emittedInvoice.cae}` : " (sin CAE)"}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Checkout-failed warning: only claim a payment/invoice when they exist. */}
            {checkoutFailed && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">
                    {noMovements
                      ? "No se registraron cobros ni comprobantes."
                      : "El cobro y el comprobante ya fueron registrados correctamente."}
                  </p>
                  <p>Sin embargo, el check-out no pudo completarse automáticamente. Para liberar la habitación, realizá el check-out manualmente desde el folio de la reserva.</p>
                </div>
              </div>
            )}

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
        </div>
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
        transferRemaining={transferRemaining}
        selectedChargeIds={selectedSourceIds.filter(id => id !== "accommodation")}
        includeAccommodation={selectedSourceIds.includes("accommodation")}
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
              El monto ingresado cubre <strong>${fmtMoney(totalPayments)}</strong> pero el saldo de los cargos seleccionados es{" "}
              <strong className="text-red-600 dark:text-red-400">${fmtMoney(selectedBalance)}</strong>.
              Quedarán <strong className="text-red-600 dark:text-red-400">${fmtMoney(saldoRestante)}</strong> sin abonar.
            </p>
            <p className="text-muted-foreground">
               Si continuás, se emitirá el comprobante fiscal por <strong>${fmtMoney(invoiceAmount)}</strong>,
               únicamente por la parte cubierta. El saldo restante quedará pendiente en el folio para una facturación posterior.
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
  cash_forma_pago?: string | null;
  source_charge_ids?: unknown;
  source_charge_amounts?: unknown;
  credit_source_charge_amounts?: unknown;
}

interface NcItemRow {
  key: string;
  sourceId: string;
  descripcion: string;
  subtotal: number;
  amount: string; // editable partial amount
  selected: boolean;
}

function NotaCreditoDialog({
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
  const [ncItems, setNcItems] = useState<NcItemRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emittedNc, setEmittedNc] = useState<any>(null);
  const [mappingWarning, setMappingWarning] = useState<string | null>(null);

  const selectedInvoice = invoices.find(inv => String(inv.id) === selectedInvoiceId) ?? null;

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedInvoiceId(invoices.length === 1 ? String(invoices[0].id) : "");
      setMotivo("");
      setNcItems([]);
      setEmittedNc(null);
      setMappingWarning(null);
    }
  }, [open]);

  // Build item rows when invoice changes
  useEffect(() => {
    if (!selectedInvoice) { setNcItems([]); setMappingWarning(null); return; }
    const montoTotal = parseFloat(selectedInvoice.monto_total);
    const montoAcreditado = parseFloat(selectedInvoice.monto_acreditado || "0");
    const rawItems = parseJsonValue(selectedInvoice.items);
    const sourceAmounts = parseJsonValue(selectedInvoice.source_charge_amounts);
    const sourceIds = getSourceIds(selectedInvoice);
    const creditMaps = parseJsonValue(selectedInvoice.credit_source_charge_amounts);

    if (!Array.isArray(rawItems) || !sourceAmounts || typeof sourceAmounts !== "object" ||
      Array.isArray(sourceAmounts) || Object.keys(sourceAmounts).length === 0) {
      setNcItems([]);
      setMappingWarning("Esta factura no tiene una relación segura entre sus conceptos y los cargos del Folio. No se puede emitir una NC automática.");
      return;
    }

    const previouslyCredited: Record<string, number> = {};
    if (!Array.isArray(creditMaps) && montoAcreditado > 0.009) {
      setNcItems([]);
      setMappingWarning("La factura tiene una Nota de Crédito anterior sin detalle por cargo. Revisá el vínculo original antes de continuar.");
      return;
    }
    for (const map of Array.isArray(creditMaps) ? creditMaps : []) {
      if (!map || typeof map !== "object" || Array.isArray(map)) {
        setNcItems([]);
        setMappingWarning("La factura tiene una Nota de Crédito anterior sin detalle por cargo. Revisá el vínculo original antes de continuar.");
        return;
      }
      for (const [sourceId, amount] of Object.entries(map as Record<string, unknown>)) {
        previouslyCredited[sourceId] = (previouslyCredited[sourceId] || 0) + (parseFloat(String(amount)) || 0);
      }
    }
    const totalMappedCredits = Object.values(previouslyCredited).reduce((total, amount) => total + amount, 0);
    if (Math.abs(totalMappedCredits - montoAcreditado) > 0.02) {
      setNcItems([]);
      setMappingWarning("El detalle de las NC anteriores no coincide con el total acreditado de esta factura. No se aplicará un ajuste automático.");
      return;
    }

    const rows: NcItemRow[] = [];
    for (const [sourceId, originalValue] of Object.entries(sourceAmounts as Record<string, unknown>)) {
      const index = sourceIds.indexOf(sourceId);
      const originalItem = (index >= 0 ? rawItems[index] : sourceIds.length === 1 ? rawItems[0] : null) as any;
      if (!originalItem) {
        setNcItems([]);
        setMappingWarning("No se pudo conservar el concepto fiscal original para uno de los cargos facturados.");
        return;
      }
      const available = Math.max(0, (parseFloat(String(originalValue)) || 0) - (previouslyCredited[sourceId] || 0));
      if (available > 0.009) {
        rows.push({
          key: sourceId,
          sourceId,
          descripcion: originalItem.descripcion || `Cargo ${sourceId}`,
          subtotal: available,
          amount: available.toFixed(2),
          selected: true,
        });
      }
    }
    setMappingWarning(rows.length === 0 ? "La factura ya no tiene conceptos disponibles para acreditar." : null);
    setNcItems(rows);
  }, [selectedInvoiceId, selectedInvoice, invoices]);

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
    if (mappingWarning) {
      toast({ title: mappingWarning, variant: "destructive" }); return;
    }
    if (ncItems.some(item => item.selected && ((parseFloat(item.amount) || 0) > item.subtotal + 0.01))) {
      toast({ title: "Un importe supera el saldo disponible de su concepto", variant: "destructive" }); return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/billing/invoices/${selectedInvoice.id}/nota-credito`, {
        motivo: motivo.trim(),
        monto: totalNc,
        items: ncItems
          .filter(item => item.selected && (parseFloat(item.amount) || 0) > 0)
          .map(item => ({ sourceId: item.sourceId, amount: parseFloat(item.amount) })),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || body?.message || "Error al emitir NC");

      setEmittedNc(body);
      const ncLabel = `${body.tipoComprobante ?? body.tipo_comprobante} ${String(body.puntoVenta ?? body.punto_venta ?? 0).padStart(4,"0")}-${String(body.numero ?? 0).padStart(8,"0")}`;
      toast({
        title: `NC emitida: ${ncLabel}`,
        description: "Los pagos se conservaron; el ajuste se registró en el Folio.",
      });
      onSuccess();

      // Auto-open PDF
      setTimeout(() => window.open(`/api/billing/invoices/${body.id}/pdf`, "_blank"), 300);
    } catch (err: any) {
      toast({ title: parseApiError(err), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (emittedNc) {
    return (
      <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md max-h-[90dvh] flex flex-col overflow-hidden p-0 gap-0">
          <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <CircleCheck className="h-5 w-5 text-green-600" />
              Nota de Crédito emitida
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
          </div>
          <DialogFooter className="shrink-0 border-t px-6 py-4 gap-2">
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
      <DialogContent className="max-w-xl max-h-[90dvh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <MinusCircle className="h-5 w-5 text-amber-600" />
            Emitir Nota de Crédito
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Invoice selector */}
          {/* Bug N: always show invoice selector — ensures user knows which invoice is being credited */}
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
               <div className="pt-1 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                 <span>Receptor, tipo de comprobante y punto de venta: <strong className="text-foreground">se conservan de la factura original</strong></span>
                 <span>Forma de cobro: <strong className="text-foreground">{selectedInvoice.cash_forma_pago ? (PAYMENT_METHOD_LABELS[selectedInvoice.cash_forma_pago] || selectedInvoice.cash_forma_pago) : "No informada"}</strong></span>
               </div>
            </div>
          )}

          {mappingWarning && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">{mappingWarning}</p>
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

          {selectedInvoice && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
              Esta operación acredita la factura y ajusta el cargo asociado. Los pagos registrados se conservan; una devolución o anulación de cobro se gestiona por separado.
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

        <DialogFooter className="shrink-0 border-t px-6 py-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedInvoice || !!mappingWarning || totalNc <= 0 || !motivo.trim()}
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
      toast({ title: parseApiError(err), variant: "destructive" });
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
  onTransfer, onRevert, alreadyReversed, alreadyInvoiced, category,
}: {
  id: string; amount: number; description: string; date?: string; alreadyPaid: number;
  selected: boolean; onToggle: () => void;
  editing: boolean; editingValue: string;
  onStartEdit: () => void; onEditChange: (v: string) => void;
  onSaveEdit: () => void; onCancelEdit: () => void;
  onTransfer?: () => void;
  onRevert?: () => void;
  alreadyReversed?: boolean;
  alreadyInvoiced?: boolean;
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
    <TableRow className={`${rowCls ?? ""} ${alreadyReversed || alreadyInvoiced ? "opacity-40" : ""}`}>
      <TableCell className="w-8">
        {isTransfer ? (
          <ArrowRightLeft className={`h-3.5 w-3.5 mx-auto ${isTransferOut ? "text-orange-500" : "text-blue-500"}`} />
        ) : (
          <Checkbox checked={selected} onCheckedChange={alreadyInvoiced ? undefined : onToggle} disabled={alreadyInvoiced} />
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
            {alreadyInvoiced && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 border-green-500 text-green-700 dark:text-green-400">
                Ya facturado
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
      toast({ title: parseApiError(err), variant: "destructive" });
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
  open, onClose, reservationId, folio, transferRemaining, selectedChargeIds: initialSelectedChargeIds,
  includeAccommodation: initialIncludeAccommodation, onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  reservationId: string | number;
  folio: PrefacturaFolioData | null;
  transferRemaining?: { accommodation: number; charges: Record<string, number> };
  selectedChargeIds: string[];
  includeAccommodation: boolean;
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
        r.status === "checked_in" &&
        String(r.id) !== String(reservationId)
      );
    },
    enabled: open,
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      setTargetReservationId("");
      setIncludeAccommodation(initialIncludeAccommodation);
      setSelectedChargeIds(new Set(initialSelectedChargeIds));
      setTransferNote("");
    }
  }, [open, initialIncludeAccommodation, initialSelectedChargeIds]);

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
      toast({ title: parseApiError(err), variant: "destructive" });
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
            Los cargos ya seleccionados en Prefactura se moverán al folio destino para facturarlos allí.
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
                  const statusLabel = "CI";
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

          {/* Charges selected in Prefactura */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Cargos seleccionados para transferir</Label>
            <div className="border rounded-lg divide-y">
              {/* Accommodation */}
              {(folio?.roomTotal ?? 0) > 0 && (() => {
                const accomRemaining = transferRemaining?.accommodation ?? folio?.roomTotal ?? 0;
                if (accomRemaining <= 0) return null; // fully transferred already
                return (
                  <div className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      id="bulk-pfx-accommodation"
                      className="h-4 w-4 rounded border-gray-300 shrink-0"
                      checked={includeAccommodation}
                      disabled
                    />
                    <label htmlFor="bulk-pfx-accommodation" className="flex-1 flex justify-between items-center text-sm gap-2">
                      <span className="font-medium">Alojamiento Hab. {folio?.roomNumber} ({folio?.nights} noche{folio?.nights !== 1 ? "s" : ""})</span>
                      <div className="text-right shrink-0">
                        {transferRemaining && accomRemaining < (folio?.roomTotal ?? 0) && (
                          <div className="text-xs text-muted-foreground line-through">${fmtMoney(folio?.roomTotal ?? 0)}</div>
                        )}
                        <span className="font-semibold tabular-nums">${fmtMoney(accomRemaining)}</span>
                      </div>
                    </label>
                  </div>
                );
              })()}
              {/* Extra charges */}
              {billableCharges.length === 0 && (folio?.roomTotal ?? 0) === 0 ? (
                <div className="p-3 text-sm text-muted-foreground text-center">Sin cargos disponibles</div>
              ) : billableCharges.length > 0 ? (
                <>
                  {billableCharges.map((charge: any) => {
                    const remaining = transferRemaining?.charges?.[String(charge.id)] ?? parseFloat(charge.amount);
                    const alreadyTransferred = remaining <= 0;
                    return (
                      <div key={charge.id} className={`flex items-center gap-3 p-3 ${alreadyTransferred ? "opacity-40" : ""}`}>
                        <input
                          type="checkbox"
                          id={`bulk-pfx-${charge.id}`}
                          className="h-4 w-4 rounded border-gray-300 shrink-0"
                          checked={selectedChargeIds.has(String(charge.id))}
                          disabled
                        />
                        <label htmlFor={`bulk-pfx-${charge.id}`} className="flex-1 flex justify-between items-center text-sm gap-2">
                          <span className="truncate">{charge.description}</span>
                          <div className="text-right shrink-0">
                            {!alreadyTransferred && remaining < parseFloat(charge.amount) && (
                              <div className="text-xs text-muted-foreground line-through">${fmtMoney(charge.amount)}</div>
                            )}
                            <span className={`font-medium tabular-nums ${alreadyTransferred ? "line-through" : ""}`}>
                              ${fmtMoney(alreadyTransferred ? parseFloat(charge.amount) : remaining)}
                            </span>
                            {alreadyTransferred && <span className="text-xs text-muted-foreground ml-1">(transferido)</span>}
                          </div>
                        </label>
                      </div>
                    );
                  })}
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

  // Fetch active reservations (in-house / checked_in only) for the target picker
  const { data: activeReservations = [] } = useQuery<any[]>({
    queryKey: ["/api/reservations", "active-for-transfer"],
    queryFn: async () => {
      const res = await fetch("/api/reservations");
      if (!res.ok) throw new Error("Error cargando reservas");
      const all: any[] = await res.json();
      return all.filter((r: any) =>
        r.status === "checked_in" &&
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
      toast({ title: parseApiError(err), variant: "destructive" });
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
                      const statusLabel = "CI";
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
