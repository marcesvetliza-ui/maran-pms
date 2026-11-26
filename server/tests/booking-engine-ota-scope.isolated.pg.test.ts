import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
vi.mock('../permissions',()=>({hasPermission:(role:string,key:string)=>role==='admin'&&key==='sidebar:/admin/booking-engine'}));
import { pool, withReadOnlyDatabaseTransaction } from '../db';
import { BOOKING_ENGINE_SCHEMA_SQL } from '../bookingEngineSchema';
import { rateCalendarSchemaSql } from '../rates/calendarSchema';
import { inboundSchemaSql } from '../channex/inboundSchema';
import { registerPublicBookingRoutes } from '../routes/publicBooking';
import { loadBookingQuote } from '../bookingEngineService';
import { bookingChannelReader, loadBookingOtaSource } from '../bookingEngineOtaSource';
import { editCalendar } from '../rates/calendarService';
import { seedBookingOtaScope } from './booking-ota-fixture';
const socket=process.env.BOOKING_ENGINE_ISOLATED_SOCKET;
if(process.env.BOOKING_ENGINE_ISOLATED_TEST!=='1'||!socket?.startsWith('/tmp/booking-engine-isolated.')||process.env.DATABASE_URL!==`postgresql://runner@localhost:55461/booking_engine_synthetic?host=${socket}`)throw Error('Disposable booking database required');
const type=randomUUID(),room=randomUUID(),otherRoom=randomUUID(),own=randomUUID(),ref=randomUUID();
const stay={checkIn:'2091-03-10',checkOut:'2091-03-12',adults:2};
const config={ratePlanId:own,discountPercent:10,publicDescription:'Synthetic',amenities:[],photos:[],sortOrder:0,showInBooking:true};
let connection:string,base:string,server:Server;
const quote=(offerId?:string)=>withReadOnlyDatabaseTransaction(()=>loadBookingQuote(type,stay,{offerId}));
const patch=(body:unknown,route=`/api/admin/room-types/${type}/booking-config`,role='admin')=>fetch(base+route,{method:'PATCH',headers:{'content-type':'application/json','x-role':role},body:JSON.stringify(body)});
const confirm=(q:any,email='synthetic@example.invalid')=>fetch(base+'/api/public/booking/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...stay,roomTypeId:type,ratePlanId:own,offerId:q.offerId,expectedTotalAmount:q.totalAmount,firstName:'Synthetic',lastName:'Review',email})});
async function price(plan:string,rate:string,date=stay.checkIn,origin:string|null='ota_calendar'){
 await pool.query(`INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,rate,rate_origin) VALUES($1,$2,$3,$4) ON CONFLICT(rate_plan_id,stay_date) DO UPDATE SET rate=excluded.rate,rate_origin=excluded.rate_origin`,[plan,date,rate,origin]);
}
beforeAll(async()=>{
 await pool.query(BOOKING_ENGINE_SCHEMA_SQL);await pool.query(rateCalendarSchemaSql);await pool.query(inboundSchemaSql);
 const app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.user={id:'synthetic',role:req.headers['x-role']};req.isAuthenticated=()=>!!req.headers['x-role'];next();});registerPublicBookingRoutes(app);
 server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address()as any).port}`;
});
beforeEach(async()=>{
 await pool.query('TRUNCATE channex_connections,rooms,reservations,guests,rate_plans,room_types,groups,group_room_blocks,group_reservation_links,maintenance_blocks,audit_logs,booking_engine_sales CASCADE');
 await pool.query(BOOKING_ENGINE_SCHEMA_SQL);
 await pool.query(`INSERT INTO room_types(id,code,name,base_occupancy,max_occupancy,show_in_booking) VALUES($1,'SYN','Synthetic',2,3,true)`,[type]);
 await pool.query(`INSERT INTO rooms(id,room_number,room_type_id,floor,status) VALUES($1,'SYN-1',$3,1,'available'),($2,'SYN-2',$3,1,'available')`,[room,otherRoom,type]);
 await pool.query(`INSERT INTO rate_plans(id,name,room_type_id,base_rate,rate_2pax,rate_3pax,currency) VALUES($1,'Own plan',$3,100,100,150,'ARS'),($2,'OTA reference',$3,900,900,950,'ARS')`,[own,ref,type]);
 connection=await seedBookingOtaScope(pool,type,ref);
 await pool.query('UPDATE channex_ari_settings SET room_ids=$1 WHERE connection_id=$2',[[room],connection]);
 await pool.query(`INSERT INTO booking_engine_configs(room_type_id,rate_plan_id,discount_percent) VALUES($1,$2,10)`,[type,own]);
});
afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(r=>server.close(()=>r()));await pool.end();});
it('reads the selected physical pool, including when either sync switch is paused',async()=>{
 expect((await quote()).rooms.map(r=>r.id)).toEqual([room]);
 await pool.query('UPDATE channex_ari_settings SET room_ids=$1 WHERE connection_id=$2',[[otherRoom],connection]);
 expect((await quote()).rooms.map(r=>r.id)).toEqual([otherRoom]);
 await pool.query('UPDATE channex_connections SET is_active=true WHERE id=$1',[connection]);
 expect((await quote()).rooms.map(r=>r.id)).toEqual([otherRoom]);
 await pool.query('UPDATE channex_ari_settings SET enabled=true WHERE connection_id=$1',[connection]);
 expect((await quote()).rooms.map(r=>r.id)).toEqual([otherRoom]);
});
it('never substitutes all rooms for an empty, missing or invalid scope',async()=>{
 await pool.query('UPDATE channex_ari_settings SET room_ids=$1 WHERE connection_id=$2',[[],connection]);
 await expect(quote()).rejects.toThrow(/habitaciones/);
 await pool.query('DELETE FROM channex_ari_settings WHERE connection_id=$1',[connection]);
 await expect(quote()).rejects.toThrow(/alcance/);
});
it('ignores demo and retired plans, requires explicit choice among real sources',async()=>{
 const demo=randomUUID(),second=randomUUID();
 await pool.query(`INSERT INTO channex_connections(id,label,environment,channex_property_id,base_url,created_at) VALUES($1,'Demo','demo','demo','https://staging.channex.io/api/v1',now())`,[demo]);
 expect((await loadBookingOtaSource()).connection.id).toBe(connection);
 await pool.query(`INSERT INTO channex_connections(id,label,environment,channex_property_id,base_url,created_at) VALUES($1,'Other real','real','other','https://app.channex.io/api/v1',now())`,[second]);
 await expect(quote()).rejects.toThrow(/conexión real/);
 expect((await patch({connectionId:demo},'/api/admin/booking-engine/ota-source')).status).toBe(400);
 expect((await patch({connectionId:connection},'/api/admin/booking-engine/ota-source')).status).toBe(200);
 expect((await quote()).rooms).toHaveLength(1);
 await pool.query('UPDATE channex_rate_plan_mappings SET remote_present=false WHERE connection_id=$1',[connection]);
 await expect(quote()).rejects.toThrow(/referencia/);
});
it('keeps own base price and discount, only inherits explicitly authored OTA ranges when enabled',async()=>{
 await price(ref,'200');await price(own,'1');
 expect(await quote()).toMatchObject({totalAmount:180,pricingSource:'own'});
 expect((await patch({...config,inheritOtaRanges:true,otaAdjustmentPercent:-20})).status).toBe(200);
 expect(await quote()).toMatchObject({totalAmount:250,pricingSource:'mixed',inheritedNights:1});
 await price(ref,'300',stay.checkIn,null);
 expect(await quote()).toMatchObject({totalAmount:180,pricingSource:'own'});
});
it('converts inherited nights using the configured OTA exchange rate and applies a markup once',async()=>{
 await pool.query(`UPDATE rate_plans SET currency='USD' WHERE id=$1`,[ref]);
 await pool.query(`INSERT INTO channex_inbound_settings(connection_id,settlement_exchange_rate) VALUES($1,1545)`,[connection]);
 await price(ref,'0.10');await price(ref,'0.20','2091-03-11');
 expect((await patch({...config,inheritOtaRanges:true,otaAdjustmentPercent:10})).status).toBe(200);
 expect(await quote()).toMatchObject({totalAmount:509.85,pricingSource:'ota_ranges',discountPercent:0});
});
it.each([['stop_sell',true,stay.checkIn],['closed_to_arrival',true,stay.checkIn],['closed_to_departure',true,stay.checkOut],['min_stay_arrival',3,stay.checkIn],['min_stay_through',3,'2091-03-11'],['max_stay',1,stay.checkIn]] as const)('applies reference %s with the price checkbox off',async(field,value,day)=>{
 await pool.query(`INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,${field}) VALUES($1,$2,$3)`,[ref,day,value]);
 await expect(quote()).rejects.toThrow();
});
it('preserves saved range options when an older client updates presentation fields',async()=>{
 expect((await patch({...config,inheritOtaRanges:true,otaAdjustmentPercent:-12.5,otaReferencePlans:{'synthetic-type':ref}})).status).toBe(200);
 expect((await patch({...config,publicDescription:'Edited elsewhere'})).status).toBe(200);
 expect((await pool.query('SELECT inherit_ota_ranges,ota_adjustment_percent,ota_reference_plans FROM booking_engine_configs WHERE room_type_id=$1',[type])).rows[0]).toMatchObject({inherit_ota_ranges:true,ota_adjustment_percent:'-12.50',ota_reference_plans:{'synthetic-type':ref}});
});
it('configuration and quotes do not change OTA data, enqueue dispatches or enable sales',async()=>{
 const tables=['channex_connections','channex_ari_settings','channex_room_type_mappings','channex_rate_plan_mappings','channex_ari_outbox'];
 const snapshot=async()=>Promise.all(tables.map(async table=>(await pool.query(`SELECT * FROM ${table} ORDER BY 1`)).rows));
 const before=await snapshot();
 expect((await patch({...config,inheritOtaRanges:true,otaAdjustmentPercent:5})).status).toBe(200);
 expect((await patch({connectionId:connection},'/api/admin/booking-engine/ota-source')).status).toBe(200);
 await quote();expect(await snapshot()).toEqual(before);
 await pool.query(BOOKING_ENGINE_SCHEMA_SQL);
 expect((await pool.query('SELECT enabled FROM booking_engine_sales')).rows[0].enabled).toBe(false);
 expect((await confirm(await quote())).status).toBe(503);
 expect((await pool.query('SELECT count(*)::int n FROM reservations')).rows[0].n).toBe(0);
});
it('quotes and confirms the same eligible OTA variant and rejects stale offers before guest writes',async()=>{
 const secondRef=randomUUID();
 await pool.query('UPDATE channex_ari_settings SET room_ids=$1 WHERE connection_id=$2',[[room,otherRoom],connection]);
 await pool.query('UPDATE channex_room_type_mappings SET room_ids=$1 WHERE connection_id=$2',[[room],connection]);
 await pool.query(`INSERT INTO channex_room_type_mappings(connection_id,channex_room_type_id,channex_room_type_title,room_type_id,room_ids,created_at) VALUES($1,'other-variant','Triple',$2,$3,now())`,[connection,type,[otherRoom]]);
 await pool.query(`INSERT INTO rate_plans(id,name,room_type_id,base_rate,currency) VALUES($1,'Other ref',$2,999,'ARS')`,[secondRef,type]);
 await pool.query(`INSERT INTO channex_rate_plan_mappings(connection_id,channex_room_type_id,channex_rate_plan_id,channex_rate_plan_title,rate_plan_id,sell_mode,rate_mode,occupancies,created_at) VALUES($1,'other-variant','second-ref','Triple',$2,'per_person','manual',ARRAY[3],now())`,[connection,secondRef]);
 await price(ref,'200');await price(ref,'200','2091-03-11');await price(secondRef,'1');
 await patch({...config,inheritOtaRanges:true,otaAdjustmentPercent:0});
 const q=await quote();expect(q.totalAmount).toBe(400);expect(q.rooms.map(r=>r.id)).toEqual([room]);
 await pool.query('UPDATE booking_engine_sales SET enabled=true');
 expect((await confirm({...q,offerId:'other-variant:'+secondRef})).status).toBe(409);
 await price(ref,'210');expect((await confirm(q)).status).toBe(409);
 expect((await pool.query('SELECT count(*)::int n FROM guests')).rows[0].n).toBe(0);
 const fresh=await quote();expect((await confirm(fresh)).status).toBe(200);
 expect((await pool.query('SELECT room_id,nightly_pricing FROM reservations')).rows[0]).toMatchObject({room_id:room,nightly_pricing:[{date:stay.checkIn,rateCents:21000,discountCents:0},{date:'2091-03-11',rateCents:20000,discountCents:0}]});
});
it('binds repeated query values and arrays without treating their contents as SQL',async()=>{
 const value="Robert'); DROP TABLE rooms; --";
 const result=await withReadOnlyDatabaseTransaction(()=>bookingChannelReader.query('SELECT $1::text a,$1::text b,$2::text[] c',[value,[value]]));
 expect(result.rows[0]).toEqual({a:value,b:value,c:[value]});
 await expect(bookingChannelReader.query('DELETE FROM rooms')).rejects.toThrow(/consultas/);
});
it('marks authored range prices and preserves provenance on restriction-only edits',async()=>{
 const request={changes:[{ratePlanIds:[ref],dateFrom:stay.checkIn,dateTo:stay.checkIn,values:{rate:'200'}}]};
 let preview=await editCalendar(pool,request,null);await editCalendar(pool,request,null,preview.previewToken);
 expect((await pool.query('SELECT rate_origin FROM rate_calendar_entries WHERE rate_plan_id=$1',[ref])).rows[0].rate_origin).toBe('ota_calendar');
 const restriction={changes:[{ratePlanIds:[ref],dateFrom:stay.checkIn,dateTo:stay.checkIn,values:{minStayThrough:2}}]};
 preview=await editCalendar(pool,restriction,null);await editCalendar(pool,restriction,null,preview.previewToken);
 expect((await pool.query('SELECT rate_origin FROM rate_calendar_entries WHERE rate_plan_id=$1',[ref])).rows[0].rate_origin).toBe('ota_calendar');
 await price(ref,'200',stay.checkIn,null);
 await pool.query('UPDATE channex_connections SET is_active=true WHERE id=$1',[connection]);
 await pool.query('UPDATE channex_ari_settings SET enabled=true,capture_started_at=now() WHERE connection_id=$1',[connection]);
 await pool.query('DELETE FROM channex_ari_outbox');
 preview=await editCalendar(pool,request,null);await editCalendar(pool,request,null,preview.previewToken);
 expect((await pool.query('SELECT rate_origin FROM rate_calendar_entries WHERE rate_plan_id=$1',[ref])).rows[0].rate_origin).toBe('ota_calendar');
 expect((await pool.query('SELECT count(*)::int n FROM channex_ari_outbox')).rows[0].n).toBe(0);
});
it('does not obstruct deleting an OTA connection and keeps a removed explicit source unavailable',async()=>{
 expect((await patch({connectionId:connection},'/api/admin/booking-engine/ota-source')).status).toBe(200);
 // Disconnect through the existing OTA tables; the motor owns only its soft reference.
 await pool.query('DELETE FROM channex_rate_plan_mappings WHERE connection_id=$1',[connection]);
 await pool.query('DELETE FROM channex_room_type_mappings WHERE connection_id=$1',[connection]);
 await pool.query('DELETE FROM channex_connections WHERE id=$1',[connection]);
 await expect(quote()).rejects.toThrow(/conexión real/);
});
it('reserves pending channel units even during a technical sync pause and rejects malformed holds',async()=>{
 const payload={attributes:{property_id:'synthetic-property',status:'new',arrival_date:stay.checkIn,departure_date:stay.checkOut,rooms:[{room_type_id:'synthetic-type',id:'remote-unit'}]}};
 await pool.query(`INSERT INTO channex_inbound_revisions(connection_id,revision_id,payload,payload_hash,booking_id,status) VALUES($1,'synthetic-revision',$2,'synthetic','synthetic-booking','review')`,[connection,payload]);
 await expect(quote()).rejects.toThrow(/No quedan/);
 await pool.query(`UPDATE channex_inbound_revisions SET payload=jsonb_set(payload,'{attributes,arrival_date}','"invalid"') WHERE connection_id=$1`,[connection]);
 await expect(quote()).rejects.toThrow(/fechas válidas/);
});
it('requires explicit valid per-person metadata and an allowed guest count',async()=>{
 await pool.query(`UPDATE channex_rate_plan_mappings SET sell_mode='per_person',rate_mode='manual',occupancies=ARRAY[1,2] WHERE connection_id=$1`,[connection]);
 expect((await quote()).totalAmount).toBe(180);
 await expect(withReadOnlyDatabaseTransaction(()=>loadBookingQuote(type,{...stay,adults:3}))).rejects.toThrow(/No quedan/);
 await pool.query(`UPDATE channex_rate_plan_mappings SET occupancies=NULL WHERE connection_id=$1`,[connection]);
 await expect(quote()).rejects.toThrow(/referencia/);
});
it('leaves OTA-authored prices unmarked after a currency-copy operation',async()=>{
 const {ensureUsdConversionSchema,convertUsdPlans}=await import('../channex/usdConversion');
 const {saveSettlementRate}=await import('../channex/settlementConfig');
 await ensureUsdConversionSchema(pool);await saveSettlementRate(pool,connection,{rate:'1545',reason:'Synthetic quote'},'synthetic');
 await price(ref,'1545');
 const preview=await convertUsdPlans(pool,connection,[ref],'synthetic');
 const applied=await convertUsdPlans(pool,connection,[ref],'synthetic',preview.previewToken);
 const copied=(await pool.query('SELECT rate_origin,occupancy_price_origins FROM rate_calendar_entries WHERE rate_plan_id=$1',[applied.plans[0].targetId])).rows[0];
 expect(copied).toEqual({rate_origin:null,occupancy_price_origins:{}});
});
