import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { INVENTORY_UNITS } from '@shared/inventoryUnits';
import { apiRequest, queryClient, parseApiError } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

type Preview = {
  token:string;oldUnit:string;newUnit:string;stock:string;costPrice:string|null;
  warehouses:Array<{warehouseId:string;stock:string}>;
  affected:Record<string,number>;
};
export function InventoryUnitCorrection({item,onClose}:{item:{id:string;name:string;unit:string};onClose:()=>void}) {
  const [unit,setUnit]=useState('');
  const [reason,setReason]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [error,setError]=useState('');
  const {toast}=useToast();
  const inspect=useMutation({mutationFn:async()=>{
    const response=await apiRequest('POST',`/api/inventory/items/${item.id}/unit-correction/preview`,{newUnit:unit});
    return response.json() as Promise<Preview>;
  },onSuccess:value=>{setPreview(value);setError('');},onError:e=>{setPreview(null);setError(parseApiError(e));}});
  const apply=useMutation({mutationFn:async()=>{
    await apiRequest('POST',`/api/inventory/items/${item.id}/unit-correction/apply`,{newUnit:unit,reason,mode:'label_only',token:preview?.token});
  },onSuccess:()=>{
    queryClient.invalidateQueries();
    toast({title:'Unidad corregida',description:'Se conservaron cantidades y costos. El cambio quedó registrado.'});onClose();
  },onError:e=>{setPreview(null);setConfirmed(false);setError(parseApiError(e));}});
  const pending=inspect.isPending||apply.isPending;
  return <Dialog open onOpenChange={open=>{if(!open&&!pending)onClose();}}><DialogContent className="max-w-xl">
    <DialogHeader><DialogTitle>Corregir unidad · {item.name}</DialogTitle></DialogHeader>
    <p className="text-sm">Para artículos cuya unidad estaba mal cargada. Los números de stock, mínimos y costos se conservan; no convierte envases ni cantidades.</p>
    <label className="space-y-1">Unidad correcta
      <select aria-label="Unidad correcta" className="block w-full border rounded p-2 bg-background" value={unit} disabled={pending} onChange={e=>{setUnit(e.target.value);setPreview(null);setConfirmed(false);setError('');}}>
        <option value="">Elegir…</option>{INVENTORY_UNITS.filter(value=>value!==item.unit).map(value=><option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    <Button variant="outline" disabled={!unit||pending} onClick={()=>inspect.mutate()}>Revisar cambio</Button>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {preview&&<div className="space-y-3 rounded border p-3 text-sm">
      <p><strong>{preview.oldUnit} → {preview.newUnit}</strong></p>
      <p>Stock: {preview.stock} {preview.oldUnit} → {preview.stock} {preview.newUnit}</p>
      {preview.costPrice!=null&&<p>Costo: ${preview.costPrice}/{preview.oldUnit} → ${preview.costPrice}/{preview.newUnit}</p>}
      <p>{preview.warehouses.length} depósitos. Cantidades por depósito y mínimos sin cambios.</p>
      <p>Referencias revisadas: {preview.affected.recipes} ingredientes, {preview.affected.productionFormulas} fórmulas, {preview.affected.treatments} insumos SPA, {preview.affected.openCounts} filas de conteos abiertos y {preview.affected.pendingConsumptions} consumos pendientes.</p>
      <p>Se actualiza la etiqueta en las referencias vigentes que usen la unidad anterior. Los documentos históricos se conservan. Queda historial con la unidad anterior y el motivo.</p>
      <label className="block">Motivo obligatorio<textarea aria-label="Motivo de corrección de unidad" className="block w-full border rounded p-2 bg-background" value={reason} disabled={pending} onChange={e=>setReason(e.target.value)} /></label>
      <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={pending} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo que sólo estaba mal la unidad y que estos números ya son correctos.</label>
    </div>}
    <DialogFooter><Button variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button><Button disabled={!preview||!reason.trim()||!confirmed||pending} onClick={()=>apply.mutate()}>Confirmar corrección</Button></DialogFooter>
  </DialogContent></Dialog>;
}
