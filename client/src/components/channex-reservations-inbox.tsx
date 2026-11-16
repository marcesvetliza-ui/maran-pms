import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDisplayDate, formatDisplayDateTime } from '@shared/date-display';
import { Button } from './ui/button';
import { apiRequest } from '@/lib/queryClient';
import { reasons } from './channex-inbound-reasons';

type View = 'attention' | 'new' | 'modified' | 'cancelled' | 'all';
type Revision = {
 revision_id: string; booking_id: string | null; booking_status: string | null;
 status: string; review_code: string | null; acked_at: string | null;
 created_at: string; inserted_at: string | null; channel: string | null; reference: string | null;
 guest_name: string | null; arrival: string | null; departure: string | null;
 amount: string | null; currency: string | null;
};
type Booking = Revision & { revision_count: number; inbox_view: View; reservations: {
 id: string; code: string; guestName: string; roomNumber: string; category: string;
 checkInDate: string; checkOutDate: string; status: string;
}[] };
type Inbox = { counts: Record<View, number>; bookings: Booking[]; page: number; pageSize: number };
const views: [View, string][] = [['attention', 'Requieren atención'], ['new', 'Nuevas'], ['modified', 'Modificadas'], ['cancelled', 'Canceladas'], ['all', 'Todas']];
const bookingLabels: Record<string,string> = {new:'Nueva',modified:'Modificada',cancelled:'Cancelada'};
const appliedLabels: Record<string,string> = {applied:'Aplicada al PMS',pending:'Pendiente de aplicar',review:'Requiere revisión',stale:'Anterior a la versión ya aplicada'};
function amount(r: Revision) {
 if (!r.currency || r.amount == null || !/^\d+(\.\d+)?$/.test(r.amount)) return 'Importe no informado';
 return `${r.currency} ${new Intl.NumberFormat('es-AR', {minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(r.amount))}`;
}
function Result({revision:r}: {revision:Revision}) {
 return <><p>Integración: {appliedLabels[r.status] || 'Estado por revisar'} · {r.acked_at ? 'Recepción confirmada a Channex' : 'Confirmación pendiente'}</p>
 {r.review_code && <p className="text-destructive">{reasons[r.review_code] || 'Revisá la reserva y su configuración'}</p>}</>;
}
function History({connectionId, revisionId}: {connectionId:string;revisionId:string}) {
 const [page,setPage]=useState(1);
 const q=useQuery<{total:number;revisions:Revision[]}>({queryKey:['channex-history',connectionId,revisionId,page],
 queryFn:async()=>(await apiRequest('GET',`/api/channex/connections/${encodeURIComponent(connectionId)}/inbound/history/${encodeURIComponent(revisionId)}?page=${page}`)).json()});
 return <div className="mt-3 space-y-3" aria-label="Historial de la reserva">
 {q.isLoading?<p>Cargando historial…</p>:q.error?<p role="alert">No se pudo consultar el historial.</p>:q.data?.revisions.map(r=><div className="border-l-2 pl-3 space-y-1" key={r.revision_id}>
 <p>{bookingLabels[r.booking_status || ''] || 'Estado del canal no identificado'} · Recibida: {formatDisplayDateTime(r.created_at)}</p>
 <p>{formatDisplayDate(r.arrival)} → {formatDisplayDate(r.departure)} · {amount(r)}</p><Result revision={r}/>
 <p className="break-all text-muted-foreground">Revisión: {r.revision_id}</p></div>)}
 {!!q.data&&q.data.total>25&&<div className="flex gap-2 items-center"><Button variant="outline" disabled={page===1} onClick={()=>setPage(page-1)}>Historial anterior</Button><span>Página {page}</span><Button variant="outline" disabled={page*25>=q.data.total} onClick={()=>setPage(page+1)}>Más historial</Button></div>}
 </div>;
}
export function ChannexReservationsInbox({connectionId,canRetry,pending,onRetry}: {
 connectionId:string;canRetry:boolean;pending:boolean;onRetry:(revisionId:string)=>void;
}) {
 const [view,setView]=useState<View>('all'),[page,setPage]=useState(1),[expanded,setExpanded]=useState<string|null>(null);
 const q=useQuery<Inbox>({queryKey:['channex-bookings',connectionId,view,page],
 queryFn:async()=>(await apiRequest('GET',`/api/channex/connections/${encodeURIComponent(connectionId)}/inbound/bookings?view=${view}&page=${page}`)).json()});
 return <section className="space-y-4 border-t pt-4" aria-label="Bandeja de reservas recibidas">
 <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Bandeja de reservas recibidas</h3><Button variant="outline" disabled={q.isFetching} onClick={()=>void q.refetch()}>Actualizar bandeja</Button></div>
 <p className="text-sm text-muted-foreground">Una fila por reserva. Los filtros reflejan su última revisión vigente. Las reservas pendientes de aplicar también aparecen en Requieren atención.</p>
 <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar reservas">{views.map(([key,label])=><Button key={key} variant={key===view?'default':'outline'} aria-pressed={key===view} onClick={()=>{setView(key);setPage(1);setExpanded(null);}}>{label} ({q.data?.counts[key] ?? '—'})</Button>)}</div>
 {q.isLoading?<p>Cargando reservas…</p>:q.error?<p role="alert">No se pudo consultar la bandeja. Intentá actualizarla.</p>:q.data&&<>
 <p className="text-sm text-muted-foreground" role="status">{q.data.counts[view]} reservas · Página {page}</p>
 {q.data.bookings.length===0?<p>No hay reservas en esta vista.</p>:q.data.bookings.map(r=><article key={r.revision_id} className="rounded border p-4 text-sm space-y-2">
 <div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">{r.guest_name || r.reservations[0]?.guestName || 'Huésped no informado'}</h4><span className="rounded bg-muted px-2 py-1">Canal: {bookingLabels[r.booking_status || ''] || 'Estado no identificado'}</span></div>
 <p>{r.channel || 'Canal no informado'} · Reserva: {r.reference || r.booking_id || 'Sin identificar'}</p>
 <p>{formatDisplayDate(r.arrival || r.reservations[0]?.checkInDate)} → {formatDisplayDate(r.departure || r.reservations[0]?.checkOutDate)} · {amount(r)}</p>
 <Result revision={r}/>
 {r.reservations.map(local=><p key={local.id}>{local.category} · Habitación {local.roomNumber} · <a className="underline text-primary" href={`/reservations?view=${encodeURIComponent(local.id)}&returnTo=%2Fota-channels`}>Ver reserva en PMS {local.code}</a></p>)}
 <p className="text-muted-foreground">Última revisión recibida: {formatDisplayDateTime(r.created_at)}</p>
 <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" aria-expanded={expanded===r.revision_id} onClick={()=>setExpanded(expanded===r.revision_id?null:r.revision_id)}>Historial ({r.revision_count})</Button>
 {canRetry && r.status==='review' && !['INVALID_REVISION','WRONG_PROPERTY','REVISION_ID_COLLISION','MASKED_GUEST_DATA'].includes(r.review_code || '')&&<Button size="sm" variant="outline" disabled={pending} onClick={()=>onRetry(r.revision_id)}>Reintentar revisión</Button>}</div>
 {expanded===r.revision_id&&<History connectionId={connectionId} revisionId={r.revision_id}/>}
 </article>)}
 <div className="flex items-center gap-2"><Button variant="outline" disabled={page===1} onClick={()=>{setPage(page-1);setExpanded(null);}}>Anterior</Button><Button variant="outline" disabled={page*q.data.pageSize>=q.data.counts[view]} onClick={()=>{setPage(page+1);setExpanded(null);}}>Siguiente</Button></div>
 </>}
 </section>;
}
