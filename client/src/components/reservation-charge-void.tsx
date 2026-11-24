import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { canVoidReservationCharge } from "@shared/reservationChargePermissions";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function ReservationChargeVoid({reservationId,charge,role,onSaved}: {
  reservationId:string;charge:{id:string;description:string;amount:string;category:string;hospitalityUnits?:number|null};role?:string;onSaved?:()=>void;
}) {
  const [open,setOpen]=useState(false),[reason,setReason]=useState("");
  const [snapshot,setSnapshot]=useState<typeof charge | null>(null);
  const {toast}=useToast();
  const mutation=useMutation({
    mutationFn:async()=>{
      if(!snapshot)throw new Error("Actualizá el cargo antes de anularlo.");
      return (await apiRequest("PATCH",`/api/charges/${snapshot.id}/anular`,{motivoAnulacion:reason.trim(),expectedDescription:snapshot.description,expectedAmount:snapshot.amount})).json();
    },
    onSuccess:async(result:{roomOnly?:boolean;hospitalityCancelled?:boolean;hospitalityUnits?:number|null})=>{
      setOpen(false);setReason("");
      onSaved?.();
      await Promise.all([
        queryClient.invalidateQueries({queryKey:["/api/reservations",reservationId]}),
        ...["/api/reservations","/api/folios","/api/planning","/api/rooms/in-house","/api/rooms/arriving-today","/api/dashboard/departures","spa-account-folio","spa-prefactura-account"].map(key=>queryClient.invalidateQueries({queryKey:[key]})),
        queryClient.invalidateQueries({queryKey:['group-room-account']}),
        queryClient.invalidateQueries({predicate:q=>typeof q.queryKey[0]==='string'&&q.queryKey[0].startsWith('/api/hospitality/included-services')}),
        queryClient.invalidateQueries({predicate:query=>typeof query.queryKey[0]==='string'&&query.queryKey[0].startsWith('/api/groups')}),
      ]);
      toast({title:"Cargo anulado",description:result.hospitalityCancelled||result.hospitalityUnits!=null ? "Cargo anulado; pendientes de Hospitalidad retirados y atenciones conservadas." :result.roomOnly ? "Se anuló la imputación a la habitación. El consumo de Restaurante permanece sin cambios." : "El cargo se anuló con su motivo e historial."});
    },
    onError:error=>toast({title:"No se pudo anular el cargo",description:parseApiError(error),variant:"destructive"}),
  });
  if(!canVoidReservationCharge(role,charge.category))return null;
  return <>
    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Anular cargo" title="Anular cargo con motivo" data-testid={`button-void-prefactura-charge-${charge.id}`} onClick={event=>{event.stopPropagation();mutation.reset();setSnapshot({...charge});setReason("");setOpen(true);}}><Ban className="h-3.5 w-3.5"/></Button>
    <Dialog open={open} onOpenChange={value=>{if(!mutation.isPending)setOpen(value);}}><DialogContent onClick={event=>event.stopPropagation()}>
      <DialogHeader><DialogTitle>Anular cargo</DialogTitle><DialogDescription>{charge.hospitalityUnits!=null ? "Se anulará el cargo y se retirarán sus pendientes de Hospitalidad. Las atenciones registradas se conservan con su historial." :charge.category === "restaurant" ? "Se quitará únicamente la imputación a esta habitación. El pedido, los consumos y la caja de Restaurante se conservan." : "El cargo quedará anulado con historial; no se borra su registro."}</DialogDescription></DialogHeader>
      <p>{snapshot?.description}</p><Label htmlFor={`void-reason-${charge.id}`}>Motivo obligatorio</Label><Input id={`void-reason-${charge.id}`} value={reason} maxLength={500} disabled={mutation.isPending} onChange={event=>setReason(event.target.value)}/>
      {mutation.isError && <p role="alert" className="text-sm text-destructive" data-testid="prefactura-charge-void-error">{parseApiError(mutation.error)}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={mutation.isPending} onClick={()=>setOpen(false)}>Cancelar</Button><Button type="button" variant="destructive" disabled={!reason.trim() || mutation.isPending} onClick={()=>mutation.mutate()}>{mutation.isPending ? "Anulando…" : "Confirmar anulación"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
