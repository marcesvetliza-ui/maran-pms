import type { PoolClient } from 'pg';

const active = new Set(['tentative','pending','reserved','confirmed','web_checkin','checked_in']);
const validDay = (value: unknown): value is string => {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(`${value}T00:00:00Z`);
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
};
const nextDay=(day:string,amount:number)=>{const date=new Date(`${day}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+amount);return date.toISOString().slice(0,10);};
export function inboundInventoryRange(payload:any,previous:any,today:string){
 const windows=[payload,previous].flatMap(raw=>{
  const a=raw?.attributes;
  return validDay(a?.arrival_date)&&validDay(a?.departure_date)&&a.arrival_date<a.departure_date?[{from:a.arrival_date,to:nextDay(a.departure_date,-1)}]:[];
 });
 const from=windows.length?windows.map(w=>w.from).sort()[0]:today;
 const to=windows.length?windows.map(w=>w.to).sort().at(-1)!:nextDay(today,499);
 return {from:from<today?today:from,to:to>nextDay(today,499)?nextDay(today,499):to};
}
/** Holds represent the channel's committed nights, independently of assignment,
 * price validation and guest data. Never guess a physical room for a hold. */
export type InventoryTarget={room_type_id:string;channex_room_type_id:string;rooms:string[]};
export function pendingInventoryDemand(rows:any[],dates:readonly string[],targets:readonly InventoryTarget[]){
 const demand=new Map<string,{room_type_id:string;channex_room_type_id:string;day:string;quantity:number}>();
 for(const row of rows){
  const a=row.payload?.attributes;
  if(a?.property_id!==row.property_id||a.status==='cancelled')continue;
  if(!validDay(a.arrival_date)||!validDay(a.departure_date)||a.arrival_date>=a.departure_date)
   throw Error('Hay una reserva del canal sin fechas válidas. Revisá la bandeja antes de publicar disponibilidad.');
  const nights=dates.filter(day=>day>=a.arrival_date&&day<a.departure_date);if(!nights.length)continue;
  if(!Array.isArray(a.rooms)||!a.rooms.length||a.rooms.length>20)throw Error('Revisá las unidades de la reserva del canal antes de publicar disponibilidad.');
  for(const room of a.rooms){
   const mapping=row.mappings?.[room.room_type_id],category=typeof mapping==='string'?mapping:mapping?.type;
   if(typeof category!=='string'||!category)throw Error('Falta vincular una categoría de una reserva pendiente antes de publicar disponibilidad.');
   const affected=targets.filter(target=>target.room_type_id===category&&(!mapping?.rooms?.length||target.rooms.some(id=>mapping.rooms.includes(id))));
   const key=room.booking_room_id||room.id||(a.rooms.length===1?'single':null),local=key?row.links?.[key]:null;
   for(const day of nights){
    if(local?.physical&&active.has(local.status)&&local.type===category&&local.from<=day&&local.to>day
      &&!local.blocks?.some((block:any)=>block.from<=day&&block.to>=day))continue;
    for(const target of affected){const id=`${target.channex_room_type_id}:${day}`,entry=demand.get(id)||{room_type_id:category,channex_room_type_id:target.channex_room_type_id,day,quantity:0};entry.quantity++;demand.set(id,entry);}
   }
  }
 }
 return [...demand.values()];
}
export async function loadPendingInventoryDemand(c:Pick<PoolClient,'query'>,connection:any,dates:readonly string[]){
 if(!dates.length)return [];
 // ARI can be installed before inbound reception. Do not mix a schema's
 // outbound-only tables with another schema's received booking history.
 const ready=(await c.query(`SELECT to_regclass('channex_inbound_revisions') IS NOT NULL AND
  (SELECT relnamespace FROM pg_class WHERE oid=to_regclass('channex_inbound_revisions'))=
  (SELECT relnamespace FROM pg_class WHERE oid=to_regclass('channex_connections')) AS inbound_ready`)).rows[0];
 if(ready?.inbound_ready===false)return [];
 const rows=(await c.query(`WITH ranked AS (
  SELECT v.*,c.channex_property_id AS property_id,row_number() OVER(PARTITION BY v.connection_id,v.booking_id
   ORDER BY (v.status='stale'),COALESCE(v.inserted_at,v.created_at) DESC,v.created_at DESC,v.revision_id DESC) AS position
  FROM channex_inbound_revisions v JOIN channex_connections c ON c.id=v.connection_id
  JOIN channex_connections target ON target.id=$1 AND target.environment=c.environment AND target.base_url=c.base_url
  WHERE v.booking_id IS NOT NULL AND (c.id=target.id OR EXISTS(
   SELECT 1 FROM channex_room_type_mappings a JOIN channex_room_type_mappings b ON a.room_type_id=b.room_type_id
   WHERE a.connection_id=c.id AND b.connection_id=target.id))
 ) SELECT r.payload,r.property_id,
  COALESCE((SELECT jsonb_object_agg(m.channex_room_type_id,jsonb_build_object('type',m.room_type_id,'rooms',
   (SELECT COALESCE(jsonb_agg(rm.id),'[]'::jsonb) FROM rooms rm LEFT JOIN channex_ari_settings settings ON settings.connection_id=m.connection_id
    WHERE rm.room_type_id=m.room_type_id AND rm.is_active AND NOT COALESCE(rm.is_virtual,false) AND rm.room_number<>'REUB' AND rm.floor IS DISTINCT FROM 99
     AND (m.room_ids IS NULL OR rm.id=ANY(m.room_ids)) AND (settings.floor IS NULL OR rm.floor=settings.floor)
     AND (settings.room_ids IS NULL OR rm.id=ANY(settings.room_ids)))))
   FROM channex_room_type_mappings m WHERE m.connection_id=r.connection_id),'{}'::jsonb) AS mappings,
  COALESCE((SELECT jsonb_object_agg(l.remote_room_id,jsonb_build_object('type',rm.room_type_id,'from',s.check_in_date::text,'to',s.check_out_date::text,'status',s.status,
   'physical',COALESCE(rm.is_active AND NOT COALESCE(rm.is_virtual,false) AND rm.room_number<>'REUB' AND rm.floor IS DISTINCT FROM 99 AND rm.status NOT IN('maintenance','oos'),false),
   'blocks',COALESCE((SELECT jsonb_agg(jsonb_build_object('from',m.block_from::text,'to',m.block_to::text)) FROM maintenance_blocks m WHERE m.room_id=rm.id AND m.block_to>=$2::date),'[]'::jsonb)))
   FROM channex_inbound_rooms l JOIN reservations s ON s.id=l.reservation_id LEFT JOIN rooms rm ON rm.id=s.room_id
   WHERE l.connection_id=r.connection_id AND l.booking_id=r.booking_id),'{}'::jsonb) AS links
 FROM ranked r WHERE r.position=1 AND r.status IN('pending','review')`,[connection.id,dates[0]])).rows;
 const targets=(await c.query(`SELECT m.channex_room_type_id,m.room_type_id,COALESCE(jsonb_agg(r.id) FILTER(WHERE r.id IS NOT NULL),'[]'::jsonb) AS rooms
  FROM channex_room_type_mappings m LEFT JOIN rooms r ON r.room_type_id=m.room_type_id AND r.is_active
   AND NOT COALESCE(r.is_virtual,false) AND r.room_number<>'REUB' AND r.floor IS DISTINCT FROM 99
   AND (m.room_ids IS NULL OR r.id=ANY(m.room_ids)) AND ($2::int IS NULL OR r.floor=$2)
   AND ($3::text[] IS NULL OR r.id=ANY($3))
  WHERE m.connection_id=$1 GROUP BY m.channex_room_type_id,m.room_type_id`,[connection.id,connection.floor??null,connection.room_ids??null])).rows;
 return pendingInventoryDemand(rows,dates,targets);
}
export async function captureInboundInventory(c:Pick<PoolClient,'query'>,connection:any,payload:any,previous:any){
 const today=(await c.query("SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS day")).rows[0].day;
 const {from,to}=inboundInventoryRange(payload,previous,today);if(to<from)return;
 await c.query(`INSERT INTO channex_ari_outbox(connection_id,kind,date_from,date_to,reason)
  SELECT s.connection_id,'availability',$1::date,$2::date,'channex_inbound:inventory'
  FROM channex_ari_settings s JOIN channex_connections c ON c.id=s.connection_id
  WHERE s.capture_started_at IS NOT NULL AND c.is_active AND c.environment=$3 AND c.base_url=$4`,[from,to,connection.environment,connection.base_url]);
}
