import {useMemo, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {comparePurchasePrices} from '@/lib/purchase-price-comparison';
const number = (n: number | null) => n === null ? '—' : n.toLocaleString('es-AR',{maximumFractionDigits:2,minimumFractionDigits:2});
const escape = (s: unknown) => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function InventoryPriceComparison() {
  const {data=[],isLoading,isError}=useQuery<any[]>({queryKey:['/api/inventory/price-history-comparison']});
  const [search,setSearch]=useState(''),[area,setArea]=useState(''),[group,setGroup]=useState(''),[category,setCategory]=useState(''),[supplier,setSupplier]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
  const history=useMemo(()=>comparePurchasePrices(data),[data]);
  const filtered=history.filter(r=>(!search||`${r.item_name} ${r.item_sku||''}`.toLowerCase().includes(search.toLowerCase()))&&(!area||r.area===area)&&(!group||r.grouping===group)&&(!category||r.category===category)&&(!supplier||r.supplier===supplier)&&(!from||String(r.fecha_emision).slice(0,10)>=from)&&(!to||String(r.fecha_emision).slice(0,10)<=to));
  const latest=new Map<string,any>();
  filtered.forEach(r=>{if (!r.free && r.price !== null) latest.set(`${r.item_id}:${r.tipo_comprobante === 'FACT-B' ? 'final' : 'neto'}`,r);});
  const rows=[...latest.values()].filter(r=>r.delta!==null && Math.abs(r.delta)>0.00001);
  const columns=['Artículo / SKU','Unidad','Precio anterior','Último precio','Variación $','Variación %','Fecha','Proveedor'];
  const values=(r:any)=>[`${r.item_name}${r.item_sku?' · '+r.item_sku:''}`,r.stock_unit,number(r.before),number(r.price),number(r.delta),number(r.percent)+'%',String(r.fecha_emision).slice(0,10),r.supplier];
  const exportRows=()=>{
    const csv='\ufeff'+[columns,...rows.map(values)].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='comparacion-precios.csv';a.click();URL.revokeObjectURL(url);
  };
  const print=()=>{
    const popup=window.open('','_blank');if(!popup)return;
    popup.document.write(`<html><head><title>Comparación de precios</title><style>body{font:12px Arial}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left}@page{size:A4 landscape}</style></head><body><h1>Comparación de precios</h1><p>${escape([search,area,group,category,supplier,from&&'Desde '+from,to&&'Hasta '+to].filter(Boolean).join(' · ')||'Todos los artículos')}</p><table><thead><tr>${columns.map(c=>`<th>${escape(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${values(r).map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);popup.document.close();popup.focus();popup.print();
  };
  return <div className="space-y-4">
    <div><h2 className="text-lg font-semibold">Comparación de precios</h2><p className="text-sm text-muted-foreground">Últimas variaciones de compra por unidad de stock. A y C se comparan por separado de B, que incluye IVA. Las compras sin cargo no reemplazan el costo vigente. El orden corresponde al registro de las compras.</p></div>
    <div className="flex flex-wrap gap-3 rounded-xl border bg-muted/20 p-4">
      <Input aria-label="Artículo o SKU" placeholder="Artículo o SKU" value={search} onChange={e=>setSearch(e.target.value)} className="w-60"/>
      {([['Área','area',area,setArea],['Agrupamiento','grouping',group,setGroup],['Subagrupamiento','category',category,setCategory],['Proveedor','supplier',supplier,setSupplier]] as const).map(([label,key,value,set])=><label key={key} className="text-xs text-muted-foreground">{label}<select aria-label={label} value={value} onChange={e=>set(e.target.value)} className="ml-2 h-9 rounded-md border bg-background px-2 text-sm text-foreground"><option value="">Todos</option>{[...new Set(data.map(r=>r[key]).filter(Boolean))].sort().map(v=><option key={v} value={v}>{v}</option>)}</select></label>)}
      <label className="text-xs">Desde<Input aria-label="Desde" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-xs">Hasta<Input aria-label="Hasta" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <Button variant="outline" onClick={print} disabled={!rows.length}>Imprimir listado</Button><Button variant="outline" onClick={exportRows} disabled={!rows.length}>Exportar filtrado</Button>
    </div>
    {isLoading?<p>Cargando compras…</p>:isError?<p role="alert">No se pudo cargar la comparación de precios.</p>:<div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{columns.map(c=><th key={c} className="p-3 text-left">{c}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t">{values(r).map((v,i)=><td key={i} className={`p-3 ${i===4?(r.delta>0?'text-red-600':'text-green-600'):''}`}> {i===0?<details><summary className="cursor-pointer font-medium">{v}</summary><div className="mt-2 min-w-60 space-y-2">{filtered.filter(h=>h.item_id===r.item_id).slice().reverse().map(h=><p key={h.id} className="rounded-md bg-muted/30 p-2 text-xs">{String(h.fecha_emision).slice(0,10)} · {h.supplier}<br/>{h.tipo_comprobante} {h.numero_comprobante} · {h.quantity} {h.input_unit||'Unidad no registrada'} · ${number(Number(h.unit_price))}{h.free?' · Sin cargo':''}</p>)}</div></details>:v}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="p-6 text-muted-foreground">No hay variaciones comparables con estos filtros.</p>}</div>}
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Historial de compras ({filtered.length})</summary><div className="mt-3 space-y-2">{filtered.slice().reverse().map(r=><div key={r.id} className="rounded-lg bg-muted/30 p-3 text-sm"><strong>{r.item_name}</strong><p>{String(r.fecha_emision).slice(0,10)} · {r.supplier} · {r.tipo_comprobante} {r.numero_comprobante}</p><p>{r.quantity} {r.input_unit||'Unidad no registrada'} · Precio informado: ${number(Number(r.unit_price))}{r.free?' · Bonificación / sin cargo':r.price===null?' · Sin conversión registrada':` · Por ${r.stock_unit}: $${number(r.price)}`}</p></div>)}</div></details>
  </div>;
}
