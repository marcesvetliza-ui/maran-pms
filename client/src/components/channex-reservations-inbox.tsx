import { OtaRoomDetailsSummary } from "./ota-room-details";
import { useState } from 'react';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { ArrowUpRight, BedDouble, CalendarDays, ChevronDown, Link2 } from 'lucide-react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { formatDisplayDate, formatDisplayDateTime } from '@shared/date-display';
import { Button } from './ui/button';
import { apiRequest } from '@/lib/queryClient';
import { ChannexManualAssignment } from './channex-manual-assignment';
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
 id: string; code: string; guestName: string; otaRoomDetails?: import("@shared/otaRoomDetails").OtaRoomDetails | null; roomNumber: string; category: string;
 checkInDate: string; checkOutDate: string; status: string;
}[] };
type Inbox = { channels?:string[]; counts: Record<View, number>; bookings: Booking[]; page: number; pageSize: number };
const views: [View, string][] = [['attention', 'Requieren atención'], ['new', 'Nuevas'], ['modified', 'Modificadas'], ['cancelled', 'Canceladas'], ['all', 'Todas']];
const bookingLabels: Record<string,string> = {new:'Nueva',modified:'Modificada',cancelled:'Cancelada'};
const appliedLabels: Record<string,string> = {applied:'Aplicada al PMS',pending:'Pendiente de aplicar',review:'Requiere revisión',stale:'Anterior a la versión ya aplicada'};
const integrationLabel=(r:Revision)=>r.review_code==='MANUAL_ASSIGNMENT_REQUIRED'?'Pendiente de asignación':appliedLabels[r.status]||'Estado por revisar';
function amount(r: Revision) {
 if (!r.currency || r.amount == null || !/^\d+(\.\d+)?$/.test(r.amount)) return 'Importe no informado';
 return `${r.currency} ${new Intl.NumberFormat('es-AR', {minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(r.amount))}`;
}
function Result({revision:r}: {revision:Revision}) {
 return <><p>Integración: {integrationLabel(r)} · {r.acked_at ? 'Recepción confirmada a Channex' : 'Confirmación pendiente'}</p>
 {r.review_code && <p className={r.review_code==='MANUAL_ASSIGNMENT_REQUIRED'?'text-muted-foreground':'text-destructive'}>{reasons[r.review_code] || 'Revisá la reserva y su configuración'}</p>}</>;
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
type Filters = {search:string;channel:string;dateType:'received'|'stay';from:string;to:string};
const emptyFilters:Filters={search:'',channel:'',dateType:'received',from:'',to:''};
const guest=(r:Booking)=>r.guest_name || r.reservations[0]?.guestName || 'Huésped no informado';
const canAssign=(r:Booking)=>!r.reservations.length&&r.booking_status!=='cancelled'&&['pending','review'].includes(r.status)&&!['INVALID_REVISION','WRONG_PROPERTY','REVISION_ID_COLLISION','MASKED_GUEST_DATA'].includes(r.review_code||'');
const pmsLink=(id:string)=>`/reservations?view=${encodeURIComponent(id)}&returnTo=%2Fota-channels`;
type Detail={notes:string|null;notesStatus:string;settlements:{reservation_id:string;source_currency:string;source_total:string;exchange_rate:string;settlement_currency:string;settlement_total:string;created_at:string}[]};
const stayLabels:Record<string,string>={confirmed:'Reservada',checked_in:'Alojada',checked_out:'Finalizada',cancelled:'Cancelada',no_show:'No se presentó',web_checkin:'Pre check-in'};
function stayLabel(status:string){return stayLabels[status]||'Estado no informado';}
function BookingDetail({connectionId,booking:r,canRetry,pending,onRetry,assignOpen,onAssigned}:{connectionId:string;booking:Booking;canRetry:boolean;pending:boolean;onRetry:(id:string)=>void;assignOpen:boolean;onAssigned:()=>void}){
 const [assigning,setAssigning]=useState(assignOpen);
 const [technicalOpen,setTechnicalOpen]=useState(false);
 const q=useQuery<Detail>({queryKey:['channex-booking-detail',connectionId,r.revision_id],staleTime:0,gcTime:0,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false,
 queryFn:async()=>(await apiRequest('GET',`/api/channex/connections/${encodeURIComponent(connectionId)}/inbound/booking-detail/${encodeURIComponent(r.revision_id)}`)).json()});
 const arrival=r.arrival||r.reservations[0]?.checkInDate,departure=r.departure||r.reservations[0]?.checkOutDate;
 const nights=arrival&&departure?differenceInCalendarDays(parseISO(departure),parseISO(arrival)):null;
 const requiresReview=r.status==='review'&&r.review_code!=='MANUAL_ASSIGNMENT_REQUIRED';
 const sameStatus=r.reservations.length&&r.reservations.every(local=>local.status===r.reservations[0].status)?r.reservations[0].status:null;
 return <div className="space-y-6 text-sm min-w-0" data-testid="ota-booking-detail">
   <section aria-label="Resumen de la reserva" className="space-y-4">
     <div className="flex flex-wrap items-center gap-2">
       <Badge variant="outline">{r.channel||'Canal no informado'}</Badge>
       <span className="font-medium break-all">{r.reference?`Reserva ${r.reference}`:'Referencia no informada'}</span>
       {r.booking_status==='cancelled'?<Badge variant="destructive">Cancelada en el canal</Badge>:sameStatus?<Badge variant="secondary">{stayLabel(sameStatus)} en PMS</Badge>:<Badge variant="secondary">{canAssign(r)?'Pendiente de asignación':r.reservations.length?'Vinculada al PMS':'Sin vincular en PMS'}</Badge>}
     </div>
     <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
       <div className="rounded-lg border bg-muted/20 p-4"><dt className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-4 w-4"/>Ingreso</dt><dd className="mt-2 text-lg font-semibold tabular-nums">{formatDisplayDate(arrival)}</dd></div>
       <div className="rounded-lg border bg-muted/20 p-4"><dt className="text-muted-foreground">Salida</dt><dd className="mt-2 text-lg font-semibold tabular-nums">{formatDisplayDate(departure)}</dd>{nights!==null&&Number.isFinite(nights)&&nights>0&&<dd className="mt-1 text-xs text-muted-foreground">{nights} {nights===1?'noche':'noches'}</dd>}</div>
       <div className="col-span-2 rounded-lg border bg-primary/5 p-4 sm:col-span-1"><dt className="text-muted-foreground">Importe original del canal</dt><dd className="mt-2 text-lg font-semibold tabular-nums break-words">{amount(r)}</dd></div>
     </dl>
   </section>

   {requiresReview&&<section role="status" aria-label="Atención requerida" className="rounded-lg border border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
     <h3 className="font-semibold">Esta reserva requiere atención</h3>
     <p>{reasons[r.review_code||'']||'Revisá la reserva y su configuración antes de continuar.'}</p>
     {canRetry&&!['INVALID_REVISION','WRONG_PROPERTY','REVISION_ID_COLLISION','MASKED_GUEST_DATA'].includes(r.review_code||'')&&<Button variant="outline" disabled={pending} onClick={()=>onRetry(r.revision_id)}>Reintentar revisión</Button>}
   </section>}

   <div className="grid gap-6 md:grid-cols-2">
   <section className="space-y-3" aria-labelledby="ota-rooms-heading">
     <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="ota-rooms-heading" className="flex items-center gap-2 font-semibold"><BedDouble className="h-4 w-4"/>Habitaciones en el PMS</h3>{r.reservations.length>1&&<span className="text-xs text-muted-foreground">{r.reservations.length} habitaciones</span>}</div>
     {r.reservations.length?<div className="grid gap-3">{r.reservations.map(local=><div key={local.id} className="rounded-lg border p-4 space-y-3 min-w-0">
       <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs text-muted-foreground">Habitación</p><p className="text-xl font-semibold text-primary">{local.roomNumber||'Sin asignar'}</p><p className="font-medium">{local.category||'Categoría no informada'}</p></div><Badge variant="outline">{stayLabel(local.status)}</Badge></div>
       <p className="text-sm">Huésped: {local.guestName||"No informado"}</p>
       <OtaRoomDetailsSummary details={local.otaRoomDetails}/>
       <p className="text-xs text-muted-foreground">{formatDisplayDate(local.checkInDate)} → {formatDisplayDate(local.checkOutDate)}</p>
       <a className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4" href={pmsLink(local.id)}>Ver reserva en PMS<ArrowUpRight className="h-4 w-4"/></a>
     </div>)}</div>:<div className="rounded-lg border border-dashed p-4 space-y-3"><p className="text-muted-foreground">Todavía no hay una reserva vinculada en el PMS.</p>{canAssign(r)&&<p>La habitación la asigna recepción.</p>}
       {canRetry&&canAssign(r)&&!assigning&&<Button onClick={()=>setAssigning(true)}>Asignar al PMS</Button>}
     </div>}
     {canRetry&&canAssign(r)&&assigning&&<ChannexManualAssignment key={r.revision_id} connectionId={connectionId} revisionId={r.revision_id} onAssigned={onAssigned}/>}
   </section>

   {q.isLoading?<p role="status" className="text-muted-foreground">Cargando importes y observaciones…</p>:q.error?<div role="alert" className="rounded-lg border p-4 space-y-2"><p>No se pudo consultar la conversión y las observaciones.</p><Button variant="outline" onClick={()=>void q.refetch()}>Volver a consultar detalle</Button></div>:q.data&&<>
     <section className="space-y-3" aria-labelledby="ota-amounts-heading"><h3 id="ota-amounts-heading" className="font-semibold">Importe registrado en el PMS</h3>
       {q.data.settlements.length?<><div className="grid gap-3">{q.data.settlements.map(s=>{const local=r.reservations.find(local=>local.id===s.reservation_id);return <div key={s.reservation_id} className="rounded-lg border p-4 space-y-2 min-w-0">
         {local&&<p className="text-muted-foreground">Habitación {local.roomNumber} · {local.category}</p>}
         <p className="text-lg font-semibold tabular-nums">{amount({...r,amount:s.settlement_total,currency:s.settlement_currency})}</p>
         <p className="text-xs text-muted-foreground">Original: {amount({...r,amount:s.source_total,currency:s.source_currency})}</p>
         <p className="text-xs text-muted-foreground">Cotización conservada: {s.settlement_currency} {new Intl.NumberFormat('es-AR',{maximumFractionDigits:6}).format(Number(s.exchange_rate))} por {s.source_currency}</p>
       </div>;})}</div><p className="text-xs text-muted-foreground">Importe registrado al recibir la reserva. Los movimientos posteriores y el saldo actual se consultan en el folio.</p></>:<p className="text-muted-foreground">No hay una conversión registrada para esta reserva. No se calcula con la cotización actual.</p>}
     </section>
     <section className="space-y-3 md:col-span-2" aria-labelledby="ota-notes-heading"><h3 id="ota-notes-heading" className="font-semibold">Observaciones del canal</h3>{q.data.notesStatus==='available'?<p className="whitespace-pre-wrap break-words rounded-lg border bg-muted/20 p-4 leading-relaxed">{q.data.notes}</p>:<p className="text-muted-foreground">{q.data.notesStatus==='payment_omitted'?'Se omitió una observación que contenía información de pago.':q.data.notesStatus==='unavailable'?'Las observaciones guardadas no están disponibles en este momento.':'No hay observaciones del canal conservadas para esta reserva.'}</p>}</section>
   </>}
   </div>

   <Collapsible open={technicalOpen} onOpenChange={setTechnicalOpen} className="rounded-lg border">
     <CollapsibleTrigger asChild><Button variant="ghost" className="h-auto w-full justify-between gap-3 p-4 text-left whitespace-normal" data-testid="button-ota-connection-detail"><span className="flex items-center gap-2"><Link2 className="h-4 w-4 shrink-0"/>Conexión e historial</span><ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${technicalOpen?'rotate-180':''}`}/></Button></CollapsibleTrigger>
     <CollapsibleContent><div className="border-t p-4 space-y-5 min-w-0">
       <section className="space-y-2"><h3 className="font-semibold">Sincronización con Channex</h3><Result revision={r}/><p className="text-xs text-muted-foreground">Último evento del canal: {bookingLabels[r.booking_status||'']||'No identificado'}. Este evento no indica el estado actual de la estadía en el PMS.</p></section>
       <dl className="grid gap-3 sm:grid-cols-2 text-xs">
         <div><dt className="text-muted-foreground">Última recepción</dt><dd>{formatDisplayDateTime(r.created_at)}</dd></div>
         <div><dt className="text-muted-foreground">Confirmación a Channex</dt><dd>{r.acked_at?formatDisplayDateTime(r.acked_at):'Pendiente'}</dd></div>
         <div><dt className="text-muted-foreground">Identificador de reserva en Channex</dt><dd className="break-all font-mono">{r.booking_id||'No informado'}</dd></div>
         <div><dt className="text-muted-foreground">Identificador de revisión</dt><dd className="break-all font-mono">{r.revision_id}</dd></div>
         {r.reservations.map(local=><div key={local.id}><dt className="text-muted-foreground">Referencia PMS · Habitación {local.roomNumber}</dt><dd className="break-all font-mono">{local.code}</dd></div>)}
       </dl>
       <section className="border-t pt-4"><h3 className="font-semibold">Historial ({r.revision_count})</h3>{technicalOpen&&<History connectionId={connectionId} revisionId={r.revision_id}/>}</section>
     </div></CollapsibleContent>
   </Collapsible>
 </div>;
}
export function ChannexReservationsInbox({connectionId,canRetry,pending,onRetry}: {
 connectionId:string;canRetry:boolean;pending:boolean;onRetry:(revisionId:string)=>void;
}) {
 const [view,setView]=useState<View>('all'),[page,setPage]=useState(1),[selected,setSelected]=useState<Booking|null>(null);
 const [assignOpen,setAssignOpen]=useState(false);
 const openDetail=(r:Booking,assign=false)=>{setAssignOpen(assign);setSelected(r);};
 const [draft,setDraft]=useState<Filters>(emptyFilters),[filters,setFilters]=useState<Filters>(emptyFilters);
 const params=new URLSearchParams({view,page:String(page),search:filters.search,channel:filters.channel,dateType:filters.dateType});
 if(filters.from)params.set('from',filters.from);if(filters.to)params.set('to',filters.to);
 const invalidDates=!!draft.from&&!!draft.to&&draft.from>draft.to;
 const q=useQuery<Inbox>({queryKey:['channex-bookings',connectionId,view,page,filters],
 queryFn:async()=>(await apiRequest('GET',`/api/channex/connections/${encodeURIComponent(connectionId)}/inbound/bookings?${params}`)).json()});
 return <section className="space-y-4" aria-label="Bandeja de reservas recibidas">
 <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-semibold">Reservas recibidas</h2><p className="text-sm text-muted-foreground">Consultá las reservas de los canales y sus últimas novedades.</p></div><Button variant="outline" disabled={q.isFetching} onClick={()=>void q.refetch()}>Actualizar bandeja</Button></div>
 <div className="rounded-lg border bg-card p-4 space-y-4">
 <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar reservas">{[...views].sort(([a],[b])=>a==='all'?-1:b==='all'?1:0).map(([key,label])=><Button key={key} size="sm" variant={key===view?'default':'outline'} aria-pressed={key===view} onClick={()=>{setView(key);setPage(1);}}>{label} ({q.data?.counts[key]??'—'})</Button>)}</div>
 <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" onSubmit={event=>{event.preventDefault();if(!invalidDates){setFilters({...draft,search:draft.search.trim()});setPage(1);}}}>
 <label className="sm:col-span-2 text-sm space-y-1">Buscar reserva<Input aria-label="Buscar por huésped o referencia" value={draft.search} maxLength={120} onChange={e=>setDraft({...draft,search:e.target.value})} placeholder="Huésped o número de reserva…"/></label>
 <label className="text-sm space-y-1">Canal<select aria-label="Filtrar por canal" className="block w-full rounded-md border bg-background p-2 h-9" value={draft.channel} onChange={e=>setDraft({...draft,channel:e.target.value})}><option value="">Todos los canales</option>{(q.data?.channels||[]).map(c=><option key={c} value={c}>{c}</option>)}</select></label>
 <label className="text-sm space-y-1">Fechas de<select aria-label="Tipo de fecha" className="block w-full rounded-md border bg-background p-2 h-9" value={draft.dateType} onChange={e=>setDraft({...draft,dateType:e.target.value as Filters['dateType']})}><option value="received">Recepción del canal</option><option value="stay">Estadía</option></select></label>
 <label className="text-sm space-y-1">Desde<Input type="date" aria-label="Desde" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
 <label className="text-sm space-y-1">Hasta<Input type="date" aria-label="Hasta" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
 <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-6"><Button type="submit" size="sm" disabled={invalidDates}>Aplicar filtros</Button><Button type="button" size="sm" variant="ghost" onClick={()=>{setDraft(emptyFilters);setFilters(emptyFilters);setPage(1);}}>Limpiar filtros</Button></div>
 {invalidDates&&<p role="alert" className="text-sm text-destructive sm:col-span-2 xl:col-span-6">La fecha desde debe ser anterior o igual a la fecha hasta.</p>}
 </form>
 </div>
 {q.isLoading?<p>Cargando reservas…</p>:q.error?<p role="alert">No se pudo consultar la bandeja. Intentá actualizarla.</p>:q.data&&<>
 <p className="text-sm text-muted-foreground" role="status">{q.data.counts[view]} reservas · Página {page} · Los contadores respetan los filtros aplicados.</p>
 <div className="rounded-lg border overflow-x-auto"><table className="w-full min-w-[1080px] text-sm"><caption className="sr-only">Reservas recibidas de canales OTAs</caption><thead className="bg-muted/50 text-muted-foreground"><tr>{['Huésped / referencia','Canal','Habitación / categoría','Ingreso','Salida','Importe','Estado','Acciones'].map(h=><th key={h} scope="col" className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y">
 {q.data.bookings.length===0?<tr><td colSpan={8} className="text-center p-10 text-muted-foreground">No hay reservas en esta vista.</td></tr>:q.data.bookings.map(r=><tr key={r.revision_id} tabIndex={0} className="hover:bg-muted/30 focus-visible:outline focus-visible:outline-primary cursor-pointer" onClick={()=>openDetail(r)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openDetail(r);}}}>
 <td className="px-4 py-3"><span className="font-medium block">{guest(r)}</span><span className="text-xs text-muted-foreground break-all">{r.reference||r.booking_id||'Sin identificar'}</span></td>
 <td className="px-4 py-3">{r.channel||'Sin informar'}</td>
 <td className="px-4 py-3">{r.reservations.length?r.reservations.map(local=><div key={local.id}><span className="font-medium">{local.roomNumber}</span><span className="text-xs text-muted-foreground block">{local.category}</span></div>):<span className="text-muted-foreground">Sin asignar en PMS</span>}</td>
 <td className="px-4 py-3 whitespace-nowrap">{formatDisplayDate(r.arrival||r.reservations[0]?.checkInDate)}</td><td className="px-4 py-3 whitespace-nowrap">{formatDisplayDate(r.departure||r.reservations[0]?.checkOutDate)}</td>
 <td className="px-4 py-3 whitespace-nowrap font-medium tabular-nums">{amount(r)}</td>
 <td className="px-4 py-3"><div className="space-y-1"><Badge variant={r.booking_status==='cancelled'?'destructive':'secondary'}>{bookingLabels[r.booking_status||'']||'Sin identificar'}</Badge><span className={`block text-xs ${r.status==='review'&&r.review_code!=='MANUAL_ASSIGNMENT_REQUIRED'?'text-destructive':'text-muted-foreground'}`}>{integrationLabel(r)}</span></div></td>
 <td className="px-4 py-3"><Button size="sm" variant="outline" aria-label={`Ver detalle de ${guest(r)} · ${r.reference||r.booking_id||r.revision_id}`} onClick={e=>{e.stopPropagation();openDetail(r);}}>Ver detalle</Button>{canRetry&&canAssign(r)&&<Button size="sm" className="mt-2" onClick={e=>{e.stopPropagation();openDetail(r,true);}}>Asignar al PMS</Button>}</td>
 </tr>)}
 </tbody></table></div>
 <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">25 reservas por página</span><div className="flex gap-2"><Button variant="outline" disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</Button><Button variant="outline" disabled={page*q.data.pageSize>=q.data.counts[view]} onClick={()=>setPage(page+1)}>Siguiente</Button></div></div>
 </>}
 <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="flex max-h-[90vh] max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0"><DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left"><DialogTitle className="break-words text-xl">{selected?guest(selected):'Detalle de reserva'}</DialogTitle><DialogDescription>Datos de la reserva y su estadía en el PMS.</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5" data-testid="ota-booking-detail-scroll">{selected&&<BookingDetail key={selected.revision_id} connectionId={connectionId} booking={q.data?.bookings.find(r=>selected.booking_id?r.booking_id===selected.booking_id:r.revision_id===selected.revision_id)||selected} canRetry={canRetry} pending={pending} onRetry={onRetry} assignOpen={assignOpen} onAssigned={()=>void q.refetch()}/>}</div><DialogFooter className="shrink-0 border-t px-5 py-3"><Button variant="outline" onClick={()=>setSelected(null)}>Cerrar detalle</Button></DialogFooter></DialogContent></Dialog>
 </section>;
}
