import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Ban, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type VoidableMovement = {
  id: string;
  type: string;
  amount: string;
  date: string;
  voided?: boolean | null;
  reservationId?: string | null;
  paymentId?: string | null;
  groupPaymentId?: string | null;
  receiptNumber?: string | null;
  entityId?: string;
};

export function CcVoidReceiptAction({
  movement,
  entityLabel,
  onSuccess,
}: {
  movement: VoidableMovement;
  entityLabel?: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const direct = movement.type === "pago"
    && !movement.voided
    && !movement.reservationId
    && !movement.paymentId
    && !movement.groupPaymentId;
  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/account-movements/${movement.id}/void`, { reason: reason.trim() }),
    onSuccess: () => {
      setOpen(false);
      setReason("");
      queryClient.invalidateQueries();
      onSuccess?.();
      toast({ title: "Recibo anulado", description: "El saldo y los cargos fueron revertidos." });
    },
    onError: (error: Error) => toast({ title: "No se pudo anular el recibo", description: error.message, variant: "destructive" }),
  });
  if (!direct) return null;
  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
        title="Anular recibo" onClick={() => setOpen(true)} data-testid={`button-void-receipt-${movement.id}`}>
        <Ban className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={(next) => !mutation.isPending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular recibo</DialogTitle>
            <DialogDescription>Esta operación no borra el recibo: reabre la deuda y conserva la auditoría.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-md border bg-muted/30 p-3 space-y-1">
              <div><span className="text-muted-foreground">Entidad:</span> {entityLabel || movement.entityId}</div>
              <div><span className="text-muted-foreground">Fecha:</span> {movement.date}</div>
              <div><span className="text-muted-foreground">Importe:</span> ${Math.abs(Number(movement.amount)).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</div>
              {movement.receiptNumber && <div><span className="text-muted-foreground">Recibo:</span> {movement.receiptNumber}</div>}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`void-reason-${movement.id}`}>Motivo obligatorio</Label>
              <Input id={`void-reason-${movement.id}`} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Ej.: importe ingresado incorrectamente" maxLength={500} disabled={mutation.isPending} />
            </div>
            <Badge variant="destructive">No se puede deshacer</Badge>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancelar</Button>
            <Button type="button" variant="destructive" disabled={!reason.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar anulación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
