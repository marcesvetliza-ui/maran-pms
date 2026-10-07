import {sql} from 'drizzle-orm';
import {createHash} from 'node:crypto';
import {db,withDatabaseTransaction} from './db';
import {registerProductionRun,type RegisterProductionRunInput} from './production';
export async function ensureProductionPendingSchema(){await db.execute(sql`CREATE TABLE IF NOT EXISTS inventory_pending_productions (
 request_id varchar PRIMARY KEY,payload jsonb NOT NULL,formula_hash text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
 error text,registered_by varchar,run_id varchar REFERENCES production_runs(id),created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz)`);
 await db.execute(sql`ALTER TABLE inventory_pending_productions ADD COLUMN IF NOT EXISTS registered_by varchar`);
 await db.execute(sql`ALTER TABLE inventory_pending_productions DROP CONSTRAINT IF EXISTS inventory_pending_productions_status_check, ADD CONSTRAINT inventory_pending_productions_status_check CHECK(status IN ('pending','completed','cancelled'))`);
}
async function formulaHash(id:string){
 const snapshots:any[]=[];const seen=new Set<string>();
 async function visit(recipeId:string){
  if(seen.has(recipeId))return;seen.add(recipeId);
  const recipe=(await db.execute(sql`SELECT id,production_unit,production_yield,output_inventory_item_id FROM recipes WHERE id=${recipeId} FOR SHARE`)).rows[0] as any;
  const lines=(await db.execute(sql`SELECT id,inventory_item_id,sub_recipe_id,quantity,unit,merma FROM recipe_ingredients WHERE recipe_id=${recipeId} ORDER BY id FOR SHARE`)).rows as any[];
  snapshots.push({recipe,lines});
  for(const line of lines)if(line.sub_recipe_id)await visit(line.sub_recipe_id);
 }
 await visit(id);return createHash('sha256').update(JSON.stringify(snapshots)).digest('hex');
}
export async function submitProduction(input:RegisterProductionRunInput){
 if(!input.requestId||!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId))throw new Error('Identificador de producción inválido');
 return withDatabaseTransaction(async()=>{
  // Serialize retries for the same operation. Other productions still use stock row locks.
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.requestId},173411))`);
  const payload={...input,registeredBy:undefined};
  const previous=(await db.execute(sql`SELECT *,payload=${JSON.stringify(payload)}::jsonb AS matches FROM inventory_pending_productions WHERE request_id=${input.requestId} FOR UPDATE`)).rows[0] as any;
  if(previous&&!previous.matches)throw new Error('Este identificador ya corresponde a otra producción');
  if(previous?.status==='cancelled')throw new Error('La producción pendiente fue anulada; registrá una nueva operación');
  if(previous?.status==='completed'){
   const run=(await db.execute(sql`SELECT * FROM production_runs WHERE id=${previous.run_id}`)).rows[0];
   return {status:'completed',requestId:input.requestId,runId:previous.run_id,run,warnings:[],deducted:[],skipped:[]};
  }
  const hash=await formulaHash(input.recipeId);
  if(previous&&previous.formula_hash!==hash)throw new Error('La fórmula cambió desde el registro pendiente. Revisá la producción antes de regularizarla.');
  try{
   // Savepoint: a shortage leaves no partially applied inputs or output.
   const result=await registerProductionRun(input);
   if(previous)await db.execute(sql`UPDATE inventory_pending_productions SET status='completed',error=NULL,run_id=${result.run.id},completed_at=now() WHERE request_id=${input.requestId}`);
   return {...result,status:'completed',requestId:input.requestId,runId:result.run.id};
  }catch(error:any){
   if(error.statusCode!==409||!/stock insuficiente|stock global insuficiente/i.test(error.message))throw error;
   await db.execute(sql`INSERT INTO inventory_pending_productions(request_id,payload,formula_hash,error,registered_by) VALUES(${input.requestId},${JSON.stringify(payload)},${hash},${error.message},${input.registeredBy||null}) ON CONFLICT(request_id) DO UPDATE SET error=excluded.error`);
   if(!previous)await db.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${input.registeredBy||null},'create','inventory','pending_production',${input.requestId},'Producción registrada pendiente de stock',${JSON.stringify({payload,error:error.message})},now())`);
   return {status:'pending',requestId:input.requestId,run:null,runId:null,error:error.message,warnings:[],deducted:[],skipped:[]};
  }
 });
}
export async function retryProduction(requestId:string,actor:string){
 return withDatabaseTransaction(async()=>{
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId},173411))`);
  const row=(await db.execute(sql`SELECT payload,status,registered_by FROM inventory_pending_productions WHERE request_id=${requestId} FOR UPDATE`)).rows[0] as any;
  if(!row)throw new Error('Producción pendiente inexistente');
  const result=await submitProduction({...row.payload,registeredBy:row.registered_by||actor});
  if(row.status==='pending'&&result.status==='completed')await db.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${actor},'update','inventory','pending_production',${requestId},'Producción pendiente regularizada',${JSON.stringify({runId:result.runId})},now())`);
  return result;
 });
}

export async function cancelPendingProduction(requestId:string,reason:string,actor:string){
 if(typeof reason!=='string'||reason.trim().length<3)throw new Error('Indicá el motivo de anulación');
 return withDatabaseTransaction(async()=>{
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${requestId},173411))`);
  const row=(await db.execute(sql`SELECT * FROM inventory_pending_productions WHERE request_id=${requestId} FOR UPDATE`)).rows[0] as any;
  if(!row)throw new Error('Producción pendiente inexistente');if(row.status==='cancelled')return {status:'cancelled'};if(row.status!=='pending')throw new Error('Una producción aplicada se revierte desde su documento de stock');
  await db.execute(sql`UPDATE inventory_pending_productions SET status='cancelled',error=${reason.trim()} WHERE request_id=${requestId}`);
  await db.execute(sql`INSERT INTO audit_logs(user_id,action,module,entity_type,entity_id,description,details,timestamp) VALUES(${actor},'update','inventory','pending_production',${requestId},${reason.trim()},${JSON.stringify({before:row,status:'cancelled'})},now())`);
  return {status:'cancelled'};
 });
}
