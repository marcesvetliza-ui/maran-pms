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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Plan = { id: string; name: string; currency: string; roomType?: { name: string } };
type Choice = 'keep' | 'yes' | 'no';
type Draft = { id: number; ratePlanIds: string[]; dateFrom: string; dateTo: string; rateMode: 'keep' | 'base' | 'set'; rate: string; minStayArrival: string; minStayThrough: string; maxStay: string; stopSell: Choice; closedToArrival: Choice; closedToDeparture: Choice };
const newDraft = (id: number, ids: string[], from: string, to: string): Draft => ({ id, ratePlanIds: [...ids], dateFrom: from, dateTo: to, rateMode: 'keep', rate: '', minStayArrival: '', minStayThrough: '', maxStay: '', stopSell: 'keep', closedToArrival: 'keep', closedToDeparture: 'keep' });
function buildRequest(drafts: Draft[]): CalendarRequest {
  const changes = drafts.map(d => {
    const values: any = {}; if (d.rateMode !== 'keep') values.rate = d.rateMode === 'base' ? null : d.rate;
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
  const fields = [['minStayArrival', 'Mínimo a la llegada'], ['minStayThrough', 'Mínimo durante la estadía'], ['maxStay', 'Máximo']] as const;
  for (const [key, label] of fields) if (before[key] !== after[key]) text.push(`${label}: ${before[key] || 'sin límite'} → ${after[key] || 'sin límite'}`);
  for (const [key, label] of [['stopSell', 'Cierre de ventas'], ['closedToArrival', 'Cierre de llegadas'], ['closedToDeparture', 'Cierre de salidas']] as const) if (before[key] !== after[key]) text.push(`${label}: ${before[key] ? 'sí' : 'no'} → ${after[key] ? 'sí' : 'no'}`);
  return text;
}
export function RateCalendar({ plans, canEdit }: { plans: Plan[]; canEdit: boolean }) {
  const { toast } = useToast(), today = getArgentinaToday();
  const [selected, setSelected] = useState<string[]>(plans[0] ? [plans[0].id] : []), [from, setFrom] = useState(today), [to, setTo] = useState(calendarAddDays(today, 6));
  const [drafts, setDrafts] = useState<Draft[]>([newDraft(1, selected, from, to)]), [nextId, setNextId] = useState(2);
  const [review, setReview] = useState<{ request: CalendarRequest; preview: CalendarPreview } | null>(null), [previewPage, setPreviewPage] = useState(0), [viewPage, setViewPage] = useState(0);
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
    onSuccess: () => { setReview(null); queryClient.invalidateQueries({ queryKey: ['/api/rate-calendar'] }); toast({ title: 'Calendario guardado', description: 'Se actualizaron las reglas de venta por fecha. Los importes de las reservas existentes se conservan.' }); },
    onError: e => { setReview(null); queryClient.invalidateQueries({ queryKey: ['/api/rate-calendar'] }); toast({ title: 'No se pudo confirmar el cambio', description: parseApiError(e), variant: 'destructive' }); }
  });
  const busy = previewMutation.isPending || applyMutation.isPending;
  const update = (id: number, patch: Partial<Draft>) => { setDrafts(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r)); setReview(null); };
  const choose = (ids: string[], id: string) => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  const booleanField = (d: Draft, key: 'stopSell' | 'closedToArrival' | 'closedToDeparture', title: string) => <Label className="space-y-1">{title}<select aria-label={`${title} período ${d.id}`} className="w-full rounded border bg-background px-2 py-2" value={d[key]} onChange={e => update(d.id, { [key]: e.target.value })}><option value="keep">No cambiar</option><option value="yes">Sí</option><option value="no">No</option></select></Label>;
  return <Card data-testid="rate-calendar"><CardHeader><CardTitle>Calendario de venta</CardTitle><p className="text-sm text-muted-foreground">Precios por noche y restricciones para la venta por canales. Se conserva la moneda de cada plan y no se recalculan reservas ni facturas existentes.</p></CardHeader><CardContent className="space-y-6">
    <fieldset className="space-y-3" disabled={busy}><legend className="font-medium">Consultar calendario</legend>
      <div className="flex flex-wrap gap-3"><Label>Desde<Input aria-label="Consultar desde" type="date" value={from} onChange={e => { setFrom(e.target.value); setViewPage(0); }} /></Label><Label>Hasta<Input aria-label="Consultar hasta" type="date" value={to} onChange={e => { setTo(e.target.value); setViewPage(0); }} /></Label></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{plans.map(p => <Label key={p.id} className="flex gap-2 items-center"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => { setSelected(choose(selected, p.id)); setViewPage(0); }} />{label(p.id)}</Label>)}</div>
    </fieldset>
    {!validRange && <p role="alert">Elegí hasta 20 planes y un período de hasta 500 días, con un máximo de 5000 noches entre todos los planes.</p>}
    {error && <p role="alert">No se pudo cargar el calendario. <Button variant="outline" onClick={() => refetch()}>Volver a consultar</Button></p>}
    {isFetching && <p>Cargando calendario…</p>}
    {data && validRange && <><div className="overflow-x-auto max-h-[28rem]"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th>Plan</th><th>Noche</th><th>Precio</th><th>Mín. llegada</th><th>Mín. estadía</th><th>Máximo</th><th>Venta</th><th>Llegadas</th><th>Salidas</th></tr></thead><tbody>{data.cells.slice(viewPage * 100, (viewPage + 1) * 100).map(c => <tr key={`${c.ratePlanId}:${c.date}`} className="border-b"><td className="pr-3 py-2">{label(c.ratePlanId)}</td><td className="whitespace-nowrap pr-3">{formatDisplayDate(c.date)}</td><td className="whitespace-nowrap pr-3">{money(c)}{c.rateOverride === null ? ' · base' : ''}</td><td>{c.minStayArrival}</td><td>{c.minStayThrough}</td><td>{c.maxStay || 'Sin límite'}</td><td>{!c.isValidDate ? 'Fuera de vigencia' : c.stopSell ? 'Cerrada' : 'Abierta'}</td><td>{c.closedToArrival ? 'Cerradas' : 'Abiertas'}</td><td>{c.closedToDeparture ? 'Cerradas' : 'Abiertas'}</td></tr>)}</tbody></table></div><Pagination page={viewPage} count={data.cells.length} size={100} onChange={setViewPage} /></>}
    {canEdit && <><fieldset className="space-y-4" disabled={busy}><legend className="font-medium mb-3">Editar períodos</legend>
      {drafts.map(d => <div key={d.id} className="rounded border p-4 space-y-3"><div className="flex justify-between"><h3 className="font-medium">Período {d.id}</h3><Button variant="ghost" disabled={drafts.length === 1} onClick={() => { setDrafts(rows => rows.filter(r => r.id !== d.id)); setReview(null); }}>Quitar período {d.id}</Button></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{plans.map(p => <Label key={p.id} className="flex gap-2 items-center"><input aria-label={`${label(p.id)} período ${d.id}`} type="checkbox" checked={d.ratePlanIds.includes(p.id)} onChange={() => update(d.id, { ratePlanIds: choose(d.ratePlanIds, p.id) })} />{label(p.id)}</Label>)}</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Label>Desde<Input aria-label={`Desde período ${d.id}`} type="date" value={d.dateFrom} onChange={e => update(d.id, { dateFrom: e.target.value })} /></Label><Label>Hasta, inclusive<Input aria-label={`Hasta período ${d.id}`} type="date" value={d.dateTo} onChange={e => update(d.id, { dateTo: e.target.value })} /></Label>
          <Label>Precio<select aria-label={`Acción de precio período ${d.id}`} className="w-full rounded border bg-background px-2 py-2" value={d.rateMode} onChange={e => update(d.id, { rateMode: e.target.value as Draft['rateMode'] })}><option value="keep">No cambiar</option><option value="set">Definir precio</option><option value="base">Volver a tarifa base</option></select></Label>
          {d.rateMode === 'set' && <Label>Importe por noche<Input aria-label={`Precio período ${d.id}`} type="number" min="0.01" step="0.01" value={d.rate} onChange={e => update(d.id, { rate: e.target.value })} /></Label>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([['minStayArrival', 'Mínimo a la llegada'], ['minStayThrough', 'Mínimo durante la estadía'], ['maxStay', 'Estadía máxima']] as const).map(([key, title]) => <Label key={key}>{title}<Input aria-label={`${title} período ${d.id}`} placeholder="No cambiar" type="number" min={key === 'maxStay' ? 0 : 1} max={365} step={1} value={d[key]} onChange={e => update(d.id, { [key]: e.target.value })} /></Label>)}{booleanField(d, 'stopSell', 'Cerrar ventas')}{booleanField(d, 'closedToArrival', 'Cerrar llegadas')}{booleanField(d, 'closedToDeparture', 'Cerrar salidas')}</div>
        <p className="text-xs text-muted-foreground">Campos vacíos: conservan el valor. Estadía máxima 0: sin límite. Los mínimos se expresan en noches; el mínimo a la llegada se evalúa en el día de ingreso y el mínimo durante la estadía aplica a las noches incluidas.</p>
      </div>)}
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={drafts.length >= 50} onClick={() => { setDrafts(rows => [...rows, newDraft(nextId, selected, from, to)]); setNextId(n => n + 1); setReview(null); }}>Agregar período</Button><Button onClick={() => { try { previewMutation.mutate(buildRequest(drafts)); } catch (e) { toast({ title: 'Revisá los datos', description: (e as Error).message, variant: 'destructive' }); } }}>{previewMutation.isPending ? 'Revisando…' : 'Revisar cambios'}</Button></div>
    </fieldset>
      {review && <section aria-label="Revisión de cambios" className="rounded border p-4 space-y-3"><h3 className="font-medium">Revisión: {review.preview.changedCells} noches con cambios de {review.preview.selectedCells} seleccionadas</h3><p className="text-sm">El calendario todavía no fue modificado. Al confirmar se guardan todos los períodos juntos.</p>
        <div className="space-y-3">{review.preview.segments.slice(previewPage * 50, (previewPage + 1) * 50).map((s, i) => <div key={i} className="text-sm"><p className="font-medium">{label(s.ratePlanId)} · {formatDisplayDate(s.dateFrom)} → {formatDisplayDate(s.dateTo)}</p>{cellChanges(s.before, s.after).map(t => <p key={t}>{t}</p>)}</div>)}</div>
        <Pagination page={previewPage} count={review.preview.segments.length} size={50} onChange={setPreviewPage} />
        <div className="flex flex-wrap gap-2"><Button disabled={busy || review.preview.changedCells === 0} onClick={() => applyMutation.mutate(review)}>{applyMutation.isPending ? 'Guardando…' : 'Confirmar cambios'}</Button><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancelar revisión</Button></div>
      </section>}</>}
  </CardContent></Card>;
}
function Pagination({ page, count, size, onChange }: { page: number; count: number; size: number; onChange: (page: number) => void }) {
  if (count <= size) return null;
  return <div className="flex gap-3 items-center text-sm"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>Anterior</Button><span>{page * size + 1}–{Math.min((page + 1) * size, count)} de {count}</span><Button variant="outline" size="sm" disabled={(page + 1) * size >= count} onClick={() => onChange(page + 1)}>Siguiente</Button></div>;
}
