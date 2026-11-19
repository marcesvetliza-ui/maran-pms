import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
const methods: Record<string, string> = {
  efectivo: "Efectivo",
  cash: "Efectivo",
  tarjeta_debito: "Tarjeta de débito",
  tarjeta_credito: "Tarjeta de crédito",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
};
export function CancelledCollectionCorrection({
  reservationId,
  operationId,
  plan,
  role,
  disabled,
  onCompleted,
}: {
  reservationId: string;
  operationId: string;
  plan: any;
  role?: string;
  disabled: boolean;
  onCompleted: (result: any) => void;
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(
      "Forma de pago cargada por error; se refacturará con el medio correcto.",
    );
  const mutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest(
          "POST",
          `/api/billing/reservations/${reservationId}/operations/${operationId}/cancel-collection`,
          { acknowledge: true, fingerprint: plan.fingerprint, reason },
        )
      ).json(),
    onSuccess: (result) => {
      setOpen(false);
      onCompleted(result);
    },
  });
  if (!["admin", "manager", "jefe_recepcion"].includes(role || ""))
    return (
      <p className="text-sm">
        Un supervisor de recepción puede anular el cobro cargado por error y
        habilitar la refacturación.
      </p>
    );
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || mutation.isPending}
        onClick={() => {
          mutation.reset();
          setOpen(true);
        }}
      >
        Anular cobro y refacturar
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!mutation.isPending) setOpen(next);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Anular cobro para refacturar</DialogTitle>
            <DialogDescription>
              Confirmá que el cobro de {plan.invoiceLabel} se cargó por error.
              El importe volverá a quedar pendiente y podrás elegir otra forma
              de pago al refacturar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border p-3 text-sm">
              <ul>
                {plan.payments.map((p: any) => (
                  <li key={p.id}>
                    {methods[p.method] || p.method}:{" "}
                    {Number(p.amount).toLocaleString("es-AR", {
                      style: "currency",
                      currency: "ARS",
                    })}
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-semibold">
                Total a anular:{" "}
                {Number(plan.total).toLocaleString("es-AR", {
                  style: "currency",
                  currency: "ARS",
                })}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              La factura y su nota de crédito se conservarán. La anulación
              quedará registrada en la reserva y en Caja.
            </p>
            {plan.payments.some((p: any) => p.shiftClosed) && (
              <p className="rounded-md border border-amber-300 p-3 text-sm">
                El turno original está cerrado. Se conservará el cierre y
                quedará registrada la reversión del cobro.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="cancelled-collection-reason">
                Motivo de la corrección
              </Label>
              <Textarea
                id="cancelled-collection-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => {
                  if (!mutation.isPending) setReason(e.target.value);
                }}
                disabled={mutation.isPending}
              />
            </div>
            {mutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {(mutation.error as Error).message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending || reason.trim().length < 10}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Anulando…" : "Confirmar anulación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
