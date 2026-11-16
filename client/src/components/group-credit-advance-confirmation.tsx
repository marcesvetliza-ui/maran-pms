import { groupCreditAdvanceSummary } from "@shared/groupCreditAdvance";
import { fmtMoney } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function GroupCreditAdvanceConfirmation({ balanceCents, receivedCents, permitted, eligible, reason, confirmed, onReason, onConfirm }: {
  balanceCents: number; receivedCents: number; permitted: boolean; eligible: boolean;
  reason: string; confirmed: boolean; onReason: (value: string) => void; onConfirm: (value: boolean) => void;
}) {
  const summary = groupCreditAdvanceSummary(balanceCents, receivedCents);
  return <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-3 dark:border-amber-800 dark:bg-amber-950/30" data-testid="group-credit-advance-confirmation">
    <p className="font-semibold">Este anticipo deja saldo a favor del grupo</p>
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <dt>{balanceCents < 0 ? "Saldo a favor actual" : "Saldo pendiente actual"}</dt><dd className="text-right tabular-nums">{fmtMoney(Math.abs(balanceCents) / 100)}</dd>
      <dt>Anticipo a registrar</dt><dd className="text-right tabular-nums">{fmtMoney(receivedCents / 100)}</dd>
      <dt className="font-semibold">Saldo a favor resultante</dt><dd className="text-right font-semibold tabular-nums">{fmtMoney(summary.creditCents / 100)}</dd>
    </dl>
    <p className="text-sm">El anticipo completo queda en el Folio Maestro sin asignar a habitaciones. Después podrás aplicarlo explícitamente a sus saldos. La diferencia a favor pertenece al grupo.</p>
    {!permitted ? <p role="alert" className="text-sm text-destructive">Necesitás el permiso «Aceptar anticipos de grupo superiores al saldo del Folio Maestro».</p>
      : !eligible ? <p role="alert" className="text-sm text-destructive">Usá Anticipo al Folio Maestro, sin cerrar habitaciones, con efectivo, transferencia o tarjeta y sin retenciones.</p>
      : <>
        <Label htmlFor="group-credit-advance-reason">Motivo del saldo a favor</Label>
        <Input id="group-credit-advance-reason" maxLength={500} value={reason} onChange={event => onReason(event.target.value)} placeholder="Ej.: adelanto del organizador para consumos posteriores" />
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={confirmed} onCheckedChange={value => onConfirm(value === true)} disabled={reason.trim().length < 3} />
          Confirmo registrar este anticipo y dejar {fmtMoney(summary.creditCents / 100)} a favor del grupo.
        </label>
      </>}
  </div>;
}
