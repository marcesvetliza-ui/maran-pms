import {randomUUID} from 'node:crypto';
import express from 'express';
import type {Server} from 'node:http';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {pool} from '../db';
import {registerGuestsRoutes} from '../routes/guests';
const suite=process.env.DATABASE_URL?describe:describe.skip;
let server:Server,base:string;
const entities:{id:string;table:string}[]=[];
suite('historical CC receipts independent of account balances',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.includes('test'))throw Error('Local test database required');
  const app=express();app.use(express.json());registerGuestsRoutes(app);
  server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 afterAll(async()=>{
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  for(const e of entities){await pool.query('DELETE FROM account_movements WHERE entity_id=$1',[e.id]);await pool.query(`DELETE FROM ${e.table} WHERE id=$1`,[e.id]);}await pool.end();
 });
 async function list(params:Record<string,string>){const r=await fetch(`${base}/api/account-movements/receipts?${new URLSearchParams(params)}`);expect(r.status).toBe(200);return r.json();}
 it.each(['company','agency','guest'])('lists %s receipts after its account reaches zero and retains date, search and type filters',async type=>{
  const id=randomUUID(),table=type==='company'?'companies':type==='agency'?'agencies':'guests',name=`Recibo prueba ${id}`;entities.push({id,table});
  if(type==='guest')await pool.query("INSERT INTO guests(id,first_name,last_name)VALUES($1,'Cliente',$2)",[id,name]);
  else await pool.query(`INSERT INTO ${table}(id,razon_social,cuil_cuit)VALUES($1,$2,$3)`,[id,name,id]);
  const receipt=randomUUID(),cargo=randomUUID(),linked=randomUUID(),voided=randomUUID();
  await pool.query(`INSERT INTO account_movements(id,entity_type,entity_id,date,type,description,amount,receipt_number,payment_method,voided,reservation_id)VALUES
    ($1,$5,$6,'2032-11-10','pago','Cobro de cuenta',-1470000,'TEST-RECIBO-'||$6::varchar,'transferencia',false,null),
    ($2,$5,$6,'2032-11-10','cargo','Deuda cancelada',1470015,null,null,false,null),
    ($3,$5,$6,'2032-11-10','pago','Pago vinculado',-10,null,null,false,'reservation-test'),
    ($4,$5,$6,'2032-11-10','pago','Recibo anulado',-5,'TEST-ANULADO-'||$6::varchar,null,true,null)`,[receipt,cargo,linked,voided,type,id]);
  expect((await pool.query('SELECT sum(amount)::text AS balance FROM account_movements WHERE entity_id=$1',[id])).rows[0].balance).toBe('0.00');
  const before=(await pool.query('SELECT * FROM account_movements WHERE entity_id=$1 ORDER BY id',[id])).rows;
  const filters={from:'2032-11-10',to:'2032-11-10',search:name,entityType:type};
  const rows=await list(filters);expect(rows.map((r:any)=>r.id).sort()).toEqual([receipt,voided].sort());
  expect(rows.find((r:any)=>r.id===receipt)).toMatchObject({amount:'-1470000.00',entityName:type==='guest'?name+' Cliente':name,receiptNumber:'TEST-RECIBO-'+id,paymentMethod:'transferencia'});
  expect(rows.find((r:any)=>r.id===voided).voided).toBe(true);
  expect(await list({...filters,from:'2032-11-11',to:'2032-11-12'})).toEqual([]);
  expect(await list({...filters,search:'unmatched-'+id})).toEqual([]);
  expect(await list({...filters,entityType:type==='company'?'agency':'company'})).toEqual([]);
  expect((await pool.query('SELECT * FROM account_movements WHERE entity_id=$1 ORDER BY id',[id])).rows).toEqual(before);
 });
});
