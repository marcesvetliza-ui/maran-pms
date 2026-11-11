import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { apiRequest, queryClient, parseApiError } from "@/lib/queryClient";
import type { PackageWithDetails } from "@shared/schema";
const money = (cents:number) => (cents/100).toLocaleString("es-AR",{style:"currency",currency:"ARS"});
export function ReservationPackageChange({reservationId,packages,disabled,onApplied}:{reservationId:string;packages:PackageWithDetails[];disabled:boolean;onApplied:(saved:any,packageId:string)=>void}) {
 const [open,setOpen]=useState(false),[packageId,setPackageId]=useState(""),[reason,setReason]=useState(""),[preview,setPreview]=useState<any>(null),[error,setError]=useState("");
 const state=useQuery<any>({queryKey:[`/api/reservations/${reservationId}/nightly-pricing`],enabled:open,staleTime:0,refetchOnMount:"always"});
 const mutation=useMutation({mutationFn:async(apply:boolean)=>{
  const body={revision:preview?.revision??state.data?.reservation.pricingRevision,reason:reason.trim(),edit:{kind:"package",packageId,...(apply?{expectedTotalCents:preview.packageProposal.packageTotalCents}:{})}};
  return (await apiRequest("POST",`/api/reservations/${reservationId}/nightly-pricing/${apply?"apply":"preview"}`,body)).json();
 },onSuccess:(result,apply)=>{
  if(!apply){setPreview(result);return;}
  onApplied(result,packageId);setOpen(false);
  for(const key of ["/api/reservations","/api/planning",`/api/reservations/${reservationId}`,`/api/reservations/${reservationId}/nightly-pricing`])queryClient.invalidateQueries({queryKey:[key]});
 },onError:(e)=>{setError(parseApiError(e)||"No se pudo aplicar el paquete.");setPreview(null);void state.refetch();}});
 return <><Button type="button" variant="outline" disabled={disabled} onClick={()=>{setPackageId("");setReason("");setPreview(null);setError("");setOpen(true);}}>Aplicar paquete</Button>
 <Dialog open={open} onOpenChange={v=>{if(!mutation.isPending)setOpen(v);}}><DialogContent>
 <DialogHeader><DialogTitle>Aplicar paquete a la reserva</DialogTitle><DialogDescription>Revisá el precio antes de confirmar. Se conservan las fechas guardadas, los cobros y los demás cargos. El paquete reemplaza la tarifa y el descuento de alojamiento.</DialogDescription></DialogHeader>
 <label className="grid gap-2 text-sm">Paquete<select aria-label="Paquete a aplicar" className="rounded border p-2 bg-background" value={packageId} disabled={mutation.isPending} onChange={e=>{setPackageId(e.target.value);setPreview(null);setError("");}}><option value="">Elegí un paquete</option>{packages.map(p=><option key={p.id} value={p.id}>{p.name} · {p.nights} noche(s)</option>)}</select></label>
 <label className="grid gap-2 text-sm">Motivo<input aria-label="Motivo del paquete" className="rounded border p-2 bg-background" maxLength={1000} disabled={mutation.isPending} value={reason} onChange={e=>{setReason(e.target.value);setPreview(null);setError("");}}/></label>
 {state.isFetching&&<p role="status">Actualizando la reserva…</p>}
 {state.isError&&<p role="alert">No se pudo cargar la reserva. Cerrá y volvé a intentar.</p>}
 {state.data?.blocked&&<p role="alert">{state.data.blocked}</p>}
 {error&&<p role="alert" className="text-destructive">{error}</p>}
 {preview&&<div className="rounded border p-3 text-sm" role="status"><p>Anterior: {money(preview.previousTotalCents)}</p><p>Paquete: {money(preview.newTotalCents)}</p><p>Diferencia: {money(preview.differenceCents)}</p><p>Fechas: {preview.checkIn.split('-').reverse().join('/')} → {preview.checkOut.split('-').reverse().join('/')}</p></div>}
 <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>setOpen(false)}>Cancelar</Button><Button type="button" disabled={mutation.isPending||state.isFetching||state.isError||!state.data||!!state.data.blocked||!packageId||reason.trim().length<3} onClick={()=>{setError("");mutation.mutate(!!preview);}}>{mutation.isPending?"Procesando…":preview?"Confirmar paquete":"Revisar importe"}</Button></DialogFooter>
 </DialogContent></Dialog></>;
}
