import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { consumeStockLines, type ConsumptionLine } from "../../../inventoryStockEngine";
import { FundingError, hash, identifier } from "../contracts";
import type { FirstSpaClose } from "../adapters";

/** No storage.closeSpaAccount/global pool/nested transaction. The fiscal
 * finalizer remains owner of the financial close; this binding owns only
 * actual consumption, appointment completion and operational close metadata.
 */
export function createFirstSpaClose(schema="public"): FirstSpaClose {
 const s=identifier(schema);
 return async(c,accountId,actor)=>{
   const account=(await c.query(`SELECT * FROM ${s}.spa_accounts WHERE id=$1 FOR UPDATE`,[accountId])).rows[0];
   if(!account) throw new FundingError("NOT_FOUND","Cuenta SPA inexistente.",404);
   if(account.status==="closed") return;
   if(account.status!=="open") throw new FundingError("SOURCE_CHANGED","La cuenta no está abierta.");
   const appointment=(await c.query(`SELECT * FROM ${s}.spa_appointments WHERE id=$1 FOR UPDATE`,[account.appointment_id])).rows[0];
   if(!appointment || ["cancelled","no_show"].includes(appointment.status))
     throw new FundingError("SOURCE_CHANGED","Turno inexistente, cancelado o ausente.");
   if(!(await c.query(`SELECT id FROM ${s}.spa_treatments WHERE id=$1 FOR SHARE`,[appointment.treatment_id])).rowCount)
     throw new FundingError("INVENTORY_REVIEW_REQUIRED","No existe el tratamiento del turno.");
   // Existing stock engine uses unqualified names. SET LOCAL belongs to this
   // PoolClient and is restored immediately even on failure.
   const old=(await c.query("SHOW search_path")).rows[0].search_path;
   await c.query("SELECT set_config('search_path',$1,true)",[`${s},public`]);
   try {
     const tx=drizzle(c);
     const consume=async(type:string,id:string,lines:ConsumptionLine[])=>{
       await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`inventory-consumption:${type}:${id}`]);
       const reversal=await c.query(`SELECT id FROM ${s}.inventory_source_reversals WHERE source_type=$1 AND source_id=$2`,[type,id]);
       if(reversal.rowCount) throw new FundingError("INVENTORY_REVIEW_REQUIRED","El consumo fue revertido; requiere revisión explícita.");
       const prior=(await c.query(`SELECT * FROM ${s}.inventory_consumption_jobs WHERE source_type=$1 AND source_id=$2`,[type,id])).rows;
       const moves=await c.query(`SELECT id FROM ${s}.stock_movements WHERE source_type=$1 AND source_id=$2 LIMIT 1`,[type,id]);
       if(!prior.length&&moves.rowCount) return;
       if(!lines.length && !prior.length) return; // Verified empty treatment recipe.
       // Insert BEFORE consumption: legacy queue workers serialize on this same
       // unique source row, not only on our advisory lock.
       await c.query(`INSERT INTO ${s}.inventory_consumption_jobs(source_type,source_id,lines,actor)
         VALUES($1,$2,$3,$4) ON CONFLICT(source_type,source_id) DO NOTHING`,[type,id,JSON.stringify(lines),actor.id]);
       const jobs=(await c.query(`SELECT * FROM ${s}.inventory_consumption_jobs WHERE source_type=$1 AND source_id=$2 FOR UPDATE`,[type,id])).rows;
       if(jobs[0]?.status==="completed") return;
       if(jobs.length && (jobs[0].status!=="pending" || hash(jobs[0].lines)!==hash(lines)))
         throw new FundingError("INVENTORY_REVIEW_REQUIRED","El consumo persistido no coincide con el plan actual.");
       await consumeStockLines(tx,lines,{type,id,actor:actor.id,notes:"Cierre SPA con financiación explícita"});
       await tx.execute(sql`INSERT INTO inventory_consumption_jobs(source_type,source_id,lines,actor,status,completed_at)
         VALUES(${type},${id},${JSON.stringify(lines)},${actor.id},'completed',now())
         ON CONFLICT(source_type,source_id) DO UPDATE SET status='completed',error=NULL,completed_at=now()`);
     };
     const supplies=(await c.query(`SELECT * FROM ${s}.treatment_supplies WHERE treatment_id=$1 ORDER BY id`,[appointment.treatment_id])).rows;
     await consume("spa_account",accountId,supplies.map(r=>({itemId:r.inventory_item_id,quantity:Number(r.quantity),unit:r.unit})));
     const products=(await c.query(`SELECT * FROM ${s}.spa_account_items WHERE account_id=$1 AND item_type='product' ORDER BY id FOR UPDATE`,[accountId])).rows;
     for(const row of products) {
       const job=(await c.query(`SELECT lines FROM ${s}.inventory_consumption_jobs WHERE source_type='spa_account_item' AND source_id=$1 FOR UPDATE`,[row.id])).rows[0];
       if(job){await consume("spa_account_item",row.id,job.lines);continue;}
       if(!row.inventory_item_id || !Number.isSafeInteger(row.quantity) || row.quantity<=0)
         throw new FundingError("INVENTORY_REVIEW_REQUIRED","Producto sin identidad o cantidad válida.");
       await consume("spa_account_item",row.id,[{itemId:row.inventory_item_id,quantity:row.quantity}]);
     }
     await c.query(`UPDATE ${s}.spa_appointments SET status='completed' WHERE id=$1`,[appointment.id]);
     await c.query(`UPDATE ${s}.spa_accounts SET subtotal=(SELECT sum(subtotal) FROM ${s}.spa_account_items WHERE account_id=$1),
       total=(SELECT sum(subtotal) FROM ${s}.spa_account_items WHERE account_id=$1),closed_by=$2,charged_to='direct' WHERE id=$1`,[accountId,actor.id]);
   } finally {
     // A failed SQL statement aborts the transaction; the caller rolls it back.
     await c.query("SELECT set_config('search_path',$1,true)",[old]).catch(()=>{});
   }
 };
}
