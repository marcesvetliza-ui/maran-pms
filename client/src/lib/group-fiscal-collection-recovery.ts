import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

export interface PendingFiscalCollection {
  id: number;
  items: unknown;
  intent: { endpoint: string; body: any } | null | undefined;
}

/**
 * Finishes a group cobro that ARCA already confirmed (the invoice is
 * "emitida") but whose Caja/CC movement never got recorded because the
 * second network call the browser fires right after emission (see
 * group-detail.tsx / billing.tsx EmitirFacturaDialog) never completed —
 * closed tab, dropped network, cancelled dialog, etc. Reuses the exact
 * settlement math the operator's own browser would have sent (recomputed
 * from the invoice's own items/intent), so it never invents an amount.
 *
 * Returns "recovered" on success, "needs_review" when the persisted intent
 * can't be completed automatically (e.g. retentions exceed the total —
 * requires a human to look at it), or "skipped" when the intent isn't one
 * of the two group payment endpoints this recovery knows how to replay.
 */
export async function recoverGroupFiscalCollection(
  groupId: string,
  pending: PendingFiscalCollection,
): Promise<"recovered" | "needs_review" | "skipped"> {
  const invoiceId = Number(pending?.id);
  const intent = pending?.intent;
  if (!invoiceId || !intent?.endpoint || !intent?.body) return "skipped";
  const allowedEndpoints = new Set([
    `/api/groups/${groupId}/payment`,
    `/api/groups/${groupId}/master-payment`,
  ]);
  if (!allowedEndpoints.has(String(intent.endpoint))) return "skipped";

  const finalConcepts = (Array.isArray(pending.items) ? pending.items : [])
    .map((item: any) => ({
      description: String(item.descripcion || item.description || "").trim(),
      amount: Number(item.subtotal ?? (Number(item.precioUnitario || 0) * Number(item.cantidad || 1))),
    }))
    .filter((item: any) => item.description && item.amount > 0);
  const newTotal = finalConcepts.reduce((sum: number, item: any) => sum + item.amount, 0);
  const sourceRows = intent.body.paymentRows || [];
  // The persisted settlement breakdown is the authoritative recovery
  // instruction: never recreate an overpayment from stale payment rows an
  // older client may have put in paymentRows before an advance settled part
  // of the total.
  const appliedAdvances = Math.min(
    newTotal,
    Math.max(0, Number(intent.body.settlementBreakdown?.appliedAdvances || 0)),
  );
  const targetGrossCents = Math.round((newTotal - appliedAdvances) * 100);
  const retentionCents = Math.round(sourceRows.reduce((sum: number, row: any) =>
    sum + Number(row.retention?.monto || 0), 0) * 100);
  if (targetGrossCents <= retentionCents || targetGrossCents <= 0) {
    toast({
      title: "Cobro fiscal pendiente",
      description: "El comprobante emitido requiere revisar sus retenciones antes de poder registrar el cobro.",
      variant: "destructive",
    });
    return "needs_review";
  }
  const eligible = sourceRows.map((row: any, index: number) => ({ row, index }))
    .filter(({ row }: any) => row.method !== "retencion" && Number(row.amount || 0) > 0);
  const weightTotal = eligible.reduce((sum: number, entry: any) => sum + Number(entry.row.amount || 0), 0);
  let allocated = 0;
  const centsByIndex = new Map<number, number>();
  eligible.forEach((entry: any, position: number) => {
    const cents = position === eligible.length - 1
      ? targetGrossCents - retentionCents - allocated
      : Math.floor((targetGrossCents - retentionCents) * Number(entry.row.amount || 0) / weightTotal);
    centsByIndex.set(entry.index, cents);
    allocated += cents;
  });
  const paymentRows = sourceRows.map((row: any, index: number) =>
    centsByIndex.has(index) ? { ...row, amount: (centsByIndex.get(index)! / 100).toFixed(2) } : row
  );
  await apiRequest("POST", intent.endpoint, {
    ...intent.body,
    paymentRows,
    concepts: finalConcepts,
    settlementBreakdown: {
      documentTotal: newTotal,
      appliedAdvances,
      newCollection: targetGrossCents / 100,
    },
    invoiceData: { id: invoiceId, groupPaymentIntent: intent },
  });
  queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "pending-fiscal-collections"] });
  queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "folio"] });
  queryClient.invalidateQueries({ queryKey: ["/api/groups", groupId, "master-folio"] });
  queryClient.invalidateQueries({ queryKey: ["/api/cash/movements"] });
  toast({ title: "Cobro fiscal recuperado", description: "Se completó un cobro confirmado que había quedado pendiente." });
  return "recovered";
}
