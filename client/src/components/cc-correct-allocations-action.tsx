import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/App';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { fmtMoney } from '@/lib/utils';
import { moneyPayload, parseMoneyInput } from '@/lib/money-input';
import { formatDisplayDate, formatDisplayDateTime } from '@shared/date-display';
import { CC_REALLOCATE_PERMISSION, type CcAllocationPreview } from '@shared/ccReceiptAllocations';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { useToast } from '@/hooks/use-toast';

type Movement={id:string;type:string;voided?:boolean|null;reservationId?:string|null;paymentId?:string|null;groupPaymentId?:string|null};
export function CcCorrectAllocationsAction({movement,entityLabel,className}:{movement:Movement;entityLabel?:string;className?:string}){
 const {hasPermission}=useAuth();
 const allowed=!!hasPermission?.(CC_REALLOCATE_PERMISSION)&&movement.type==='pago'&&!movement.voided&&!movement.reservationId&&!movement.paymentId&&!movement.groupPaymentId;
 const [open,setOpen]=useState(false),[selected,setSelected]=useState<Record<string,string>>({}),[reason,setReason]=useState(''),[review,setReview]=useState(false),[requestId,setRequestId]=useState('');
 const {toast}=useToast();
 const q=useQuery<CcAllocationPreview>({queryKey:['cc-allocation-correction',movement.id],enabled:open&&allowed,refetchOnWindowFocus:false,refetchOnReconnect:false,
 queryFn:async()=>(await apiRequest('GET',`/api/account-movements/${encodeURIComponent(movement.id)}/allocation-correction`)).json()});
 useEffect(()=>{if(q.data&&open){setSelected(Object.fromEntries(q.data.current.map(a=>[a.cargoId,a.amount])));setRequestId(crypto.randomUUID());setReview(false);}},[q.data,open]);
 const allocations=Object.entries(selected).map(([cargoId,amount])=>({cargoId,amount:moneyPayload(amount)}));
 const total=allocations.reduce((s,a)=>s+Math.round(Number(a.amount)*100),0)/100;
 const invalid=allocations.some(a=>Number(a.amount)<=0||!q.data?.charges.some(c=>c.id===a.cargoId&&Number(a.amount)<=Number(c.available)))||total>Number(q.data?.amount||0);
 const same=q.data&&JSON.stringify([...allocations].sort((a,b)=>a.cargoId.localeCompare(b.cargoId)))===JSON.stringify(q.data.current.map(a=>({cargoId:a.cargoId,amount:moneyPayload(a.amount)})).sort((a,b)=>a.cargoId.localeCompare(b.cargoId)));
 const save=useMutation({mutationFn:async()=>(await apiRequest('POST',`/api/account-movements/${encodeURIComponent(movement.id)}/allocation-correction`,{requestId,version:q.data!.version,reason:reason.trim(),allocations})).json(),
 onSuccess:()=>{setOpen(false);void queryClient.invalidateQueries();toast({title:'Facturas aplicadas corregidas',description:'Se conservaron el recibo y el cobro en Caja.'});}});
 if(!allowed)return null;
 const change=(next:boolean)=>{if(save.isPending)return;setOpen(next);setReview(false);setReason('');save.reset();if(next)void q.refetch();};
 return <><Button type="button" size="sm" variant="outline" className={className} onClick={()=>change(true)}>Corregir facturas aplicadas</Button>
 <Dialog open={open} onOpenChange={change}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Corregir facturas aplicadas</DialogTitle><DialogDescription>Seleccioná los comprobantes que cancela este recibo. Se conservan su número, fecha, importe, medios de pago, retenciones y Caja.</DialogDescription></DialogHeader>
 {q.isLoading?<p>Cargando comprobantes…</p>:q.isError?<div><p role="alert">{q.error.message}</p><Button variant="outline" onClick={()=>void q.refetch()}>Volver a consultar</Button></div>:q.data&&<>
 <p className="font-medium">{entityLabel} · {q.data.receiptNumber||'Recibo'} · ARS {fmtMoney(Number(q.data.amount))}</p>
 <section className="rounded border p-3 text-sm space-y-1"><h3 className="font-medium">Aplicación actual</h3>{q.data.current.length?q.data.current.map(a=><p key={a.cargoId}>{a.description} · {formatDisplayDate(a.date)} · ARS {fmtMoney(Number(a.amount))}</p>):<p>Pago a cuenta, sin comprobantes aplicados.</p>}<p>Sin aplicar: ARS {fmtMoney(Number(q.data.unallocated))}</p></section>
 {!review?<section className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Nueva aplicación · más antiguos primero</h3><Button type="button" size="sm" variant="outline" onClick={()=>setSelected({})}>Quitar selección</Button></div>
 <div className="max-h-72 overflow-y-auto border rounded divide-y">{q.data.charges.map(c=><div key={c.id} className="flex items-center gap-3 p-3 text-sm">
 <Checkbox aria-label={`Aplicar a ${c.description}`} checked={c.id in selected} onCheckedChange={checked=>{setSelected(previous=>{const next={...previous};if(checked===true)next[c.id]=c.applied!=='0.00'&&Number(c.applied)>0?c.applied:Math.min(Number(c.available),Math.max(0,Number(q.data!.amount)-total)).toFixed(2);else delete next[c.id];return next;});}}/>
 <div className="flex-1"><p>{c.description}</p><p className="text-xs text-muted-foreground">{formatDisplayDate(c.date)}{c.reference?` · ${c.reference}`:''} · Disponible para este recibo: ARS {fmtMoney(Number(c.available))}</p></div>
 <Input className="w-32" inputMode="decimal" aria-label={`Importe para ${c.description}`} disabled={!(c.id in selected)} value={selected[c.id]||''} onChange={e=>setSelected({...selected,[c.id]:e.target.value})}/>
 </div>)}</div>
 {q.data.charges.length===0&&<p>No hay comprobantes pendientes en esta cuenta.</p>}
 <label className="block text-sm">Motivo de la corrección<Input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Ej.: el cobro correspondía a facturas anteriores"/></label>
 </section>:<section className="rounded border p-3 space-y-2 text-sm"><h3 className="font-medium">Revisá la nueva aplicación</h3>{allocations.length?allocations.map(a=><p key={a.cargoId}>{q.data!.charges.find(c=>c.id===a.cargoId)?.description} · ARS {fmtMoney(Number(a.amount))}</p>):<p>El recibo quedará como pago a cuenta, sin comprobantes aplicados.</p>}<p>Motivo: {reason}</p></section>}
 <p>Total aplicado: ARS {fmtMoney(total)} · Saldo a favor sin aplicar: ARS {fmtMoney(Number(q.data.amount)-total)}</p>
 {invalid&&<p role="alert" className="text-destructive text-sm">Revisá los importes: deben ser positivos y no superar los saldos disponibles ni el total del recibo.</p>}
 {same&&<p className="text-sm text-muted-foreground">Elegí una aplicación diferente para guardar la corrección.</p>}
 {save.isError&&<p role="alert" className="text-destructive text-sm">{save.error.message}</p>}
 <DialogFooter><Button variant="outline" disabled={save.isPending||q.isFetching} onClick={()=>void q.refetch()}>Actualizar comprobantes</Button><Button variant="outline" disabled={save.isPending} onClick={()=>review?setReview(false):change(false)}>{review?'Volver a editar':'Cancelar'}</Button>
 {!review?<Button disabled={invalid||!!same||reason.trim().length<3||q.isFetching} onClick={()=>setReview(true)}>Revisar corrección</Button>:<Button disabled={save.isPending||invalid||q.isFetching} onClick={()=>save.mutate()}>{save.isPending?'Guardando…':'Confirmar corrección'}</Button>}</DialogFooter>
 <details className="text-sm"><summary className="cursor-pointer">Historial de correcciones ({q.data.history.length}{q.data.history.length===30?' · últimas 30':''})</summary>{q.data.history.map(h=>{let d:any;try{d=JSON.parse(h.details);}catch{return null;}return <div className="border-l pl-3 my-3 space-y-1" key={h.id}><p>{formatDisplayDateTime(h.timestamp)} · {h.user_name}</p><p>{d.reason}</p><p>Antes: {d.before.map((a:any)=>`${a.description||a.cargoId}: ARS ${fmtMoney(Number(a.amount))}`).join(' · ')||'Sin aplicación'}</p><p>Después: {d.after.map((a:any)=>`${a.description||a.cargoId}: ARS ${fmtMoney(Number(a.amount))}`).join(' · ')||'Sin aplicación'}</p></div>;})}</details>
 </>}
 </DialogContent></Dialog></>;
}
