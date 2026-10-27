import { Checkbox } from "@/components/ui/checkbox";
import { useState,useRef } from "react";
import { apiRequest,parseApiError } from "@/lib/queryClient";
import { fundingMethods,fundingMethodLabels,fundingMoney } from "@/lib/paymentFunding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog,DialogContent,DialogHeader,DialogTitle } from "@/components/ui/dialog";

/** Financial corrections are separate from fiscal credit notes and refunds. */
export function ReservationPaymentCorrection({reservationId,payment,onClose,onSaved,userId}:{userId:string;reservationId:string;payment:{id:string;amount:string;method:string};onClose:()=>void;onSaved:()=>void}) {
 const key=`reservation-payment-correction:${userId}:${reservationId}:${payment.id}`;
 const [attempt,setAttempt]=useState<any>(()=>{try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved&&(!saved.operationId||!saved.previewHash||saved.request?.paymentId!==payment.id))return {damaged:true};return saved;}catch{return {damaged:true};}});
 const attemptRef=useRef(attempt),inFlight=useRef(false);
 const [action,setAction]=useState('change_method'),[method,setMethod]=useState(['efectivo','cash'].includes(payment.method)?'tarjeta_debito':'efectivo'),[reason,setReason]=useState(''),[evidence,setEvidence]=useState('');
 const [preview,setPreview]=useState<any>(null),[restore,setRestore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const base=`/api/payment-funding/reservations/${reservationId}/payment-corrections`;
 const request={paymentId:payment.id,action,...(action==='change_method'?{newMethod:method}:{}),reason:reason.trim(),evidenceRef:evidence.trim(),restorations:restore?(preview?.proposals??[]):[]};
 async function review(){setBusy(true);setError('');try{const res=await apiRequest('POST',`${base}/preview`,request),body=await res.json();setPreview(body.data);}catch(e){setError(parseApiError(e));}finally{setBusy(false);}}
 async function confirm(){
  if(inFlight.current)return;inFlight.current=true;
  setBusy(true);setError('');try{
   const body=attemptRef.current??{operationId:crypto.randomUUID(),previewHash:preview.previewHash,request:preview.request};
   sessionStorage.setItem(key,JSON.stringify(body));attemptRef.current=body;setAttempt(body);
   await apiRequest('POST',base,body);sessionStorage.removeItem(key);attemptRef.current=null;setAttempt(null);onSaved();onClose();
  }catch(e){
   setError(parseApiError(e));
   const raw=(e as Error).message;
   if(/"code":"(?:PREVIEW_STALE|FUNDS_UNAVAILABLE|METHOD_REQUIRED|FISCAL_OPERATION_PENDING|PAYMENT_UNAVAILABLE|HISTORICAL_CONFIRMATION_REQUIRED|UNSUPPORTED_SETTLEMENT)"/.test(raw)){sessionStorage.removeItem(key);attemptRef.current=null;setAttempt(null);setPreview(null);}
  }finally{inFlight.current=false;setBusy(false);}
 }
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Corregir cobro</DialogTitle></DialogHeader>
  <p>Importe registrado: <strong>{fundingMoney(Math.round(Number(payment.amount)*100))}</strong> · {fundingMethodLabels[payment.method as keyof typeof fundingMethodLabels]||payment.method}</p>
  {attempt?.damaged?<p role="alert">No se pudo leer la operación pendiente. Solicitá revisión antes de corregir nuevamente.</p>:<>
   <fieldset disabled={busy||!!attempt} className="space-y-3">
    <label className="block">Qué ocurrió<select aria-label="Tipo de corrección" className="block w-full rounded border bg-background p-2" value={action} onChange={e=>{setAction(e.target.value);setPreview(null);setRestore(false);}}><option value="change_method">Se cobró, pero el medio está mal registrado</option><option value="void_nonexistent">El cobro registrado nunca existió</option></select></label>
    {action==='change_method'?<label className="block">Medio correcto<select aria-label="Medio correcto" className="block w-full rounded border bg-background p-2" value={method} onChange={e=>{setMethod(e.target.value);setPreview(null);}}>{fundingMethods.map(m=><option key={m} value={m}>{fundingMethodLabels[m]}</option>)}</select></label>:<p>Se retirará el registro erróneo. No se registra una devolución de dinero ni se anula una factura.</p>}
    <label className="block">Motivo<Input placeholder="Explicá el motivo (mínimo 10 caracteres)" value={reason} maxLength={1000} onChange={e=>{setReason(e.target.value);setPreview(null);}}/></label>
    <label className="block">Referencia de comprobación<Input value={evidence} maxLength={500} placeholder="Ej.: cupón, control de Caja o registro del error" onChange={e=>{setEvidence(e.target.value);setPreview(null);}}/></label>
   </fieldset>
   {preview&&!attempt&&<div className="space-y-2 rounded border p-3">
    <p>Saldo de la reserva después de corregir: <strong>{fundingMoney(preview.debtAfterCents)}</strong></p>
    {preview.obligations.filter((o:any)=>o.uncoveredCents>0).map((o:any)=><p key={o.invoiceId}>Factura #{o.invoiceId}: {fundingMoney(o.uncoveredCents)} sin cobertura.</p>)}
    {!!preview.proposals?.length&&action==='void_nonexistent'&&<label className="block"><Checkbox disabled={busy||!!attempt} checked={restore} onCheckedChange={value=>setRestore(value===true)}/> Restaurar explícitamente crédito libre a la factura original ({fundingMoney(preview.proposals.reduce((n:number,r:any)=>n+r.amountCents,0))}). No crea otro cobro.</label>}
    {action==='void_nonexistent'&&preview.restorationSummary?.map((r:any)=><p key={`${r.paymentId}:${r.invoiceId}`} className="text-sm">{fundingMethodLabels[r.method as keyof typeof fundingMethodLabels]||r.method} · {fundingMoney(r.amountCents)} → {r.invoiceLabel}</p>)}
   </div>}
   {attempt?<Button disabled={busy} onClick={()=>void confirm()}>Recuperar la misma corrección</Button>:<>
    <Button variant="outline" disabled={busy||reason.trim().length<10||evidence.trim().length<3} onClick={()=>void review()}>Revisar corrección</Button>
    {preview&&<Button disabled={busy||JSON.stringify(preview.request)!==JSON.stringify(request)} onClick={()=>void confirm()}>Confirmar corrección</Button>}
   </>}
  </>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}
 </DialogContent></Dialog>;
}
