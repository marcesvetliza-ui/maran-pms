import {useState} from 'react';
import {Button} from '@/components/ui/button';

type Mapping = {id:string;channexRoomTypeTitle:string;roomTypeId:string|null;roomIds?:string[]|null};
type Room = {id:string;roomNumber:string;roomTypeId:string;floor:number};
export function ChannexRoomSelection({mapping,types,rooms,disabled,onSave}:{mapping:Mapping;types:{id:string;name:string}[];rooms:Room[];disabled:boolean;onSave:(body:{roomTypeId:string|null;roomIds:string[]|null})=>void}) {
 const [type,setType]=useState(mapping.roomTypeId||'');
 const [specific,setSpecific]=useState(mapping.roomIds!=null);
 const [ids,setIds]=useState<string[]>(mapping.roomIds||[]);
 const candidates=rooms.filter(room=>room.roomTypeId===type);
 return <fieldset className="border rounded p-3 space-y-3" disabled={disabled}>
  <legend className="px-1 font-medium">{mapping.channexRoomTypeTitle}</legend>
  <label className="block">Categoría de Maran <select aria-label={`Categoría de ${mapping.channexRoomTypeTitle}`} className="border rounded p-2 ml-2" value={type} onChange={e=>{setType(e.target.value);setIds([]);}}><option value="">Sin mapear</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
  {type&&<><label className="block">Habitaciones incluidas <select aria-label={`Alcance de ${mapping.channexRoomTypeTitle}`} className="border rounded p-2 ml-2" value={specific?'specific':'category'} onChange={e=>setSpecific(e.target.value==='specific')}><option value="category">Toda la categoría dentro del piso configurado</option><option value="specific">Elegir habitaciones específicas</option></select></label>
   {specific&&<div className="flex flex-wrap gap-3">{candidates.map(room=><label key={room.id}><input type="checkbox" checked={ids.includes(room.id)} onChange={e=>{const checked=e.target.checked;setIds(old=>checked?[...old,room.id]:old.filter(id=>id!==room.id));}}/> {room.roomNumber}</label>)}{!candidates.length&&<p>No hay habitaciones físicas activas de esta categoría en el alcance.</p>}</div>}
  </>}
  <Button variant="outline" disabled={disabled||!!type&&specific&&!ids.length} onClick={()=>onSave({roomTypeId:type||null,roomIds:type&&specific?ids:null})}>Guardar mapeo de {mapping.channexRoomTypeTitle}</Button>
 </fieldset>;
}
