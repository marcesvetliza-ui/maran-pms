import {PURCHASE_CREDIT_NOTE_PAYMENT_METHODS} from '@shared/purchase-credit-note-payment';
import {useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {apiRequest,queryClient,parseApiError} from '@/lib/queryClient';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Select,SelectTrigger,SelectContent,SelectItem,SelectValue} from '@/components/ui/select';
import {Button} from '@/components/ui/button';
type Invoice={id:number;tipoComprobante:string;numeroComprobante:string;puntoVenta?:string|number;fechaEmision:string;periodo?:string;proveedorNombre?:string;supplierNombre?:string;montoTotal:string;metadataVersion?:string|null;formaPagoInformativa?:string|null;observaciones?:string};
export function PurchaseInvoiceMetadataDialog({invoice,onClose}:{invoice:Invoice;onClose:()=>void}){
 const [form,setForm]=useState({puntoVenta:String(invoice.puntoVenta??''),numeroComprobante:invoice.numeroComprobante,fechaEmision:invoice.fechaEmision,observaciones:invoice.observaciones||'',motivo:''});
 const [paymentInfo,setPaymentInfo]=useState(invoice.formaPagoInformativa??'cuenta_corriente');
 const change=(key:keyof typeof form,value:string)=>setForm(prev=>({...prev,[key]:value}));
 const action=useMutation({mutationFn:async()=>{
  const response=await apiRequest('PATCH',`/api/purchase-invoices/${invoice.id}/metadata`,{...form,...(invoice.tipoComprobante.startsWith('NC-')?{formaPagoInformativa:paymentInfo}:{}),expectedVersion:invoice.metadataVersion??null});return response.json();
 },onSuccess:async()=>{await Promise.all(['/api/purchase-invoices','/api/accounting-suppliers','/api/accounting-suppliers/cuenta-corriente','/api/payment-orders'].map(key=>queryClient.invalidateQueries({queryKey:[key]})));onClose();}});
 const valid=/^\d{1,5}$/.test(form.puntoVenta)&&/^\d{1,8}$/.test(form.numeroComprobante)&&Number(form.numeroComprobante)>0&&form.fechaEmision&&form.motivo.trim().length>=3;
 return <Dialog open onOpenChange={open=>{if(!open&&!action.isPending)onClose();}}><DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Corregir datos del comprobante</DialogTitle></DialogHeader>
  <div className="space-y-4">
   <p className="text-sm">{invoice.tipoComprobante} · {invoice.supplierNombre||invoice.proveedorNombre} · Total: ${Number(invoice.montoTotal).toLocaleString('es-AR',{minimumFractionDigits:2})}</p>
   <p className="text-sm text-muted-foreground">Los importes, pagos, saldo y período contable {invoice.periodo||''} se conservan. El tipo de comprobante y el proveedor no se modifican.</p>
   <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="purchase-meta-pv">Punto de venta</Label><Input id="purchase-meta-pv" inputMode="numeric" maxLength={5} value={form.puntoVenta} onChange={e=>change('puntoVenta',e.target.value)} disabled={action.isPending}/></div><div><Label htmlFor="purchase-meta-number">Número de comprobante</Label><Input id="purchase-meta-number" inputMode="numeric" maxLength={8} value={form.numeroComprobante} onChange={e=>change('numeroComprobante',e.target.value)} disabled={action.isPending}/></div></div>
   <div><Label htmlFor="purchase-meta-date">Fecha del comprobante</Label><Input id="purchase-meta-date" type="date" value={form.fechaEmision} onChange={e=>change('fechaEmision',e.target.value)} disabled={action.isPending}/></div>
   <div><Label htmlFor="purchase-meta-notes">Observaciones</Label><Textarea id="purchase-meta-notes" value={form.observaciones} onChange={e=>change('observaciones',e.target.value)} maxLength={5000} disabled={action.isPending}/></div>
   {invoice.tipoComprobante.startsWith('NC-')&&<div><Label>Forma de pago (informativa)</Label><Select value={paymentInfo} onValueChange={setPaymentInfo} disabled={action.isPending}><SelectTrigger aria-label="Forma de pago informativa"><SelectValue/></SelectTrigger><SelectContent>{PURCHASE_CREDIT_NOTE_PAYMENT_METHODS.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Dato informativo: no registra pagos ni devoluciones.</p></div>}
   <div><Label htmlFor="purchase-meta-reason">Motivo de la corrección</Label><Textarea id="purchase-meta-reason" value={form.motivo} onChange={e=>change('motivo',e.target.value)} maxLength={500} disabled={action.isPending}/></div>
   {action.error&&<p role="alert" className="text-sm text-destructive">{parseApiError(action.error)}</p>}
  </div>
  <DialogFooter><Button variant="outline" onClick={onClose} disabled={action.isPending}>Cancelar</Button><Button onClick={()=>action.mutate()} disabled={!valid||action.isPending}>{action.isPending?'Guardando…':'Guardar corrección'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
