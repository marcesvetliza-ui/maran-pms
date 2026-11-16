import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { getCcAllocationPreview, correctCcAllocations } from '../billing/ccReceiptAllocations';
const url=process.env.DATABASE_URL;
const safe=!!url&&/(?:^|[_-])(test|testing|ci)(?:[_-]|$)/i.test(new URL(url).pathname.slice(1));
const suite=safe&&(process.env.CI==='true'||process.env.RUN_CC_ALLOCATION_TESTS==='1')?describe:describe.skip;
const pool=safe?new pg.Pool({connectionString:url,max:6}):null;
const ids:string[]=[],shifts:string[]=[];
const actor={id:'synthetic-operator',name:'Recepción prueba',ip:'127.0.0.1'};
async function fixture(){
 const p=pool!,entity=randomUUID(),receipt=randomUUID(),old=randomUUID(),target=randomUUID(),cash=randomUUID(),shift=randomUUID();ids.push(receipt,old,target);shifts.push(shift);
 await p.query(`INSERT INTO account_movements(id,entity_type,entity_id,date,type,description,amount,receipt_number,retentions) VALUES
 ($1,'company',$4,'2026-11-16','pago','Recibo CC',-110,$5,'[{"concepto":"IIBB","monto":10}]'),
 ($2,'company',$4,'2026-11-16','cargo','Factura nueva',110,null,null),($3,'company',$4,'2026-10-01','cargo','Factura anterior',150,null,null)`,[receipt,old,target,entity,`TEST-${receipt}`]);
 await p.query('INSERT INTO account_movement_allocations(pago_id,cargo_id,amount) VALUES($1,$2,110)',[receipt,old]);
 await p.query("INSERT INTO cash_shifts(id,area,shift_number,opened_at,status) VALUES($1,'recepcion',900001,now(),'closed')",[shift]);
 await p.query(`INSERT INTO cash_movements(id,shift_id,area,source_type,source_id,payment_method,amount,movement_type,registered_by)
 VALUES($1,$2,'recepcion','recibo_cta_cte',$3,'transferencia',100,'income','Original')`,[cash,shift,receipt]);
 return {receipt,old,target,entity,cash};
}
async function snapshot(f:any){return {receipt:(await pool!.query('SELECT * FROM account_movements WHERE id=$1',[f.receipt])).rows,cash:(await pool!.query('SELECT * FROM cash_movements WHERE source_id=$1',[f.receipt])).rows,ledger:(await pool!.query('SELECT id,amount FROM account_movements WHERE entity_id=$1 ORDER BY id',[f.entity])).rows};}
async function request(f:any,allocations=[{cargoId:f.target,amount:'110.00'}]){return {requestId:randomUUID(),version:(await getCcAllocationPreview(pool!,f.receipt)).version,reason:'Corregir facturas elegidas',allocations};}
suite('CC receipt allocation corrections on disposable PostgreSQL',()=>{
 afterAll(async()=>{if(!pool)return;await pool.query("DELETE FROM audit_logs WHERE entity_type='cc_receipt_allocations' AND entity_id=ANY($1::varchar[])",[ids]);await pool.query('DELETE FROM cash_movements WHERE source_id=ANY($1::varchar[])',[ids]);await pool.query('DELETE FROM account_movement_allocations WHERE pago_id=ANY($1::varchar[]) OR cargo_id=ANY($1::varchar[])',[ids]);await pool.query('DELETE FROM account_movements WHERE id=ANY($1::varchar[])',[ids]);await pool.query('DELETE FROM cash_shifts WHERE id=ANY($1::varchar[])',[shifts]);await pool.end();});
 it('moves applications atomically, preserves receipt, closed-shift cash and retentions, audits and deduplicates a lost response',async()=>{
  const f=await fixture(),before=await snapshot(f),req=await request(f);
  const preview=await getCcAllocationPreview(pool!,f.receipt);expect(preview.charges.map(c=>c.id)).toEqual([f.target,f.old]);
  await correctCcAllocations(pool!,f.receipt,req,actor);
  expect(await snapshot(f)).toEqual(before);
  const after=await getCcAllocationPreview(pool!,f.receipt);expect(after.current).toMatchObject([{cargoId:f.target,amount:'110.00'}]);expect(after.unallocated).toBe('0.00');
  expect(after.history).toHaveLength(1);expect(JSON.parse(after.history[0].details)).toMatchObject({reason:req.reason,before:[{cargoId:f.old,amount:'110.00'}],after:[{cargoId:f.target,amount:'110.00',description:'Factura anterior'}]});
  expect((await pool!.query('SELECT voided,void_reason FROM account_movement_allocations WHERE pago_id=$1 AND cargo_id=$2',[f.receipt,f.old])).rows).toEqual([{voided:true,void_reason:`Corrección de imputación: ${req.reason}`}]);
  expect(await correctCcAllocations(pool!,f.receipt,req,actor)).toMatchObject({alreadyApplied:true});
  expect((await getCcAllocationPreview(pool!,f.receipt)).history).toHaveLength(1);
 });
 it('rejects excess amounts, foreign charges, stale previews and changed retries without modifying cash or allocations',async()=>{
  const f=await fixture(),other=await fixture(),before=await snapshot(f);
  for(const allocations of [[{cargoId:f.target,amount:'111.00'}],[{cargoId:other.target,amount:'10.00'}],[{cargoId:f.target,amount:'0.00'}]]){
   await expect(correctCcAllocations(pool!,f.receipt,await request(f,allocations),actor)).rejects.toHaveProperty('statusCode');
  }
  expect((await getCcAllocationPreview(pool!,f.receipt)).current[0].cargoId).toBe(f.old);
  const req=await request(f),stale={...req,requestId:randomUUID()};await correctCcAllocations(pool!,f.receipt,req,actor);
  await expect(correctCcAllocations(pool!,f.receipt,stale,actor)).rejects.toMatchObject({statusCode:409});
  await expect(correctCcAllocations(pool!,f.receipt,{...req,reason:'Otro motivo'},actor)).rejects.toMatchObject({statusCode:409});expect(await snapshot(f)).toEqual(before);
 });
 it('allows partial applications or payment on account and keeps the released amounts available',async()=>{
  const f=await fixture();await correctCcAllocations(pool!,f.receipt,await request(f,[{cargoId:f.target,amount:'50.00'}]),actor);
  let p=await getCcAllocationPreview(pool!,f.receipt);expect(p.unallocated).toBe('60.00');expect(p.charges.find(c=>c.id===f.old)?.available).toBe('110.00');
  await correctCcAllocations(pool!,f.receipt,await request(f,[]),actor);p=await getCcAllocationPreview(pool!,f.receipt);expect(p.current).toEqual([]);expect(p.unallocated).toBe('110.00');
 });
 it('serializes concurrent corrections so only one uses a given receipt version',async()=>{
  const f=await fixture(),req=await request(f);const results=await Promise.allSettled([correctCcAllocations(pool!,f.receipt,req,actor),correctCcAllocations(pool!,f.receipt,{...req,requestId:randomUUID(),allocations:[]},actor)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await getCcAllocationPreview(pool!,f.receipt)).history).toHaveLength(1);
 });
 it('rechecks available amounts after another payment consumes a selected charge',async()=>{
  const f=await fixture(),req=await request(f),another=randomUUID();ids.push(another);
  await pool!.query("INSERT INTO account_movements(id,entity_type,entity_id,date,type,description,amount)VALUES($1,'company',$2,'2026-11-16','pago','Otro cobro',-100)",[another,f.entity]);
  await pool!.query('INSERT INTO account_movement_allocations(pago_id,cargo_id,amount)VALUES($1,$2,100)',[another,f.target]);
  await expect(correctCcAllocations(pool!,f.receipt,req,actor)).rejects.toMatchObject({statusCode:409});expect((await getCcAllocationPreview(pool!,f.receipt)).current[0].cargoId).toBe(f.old);
 });
 it('rolls back all application changes when the audit cannot be written',async()=>{
  const f=await fixture(),req=await request(f),before=await getCcAllocationPreview(pool!,f.receipt);
  const broken={connect:async()=>{const c=await pool!.connect();return {query:(sql:string,values?:unknown[])=>{if(sql.includes('INSERT INTO audit_logs'))throw new Error('Synthetic audit failure');return c.query(sql,values);},release:()=>c.release()};}} as any;
  await expect(correctCcAllocations(broken,f.receipt,req,actor)).rejects.toThrow('Synthetic audit failure');
  expect(await getCcAllocationPreview(pool!,f.receipt)).toEqual(before);
 });
 it('rejects voided or reservation-linked receipts',async()=>{
  const f=await fixture(),req=await request(f);await pool!.query("UPDATE account_movements SET reservation_id='synthetic-reservation' WHERE id=$1",[f.receipt]);
  await expect(correctCcAllocations(pool!,f.receipt,req,actor)).rejects.toMatchObject({statusCode:409});
  await pool!.query('UPDATE account_movements SET reservation_id=null,voided=true WHERE id=$1',[f.receipt]);await expect(getCcAllocationPreview(pool!,f.receipt)).rejects.toMatchObject({statusCode:409});
 });
});
