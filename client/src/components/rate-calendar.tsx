import {RateMonthGrid} from './rate-month-grid';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient, parseApiError } from '@/lib/queryClient';
import { getArgentinaToday } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { calendarAddDays, calendarDays, calendarRequestSchema, calendarIntents, type CalendarRequest, type CalendarPreview, type CalendarCell } from '@shared/rate-calendar';
import { formatDisplayDate } from '@shared/date-display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Plan = { id: string; name: string; currency: string; roomType?: { name: string }; rate1pax?: string|null; rate2pax?: string|null; rate3pax?: string|null; rate4pax?: string|null; sellMode?: string|null };
type Choice = 'keep' | 'yes' | 'no';
type Draft = { id: number; ratePlanIds: string[]; dateFrom: string; dateTo: string; rateMode: 'keep' | 'base' | 'set'; rate: string; occupancyMode: 'keep'|'set'|'base'; occupancyRates: Record<string,string>; minStayArrival: string; minStayThrough: string; maxStay: string; stopSell: Choice; closedToArrival: Choice; closedToDeparture: Choice };
const newDraft = (id: number, ids: string[], from: string, to: string): Draft => ({ id, ratePlanIds: [...ids], dateFrom: from, dateTo: to, rateMode: 'keep', rate: '', occupancyMode:'keep', occupancyRates:{'1':'','2':'','3':'','4':''}, minStayArrival: '', minStayThrough: '', maxStay: '', stopSell: 'keep', closedToArrival: 'keep', closedToDeparture: 'keep' });
function buildRequest(drafts: Draft[]): CalendarRequest {
  const changes = drafts.map(d => {
    const values: any = {}; if (d.rateMode !== 'keep') values.rate = d.rateMode === 'base' ? null : d.rate;
    if(d.occupancyMode==='base')values.occupancyRates={'1':null,'2':null,'3':null,'4':null};
    if(d.occupancyMode==='set'){values.occupancyRates=Object.fromEntries(Object.entries(d.occupancyRates).filter(([,rate])=>rate!==''));if(!Object.keys(values.occupancyRates).length)throw Error('Ingresá al menos un precio por cantidad de personas');}
    for (const field of ['minStayArrival', 'minStayThrough', 'maxStay'] as const) if (d[field] !== '') values[field] = Number(d[field]);
    for (const field of ['stopSell', 'closedToArrival', 'closedToDeparture'] as const) if (d[field] !== 'keep') values[field] = d[field] === 'yes';
    return { ratePlanIds: d.ratePlanIds, dateFrom: d.dateFrom, dateTo: d.dateTo, values };
  });
  const parsed = calendarRequestSchema.safeParse({ changes });
  if (!parsed.success) throw Error('Elegí planes, fechas y al menos un cambio válido por período. Los precios deben ser positivos y las estadías, enteras');
  calendarIntents(parsed.data); return parsed.data;
}
const money = (cell: CalendarCell) => { try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cell.currency }).format(Number(cell.rate)); } catch { return `${cell.currency} ${Number(cell.rate).toFixed(2)}`; } };
function cellChanges(before: CalendarCell, after: CalendarCell) {
  const text: string[] = [];
  if (before.rate !== after.rate || before.rateOverride !== after.rateOverride) text.push(`Precio: ${money(before)} → ${money(after)}${after.rateOverride === null ? ' (tarifa base)' : ''}`);
  for(const occupancy of ['1','2','3','4'])if(before.occupancyRates?.[occupancy]!==after.occupancyRates?.[occupancy]||before.occupancyOverrides?.[occupancy]!==after.occupancyOverrides?.[occupancy])text.push(`${occupancy} persona(s): ${before.occupancyRates?.[occupancy]!=null?money({...before,rate:before.occupancyRates[occupancy]}):'sin precio'} → ${after.occupancyRates?.[occupancy]!=null?money({...after,rate:after.occupancyRates[occupancy]}):'sin precio'}`);
  const fields = [['minStayArrival', 'Mínimo a la llegada'], ['minStayThrough', 'Mínimo durante la estadía'], ['maxStay', 'Máximo']] as const;
  for (const [key, label] of fields) if (before[key] !== after[key]) text.push(`${label}: ${before[key] || 'sin límite'} → ${after[key] || 'sin límite'}`);
  for (const [key, label] of [['stopSell', 'Cierre de ventas'], ['closedToArrival', 'Cierre de llegadas'], ['closedToDeparture', 'Cierre de salidas']] as const) if (before[key] !== after[key]) text.push(`${label}: ${before[key] ? 'sí' : 'no'} → ${after[key] ? 'sí' : 'no'}`);
  return text;
}
export function RateCalendar({ plans, canEdit }: { plans: Plan[]; canEdit: boolean }) {
  const { toast } = useToast(), today = getArgentinaToday();
  const [viewed,setViewed]=useState(plans[0]?.id||'');
  const [occupancy,setOccupancy]=useState('1');
  const [editing,setEditing]=useState(1);
  const [selected, setSelected] = useState<string[]>(plans[0] ? [plans[0].id] : []), [from, setFrom] = useState(today.slice(0,7)+'-01'), [to, setTo] = useState(new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).toISOString().slice(0,10));
  const [drafts, setDrafts] = useState<Draft[]>([newDraft(1, selected, today, today)]), [nextId, setNextId] = useState(2);
  const [review, setReview] = useState<{ request: CalendarRequest; preview: CalendarPreview } | null>(null), [previewPage, setPreviewPage] = useState(0);
  const label = (id: string) => { const p = plans.find(p => p.id === id); return p ? `${p.roomType?.name ?? ''} · ${p.name} (${p.currency})` : id; };
  let validRange = false; try { validRange = selected.length > 0 && selected.length <= 20 && calendarDays(from, to).length * selected.length <= 5000; } catch { }
  const { data, isFetching, error, refetch } = useQuery<{ cells: CalendarCell[] }>({
    queryKey: ['/api/rate-calendar', selected.slice().sort().join(','), from, to], enabled: validRange,
    queryFn: async () => { const q = new URLSearchParams({ ratePlanIds: selected.join(','), dateFrom: from, dateTo: to }); return (await apiRequest('GET', `/api/rate-calendar?${q}`)).json(); }
  });
  const previewMutation = useMutation({
    mutationFn: async (request: CalendarRequest) => ({ request, preview: await (await apiRequest('POST', '/api/rate-calendar/preview', request)).json() as CalendarPreview }),
    onSuccess: result => { setReview(result); setPreviewPage(0); }, onError: e => toast({ title: 'Revisá la propuesta', description: parseApiError(e), variant: 'destructive' })
  });
  const applyMutation = useMutation({
    mutationFn: async (current: NonNullable<typeof review>) => (await apiRequest('POST', '/api/rate-calendar/apply', { ...current.request, previewToken: current.preview.previewToken })).json(),
    onSuccess: () => { setReview(null); setDrafts([newDraft(nextId, selected, today, today)]); setEditing(nextId); setNextId(n=>n+1); queryClient.invalidateQueries({ queryKey: ['/api/rate-calendar'] }); toast({ title: 'Calendario guardado', description: 'Se actualizaron las reglas de venta por fecha. Los importes de las reservas existentes se conservan.' }); },
    onError: e => { setReview(null); queryClient.invalidateQueries({ queryKey: ['/api/rate-calendar'] }); toast({ title: 'No se pudo confirmar el cambio', description: parseApiError(e), variant: 'destructive' }); }
  });
  const busy = previewMutation.isPending || applyMutation.isPending;
  const update = (id: number, patch: Partial<Draft>) => { setDrafts(rows => rows.map(r => r.id === id ? { ...r, ...patch, ...(patch.ratePlanIds ? {rateMode:'keep' as const,rate:'',occupancyMode:'keep' as const,occupancyRates:{'1':'','2':'','3':'','4':''}} : {}) } : r)); setReview(null); };
  const choose = (ids: string[], id: string) => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  const booleanField = (d: Draft, key: 'stopSell' | 'closedToArrival' | 'closedToDeparture', title: string) => <Label className="space-y-1">{title}<select aria-label={`${title} período ${d.id}`} className="w-full rounded border bg-background px-2 py-2" value={d[key]} onChange={e => update(d.id, { [key]: e.target.value })}><option value="keep">No cambiar</option><option value="yes">Sí</option><option value="no">No</option></select></Label>;
  const usesOccupancy=(id:string)=>{const p=plans.find(p=>p.id===id);return !!p&&p.sellMode!=='per_room'&&(p.sellMode==='per_person'||[p.rate1pax,p.rate2pax,p.rate3pax,p.rate4pax].some(rate=>rate!=null)||!!data?.cells.some(cell=>cell.ratePlanId===id&&Object.keys(cell.occupancyRates||{}).length>0));};
  const offered=(ids:string[])=>{const keys=[...new Set(ids.flatMap(id=>{const p=plans.find(p=>p.id===id);return ['1','2','3','4'].filter(pax=>p?.[`rate${pax}pax` as keyof Plan]!=null||data?.cells.some(c=>c.ratePlanId===id&&c.occupancyRates?.[pax]!=null));}))];return keys.length?keys:['1','2','3','4'];};
  const displayId=selected.includes(viewed)?viewed:selected[0]||'';
  const displayCells=data?.cells.filter(cell=>cell.ratePlanId===displayId)||[];
  const occupancies=usesOccupancy(displayId)?[...new Set(displayCells.flatMap(cell=>Object.keys(cell.occupancyRates||{})))].sort():[];
  const displayOccupancy=occupancies.includes(occupancy)?occupancy:occupancies[0]||'';
  const currentDraft=drafts.find(d=>d.id===editing)||drafts[0];
  const monthChanged=(month:string)=>{setFrom(month);setTo(new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10));};
  return <section data-testid="rate-calendar" className="space-y-5"><p className="text-sm text-muted-foreground">Precios y restricciones de venta para canales. Se conserva la moneda de cada plan; las reservas y facturas existentes no se recalculan.</p>
    <fieldset className="rounded-xl border bg-white dark:bg-card p-4 space-y-3" disabled={busy}><legend className="px-2 text-xs font-semibold uppercase text-muted-foreground">Planes y fechas</legend>
      <div className="flex flex-wrap gap-3"><Label>Desde<Input aria-label="Consultar desde" type="date" value={from} onChange={e => { setFrom(e.target.value); }} /></Label><Label>Hasta<Input aria-label="Consultar hasta" type="date" value={to} onChange={e => { setTo(e.target.value); }} /></Label></div>
      <div className="flex flex-wrap gap-2">{plans.map(p => <Label key={p.id} className="flex gap-2 items-center rounded-full border px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => { const ids=choose(selected,p.id); setSelected(ids); update(currentDraft.id,{ratePlanIds:ids}); }} />{label(p.id)}</Label>)}</div>
    </fieldset>
    {!validRange && <p role="alert">Elegí hasta 20 planes y un período de hasta 500 días, con un máximo de 5000 noches entre todos los planes.</p>}
    {error && <p role="alert">No se pudo cargar el calendario. <Button variant="outline" onClick={() => refetch()}>Volver a consultar</Button></p>}
    {isFetching && <p>Cargando calendario…</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="min-w-0 space-y-4"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-muted-foreground">Viendo precios de</span>{selected.map(id=><Button key={id} size="sm" variant={displayId===id?'default':'outline'} onClick={()=>setViewed(id)}>{label(id)}</Button>)}{occupancies.length>0&&<Label className="ml-auto">Ocupación<select aria-label="Ocupación visible" className="ml-2 rounded border bg-background p-2" value={displayOccupancy} onChange={e=>setOccupancy(e.target.value)}>{occupancies.map(pax=><option key={pax} value={pax}>{pax} persona(s)</option>)}</select></Label>}</div>
    {validRange&&<RateMonthGrid key={displayId} month={from} cells={isFetching?[]:displayCells} occupancy={displayOccupancy} canEdit={canEdit&&!busy} range={{from:currentDraft.dateFrom,to:currentDraft.dateTo}} onMonth={monthChanged} onRange={(dateFrom,dateTo)=>update(currentDraft.id,{dateFrom,dateTo,...(currentDraft.ratePlanIds.join(',')!==selected.join(',')?{ratePlanIds:[...selected]}:{})})}/>}
    <p className="text-xs text-muted-foreground">Los precios se muestran en la moneda del plan. El calendario edita tarifas por categoría y plan; las habitaciones físicas se eligen en Vincular habitaciones.</p></div>
    <aside className="min-w-0 space-y-4 xl:sticky xl:top-4">
    {canEdit && <><fieldset className="space-y-4" disabled={busy}><legend className="font-semibold mb-3">Editar selección</legend><p className="text-xs text-muted-foreground">Los extremos son inclusivos. Cada período conserva sus propios planes y valores.</p>
      {drafts.map(d => {const occupancyPlan=d.ratePlanIds.some(usesOccupancy);return <div key={d.id} onFocusCapture={()=>setEditing(d.id)} className={`rounded-xl border bg-white dark:bg-card p-4 space-y-3 ${currentDraft.id===d.id?'border-primary/40':''}`}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Período {d.id}</h3><Button variant="ghost" size="sm" disabled={drafts.length>=50} onClick={()=>{setDrafts(rows=>[...rows,{...d,id:nextId,ratePlanIds:[...d.ratePlanIds],occupancyRates:{...d.occupancyRates}}]);setEditing(nextId);setNextId(n=>n+1);setReview(null);}}>Duplicar período {d.id}</Button><Button variant="ghost" size="sm" disabled={drafts.length === 1} onClick={() => { setDrafts(rows => rows.filter(r => r.id !== d.id)); setReview(null); }}>Quitar período {d.id}</Button></div>
        <div className="flex flex-wrap gap-2">{plans.map(p => <Label key={p.id} className="flex gap-2 items-center rounded-full border px-3 py-2 text-sm"><input aria-label={`${label(p.id)} período ${d.id}`} type="checkbox" checked={d.ratePlanIds.includes(p.id)} onChange={() => update(d.id, { ratePlanIds: choose(d.ratePlanIds, p.id) })} />{label(p.id)}</Label>)}</div>
        <div className="grid gap-3 sm:grid-cols-2"><Label>Desde<Input aria-label={`Desde período ${d.id}`} type="date" value={d.dateFrom} onChange={e => update(d.id, { dateFrom: e.target.value })} /></Label><Label>Hasta, inclusive<Input aria-label={`Hasta período ${d.id}`} type="date" value={d.dateTo} onChange={e => update(d.id, { dateTo: e.target.value })} /></Label>
          {!occupancyPlan&&<Label>Precio<select aria-label={`Acción de precio período ${d.id}`} className="w-full rounded border bg-background px-2 py-2" value={d.rateMode} onChange={e => update(d.id, { rateMode: e.target.value as Draft['rateMode'] })}><option value="keep">No cambiar</option><option value="set">Definir precio</option><option value="base">Volver a tarifa base</option></select></Label>}
          {!occupancyPlan&&d.rateMode === 'set' && <Label>Importe por noche<Input aria-label={`Precio período ${d.id}`} type="number" min="0.01" step="0.01" value={d.rate} onChange={e => update(d.id, { rate: e.target.value })} /></Label>}
        </div>
        <div className="space-y-2"><Label>Precios por cantidad de personas<select aria-label={`Acción de precios por ocupación período ${d.id}`} className="w-full rounded border bg-background p-2" value={d.occupancyMode} onChange={e=>update(d.id,{occupancyMode:e.target.value as Draft['occupancyMode']})}><option value="keep">No cambiar</option><option value="set">Definir importes por ocupación</option><option value="base">Volver a precios por ocupación del plan</option></select></Label>
        {d.occupancyMode==='set'&&<div className="grid gap-3 sm:grid-cols-2">{offered(d.ratePlanIds).map(pax=><Label key={pax}>Total por noche, {pax} persona(s)<Input aria-label={`Precio ${pax} personas período ${d.id}`} type="number" min="0.01" step="0.01" placeholder="No cambiar" value={d.occupancyRates[pax]} onChange={e=>update(d.id,{occupancyRates:{...d.occupancyRates,[pax]:e.target.value}})}/></Label>)}</div>}
        <p className="text-xs text-muted-foreground">Totales por habitación y noche. Los importes vacíos conservan su valor.</p></div>
        <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Restricciones de venta</summary><div className="mt-3 space-y-3">        <div className="grid gap-3 sm:grid-cols-2">{([['minStayArrival', 'Mínimo a la llegada'], ['minStayThrough', 'Mínimo durante la estadía'], ['maxStay', 'Estadía máxima']] as const).map(([key, title]) => <Label key={key}>{title}<Input aria-label={`${title} período ${d.id}`} placeholder="No cambiar" type="number" min={key === 'maxStay' ? 0 : 1} max={365} step={1} value={d[key]} onChange={e => update(d.id, { [key]: e.target.value })} /></Label>)}{booleanField(d, 'stopSell', 'Cerrar ventas')}{booleanField(d, 'closedToArrival', 'Cerrar llegadas')}{booleanField(d, 'closedToDeparture', 'Cerrar salidas')}</div>
        <p className="text-xs text-muted-foreground">Campos vacíos: conservan el valor. Estadía máxima 0: sin límite. Los mínimos se expresan en noches; el mínimo a la llegada se evalúa en el día de ingreso y el mínimo durante la estadía aplica a las noches incluidas.</p>
</div></details>
      </div>;})}
      <div className="rounded-lg border bg-muted/20 p-3 text-sm">Cambios pendientes: {drafts.filter(d=>d.rateMode!=='keep'||d.occupancyMode!=='keep'||d.minStayArrival!==''||d.minStayThrough!==''||d.maxStay!==''||[d.stopSell,d.closedToArrival,d.closedToDeparture].some(value=>value!=='keep')).length} períodos. Se guardan únicamente después de revisar y confirmar.</div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={drafts.length >= 50} onClick={() => { setDrafts(rows => [...rows, newDraft(nextId, selected, from, to)]); setEditing(nextId); setNextId(n => n + 1); setReview(null); }}>Agregar período</Button><Button onClick={() => { try { previewMutation.mutate(buildRequest(drafts)); } catch (e) { toast({ title: 'Revisá los datos', description: (e as Error).message, variant: 'destructive' }); } }}>{previewMutation.isPending ? 'Revisando…' : 'Revisar cambios'}</Button></div>
    </fieldset>
      {review && <section aria-label="Revisión de cambios" className="rounded border p-4 space-y-3"><h3 className="font-medium">Revisión: {review.preview.changedCells} noches con cambios de {review.preview.selectedCells} seleccionadas</h3><p className="text-sm">El calendario todavía no fue modificado. Al confirmar se guardan todos los períodos juntos.</p>
        <div className="space-y-3">{review.preview.segments.slice(previewPage * 50, (previewPage + 1) * 50).map((s, i) => <div key={i} className="text-sm"><p className="font-medium">{label(s.ratePlanId)} · {formatDisplayDate(s.dateFrom)} → {formatDisplayDate(s.dateTo)}</p>{cellChanges(s.before, s.after).map(t => <p key={t}>{t}</p>)}</div>)}</div>
        <Pagination page={previewPage} count={review.preview.segments.length} size={50} onChange={setPreviewPage} />
        <div className="flex flex-wrap gap-2"><Button disabled={busy || review.preview.changedCells === 0} onClick={() => applyMutation.mutate(review)}>{applyMutation.isPending ? 'Guardando…' : 'Confirmar cambios'}</Button><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancelar revisión</Button></div>
      </section>}</>}
    </aside></div>
  </section>;
}
function Pagination({ page, count, size, onChange }: { page: number; count: number; size: number; onChange: (page: number) => void }) {
  if (count <= size) return null;
  return <div className="flex gap-3 items-center text-sm"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>Anterior</Button><span>{page * size + 1}–{Math.min((page + 1) * size, count)} de {count}</span><Button variant="outline" size="sm" disabled={(page + 1) * size >= count} onClick={() => onChange(page + 1)}>Siguiente</Button></div>;
}
