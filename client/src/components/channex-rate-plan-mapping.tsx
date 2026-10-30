import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export type MappingRatePlan = { id: string; name: string; roomTypeId?: string; currency?: string; validFrom?: string | null; validTo?: string | null };
/** Show both sides of a mapping explicitly; names alone are not unique. */
export function ChannexRatePlanMapping({ id, title, roomTitle, selected, plans, roomTypes, onChange }: {
  id: string; title: string; roomTitle: string; selected: string | null;
  plans: MappingRatePlan[]; roomTypes: { id: string; name: string }[]; onChange: (id: string | null) => void;
}) {
  return <div className="flex flex-wrap items-center gap-3">
    <div className="w-64 text-sm"><div>{title}</div><div className="text-xs text-muted-foreground">{roomTitle}</div></div>
    <Select value={selected ?? 'none'} onValueChange={value => onChange(value === 'none' ? null : value)}>
      <SelectTrigger className="w-full sm:w-[28rem]" aria-label={`${title} · ${roomTitle}`} data-testid={`select-rate-plan-mapping-${id}`}><SelectValue placeholder="Sin mapear" /></SelectTrigger>
      <SelectContent><SelectItem value="none">Sin mapear</SelectItem>
        {plans.map(plan => <SelectItem key={plan.id} value={plan.id}>
          {plan.name} · {roomTypes.find(type => type.id === plan.roomTypeId)?.name ?? 'Sin categoría'} · {plan.currency ?? 'Sin moneda'}
          {plan.validFrom || plan.validTo ? ` · ${plan.validFrom ?? 'Sin inicio'} → ${plan.validTo ?? 'Sin fin'}` : ''}
        </SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}
