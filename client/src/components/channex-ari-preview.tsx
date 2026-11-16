import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiRequest,parseApiError} from '@/lib/queryClient';
import {Button} from '@/components/ui/button';
type Value={date_from:string;date_to:string;room_type_id?:string;rate_plan_id?:string;availability?:number;rate?:string;rates?:{occupancy:number;rate:string}[];stop_sell?:boolean;min_stay_arrival?:number;max_stay?:number;closed_to_arrival?:boolean;closed_to_departure?:boolean};
type Preview={checkedAt:string;from:string;through:string;currency:string;rooms:{number:string;category:string}[];categories:{id:string;name:string}[];plans:{id:string;name:string;localName:string}[];availability:Value[];restrictions:Value[]};
const money=(value:string,currency:string)=>new Intl.NumberFormat('es-AR',{style:'currency',currency}).format(Number(value));
export function ChannexAriPreview({connectionId}:{connectionId:string}){
 const [requested,setRequested]=useState(false);
 const query=useQuery<Preview>({queryKey:['/api/channex/connections',connectionId,'ari','preview'],enabled:requested,retry:false,refetchOnWindowFocus:false,
  queryFn:async()=>(await apiRequest('GET',`/api/channex/connections/${encodeURIComponent(connectionId)}/ari/preview`)).json()});
 return <section className="rounded border p-3 space-y-3">
  <p className="font-medium">Vista previa de disponibilidad y tarifas</p>
  <p className="text-sm">Calcula los valores actuales del alcance seleccionado para 500 días. No activa la conexión, no reintenta eventos ni envía datos a Channex.</p>
  <Button variant="outline" disabled={query.isFetching} onClick={()=>requested?void query.refetch():setRequested(true)}>{query.isFetching?'Calculando vista previa…':'Ver valores actuales sin enviar'}</Button>
  {query.error?<p role="alert">{parseApiError(query.error)}</p>:query.data&&!query.isFetching&&<>
   <p>Habitaciones incluidas: {query.data.rooms.map(r=>r.number).join(', ')||'Ninguna'} · Moneda {query.data.currency}</p>
   <p className="text-sm">Período: {query.data.from} → {query.data.through}. Consulta: {new Date(query.data.checkedAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})}.</p>
   <p className="text-sm">Esta vista muestra valores locales completos. El despachador puede enviar solo diferencias y campos afectados por cada evento. No confirma su recepción en Channex o Booking.</p>
   <details open><summary>Disponibilidad por categoría</summary><div className="overflow-auto max-h-96"><table className="w-full text-sm"><thead><tr><th>Categoría</th><th>Desde</th><th>Hasta</th><th>Disponibles</th></tr></thead><tbody>{query.data.availability.map((v,i)=><tr key={i}><td>{query.data!.categories.find(c=>c.id===v.room_type_id)?.name||v.room_type_id}</td><td>{v.date_from}</td><td>{v.date_to}</td><td>{v.availability}</td></tr>)}</tbody></table></div></details>
   <details open><summary>Tarifas y restricciones</summary><div className="overflow-auto max-h-96"><table className="w-full text-sm"><thead><tr><th>Tarifa</th><th>Desde</th><th>Hasta</th><th>Precio por habitación y noche</th><th>Stop Sell</th><th>Estadía mín./máx.</th><th>Cierre llegada/salida</th></tr></thead><tbody>{query.data.restrictions.map((v,i)=><tr key={i}><td>{query.data!.plans.find(p=>p.id===v.rate_plan_id)?.name||v.rate_plan_id}</td><td>{v.date_from}</td><td>{v.date_to}</td><td>{v.rates?v.rates.map(r=>`${r.occupancy} persona(s): ${money(r.rate,query.data!.currency)}`).join(' · '):v.rate?money(v.rate,query.data!.currency):'Sin precio'}</td><td>{v.stop_sell===true?'Cerrado':v.stop_sell===false?'Abierto':'Sin dato'}</td><td>{v.min_stay_arrival??'—'} / {v.max_stay||'Sin máximo'}</td><td>{v.closed_to_arrival?'Sí':'No'} / {v.closed_to_departure?'Sí':'No'}</td></tr>)}</tbody></table></div></details>
  </>}
 </section>;
}
