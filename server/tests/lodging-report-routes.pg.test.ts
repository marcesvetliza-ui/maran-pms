import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {sql} from 'drizzle-orm';
import express from 'express';
import type {Server} from 'node:http';
const state=vi.hoisted(()=>({db:null as any,lastReadOnly:null as string|null}));
vi.mock('../db',()=>({db:{execute:(q:any)=>state.db.execute(q),transaction:(fn:any,config:any)=>state.db.transaction(async(tx:any)=>{const result=await tx.execute(sql`SHOW transaction_read_only`);state.lastReadOnly=result.rows[0].transaction_read_only;return fn(tx);},config)}}));
vi.mock('../auth',()=>({requirePermission:()=> (_q:any,_s:any,n:any)=>n(),requireAuth:(_q:any,_s:any,n:any)=>n()}));
import {loadLodging} from '../reports/lodging';
import {registerReportsRoutes} from '../reports/routes';
const url=process.env.REPORTS_TEST_DATABASE_URL;
describe.skipIf(!url)('lodging read-only report routes with PostgreSQL',()=>{
 let client:Client,server:Server,base:string;
 beforeAll(async()=>{
  const parsed=new URL(url!);if(!['localhost','127.0.0.1'].includes(parsed.hostname)||!parsed.pathname.includes('test'))throw Error('Local test DB required');
  client=new Client({connectionString:url});await client.connect();state.db=drizzle(client);
  await client.query(`CREATE TEMP TABLE rooms(id text,room_number text,room_type_id text,is_active boolean,is_virtual boolean,floor integer);
   CREATE TEMP TABLE room_types(id text,name text);
   CREATE TEMP TABLE reservations(id text,room_id text,room_type_id text,status text,check_in_date date,check_out_date date,total_room_amount numeric,pricing_scheme text,nightly_pricing jsonb,special_rate_reason text,source text,number_of_guests integer);
   CREATE TEMP TABLE maintenance_blocks(room_id text,block_from date,block_to date);`);
  const app=express();registerReportsRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));if(client)await client.end();});
 beforeEach(async()=>{
  await client.query('TRUNCATE rooms,room_types,reservations,maintenance_blocks');
  await client.query("INSERT INTO rooms VALUES('r','101','double',true,false,1),('b','102','double',true,false,1),('v','REUB','double',true,true,99);INSERT INTO room_types VALUES('double','Doble');INSERT INTO maintenance_blocks VALUES('b','2026-11-01','2026-11-02')");
  const pricing=['2026-10-30','2026-10-31','2026-11-01','2026-11-02'].map((date,i)=>({date,rateCents:(i+1)*10000,discountCents:(i+1)*1000}));
  await client.query("INSERT INTO reservations VALUES('s','r','double','checked_out','2026-10-30','2026-11-03',900,'nightly_v1',$1,NULL,'booking',2)",[JSON.stringify(pricing)]);
 });
 it('loads saved net prices, splits month totals and ignores cancelled/virtual stays',async()=>{
  await client.query("INSERT INTO reservations SELECT 'cancelled',room_id,room_type_id,'cancelled',check_in_date,check_out_date,total_room_amount,pricing_scheme,nightly_pricing,special_rate_reason,source,number_of_guests FROM reservations WHERE id='s';INSERT INTO reservations SELECT 'virtual','v',room_type_id,status,check_in_date,check_out_date,total_room_amount,pricing_scheme,nightly_pricing,special_rate_reason,source,number_of_guests FROM reservations WHERE id='s'");
  const october=await loadLodging('2026-10-01','2026-10-31'),november=await loadLodging('2026-11-01','2026-11-30');expect(october.summary.revenue).toBe(270);expect(november.summary.revenue).toBe(630);expect(november.summary.roomNights).toBe(2);expect(november.roomCount).toBe(2);expect(state.lastReadOnly).toBe('on');
 });
 it('keeps KPI totals, channel income and daily detail reconciled without writes',async()=>{
  const before=(await client.query('SELECT * FROM reservations')).rows;
  const response=await fetch(base+'/api/reports/kpis?periodo=11/2026');expect(response.status).toBe(200);const kpis=await response.json();
  expect(kpis.habitacionesOcupadas).toBe(2);expect(kpis.tarifaMedia).toBe(315);expect(kpis.distribucionCanal[0].ingresos).toBe(630);expect(kpis.porDia.reduce((s:number,d:any)=>s+d.ocupadas,0)).toBe(2);
  const detail=await(await fetch(base+'/api/reports/lodging-detail?from=2026-11-01&to=2026-11-30')).json();expect(detail.summary.revenue).toBe(630);expect(detail.summary.capacityNights).toBe(kpis.habitacionesDisponibles);
  expect((await client.query('SELECT * FROM reservations')).rows).toEqual(before);
 });
 it('occupancy by day, category and floor uses room-nights and dated capacity consistently',async()=>{
  const response=await fetch(base+'/api/reports/ocupacion?desde=2026-11-01&hasta=2026-11-30');expect(response.status).toBe(200);const data=await response.json();
  expect(data.porDia[0]).toMatchObject({fecha:'2026-11-01',ocupadas:1,disponibles:1,ingresos:270});expect(data.porTipoHabitacion[0]).toMatchObject({tipo:'Doble',nochesOcupadas:2,ingresos:630,tarifaMedia:315});expect(data.porPiso).toHaveLength(1);expect(data.porPiso[0].ocupacion).toBeCloseTo(data.porTipoHabitacion[0].ocupacion,1);
 });
 it('rejects an invalid detail range without attempting to normalize it into another month',async()=>{const response=await fetch(base+'/api/reports/lodging-detail?from=2026-02-30&to=2026-03-01');expect(response.status).toBe(400);});
});
