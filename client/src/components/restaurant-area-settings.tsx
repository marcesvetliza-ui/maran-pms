import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest,parseApiError } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from '@/components/ui/dialog';
type Area={id:string;name:string;displayOrder?:number|null};
export function RestaurantAreaSettings({areas}:{areas:Area[]}){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState<Area[]>([]),[baseline,setBaseline]=useState<Area[]>([]),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const client=useQueryClient(),{toast}=useToast();
 const move=(index:number,offset:number)=>setDraft(previous=>{const next=[...previous];[next[index],next[index+offset]]=[next[index+offset],next[index]];return next;});
 const save=async()=>{
  setSaving(true);setError('');
  try{
   const response=await apiRequest('PATCH','/api/restaurant/area-settings',{areas:draft.map(area=>{const old=baseline.find(row=>row.id===area.id)!;return {id:area.id,name:area.name.trim(),expectedName:old.name,expectedOrder:old.displayOrder??null};})});
   const result=await response.json();if(result.saved!==true)throw Error('No se confirmó el guardado de los sectores.');
   client.setQueryData<any[]>(['/api/restaurant/areas'],previous=>draft.map((area,index)=>({...previous?.find(row=>row.id===area.id),...area,name:area.name.trim(),displayOrder:index})));
   await client.invalidateQueries({queryKey:['/api/restaurant/areas']});
   await client.invalidateQueries({queryKey:['/api/restaurant/tables']});
   setOpen(false);toast({title:'Sectores guardados'});
  }catch(reason){setError(parseApiError(reason));}finally{setSaving(false);}
 };
 return <><Button variant="outline" size="sm" onClick={()=>{setDraft(areas.map(area=>({...area})));setBaseline(areas.map(area=>({...area})));setError('');setOpen(true);}}>Configurar sectores</Button>
 <Dialog open={open} onOpenChange={value=>{if(!saving)setOpen(value);}}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Nombres y orden de sectores</DialogTitle><DialogDescription>Este orden se aplica al listado de áreas y al plano. Guardá los cambios al terminar.</DialogDescription></DialogHeader>
 <div className="space-y-2">{draft.map((area,index)=><div key={area.id} className="flex items-center gap-2"><Input aria-label={`Nombre del sector ${index+1}`} value={area.name} maxLength={120} disabled={saving} onChange={event=>setDraft(previous=>previous.map(row=>row.id===area.id?{...row,name:event.target.value}:row))}/><Button variant="outline" aria-label={`Subir ${area.name}`} disabled={saving||index===0} onClick={()=>move(index,-1)}>↑</Button><Button variant="outline" aria-label={`Bajar ${area.name}`} disabled={saving||index===draft.length-1} onClick={()=>move(index,1)}>↓</Button></div>)}</div>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={saving} onClick={()=>setOpen(false)}>Cancelar</Button><Button disabled={saving||draft.some(area=>!area.name.trim())} onClick={save}>{saving?'Guardando sectores…':'Guardar sectores'}</Button></DialogFooter></DialogContent></Dialog></>;
}
