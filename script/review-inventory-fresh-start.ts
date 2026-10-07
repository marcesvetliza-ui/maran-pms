/** Read-only review. Produces a dated inventory reset scope; never changes database rows. */
import pg from 'pg';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const outputIndex=process.argv.indexOf('--output');
const output=outputIndex>=0?process.argv[outputIndex+1]:undefined;
if(!process.env.DATABASE_URL||!output)throw new Error('DATABASE_URL y --output son obligatorios. No se ejecuta ningún reinicio.');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try{
 await client.connect();
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const {rows:[{cutoff}]}=await client.query('SELECT now()::text AS cutoff');
 const {rows:articles}=await client.query(`SELECT i.id,i.sku,i.name,i.item_kind,i.is_active,i.unit,i.current_stock,c.area,c.name AS subcategory,p.name AS grouping FROM inventory_items i LEFT JOIN item_categories c ON c.id=i.category_id LEFT JOIN item_categories p ON p.id=c.parent_id WHERE i.item_kind IS DISTINCT FROM 'plato' ORDER BY i.id`);
 const {rows:balances}=await client.query(`SELECT w.item_id,w.warehouse_id,d.name AS warehouse,w.current_stock FROM warehouse_stock w JOIN inventory_items i ON i.id=w.item_id LEFT JOIN inventory_warehouses d ON d.id=w.warehouse_id WHERE i.item_kind IS DISTINCT FROM 'plato' ORDER BY w.item_id,w.warehouse_id`);
 const {rows:pending}=await client.query(`SELECT id,source_type,source_id,status,created_at,lines FROM inventory_consumption_jobs WHERE status='pending' ORDER BY id`);
 const {rows:recipes}=await client.query('SELECT id,menu_item_id,is_base,name,output_inventory_item_id FROM recipes ORDER BY id');
 const {rows:ingredients}=await client.query('SELECT id,recipe_id,inventory_item_id,sub_recipe_id,ingredient_name,quantity,unit,warehouse_id FROM recipe_ingredients ORDER BY id');
 const {rows:supplies}=await client.query('SELECT id,treatment_id,inventory_item_id,quantity,unit FROM treatment_supplies ORDER BY id');
 const {rows:links}=await client.query(`SELECT (SELECT count(*) FROM menu_items m JOIN inventory_items i ON i.id=m.inventory_item_id WHERE i.item_kind IS DISTINCT FROM 'plato') AS direct_sale_links,(SELECT count(*) FROM recipe_ingredients) AS ingredients,(SELECT count(*) FROM production_runs) AS production_history,(SELECT count(*) FROM stock_movements) AS movement_history`);
 await client.query('COMMIT');
 const scope={articles,balances,pending,recipes,ingredients,supplies,links};
 const report={readOnly:true,cutoff,scopeHash:createHash('sha256').update(JSON.stringify(scope)).digest('hex'),decision:'New physical catalog and stock. No changes to recipe/menu/SPA functionality in this delivery.',...scope};
 await writeFile(output,JSON.stringify(report,null,2)+'\n','utf8');
 console.log(JSON.stringify({output,readOnly:true,articles:articles.length,pending:pending.length,recipes:recipes.length,supplies:supplies.length}));
}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{await client.end();}
