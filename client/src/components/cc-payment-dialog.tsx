import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { AccountMovement, AccountEntityType } from "@shared/schema";

const RETENTION_CONCEPTS = ["IIBB", "Ganancias", "IVA", "SUSS", "TISHPYS", "Otras"];

type PendingCharge = AccountMovement & { saldoPendiente: number };

interface RetentionRow {
  concepto: string;
  monto: string;
}

interface CCPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: AccountEntityType;
  entityId: string | undefined;
  entityLabel: string;
  balance: number;
  onSuccess: () => void;
}

const entityPathSegment: Record<AccountEntityType, string> = {
  company: "companies",
  agency: "agencies",
  guest: "guests",
};

export function CCPaymentDialog({ open, onOpenChange, entityType, entityId, entityLabel, balance, onSuccess }: CCPaymentDialogProps) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentDescription, setPaymentDescription] = useState("Pago recibido");
  const [paymentReference, setPaymentReference] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [manualAmount, setManualAmount] = useState("");
  const [retentions, setRetentions] = useState<RetentionRow[]>([]);

  const pathSegment = entityPathSegment[entityType];

  const { data: pendingCharges = [] } = useQuery<PendingCharge[]>({
    queryKey: [`/api/${pathSegment}`, entityId, "account", "pending-charges"],
    queryFn: async () => {
      const res = await fetch(`/api/${pathSegment}/${entityId}/account/pending-charges`);
      if (!res.ok) throw new Error("Error al obtener cargos pendientes");
      return res.json();
    },
    enabled: open && !!entityId,
  });

  useEffect(() => {
    if (open) {
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setPaymentDescription("Pago recibido");
      setPaymentReference("");
      setSelected({});
      setManualAmount("");
      setRetentions([]);
    }
  }, [open]);

  const allocationsTotal = Object.values(selected).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const retentionsTotal = retentions.reduce((sum, r) => sum + (parseFloat(r.monto) || 0), 0);
  const hasAllocations = allocationsTotal > 0;
  const totalAmount = hasAllocations ? allocationsTotal : parseFloat(manualAmount) || 0;
  const cashReceived = totalAmount - retentionsTotal;

  const toggleCharge = (charge: PendingCharge, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) {
        next[charge.id] = charge.saldoPendiente.toFixed(2);
      } else {
        delete next[charge.id];
      }
      return next;
    });
  };

  const updateChargeAmount = (chargeId: string, value: string) => {
    setSelected((prev) => ({ ...prev, [chargeId]: value }));
  };

  const addRetention = () => {
    setRetentions((prev) => [...prev, { concepto: RETENTION_CONCEPTS[0], monto: "" }]);
  };

  const updateRetention = (index: number, field: keyof RetentionRow, value: string) => {
    setRetentions((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const removeRetention = (index: number) => {
    setRetentions((prev) => prev.filter((_, i) => i !== index));
  };

  const registerPaymentMutation = useMutation({
    mutationFn: async () => {
      const allocations = Object.entries(selected)
        .filter(([, amount]) => parseFloat(amount) > 0)
        .map(([cargoId, amount]) => ({ cargoId, amount: parseFloat(amount).toFixed(2) }));

      const validRetentions = retentions
        .filter((r) => r.concepto && parseFloat(r.monto) > 0)
        .map((r) => ({ concepto: r.concepto, monto: parseFloat(r.monto).toFixed(2) }));

      const res = await apiRequest("POST", `/api/${pathSegment}/${entityId}/account/payment`, {
        amount: totalAmount.toFixed(2),
        description: paymentDescription,
        reference: paymentReference || null,
        date: paymentDate,
        allocations,
        retentions: validRetentions,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/${pathSegment}`, entityId, "account"] });
      queryClient.invalidateQueries({ queryKey: [`/api/${pathSegment}`, entityId, "account", "pending-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/account-summary"] });
      onSuccess();
      onOpenChange(false);
      if (data?.id) {
        window.open(`/api/account-movements/${data.id}/receipt-pdf`, "_blank");
      }
    },
  });

  const canSubmit = totalAmount > 0 && !registerPaymentMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pago recibido</DialogTitle>
          <DialogDescription>
            {entityLabel} — Saldo actual: ${Math.abs(balance).toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {pendingCharges.length > 0 && (
            <div>
              <Label>Comprobantes a cancelar</Label>
              <div className="border rounded-md mt-1 divide-y max-h-56 overflow-y-auto">
                {pendingCharges.map((charge) => {
                  const isChecked = charge.id in selected;
                  return (
                    <div key={charge.id} className="flex items-center gap-3 p-2" data-testid={`row-pending-charge-${charge.id}`}>
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => toggleCharge(charge, !!checked)}
                        data-testid={`checkbox-charge-${charge.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{charge.description}</p>
                        <p className="text-xs text-muted-foreground">{charge.date} · Pendiente: ${charge.saldoPendiente.toFixed(2)}</p>
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        className="w-28"
                        disabled={!isChecked}
                        value={selected[charge.id] ?? ""}
                        onChange={(e) => updateChargeAmount(charge.id, e.target.value)}
                        data-testid={`input-charge-amount-${charge.id}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!hasAllocations && (
            <div>
              <Label>Monto recibido</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                data-testid="input-cc-payment-amount"
              />
              {pendingCharges.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Sin comprobantes seleccionados, se aplicará como pago a cuenta general.
                </p>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <Label>Retenciones (opcional)</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addRetention} data-testid="button-add-retention">
                <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
              </Button>
            </div>
            {retentions.length > 0 && (
              <div className="space-y-2 mt-1">
                {retentions.map((r, i) => (
                  <div key={i} className="flex items-center gap-2" data-testid={`row-retention-${i}`}>
                    <Select value={r.concepto} onValueChange={(v) => updateRetention(i, "concepto", v)}>
                      <SelectTrigger className="w-40" data-testid={`select-retention-concepto-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RETENTION_CONCEPTS.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Monto"
                      value={r.monto}
                      onChange={(e) => updateRetention(i, "monto", e.target.value)}
                      data-testid={`input-retention-monto-${i}`}
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRetention(i)} data-testid={`button-remove-retention-${i}`}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(hasAllocations || retentionsTotal > 0) && (
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total cancelado</span>
                <span className="font-medium tabular-nums">${totalAmount.toFixed(2)}</span>
              </div>
              {retentionsTotal > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Retenciones</span>
                    <span className="font-medium tabular-nums">-${retentionsTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-muted-foreground">Efectivo/transferencia recibido</span>
                    <span className="font-semibold tabular-nums">${cashReceived.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          <div>
            <Label>Fecha</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              data-testid="input-cc-payment-date"
            />
          </div>
          <div>
            <Label>Descripción</Label>
            <Input
              value={paymentDescription}
              onChange={(e) => setPaymentDescription(e.target.value)}
              placeholder="Ej: Pago por transferencia"
              data-testid="input-cc-payment-description"
            />
          </div>
          <div>
            <Label>Referencia (opcional)</Label>
            <Input
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Nro. transferencia, cheque, etc."
              data-testid="input-cc-payment-reference"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => registerPaymentMutation.mutate()}
            disabled={!canSubmit}
            data-testid="button-confirm-cc-payment"
          >
            {registerPaymentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {registerPaymentMutation.isPending ? "Guardando..." : "Confirmar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
