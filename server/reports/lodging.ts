import {sql} from 'drizzle-orm';
import {db} from '../db';
import {isOperationalInventoryRoom,ACTIVE_ROOM_RESERVATION_STATUSES} from '@shared/room-availability';
import {nightlyReportPrices} from '@shared/nightlyReportPrices';

type Room={id:string;roomNumber:string;roomTypeId:string;isActive:boolean;isVirtual:boolean};
type Stay={id:string;roomId:string|null;roomTypeId:string;status:string;checkInDate:string;checkOutDate:string;totalRoomAmount:string|null;pricingScheme:string;nightlyPricing:any;specialRateReason:string|null;source:string;numberOfGuests:number};
type Block={roomId:string;blockFrom:string;blockTo:string};
export function nextDate(date:string){return new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);}
export function dateRange(from:string,to:string){
 const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 if(!valid(from)||!valid(to)||from>to)throw Object.assign(Error('Rango de fechas inválido.'),{statusCode:400});
 const length=(Date.parse(to)-Date.parse(from))/86400000+1;
 if(length>3660)throw Object.assign(Error('El rango supera diez años.'),{statusCode:400});
 return Array.from({length},(_,i)=>new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10));
}
export type LodgingNight={reservationId:string;roomId:string;roomTypeId:string;date:string;phase:'actual'|'forecast';source:string;guests:number;amount:number|null;estimated:boolean};
/** Read-only production by reservation/night. Original folios and prices never change. */
export function calculateLodging(from:string,to:string,asOf:string,rooms:Room[],stays:Stay[],blocks:Block[]){
 const dates=dateRange(from,to),physical=rooms.filter(isOperationalInventoryRoom),roomMap=new Map(physical.map(r=>[r.id,r]));
 const warnings={estimatedNights:0,missingRateNights:0,unassignedReservations:0,invalidStays:0,overlappingRoomNights:0,occupiedBlockedNights:0};
 const nights:LodgingNight[]=[];const durations=new Map<string,number>();
 for(const stay of stays){
  if(!['checked_in','checked_out',...ACTIVE_ROOM_RESERVATION_STATUSES].includes(stay.status as any))continue;
  if(!stay.roomId){warnings.unassignedReservations++;continue;}if(!roomMap.has(stay.roomId))continue;
  let stayDates:string[];try{stayDates=dateRange(stay.checkInDate,stay.checkOutDate).slice(0,-1);if(!stayDates.length)throw Error();}catch{warnings.invalidStays++;continue;}
  durations.set(stay.id,stayDates.length);
  const prices=nightlyReportPrices(stay,stayDates);
  for(const date of stayDates){
   if(date<from||date>to)continue;
   const actual=date<=asOf&&['checked_in','checked_out'].includes(stay.status);
   if(!actual&&(date<asOf||!ACTIVE_ROOM_RESERVATION_STATUSES.includes(stay.status as any)))continue;
   const price=prices.get(date);if(!price)warnings.missingRateNights++;else if(price.estimated)warnings.estimatedNights++;
   nights.push({reservationId:stay.id,roomId:stay.roomId,roomTypeId:roomMap.get(stay.roomId)!.roomTypeId,date,phase:actual?'actual':'forecast',source:stay.source||'directo',guests:Number(stay.numberOfGuests)||0,amount:price?.amount??null,estimated:price?.estimated??false});
  }
 }
 const daily=dates.map(date=>{
  const blocked=new Set(blocks.filter(b=>b.blockFrom<=date&&date<b.blockTo&&roomMap.has(b.roomId)).map(b=>b.roomId));
  const rows=nights.filter(n=>n.date===date),actual=rows.filter(n=>n.phase==='actual'),forecast=rows.filter(n=>n.phase==='forecast');
  const occupied=new Set(rows.map(n=>n.roomId));warnings.overlappingRoomNights+=rows.length-occupied.size;warnings.occupiedBlockedNights+=[...occupied].filter(id=>blocked.has(id)).length;
  return {date,capacity:physical.length-blocked.size,blocked:blocked.size,actualNights:actual.length,forecastNights:forecast.length,
   actualRevenue:actual.reduce((s,n)=>s+Math.round((n.amount??0)*100),0)/100,forecastRevenue:forecast.reduce((s,n)=>s+Math.round((n.amount??0)*100),0)/100};
 });
 const summarize=(phase:'actual'|'forecast')=>{
  const rows=nights.filter(n=>n.phase===phase),days=daily.filter(d=>phase==='actual'?d.date<=asOf:d.date>=asOf),capacityNights=days.reduce((s,d)=>s+d.capacity,0);
  const cents=rows.reduce((s,n)=>s+Math.round((n.amount??0)*100),0),pricedNights=rows.filter(n=>n.amount!==null).length;
  const ids=new Set(rows.map(n=>n.reservationId));return {roomNights:rows.length,capacityNights,revenue:cents/100,pricedNights,missingRateNights:rows.length-pricedNights,estimatedNights:rows.filter(n=>n.estimated).length,
   occupancy:capacityNights?rows.length/capacityNights*100:0,adr:pricedNights?cents/100/pricedNights:0,revpar:capacityNights?cents/100/capacityNights:0,guestNights:rows.reduce((s,n)=>s+n.guests,0),reservationCount:ids.size,
   guests:[...ids].reduce((s,id)=>s+(rows.find(n=>n.reservationId===id)?.guests??0),0),averageStay:ids.size?[...ids].reduce((s,id)=>s+(durations.get(id)??0),0)/ids.size:0};
 };
 const summary=summarize('actual'),forecast=summarize('forecast');
 const capacity = physical.map(room=>({roomId:room.id,roomTypeId:room.roomTypeId,availableNights:dates.filter(date=>date<=asOf&&!blocks.some(b=>b.roomId===room.id&&b.blockFrom<=date&&date<b.blockTo)).length}));
 return {from,to,asOf,roomCount:physical.length,capacity,daily,nights,summary,forecast,warnings,methodology:'Producción hasta hoy: checked_in/checked_out; futuro separado. Salida excluida. Tarifas netas guardadas por noche; reservas antiguas distribuidas por centavos. Capacidad: inventario operativo actual menos bloqueos fechados; no reconstruye altas/bajas históricas. ADR usa noches con precio conocido; importes parciales si faltan tarifas. Cortesías guardadas por noche o con motivo: $0. Cupos sin asignar no son ocupación física.'};
}
export async function loadLodging(from:string,to:string):Promise<ReturnType<typeof calculateLodging>>{
 dateRange(from,to);
 return db.transaction(async tx=>{
 const [roomRows,stays,blocks]=await Promise.all([
  tx.execute(sql`SELECT id,room_number AS "roomNumber",room_type_id AS "roomTypeId",is_active AS "isActive",is_virtual AS "isVirtual" FROM rooms`),
  tx.execute(sql`SELECT id,room_id AS "roomId",room_type_id AS "roomTypeId",status,check_in_date::text AS "checkInDate",check_out_date::text AS "checkOutDate",total_room_amount AS "totalRoomAmount",pricing_scheme AS "pricingScheme",nightly_pricing AS "nightlyPricing",special_rate_reason AS "specialRateReason",source,number_of_guests AS "numberOfGuests" FROM reservations WHERE check_in_date<=${to} AND check_out_date>${from}`),
  tx.execute(sql`SELECT room_id AS "roomId",block_from::text AS "blockFrom",block_to::text AS "blockTo" FROM maintenance_blocks WHERE block_from<=${to} AND block_to>${from}`),
 ]);
 const asOf=new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
 return calculateLodging(from,to,asOf,roomRows.rows as Room[],stays.rows as Stay[],blocks.rows as Block[]);
 },{isolationLevel:'repeatable read',accessMode:'read only'});
}
export function lodgingChannels(report:Awaited<ReturnType<typeof loadLodging>>){
 const map=new Map<string,{source:string;reservations:Set<string>;nights:number;revenue:number}>();
 for(const night of report.nights.filter(n=>n.phase==='actual')){if(!map.has(night.source))map.set(night.source,{source:night.source,reservations:new Set(),nights:0,revenue:0});const row=map.get(night.source)!;row.reservations.add(night.reservationId);row.nights++;row.revenue+=Math.round((night.amount??0)*100);}
 return [...map.values()].map(row=>({...row,reservations:row.reservations.size,revenue:row.revenue/100})).sort((a,b)=>b.revenue-a.revenue);
}

export function capacityFor(report:Awaited<ReturnType<typeof loadLodging>>,ids:Set<string>){return report.capacity.filter(r=>ids.has(r.roomId)).reduce((s,r)=>s+r.availableNights,0);}
export async function lodgingByRoomType(report:Awaited<ReturnType<typeof loadLodging>>){
 const types=(await db.execute(sql`SELECT id,name FROM room_types`)).rows as {id:string;name:string}[];
 return types.map(type=>{const rows=report.nights.filter(n=>n.phase==='actual'&&n.roomTypeId===type.id),rooms=report.capacity.filter(r=>r.roomTypeId===type.id),capacity=rooms.reduce((s,r)=>s+r.availableNights,0),known=rows.filter(n=>n.amount!==null),revenue=rows.reduce((s,n)=>s+Math.round((n.amount??0)*100),0)/100;
 return {id:type.id,tipo:type.name,rooms:rooms.length,nochesOcupadas:rows.length,ingresos:revenue,ocupacion:capacity?rows.length/capacity*100:0,tarifaMedia:known.length?revenue/known.length:0};});
}
export function previousYearDate(date:string){const [year,month,day]=date.split('-').map(Number);const last=new Date(Date.UTC(year-1,month,0)).getUTCDate();return `${year-1}-${String(month).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;}
