import {createHash} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {db,withDatabaseTransaction} from './db';
import {catalogLock} from './inventoryCatalog';

export interface WorkbookStock {
 key:string; source:string; sourceSha256:string;
 articles:Array<{name:string;area:string;group:string;subcategory:string;kind:string;unit:string;
 purchaseUnit:string;factor:number;cost:number;costSourceRow:number;sourceRows:number[];
 locations:Array<{warehouse:string;quantity:number;minimum:number;critical:number;sourceRows:number[]}>}>;
}
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function validateStockWorkbook(data:WorkbookStock) {
 if(!data.key || !/^[a-f0-9]{64}$/.test(data.sourceSha256) || !data.articles.length)throw new Error('Planilla sin identidad o sin artículos');
 const names=new Set<string>();let locations=0;
 for(const a of data.articles){
  const key=normalize(a.name);if(!key||names.has(key))throw new Error(`Artículo duplicado: ${a.name}`);names.add(key);
  if(!['general','restaurant','housekeeping','spa','admin','maintenance','events','marketing'].includes(a.area)
   || !['materia_prima','venta_directa','activo_fijo','semielaborado'].includes(a.kind)
   || !['unidad','kg','g','litro','ml','caja','paquete','docena'].includes(a.unit)
   || !a.group.trim() || !a.subcategory.trim() || !Number.isFinite(a.cost) || a.cost<0 || a.cost>=100000000
   || !a.locations.length || !Number.isFinite(a.factor) || a.factor<=0)throw new Error(`Artículo inválido: ${a.name}`);
  const warehouses=new Set<string>();let total=0;
  for(const l of a.locations){const warehouse=normalize(l.warehouse);
   if(!warehouse||warehouses.has(warehouse))throw new Error(`Depósito repetido: ${a.name}`);warehouses.add(warehouse);
   for(const n of [l.quantity,l.minimum,l.critical])if(!Number.isFinite(n)||n<0||n>=10000000||Math.abs(n*1000-Math.round(n*1000))>0.00001)throw new Error(`Cantidad inválida: ${a.name}`);
   if(l.critical>l.minimum)throw new Error(`Crítico mayor al mínimo: ${a.name}`);
   total+=l.quantity;locations++;
  }
  if(total>=10000000)throw new Error(`Saldo global fuera de rango: ${a.name}`);
 }
 return {articles:data.articles.length,locations};
}

/** Explicit user-authorized replacement. Atomic, once-only; no commercial document is deleted. */
export async function importStockWorkbook(data:WorkbookStock) {
 const stats=validateStockWorkbook(data);
 const digest=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 return withDatabaseTransaction(async()=>{
  await catalogLock();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS inventory_workbook_imports(
   key text PRIMARY KEY,source_hash text NOT NULL,payload_hash text NOT NULL,
   snapshot jsonb NOT NULL,result jsonb NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
  const previous=(await db.execute(sql`SELECT payload_hash,result FROM inventory_workbook_imports WHERE key=${data.key}`)).rows[0] as any;
  if(previous){if(previous.payload_hash!==digest)throw new Error('La carga ya aplicada tiene otro contenido; no se puede repetir');return {...previous.result,alreadyApplied:true};}
  // Block concurrent stock and catalog writers until all old balances and the new catalog agree.
  await db.execute(sql`LOCK TABLE inventory_items,warehouse_stock,inventory_warehouses,stock_movements,
   item_categories,inventory_location_policies,inventory_unit_conversions,inventory_counts,
   inventory_count_items,inventory_consumption_jobs,inventory_pending_productions,recipes,
   recipe_ingredients,treatment_supplies IN SHARE ROW EXCLUSIVE MODE`);
  const snapshot=(await db.execute(sql`SELECT jsonb_build_object(
   'items',(SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') FROM inventory_items i),
   'warehouses',(SELECT coalesce(jsonb_agg(to_jsonb(w)),'[]') FROM inventory_warehouses w),
   'warehouseStock',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM warehouse_stock s),
   'categories',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM item_categories c),
   'locationPolicies',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') FROM inventory_location_policies p),
   'unitConversions',(SELECT coalesce(jsonb_agg(to_jsonb(u)),'[]') FROM inventory_unit_conversions u),
   'recipes',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM recipes r),
   'ingredients',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM recipe_ingredients r),
   'treatmentSupplies',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM treatment_supplies t),
   'countItems',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM inventory_count_items c),
   'counts',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM inventory_counts c),
   'consumptionJobs',(SELECT coalesce(jsonb_agg(to_jsonb(j)),'[]') FROM inventory_consumption_jobs j),
   'pendingProductions',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') FROM inventory_pending_productions p)
  ) snapshot`)).rows[0]?.snapshot;
  const oldItems=(await db.execute(sql`SELECT id,current_stock FROM inventory_items WHERE item_kind<>'plato' ORDER BY id`)).rows as any[];
  for(const item of oldItems){
   let balance=Number(item.current_stock)||0;
   const stocks=(await db.execute(sql`SELECT warehouse_id,current_stock FROM warehouse_stock WHERE item_id=${item.id} ORDER BY warehouse_id`)).rows as any[];
   for(const stock of stocks){const quantity=Number(stock.current_stock)||0;if(!quantity)continue;
    const next=Number((balance-quantity).toFixed(3));
    await db.execute(sql`INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,warehouse_id,notes,source_type,source_id,created_at,created_by)
     VALUES(${item.id},'ajuste',${-quantity},${balance},${next},${stock.warehouse_id},'Retiro de saldo de prueba: reemplazo autorizado por planilla','catalog_reset',${data.key},now(),'Carga stock 08/10/2026')`);balance=next;
   }
   if(balance)await db.execute(sql`INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,notes,source_type,source_id,created_at,created_by)
    VALUES(${item.id},'ajuste',${-balance},${balance},0,'Retiro de saldo de prueba sin ubicación','catalog_reset',${data.key},now(),'Carga stock 08/10/2026')`);
  }
  await db.execute(sql`UPDATE warehouse_stock SET current_stock=0,updated_at=now() WHERE item_id IN(SELECT id FROM inventory_items WHERE item_kind<>'plato')`);
  await db.execute(sql`UPDATE inventory_items SET is_active='false',current_stock=0 WHERE item_kind<>'plato'`);
  await db.execute(sql`UPDATE inventory_location_policies SET is_expected=false,updated_at=now() WHERE item_id IN(SELECT id FROM inventory_items WHERE item_kind<>'plato')`);
  await db.execute(sql`UPDATE inventory_consumption_jobs SET status='cancelled',error='Pendiente de prueba retirado por carga de catálogo',completed_at=now() WHERE status='pending'`);
  await db.execute(sql`UPDATE inventory_pending_productions SET status='cancelled',error='Producción pendiente de prueba retirada por carga de catálogo',completed_at=now() WHERE status='pending'`);
  await db.execute(sql`UPDATE inventory_counts SET status='anulado' WHERE status='borrador'`);
  // Keep recipes/treatments and ingredient identities for review; never map them by name.
  await db.execute(sql`UPDATE recipes SET notes=concat_ws(E'\n',notes,'[stock-import: ' || ${data.key} || '] Revisar ingredientes y producción: el catálogo anterior quedó archivado.')
   WHERE output_inventory_item_id IS NOT NULL OR EXISTS(SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id=recipes.id AND ri.inventory_item_id IS NOT NULL)`);
  const categories=(await db.execute(sql`SELECT * FROM item_categories`)).rows as any[];
  async function category(name:string,area:string,group:boolean,parent:string|null){
   const matches=categories.filter(c=>c.is_active!=='false'&&c.area===area&&c.is_group===group&&(c.parent_id??null)===parent&&normalize(c.name)===normalize(name));
   if(matches.length>1)throw new Error(`Clasificación ambigua: ${name}`);
   if(matches.length)return matches[0].id as string;
   const row=(await db.execute(sql`INSERT INTO item_categories(name,area,is_group,parent_id,is_active) VALUES(${name},${area},${group},${parent},'true') RETURNING *`)).rows[0] as any;
   categories.push(row);return row.id as string;
  }
  const warehouses=(await db.execute(sql`SELECT * FROM inventory_warehouses`)).rows as any[];
  const warehouseIds=new Map<string,string>();
  async function warehouse(name:string,area:string){
   const key=normalize(name);if(warehouseIds.has(key))return warehouseIds.get(key)!;
   const matches=warehouses.filter(w=>normalize(w.name)===key);if(matches.length>1)throw new Error(`Depósito ambiguo: ${name}`);
   let id:string;
   if(matches.length){id=matches[0].id;await db.execute(sql`UPDATE inventory_warehouses SET is_active='true' WHERE id=${id}`);}
   else id=String((await db.execute(sql`INSERT INTO inventory_warehouses(name,area,is_active) VALUES(${name},${area},'true') RETURNING id`)).rows[0].id);
   warehouseIds.set(key,id);return id;
  }
  for(let index=0;index<data.articles.length;index++){
   const a=data.articles[index];const parent=await category(a.group,a.area,true,null);const cat=await category(a.subcategory,a.area,false,parent);
   const total=a.locations.reduce((sum,l)=>sum+l.quantity,0);
   const itemId=String((await db.execute(sql`INSERT INTO inventory_items(name,sku,category_id,item_kind,unit,cost_price,current_stock,is_active,description)
    VALUES(${a.name},${`STK26-${String(index+1).padStart(5,'0')}`},${cat},${a.kind},${a.unit},${a.cost},${total.toFixed(3)},'true',${`Carga de prueba desde ${data.source}. Filas: ${a.sourceRows.join(', ')}. Costo: fila ${a.costSourceRow}.`}) RETURNING id`)).rows[0].id);
   await db.execute(sql`INSERT INTO inventory_unit_conversions(item_id,from_unit,factor) VALUES(${itemId},${a.purchaseUnit},${a.factor})`);
   let balance=0;
   for(const l of a.locations){const area=l.warehouse==='Deposito General'?'general':l.warehouse==='Deposito SPA'?'spa':l.warehouse==='Deposito Housekeeping'?'housekeeping':'restaurant';const warehouseId=await warehouse(l.warehouse,area);
    await db.execute(sql`INSERT INTO warehouse_stock(item_id,warehouse_id,current_stock) VALUES(${itemId},${warehouseId},${l.quantity})`);
    await db.execute(sql`INSERT INTO inventory_location_policies(item_id,warehouse_id,min_stock,critical_stock,is_expected) VALUES(${itemId},${warehouseId},${l.minimum},${l.critical},true)`);
    await db.execute(sql`INSERT INTO stock_movements(item_id,movement_type,quantity,previous_stock,new_stock,unit_cost,warehouse_id,notes,source_type,source_id,created_at,created_by)
     VALUES(${itemId},'entrada',${l.quantity},${balance},${(balance+l.quantity).toFixed(3)},${a.cost},${warehouseId},${`Carga inicial de prueba. Filas ${l.sourceRows.join(', ')}.`},'initial_workbook',${data.key},now(),'Carga stock 08/10/2026')`);
    balance=Number((balance+l.quantity).toFixed(3));
   }
  }
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS inventory_active_physical_name_unique ON inventory_items
   (regexp_replace(translate(lower(name),'áéíóúüñ','aeiouun'),'[^a-z0-9]','','g')) WHERE is_active='true' AND item_kind<>'plato'`);
  const result={...stats,warehouses:warehouseIds.size,archivedItems:oldItems.length};
  await db.execute(sql`INSERT INTO inventory_workbook_imports(key,source_hash,payload_hash,snapshot,result)
   VALUES(${data.key},${data.sourceSha256},${digest},${JSON.stringify(snapshot)}::jsonb,${JSON.stringify(result)}::jsonb)`);
  await db.execute(sql`INSERT INTO audit_logs(action,module,entity_type,entity_id,description,details,timestamp)
   VALUES('update','inventory','workbook_import',${data.key},'Reemplazo autorizado del catálogo y saldos de prueba',${JSON.stringify({...result,source:data.source,sourceSha256:data.sourceSha256})}::jsonb,now())`);
  return {...result,alreadyApplied:false};
 });
}
