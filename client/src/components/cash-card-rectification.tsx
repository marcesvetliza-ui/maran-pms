import {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiRequest,parseApiError} from '@/lib/queryClient';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
const money=(v:number)=>v.toLocaleString('es-AR',{style:'currency',currency:'ARS'});
const label=(v:string)=>v==='tarjeta_debito'?'Débito':'Crédito';
export function CashCardRectification({invoiceId,method,onSaved}:{invoiceId:number;method:string;onSaved:()=>void}){
 const key=`cash-card-rectification:${invoiceId}`;
 const [pending,setPending]=useState<any>(()=>{try{const value=JSON.parse(sessionStorage.getItem(key)||'null');return value&&(!value.operationId||!value.previewHash||!value.reason||!value.evidenceRef||!['tarjeta_credito','tarjeta_debito'].includes(value.method))?{damaged:true}:value;}catch{return {damaged:true};}});
 const [reason,setReason]=useState(''),[evidenceRef,setEvidence]=useState(''),[preview,setPreview]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const inFlight=useRef(false);
 async function review(){setBusy(true);setError('');try{const response=await apiRequest('POST',`/api/billing/invoices/${invoiceId}/card-rectification/preview`,{method,reason:reason.trim(),evidenceRef:evidenceRef.trim()});setPreview(await response.json());}catch(e){setError(parseApiError(e));}finally{setBusy(false);}}
 async function confirm(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{
   const body=pending??{operationId:crypto.randomUUID(),previewHash:preview.previewHash,method:preview.newMethod,reason:preview.reason,evidenceRef:preview.evidenceRef};
   sessionStorage.setItem(key,JSON.stringify(body));setPending(body);
   await apiRequest('POST',`/api/billing/invoices/${invoiceId}/card-rectification`,body);
   sessionStorage.removeItem(key);setPending(null);onSaved();
 }catch(e){setError(parseApiError(e));if((e as Error).message.includes('CARD_RECTIFICATION_STALE')){sessionStorage.removeItem(key);setPending(null);setPreview(null);}}finally{setBusy(false);inFlight.current=false;}}
 return <div className="space-y-3 rounded border p-3">
  <p className="text-sm font-medium">Rectificación administrativa de turno cerrado</p>
  <p className="text-xs text-muted-foreground">Sólo Crédito ↔ Débito. Conserva el cierre original, el efectivo contado y el total cobrado. Registra una revisión del cierre.</p>
  {pending?.damaged?<p role="alert">La operación guardada requiere revisión antes de volver a rectificar.</p>:<>
   <fieldset disabled={busy||!!pending} className="space-y-2">
    <label className="block text-sm">Motivo<Input aria-label="Motivo de rectificación" value={reason} onChange={e=>{setReason(e.target.value);setPreview(null);}} maxLength={1000}/></label>
    <label className="block text-sm">Referencia de comprobación<Input aria-label="Referencia de comprobación del cierre" placeholder="Ej.: control del cupón o del POS, sin datos de tarjeta" value={evidenceRef} onChange={e=>{setEvidence(e.target.value);setPreview(null);}} maxLength={500}/></label>
   </fieldset>
   {!pending&&<Button variant="outline" disabled={busy||reason.trim().length<10||evidenceRef.trim().length<3} onClick={()=>void review()}>Revisar rectificación</Button>}
   {preview&&!pending&&<div className="space-y-1 text-sm">
    <p>Turno #{preview.shiftNumber} · cierre {new Date(preview.closedAt).toLocaleString('es-AR')} · revisión {preview.revision}</p>
    <p>{money(preview.amount)}: {label(preview.oldMethod)} → {label(preview.newMethod)}</p>
    <p>Crédito: {money(preview.before.tarjeta_credito/100)} → {money(preview.after.tarjeta_credito/100)}</p>
    <p>Débito: {money(preview.before.tarjeta_debito/100)} → {money(preview.after.tarjeta_debito/100)}</p>
    <Button disabled={busy||preview.newMethod!==method} onClick={()=>void confirm()}>Confirmar rectificación del cierre</Button>
   </div>}
   {pending&&<><p className="text-sm">Operación pendiente: cambiar a {label(pending.method)}. Motivo: {pending.reason}</p><Button disabled={busy} onClick={()=>void confirm()}>Reintentar la misma rectificación</Button></>}
  </>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </div>;
}
export function CashCardRectificationHistory({shiftId}:{shiftId:string}){
 const {data,error}=useQuery<any[]>({queryKey:['/api/cash/shifts',shiftId,'card-rectifications'],queryFn:async()=> (await apiRequest('GET',`/api/cash/shifts/${shiftId}/card-rectifications`)).json()});
 if(error)return <p role="alert">No se pudieron consultar las rectificaciones de tarjetas de este cierre.</p>;
 if(!data?.length)return null;
 return <div className="space-y-2 rounded border border-amber-500 p-3"><h3 className="font-semibold">Rectificaciones de tarjetas — cierre original conservado</h3>{data.map(row=><div key={row.operation_id} className="text-sm">
  <p>Revisión {row.revision} · {row.operator} · {new Date(row.created_at).toLocaleString('es-AR')}</p>
  <p>{money(Number(row.amount))}: {label(row.old_method)} → {label(row.new_method)}</p><p>{row.reason} · Comprobación: {row.evidence_ref}</p>
  <p>Crédito rectificado: {money(row.card_after.tarjeta_credito/100)} · Débito rectificado: {money(row.card_after.tarjeta_debito/100)}</p>
 </div>)}</div>;
}
