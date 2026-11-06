import {randomUUID} from 'node:crypto';
import express from 'express';
import type {Server} from 'node:http';
import pg from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {registerRestaurantAreaSettingsRoutes} from '../routes/restaurantAreaSettings';
import {loadRolePermissionsCache} from '../permissions';
import {storage} from '../db-storage';
import {refreshRealData} from '../seed';
const suite=process.env.DATABASE_URL?describe:describe.skip;
const prefix=randomUUID().replaceAll('-',''),area=`area-settings-${prefix}`,one=`area-one-${prefix}`,two=`area-two-${prefix}`;
let pool:pg.Pool,server:Server,base:string,hadManagerPermission:boolean,snapshot:any[];
suite('Restaurant sector names and order persistence',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(!['127.0.0.1','localhost'].includes(url.hostname)||!/test/i.test(url.pathname))throw Error('Only local test databases are allowed');
  pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3});
  hadManagerPermission=!!(await pool.query("SELECT 1 FROM role_permissions WHERE role='manager' AND resource_key='api:restaurant:edit-layout'")).rowCount;
  await pool.query("INSERT INTO role_permissions(role,resource_key) VALUES('manager','api:restaurant:edit-layout') ON CONFLICT DO NOTHING");await loadRolePermissionsCache();
  await pool.query("INSERT INTO restaurant_areas(id,name,area_type,capacity,has_tables,is_active) VALUES($1,'Sector sintético','indoor',20,'true','true')",[area]);
  await refreshRealData();
  snapshot=(await pool.query('SELECT id,name,display_order FROM restaurant_areas')).rows;
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.isAuthenticated=(()=>req.headers['x-role']!=='anonymous') as any;req.user={id:'synthetic-manager',role:String(req.headers['x-role']||'manager')} as any;next();});registerRestaurantAreaSettingsRoutes(app);
  server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${(server.address() as any).port}`;
 },60000);

 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(pool){for(const row of snapshot||[])await pool.query('UPDATE restaurant_areas SET name=$2,display_order=$3 WHERE id=$1',[row.id,row.name,row.display_order]);await pool.query('DELETE FROM restaurant_areas WHERE id=$1',[area]);if(!hadManagerPermission)await pool.query("DELETE FROM role_permissions WHERE role='manager' AND resource_key='api:restaurant:edit-layout'");await loadRolePermissionsCache();await pool.end();}});
 async function current(){return (await storage.getRestaurantAreas()).map(row=>({id:row.id,name:row.name,expectedName:row.name,expectedOrder:row.displayOrder}));}
 async function post(areas:any[],role='manager'){const response=await fetch(base+'/api/restaurant/area-settings',{method:'PATCH',headers:{'Content-Type':'application/json','x-role':role},body:JSON.stringify({areas})});return {status:response.status,body:await response.json()};}
 it('persists names and custom order through fresh reads and repeated real startup refreshes',async()=>{
  const input=(await current()).reverse().map(row=>({...row,name:row.id==='area1'?'Sector Moneda (Mesas 1-14)':row.id==='area2'?'Sector Bodega (Mesas 15-29)':row.id==='area-terraza'?'Terraza/Consumos Internos':row.name}));
  expect((await post(input)).status).toBe(200);
  expect((await post(input)).status).toBe(200);
  const saved=await storage.getRestaurantAreas();expect(saved.map(row=>row.id)).toEqual(input.map(row=>row.id));
  await refreshRealData();await refreshRealData();
  expect((await storage.getRestaurantAreas()).map(row=>({id:row.id,name:row.name,displayOrder:row.displayOrder}))).toEqual(saved.map(row=>({id:row.id,name:row.name,displayOrder:row.displayOrder})));
 });
 it('checks permissions, stale changes and blank names without overwriting the saved list',async()=>{
  const input=await current();expect((await post(input,'anonymous')).status).toBe(401);expect((await post(input,'housekeeping')).status).toBe(403);
  const bad=input.map((row,index)=>index===0?{...row,name:''}:row);expect((await post(bad)).status).toBe(400);
  await pool.query('UPDATE restaurant_areas SET name=$2 WHERE id=$1',[input[0].id,'Edición de otro usuario']);
  expect((await post(input.map((row,index)=>index===1?{...row,name:'Otro cambio'}:row))).status).toBe(409);
  expect((await storage.getRestaurantAreas())[0].name).toBe('Edición de otro usuario');
 });
 it('rolls back all sector updates when a later row fails',async()=>{
  const input=await current(),before=await storage.getRestaurantAreas(),name=`fail_areas_${prefix}`;
  await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${input[1].id}' THEN RAISE EXCEPTION 'synthetic error'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${name} BEFORE UPDATE ON restaurant_areas FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  try{expect((await post(input.map(row=>({...row,name:row.name+' nuevo'})))).status).toBe(500);expect(await storage.getRestaurantAreas()).toEqual(before);}finally{await pool.query(`DROP TRIGGER ${name} ON restaurant_areas; DROP FUNCTION ${name}()`);}
 });
});
