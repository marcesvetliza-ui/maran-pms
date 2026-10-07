import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Input} from '@/components/ui/input';
export function HousekeepingInventory() {
  const {data=[],isLoading,isError}=useQuery<any[]>({queryKey:['/api/housekeeping/inventory']});
  const [search,setSearch]=useState(''),[category,setCategory]=useState(''),[active,setActive]=useState('active');
  const rows=data.filter(i=>(active==='all'||(active==='active'?i.isActive!=='false':i.isActive==='false'))&&(!category||i.categoryId===category)&&`${i.name} ${i.sku||''}`.toLowerCase().includes(search.toLowerCase()));
  const categories=[...new Map(data.filter(i=>i.category).map(i=>[i.categoryId,i.category])).values()];
  const costs=data.some(i=>i.costPrice!=null);
  const number=(n:any)=>Number(n||0).toLocaleString('es-AR',{maximumFractionDigits:3});
  return <section className="space-y-4 mt-4">
    <div><h2 className="text-lg font-semibold">Inventario Housekeeping</h2><p className="text-sm text-muted-foreground">Artículos del área Housekeeping y sus existencias actuales en todos los depósitos.</p></div>
    <div className="flex flex-wrap gap-3 rounded-xl border bg-muted/20 p-4">
      <Input className="max-w-sm" placeholder="Buscar artículo o SKU…" aria-label="Buscar artículo de Housekeeping" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Subagrupamiento" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todos los subagrupamientos</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className="h-9 rounded-md border bg-background px-3 text-sm" aria-label="Estado del artículo" value={active} onChange={e=>setActive(e.target.value)}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></select>
    </div>
    {isLoading?<p>Cargando inventario…</p>:isError?<p role="alert">No se pudo cargar el inventario.</p>:<div className="overflow-x-auto rounded-xl border"><div className="border-b px-4 py-2 text-xs text-muted-foreground">{rows.length} artículos</div><table className="w-full text-sm"><thead className="bg-muted/40"><tr>{['Artículo','Subagrupamiento','Stock','Mínimo',...(costs?['Costo unitario']:[])].map(t=><th key={t} className="p-3 text-left">{t}</th>)}</tr></thead><tbody>{rows.map(i=><tr key={i.id} className="border-t"><td className="p-3 font-medium">{i.name}{i.sku&&<p className="text-xs font-normal text-muted-foreground">SKU: {i.sku}</p>}</td><td className="p-3">{i.category?.name||'Sin subagrupamiento'}</td><td className="p-3 tabular-nums">{number(i.currentStock)} {i.unit}</td><td className="p-3 tabular-nums">{number(i.minStock)}</td>{costs&&<td className="p-3 tabular-nums">{i.costPrice==null?'—':Number(i.costPrice).toLocaleString('es-AR',{style:'currency',currency:'ARS'})}</td>}</tr>)}</tbody></table>{!rows.length&&<p className="p-6 text-muted-foreground">No hay artículos con estos filtros.</p>}</div>}
  </section>;
}
