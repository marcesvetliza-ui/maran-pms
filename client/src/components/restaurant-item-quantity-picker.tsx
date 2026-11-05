import {Checkbox} from '@/components/ui/checkbox';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {restaurantPortionCents} from '@shared/restaurant-item-quantities';
type Item={id:string;quantity:number;subtotal:string;menuItem?:{name?:string}};
export function RestaurantItemQuantityPicker({items,quantities,onChange,names,onNameChange}:{items:Item[];quantities:Record<string,number>;onChange:(value:Record<string,number>)=>void;names?:Record<string,string>;onNameChange?:(id:string,name:string)=>void}){
 const set=(item:Item,value:number)=>{const next={...quantities};const qty=Math.max(0,Math.min(item.quantity,Math.trunc(value)||0));if(qty)next[item.id]=qty;else delete next[item.id];onChange(next);};
 const money=(cents:number)=>(cents/100).toLocaleString('es-AR',{minimumFractionDigits:2});
 const total=items.reduce((sum,item)=>sum+(quantities[item.id]?restaurantPortionCents(item.subtotal,item.quantity,Math.min(quantities[item.id],item.quantity)):0),0);
 const pending=items.reduce((sum,item)=>sum+Math.round(Number(item.subtotal)*100),0)-total;
 return <div className="space-y-2">
   <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={()=>onChange(Object.fromEntries(items.map(i=>[i.id,i.quantity])))}>Todo</Button><Button type="button" size="sm" variant="outline" onClick={()=>onChange({})}>Limpiar</Button></div>
   <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
    {!items.length&&<p className="p-3 text-sm">No hay artículos pendientes</p>}
    {items.map(item=>{const name=names?.[item.id]??item.menuItem?.name??'Artículo';const qty=quantities[item.id]||0;return <div key={item.id} className="flex flex-wrap items-center gap-2 p-3">
      <Checkbox aria-label={`Seleccionar ${name}`} checked={qty>0} onCheckedChange={checked=>set(item,checked?1:0)}/>
      {onNameChange?<Input aria-label={`Descripción ${item.menuItem?.name||'artículo'}`} value={name} onChange={e=>onNameChange(item.id,e.target.value)} className="flex-1 min-w-28 h-8" data-testid={`input-invoice-description-${item.id}`}/>:<span className="flex-1 min-w-28 text-sm">{name}</span>}
      <span className="text-xs text-muted-foreground">Disponibles: {item.quantity}</span>
      <div className="flex items-center gap-1"><Button type="button" variant="outline" size="sm" aria-label={`Quitar una unidad de ${name}`} disabled={!qty} onClick={()=>set(item,qty-1)}>−</Button><Input aria-label={`Cantidad de ${name}`} type="number" min="0" max={item.quantity} step="1" value={qty} onChange={e=>set(item,Number(e.target.value))} className="w-16 h-8 text-center"/><Button type="button" variant="outline" size="sm" aria-label={`Agregar una unidad de ${name}`} disabled={qty>=item.quantity} onClick={()=>set(item,qty+1)}>+</Button></div>
      <span className="text-sm font-medium">${money(qty?restaurantPortionCents(item.subtotal,item.quantity,Math.min(qty,item.quantity)):0)}</span>
    </div>;})}
   </div>
   <div role="status" className="text-sm flex flex-wrap justify-between gap-2"><strong>Seleccionado: ${money(total)}</strong><span>Queda pendiente: ${money(pending)}</span></div>
 </div>;
}
