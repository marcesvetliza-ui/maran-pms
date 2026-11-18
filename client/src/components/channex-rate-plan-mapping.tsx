import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export type MappingRatePlan = { id: string; name: string; roomTypeId?: string; currency?: string; validFrom?: string | null; validTo?: string | null };
/** Show both sides of a mapping explicitly; names alone are not unique. */
export function ChannexRatePlanMapping({ id, title, roomTitle, roomTypeId, selected, plans, roomTypes, onChange, pending = false }: {
  id: string; title: string; roomTitle: string; roomTypeId: string | null; selected: string | null;
  plans: MappingRatePlan[]; roomTypes: { id: string; name: string }[]; onChange: (id: string | null) => void; pending?: boolean;
}) {
  const [draft,setDraft]=useState(selected);
  useEffect(()=>setDraft(selected),[selected,roomTypeId]);
  const eligible=plans.filter(plan=>plan.currency==='USD'&&!!roomTypeId&&plan.roomTypeId===roomTypeId);
  const invalidSaved=!!selected&&!eligible.some(plan=>plan.id===selected);
  const savedPlan=plans.find(plan=>plan.id===selected);
  const canSave=draft===null||eligible.some(plan=>plan.id===draft);
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
    <div className="w-64 text-sm"><div>{title}</div><div className="text-xs text-muted-foreground">{roomTitle}</div></div>
    <Select disabled={pending} value={draft ?? 'none'} onValueChange={value => setDraft(value === 'none' ? null : value)}>
      <SelectTrigger className="w-full sm:w-[24rem]" aria-label={`${title} · ${roomTitle}`} data-testid={`select-rate-plan-mapping-${id}`}><SelectValue placeholder="Sin mapear" /></SelectTrigger>
      <SelectContent><SelectItem value="none">Sin mapear</SelectItem>
        {invalidSaved&&<SelectItem value={selected!} disabled>{savedPlan?.name||'Tarifa anterior no disponible'} · Vínculo anterior a revisar</SelectItem>}
        {eligible.map(plan => <SelectItem key={plan.id} value={plan.id}>
          {plan.name} · {roomTypes.find(type => type.id === plan.roomTypeId)?.name ?? 'Sin categoría'} · {plan.currency ?? 'Sin moneda'}
          {plan.validFrom || plan.validTo ? ` · ${plan.validFrom ?? 'Sin inicio'} → ${plan.validTo ?? 'Sin fin'}` : ''}
        </SelectItem>)}
      </SelectContent>
    </Select>
    <Button variant="outline" size="sm" disabled={pending||draft===selected||!canSave} onClick={()=>{if(canSave)onChange(draft);}}>Guardar tarifa</Button>
    {invalidSaved&&<p role="alert" className="w-full text-sm text-amber-700 dark:text-amber-400">La tarifa vinculada no es un plan USD de esta categoría. Elegí la tarifa correcta y guardá el cambio.</p>}
    {!roomTypeId?<p className="w-full text-sm text-muted-foreground">Primero vinculá la categoría de Maran para elegir su tarifa USD.</p>:!eligible.length&&<p className="w-full text-sm text-muted-foreground">No hay tarifas USD para esta categoría. Creala desde Tarifas USD.</p>}
  </div>;
}
