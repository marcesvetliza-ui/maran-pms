import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
import {RatePlanFormDialog} from '@/pages/rate-plans';
import type {RatePlanWithRoomType,RoomType} from '@shared/schema';
export function ChannexUsdPlans({plans,roomTypes,onCalendar}:{plans:RatePlanWithRoomType[];roomTypes:RoomType[];onCalendar:()=>void}){
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<RatePlanWithRoomType|undefined>();
 const usd=plans.filter(p=>p.currency==='USD');
 const money=(v:string|null)=>v==null?'—':new Intl.NumberFormat('es-AR',{style:'currency',currency:'USD',currencyDisplay:'code'}).format(Number(v));
 return <Card><CardHeader><div className="flex flex-wrap justify-between gap-3"><div><CardTitle>Tarifas de canales en USD</CardTitle><p className="mt-2 text-sm text-muted-foreground">Cargá aquí los precios en dólares una sola vez. Channex recibe los cambios del plan vinculado. Las tarifas de recepción y venta directa se mantienen en ARS.</p></div><Button onClick={()=>{setEditing(undefined);setOpen(true);}}>Nueva tarifa USD</Button></div></CardHeader><CardContent className="space-y-4">
 <p className="text-sm">Vinculá cada plan una vez con su tarifa USD de Channex. Después, los cambios de precios se hacen desde el PMS; no hace falta repetirlos en Channex ni convertirlos desde ARS.</p>
 {usd.length?<div className="space-y-3">{usd.map(plan=><article key={plan.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{plan.roomType?.name} · {plan.name}</h3><p className="text-sm">Base: {money(plan.baseRate)}{[1,2,3,4].map(pax=>{const value=plan[`rate${pax}pax` as keyof typeof plan] as string|null;return value!=null?<span key={pax}> · {pax} persona(s): {money(value)}</span>:null;})}</p></div><Button variant="outline" onClick={()=>{setEditing(plan);setOpen(true);}}>Editar tarifa USD</Button></div></article>)}</div>:<p>Todavía no hay planes USD. Creá el primero con los importes que querés vender en los canales.</p>}
 <Button variant="outline" disabled={!usd.length} onClick={onCalendar}>Editar fechas y restricciones</Button>
 <RatePlanFormDialog channelUsd ratePlan={editing} roomTypes={roomTypes} open={open} onOpenChange={setOpen} onSuccess={()=>{}}/>
 </CardContent></Card>;
}
