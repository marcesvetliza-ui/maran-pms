import { useEffect, useRef, useState } from "react";
import { fmtMoney } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AccountMovement, AccountEntityType } from "@shared/schema";

const RETENTION_CONCEPTS = ["IIBB", "Ganancias", "IVA", "SUSS", "TISHPYS", "Otras"];

const PAYMENT_METHODS = [
  { value: "transferencia", label: "Transferencia" },
  { value: "echeq",         label: "eCheq" },
  { value: "cheque",        label: "Cheque" },
  { value: "efectivo",      label: "Efectivo" },
  { value: "compensacion",  label: "Compensación" },
  { value: "tarjeta",       label: "Tarjeta de crédito" },
  { value: "otro",          label: "Otro" },
];

type PendingCharge = AccountMovement & { saldoPendiente: number };

interface RetentionRow {
  concepto: string;
  monto: string;
}

interface PaymentRow {
  id: string;
  method: string;
  methodOther: string;
  amount: string;
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

let rowCounter = 0;
const newRowId = () => `row-${++rowCounter}`;

export function CCPaymentDialog({ open, onOpenChange, entityType, entityId, entityLabel, balance, onSuccess }: CCPaymentDialogProps) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentDescription, setPaymentDescription] = useState("Pago recibido");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    { id: newRowId(), method: "transferencia", methodOther: "", amount: "" },
  ]);
  const [selected, setSelected] = useState<Record<string, string>>({});
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

  // Reset on open
  useEffect(() => {
    if (open) {
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setPaymentDescription("Pago recibido");
      setPaymentReference("");
      setPaymentRows([{ id: newRowId(), method: "transferencia", methodOther: "", amount: "" }]);
      setSelected({});
      setRetentions([]);
    }
  }, [open]);

  // When allocations change, auto-fill first row amount with the new total
  const allocationsTotal = Object.values(selected).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const prevAllocsTotalRef = useRef(0);
  useEffect(() => {
    if (allocationsTotal !== prevAllocsTotalRef.current) {
      prevAllocsTotalRef.current = allocationsTotal;
      if (allocationsTotal > 0) {
        setPaymentRows(prev => prev.map((r, i) => i === 0 ? { ...r, amount: fmtMoney(allocationsTotal) } : r));
      }
    }
  }, [allocationsTotal]);

  const retentionsTotal = retentions.reduce((sum, r) => sum + (parseFloat(r.monto) || 0), 0);
  const totalAmount = paymentRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const hasAllocations = allocationsTotal > 0;
  const cashReceived = totalAmount - retentionsTotal;

  // Payment row helpers
  const addPaymentRow = () => {
    setPaymentRows(prev => [...prev, { id: newRowId(), method: "transferencia", methodOther: "", amount: "" }]);
  };
  const removePaymentRow = (idx: number) => {
    setPaymentRows(prev => prev.filter((_, i) => i !== idx));
  };
  const updatePaymentRow = (idx: number, field: keyof PaymentRow, value: string) => {
    setPaymentRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  // Allocation helpers
  const toggleCharge = (charge: PendingCharge, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) {
        next[charge.id] = fmtMoney(charge.saldoPendiente);
      } else {
        delete next[charge.id];
      }
      return next;
    });
  };
  const updateChargeAmount = (chargeId: string, value: string) => {
    setSelected((prev) => ({ ...prev, [chargeId]: value }));
  };

  // Retention helpers
  const addRetention = () => {
    setRetentions((prev) => [...prev, { concepto: RETENTION_CONCEPTS[0], monto: "" }]);
  };
  const updateRetention = (index: number, field: keyof RetentionRow, value: string) => {
    setRetentions((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  const removeRetention = (index: number) => {
    setRetentions((prev) => prev.filter((_, i) => i !== index));
  };

  const { toast } = useToast();

  const registerPaymentMutation = useMutation({
    mutationFn: async () => {
      const allocations = Object.entries(selected)
        .filter(([, amount]) => parseFloat(amount) > 0)
        .map(([cargoId, amount]) => ({ cargoId, amount: fmtMoney(amount) }));

      const validRetentions = retentions
        .filter((r) => r.concepto && parseFloat(r.monto) > 0)
        .map((r) => ({ concepto: r.concepto, monto: fmtMoney(r.monto) }));

      const activeRows = paymentRows.filter(r => (parseFloat(r.amount) || 0) > 0);
      if (activeRows.length === 0) throw new Error("Ingresá al menos un monto");

      let firstMovementId: number | null = null;

      for (let i = 0; i < activeRows.length; i++) {
        const row = activeRows[i];
        const resolvedMethod = row.method === "otro" ? (row.methodOther.trim() || "Otro") : row.method;

        const res = await apiRequest("POST", `/api/${pathSegment}/${entityId}/account/payment`, {
          amount: fmtMoney(parseFloat(row.amount)),
          description: paymentDescription + (activeRows.length > 1 ? ` (${PAYMENT_METHODS.find(m => m.value === row.method)?.label || resolvedMethod})` : ""),
          reference: paymentReference || null,
          paymentMethod: resolvedMethod,
          date: paymentDate,
          // Only the first row carries allocations and retentions
          allocations: i === 0 ? allocations : [],
          retentions: i === 0 ? validRetentions : null,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Error del servidor (${res.status})`);
        }
        const data = await res.json();
        if (i === 0 && data?.id) firstMovementId = data.id;
      }

      return firstMovementId;
    },
    onSuccess: (firstMovementId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/${pathSegment}`, entityId, "account"] });
      queryClient.invalidateQueries({ queryKey: [`/api/${pathSegment}`, entityId, "account", "pending-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/account-summary"] });
      onSuccess();
      onOpenChange(false);
      if (firstMovementId) {
        window.open(`/api/account-movements/${firstMovementId}/receipt-pdf`, "_blank");
      }
    },
    onError: (err: any) => {
      toast({
        title: "Error al registrar el pago",
        description: err?.message || "Intentá de nuevo o consultá con soporte.",
        variant: "destructive",
      });
    },
  });

  const canSubmit = totalAmount > 0 && !registerPaymentMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pago recibido</DialogTitle>
          <DialogDescription>
            {entityLabel} — Saldo actual: ${fmtMoney(Math.abs(balance))}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Comprobantes a cancelar */}
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
                        <p className="text-xs text-muted-foreground">{charge.date} · Pendiente: ${fmtMoney(charge.saldoPendiente)}</p>
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
              {!hasAllocations && (
                <p className="text-xs text-muted-foreground mt-1">Sin comprobantes seleccionados, el pago se aplicará como pago a cuenta general.</p>
              )}
            </div>
          )}

          {/* Formas de pago — múltiples rows */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Formas de pago</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addPaymentRow} data-testid="button-add-payment-row">
                <Plus className="h-3.5 w-3.5 mr-1" /> Agregar método
              </Button>
            </div>
            <div className="space-y-2">
              {paymentRows.map((row, idx) => (
                <div key={row.id} className="flex items-end gap-2" data-testid={`row-payment-${idx}`}>
                  <div className="w-32 shrink-0">
                    <Label className="text-xs text-muted-foreground mb-1 block">Monto</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={row.amount}
                      onChange={(e) => updatePaymentRow(idx, "amount", e.target.value)}
                      data-testid={`input-payment-amount-${idx}`}
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground mb-1 block">Método</Label>
                    <Select value={row.method} onValueChange={(v) => updatePaymentRow(idx, "method", v)}>
                      <SelectTrigger data-testid={`select-payment-method-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {row.method === "otro" && (
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground mb-1 block">Especificar</Label>
                      <Input
                        placeholder="Ej: débito, criptos..."
                        value={row.methodOther}
                        onChange={(e) => updatePaymentRow(idx, "methodOther", e.target.value)}
                        data-testid={`input-payment-method-other-${idx}`}
                      />
                    </div>
                  )}
                  {paymentRows.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removePaymentRow(idx)} data-testid={`button-remove-payment-${idx}`}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Retenciones */}
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

          {/* Resumen de totales */}
          {(totalAmount > 0 || retentionsTotal > 0) && (
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
              {paymentRows.filter(r => (parseFloat(r.amount) || 0) > 0).map((row, idx) => (
                <div key={row.id} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {PAYMENT_METHODS.find(m => m.value === row.method)?.label || row.methodOther || row.method}
                  </span>
                  <span className="tabular-nums">${fmtMoney(parseFloat(row.amount) || 0)}</span>
                </div>
              ))}
              {paymentRows.filter(r => (parseFloat(r.amount) || 0) > 0).length > 1 && (
                <div className="flex justify-between border-t pt-1">
                  <span className="text-muted-foreground font-medium">Total</span>
                  <span className="font-semibold tabular-nums">${fmtMoney(totalAmount)}</span>
                </div>
              )}
              {retentionsTotal > 0 && (
                <>
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-muted-foreground">Retenciones</span>
                    <span className="tabular-nums">-${fmtMoney(retentionsTotal)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-muted-foreground">Efectivo recibido</span>
                    <span className="font-semibold tabular-nums">${fmtMoney(cashReceived)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Fecha, descripción, referencia */}
          <div className="grid grid-cols-2 gap-3">
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
              <Label>Referencia (opcional)</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Nro. transferencia, cheque, etc."
                data-testid="input-cc-payment-reference"
              />
            </div>
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
