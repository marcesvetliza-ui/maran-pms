import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, parseApiError, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { RoomStatus } from "@shared/schema";

/** Routine Housekeeping actions are direct; exceptional corrections elsewhere retain their dialog. */
export function useHousekeepingStatus(rooms: {id:string;roomNumber:string;status:string}[]) {
  const {toast}=useToast();
  const busy=useRef(false);
  const refresh=()=>{
    for(const key of ["/api/rooms","/api/housekeeping","/api/housekeeping/planning","/api/planning","/api/dashboard/stats"])
      void queryClient.invalidateQueries({queryKey:[key]});
  };
  const save=useMutation({
    mutationFn: ({roomId,status,expectedStatus}:{roomId:string;status:RoomStatus;expectedStatus:string}) =>
      apiRequest("PATCH", `/api/housekeeping/room/${roomId}/status`, {status,expectedStatus}),
    onSuccess:()=>{
      refresh();
      toast({title:"Estado actualizado"});
    },
    onError:e=>{
      refresh();
      toast({title:"No se pudo cambiar el estado",description:parseApiError(e),variant:"destructive"});
    },
    onSettled:()=>{busy.current=false;},
  });
  return {
    isPending:save.isPending,
    mutate:({roomId,status}:{roomId:string;status:RoomStatus})=>{
      const room=rooms.find(r=>r.id===roomId);
      if(!room || busy.current || room.status===status)return;
      busy.current=true;
      save.mutate({roomId,status,expectedStatus:room.status});
    },
    dialog:null,
  };
}
