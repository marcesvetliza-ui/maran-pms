import {createHash,randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {rateUnits} from './settlement';
import {calendarEffective} from '@shared/rate-calendar';
export class UsdConversionError extends Error {constructor(message:string,readonly status=400){super(message);}}
export const usdSchemaSql=`
 CREATE TABLE IF NOT EXISTS channex_usd_plans(
 connection_id varchar NOT NULL REFERENCES channex_connections(id) ON DELETE CASCADE,
 source_plan_id varchar NOT NULL REFERENCES rate_plans(id),target_plan_id varchar NOT NULL UNIQUE REFERENCES rate_plans(id),
 PRIMARY KEY(connection_id,source_plan_id));
 CREATE TABLE IF NOT EXISTS channex_usd_conversions(
 connection_id varchar NOT NULL REFERENCES channex_connections(id) ON DELETE CASCADE,preview_token text NOT NULL,
 exchange_rate numeric(12,6) NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 result jsonb NOT NULL,PRIMARY KEY(connection_id,preview_token));`;
export async function ensureUsdConversionSchema(pool:Pool){await pool.query(usdSchemaSql);}
export function arsToUsd(value:string|null,quote:string):string|null {
 if(value===null)return null;
 if(!/^\d{1,8}(\.\d{1,2})?$/.test(value))throw new UsdConversionError('La tarifa de origen no es un importe válido');
 const [whole,fraction='']=value.split('.'),cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 const units=rateUnits(quote),converted=(cents*1_000_000n+units/2n)/units;
 if(converted<=0n||converted>9_999_999_999n)throw new UsdConversionError('La conversión debe dar una tarifa positiva de al menos USD 0,01');
 return `${converted/100n}.${String(converted%100n).padStart(2,'0')}`;
}
const canonical=(value:any):string=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const priceKeys=['base_rate','rate_1pax','rate_2pax','rate_3pax','rate_4pax'] as const;
export async function convertUsdPlans(pool:Pool,connectionId:string,ids:string[],actor:string,previewToken?:string){
 if(!ids.length||ids.length>20||new Set(ids).size!==ids.length)throw new UsdConversionError('Seleccioná entre 1 y 20 planes ARS');
 const c=await pool.connect();
 try{
  await c.query(previewToken?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await c.query("SET LOCAL lock_timeout='3s'");await c.query("SET LOCAL statement_timeout='20s'");
  if(previewToken){
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1),910)',[connectionId]);
   const previous=(await c.query('SELECT result FROM channex_usd_conversions WHERE connection_id=$1 AND preview_token=$2',[connectionId,previewToken])).rows[0];
   if(previous){if(canonical(previous.result.plans.map((p:any)=>p.sourceId).sort())!==canonical([...ids].sort()))throw new UsdConversionError('La revisión no corresponde a los planes seleccionados',409);await c.query('COMMIT');return {...previous.result,replayed:true};}
  }
  const conn=(await c.query('SELECT id,channex_property_id,environment,base_url FROM channex_connections WHERE id=$1'+(previewToken?' FOR SHARE':''),[connectionId])).rows[0];
  if(!conn)throw new UsdConversionError('Conexión no encontrada',404);
  const quote=(await c.query('SELECT settlement_exchange_rate::text AS rate,exchange_rate_updated_at FROM channex_inbound_settings WHERE connection_id=$1'+(previewToken?' FOR UPDATE':''),[connectionId])).rows[0];
  if(!quote?.rate)throw new UsdConversionError('Guardá primero la cotización de pesos por USD');
  const day=(await c.query("SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS day")).rows[0].day;
  const source=(await c.query('SELECT *,valid_from::text AS valid_from,valid_to::text AS valid_to FROM rate_plans WHERE id=ANY($1::varchar[]) ORDER BY id'+(previewToken?' FOR UPDATE':''),[ids])).rows;
  if(source.length!==ids.length||source.some(p=>p.currency!=='ARS'))throw new UsdConversionError('Todos los planes de origen deben existir y estar en ARS');
  const links=(await c.query('SELECT * FROM channex_usd_plans WHERE connection_id=$1 AND source_plan_id=ANY($2::varchar[]) ORDER BY source_plan_id'+(previewToken?' FOR UPDATE':''),[connectionId,ids])).rows;
  const targetIds=links.map(l=>l.target_plan_id);
  const targets=(await c.query('SELECT *,valid_from::text AS valid_from,valid_to::text AS valid_to FROM rate_plans WHERE id=ANY($1::varchar[]) ORDER BY id'+(previewToken?' FOR UPDATE':''),[targetIds])).rows;
  const calendars=(await c.query('SELECT *,stay_date::text AS day FROM rate_calendar_entries WHERE rate_plan_id=ANY($1::varchar[]) AND stay_date >= $2::date ORDER BY rate_plan_id,stay_date LIMIT 5001'+(previewToken?' FOR UPDATE':''),[[...ids,...targetIds],day])).rows;
  if(calendars.length>5000)throw new UsdConversionError('Hay más de 5000 fechas especiales. Seleccioná menos planes por operación');
  const token=createHash('sha256').update(canonical({conn,quote,day,source,links,targets,calendars})).digest('hex');
  const plans=source.map(p=>{
   const link=links.find(l=>l.source_plan_id===p.id),target=targets.find(t=>t.id===link?.target_plan_id);
   if(link&&(!target||target.currency!=='USD'||target.room_type_id!==p.room_type_id))throw new UsdConversionError('Una copia USD cambió de moneda o categoría. Revisá el vínculo antes de convertir',409);
   const values=Object.fromEntries(priceKeys.map(key=>[key,arsToUsd(p[key],quote.rate)]));
   const sourceEntries=calendars.filter(e=>e.rate_plan_id===p.id);
   const dates=[...new Set(calendars.filter(e=>e.rate_plan_id===p.id||e.rate_plan_id===target?.id).map(e=>e.day))].sort();
   const entries=dates.map(date=>{
    const sourceEntry=sourceEntries.find(e=>e.day===date);
    // A new copy inherits the source rules. A later FX update only reprices
    // it: keep the USD plan's own closures/minimum stays and validity.
    const rules=target?calendarEffective(target,date,calendars.find(e=>e.rate_plan_id===target.id&&e.day===date)):calendarEffective(p,date,sourceEntry);
    return {day:date,rate:arsToUsd(sourceEntry?.rate??null,quote.rate),occupancy_rates:Object.fromEntries(Object.entries(sourceEntry?.occupancy_rates||{}).map(([pax,value])=>[pax,arsToUsd(String(value),quote.rate)])),min_stay_arrival:rules.minStayArrival,min_stay_through:rules.minStayThrough,max_stay:rules.maxStay,stop_sell:rules.stopSell,closed_to_arrival:rules.closedToArrival,closed_to_departure:rules.closedToDeparture};
   });
   return {sourceId:p.id,sourceName:p.name,roomTypeId:p.room_type_id,targetId:target?.id||null,targetName:target?.name||`${p.name} · Booking USD`,sourceValues:Object.fromEntries(priceKeys.map(key=>[key,p[key]])),before:target?Object.fromEntries(priceKeys.map(key=>[key,target[key]])):null,values,entries,
    calendarChanges:dates.map(date=>({date,source:calendarEffective(p,date,calendars.find(e=>e.rate_plan_id===p.id&&e.day===date)),before:target?calendarEffective(target,date,calendars.find(e=>e.rate_plan_id===target.id&&e.day===date)):null,after:calendarEffective({...p,...(target?{valid_from:target.valid_from,valid_to:target.valid_to}:{}),...values,currency:'USD'},date,entries.find(e=>e.day===date))})),
    validFrom:target?.valid_from??p.valid_from,validTo:target?.valid_to??p.valid_to,refundable:target?target.refundable:p.refundable,cancellationPolicy:target?target.cancellation_policy:p.cancellation_policy};
  });
  const result:any={previewToken:token,exchangeRate:quote.rate,effectiveFrom:day,plans:plans.map(({entries,...p})=>p)};
  if(previewToken){
   if(previewToken!==token)throw new UsdConversionError('La cotización o las tarifas cambiaron. Volvé a revisar la conversión',409);
   for(const p of plans){
    const id=p.targetId||randomUUID();const v=p.values;
    if(!p.targetId){await c.query('INSERT INTO rate_plans(id,name,room_type_id,currency,base_rate,rate_1pax,rate_2pax,rate_3pax,rate_4pax,refundable,cancellation_policy,valid_from,valid_to)VALUES($1,$2,$3,\'USD\',$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,p.targetName,p.roomTypeId,v.base_rate,v.rate_1pax,v.rate_2pax,v.rate_3pax,v.rate_4pax,p.refundable,p.cancellationPolicy,p.validFrom,p.validTo]);await c.query('INSERT INTO channex_usd_plans(connection_id,source_plan_id,target_plan_id)VALUES($1,$2,$3)',[connectionId,p.sourceId,id]);}
    else await c.query('UPDATE rate_plans SET base_rate=$2,rate_1pax=$3,rate_2pax=$4,rate_3pax=$5,rate_4pax=$6 WHERE id=$1',[id,v.base_rate,v.rate_1pax,v.rate_2pax,v.rate_3pax,v.rate_4pax]);
    await c.query('DELETE FROM rate_calendar_entries WHERE rate_plan_id=$1 AND stay_date >= $2::date',[id,day]);
    if(p.entries.length)await c.query(`INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,rate,occupancy_rates,min_stay_arrival,min_stay_through,max_stay,stop_sell,closed_to_arrival,closed_to_departure,updated_by)
      SELECT $1,x.day::date,x.rate,x.occupancy_rates,x.min_stay_arrival,x.min_stay_through,x.max_stay,x.stop_sell,x.closed_to_arrival,x.closed_to_departure,$3
      FROM jsonb_to_recordset($2::jsonb) AS x(day text,rate numeric,occupancy_rates jsonb,min_stay_arrival int,min_stay_through int,max_stay int,stop_sell boolean,closed_to_arrival boolean,closed_to_departure boolean)`,[id,JSON.stringify(p.entries),actor]);
    p.targetId=id;
   }
   result.applied=true;
   result.plans=plans.map(({entries,...p})=>p);
   await c.query('INSERT INTO channex_usd_conversions(connection_id,preview_token,exchange_rate,actor,result)VALUES($1,$2,$3,$4,$5)',[connectionId,token,quote.rate,actor,JSON.stringify(result)]);
  }
  await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
