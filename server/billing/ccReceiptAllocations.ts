import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ccReallocationInput, type CcReallocationInput, type CcAllocationPreview } from '@shared/ccReceiptAllocations';
const fail=(message:string,statusCode=409):never=>{throw Object.assign(new Error(message),{statusCode});};
const active=(alias:string)=>`NOT EXISTS(SELECT 1 FROM sales_control_archive s WHERE s.kind='account_movement' AND s.record_id=${alias}.id::text)`;
function cents(value:string){
 if(!/^-?\d{1,10}(\.\d{1,2})?$/.test(value))return fail('El importe del recibo o comprobante requiere revisión');
 return Math.round(Number(value)*100);
}
const money=(n:number)=>(n/100).toFixed(2);
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function receipt(c:PoolClient,id:string,lock=false){
 const r=(await c.query(`SELECT m.* FROM account_movements m WHERE m.id=$1 AND ${active('m')} ${lock?'FOR UPDATE OF m':''}`,[id])).rows[0];
 if(!r)fail('Recibo no encontrado',404);
 if(r.type!=='pago'||r.voided||r.reservation_id||r.payment_id||r.group_payment_id||r.reversal_of_movement_id||r.reversal_movement_id||!['company','agency','guest'].includes(r.entity_type)||cents(r.amount)>=0)
  fail('Solo se pueden corregir recibos directos de cuenta corriente vigentes');
 return r;
}
async function allocations(c:PoolClient,id:string){return (await c.query(`SELECT a.id,a.cargo_id,a.amount,m.description,m.date::text FROM account_movement_allocations a JOIN account_movements m ON m.id=a.cargo_id WHERE a.pago_id=$1 AND NOT a.voided ORDER BY a.id`,[id])).rows;}
const version=(r:any,a:any[])=>hash({id:r.id,amount:r.amount,entityType:r.entity_type,entityId:r.entity_id,allocations:a.map(x=>[x.id,x.cargo_id,x.amount])});
export async function getCcAllocationPreview(pool:Pool,id:string):Promise<CcAllocationPreview>{
 const c=await pool.connect();try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const r=await receipt(c,id),a=await allocations(c,id);
 const charges=(await c.query(`SELECT m.id,m.description,m.date::text,m.reference,
 (m.amount::numeric-COALESCE(SUM(a.amount::numeric) FILTER(WHERE a.pago_id<>$3),0))::text AS available,
 COALESCE(SUM(a.amount::numeric) FILTER(WHERE a.pago_id=$3),0)::text AS applied
 FROM account_movements m LEFT JOIN account_movement_allocations a ON a.cargo_id=m.id AND NOT a.voided
 WHERE m.entity_type=$1 AND m.entity_id=$2 AND m.type='cargo' AND NOT m.voided AND ${active('m')}
 GROUP BY m.id HAVING m.amount::numeric-COALESCE(SUM(a.amount::numeric) FILTER(WHERE a.pago_id<>$3),0)>0
 ORDER BY m.date,m.created_at,m.id`,[r.entity_type,r.entity_id,id])).rows;
 const history=(await c.query(`SELECT id,user_name,timestamp,description,details FROM audit_logs WHERE entity_type='cc_receipt_allocations' AND entity_id=$1 ORDER BY timestamp DESC,id DESC LIMIT 30`,[id])).rows;
 await c.query('COMMIT');
 return {receiptId:id,receiptNumber:r.receipt_number,amount:money(-cents(r.amount)),version:version(r,a),unallocated:money(-cents(r.amount)-a.reduce((s,x)=>s+cents(x.amount),0)),current:a.map(x=>({cargoId:x.cargo_id,amount:x.amount,description:x.description,date:x.date})),charges,history};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function correctCcAllocations(pool:Pool,id:string,input:CcReallocationInput,actor:{id?:string;name:string;ip?:string}){
 const parsed=ccReallocationInput.safeParse(input);if(!parsed.success)fail('Indicá un motivo, una revisión vigente y los importes en pesos con dos decimales',400);
 const data=parsed.data!;
 const wanted=data.allocations.map(x=>({cargoId:x.cargoId,amount:money(cents(x.amount))})).sort((a,b)=>a.cargoId.localeCompare(b.cargoId));
 if(new Set(wanted.map(x=>x.cargoId)).size!==wanted.length||wanted.some(x=>cents(x.amount)<=0))fail('Revisá las facturas seleccionadas y sus importes',400);
 const requestHash=hash({id,reason:data.reason,version:data.version,allocations:wanted});
 const c=await pool.connect();try{
 await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");
 // Serialize receipt corrections and voids on the same parent. Charges are
 // locked in the same order as normal payment allocation to prevent races.
 const r=await receipt(c,id,true);
 const previous=(await c.query('SELECT entity_type,entity_id,details FROM audit_logs WHERE id=$1',[data.requestId])).rows[0];
 if(previous){
  if(previous.entity_type!=='cc_receipt_allocations'||previous.entity_id!==id)fail('Este identificador ya se usó para otra operación');
  const d=JSON.parse(previous.details);
  if(d.requestHash!==requestHash)fail('Este identificador ya se usó para otra corrección');
  await c.query('COMMIT');return {ok:true,alreadyApplied:true};
 }
 const before=await allocations(c,id);
 if(version(r,before)!==data.version)fail('El recibo cambió desde que lo abriste. Actualizá los comprobantes antes de confirmar');
 const sum=wanted.reduce((s,x)=>s+cents(x.amount),0),total=-cents(r.amount);
 if(sum>total)fail('El total aplicado no puede superar el importe del recibo',400);
 const ids=[...new Set([...before.map(x=>x.cargo_id),...wanted.map(x=>x.cargoId)])].sort();
 if(ids.length)await c.query('SELECT id FROM account_movements WHERE id=ANY($1::varchar[]) ORDER BY id FOR UPDATE',[ids]);
 const labels=new Map<string,string>();
 for(const a of wanted){
  const cargo=(await c.query(`SELECT m.amount,m.description FROM account_movements m WHERE m.id=$1 AND m.entity_type=$2 AND m.entity_id=$3 AND m.type='cargo' AND NOT m.voided AND ${active('m')}`,[a.cargoId,r.entity_type,r.entity_id])).rows[0];
  if(!cargo)fail('Uno de los comprobantes ya no está vigente o pertenece a otra cuenta');
  labels.set(a.cargoId,cargo.description);
  const other=(await c.query('SELECT COALESCE(SUM(amount::numeric),0)::text AS total FROM account_movement_allocations WHERE cargo_id=$1 AND pago_id<>$2 AND NOT voided',[a.cargoId,id])).rows[0];
  if(cents(a.amount)>cents(cargo.amount)-cents(other.total))fail('El saldo de un comprobante cambió. Actualizá los comprobantes antes de confirmar');
 }
 const canonical=(a:{cargoId:string;amount:string}[])=>JSON.stringify([...a].sort((a,b)=>a.cargoId.localeCompare(b.cargoId)));
 if(canonical(wanted)===canonical(before.map(x=>({cargoId:x.cargo_id,amount:money(cents(x.amount))}))))fail('No hay cambios en las facturas aplicadas',400);
 await c.query(`UPDATE account_movement_allocations SET voided=true,voided_at=now(),voided_by=$2,void_reason=$3 WHERE pago_id=$1 AND NOT voided`,[id,actor.name,`Corrección de imputación: ${data.reason}`]);
 for(const a of wanted)await c.query('INSERT INTO account_movement_allocations(pago_id,cargo_id,amount) VALUES($1,$2,$3)',[id,a.cargoId,a.amount]);
 const details={requestHash,reason:data.reason,receiptNumber:r.receipt_number,before:before.map(x=>({cargoId:x.cargo_id,amount:x.amount,description:x.description})),after:wanted.map(a=>({...a,description:labels.get(a.cargoId)})),unallocatedBefore:money(total-before.reduce((s,x)=>s+cents(x.amount),0)),unallocatedAfter:money(total-sum)};
 await c.query(`INSERT INTO audit_logs(id,user_id,user_name,action,module,entity_type,entity_id,description,details,ip_address,timestamp)
 VALUES($1,$2,$3,'update','admin','cc_receipt_allocations',$4,$5,$6,$7,now())`,[data.requestId,actor.id||null,actor.name,id,`Facturas aplicadas corregidas en ${r.receipt_number||id}`,JSON.stringify(details),actor.ip||null]);
 await c.query('COMMIT');return {ok:true,alreadyApplied:false};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
