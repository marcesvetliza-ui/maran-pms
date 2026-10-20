import {randomUUID} from 'node:crypto';
import express from 'express';
import http from 'node:http';
import pg from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
const url=process.env.DATABASE_URL;
if(url&&(!['localhost','127.0.0.1'].includes(new URL(url).hostname)||!/test/.test(new URL(url).pathname)))throw new Error('Local disposable test database required');
const suite=url?describe:describe.skip;
const pool=url?new pg.Pool({connectionString:url}):null;
suite('Exceptional unit label correction',()=>{
 let correct:typeof import('../inventoryUnitCorrection').correctInventoryUnit;
 let admin:string,authorized:string,other:string;
 const users:string[]=[];
 const prefix=randomUUID();
 let server:http.Server,baseUrl:string;
 beforeAll(async()=>{
  await (await import('../inventoryStage2Schema')).ensureInventoryStage2Schema();
  ({correctInventoryUnit:correct}=await import('../inventoryUnitCorrection'));
  for(const [role,grant] of [['admin',false],['responsable_area',true],['responsable_area',false]] as const){
   const id=randomUUID();users.push(id);
   await pool!.query('INSERT INTO system_users(id,username,email,full_name,role,is_active,can_correct_inventory_unit,created_at) VALUES($1,$2,$3,$4,$5,\'true\',$6,now())',[id,prefix+id,'test@example.com','Correction operator',role,grant]);
  }
  [admin,authorized,other]=users;
  await (await import('../permissions')).loadRolePermissionsCache();
  const app=express();app.use(express.json());
  app.use((req:any,_res,next)=>{
   const id=String(req.headers['x-test-actor']||other);
   req.user={id,role:id===admin?'admin':'responsable_area'};req.isAuthenticated=()=>true;next();
  });
  (await import('../routes/inventory')).registerInventoryRoutes(app);
  server=http.createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  baseUrl='http://127.0.0.1:'+(server.address() as any).port;
 });
 afterAll(async()=>{
  if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
  await pool!.query('DELETE FROM audit_logs WHERE user_id=ANY($1::varchar[])',[users]);
  await pool!.query('DELETE FROM system_users WHERE id=ANY($1::varchar[])',[users]);await pool!.end();
 });
 async function fixture(run:(id:string,recipe:string,warehouse:string)=>Promise<void>){
  const id=randomUUID(),recipe=randomUUID(),warehouse=randomUUID();
  try{
   await pool!.query("INSERT INTO inventory_items(id,name,unit,current_stock,cost_price,min_stock,critical_stock) VALUES($1,'Pollo mal rotulado','unidad',10,6000,2,1)",[id]);
   await pool!.query("INSERT INTO inventory_warehouses(id,name) VALUES($1,'Correction warehouse')",[warehouse]);
   await pool!.query('INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES($1,$2,10)',[id,warehouse]);
   await pool!.query("INSERT INTO recipes(id,name,is_base) VALUES($1,'Pollo recipe',true)",[recipe]);
   await pool!.query("INSERT INTO recipe_ingredients(recipe_id,inventory_item_id,ingredient_name,quantity,unit,unit_cost) VALUES($1,$2,'Pollo',0.3,'unidad',6000)",[recipe,id]);
   await pool!.query("INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,warehouse_id,created_at) VALUES($1,'entrada',10,0,10,$2,now())",[id,warehouse]);
   await pool!.query("INSERT INTO inventory_consumption_jobs(source_type,source_id,lines) VALUES('unit_correction_test',$1,$2::jsonb)",[id,JSON.stringify([{itemId:id,unit:'unidad',quantity:0.3}])]);
   await run(id,recipe,warehouse);
  }finally{
   await pool!.query('DELETE FROM audit_logs WHERE entity_id=$1',[id]);
   await pool!.query("DELETE FROM inventory_pending_productions WHERE payload->>'recipeId'=$1",[recipe]);
   await pool!.query('DELETE FROM inventory_consumption_jobs WHERE source_id=$1',[id]);
   await pool!.query('DELETE FROM recipe_ingredients WHERE recipe_id=$1',[recipe]);
   await pool!.query('DELETE FROM recipes WHERE id=$1',[recipe]);
   await pool!.query('DELETE FROM inventory_unit_conversions WHERE item_id=$1',[id]);
   await pool!.query('DELETE FROM stock_movements WHERE item_id=$1',[id]);
   await pool!.query('DELETE FROM warehouse_stock WHERE item_id=$1',[id]);
   await pool!.query('DELETE FROM inventory_warehouses WHERE id=$1',[warehouse]);
   await pool!.query('DELETE FROM inventory_items WHERE id=$1',[id]);
  }
 }
 it.each(['admin','named operator'])('%s changes labels atomically without scaling stock, prices, or history',async who=>fixture(async(id,recipe)=>{
  const actor=who==='admin'?admin:authorized;
  const before=(await pool!.query('SELECT * FROM stock_movements WHERE item_id=$1',[id])).rows;
  const preview=await correct(actor,id,{newUnit:'kg'});
  expect(preview).toMatchObject({oldUnit:'unidad',newUnit:'kg',stock:'10.000',costPrice:'6000.00'});
  expect((await pool!.query('SELECT unit FROM inventory_items WHERE id=$1',[id])).rows[0].unit).toBe('unidad');
  await correct(actor,id,{newUnit:'kg',mode:'label_only',reason:'La cantidad ya estaba en kg',token:preview.token},true);
  expect((await pool!.query('SELECT unit,current_stock,cost_price,min_stock,critical_stock FROM inventory_items WHERE id=$1',[id])).rows[0]).toEqual({unit:'kg',current_stock:'10.000',cost_price:'6000.00',min_stock:'2.000',critical_stock:'1.000'});
  expect((await pool!.query('SELECT current_stock FROM warehouse_stock WHERE item_id=$1',[id])).rows[0].current_stock).toBe('10.000');
  expect((await pool!.query('SELECT unit,quantity,unit_cost FROM recipe_ingredients WHERE recipe_id=$1',[recipe])).rows[0]).toEqual({unit:'kg',quantity:'0.300',unit_cost:'6000.00'});
  expect((await pool!.query('SELECT lines FROM inventory_consumption_jobs WHERE source_id=$1',[id])).rows[0].lines).toEqual([{itemId:id,unit:'kg',quantity:0.3}]);
  expect((await pool!.query('SELECT * FROM stock_movements WHERE item_id=$1',[id])).rows).toEqual(before);
  const audit=(await pool!.query("SELECT details,user_id FROM audit_logs WHERE entity_type='inventory_unit_correction' AND entity_id=$1",[id])).rows;
  expect(audit).toHaveLength(1);expect(audit[0].user_id).toBe(actor);
  expect(JSON.parse(audit[0].details)).toMatchObject({mode:'label_only',oldUnit:'unidad',newUnit:'kg'});
 }));
 it('requires the targeted permission, fresh preview, explicit mode and reason',async()=>fixture(async id=>{
  await expect(correct(other,id,{newUnit:'kg'})).rejects.toMatchObject({statusCode:403});
  const preview=await correct(admin,id,{newUnit:'kg'});
  await expect(correct(admin,id,{newUnit:'kg',token:preview.token,mode:'label_only',reason:' '},true)).rejects.toMatchObject({statusCode:400});
  await pool!.query('UPDATE inventory_items SET current_stock=11 WHERE id=$1',[id]);
  await expect(correct(admin,id,{newUnit:'kg',token:preview.token,mode:'label_only',reason:'Fix'},true)).rejects.toThrow(/vista previa/);
  await pool!.query('UPDATE system_users SET can_correct_inventory_unit=false WHERE id=$1',[authorized]);
  await expect(correct(authorized,id,{newUnit:'kg'})).rejects.toMatchObject({statusCode:403});
  await (await import('../inventoryStage2Schema')).ensureInventoryUnitCorrectionPermission();
  expect((await pool!.query('SELECT can_correct_inventory_unit FROM system_users WHERE id=$1',[authorized])).rows[0].can_correct_inventory_unit).toBe(false);
  await pool!.query("UPDATE system_users SET full_name='Gonzalo Villanueva' WHERE id=$1",[other]);
  await (await import('../inventoryStage2Schema')).ensureInventoryUnitCorrectionPermission();
  await expect(correct(other,id,{newUnit:'kg'})).rejects.toMatchObject({statusCode:403});
 }));
 it('preserves incompatible conversions and blocks pending production instead of silently changing its formula',async()=>fixture(async(id,recipe)=>{
  await pool!.query("INSERT INTO inventory_unit_conversions(item_id,from_unit,factor) VALUES($1,'g',3000)",[id]);
  await expect(correct(admin,id,{newUnit:'kg'})).rejects.toThrow(/equivalencias incompatibles/);
  expect((await pool!.query('SELECT unit FROM inventory_items WHERE id=$1',[id])).rows[0].unit).toBe('unidad');
  await pool!.query('DELETE FROM inventory_unit_conversions WHERE item_id=$1',[id]);
  await pool!.query("INSERT INTO inventory_pending_productions(request_id,payload,formula_hash) VALUES($1,$2::jsonb,'existing')",[randomUUID(),JSON.stringify({recipeId:recipe})]);
  await expect(correct(admin,id,{newUnit:'kg'})).rejects.toThrow(/producciones pendientes/);
 }));
 it('corrects live production, SPA and open count labels while keeping closed documents intact',async()=>fixture(async(id,recipe,warehouse)=>{
  const output=randomUUID(),count=randomUUID(),closed=randomUUID(),supply=randomUUID();
  try{
   await pool!.query("INSERT INTO recipes(id,name,is_base,production_unit,production_yield,output_inventory_item_id) VALUES($1,'Output',true,'unidad',5,$2)",[output,id]);
   await pool!.query("INSERT INTO recipe_ingredients(recipe_id,sub_recipe_id,ingredient_name,quantity,unit,unit_cost) VALUES($1,$2,'Output',0.2,'unidad',6000)",[recipe,output]);
   await pool!.query("INSERT INTO treatment_supplies(id,treatment_id,inventory_item_id,quantity,unit) VALUES($1,$2,$3,0.1,'unidad')",[supply,randomUUID(),id]);
   await pool!.query("INSERT INTO inventory_counts(id,date,warehouse_id,status) VALUES($1,CURRENT_DATE,$3,'borrador'),($2,CURRENT_DATE,$3,'cerrado')",[count,closed,warehouse]);
   await pool!.query("INSERT INTO inventory_count_items(count_id,item_id,item_name,unit,expected_stock,actual_stock) VALUES($1,$3,'Pollo','unidad',10,10),($2,$3,'Pollo','unidad',10,10)",[count,closed,id]);
   const preview=await correct(admin,id,{newUnit:'kg'});
   await correct(admin,id,{newUnit:'kg',mode:'label_only',reason:'Sólo etiqueta',token:preview.token},true);
   expect((await pool!.query('SELECT production_unit,production_yield FROM recipes WHERE id=$1',[output])).rows[0]).toEqual({production_unit:'kg',production_yield:'5.000'});
   expect((await pool!.query('SELECT unit,quantity,unit_cost FROM recipe_ingredients WHERE sub_recipe_id=$1',[output])).rows[0]).toEqual({unit:'kg',quantity:'0.200',unit_cost:'6000.00'});
   expect((await pool!.query('SELECT unit,quantity FROM treatment_supplies WHERE id=$1',[supply])).rows[0]).toEqual({unit:'kg',quantity:'0.100'});
   expect((await pool!.query('SELECT unit,expected_stock,actual_stock FROM inventory_count_items WHERE count_id=$1',[count])).rows[0]).toEqual({unit:'kg',expected_stock:'10.000',actual_stock:'10.000'});
   expect((await pool!.query('SELECT unit FROM inventory_count_items WHERE count_id=$1',[closed])).rows[0].unit).toBe('unidad');
  }finally{
   await pool!.query('DELETE FROM inventory_count_items WHERE count_id=ANY($1::varchar[])',[[count,closed]]);
   await pool!.query('DELETE FROM inventory_counts WHERE id=ANY($1::varchar[])',[[count,closed]]);
   await pool!.query('DELETE FROM treatment_supplies WHERE id=$1',[supply]);
   await pool!.query('DELETE FROM recipe_ingredients WHERE sub_recipe_id=$1',[output]);
   await pool!.query('DELETE FROM recipes WHERE id=$1',[output]);
  }
 }));
 it('real API permits only authorized users and keeps existing cost visibility rules',async()=>fixture(async id=>{
  await pool!.query('UPDATE system_users SET can_correct_inventory_unit=true WHERE id=$1',[authorized]);
  const call=async(actor:string,method:string,path:string,body?:any)=>{
   const response=await fetch(baseUrl+path,{method,headers:{'Content-Type':'application/json','x-test-actor':actor},body:body?JSON.stringify(body):undefined});
   return {status:response.status,body:await response.json()};
  };
  expect((await call(other,'GET','/api/inventory/unit-correction-access')).body).toEqual({allowed:false});
  expect((await call(authorized,'GET','/api/inventory/unit-correction-access')).body).toEqual({allowed:true});
  expect((await call(other,'POST',`/api/inventory/items/${id}/unit-correction/preview`,{newUnit:'kg'})).status).toBe(403);
  const blocker=await pool!.connect();
  try {
   await blocker.query('BEGIN');
   await blocker.query('SELECT id FROM recipe_ingredients WHERE inventory_item_id=$1 FOR UPDATE',[id]);
   const busy=await call(admin,'POST',`/api/inventory/items/${id}/unit-correction/preview`,{newUnit:'kg'});
   expect(busy.status).toBe(409);expect(busy.body.error).toMatch(/operación en curso/);
  } finally {await blocker.query('ROLLBACK');blocker.release();}
  const preview=await call(authorized,'POST',`/api/inventory/items/${id}/unit-correction/preview`,{newUnit:'kg'});
  expect(preview.status).toBe(200);expect(preview.body.costPrice).toBeNull();
  const applied=await call(authorized,'POST',`/api/inventory/items/${id}/unit-correction/apply`,{newUnit:'kg',token:preview.body.token,mode:'label_only',reason:'Unidad cargada incorrectamente'});
  expect(applied.status).toBe(200);expect(applied.body.applied).toBe(true);
  expect((await pool!.query('SELECT cost_price FROM inventory_items WHERE id=$1',[id])).rows[0].cost_price).toBe('6000.00');
 }));
 it.each([1,2])('initial grant requires one unique existing Gonzalo account (matches=%s)',async matches=>{
  const {db,withDatabaseTransaction}=await import('../db');
  const {sql}=await import('drizzle-orm');
  const {ensureInventoryUnitCorrectionPermission}=await import('../inventoryStage2Schema');
  const schema='unitfix_seed_'+randomUUID().replaceAll('-','');
  await withDatabaseTransaction(async()=>{
   await db.execute(sql.raw(`CREATE SCHEMA "${schema}"`));
   await db.execute(sql.raw(`SET LOCAL search_path TO "${schema}",public`));
   await db.execute(sql`CREATE TABLE system_users(id varchar PRIMARY KEY,full_name text,is_active text)`);
   await db.execute(sql`CREATE TABLE audit_logs(action text,module text,entity_type text,entity_id text,description text,details text,timestamp timestamp)`);
   for(let i=0;i<matches;i++)await db.execute(sql`INSERT INTO system_users VALUES(${String(i)},'Gonzalo Villanueva','true')`);
   await db.execute(sql`INSERT INTO system_users VALUES('unrelated','Other responsible','true')`);
   await ensureInventoryUnitCorrectionPermission();
   const rows=(await db.execute(sql`SELECT id,can_correct_inventory_unit FROM system_users ORDER BY id`)).rows;
   expect(rows.filter(row=>row.can_correct_inventory_unit)).toHaveLength(matches===1?1:0);
   // Revocation remains effective on every later startup.
   await db.execute(sql`UPDATE system_users SET can_correct_inventory_unit=false`);
   await ensureInventoryUnitCorrectionPermission();
   expect((await db.execute(sql`SELECT id FROM system_users WHERE can_correct_inventory_unit=true`)).rows).toEqual([]);
   await db.execute(sql.raw(`SET LOCAL search_path TO public`));
   await db.execute(sql.raw(`DROP SCHEMA "${schema}" CASCADE`));
  });
 });
});
