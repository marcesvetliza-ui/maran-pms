import {useEffect,useState} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import {apiRequest,queryClient} from '@/lib/queryClient';
import {InventoryButton as Button} from './inventory-access';
import {Input} from '@/components/ui/input';
import {useToast} from '@/hooks/use-toast';
export function InventoryUnitConversions({itemId,stockUnit}:{itemId:string;stockUnit:string}){
 const {toast}=useToast();const [rows,setRows]=useState<Array<{fromUnit:string;factor:string}>>([]);
 const key=[`/api/inventory/items/${itemId}/unit-conversions`];const {data,isLoading,isError}=useQuery<Array<{fromUnit:string;factor:string}>>({queryKey:key});
 useEffect(()=>{if(data)setRows(data);},[data]);
 const save=useMutation({mutationFn:()=>apiRequest('PUT',key[0],{conversions:rows}),onSuccess:()=>{queryClient.invalidateQueries({queryKey:key});toast({title:'Equivalencias guardadas'});},onError:(e:any)=>toast({title:'No se pudieron guardar las equivalencias',description:e.message,variant:'destructive'})});
 return <div className="space-y-2 border rounded p-3"><p className="font-medium">Equivalencias del artículo</p><p className="text-sm text-muted-foreground">Una unidad de compra o consumo equivale a esta cantidad de {stockUnit}. Kilos/gramos y litros/mililitros se convierten automáticamente.</p>{isLoading?<p>Cargando…</p>:isError?<p>No se pudieron cargar las equivalencias.</p>:<>{rows.map((row,index)=><div key={index} className="flex gap-2"><select aria-label={`Unidad de equivalencia ${index+1}`} value={row.fromUnit} onChange={e=>setRows(rows.map((r,i)=>i===index?{...r,fromUnit:e.target.value}:r))}>{['unidad','kg','g','litro','ml','caja','paquete','docena'].filter(u=>u!==stockUnit).map(u=><option key={u}>{u}</option>)}</select><Input aria-label={`Factor de equivalencia ${index+1}`} type="number" min="0.000000001" step="any" value={row.factor} onChange={e=>setRows(rows.map((r,i)=>i===index?{...r,factor:e.target.value}:r))}/><Button permission="catalog" type="button" variant="ghost" onClick={()=>setRows(rows.filter((_,i)=>i!==index))}>Quitar</Button></div>)}<div className="flex gap-2"><Button permission="catalog" type="button" variant="outline" onClick={()=>setRows([...rows,{fromUnit:stockUnit==='caja'?'unidad':'caja',factor:''}])}>Agregar equivalencia</Button><Button permission="catalog" type="button" disabled={save.isPending} onClick={()=>save.mutate()}>Guardar equivalencias</Button></div></>}</div>;
}
