import express from 'express';import http from 'node:http';import {randomUUID} from 'node:crypto';import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {db,pool} from '../db';import {sql} from 'drizzle-orm';import {ensureInventoryLocationSchema} from '../inventoryLocations';import {registerInventoryRoutes} from '../routes/inventory';
const run=process.env.DATABASE_URL?describe:describe.skip;
run('Alertas y reposición por ubicación',()=>{
 let server:http.Server,url:string,role='admin';const item=randomUUID(),other=randomUUID(),w1=randomUUID(),w2=randomUUID();
 beforeAll(async()=>{
  expect(['127.0.0.1','localhost']).toContain(new URL(process.env.DATABASE_URL!).hostname);await ensureInventoryLocationSchema();await ensureInventoryLocationSchema();await (await import('../permissions')).loadRolePermissionsCache();
  await db.execute(sql`INSERT INTO inventory_items(id,name,sku,current_stock,min_stock,item_kind) VALUES(${item},'Artículo de alertas',${item},11,100,'venta_directa'),(${other},'No asignado',${other},0,100,'venta_directa')`);
  await db.execute(sql`INSERT INTO inventory_warehouses(id,name,is_active) VALUES(${w1},'Destino prueba','true'),(${w2},'Origen prueba','true')`);
  await db.execute(sql`INSERT INTO warehouse_stock(warehouse_id,item_id,current_stock) VALUES(${w1},${item},2),(${w2},${item},9)`);
  const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:'stage4-test',role} as any;req.isAuthenticated=()=>true;next();});registerInventoryRoutes(app);(await import("../reports/routes")).registerReportsRoutes(app);server=http.createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+(server.address() as any).port;
 });
 afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(r=>server.close(()=>r()));await db.execute(sql`DELETE FROM audit_logs WHERE entity_id IN (${w1+':'+item},${w2+':'+item},${w1+':'+other}) OR user_id='stage4-test'`);await db.execute(sql`DELETE FROM stock_movements WHERE item_id IN (${item},${other})`);await db.execute(sql`DELETE FROM inventory_location_policies WHERE item_id IN (${item},${other})`);await db.execute(sql`DELETE FROM warehouse_stock WHERE item_id IN (${item},${other})`);await db.execute(sql`DELETE FROM inventory_items WHERE id IN (${item},${other})`);await db.execute(sql`DELETE FROM inventory_warehouses WHERE id IN (${w1},${w2})`);await pool.end();});
 const api=async(method:string,path:string,body?:any)=>{const r=await fetch(url+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 it('no inventa asignaciones ni copia mínimos generales',async()=>{const r=await api('GET',`/api/inventory/locations?warehouseId=${w1}`);expect(r.status).toBe(200);expect(r.body).toHaveLength(1);expect(r.body[0]).toMatchObject({itemId:item,stock:'2.000',minStock:null,status:'unconfigured',suggestedQuantity:'0.000'});});
 it('configura límites sin alterar cantidades; cada ubicación tiene su propia alerta',async()=>{
  expect((await api('PUT',`/api/inventory/locations/${w1}/${item}/policy`,{minStock:5,criticalStock:2,expected:true})).status).toBe(200);
  expect((await api('PUT',`/api/inventory/locations/${w2}/${item}/policy`,{minStock:3,criticalStock:1,expected:true})).status).toBe(200);
  const rows=(await api('GET','/api/inventory/locations')).body.filter((r:any)=>r.itemId===item);expect(rows.find((r:any)=>r.warehouseId===w1)).toMatchObject({status:'critical',suggestedQuantity:'3.000'});expect(rows.find((r:any)=>r.warehouseId===w2)).toMatchObject({status:'ok'});
  expect(Number((await db.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${item}`)).rows[0].current_stock)).toBe(11);
  const report=await api('GET','/api/reports/inventory?periodo=10/2026');expect(report.status,JSON.stringify(report.body)).toBe(200);expect(report.body.itemsBajoMinimo.find((r:any)=>r.id===item && r.depositoId===w1)).toMatchObject({stockActual:2,stockMinimo:5,deposito:'Destino prueba'});expect(report.body.totalSituacionesAlerta).toBeGreaterThanOrEqual(1);
 });
 it('una asignación explícita sin saldo genera alerta; deshabilitarla conserva saldos e historial',async()=>{
  expect((await api('PUT',`/api/inventory/locations/${w1}/${other}/policy`,{minStock:1,criticalStock:null,expected:true})).status).toBe(200);
  let rows=(await api('GET',`/api/inventory/locations?warehouseId=${w1}`)).body;expect(rows.find((r:any)=>r.itemId===other)).toMatchObject({status:'zero',stock:'0.000',suggestedQuantity:'1.000'});
  await api('PUT',`/api/inventory/locations/${w1}/${other}/policy`,{minStock:1,criticalStock:null,expected:false});rows=(await api('GET',`/api/inventory/locations?warehouseId=${w1}`)).body;expect(rows.find((r:any)=>r.itemId===other).status).toBe('disabled');
  expect((await db.execute(sql`SELECT * FROM warehouse_stock WHERE item_id=${other}`)).rows).toHaveLength(0);
 });
 it('rechaza críticos mayores al mínimo y roles sin permiso',async()=>{
  expect((await api('PUT',`/api/inventory/locations/${w1}/${item}/policy`,{minStock:1,criticalStock:2,expected:true})).status).toBe(400);
  role='restaurant';expect((await api('PUT',`/api/inventory/locations/${w1}/${item}/policy`,{minStock:1,criticalStock:null,expected:true})).status).toBe(403);
  expect((await api('GET',`/api/inventory/locations?warehouseId=${w1}`)).body[0].costPrice).toBeNull();role='admin';
 });
 it('la transferencia confirmada repone el destino, conserva el global y registra el último destino',async()=>{
  const r=await api('POST','/api/inventory/transfer',{fromWarehouseId:w2,toWarehouseId:w1,items:[{itemId:item,quantity:3}]});expect(r.status,JSON.stringify(r.body)).toBe(200);
  const rows=(await api('GET',`/api/inventory/locations?warehouseId=${w1}`)).body;expect(rows.find((r:any)=>r.itemId===item)).toMatchObject({stock:'5.000',status:'ok',suggestedQuantity:'0.000'});
  expect(Number((await db.execute(sql`SELECT current_stock FROM inventory_items WHERE id=${item}`)).rows[0].current_stock)).toBe(11);
  expect((await db.execute(sql`SELECT to_warehouse_id FROM stock_movements WHERE item_id=${item} AND movement_type='transferencia'`)).rows[0].to_warehouse_id).toBe(w1);
 });
});
