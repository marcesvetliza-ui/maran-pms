import { useRef,useState } from 'react';
import { useMutation,useQueryClient } from '@tanstack/react-query';
import { apiRequest,parseApiError } from '@/lib/queryClient';
import { layoutChanges,moveLayoutTable,type LayoutTable } from '@shared/restaurant-layout';
export function useRestaurantLayout<T extends LayoutTable>(tables:T[],notify:(value:{title:string;description?:string;variant?:'destructive'})=>void){
 const queryClient=useQueryClient();
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState<Record<string,{positionX:number;positionY:number}>>({}),[error,setError]=useState('');
 const baseline=useRef<LayoutTable[]>([]);
 const shown=tables.map(t=>draft[t.id]?{...t,...draft[t.id]}:t);
 const changes=layoutChanges(baseline.current,shown).filter(patch=>Object.hasOwn(draft,patch.id));
 const save=useMutation({mutationFn:async()=>{
  if(changes.length){const response=await apiRequest('PATCH','/api/restaurant/layout',{tables:changes});let result:any;try{result=await response.json();}catch{throw new Error('No se pudo confirmar el guardado. Conservamos los movimientos para reintentar.');}if(result?.saved!==true)throw new Error('El servidor no confirmó el guardado. Conservamos los movimientos para reintentar.');}
  return changes;
 },onSuccess:async(saved)=>{queryClient.setQueryData<T[]>(['/api/restaurant/tables'],current=>current?.map(table=>{const position=saved.find(p=>p.id===table.id);return position?{...table,positionX:position.positionX,positionY:position.positionY}:table;}));await queryClient.invalidateQueries({queryKey:['/api/restaurant/tables']});setDraft({});setEditing(false);setError('');notify({title:'Layout guardado',description:'Las posiciones quedaron guardadas para todos los usuarios.'});},onError:(e:Error)=>{const message=parseApiError(e);setError(message);notify({title:'No se pudo guardar el layout',description:message,variant:'destructive'});}});
 return {editing,tables:shown,changes:changes.length,saving:save.isPending,error,
  toggle:()=>{if(save.isPending)return;if(editing){save.mutate();}else{baseline.current=tables.map(t=>({...t}));setDraft({});setError('');setEditing(true);}},
  discard:()=>{if(!save.isPending){setDraft({});setEditing(false);setError('');}},
  move:(id:string,x:number,y:number,areaId:string)=>{if(!editing||save.isPending)return;const source=shown.find(t=>t.id===id);if(!source||source.areaId!==areaId){notify({title:'Elegí una posición dentro del mismo sector'});return;}
   for(const table of shown)if(!baseline.current.some(t=>t.id===table.id))baseline.current.push({...table});
   const next=moveLayoutTable(shown,id,x,y,areaId);setDraft(previous=>{
    const result={...previous};
    for(const table of next){const displayed=shown.find(t=>t.id===table.id)!;if(displayed.positionX===table.positionX&&displayed.positionY===table.positionY)continue;const original=baseline.current.find(t=>t.id===table.id)!;if(original.positionX===table.positionX&&original.positionY===table.positionY)delete result[table.id];else result[table.id]={positionX:table.positionX??0,positionY:table.positionY??0};}
    return result;
   });setError('');},
 };
}
