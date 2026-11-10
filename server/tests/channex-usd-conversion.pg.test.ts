import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,it,expect,describe} from 'vitest';
import {pool} from '../db';
import {ensureChannexInboundSchema} from '../channex/inboundSchema';
import {ensureUsdConversionSchema,convertUsdPlans} from '../channex/usdConversion';
import {ensureRateCalendarSchema} from '../rates/calendarSchema';
import {saveSettlementRate} from '../channex/settlementConfig';
import {STAGING_URL} from '../channex/ari';
const suite=process.env.DATABASE_URL?describe:describe.skip,fixtures:any[]=[];
suite('USD conversion on local PostgreSQL',()=>{
 beforeAll(async()=>{const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!/test/.test(url.pathname))throw Error('Local test database required');await ensureChannexInboundSchema(pool);await ensureRateCalendarSchema(pool);await ensureUsdConversionSchema(pool);});
 afterAll(async()=>{
  for(const f of fixtures){
   const targets=(await pool.query('SELECT target_plan_id FROM channex_usd_plans WHERE connection_id=$1',[f.id])).rows.map(r=>r.target_plan_id);
   await pool.query('DELETE FROM channex_usd_conversions WHERE connection_id=$1',[f.id]);await pool.query('DELETE FROM channex_usd_plans WHERE connection_id=$1',[f.id]);
   await pool.query('DELETE FROM rate_calendar_entries WHERE rate_plan_id=ANY($1::varchar[])',[[...f.plans,...targets]]);
   await pool.query('DELETE FROM rate_plans WHERE id=ANY($1::varchar[])',[[...f.plans,...targets]]);
   await pool.query('DELETE FROM channex_connections WHERE id=$1',[f.id]);await pool.query('DELETE FROM room_types WHERE id=$1',[f.id]);
  }
  await pool.end();
 });
 async function fixture(){const id=randomUUID(),plans=[id+'-a',id+'-b'];fixtures.push({id,plans});
  await pool.query("INSERT INTO room_types(id,code,name)VALUES($1,$2,'USD test')",[id,id]);
  await pool.query("INSERT INTO channex_connections(id,label,environment,base_url,channex_property_id,is_active,created_at)VALUES($1,'USD test','demo',$2,$3,false,now())",[id,STAGING_URL,id]);
  for(const [i,p] of plans.entries())await pool.query("INSERT INTO rate_plans(id,name,room_type_id,base_rate,rate_1pax,rate_2pax,currency)VALUES($1,$2,$3,195000,173000,195000,'ARS')",[p,'Source '+i,id]);
  await saveSettlementRate(pool,id,{rate:'1545',reason:'Cotización manual de prueba'},'Test operator');
  return {id,plans};
 }
 it('previews without writes and creates separate USD plans preserving ARS and future restrictions',async()=>{
  const f=await fixture(),id=f.plans[0];
  await pool.query("INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,rate,occupancy_rates,min_stay_arrival,min_stay_through,closed_to_arrival)VALUES($1,'2031-02-03',210000,'{\"2\":\"230000\"}',2,2,true)",[id]);
  const before=(await pool.query('SELECT * FROM rate_plans WHERE id=$1',[id])).rows[0];
  const sourceCalendar=(await pool.query('SELECT * FROM rate_calendar_entries WHERE rate_plan_id=$1',[id])).rows;
  const preview=await convertUsdPlans(pool,f.id,[id],'tester');expect(preview.plans[0].values).toMatchObject({base_rate:'126.21',rate_1pax:'111.97',rate_2pax:'126.21'});
  expect((await pool.query('SELECT * FROM channex_usd_plans WHERE connection_id=$1',[f.id])).rows).toHaveLength(0);
  const applied=await convertUsdPlans(pool,f.id,[id],'tester',preview.previewToken);const target=applied.plans[0].targetId;
  expect(target).not.toBe(id);expect((await pool.query('SELECT * FROM rate_plans WHERE id=$1',[id])).rows[0]).toEqual(before);
  expect((await pool.query('SELECT * FROM rate_calendar_entries WHERE rate_plan_id=$1',[id])).rows).toEqual(sourceCalendar);
  expect((await pool.query('SELECT currency,base_rate::text FROM rate_plans WHERE id=$1',[target])).rows[0]).toEqual({currency:'USD',base_rate:'126.21'});
  expect((await pool.query('SELECT rate::text,occupancy_rates,min_stay_arrival,min_stay_through,closed_to_arrival FROM rate_calendar_entries WHERE rate_plan_id=$1',[target])).rows[0]).toMatchObject({rate:'135.92',occupancy_rates:{'2':'148.87'},min_stay_arrival:2,min_stay_through:2,closed_to_arrival:true});
  const replay=await convertUsdPlans(pool,f.id,[id],'tester',preview.previewToken);expect(replay.replayed).toBe(true);expect(replay.plans[0].targetId).toBe(target);
  await expect(convertUsdPlans(pool,f.id,[f.plans[1]],'tester',preview.previewToken)).rejects.toThrow('no corresponde');
  expect((await pool.query('SELECT 1 FROM channex_usd_conversions WHERE connection_id=$1',[f.id])).rows).toHaveLength(1);
 });
 it('rejects stale previews after a quote, source tariff, calendar or target edit',async()=>{
  const f=await fixture(),id=f.plans[0];
  const preview=await convertUsdPlans(pool,f.id,[id],'tester');await saveSettlementRate(pool,f.id,{rate:'1500',reason:'Nueva cotización de prueba'},'tester');
  await expect(convertUsdPlans(pool,f.id,[id],'tester',preview.previewToken)).rejects.toThrow('cambiaron');
  let p=await convertUsdPlans(pool,f.id,[id],'tester');await pool.query('UPDATE rate_plans SET base_rate=196000 WHERE id=$1',[id]);await expect(convertUsdPlans(pool,f.id,[id],'tester',p.previewToken)).rejects.toThrow('cambiaron');
  p=await convertUsdPlans(pool,f.id,[id],'tester');await pool.query("INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,rate)VALUES($1,'2031-02-03',210000)",[id]);await expect(convertUsdPlans(pool,f.id,[id],'tester',p.previewToken)).rejects.toThrow('cambiaron');
  p=await convertUsdPlans(pool,f.id,[id],'tester');const a=await convertUsdPlans(pool,f.id,[id],'tester',p.previewToken);const target=a.plans[0].targetId;
  p=await convertUsdPlans(pool,f.id,[id],'tester');await pool.query('UPDATE rate_plans SET rate_2pax=999 WHERE id=$1',[target]);await expect(convertUsdPlans(pool,f.id,[id],'tester',p.previewToken)).rejects.toThrow('cambiaron');
 });
 it('reuses USD copies, clears target-only price overrides and preserves USD closures',async()=>{
  const f=await fixture(),id=f.plans[0];let p=await convertUsdPlans(pool,f.id,[id],'tester');const first=await convertUsdPlans(pool,f.id,[id],'tester',p.previewToken),target=first.plans[0].targetId;
  await pool.query("UPDATE rate_plans SET refundable=false,cancellation_policy='USD policy',valid_to='2030-12-31' WHERE id=$1",[target]);
  await pool.query("INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,rate,stop_sell,min_stay_arrival)VALUES($1,'2031-02-03',999,true,3)",[target]);
  p=await convertUsdPlans(pool,f.id,[id],'tester');expect(p.plans[0].calendarChanges[0]).toMatchObject({before:{rate:'999.00'},after:{rate:'126.21',stopSell:true,minStayArrival:3,isValidDate:false}});
  const next=await convertUsdPlans(pool,f.id,[id],'tester',p.previewToken);expect(next.plans[0].targetId).toBe(target);
  expect((await pool.query('SELECT refundable,cancellation_policy,valid_to::text FROM rate_plans WHERE id=$1',[target])).rows[0]).toEqual({refundable:'false',cancellation_policy:'USD policy',valid_to:'2030-12-31'});
  expect((await pool.query('SELECT rate,stop_sell FROM rate_calendar_entries WHERE rate_plan_id=$1',[target])).rows).toEqual([{rate:null,stop_sell:true}]);
 });
 it('rolls back the first created copy if creating a later plan fails',async()=>{
  const f=await fixture();await pool.query("UPDATE rate_plans SET name='Reject conversion test' WHERE id=$1",[f.plans[1]]);
  const p=await convertUsdPlans(pool,f.id,f.plans,'tester');
  await pool.query("CREATE OR REPLACE FUNCTION usd_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.name='Reject conversion test · Booking USD' THEN RAISE EXCEPTION 'test rollback';END IF;RETURN NEW;END$$; CREATE TRIGGER usd_test_reject BEFORE INSERT ON rate_plans FOR EACH ROW EXECUTE FUNCTION usd_test_reject()");
  try{await expect(convertUsdPlans(pool,f.id,f.plans,'tester',p.previewToken)).rejects.toThrow('test rollback');}
  finally{await pool.query('DROP TRIGGER IF EXISTS usd_test_reject ON rate_plans; DROP FUNCTION IF EXISTS usd_test_reject()');}
  expect((await pool.query('SELECT 1 FROM rate_plans WHERE room_type_id=$1 AND currency=\'USD\'',[f.id])).rowCount).toBe(0);
  expect((await pool.query('SELECT 1 FROM channex_usd_plans WHERE connection_id=$1',[f.id])).rowCount).toBe(0);
 });
});
