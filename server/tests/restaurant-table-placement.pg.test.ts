import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import pg from 'pg';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';

const suite=process.env.DATABASE_URL?describe:describe.skip;
const prefix='table-placement-'+randomUUID(),area=prefix+'-indoor',event=prefix+'-event';
let pool:pg.Pool,server:Server,base:string;
suite('Restaurant table creation uses a visible free cell',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(!['127.0.0.1','localhost'].includes(url.hostname)||!/test/i.test(url.pathname))throw Error('Only a disposable local test database is allowed');
  pool=new pg.Pool({connectionString:url.toString()});
  await pool.query("INSERT INTO restaurant_areas(id,name,area_type,capacity,has_tables,is_active)VALUES($1,'Synthetic sparse plan','indoor',72,'true','true'),($2,'Synthetic event plan','event',60,'true','true')",[area,event]);
  const {registerRestaurantRoutes}=await import('../routes/restaurant');const app=express();app.use(express.json());registerRestaurantRoutes(app);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${(server.address() as any).port}`;
 },60000);
 beforeEach(async()=>{await pool.query('DELETE FROM restaurant_tables WHERE area_id IN($1,$2)',[area,event]);await pool.query("UPDATE restaurant_areas SET has_tables='true',is_active='true' WHERE id IN($1,$2)",[area,event]);});
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(pool){await pool.query('DELETE FROM restaurant_tables WHERE area_id IN($1,$2)',[area,event]);await pool.query('DELETE FROM restaurant_areas WHERE id IN($1,$2)',[area,event]);await pool.end();}});
 async function create(tableNumber:string,areaId=area,extra={}){const response=await fetch(base+'/api/restaurant/tables',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tableNumber,areaId,capacity:4,...extra})});return {status:response.status,body:await response.json()};}
 async function fill(areaId:string,columns:number,count:number){await pool.query("INSERT INTO restaurant_tables(id,table_number,area_id,capacity,status,position_x,position_y) SELECT $1||'-'||i,i::text,$1,4,'available',i%$2,i/$2 FROM generate_series(0,$3::int-1)i",[areaId,columns,count]);}
 it('creates BIS in the first real gap, ignoring the old client outside position and preserving every existing table',async()=>{
  await pool.query("INSERT INTO restaurant_tables(id,table_number,area_id,capacity,status,position_x,position_y)VALUES($1||'-one','1',$1,6,'occupied',0,0),($1||'-edge','17',$1,4,'reserved',7,5)",[area]);
  const before=(await pool.query('SELECT * FROM restaurant_tables WHERE area_id=$1 ORDER BY id',[area])).rows;
  const result=await create('13BIS',area,{positionX:0,positionY:6});expect(result.status).toBe(201);expect(result.body).toMatchObject({tableNumber:'13BIS',areaId:area,positionX:1,positionY:0,capacity:4,status:'available'});
  expect((await pool.query('SELECT * FROM restaurant_tables WHERE id=ANY($1) ORDER BY id',[before.map(t=>t.id)])).rows).toEqual(before);
 });
 it('allocates distinct cells for two simultaneous creates with the same stale requested cell',async()=>{
  const results=await Promise.all([create('12BIS',area,{positionX:0,positionY:0}),create('13BIS',area,{positionX:0,positionY:0})]);
  expect(results.map(r=>r.status)).toEqual([201,201]);expect(results.map(r=>`${r.body.positionX}:${r.body.positionY}`).sort()).toEqual(['0:0','1:0']);
 });
 it('fills the last event cell once and rejects the concurrent extra table without a false success',async()=>{
  await fill(event,5,14);const results=await Promise.all([create('A',event),create('B',event)]);
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);expect(results.find(r=>r.status===201)?.body).toMatchObject({positionX:4,positionY:2});expect(results.find(r=>r.status===409)?.body.error).toContain('no fue creada');expect((await pool.query('SELECT count(*)::int AS n FROM restaurant_tables WHERE area_id=$1',[event])).rows[0].n).toBe(15);
 });
 it('rejects a full indoor plan without adding another invisible table',async()=>{
  await fill(area,8,48);expect((await create('EXTRA')).status).toBe(409);expect((await pool.query('SELECT count(*)::int AS n FROM restaurant_tables WHERE area_id=$1',[area])).rows[0].n).toBe(48);
 });
 it('does not count inactive tables or outside legacy coordinates as occupied cells',async()=>{
  await pool.query("INSERT INTO restaurant_tables(id,table_number,area_id,is_active,position_x,position_y)VALUES($1||'-old','OLD',$1,'false',0,0),($1||'-outside','12BIS',$1,'true',0,6)",[area]);
  expect((await create('NEW')).body).toMatchObject({positionX:0,positionY:0});
  expect((await pool.query('SELECT position_y FROM restaurant_tables WHERE id=$1',[area+'-outside'])).rows[0].position_y).toBe(6);
 });
 it('rejects missing, inactive and table-less sectors',async()=>{
  expect((await create('A',prefix+'-missing')).status).toBe(400);
  await pool.query("UPDATE restaurant_areas SET is_active='false' WHERE id=$1",[area]);expect((await create('A')).status).toBe(400);
  await pool.query("UPDATE restaurant_areas SET is_active='true',has_tables='false' WHERE id=$1",[area]);expect((await create('A')).status).toBe(400);
 });
});
