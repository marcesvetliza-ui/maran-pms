import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ROOM_STATUS_OPTIONS } from "@/lib/planning-utils";
import type { RoomStatus } from "@shared/schema";

type Target = {roomId:string; status:RoomStatus; expectedStatus:string; roomNumber:string};
export function useRoomStatusCorrection(rooms: {id:string;roomNumber:string;status:string}[]) {
  const {toast}=useToast();
  const [target,setTarget]=useState<Target|null>(null);
  const [reason,setReason]=useState("");
  const [error,setError]=useState("");
  const save=useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/housekeeping/room/${target!.roomId}/status`, {
      status:target!.status, expectedStatus:target!.expectedStatus, reason:reason.trim(),
    }),
    onSuccess:()=>{
      setTarget(null);
      for(const key of ["/api/rooms","/api/housekeeping","/api/housekeeping/planning","/api/planning","/api/dashboard/stats"])
        void queryClient.invalidateQueries({queryKey:[key]});
      toast({title:"Corrección registrada",description:"Se guardaron el motivo y el cambio de estado."});
    },
    onError:e=>setError(parseApiError(e)),
  });
  const label=(status:string)=>ROOM_STATUS_OPTIONS.find(o=>o.value===status)?.label||status;
  return {
    isPending:save.isPending,
    mutate:({roomId,status}:{roomId:string;status:RoomStatus})=>{
      const room=rooms.find(r=>r.id===roomId);
      if(!room || save.isPending)return;
      setTarget({roomId,status,expectedStatus:room.status,roomNumber:room.roomNumber});
      setReason("");setError("");
    },
    dialog:<Dialog open={!!target} onOpenChange={open=>{if(!open&&!save.isPending)setTarget(null);}}>
      <DialogContent onInteractOutside={e=>{if(save.isPending)e.preventDefault();}}>
        <DialogHeader>
          <DialogTitle>Corregir estado · Hab. {target?.roomNumber}</DialogTitle>
          <DialogDescription>Usá esta corrección para una situación excepcional. Las limpiezas habituales se registran al finalizar la tarea. No realiza check-in ni checkout; si hay una estadía ingresada, conserva la ocupación.</DialogDescription>
        </DialogHeader>
        {target&&<p>{label(target.expectedStatus)} → {label(target.status)}</p>}
        <label className="space-y-2">Motivo de la corrección
          <textarea className="w-full rounded-md border bg-background p-2" value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} />
        </label>
        {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={()=>setTarget(null)}>Cancelar</Button>
          <Button disabled={save.isPending||!reason.trim()} onClick={()=>save.mutate()}>{save.isPending?"Guardando…":"Confirmar corrección"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  };
}
