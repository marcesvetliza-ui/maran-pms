import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, parseApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const methods = [["efectivo", "Efectivo"], ["tarjeta_debito", "Tarjeta Débito"], ["tarjeta_credito", "Tarjeta Crédito"], ["transferencia", "Transferencia"], ["mercadopago", "MercadoPago"], ["cuenta_corriente", "Cuenta Corriente"]];
const format = (value: string | number) => Number(value || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DebitNoteActionDialog({ invoiceId, action, onClose }: { invoiceId: number; action: "edit" | "annul"; onClose: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<string | null>(null);
  const expectedFingerprint = useRef<string>();
  const pendingKey = `debit-note-annul:${invoiceId}`;
  const [operationId, setOperationId] = useState(() => {
    if (action !== "annul") return null;
    const existing = window.sessionStorage.getItem(pendingKey);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(pendingKey, id);
    return id;
  });
  const { data, isError, error, isFetching } = useQuery<any>({
    queryKey: ["/api/billing/debit-notes", invoiceId, "actions"], staleTime: 0,
    queryFn: async () => (await apiRequest("GET", `/api/billing/debit-notes/${invoiceId}/actions${operationId ? `?operationId=${operationId}` : ""}`)).json(),
  });
  if (!expectedFingerprint.current && !isFetching && data?.expectedFingerprint) expectedFingerprint.current = data.expectedFingerprint;
  useEffect(() => {
    if (action === "annul" && data?.recoveryOperationId && data.recoveryOperationId !== operationId) {
      setOperationId(data.recoveryOperationId); window.sessionStorage.setItem(pendingKey, data.recoveryOperationId);
    }
  }, [action, data?.recoveryOperationId, operationId, pendingKey]);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!data?.expectedFingerprint) throw new Error("Actualizá la nota antes de continuar.");
      return (await apiRequest(action === "edit" ? "PATCH" : "POST", `/api/billing/debit-notes/${invoiceId}${action === "annul" ? "/annul" : ""}`, {
        reason: reason.trim(), expectedFingerprint: expectedFingerprint.current,
        ...(action === "annul" ? { operationId: data.recoveryOperationId || operationId } : {}),
        ...(action === "edit" ? { cashFormaPago: method ?? data.invoice.cash_forma_pago } : {}),
      })).json();
    },
    onSuccess: async (result: any) => {
      if (action === "annul") window.sessionStorage.removeItem(pendingKey);
      await queryClient.invalidateQueries();
      const restoredAfterCompletion = result.alreadyCompleted && result.currentDebitState !== "anulada";
      toast({ title: action === "edit" ? "Nota de Débito actualizada" : restoredAfterCompletion ? "Corrección anterior recuperada" : "Nota de Débito anulada", description: action === "edit" ? "Se corrigió la forma de pago informativa y quedó registrado el motivo." : restoredAfterCompletion ? "Esta anulación ya se había completado y la nota fue restaurada después. Revisá su estado actual antes de iniciar otra corrección." : "Se emitió la Nota de Crédito correspondiente y se conservó el cobro." });
      onClose();
      if (action === "annul" && result.id) window.open(`/api/billing/invoices/${result.id}/pdf`, "_blank");
    },
  });
  const allowed = action === "edit" ? data?.canEdit : data?.canAnnul;
  const selectedMethod = method ?? data?.invoice?.cash_forma_pago ?? "";
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{action === "edit" ? "Editar Nota de Débito" : "Anular Nota de Débito"}</DialogTitle>
        <DialogDescription>{action === "edit" ? "La Nota de Débito es un ajuste fiscal. Podés corregir la forma de pago que muestra y dejar el motivo del cambio." : "Se emitirá una Nota de Crédito asociada a esta Nota de Débito. Los comprobantes y el motivo quedarán en el historial; el cobro se conserva."}</DialogDescription>
      </DialogHeader>
      {data?.invoice && <div className="rounded border bg-muted/30 p-3 text-sm space-y-1">
        <p className="font-medium">{data.invoice.tipo_comprobante} {String(data.invoice.punto_venta).padStart(4, "0")}-{String(data.invoice.numero).padStart(8, "0")}</p>
        <p>{data.invoice.cliente_razon_social} · ${format(data.invoice.monto_total)}</p>
        {action === "annul" && <p>Se emitirá: <strong>{data.creditType} por ${format(Number(data.invoice.monto_total) - Number(data.invoice.monto_acreditado || 0))}</strong></p>}
      </div>}
      {action === "edit" && data && <div className="space-y-2">
        <Label htmlFor="debit-note-method">Forma de pago informativa</Label>
        <Select value={selectedMethod} onValueChange={setMethod} disabled={!allowed || mutation.isPending}>
          <SelectTrigger id="debit-note-method" data-testid="debit-note-method"><SelectValue placeholder="Elegir forma de pago" /></SelectTrigger>
          <SelectContent>{methods.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Este dato no reclasifica el cobro real. Para corregir cómo se recibió el dinero, usá la acción del cobro original.</p>
      </div>}
      {data && !allowed && <p role="alert" className="text-sm text-destructive">{data.reason || "La nota ya no está disponible para esta acción."}</p>}
      {action === "annul" && data?.correction && <p className="text-sm text-amber-700">Ya existe una Nota de Crédito para este intento. Se recuperará ese mismo comprobante, conservando su motivo original.</p>}
      {isError && <p role="alert" className="text-sm text-destructive">{parseApiError(error)}</p>}
      <div className="space-y-2">
        <Label htmlFor="debit-note-reason">Motivo obligatorio</Label>
        <Textarea id="debit-note-reason" data-testid="debit-note-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={mutation.isPending} />
      </div>
      {mutation.isError && <p role="alert" className="text-sm text-destructive" data-testid="debit-note-action-error">{parseApiError(mutation.error)}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button>
        <Button variant={action === "annul" ? "destructive" : "default"} disabled={!allowed || !expectedFingerprint.current || reason.trim().length < 3 || mutation.isPending || action === "edit" && !selectedMethod} onClick={() => mutation.mutate()} data-testid="confirm-debit-note-action">
          {mutation.isPending ? "Procesando…" : action === "edit" ? "Guardar cambios" : "Emitir NC y anular Nota de Débito"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
