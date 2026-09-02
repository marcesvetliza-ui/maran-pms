import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Receipt, FileX, Printer } from "lucide-react";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  credit_card: "Tarjeta Crédito",
  debit_card: "Tarjeta Débito",
  check: "Cheque",
  cuenta_corriente: "Cuenta Corriente",
  other: "Otro",
};

// One row of the full "Historial de Pagos Grupales" — every group_payments
// record for a group regardless of destino (Folio Maestro vs. Distribuido
// entre habitaciones), so a distributed payment is never invisible outside
// the raw DB. Shared between the per-group Folio Grupal tab
// (client/src/pages/group-detail.tsx) and the cross-group Reportes ›
// Grupos view (client/src/pages/reports.tsx) so both render identical
// money-relevant facts: comprobante/invoice status, receptor, método(s),
// retención and destino. Pass `groupName` only in the cross-group context —
// the per-group page already has the group in scope via its own header.
export function GroupPaymentHistoryRow({
  gp,
  companies,
  agencies,
  groupName,
}: {
  gp: any;
  companies: any[];
  agencies: any[];
  groupName?: string;
}) {
  const invoiceRefParsed = (() => {
    if (!gp.invoiceRef) return null;
    try { return JSON.parse(gp.invoiceRef); } catch { return null; }
  })();
  const invoiceBadge = invoiceRefParsed
    ? `${invoiceRefParsed.tipo_comprobante ?? "FAC"} ${String(invoiceRefParsed.punto_venta ?? "").padStart(4, "0")}-${String(invoiceRefParsed.numero ?? "").padStart(8, "0")}`
    : null;
  const ncRefParsed = (() => {
    if (!gp.invoiceNcRef) return null;
    try { return JSON.parse(gp.invoiceNcRef); } catch { return null; }
  })();
  const ncBadge = ncRefParsed
    ? `${ncRefParsed.tipo_comprobante ?? "NC"} ${String(ncRefParsed.punto_venta ?? "").padStart(4, "0")}-${String(ncRefParsed.numero ?? "").padStart(8, "0")}`
    : null;
  const receiptLabel = invoiceBadge ? null
    : (!gp.receiptType || gp.receiptType === "none" || gp.receiptType === "sin_comprobante") ? "ADELANTO"
    : gp.receiptType === "factura_a" ? "Factura A"
    : gp.receiptType === "factura_b" ? "Factura B"
    : gp.receiptType === "factura_t" ? "Factura T"
    : gp.receiptType === "factura_mipyme_a" ? "MiPyme A"
    : gp.receiptType === "ticket" ? "Ticket"
    : gp.receiptType === "cierre_habitacion" ? "Voucher Habitaciones"
    : gp.receiptType;
  const entityName = (() => {
    if (!gp.billingEntityId) return null;
    const list = gp.billingEntityType === "agency" ? agencies : companies;
    const found = (list as any[]).find((e: any) => e.id === gp.billingEntityId);
    return found ? (found.razonSocial || found.nombreFantasia) : null;
  })();
  const receiverName = gp.receiverDetails?.razonSocial || entityName;
  const methodsLabel = Array.isArray(gp.paymentMethodDetail) && gp.paymentMethodDetail.length > 0
    ? gp.paymentMethodDetail.map((row: any) => PAYMENT_METHOD_LABELS[row.method] || row.method).join(" + ")
    : PAYMENT_METHOD_LABELS[gp.method] || gp.method;
  const destinoLabel = gp.destination === "master_folio" ? "Folio Maestro" : "Distribuido entre habitaciones";
  const receiptNumber = gp.receiptNumber ?? gp.receipt_number;
  const groupId = gp.groupId ?? gp.group_id;
  const receiptDisplay = receiptNumber != null
    ? `Recibo #${String(receiptNumber).padStart(6, "0")}`
    : `Recibo ${String(gp.id || "").slice(0, 8).toUpperCase()}`;
  const breakdown = gp.settlementBreakdown;
  const breakdownUnavailable = gp.settlementBreakdownStatus === "not_reconstructible";
  const documentTotal = Number(breakdown?.documentTotal ?? gp.amount) || 0;
  const appliedAdvances = Number(breakdown?.appliedAdvances ?? 0) || 0;
  const newCollection = Number(breakdown?.newCollection ?? gp.amount) || 0;
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`row-group-payment-history-${gp.id}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted-foreground">{gp.date}</span>
        {groupName && <Badge variant="default" className="text-xs">{groupName}</Badge>}
        <Badge variant="outline" className="text-xs font-mono gap-1">
          <Receipt className="h-3 w-3" />
          {receiptDisplay}
        </Badge>
        <Badge variant="secondary">{methodsLabel}</Badge>
        <Badge variant="outline" className="text-xs">{destinoLabel}</Badge>
        {receiptLabel && (
          <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
            <Receipt className="h-3 w-3" />
            {receiptLabel}
          </Badge>
        )}
        {invoiceBadge && (
          <Badge variant="outline" className="text-xs font-mono gap-1 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">
            <Receipt className="h-3 w-3" />
            {invoiceBadge}
          </Badge>
        )}
        {ncBadge && (
          <Badge variant="outline" className="text-xs font-mono gap-1 border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400">
            <FileX className="h-3 w-3" />
            {ncBadge}
          </Badge>
        )}
        {receiverName && <span className="text-xs text-muted-foreground">→ {receiverName}</span>}
        {gp.reference && <span className="text-xs text-muted-foreground italic">{gp.reference}</span>}
        {gp.notes && <span className="text-xs text-muted-foreground whitespace-pre-line">{gp.notes}</span>}
        {breakdownUnavailable ? (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400" data-testid={`group-payment-breakdown-${gp.id}`}>
            Desglose histórico no reconstruible · Cobro registrado: {Number(gp.amount || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" data-testid={`group-payment-breakdown-${gp.id}`}>
            Comprobante: <strong>{documentTotal.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</strong>
            {" · "}Anticipos: <strong>{appliedAdvances.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</strong>
            {" · "}Cobro nuevo: <strong>{newCollection.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</strong>
            {gp.settlementBreakdownStatus === "reconstructed_from_fiscal_intent"
              ? " · Reconstruido desde intención fiscal"
              : null}
          </span>
        )}
        {Array.isArray(gp.retentionDetail) && gp.retentionDetail.map((ret: any, retIdx: number) => {
          if (!ret?.monto) return null;
          const retLabel = ret.tipo === "iibb" ? "Ret. IIBB" : ret.tipo === "ganancias" ? "Ret. Ganancias" : ret.tipo ? `Ret. ${ret.tipo}` : null;
          if (!retLabel) return null;
          return (
            <Badge key={retIdx} variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
              {retLabel}: ${Number(ret.monto).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </Badge>
          );
        })}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        {groupId && gp.id && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Ver o reimprimir recibo"
            aria-label={`Ver ${receiptDisplay}`}
            onClick={() => window.open(`/api/groups/${groupId}/payments/${gp.id}/receipt.pdf`, "_blank", "noopener,noreferrer")}
            data-testid={`button-group-payment-receipt-${gp.id}`}
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
        )}
        <span className="font-semibold text-green-600">${parseFloat(gp.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}
