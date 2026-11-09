import {useState} from 'react';
import {Button} from '@/components/ui/button';

type Mapping = {id:string;channexRoomTypeTitle:string;roomTypeId:string|null;roomIds?:string[]|null};
type Room = {id:string;roomNumber:string;roomTypeId:string;floor:number};
export function ChannexRoomSelection({mapping,types,rooms,disabled,onSave}:{mapping:Mapping;types:{id:string;name:string}[];rooms:Room[];disabled:boolean;onSave:(body:{roomTypeId:string|null;roomIds:string[]|null})=>void}) {
 const [type,setType]=useState(mapping.roomTypeId||'');
 const [specific,setSpecific]=useState(mapping.roomIds!=null);
 const [ids,setIds]=useState<string[]>(mapping.roomIds||[]);
 const candidates=rooms.filter(room=>room.roomTypeId===type);
 return <fieldset className="space-y-4" disabled={disabled}>
  <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Habitaciones del PMS</legend>
  <label className="block">Categoría de Maran <select aria-label={`Categoría de ${mapping.channexRoomTypeTitle}`} className="border rounded p-2 ml-2" value={type} onChange={e=>{setType(e.target.value);setIds([]);}}><option value="">Sin mapear</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
  {type&&<><div role="group" aria-label={`Alcance de ${mapping.channexRoomTypeTitle}`} className="flex flex-wrap gap-2">{[{value:false,title:'Toda la categoría'},{value:true,title:'Habitaciones específicas'}].map(option=><label key={option.title} className={`has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium ${specific===option.value?'border-primary bg-primary/10 text-primary':'bg-background'}`}><input className="sr-only" type="radio" name={`scope-${mapping.id}`} checked={specific===option.value} onChange={()=>setSpecific(option.value)}/>{option.title}</label>)}</div>
   <p className="text-xs text-muted-foreground">{specific?`${ids.filter(id=>candidates.some(room=>room.id===id)).length} de ${candidates.length} habitaciones seleccionadas`:`Toda la categoría dentro del alcance configurado (${candidates.length} habitaciones)`}</p>
   <div className="flex flex-wrap gap-2">{candidates.map(room=><label key={room.id} className={`has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring cursor-pointer rounded-full border px-3 py-2 text-sm font-medium ${!specific||ids.includes(room.id)?'border-primary bg-primary text-primary-foreground':'bg-background text-muted-foreground'}`}><input className="sr-only" type="checkbox" aria-label={room.roomNumber} disabled={!specific} checked={!specific||ids.includes(room.id)} onChange={e=>{const checked=e.target.checked;setIds(old=>checked?[...old,room.id]:old.filter(id=>id!==room.id));}}/>{room.roomNumber}</label>)}{!candidates.length&&<p className="text-sm text-muted-foreground">No hay habitaciones físicas activas de esta categoría en el alcance.</p>}</div>
  </>}
  <Button disabled={disabled||!!type&&specific&&!ids.length} onClick={()=>onSave({roomTypeId:type||null,roomIds:type&&specific?ids:null})}>Guardar mapeo de {mapping.channexRoomTypeTitle}</Button>
 </fieldset>;
}
