import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";

type ReceiptMovement = {
  id: string;
  type: string;
  amount: string;
  voided?: boolean | null;
  reservationId?: string | null;
  paymentId?: string | null;
  groupPaymentId?: string | null;
  receiptNumber?: string | null;
};

type CashShift = {
  id: string;
  area: string;
  shiftNumber: number;
  openedAt: string;
  status: string;
};

type CashShiftRepairPreview = {
  receiptId: string;
  receiptNumber: string;
  grossAmount: string;
  cashAmount: string;
  retentionAmount: string;
  movementCount: number;
  fromShifts: CashShift[];
  targetShift: CashShift | null;
  canRepair: boolean;
  status: "needs_repair" | "already_correct" | "blocked";
  message: string;
  previewToken: string | null;
};

const AREA_LABELS: Record<string, string> = {
  recepcion: "Recepción",
  restaurant: "Restaurant",
  eventos: "Eventos",
  spa: "SPA",
  grupos: "Grupos",
  otros: "Otros",
};

function formatMoney(value: string) {
  const amount = Number(value);
  return `$${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatOpenedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
}

function shiftDescription(shift: CashShift) {
  return `${AREA_LABELS[shift.area] ?? shift.area} · Turno ${shift.shiftNumber} · abierto ${formatOpenedAt(shift.openedAt)} · ${shift.status}`;
}

function isStalePreviewError(error: unknown) {
  return /^\s*409:/.test((error as Error | undefined)?.message ?? "");
}

function invalidateCashRepairRelatedQueries() {
  [
    ["/api/account-movements/receipts"],
    ["/api/cash/movements"],
    ["/api/cash/shifts/current"],
    ["/api/cash/shifts"],
    ["/api/cash/shifts/autocreados"],
    ["/api/cash/summary"],
    ["/api/reports/caja-unificada"],
    ["/api/account-movements/report"],
    ["/api/account-movements/report-aging"],
  ].forEach((queryKey) => {
    void queryClient.invalidateQueries({ queryKey });
  });
}

export function CcCashShiftRepairAction({
  movement,
  canManage,
}: {
  movement: ReceiptMovement;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const directNonVoidedReceipt = movement.type === "pago"
    && !movement.voided
    && !movement.reservationId
    && !movement.paymentId
    && !movement.groupPaymentId;

  const previewKey = useMemo(
    () => ["/api/account-movements", movement.id, "cash-shift-repair-preview", openCount],
    [movement.id, openCount],
  );
  const previewQuery = useQuery<CashShiftRepairPreview>({
    queryKey: previewKey,
    enabled: open && directNonVoidedReceipt && canManage && openCount > 0,
    queryFn: async () => {
      const res = await fetch(`/api/account-movements/${movement.id}/cash-shift-repair-preview`);
      if (!res.ok) {
        const message = (await res.text()) || res.statusText || "No se pudo consultar la vista previa";
        throw new Error(`${res.status}: ${message}`);
      }
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ previewToken, targetShiftId }: { previewToken: string; targetShiftId: string }) => {
      const res = await apiRequest("POST", `/api/account-movements/${movement.id}/cash-shift-repair`, {
        previewToken,
        targetShiftId,
      });
      return res.json();
    },
    onSuccess: () => {
      setOpen(false);
      setActionError(null);
      invalidateCashRepairRelatedQueries();
    },
    onError: (error: Error) => {
      setActionError(parseApiError(error));
      if (isStalePreviewError(error)) {
        void previewQuery.refetch();
      }
    },
  });

  useEffect(() => {
    setOpen(false);
    setOpenCount(0);
    setActionError(null);
    mutation.reset();
  }, [movement.id]);

  useEffect(() => {
    if (!open) {
      setActionError(null);
      mutation.reset();
      queryClient.removeQueries({ queryKey: previewKey, exact: true });
    }
  }, [open, previewKey]);

  if (!canManage || !directNonVoidedReceipt) return null;

  const openDialog = () => {
    mutation.reset();
    setActionError(null);
    setOpenCount((count) => count + 1);
    setOpen(true);
  };

  const closeDialog = () => {
    if (mutation.isPending) return;
    setOpen(false);
    setActionError(null);
    mutation.reset();
    queryClient.removeQueries({ queryKey: previewKey, exact: true });
  };

  const preview = previewQuery.data;
  const canApply = Boolean(
    preview
    && preview.status === "needs_repair"
    && preview.canRepair
    && preview.targetShift
    && preview.previewToken,
  );

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Vista previa de reparación de caja"
        aria-label={`Vista previa de reparación de caja para recibo ${movement.receiptNumber ?? movement.id}`}
        onClick={openDialog}
        data-testid={`button-repair-cash-shift-${movement.id}`}
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) openDialog();
          else closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reparar caja del recibo</DialogTitle>
            <DialogDescription>
              Revisá el turno de caja antes de confirmar. Esta reparación no crea otro recibo ni otro pago.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            {previewQuery.isFetching && (
              <div role="status" className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Consultando la vista previa…
              </div>
            )}
            {previewQuery.isError && (
              <Alert variant="destructive">
                <AlertDescription className="space-y-2">
                  <p>No se pudo cargar la vista previa: {parseApiError(previewQuery.error)}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void previewQuery.refetch()}>
                    Volver a consultar
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {actionError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
            {preview && (
              <>
                <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                  <div><span className="text-muted-foreground">Recibo:</span> {preview.receiptNumber}</div>
                  <div><span className="text-muted-foreground">Importe bruto:</span> {formatMoney(preview.grossAmount)}</div>
                  <div><span className="text-muted-foreground">Importe efectivo aplicado:</span> {formatMoney(preview.cashAmount)}</div>
                  <div>
                    <span className="text-muted-foreground">Retenciones informativas:</span> {formatMoney(preview.retentionAmount)}
                    <p className="text-xs text-muted-foreground">
                      Se conservan como información del recibo; no se modifica el importe ni se genera un cobro nuevo.
                    </p>
                  </div>
                  <div><span className="text-muted-foreground">Movimientos asociados:</span> {preview.movementCount}</div>
                </div>

                <section aria-label="Turnos de caja">
                  <h3 className="font-medium mb-1">Origen</h3>
                  {preview.fromShifts.length ? (
                    <ul className="list-disc pl-5 space-y-1">
                      {preview.fromShifts.map((shift) => <li key={shift.id}>{shiftDescription(shift)}</li>)}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">No hay turno de origen asociado.</p>
                  )}
                  <h3 className="font-medium mt-3 mb-1">Destino</h3>
                  {preview.targetShift
                    ? <p>{shiftDescription(preview.targetShift)}</p>
                    : <p className="text-muted-foreground">No hay un turno de destino disponible.</p>}
                </section>

                <Alert variant={preview.status === "blocked" ? "destructive" : "default"}>
                  <AlertDescription>
                    {preview.status === "already_correct"
                      ? `El recibo ya está asignado correctamente. ${preview.message}`
                      : preview.message}
                  </AlertDescription>
                </Alert>
              </>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={mutation.isPending}>
              Cerrar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (preview?.targetShift && preview.previewToken && canApply && !mutation.isPending) {
                  mutation.mutate({
                    previewToken: preview.previewToken,
                    targetShiftId: preview.targetShift.id,
                  });
                }
              }}
              disabled={!canApply || mutation.isPending}
              data-testid={`button-confirm-cash-shift-repair-${movement.id}`}
            >
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar reparación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}