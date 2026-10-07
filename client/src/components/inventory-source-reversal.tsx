import {useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {apiRequest,queryClient} from '@/lib/queryClient';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {useToast} from '@/hooks/use-toast';
const supported=['purchase_invoice','internal_movement','production_run','spa_account_item','restaurant_order','spa_account'];
export function InventorySourceReversal({sourceType,sourceId,pending=false}:{sourceType?:string|null;sourceId?:string|null;pending?:boolean}){
 const [open,setOpen]=useState(false),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false);const {toast}=useToast();
 const reverse=useMutation({mutationFn:async()=> (await apiRequest('POST','/api/inventory/source-stock-reversals',{sourceType,sourceId,reason})).json(),onSuccess:()=>{for(const key of ['/api/inventory/items','/api/inventory/movements','/api/inventory/pending-consumptions','/api/inventory/warehouse-stock'])queryClient.invalidateQueries({queryKey:[key]});setOpen(false);toast({title:pending?'Consumo pendiente cancelado':'Movimientos de stock revertidos'});},onError:(e:any)=>toast({title:'No se pudo revertir',description:e.message,variant:'destructive'})});
 if(!sourceId || !sourceType || !supported.includes(sourceType))return null;
 return <><Button variant="outline" size="sm" onClick={()=>{setReason('');setConfirmed(false);setOpen(true);}}>{pending?'Cancelar pendiente':'Revertir stock del documento'}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{pending?'Cancelar consumo pendiente':'Revertir stock del documento completo'}</DialogTitle><DialogDescription>{pending?'Cancela el descuento pendiente sin agregar existencias.':'Revierte todos los movimientos de este documento en sus depósitos originales. Una producción devuelve insumos y retira el elaborado; una compra retira la mercadería recibida. Revisá que corresponda al movimiento físico.'} La operación financiera se conserva; devoluciones de dinero y comprobantes se gestionan en su área.</DialogDescription></DialogHeader><p className="text-sm break-all">{sourceType} · {sourceId}</p><Input aria-label="Motivo de reversión" placeholder="Motivo obligatorio" value={reason} onChange={e=>setReason(e.target.value)}/><label className="flex gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={value=>setConfirmed(value===true)} aria-label="Confirmar reversión del documento"/>{pending?'Confirmo que este consumo no debe realizarse.':'Confirmo que se debe revertir el stock de todo el documento.'}</label><Button variant="destructive" disabled={!confirmed || reason.trim().length<3 || reverse.isPending} onClick={()=>reverse.mutate()}>Confirmar {pending?'cancelación':'reversión'}</Button></DialogContent></Dialog></>;
}
