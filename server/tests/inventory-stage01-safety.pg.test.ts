import express from 'express';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {beforeAll,beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
const suite=process.env.DATABASE_URL?describe:describe.skip;
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL}):null;
const actor='inventory-stage01-'+randomUUID();
let base='',server:http.Server,role='admin',id:string,a:string,b:string,from:string,to:string,count:string;
let storage:typeof import('../db-storage').storage;
async function request(method:string,path:string,body?:object){return fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
async function current(item=a){return Number((await pool!.query('SELECT current_stock FROM inventory_items WHERE id=$1',[item])).rows[0].current_stock);}
async function warehouse(w=from,item=a){return Number((await pool!.query('SELECT current_stock FROM warehouse_stock WHERE warehouse_id=$1 AND item_id=$2',[w,item])).rows[0]?.current_stock ?? 0);}
async function transfer(quantity:unknown){return request('POST','/api/inventory/transfer',{fromWarehouseId:from,toWarehouseId:to,items:[{itemId:a,quantity}]});}
suite('Inventario fases 0/1: seguridad y concurrencia',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname)||process.env.NODE_ENV==='production')throw new Error('Solo base local aislada');
  ({storage}=await import('../db-storage'));const {loadRolePermissionsCache}=await import('../permissions');await loadRolePermissionsCache();
  const {registerInventoryRoutes}=await import('../routes/inventory');const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:actor,username:'Operador de prueba',role} as any;req.isAuthenticated=()=>true;next();});registerInventoryRoutes(app);server=http.createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 beforeEach(async()=>{
  id='stage01-'+randomUUID();a=id+'-a';b=id+'-b';from=id+'-from';to=id+'-to';count=id+'-count';role='admin';
  await pool!.query("INSERT INTO inventory_items(id,name,current_stock) VALUES($1,'Prueba A',14),($2,'Prueba B',10)",[a,b]);
  await pool!.query("INSERT INTO inventory_warehouses(id,name) VALUES($1,'Origen'),($2,'Destino')",[from,to]);
  await pool!.query('INSERT INTO warehouse_stock(warehouse_id,item_id,current_stock) VALUES($1,$2,10),($1,$3,10)',[from,a,b]);
  await pool!.query("INSERT INTO inventory_counts(id,date) VALUES($1,'2026-10-07')",[count]);
  await pool!.query("INSERT INTO inventory_count_items(count_id,item_id,item_name,expected_stock,actual_stock) VALUES($1,$2,'A',14,12),($1,$3,'B',10,7)",[count,a,b]);
 });
 afterEach(async()=>{
  await pool!.query('DROP TRIGGER IF EXISTS stage01_fail ON stock_movements');await pool!.query('DROP FUNCTION IF EXISTS stage01_fail()');
  await pool!.query('DELETE FROM audit_logs WHERE user_id=$1',[actor]);await pool!.query('DELETE FROM audit_logs WHERE entity_id=$1',[count]);
  await pool!.query('DELETE FROM internal_movement_items WHERE item_id IN ($1,$2)',[a,b]);await pool!.query('DELETE FROM internal_movements WHERE created_by=$1',[actor]);
  await pool!.query('DELETE FROM stock_movements WHERE item_id IN ($1,$2)',[a,b]);await pool!.query('DELETE FROM warehouse_stock WHERE warehouse_id IN ($1,$2)',[from,to]);
  await pool!.query('DELETE FROM item_price_history WHERE item_id IN ($1,$2)',[a,b]);await pool!.query('DELETE FROM inventory_counts WHERE id=$1',[count]);
  await pool!.query('DELETE FROM inventory_items WHERE id IN ($1,$2)',[a,b]);await pool!.query('DELETE FROM inventory_warehouses WHERE id IN ($1,$2)',[from,to]);
 });
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await pool!.end();const {pool:p}=await import('../db');await p.end();});
 it('el permiso de inventario es obligatorio también en depósitos',async()=>{role='reception';expect((await request('POST',`/api/inventory/warehouses/${from}/movements`,{itemId:a,movementType:'entrada',quantity:2})).status).toBe(403);expect(await current()).toBe(14);});
 it('una entrada por depósito conserva el stock sin ubicación',async()=>{expect((await request('POST',`/api/inventory/warehouses/${from}/movements`,{itemId:a,movementType:'entrada',quantity:2})).status).toBe(201);expect(await warehouse()).toBe(12);expect(await current()).toBe(16);});
 it('las entradas concurrentes no pierden cantidades',async()=>{const results=await Promise.all([2,3].map(quantity=>request('POST',`/api/inventory/warehouses/${from}/movements`,{itemId:a,movementType:'entrada',quantity})));expect(results.map(r=>r.status)).toEqual([201,201]);expect(await warehouse()).toBe(15);expect(await current()).toBe(19);});
 it('dos transferencias no utilizan el mismo stock dos veces',async()=>{const responses=await Promise.all([transfer(7),transfer(7)]);expect(responses.map(r=>r.status).sort()).toEqual([200,400]);expect(await warehouse()).toBe(3);expect(await warehouse(to)).toBe(7);expect(await current()).toBe(14);});
 it('una transferencia de varios artículos es atómica',async()=>{const r=await request('POST','/api/inventory/transfer',{fromWarehouseId:from,toWarehouseId:to,items:[{itemId:a,quantity:2},{itemId:b,quantity:100}]});expect(r.status).toBe(400);expect(await warehouse()).toBe(10);expect(await warehouse(to)).toBe(0);expect((await pool!.query('SELECT id FROM stock_movements WHERE item_id=$1',[a])).rows).toHaveLength(0);});
 it('rechaza depósitos inactivos, valores no numéricos y stock insuficiente',async()=>{await pool!.query("UPDATE inventory_warehouses SET is_active='false' WHERE id=$1",[to]);expect((await transfer(1)).status).toBe(409);expect((await transfer('NaN')).status).toBe(400);expect((await request('POST',`/api/inventory/warehouses/${from}/movements`,{itemId:a,movementType:'salida',quantity:11})).status).toBe(409);expect(await current()).toBe(14);});
 it('cierra una toma una sola vez, incluso con solicitudes concurrentes',async()=>{const responses=await Promise.all([storage.closeInventoryCount(count,actor),storage.closeInventoryCount(count,actor)]);expect(responses.map(r=>r.adjustments).sort()).toEqual([0,2]);expect(responses.filter(r=>r.alreadyClosed)).toHaveLength(1);expect(await current()).toBe(12);expect(await current(b)).toBe(7);expect((await pool!.query("SELECT id FROM stock_movements WHERE source_type='inventory_count' AND source_id=$1",[count])).rows).toHaveLength(2);});
 it('la API no permite editar una toma cerrada',async()=>{await storage.closeInventoryCount(count,actor);expect((await request('PATCH',`/api/inventory/counts/${count}/items/${a}`,{actualStock:99})).status).toBe(409);expect(await current()).toBe(12);});
 it('un fallo en el segundo ajuste revierte toda la toma',async()=>{
  await pool!.query(`CREATE FUNCTION stage01_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.item_id='${b}' THEN RAISE EXCEPTION 'Falla simulada'; END IF; RETURN NEW; END $$`);await pool!.query('CREATE TRIGGER stage01_fail BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION stage01_fail()');
  await expect(storage.closeInventoryCount(count,actor)).rejects.toThrow();expect(await current()).toBe(14);expect(await current(b)).toBe(10);expect((await pool!.query('SELECT status FROM inventory_counts WHERE id=$1',[count])).rows[0].status).toBe('borrador');expect((await pool!.query('SELECT id FROM stock_movements WHERE item_id=$1',[a])).rows).toHaveLength(0);
 });
 it('no cierra si el saldo cambió durante el conteo',async()=>{await pool!.query('UPDATE inventory_items SET current_stock=15 WHERE id=$1',[a]);await expect(storage.closeInventoryCount(count,actor)).rejects.toThrow('cambió');expect(await current(b)).toBe(10);});
 it('detecta movimientos posteriores incluso si el saldo final volvió al inicial',async()=>{await pool!.query("INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,created_at) VALUES($1,'ajuste',14,14,14,now())",[a]);await expect(storage.closeInventoryCount(count,actor)).rejects.toThrow('cambió');});
 it('una falla SQL revierte saldo del depósito, global e historial',async()=>{
  await pool!.query(`CREATE FUNCTION stage01_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.item_id='${a}' THEN RAISE EXCEPTION 'Falla simulada'; END IF; RETURN NEW; END $$`);await pool!.query('CREATE TRIGGER stage01_fail BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION stage01_fail()');
  expect((await request('POST',`/api/inventory/warehouses/${from}/movements`,{itemId:a,movementType:'entrada',quantity:2,unitCost:25})).status).toBe(500);
  expect(await warehouse()).toBe(10);expect(await current()).toBe(14);expect((await pool!.query('SELECT id FROM stock_movements WHERE item_id=$1',[a])).rows).toHaveLength(0);
 });
 it('guardar y cerrar simultáneamente no permite editar después del cierre',async()=>{
  const [saved,closed]=await Promise.all([request('PATCH',`/api/inventory/counts/${count}/items/${a}`,{actualStock:15}),request('POST',`/api/inventory/counts/${count}/close`,{})]);
  expect([200,409]).toContain(saved.status);expect(closed.status).toBe(200);
  expect((await request('PATCH',`/api/inventory/counts/${count}/items/${a}`,{actualStock:99})).status).toBe(409);
  expect([12,15]).toContain(await current());
 });
 it('no interpreta artículos sin contar como cero',async()=>{await pool!.query('UPDATE inventory_count_items SET actual_stock=NULL WHERE count_id=$1 AND item_id=$2',[count,b]);expect((await storage.closeInventoryCount(count,actor)).adjustments).toBe(1);expect(await current(b)).toBe(10);});
 it('rechaza conteos negativos, tomas inexistentes y renglones ajenos',async()=>{expect((await request('PATCH',`/api/inventory/counts/${count}/items/${a}`,{actualStock:'1abc'})).status).toBe(400);await expect(storage.updateInventoryCountItem(count,a,-1)).rejects.toThrow('inválida');await expect(storage.closeInventoryCount('inexistente',actor)).rejects.toThrow('encontrada');await expect(storage.updateInventoryCountItem(count,'ajeno',1)).rejects.toThrow('pertenece');});
 it('no cierra una toma completamente sin contar',async()=>{await pool!.query('UPDATE inventory_count_items SET actual_stock=NULL WHERE count_id=$1',[count]);await expect(storage.closeInventoryCount(count,actor)).rejects.toThrow('al menos');expect(await current()).toBe(14);});
 it('el consumo usa el último destino de transferencia y registra el origen',async()=>{
  expect((await transfer(4)).status).toBe(200);
  const r=await request('POST','/api/inventory/internal-movements',{date:'2026-10-07',motivo:'desayuno',items:[{itemId:a,quantity:2}]});expect(r.status).toBe(201);
  const doc=await r.json();expect(doc.items[0].warehouse_id).toBe(to);expect(await warehouse(to)).toBe(2);expect(await warehouse()).toBe(6);expect(await current()).toBe(12);
  const detail=await (await request('GET',`/api/inventory/internal-movements/${doc.id}`)).json();expect(detail.items[0].warehouse_id).toBe(to);
  const origins=await (await request('GET','/api/inventory/internal-consumption-origins')).json();expect(origins.find((i:any)=>i.itemId===a).warehouseId).toBe(to);
 });
 it('sin transferencia pide un depósito y permite selección explícita',async()=>{
  const body={date:'2026-10-07',motivo:'otro',items:[{itemId:a,quantity:2}]};expect((await request('POST','/api/inventory/internal-movements',body)).status).toBe(409);
  expect((await request('POST','/api/inventory/internal-movements',{...body,items:[{itemId:a,quantity:2,warehouseId:from}]})).status).toBe(201);expect(await warehouse()).toBe(8);expect(await current()).toBe(12);
 });
 it('no busca otro depósito si el último destino no alcanza o está inactivo',async()=>{
  await transfer(2);const body={date:'2026-10-07',motivo:'otro',items:[{itemId:a,quantity:3}]};expect((await request('POST','/api/inventory/internal-movements',body)).status).toBe(409);expect(await current()).toBe(14);
  await pool!.query("UPDATE inventory_warehouses SET is_active='false' WHERE id=$1",[to]);expect((await request('POST','/api/inventory/internal-movements',{...body,items:[{itemId:a,quantity:1}]})).status).toBe(409);expect(await warehouse()).toBe(8);
 });
 it('permite cambiar explícitamente el último destino',async()=>{
  await transfer(2);expect((await request('POST','/api/inventory/internal-movements',{date:'2026-10-07',motivo:'otro',items:[{itemId:a,quantity:3,warehouseId:from}]})).status).toBe(201);expect(await warehouse()).toBe(5);expect(await warehouse(to)).toBe(2);expect(await current()).toBe(11);
 });
 it('dos consumos simultáneos no agotan el mismo saldo dos veces',async()=>{
  await transfer(4);const body={date:'2026-10-07',motivo:'otro',items:[{itemId:a,quantity:3}]};const responses=await Promise.all([request('POST','/api/inventory/internal-movements',body),request('POST','/api/inventory/internal-movements',body)]);expect(responses.map(r=>r.status).sort()).toEqual([201,409]);expect(await warehouse(to)).toBe(1);expect(await current()).toBe(11);
 });
 it('un renglón sin saldo revierte el comprobante completo',async()=>{
  const r=await request('POST','/api/inventory/internal-movements',{date:'2026-10-07',motivo:'otro',items:[{itemId:a,quantity:2,warehouseId:from},{itemId:b,quantity:99,warehouseId:from}]});expect(r.status).toBe(409);expect(await current()).toBe(14);expect(await warehouse()).toBe(10);expect((await pool!.query('SELECT id FROM internal_movements WHERE created_by=$1',[actor])).rows).toHaveLength(0);
 });
 it('un error al registrar consumo revierte saldos, cabecera e historial',async()=>{
  await pool!.query(`CREATE FUNCTION stage01_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.item_id='${b}' THEN RAISE EXCEPTION 'Falla simulada'; END IF; RETURN NEW; END $$`);await pool!.query('CREATE TRIGGER stage01_fail BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION stage01_fail()');
  const r=await request('POST','/api/inventory/internal-movements',{date:'2026-10-07',motivo:'otro',items:[{itemId:a,quantity:2,warehouseId:from},{itemId:b,quantity:2,warehouseId:from}]});expect(r.status).toBe(500);expect(await warehouse()).toBe(10);expect(await current()).toBe(14);expect((await pool!.query('SELECT id FROM internal_movements WHERE created_by=$1',[actor])).rows).toHaveLength(0);
 });
 it('valida permiso, renglones repetidos, cantidad y fecha del consumo',async()=>{
  const body={date:'2026-10-07',motivo:'otro',items:[{itemId:a,quantity:1,warehouseId:from}]};role='reception';expect((await request('POST','/api/inventory/internal-movements',body)).status).toBe(403);role='admin';
  for(const bad of [{...body,date:'2026-02-30'},{...body,items:[...body.items,...body.items]},{...body,items:[{itemId:a,quantity:'1abc',warehouseId:from}]}])expect((await request('POST','/api/inventory/internal-movements',bad)).status).toBe(400);expect(await current()).toBe(14);
 });
 it('elige la transferencia más reciente, incluso si vuelve al depósito anterior',async()=>{
  await transfer(4);await pool!.query("UPDATE stock_movements SET created_at=now()-interval '1 hour' WHERE item_id=$1 AND movement_type='transferencia'",[a]);
  expect((await request('POST','/api/inventory/transfer',{fromWarehouseId:to,toWarehouseId:from,items:[{itemId:a,quantity:1}]})).status).toBe(200);
  expect((await request('POST','/api/inventory/internal-movements',{date:'2026-10-07',motivo:'otro',items:[{itemId:a,quantity:2}]})).status).toBe(201);expect(await warehouse()).toBe(5);expect(await warehouse(to)).toBe(3);
 });
 it('rechaza consumo si el global no alcanza, aunque el depósito tenga saldo',async()=>{
  await pool!.query('UPDATE inventory_items SET current_stock=1 WHERE id=$1',[a]);
  expect((await request('POST','/api/inventory/internal-movements',{date:'2026-10-07',motivo:'otro',items:[{itemId:a,quantity:2,warehouseId:from}]})).status).toBe(409);expect(await warehouse()).toBe(10);expect(await current()).toBe(1);
 });

});
