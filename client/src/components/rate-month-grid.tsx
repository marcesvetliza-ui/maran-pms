import {useState} from 'react';
import {calendarAddDays,calendarDays,type CalendarCell} from '@shared/rate-calendar';
import {Button} from '@/components/ui/button';
export function RateMonthGrid({month,cells,range,canEdit,onMonth,onRange,occupancy}:{month:string;cells:CalendarCell[];range:{from:string;to:string};canEdit:boolean;onMonth:(month:string)=>void;onRange:(from:string,to:string)=>void;occupancy:string}) {
 const [anchor,setAnchor]=useState<string|null>(null);
 const first=month.slice(0,7)+'-01',end=new Date(Date.UTC(Number(first.slice(0,4)),Number(first.slice(5,7)),0)).toISOString().slice(0,10);
 const start=calendarAddDays(first,-((new Date(first+'T12:00:00Z').getUTCDay()+6)%7));
 const slots=calendarDays(start,calendarAddDays(start,41));
 const move=(n:number)=>{onMonth(new Date(Date.UTC(Number(first.slice(0,4)),Number(first.slice(5,7))-1+n,1)).toISOString().slice(0,10));};
 return <div className="rounded-xl border bg-white dark:bg-card p-3 sm:p-5 space-y-4">
 <div className="flex items-center justify-between"><Button variant="outline" size="icon" aria-label="Mes anterior" onClick={()=>move(-1)}>‹</Button><h3 className="font-semibold capitalize">{new Date(first+'T12:00:00Z').toLocaleDateString('es-AR',{month:'long',year:'numeric',timeZone:'UTC'})}</h3><Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={()=>move(1)}>›</Button></div>
 <div className="grid grid-cols-7 gap-1 sm:gap-2">{['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'].map(day=><div key={day} className="py-1 text-center text-[10px] sm:text-xs font-medium text-muted-foreground">{day}</div>)}
 {slots.map(date=>{const inMonth=date>=first&&date<=end,cell=cells.find(c=>c.date===date),selected=canEdit&&date>=range.from&&date<=range.to;
 const rate=occupancy?cell?.occupancyRates?.[occupancy]:cell?.rate;
 const price=rate==null?'Sin precio':new Intl.NumberFormat('es-AR',{style:'currency',currency:cell!.currency,minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(rate));
 return <button key={date} type="button" aria-label={`${date}: ${inMonth?(cell?price:'Sin datos'):'otro mes'}`} aria-pressed={selected} disabled={!canEdit||!inMonth||!cell||!cell.isValidDate} onClick={()=>{if(anchor){onRange(anchor<date?anchor:date,anchor<date?date:anchor);setAnchor(null);}else{setAnchor(date);onRange(date,date);}}} className={`min-h-[76px] sm:min-h-[92px] min-w-0 rounded-lg border p-1 sm:p-2 text-center flex flex-col items-center justify-center gap-1 ${!inMonth?'bg-muted/40 text-muted-foreground/40':selected?'border-primary bg-primary/10':cell?.stopSell?'border-red-200 bg-red-50 text-red-900':'bg-background hover:border-primary/50'} disabled:cursor-default`}>
 <span className="text-xs sm:text-sm font-medium">{Number(date.slice(-2))}</span>{inMonth&&<><span className="text-[9px] sm:text-xs font-medium break-all">{cell?price:'Sin datos'}</span>{cell?.stopSell&&<span className="rounded bg-red-100 px-1 text-[9px] text-red-800">Cerrado</span>}{cell&&!cell.stopSell&&cell.minStayArrival>1&&<span className="rounded bg-amber-100 px-1 text-[9px] text-amber-900">Mín. llegada {cell.minStayArrival}</span>}{cell&&cell.minStayThrough>1&&<span className="text-[9px] text-amber-800">Mín. estadía {cell.minStayThrough}</span>}{cell&&!cell.isValidDate&&<span className="text-[9px]">Fuera de vigencia</span>}{cell?.closedToArrival&&<span className="text-[9px]">Sin llegadas</span>}{cell?.closedToDeparture&&<span className="text-[9px]">Sin salidas</span>}</>}
 </button>;})}</div>
 <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span>● Rango seleccionado</span><span className="text-red-800">● Venta cerrada</span><span className="text-amber-800">● Mínimo de noches</span></div>
 {canEdit&&<p className="text-xs text-muted-foreground">{anchor?'Elegí el último día del período (inclusive).':'Elegí el primer y último día para editar un período. Seleccionar fechas no guarda cambios.'}</p>}
 </div>;
}
