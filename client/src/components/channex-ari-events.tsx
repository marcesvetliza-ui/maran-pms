import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiRequest} from '@/lib/queryClient';
import {Button} from '@/components/ui/button';

type Event = {id:string;kind:string;status:string;date_from:string;date_to:string;last_error:string|null;task_ids:string[]|null;reason?:string;attempts?:number};
const labels:Record<string,string>={pending:'Pendiente',blocked:'Requiere revisión',delivered:'Procesado'};
export function ChannexAriEvents({connectionId,recent,summary,refreshRecent}:{connectionId:string;recent:Event[];summary:{status:string;count:number}[];refreshRecent:()=>unknown}){
 const [status,setStatus]=useState('recent');
 const query=useQuery<{events:Event[]}>({
  queryKey:['/api/channex/connections',connectionId,'ari','events',status],
  enabled:status!=='recent',retry:false,
  queryFn:async()=>(await apiRequest('GET',`/api/channex/connections/${encodeURIComponent(connectionId)}/ari?eventStatus=${encodeURIComponent(status)}`)).json(),
 });
 const events=status==='recent'?recent:query.data?.events??[];
 const total=summary.filter(row=>status==='recent'||row.status===status).reduce((sum,row)=>sum+row.count,0);
 return <div className="space-y-3 mt-3">
  <label className="flex flex-wrap items-center gap-2">Mostrar eventos
   <select className="rounded border bg-background p-2" value={status} onChange={event=>setStatus(event.target.value)}>
    <option value="recent">Últimos cambios</option><option value="blocked">Requieren revisión</option><option value="pending">Pendientes</option><option value="delivered">Procesados</option>
   </select>
  </label>
  <p className="text-sm text-muted-foreground">Consulta de solo lectura. No reintenta ni envía cambios a Channex.</p>
  <Button size="sm" variant="outline" disabled={status!=='recent'&&query.isFetching} onClick={()=>status==='recent'?refreshRecent():void query.refetch()}>Actualizar lista</Button>
  {status!=='recent'&&query.isPending?<p>Cargando eventos…</p>:status!=='recent'&&query.error?<p role="alert">No se pudo consultar la lista. Usá Actualizar lista para reintentar la consulta.</p>:<>
   <p className="text-sm">Mostrando {events.length} de {total} eventos. Se muestran hasta 30, del más reciente al más antiguo.</p>
   {!events.length&&<p>No hay eventos para este filtro.</p>}
   {events.map(event=><div key={event.id} className="rounded border p-2 text-sm">
    <p>Evento {event.id} · {event.kind==='availability'?'Disponibilidad':'Tarifas'} · {event.date_from} → {event.date_to} · {labels[event.status]||event.status}</p>
    {event.attempts!==undefined&&<p>Intentos: {event.attempts}</p>}
    {event.last_error&&<p role="alert" className="text-destructive">{event.last_error}</p>}
    {!!event.task_ids?.length&&<p className="break-all text-muted-foreground">Tareas de Channex: {event.task_ids.join(', ')}</p>}
   </div>)}
  </>}
 </div>;
}
