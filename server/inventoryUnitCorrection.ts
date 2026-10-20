import { createHash } from 'node:crypto';
import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { db, withDatabaseTransaction } from './db';
import { requireAuth } from './auth';
import { catalogLock } from './inventoryCatalog';
import { INVENTORY_UNITS, inventoryUnitFactor } from '@shared/inventoryUnits';
import { validateInventoryConversions } from './inventoryConversionValidation';

const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
export async function canCorrectInventoryUnit(userId: string) {
  const row = (await db.execute(sql`SELECT role,is_active,can_correct_inventory_unit FROM system_users WHERE id=${userId} FOR SHARE`)).rows[0];
  return !!row && row.is_active === 'true' && (row.role === 'admin' || row.can_correct_inventory_unit === true);
}

async function correctionPlan(itemId: string, newUnit: string) {
  if (!INVENTORY_UNITS.includes(newUnit as any)) throw fail('Elegí una unidad válida', 400);
  const item = (await db.execute(sql`SELECT * FROM inventory_items WHERE id=${itemId} FOR UPDATE`)).rows[0];
  if (!item) throw fail('Artículo no encontrado',404);
  const oldUnit = String(item.unit);
  if (oldUnit === newUnit) throw fail('La unidad elegida ya es la unidad del artículo');
  if (item.is_active !== 'true') throw fail('Activá el artículo antes de corregir su unidad');
  // Lock order matches recipe writes and catalog edits. Current quantities and
  // costs are never scaled; only references expressed in the wrong base label move.
  const conversions = (await db.execute(sql`SELECT from_unit AS "fromUnit",factor::text FROM inventory_unit_conversions WHERE item_id=${itemId} ORDER BY from_unit FOR UPDATE`)).rows as Array<{fromUnit:string;factor:string}>;
  try { validateInventoryConversions(conversions,newUnit); }
  catch { throw fail('Hay equivalencias incompatibles con la nueva unidad. Revisalas antes de esta corrección; no se eliminaron ni cambiaron.'); }
  const recipes = (await db.execute(sql`SELECT * FROM recipes WHERE output_inventory_item_id=${itemId} ORDER BY id FOR UPDATE NOWAIT`)).rows;
  const pendingProduction = await db.execute(sql`WITH RECURSIVE affected(id) AS (
    SELECT id FROM (SELECT id FROM recipes WHERE output_inventory_item_id=${itemId}
      UNION SELECT recipe_id AS id FROM recipe_ingredients WHERE inventory_item_id=${itemId}) seeds
    UNION
    SELECT ri.recipe_id FROM recipe_ingredients ri JOIN affected a
      ON ri.sub_recipe_id=a.id OR ri.inventory_item_id=(SELECT r.output_inventory_item_id FROM recipes r WHERE r.id=a.id)
  ) SELECT request_id FROM inventory_pending_productions WHERE status='pending' AND payload->>'recipeId' IN (SELECT id FROM affected)`);
  if (pendingProduction.rows.length) throw fail('Hay producciones pendientes vinculadas. Regularizalas o anulalas antes de corregir la unidad.');
  const ingredients = (await db.execute(sql`SELECT * FROM recipe_ingredients WHERE inventory_item_id=${itemId} OR sub_recipe_id IN (SELECT id FROM recipes WHERE output_inventory_item_id=${itemId}) ORDER BY id FOR UPDATE NOWAIT`)).rows;
  const supplies = (await db.execute(sql`SELECT * FROM treatment_supplies WHERE inventory_item_id=${itemId} ORDER BY id FOR UPDATE NOWAIT`)).rows;
  const counts = (await db.execute(sql`SELECT ci.* FROM inventory_count_items ci JOIN inventory_counts c ON c.id=ci.count_id WHERE ci.item_id=${itemId} AND c.status='borrador' ORDER BY ci.id FOR UPDATE OF ci,c NOWAIT`)).rows;
  const jobs = (await db.execute(sql`SELECT * FROM inventory_consumption_jobs WHERE status='pending' AND lines @> ${JSON.stringify([{itemId}])}::jsonb ORDER BY id FOR UPDATE NOWAIT`)).rows;
  const warehouses = (await db.execute(sql`SELECT * FROM warehouse_stock WHERE item_id=${itemId} ORDER BY warehouse_id FOR UPDATE`)).rows;
  const checkUnit = (unit: string | null | undefined) => {
    if (!unit || unit === oldUnit) return;
    const configured = conversions.find(row=>row.fromUnit===unit);
    const factor = configured ? Number(configured.factor) : undefined;
    let after: number;
    try { after = inventoryUnitFactor(unit,newUnit,factor); }
    catch { throw fail(`Hay una referencia en ${unit} sin equivalencia para ${newUnit}. Revisala antes de corregir.`); }
    let before: number | undefined;
    try { before = inventoryUnitFactor(unit,oldUnit,factor); } catch {}
    if (before !== undefined && Math.abs(before-after)>1e-9) throw fail(`La referencia en ${unit} cambiaría su conversión. Esta acción sólo corrige etiquetas; revisá esa referencia primero.`);
  };
  for (const row of [...ingredients,...supplies,...counts]) checkUnit(String(row.unit));
  for (const row of recipes) checkUnit(row.production_unit as string);
  for (const job of jobs) for (const line of job.lines as any[]) if (line.itemId===itemId) checkUnit(line.unit);
  const snapshot = {item,conversions,recipes,ingredients,supplies,counts,jobs,warehouses};
  const token = createHash('sha256').update(JSON.stringify({newUnit,snapshot})).digest('hex');
  return { oldUnit,newUnit,token,snapshot,preview: {
    itemId,name:item.name,oldUnit,newUnit,token,stock:item.current_stock,costPrice:item.cost_price,
    warehouses:warehouses.map(row=>({warehouseId:row.warehouse_id,stock:row.current_stock})),
    affected:{recipes:ingredients.length,productionFormulas:recipes.length,treatments:supplies.length,openCounts:counts.length,pendingConsumptions:jobs.length},
  }};
}

export async function correctInventoryUnit(actor: string, itemId: string, input: any, apply = false) {
  return withDatabaseTransaction(async()=>{
    if (!await canCorrectInventoryUnit(actor)) throw fail('No tenés permiso para corregir unidades de Inventario',403);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Datos de corrección inválidos',400);
    if (apply && (input.mode !== 'label_only' || typeof input.reason !== 'string' || !input.reason.trim())) throw fail('Confirmá que sólo estaba mal la unidad e indicá el motivo',400);
    await catalogLock();
    await db.execute(sql`SELECT pg_advisory_xact_lock(173410,4)`);
    const plan = await correctionPlan(itemId,input.newUnit);
    if (!apply) return plan.preview;
    if (input.token !== plan.token) throw fail('El artículo o sus referencias cambiaron. Revisá una nueva vista previa.');
    const {oldUnit,newUnit}=plan;
    await db.execute(sql`UPDATE inventory_items SET unit=${newUnit} WHERE id=${itemId}`);
    await db.execute(sql`UPDATE recipe_ingredients SET unit=${newUnit} WHERE unit=${oldUnit} AND (inventory_item_id=${itemId} OR sub_recipe_id IN (SELECT id FROM recipes WHERE output_inventory_item_id=${itemId}))`);
    await db.execute(sql`UPDATE recipes SET production_unit=${newUnit} WHERE output_inventory_item_id=${itemId} AND production_unit=${oldUnit}`);
    await db.execute(sql`UPDATE treatment_supplies SET unit=${newUnit} WHERE inventory_item_id=${itemId} AND unit=${oldUnit}`);
    await db.execute(sql`UPDATE inventory_count_items SET unit=${newUnit} WHERE item_id=${itemId} AND unit=${oldUnit} AND count_id IN (SELECT id FROM inventory_counts WHERE status='borrador')`);
    for (const job of plan.snapshot.jobs) {
      const lines = (job.lines as any[]).map(line=>line.itemId===itemId && line.unit===oldUnit ? {...line,unit:newUnit} : line);
      await db.execute(sql`UPDATE inventory_consumption_jobs SET lines=${JSON.stringify(lines)}::jsonb WHERE id=${String(job.id)}`);
    }
    await db.execute(sql`INSERT INTO audit_logs(user_id,user_name,action,module,entity_type,entity_id,description,details,timestamp)
      VALUES(${actor},(SELECT full_name FROM system_users WHERE id=${actor}),'update','inventory','inventory_unit_correction',${itemId},${input.reason.trim()},${JSON.stringify({mode:'label_only',oldUnit,newUnit,before:plan.snapshot,preview:plan.preview})},now())`);
    return {...plan.preview,applied:true};
  });
}

export function registerInventoryUnitCorrectionRoutes(app: Express) {
  app.get('/api/inventory/unit-correction-access',requireAuth,async(req,res)=>{
    try { res.json({allowed:await canCorrectInventoryUnit(req.user!.id)}); }
    catch { res.status(500).json({error:'No se pudo consultar el permiso de corrección'}); }
  });
  for (const action of ['preview','apply']) app.post(`/api/inventory/items/:id/unit-correction/${action}`,requireAuth,async(req,res)=>{
    try { res.json(await correctInventoryUnit(req.user!.id,req.params.id,req.body,action==='apply')); }
    catch(error: any) {if([error,error?.cause].some(value=>value?.code==='55P03')) return res.status(409).json({error:'Hay una operación en curso sobre este artículo. Volvé a revisar el cambio cuando termine.'});res.status(error.statusCode || 500).json({error:error.statusCode ? error.message : 'No se pudo corregir la unidad'});}
  });
}
