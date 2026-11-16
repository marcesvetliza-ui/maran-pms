import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, apiRequestWithGroupInventoryWarning } from '@/lib/queryClient';
import type { InboundAssignmentOptions, InboundAssignmentRoom } from '@shared/channexAssignment';
import { formatDisplayDate } from '@shared/date-display';
import { Button } from './ui/button';
import { Input } from './ui/input';
const money = (currency: string, value: string) => `${currency} ${new Intl.NumberFormat('es-AR', {minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value))}`;
export function ChannexManualAssignment({connectionId, revisionId, onAssigned}: {
  connectionId:string; revisionId:string; onAssigned:()=>void;
}) {
  const client=useQueryClient();
  const [started,setStarted]=useState(true),[assignments,setAssignments]=useState<Record<string,string>>({});
  const [categories,setCategories]=useState<Record<string,string>>({});
  const [reason,setReason]=useState(''),[categoryConfirmed,setCategoryConfirmed]=useState(false),[scopeConfirmed,setScopeConfirmed]=useState(false);
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState<string[]|null>(null);
  const root=`/api/channex/connections/${encodeURIComponent(connectionId)}/inbound`;
  const q=useQuery<InboundAssignmentOptions>({queryKey:['channex-assignment',connectionId,revisionId],enabled:started,
    staleTime:0,gcTime:0,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false,
    queryFn:async()=>(await apiRequest('GET',`${root}/assignment/${encodeURIComponent(revisionId)}`)).json()});
  function reset(){setAssignments({});setCategories({});setCategoryConfirmed(false);setScopeConfirmed(false);setError('');}
  const selected=q.data?.rooms.map(remote=>remote.choices.find(room=>room.id===assignments[remote.key])).filter((r):r is InboundAssignmentRoom=>!!r)||[];
  const categoryChange=selected.some(r=>r.categoryChanged),scopeChange=selected.some(r=>r.scopeOverride);
  const complete=!!q.data&&selected.length===q.data.rooms.length&&new Set(selected.map(r=>r.id)).size===selected.length;
  const confirmed=complete&&reason.trim().length>=3&&(!categoryChange||categoryConfirmed)&&(!scopeChange||scopeConfirmed);
  async function assign(){
    if(!q.data||!confirmed)return;setPending(true);setError('');
    try {
      const response=await apiRequestWithGroupInventoryWarning('POST',`${root}/assign/${encodeURIComponent(revisionId)}`,{
        expectedPayloadHash:q.data.payloadHash,expectedConfigurationHash:q.data.configurationHash,assignments,
        reason:reason.trim(),confirmCategoryChange:categoryConfirmed,confirmScopeChange:scopeConfirmed,
      });
      const result=await response.json();setSuccess(result.reservationIds);
      await client.invalidateQueries({predicate:query=>['channex-bookings','channex-booking-detail','channex-history','channex-inbound','/api/reservations','/api/planning','/api/rooms'].some(key=>query.queryKey[0]===key)});
      onAssigned();
    } catch(e) {
      const raw=e instanceof Error?e.message:'';
      try {const data=JSON.parse(raw.slice(raw.indexOf('{')));setError(data.error||'No se pudo asignar la reserva.');}
      catch {setError('No se pudo asignar la reserva. Actualizá las opciones antes de volver a confirmar.');}
      setCategoryConfirmed(false);setScopeConfirmed(false);
    } finally {setPending(false);}
  }
  if(success)return <div role="status" className="rounded border p-3 space-y-2"><p>Reserva asignada al PMS.</p>{success.map(id=><a className="block underline text-primary" key={id} href={`/reservations?view=${encodeURIComponent(id)}&returnTo=%2Fota-channels`}>Abrir reserva asignada</a>)}</div>;
  if(!started)return <Button onClick={()=>setStarted(true)}>Asignar al PMS</Button>;
  return <section aria-label="Asignación al PMS" className="rounded-lg border p-4 space-y-4">
    <h3 className="font-semibold">Asignar al PMS</h3>
    {q.isLoading?<p>Cargando habitaciones disponibles…</p>:q.error?<p role="alert">No se pudieron consultar las opciones. La reserva puede haber cambiado o estar ya asignada.</p>:q.data&&<>
      <p>{formatDisplayDate(q.data.arrival)} → {formatDisplayDate(q.data.departure)} · Original: <strong>{money(q.data.currency,q.data.amount)}</strong></p>
      <p className="text-muted-foreground">Se conserva el importe del canal al elegir otra categoría. {q.data.currency==='USD'&&`Cotización: ARS ${Number(q.data.exchangeRate).toLocaleString('es-AR',{maximumFractionDigits:6})} por USD. Total en PMS: ${money('ARS',q.data.settlementTotal)}.`}</p>
      {q.data.rooms.map((remote,index)=>{
        const choice=remote.choices.find(r=>r.id===assignments[remote.key]);
        const category=choice?.categoryId||'';
        const categoryChoices=[...new Map(remote.choices.map(r=>[r.categoryId,r.category])).entries()];
        return <fieldset key={remote.key} className="rounded border p-3 space-y-3 min-w-0" disabled={pending}>
          <legend className="px-1 font-medium">Habitación {index+1} · {remote.occupancy} huésped(es)</legend>
          <p>Categoría del canal: <strong>{remote.category}</strong>{remote.mappedCategory&&` · Correspondencia en PMS: ${remote.mappedCategory}`}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">Categoría en PMS<select aria-label={`Categoría en PMS ${index+1}`} className="block w-full min-w-0 rounded border bg-background p-2" value={category||categories[remote.key]||''} onChange={e=>{
              setAssignments({...assignments,[remote.key]:''});setCategories({...categories,[remote.key]:e.target.value});setCategoryConfirmed(false);setScopeConfirmed(false);
            }}><option value="">Elegí una categoría</option>{categoryChoices.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
            <label className="block space-y-1">Habitación disponible<select aria-label={`Habitación disponible ${index+1}`} className="block w-full min-w-0 rounded border bg-background p-2" value={assignments[remote.key]||''} onChange={e=>{setAssignments({...assignments,[remote.key]:e.target.value});setCategoryConfirmed(false);setScopeConfirmed(false);}}>
              <option value="">Elegí una habitación</option>{remote.choices.filter(r=>r.categoryId===(category||categories[remote.key])).map(r=><option key={r.id} value={r.id} disabled={Object.entries(assignments).some(([key,id])=>key!==remote.key&&id===r.id)}>{r.number} · Capacidad {r.capacity}{r.scopeOverride?' · Asignación excepcional':''}</option>)}
            </select></label>
          </div>
          {!remote.choices.length&&<p role="alert">No hay habitaciones disponibles con tu permiso para esta ocupación y estadía.</p>}
          {choice?.categoryChanged&&<p className="font-medium text-amber-700 dark:text-amber-400">Cambio de categoría: {remote.mappedCategory||remote.category} → {choice.category}.</p>}
          {choice&&<p>Destino: {choice.category} · Habitación {choice.number} · {money(q.data!.currency,remote.sourceTotal)}</p>}
        </fieldset>;
      })}
      {categoryChange&&<label className="flex items-start gap-2 rounded border border-amber-500 p-3"><input type="checkbox" checked={categoryConfirmed} disabled={pending} onChange={e=>setCategoryConfirmed(e.target.checked)}/><span>Confirmo que asigno una categoría diferente de la recibida del canal, conservando su importe.</span></label>}
      {scopeChange&&<label className="flex items-start gap-2 rounded border border-amber-500 p-3"><input type="checkbox" checked={scopeConfirmed} disabled={pending} onChange={e=>setScopeConfirmed(e.target.checked)}/><span>Confirmo esta asignación excepcional fuera del alcance o mapeo automático. El alcance publicado no cambia y las modificaciones posteriores del canal requerirán revisión.</span></label>}
      <label className="block space-y-1">Motivo de la asignación<Input aria-label="Motivo de la asignación" value={reason} disabled={pending} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Indicá el motivo para dejarlo en el historial"/></label>
      <p className="text-xs text-muted-foreground">La disponibilidad se valida nuevamente al confirmar. La asignación y el motivo quedan auditados.</p>
      <Button disabled={!confirmed||pending||q.isFetching} onClick={()=>void assign()}>{pending?'Asignando…':'Confirmar asignación al PMS'}</Button>
    </>}
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending||q.isFetching} onClick={()=>{reset();void q.refetch();}}>Actualizar habitaciones disponibles</Button><Button variant="ghost" disabled={pending} onClick={()=>{reset();setStarted(false);}}>Cancelar asignación</Button></div>
  </section>;
}
