import type {Pool} from 'pg';
import {addDays,buildAriValues,inventoryPreview} from './ari';

/** Local snapshot only: no transport, ACK, queue mutation or credential reads. */
export async function previewChannexAri(pool:Pool,connectionId:string){
 const c=await pool.connect();
 try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await c.query("SET LOCAL statement_timeout='20s'");
  const connection=(await c.query(`SELECT c.id,c.environment,c.base_url,c.channex_property_id,s.floor,s.currency,s.room_ids
   FROM channex_connections c JOIN channex_ari_settings s ON s.connection_id=c.id WHERE c.id=$1`,[connectionId])).rows[0];
  if(!connection){await c.query('COMMIT');return null;}
  const today=(await c.query("SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS today")).rows[0].today;
  const through=addDays(today,499);
  const rooms=await inventoryPreview(c,connectionId,connection.floor,connection.room_ids??null);
  const event={id:'preview',date_from:today,date_to:through,room_type_id:null,rate_plan_id:null,attempts:0};
  const availability=await buildAriValues(c,connection,[{...event,kind:'availability'}],today);
  const restrictions=await buildAriValues(c,connection,[{...event,kind:'restrictions'}],today);
  const categories=(await c.query('SELECT channex_room_type_id AS id,channex_room_type_title AS name FROM channex_room_type_mappings WHERE connection_id=$1',[connectionId])).rows;
  const plans=(await c.query('SELECT m.channex_rate_plan_id AS id,m.channex_rate_plan_title AS name,p.name AS "localName" FROM channex_rate_plan_mappings m LEFT JOIN rate_plans p ON p.id=m.rate_plan_id WHERE m.connection_id=$1',[connectionId])).rows;
  await c.query('COMMIT');
  return {checkedAt:new Date().toISOString(),from:today,through,currency:connection.currency,rooms:rooms.map(r=>({number:r.roomNumber,category:r.roomTypeName})),categories,plans,availability,restrictions,remoteVerified:false};
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
