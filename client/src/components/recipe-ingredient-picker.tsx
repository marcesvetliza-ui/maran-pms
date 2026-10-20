import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { FlaskConical, Search } from 'lucide-react';

export type IngredientRecipeOption = {
  id:string;name:string;unit:string;yield:string;yieldUnit:string;cost:number;
};
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-AR');

export function RecipeIngredientPicker({options,mode,selectedId,onSelect}:{
  options:IngredientRecipeOption[];mode:'elaboracion'|'produccion';selectedId:string;onSelect:(id:string)=>void;
}) {
  const [search,setSearch]=useState('');
  const inputId=useId();
  useEffect(()=>{if(!selectedId)setSearch('');},[selectedId]);
  const words=normalize(search).trim().split(/\s+/).filter(Boolean);
  const filtered=options.filter(option=>words.every(word=>normalize(option.name).includes(word)));
  const label=mode==='produccion'?'Buscar preparación con stock':'Buscar elaboración base';
  const selected=options.find(option=>option.id===selectedId);
  return <div className="space-y-2">
    <label className="text-sm font-medium" htmlFor={inputId}>{label}</label>
    <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true"/>
      <Input id={inputId} className="pl-9" placeholder={mode==='produccion'?'Escribí el nombre de la preparación…':'Escribí el nombre de la elaboración…'} value={search} onChange={event=>setSearch(event.target.value)} />
    </div>
    <div className="border rounded-md max-h-44 overflow-y-auto divide-y">
      {filtered.map(option=><button key={option.id} type="button" aria-pressed={selectedId===option.id}
        className={`w-full text-left p-3 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${selectedId===option.id?'bg-accent':''}`}
        onClick={()=>onSelect(option.id)}>
        <span className="flex items-center justify-between gap-2 text-sm font-medium"><span className="flex items-center gap-1"><FlaskConical className="h-4 w-4 text-violet-500"/>{option.name}</span>{selectedId===option.id&&<span className="text-xs text-violet-600">✓ Seleccionado</span>}</span>
        <span className="block text-xs text-muted-foreground mt-1">Rinde: {option.yield} {option.yieldUnit} · Costo por {option.unit}: ${option.cost.toLocaleString('es-AR',{minimumFractionDigits:4})}</span>
      </button>)}
      {!filtered.length&&<p role="status" className="p-4 text-sm text-muted-foreground">{options.length?'No hay resultados para esa búsqueda.':mode==='produccion'?'No hay preparaciones con stock disponibles.':'No hay elaboraciones base disponibles.'}</p>}
    </div>
    {selected&&<p className="text-xs text-muted-foreground">Elegido: {selected.name}</p>}
  </div>;
}
