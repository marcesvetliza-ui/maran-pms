import {sql} from 'drizzle-orm';
import {db,withDatabaseTransaction} from './db';
import {catalogLock} from './inventoryCatalog';
import {INVENTORY_TAXONOMY} from '@shared/inventoryTaxonomy';
const normalize=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
// One-time reviewed classification setup. Retains IDs and all article/history links.
export async function ensureAgreedInventoryTaxonomy(){
 return withDatabaseTransaction(async()=>{
  await catalogLock();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS inventory_catalog_setups (key text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`);
  const marker=await db.execute(sql`INSERT INTO inventory_catalog_setups(key) VALUES('physical-catalog-20261008') ON CONFLICT DO NOTHING RETURNING key`);
  if(!marker.rows.length)return {created:0,alreadyApplied:true};
  const categories=(await db.execute(sql`SELECT id,name,area,parent_id,is_group,is_active FROM item_categories`)).rows as any[];
  let created=0;
  const retained=new Set<string>();
  async function ensure(name:string,area:string,isGroup:boolean,parentId:string|null){
   const candidates=categories.filter(c=>c.area===area&&c.is_group===isGroup&&(c.parent_id??null)===parentId&&c.is_active!=='false'&&normalize(c.name)===normalize(name));
   if(candidates.length>1)throw new Error(`Clasificación duplicada: ${area} / ${name}`);
   if(candidates.length){retained.add(candidates[0].id);return candidates[0].id as string;}
   const row=(await db.execute(sql`INSERT INTO item_categories(name,area,is_group,parent_id,is_active) VALUES(${name},${area},${isGroup},${parentId},'true') RETURNING *`)).rows[0] as any;
   categories.push(row);retained.add(row.id);created++;return row.id as string;
  }
  for(const branch of INVENTORY_TAXONOMY){const parent=await ensure(branch.group,branch.area,true,null);for(const child of branch.children)await ensure(child,branch.area,false,parent);}
  // Archive obsolete classifications, including ones referenced by historical articles.
  // No article, recipe, purchase, balance or movement is rewritten or deleted.
  for(const category of categories){
   if(!retained.has(category.id) && category.is_active!=='false')
    await db.execute(sql`UPDATE item_categories SET is_active='false' WHERE id=${category.id}`);
  }
  return {created,alreadyApplied:false};
 });
}
