import {useEffect,useState} from 'react';
import {packageConversions} from '@shared/inventoryPackage';
import {useMutation,useQuery} from '@tanstack/react-query';
import {apiRequest,queryClient} from '@/lib/queryClient';
import {InventoryButton as Button} from './inventory-access';
import {Input} from '@/components/ui/input';
import {useToast} from '@/hooks/use-toast';
/** Strip decimal padding as text: never round a small conversion factor. */
export function trimEquivalenceFactor(value:string):string {
 return /^\d+(?:\.\d+)?$/.test(value) ? value.replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'') : value;
}
export type InventoryConversionDraft = {fromUnit:string;factor:string};
export function InventoryUnitConversions({itemId,stockUnit,value,onChange}:{itemId?:string;stockUnit:string;value?:InventoryConversionDraft[];onChange?:(rows:InventoryConversionDraft[])=>void}){
 const [packageUnit,setPackageUnit]=useState('unidad');
 const [contentUnit,setContentUnit]=useState('g');
 const [content,setContent]=useState('');
 const [contentMessage,setContentMessage]=useState('');
 const stockIsPackage=['unidad','caja','paquete'].includes(stockUnit);
 const selectedPackage=stockIsPackage?stockUnit:packageUnit;
 const {toast}=useToast();const [savedRows,setSavedRows]=useState<InventoryConversionDraft[]>([]);
 const rows=value??savedRows;const setRows=onChange??setSavedRows;
 const key=[`/api/inventory/items/${itemId}/unit-conversions`];const {data,isLoading,isError}=useQuery<Array<{fromUnit:string;factor:string}>>({queryKey:key,enabled:!!itemId});
 useEffect(()=>{if(data)setRows(data.map(row=>({...row,factor:trimEquivalenceFactor(row.factor)})));},[data]);
 const save=useMutation({mutationFn:()=>apiRequest('PUT',key[0],{conversions:rows}),onSuccess:()=>{queryClient.invalidateQueries({queryKey:key});toast({title:'Equivalencias guardadas'});},onError:(e:any)=>toast({title:'No se pudieron guardar las equivalencias',description:e.message,variant:'destructive'})});
 return <div className="space-y-2 border rounded p-3"><p className="font-medium">Equivalencias del artículo</p><p className="text-sm text-muted-foreground">Las equivalencias de abajo se leen: 1 unidad elegida equivale a la cantidad indicada de {stockUnit}. El costo del artículo siempre es por {stockUnit}. {!itemId && "Se guardan junto con el artículo."} Kilos/gramos y litros/mililitros se convierten automáticamente.</p>{itemId && isLoading?<p>Cargando…</p>:isError?<p>No se pudieron cargar las equivalencias.</p>:<><fieldset className="space-y-2 border rounded p-2"><legend className="text-sm font-medium">Contenido del envase</legend>
 <div className="flex flex-wrap items-center gap-2"><span>1</span><select aria-label="Tipo de envase" value={selectedPackage} disabled={stockIsPackage} onChange={e=>setPackageUnit(e.target.value)}>{['unidad','caja','paquete'].map(u=><option key={u}>{u}</option>)}</select><span>contiene</span><Input aria-label="Contenido del envase" className="w-28" inputMode="decimal" value={content} onChange={e=>{setContent(e.target.value);setContentMessage('');}}/><select aria-label="Unidad del contenido" value={contentUnit} onChange={e=>setContentUnit(e.target.value)}>{['g','kg','ml','litro'].map(u=><option key={u}>{u}</option>)}</select>
 <Button permission="catalog" type="button" variant="outline" onClick={()=>{
  try {
   const converted=packageConversions(stockUnit,selectedPackage,contentUnit,Number(content.replace(',','.')));
   setRows([...rows.filter(row=>!converted.some(next=>next.fromUnit===row.fromUnit)),...converted]);
   setContentMessage('Contenido aplicado a las equivalencias. Falta guardar.');
  } catch(error) { setContentMessage((error as Error).message); }
 }}>Usar este contenido</Button></div>
 <p className="text-xs text-muted-foreground">Ejemplo: 1 unidad contiene 3000 g. Ingresá 3000 sin separador de miles. Esto define el contenido, no el precio.</p>
 {contentMessage && <p role="status" className="text-sm">{contentMessage}</p>}
 </fieldset>{rows.map((row,index)=><div key={index} className="space-y-1"><div className="flex items-center gap-2"><select aria-label={`Unidad de equivalencia ${index+1}`} value={row.fromUnit} onChange={e=>setRows(rows.map((r,i)=>i===index?{...r,fromUnit:e.target.value}:r))}>{['unidad','kg','g','litro','ml','caja','paquete','docena'].filter(u=>u!==stockUnit).map(u=><option key={u}>{u}</option>)}</select><Input aria-label={`Factor de equivalencia ${index+1}`} type="text" inputMode="decimal" value={row.factor.replace(/\./g,',')} onChange={e=>setRows(rows.map((r,i)=>i===index?{...r,factor:e.target.value.replace(/,/g,'.')}:r))}/><Button permission="catalog" type="button" variant="ghost" onClick={()=>setRows(rows.filter((_,i)=>i!==index))}>Quitar</Button></div>{row.factor && <p className="text-xs text-muted-foreground">1 {row.fromUnit} equivale a {trimEquivalenceFactor(row.factor).replace(/\./g,',')} {stockUnit==='unidad' && Number(row.factor)!==1 ? 'unidades' : stockUnit}</p>}</div>)}<div className="flex gap-2"><Button permission="catalog" type="button" variant="outline" onClick={()=>setRows([...rows,{fromUnit:stockUnit==='caja'?'unidad':'caja',factor:''}])}>Agregar equivalencia</Button>{itemId && <Button permission="catalog" type="button" disabled={save.isPending} onClick={()=>save.mutate()}>Guardar equivalencias</Button>}</div></>}</div>;
}
