import type {Express} from 'express';
import {db,withDatabaseTransaction} from './db';
import {sql} from 'drizzle-orm';
import {requirePermission} from './auth';
import {stockUnits} from './inventorySafety';
export async function ensureInventoryLocationSchema(){await db.execute(sql`CREATE TABLE IF NOT EXISTS inventory_location_policies (
 warehouse_id varchar NOT NULL REFERENCES inventory_warehouses(id),item_id varchar NOT NULL REFERENCES inventory_items(id),
 min_stock numeric(10,3) NOT NULL CHECK(min_stock>=0),critical_stock numeric(10,3) CHECK(critical_stock>=0 AND critical_stock<=min_stock),
 is_expected boolean NOT NULL DEFAULT true,updated_at timestamp NOT NULL DEFAULT now(),PRIMARY KEY(warehouse_id,item_id))`);}
export function locationStatus(stock:number,min:number|null,critical:number|null,expected:boolean){
 if(!expected && min!==null)return 'disabled';
 if(!expected || min===null)return 'unconfigured';
 if(stock<=0)return 'zero';
 if(critical!==null && stock<=critical)return 'critical';
 return stock<min?'low':'ok';
}
export function registerInventoryLocationRoutes(app:Express){
 app.get('/api/inventory/locations',async(req,res)=>{try{
  const wh=typeof req.query.warehouseId==='string'?req.query.warehouseId:null;
  const r=await db.execute(sql`WITH pairs AS (
    SELECT warehouse_id,item_id FROM warehouse_stock UNION SELECT warehouse_id,item_id FROM inventory_location_policies
  ) SELECT p.warehouse_id AS "warehouseId",w.name AS "warehouseName",w.area AS "warehouseArea",p.item_id AS "itemId",i.name,i.sku,i.unit,i.item_kind AS "itemKind",i.category_id AS "categoryId",c.area,
   COALESCE(s.current_stock,0)::numeric(10,3)::text AS stock,i.cost_price::text AS "costPrice",l.min_stock::text AS "minStock",l.critical_stock::text AS "criticalStock",COALESCE(l.is_expected,false) AS expected
   FROM pairs p JOIN inventory_warehouses w ON w.id=p.warehouse_id JOIN inventory_items i ON i.id=p.item_id
   LEFT JOIN warehouse_stock s ON s.warehouse_id=p.warehouse_id AND s.item_id=p.item_id
   LEFT JOIN inventory_location_policies l ON l.warehouse_id=p.warehouse_id AND l.item_id=p.item_id
   LEFT JOIN item_categories c ON c.id=i.category_id
   WHERE w.is_active='true' AND i.is_active='true' AND i.item_kind<>'plato' AND (${wh}::varchar IS NULL OR w.id=${wh}) ORDER BY w.name,i.name,p.item_id`);
  res.json(r.rows.map((row:any)=>({...row,status:locationStatus(Number(row.stock),row.minStock===null?null:Number(row.minStock),row.criticalStock===null?null:Number(row.criticalStock),row.expected),suggestedQuantity:row.expected && row.minStock!==null?Math.max(0,Math.round((Number(row.minStock)-Number(row.stock))*1000)/1000).toFixed(3):'0.000'})));
 }catch(e:any){res.status(500).json({error:'No se pudieron consultar las ubicaciones'});}});
 app.put('/api/inventory/locations/:warehouseId/:itemId/policy',requirePermission('api:inventory:catalog'),async(req,res)=>{try{
  const {minStock,criticalStock,expected}=req.body;
  if(minStock===null || minStock===undefined || minStock==='' || typeof expected!=='boolean')return res.status(400).json({error:'Indicá el mínimo y si el depósito debe mantener este artículo'});
  const min=stockUnits(minStock),critical=criticalStock===null || criticalStock==='' || criticalStock===undefined?null:stockUnits(criticalStock);
  if(critical!==null && critical>min)return res.status(400).json({error:'El crítico no puede superar el mínimo'});
  await withDatabaseTransaction(async()=>{
   const item=(await db.execute(sql`SELECT id FROM inventory_items WHERE id=${req.params.itemId} AND is_active='true' AND item_kind<>'plato' FOR SHARE`)).rows;
   const wh=(await db.execute(sql`SELECT id FROM inventory_warehouses WHERE id=${req.params.warehouseId} AND is_active='true' FOR SHARE`)).rows;
   if(!item.length || !wh.length)throw Object.assign(new Error('Elegí un artículo físico y un depósito activos'),{statusCode:409});
   await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${req.params.warehouseId}),hashtext(${req.params.itemId}))`);
   const before=await db.execute(sql`SELECT * FROM inventory_location_policies WHERE warehouse_id=${req.params.warehouseId} AND item_id=${req.params.itemId}`);
   await db.execute(sql`INSERT INTO inventory_location_policies(warehouse_id,item_id,min_stock,critical_stock,is_expected) VALUES(${req.params.warehouseId},${req.params.itemId},${min/1000},${critical===null?null:critical/1000},${expected}) ON CONFLICT(warehouse_id,item_id) DO UPDATE SET min_stock=excluded.min_stock,critical_stock=excluded.critical_stock,is_expected=excluded.is_expected,updated_at=now()`);
   await db.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${req.user!.id},'update','inventory','location_policy',${req.params.warehouseId+':'+req.params.itemId},'Configuración de alertas por depósito',${JSON.stringify({before:before.rows,after:{minStock:min/1000,criticalStock:critical===null?null:critical/1000,expected}})},now())`);
  });res.json({ok:true});
 }catch(e:any){res.status(e.statusCode||400).json({error:e.statusCode?e.message:'Revisá los límites: cantidades positivas o cero, con hasta tres decimales'});}});
}
