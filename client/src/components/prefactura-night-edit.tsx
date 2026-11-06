import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { apiRequest, parseApiError, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
export function PrefacturaNightEdit({reservationId,date,amount,total,revision,disabled,onSaved}:{reservationId:string;date:string;amount:number;total:number;revision:number;disabled:boolean;onSaved:()=>void|Promise<unknown>}){
 const [open,setOpen]=useState(false),[value,setValue]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState('');
 const [snapshot,setSnapshot]=useState({amount,total,revision});
 const access=useQuery<{canEdit:boolean}>({queryKey:['/api/reservation-edit-permission'],staleTime:0});
 const save=useMutation({mutationFn:async()=> (await apiRequest('POST',`/api/reservations/${reservationId}/accommodation-night`,{date,amount:value.replace(',','.'),expectedAmount:snapshot.amount,expectedTotal:snapshot.total,revision:snapshot.revision,reason:reason.trim()})).json(),onSuccess:async()=>{setOpen(false);await queryClient.invalidateQueries({queryKey:['/api/reservations']});await queryClient.invalidateQueries({queryKey:['/api/reservations',reservationId]});await onSaved();},onError:(e:Error)=>setError(parseApiError(e))});
 const dateText=date.split('-').reverse().join('/');
 return <><Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Editar importe de la noche ${dateText}`} disabled={disabled||access.data?.canEdit!==true} title={disabled?'La noche tiene cobertura fiscal o hay una operación pendiente':'Editar importe de esta noche'} onClick={()=>{setSnapshot({amount,total,revision});setValue(amount.toFixed(2));setReason('');setError('');setOpen(true);}}><Pencil className="h-3.5 w-3.5"/></Button>
 <Dialog open={open} onOpenChange={v=>{if(!save.isPending)setOpen(v);}}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Editar noche {dateText}</DialogTitle><DialogDescription>El importe se guarda en la reserva y recalcula el total. Los cobros registrados se conservan.</DialogDescription></DialogHeader>
 <Label htmlFor={`night-amount-${date}`}>Importe de la noche</Label><Input id={`night-amount-${date}`} value={value} inputMode="decimal" disabled={save.isPending} onChange={e=>setValue(e.target.value)}/>
 <Label htmlFor={`night-reason-${date}`}>Motivo del cambio</Label><Input id={`night-reason-${date}`} value={reason} maxLength={1000} disabled={save.isPending} onChange={e=>setReason(e.target.value)}/>
 {error&&<p role="alert" className="text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={save.isPending} onClick={()=>setOpen(false)}>Cancelar</Button><Button disabled={save.isPending||!/^\d{1,8}([.,]\d{1,2})?$/.test(value)||reason.trim().length<3} onClick={()=>save.mutate()}>{save.isPending?'Guardando…':'Guardar noche'}</Button></DialogFooter></DialogContent></Dialog></>;
}
