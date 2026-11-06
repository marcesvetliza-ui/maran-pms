import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import pg from 'pg';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { registerRestaurantLayoutRoutes } from '../routes/restaurantLayout';
import { loadRolePermissionsCache } from '../permissions';
const available=!!process.env.DATABASE_URL;
const suite=available?describe:describe.skip;
const prefix=randomUUID().replaceAll('-',''),area=`layout-area-${prefix}`,one=`layout-one-${prefix}`,two=`layout-two-${prefix}`;
let pool:pg.Pool,server:Server,base:string,hadManagerPermission:boolean;
suite('Restaurant layout persistence and concurrency with real PostgreSQL',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(!['127.0.0.1','localhost'].includes(url.hostname)||!/test/i.test(url.pathname))throw Error('Only local test databases are allowed');
  pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3});
  hadManagerPermission=!!(await pool.query("SELECT 1 FROM role_permissions WHERE role='manager' AND resource_key='api:restaurant:edit-layout'")).rowCount;
  await pool.query("INSERT INTO role_permissions(role,resource_key) VALUES('manager','api:restaurant:edit-layout') ON CONFLICT DO NOTHING");await loadRolePermissionsCache();
  await pool.query("INSERT INTO restaurant_areas(id,name,area_type,capacity,has_tables,is_active) VALUES($1,'Sector sintético','indoor',20,'true','true')",[area]);
  await pool.query("INSERT INTO restaurant_tables(id,table_number,area_id,capacity,status,position_x,position_y) VALUES($1,'101',$3,4,'occupied',0,0),($2,'102',$3,6,'reserved',1,0)",[one,two,area]);
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.isAuthenticated=(()=>req.headers['x-role']!=='anonymous') as any;req.user={id:'synthetic-manager',role:String(req.headers['x-role']||'manager')} as any;next();});registerRestaurantLayoutRoutes(app);
  server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${(server.address() as any).port}`;
 },60000);
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(pool){await pool.query('DELETE FROM restaurant_tables WHERE area_id=$1',[area]);await pool.query('DELETE FROM restaurant_areas WHERE id=$1',[area]);if(!hadManagerPermission)await pool.query("DELETE FROM role_permissions WHERE role='manager' AND resource_key='api:restaurant:edit-layout'");await loadRolePermissionsCache();await pool.end();}});
 const patch=(id:string,x:number,y:number,expectedX:number,expectedY:number)=>({id,areaId:area,positionX:x,positionY:y,expectedPositionX:expectedX,expectedPositionY:expectedY});
 async function post(tables:any[],role='manager'){const response=await fetch(base+'/api/restaurant/layout',{method:'PATCH',headers:{'Content-Type':'application/json','x-role':role},body:JSON.stringify({tables})});return {status:response.status,body:await response.json()};}
 async function reset(){await pool.query('UPDATE restaurant_tables SET position_x=CASE WHEN id=$1 THEN 0 ELSE 1 END,position_y=0 WHERE id IN ($1,$2)',[one,two]);}
 it('persists both sides of a swap, survives a fresh read, and retries a lost response safely',async()=>{
  await reset();const rows=[patch(one,1,0,0,0),patch(two,0,0,1,0)];expect((await post(rows)).status).toBe(200);
  expect((await pool.query('SELECT id,position_x,position_y,status,capacity FROM restaurant_tables WHERE area_id=$1 ORDER BY table_number',[area])).rows).toEqual([{id:one,position_x:1,position_y:0,status:'occupied',capacity:4},{id:two,position_x:0,position_y:0,status:'reserved',capacity:6}]);
  expect((await post(rows)).body).toMatchObject({saved:true,updated:0});
 });
 it('rejects a stale concurrent editor instead of silently overwriting the saved layout',async()=>{
  await reset();const results=await Promise.all([post([patch(one,2,1,0,0)]),post([patch(one,3,1,0,0)])]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);
 });
 it('enforces layout permission and validates occupied cells and sector bounds without changing tables',async()=>{
  await reset();expect((await post([patch(one,2,0,0,0)],'anonymous')).status).toBe(401);expect((await post([patch(one,2,0,0,0)],'housekeeping')).status).toBe(403);
  expect((await post([patch(one,1,0,0,0)])).status).toBe(409);expect((await post([patch(one,8,0,0,0)])).status).toBe(409);
  expect((await pool.query('SELECT position_x FROM restaurant_tables WHERE id=$1',[one])).rows[0].position_x).toBe(0);
 });
 it('rolls back every moved table when a later write fails',async()=>{
  await reset();const name=`reject_layout_${prefix}`;
  await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${two}' THEN RAISE EXCEPTION 'synthetic layout failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${name} BEFORE UPDATE OF position_x ON restaurant_tables FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  try{expect((await post([patch(one,2,1,0,0),patch(two,3,1,1,0)])).status).toBe(500);expect((await pool.query('SELECT position_x FROM restaurant_tables WHERE id=$1',[one])).rows[0].position_x).toBe(0);}finally{await pool.query(`DROP TRIGGER ${name} ON restaurant_tables; DROP FUNCTION ${name}()`);}
 });
});
