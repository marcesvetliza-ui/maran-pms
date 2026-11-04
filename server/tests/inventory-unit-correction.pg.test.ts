import express from 'express';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
import {inventoryUnitCorrectionWindow} from '../inventoryUnitCorrection';
const suite=process.env.DATABASE_URL==='postgresql://postgres:remito_test@127.0.0.1:55432/remito_test'?describe:describe.skip;
let pool:typeof import('../db').pool,server:http.Server,url:string,id:string,role='admin';
const actor='unit-correction-test';
async function request(method:string,path:string,body?:any){const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
async function snapshot(){return {
 item:(await pool.query('SELECT * FROM inventory_items WHERE id=$1::text',[id])).rows,
 stock:(await pool.query('SELECT * FROM warehouse_stock WHERE item_id=$1::text',[id])).rows,
 movements:(await pool.query('SELECT * FROM stock_movements WHERE item_id=$1::text',[id])).rows,
 conversions:(await pool.query('SELECT * FROM inventory_unit_conversions WHERE item_id=$1::text ORDER BY from_unit',[id])).rows,
};}
suite('Temporary inventory base-unit correction on disposable PostgreSQL',()=>{
 beforeAll(async()=>{
  ({pool}=await import('../db'));await (await import('../permissions')).loadRolePermissionsCache();
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:actor,username:actor,role} as any;req.isAuthenticated=()=>true;next();});
  (await import('../routes/inventory')).registerInventoryRoutes(app);server=http.createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+(server.address() as any).port;
 });
 beforeEach(async()=>{
  id=randomUUID();role='admin';inventoryUnitCorrectionWindow.enabled=true;
  await pool.query("INSERT INTO inventory_items(id,name,unit,current_stock,cost_price,min_stock,critical_stock) VALUES($1::text,$1::text,'unidad',12,100,2,1)",[id]);
  await pool.query('INSERT INTO inventory_warehouses(id,name) VALUES($1::text,$1::text)',[id]);
  await pool.query('INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES($1::text,$1::text,12)',[id]);
  await pool.query("INSERT INTO stock_movements(id,item_id,movement_type,quantity,previous_stock,new_stock,warehouse_id,created_at) VALUES($1::text,$1::text,'entrada',12,0,12,$1::text,now())",[id]);
  await pool.query("INSERT INTO inventory_unit_conversions(item_id,from_unit,factor) VALUES($1::text,'caja',6)",[id]);
 });
 afterEach(async()=>{
  inventoryUnitCorrectionWindow.enabled=true;await pool.query('DELETE FROM audit_logs WHERE user_id=$1::text',[actor]);
  await pool.query('DELETE FROM inventory_consumption_jobs WHERE source_id=$1::text',[id]);
  await pool.query('DELETE FROM recipe_ingredients WHERE recipe_id=$1::text',[id]);await pool.query('DELETE FROM recipes WHERE id=$1::text',[id]);
  await pool.query('DELETE FROM stock_movements WHERE item_id=$1::text',[id]);await pool.query('DELETE FROM warehouse_stock WHERE item_id=$1::text',[id]);
  await pool.query('DELETE FROM inventory_unit_conversions WHERE item_id=$1::text',[id]);await pool.query('DELETE FROM inventory_items WHERE id=$1::text',[id]);await pool.query('DELETE FROM inventory_warehouses WHERE id=$1::text',[id]);
 });
 afterAll(async()=>{await new Promise<void>(r=>server.close(()=>r()));await pool.end();});
 it.each(['','/metadata'])('corrects via the actual item editor/API %s, retains quantities/history and audits previous conversions',async(suffix)=>{
  const before=await snapshot();const body=suffix?{name:id,minStock:'2',unit:'kg',conversions:[{fromUnit:'caja',factor:'2'}]}:{unit:'kg',conversions:[{fromUnit:'caja',factor:'2'}]};
  const r=await request('PATCH',`/api/inventory/items/${id}${suffix}`,body);expect(r.status,JSON.stringify(r.body)).toBe(200);
  const after=await snapshot();expect(after.item[0]).toEqual({...before.item[0],unit:'kg'});expect(after.stock).toEqual(before.stock);expect(after.movements).toEqual(before.movements);
  expect(after.conversions).toHaveLength(1);expect(after.conversions[0].from_unit).toBe('caja');expect(Number(after.conversions[0].factor)).toBe(2);
  const audit=(await pool.query('SELECT details FROM audit_logs WHERE entity_id=$1::text',[id])).rows[0].details;
  const details=typeof audit==='string'?JSON.parse(audit):audit;
  expect(details).toMatchObject({before:{unit:'unidad'},after:{unit:'kg'},previousConversions:[{from_unit:'caja'}],quantitiesConverted:false});
 });
 it('closing the one maintenance flag relocks both endpoints and capability immediately',async()=>{
  inventoryUnitCorrectionWindow.enabled=false;
  expect((await request('GET','/api/inventory/unit-correction-mode')).body).toEqual({enabled:false});
  const before=await snapshot();for(const suffix of ['','/metadata'])expect((await request('PATCH',`/api/inventory/items/${id}${suffix}`,{name:id,minStock:'2',unit:'kg',allowUnitCorrection:true})).status).toBe(403);
  expect(await snapshot()).toEqual(before);
 });
 it('a caller cannot bypass the storage history guard by omitting server authorisation',async()=>{
  const {storage}=await import('../db-storage');await expect(storage.updateInventoryItem(id,{unit:'kg'})).rejects.toMatchObject({statusCode:409});
 });
 it('the warehouse supervisor can correct from the real metadata editor with the catalogue permission',async()=>{
  role='resp_deposito';expect((await request('GET','/api/inventory/unit-correction-mode')).body).toEqual({enabled:true});
  const before=await snapshot();const r=await request('PATCH',`/api/inventory/items/${id}/metadata`,{name:id,minStock:'2',unit:'kg',conversions:[]});
  expect(r.status,JSON.stringify(r.body)).toBe(200);const after=await snapshot();expect(after.item[0].unit).toBe('kg');expect(after.stock).toEqual(before.stock);expect(after.movements).toEqual(before.movements);
  inventoryUnitCorrectionWindow.enabled=false;expect((await request('GET','/api/inventory/unit-correction-mode')).body).toEqual({enabled:false});
  expect((await request('PATCH',`/api/inventory/items/${id}/metadata`,{name:id,minStock:'2',unit:'g'})).status).toBe(403);
 });
 it('reception cannot unlock through the API',async()=>{
  role='reception';expect((await request('GET','/api/inventory/unit-correction-mode')).status).toBe(403);
  expect((await request('PATCH',`/api/inventory/items/${id}/metadata`,{name:id,minStock:'2',unit:'kg',allowUnitCorrection:true})).status).toBe(403);
 });
 it('still blocks quantity changes, invalid units, and pending consumption',async()=>{
  expect((await request('PATCH',`/api/inventory/items/${id}`,{unit:'kg',currentStock:99})).status).toBe(409);
  expect((await request('PATCH',`/api/inventory/items/${id}`,{unit:'invalid'})).status).toBe(400);
  await pool.query("INSERT INTO inventory_consumption_jobs(id,source_type,source_id,lines,status) VALUES($1::text,'test',$1::text,$2::jsonb,'pending')",[id,JSON.stringify([{itemId:id,quantity:1}])]);
  const before=await snapshot();expect((await request('PATCH',`/api/inventory/items/${id}`,{unit:'kg'})).status).toBe(409);expect(await snapshot()).toEqual(before);
 });
 it('preserves recipe quantities and requires a valid new-base equivalence before committing',async()=>{
  await pool.query("INSERT INTO recipes(id,name,is_base) VALUES($1::text,$1::text,false)",[id]);
  await pool.query("INSERT INTO recipe_ingredients(id,recipe_id,inventory_item_id,ingredient_name,quantity,unit,unit_cost) VALUES($1::text,$1::text,$1::text,'Prueba',1,'caja',600)",[id]);
  const before=await snapshot();expect((await request('PATCH',`/api/inventory/items/${id}/metadata`,{name:id,minStock:'2',unit:'kg',conversions:[]})).status).toBe(409);expect(await snapshot()).toEqual(before);
  const saved=await request('PATCH',`/api/inventory/items/${id}/metadata`,{name:id,minStock:'2',unit:'kg',conversions:[{fromUnit:'caja',factor:'2'}]});expect(saved.status,JSON.stringify(saved.body)).toBe(200);
  const ingredient=(await pool.query('SELECT quantity,unit,unit_cost FROM recipe_ingredients WHERE id=$1',[id])).rows[0];expect(Number(ingredient.quantity)).toBe(1);expect(ingredient.unit).toBe('caja');expect(Number(ingredient.unit_cost)).toBe(200);
 });
 it('a failed equivalence rolls back unit, stock and historical conversion deletion',async()=>{
  const before=await snapshot();expect((await request('PATCH',`/api/inventory/items/${id}`,{unit:'kg',conversions:[{fromUnit:'g',factor:99}]})).status).toBe(400);expect(await snapshot()).toEqual(before);
 });
});
