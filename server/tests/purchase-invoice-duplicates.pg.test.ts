import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {sql} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {assertPurchaseInvoiceNotDuplicate} from '../purchase-invoice-duplicates';
const url=process.env.PURCHASE_DUPLICATE_TEST_DATABASE_URL;
if(url && new URL(url).pathname!=='/reservation_cancel_test')throw Error('Only the disposable reservation_cancel_test database is allowed');
const suite=url?describe:describe.skip;
const schema='purchase_duplicate_'+randomUUID().replaceAll('-','');
const base=url?new pg.Pool({connectionString:url}):null;
const pool=url?new pg.Pool({connectionString:url,options:`-c search_path=${schema}`,max:4}):null;
const db=pool?drizzle(pool):null;
const identity={supplierId:1,proveedorCuit:'30-12345678-1',tipoComprobante:'FACT-A',puntoVenta:'00001',numeroComprobante:'00000123'};
suite('Purchase invoice identity guard — real PostgreSQL, isolated schema',()=>{
 beforeAll(async()=>{
  await base!.query(`CREATE SCHEMA ${schema}`);
  await pool!.query(`CREATE TABLE purchase_invoices(id serial PRIMARY KEY,supplier_id integer,proveedor_cuit text,tipo_comprobante text,punto_venta text,numero_comprobante text,numero_comprobante_ext text,estado text DEFAULT 'pendiente',special_details jsonb)`);
  // Markers for downstream work: these are not operational accounting tables.
  await pool!.query('CREATE TABLE effects(invoice_id integer REFERENCES purchase_invoices(id),kind text)');
 });
 beforeEach(async()=>{await pool!.query('TRUNCATE effects,purchase_invoices RESTART IDENTITY');});
 afterAll(async()=>{await pool?.end();if(base){await base.query(`DROP SCHEMA ${schema} CASCADE`);await base.end();}});
 async function seed(value:any){return (await pool!.query('INSERT INTO purchase_invoices(supplier_id,proveedor_cuit,tipo_comprobante,punto_venta,numero_comprobante,numero_comprobante_ext,estado) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[value.supplierId??null,value.proveedorCuit??null,value.tipoComprobante,value.puntoVenta??null,value.numeroComprobante,'00001-00000123',value.estado||'pendiente'])).rows[0].id;}
 async function create(value:any,barrier?:()=>Promise<void>){return db!.transaction(async tx=>{
  if(barrier)await barrier();
  await assertPurchaseInvoiceNotDuplicate(tx,value);
  // Simulate financial/stock work while holding the transaction lock.
  await new Promise(resolve=>setTimeout(resolve,25));
  const inserted=await tx.execute(sql`INSERT INTO purchase_invoices(supplier_id,proveedor_cuit,tipo_comprobante,punto_venta,numero_comprobante) VALUES(${value.supplierId},${value.proveedorCuit??null},${value.tipoComprobante},${value.puntoVenta??null},${value.numeroComprobante}) RETURNING id`);
  const id=inserted.rows[0].id;
  await tx.execute(sql`INSERT INTO effects(invoice_id,kind) VALUES(${id},'account'),(${id},'stock'),(${id},'cash')`);
  return id;
 });}
 it.each([
  [identity,{...identity,puntoVenta:'1',numeroComprobante:'123'}],
  [{...identity,puntoVenta:'1',numeroComprobante:'123'},identity],
  [{...identity,puntoVenta:' 00001 ',numeroComprobante:' 00000123 '},{...identity,puntoVenta:'1',numeroComprobante:'123'}],
 ])('blocks zero-padding/spacing variants before downstream work',async(stored,input)=>{
  const id=await seed(stored);await expect(create(input)).rejects.toMatchObject({statusCode:409,existingId:id,code:'PURCHASE_INVOICE_DUPLICATE'});
  expect((await pool!.query('SELECT * FROM effects')).rows).toHaveLength(0);
  expect((await pool!.query('SELECT * FROM purchase_invoices')).rows).toHaveLength(1);
 });
 it.each([
  {...identity,supplierId:2,proveedorCuit:'30123456781'},
  {...identity,supplierId:null,proveedorCuit:'30 12345678 1'},
 ])('recognizes the same normalized CUIT on a second supplier record or a legacy unlinked invoice',async stored=>{
  await seed(stored);await expect(create(identity)).rejects.toMatchObject({statusCode:409});
 });
 it.each([
  {...identity,supplierId:2,proveedorCuit:'30987654321'},
  {...identity,puntoVenta:'00002'},
  {...identity,tipoComprobante:'NC-A'},
  {...identity,numeroComprobante:'00000124'},
  {...identity,numeroComprobante:'A00000123'},
 ])('preserves distinct supplier/document-series identities: %j',async input=>{
  await seed(identity);await expect(create(input)).resolves.toEqual(expect.any(Number));
 });
 it('treats omitted and zero point-of-sale consistently without conflating alphanumeric references',async()=>{
  await seed({...identity,puntoVenta:null,numeroComprobante:'REF-01'});
  await expect(create({...identity,puntoVenta:'00000',numeroComprobante:'ref-01'})).rejects.toMatchObject({statusCode:409});
  await expect(create({...identity,puntoVenta:null,numeroComprobante:'REF-1'})).resolves.toEqual(expect.any(Number));
 });
 it.each([1,2])('serializes simultaneous creates even across supplier records sharing a CUIT (second supplier %s)',async supplierId=>{
  let entered=0;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const barrier=async()=>{if(++entered===2)release();await gate;};
  const results=await Promise.allSettled([create(identity,barrier),create({...identity,supplierId,proveedorCuit:'30123456781',puntoVenta:'1',numeroComprobante:'123'},barrier)]);
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  expect(results.find(result=>result.status==='rejected')).toMatchObject({reason:{statusCode:409}});
  expect((await pool!.query('SELECT * FROM purchase_invoices')).rows).toHaveLength(1);
  expect((await pool!.query('SELECT * FROM effects')).rows).toHaveLength(3);
 });
 it('rolls back a failed transaction and releases its identity locks so the invoice can be retried',async()=>{
  await expect(db!.transaction(async tx=>{
   await assertPurchaseInvoiceNotDuplicate(tx,identity);
   await tx.execute(sql`INSERT INTO purchase_invoices(supplier_id,proveedor_cuit,tipo_comprobante,punto_venta,numero_comprobante) VALUES(1,${identity.proveedorCuit},'FACT-A','1','123')`);
   throw Error('Downstream failure');
  })).rejects.toThrow('Downstream failure');
  expect((await pool!.query('SELECT * FROM purchase_invoices')).rows).toHaveLength(0);
  await expect(create(identity)).resolves.toEqual(expect.any(Number));
 });
 it('allows replacement after cancellation, preserves the original, then blocks another active copy',async()=>{
  const old=await seed({...identity,estado:'anulado'});
  const replacement=await create({...identity,puntoVenta:'1',numeroComprobante:'123'});
  expect(replacement).not.toBe(old);
  await expect(create(identity)).rejects.toMatchObject({statusCode:409,existingId:replacement});
  expect((await pool!.query('SELECT id,estado FROM purchase_invoices ORDER BY id')).rows).toEqual([{id:old,estado:'anulado'},{id:replacement,estado:'pendiente'}]);
  expect((await pool!.query('SELECT * FROM effects')).rows).toHaveLength(3);
 });
 it.each(['pendiente','parcial','pagado'])('keeps blocking a duplicate with state %s',async estado=>{
  await seed({...identity,estado});await expect(create(identity)).rejects.toMatchObject({statusCode:409});
 });
 it('ignores the historical remito identity only when its owning document is cancelled',async()=>{
  const id=await seed({...identity,tipoComprobante:'FACT-B',numeroComprobante:'999'});
  await pool!.query('UPDATE purchase_invoices SET special_details=$1::jsonb WHERE id=$2',[JSON.stringify({remitoHistory:[{previous:{tipo_comprobante:'FACT-A',punto_venta:'1',numero_comprobante:'123'}}]}),id]);
  await expect(create(identity)).rejects.toMatchObject({statusCode:409});
  await pool!.query("UPDATE purchase_invoices SET estado='anulado' WHERE id=$1",[id]);
  await expect(create(identity)).resolves.toEqual(expect.any(Number));
 });
 it('serializes two replacement attempts after cancellation so only one creates downstream effects',async()=>{
  await seed({...identity,estado:'anulado'});
  let entered=0;let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const barrier=async()=>{if(++entered===2)release();await gate;};
  const result=await Promise.allSettled([create(identity,barrier),create({...identity,supplierId:2,proveedorCuit:'30123456781',puntoVenta:'1',numeroComprobante:'123'},barrier)]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(result.find(r=>r.status==='rejected')).toMatchObject({reason:{statusCode:409}});
  expect((await pool!.query('SELECT * FROM purchase_invoices')).rows).toHaveLength(2);expect((await pool!.query('SELECT * FROM effects')).rows).toHaveLength(3);
 });
 it('preserves historical duplicates and cancelled documents instead of deleting or rewriting them',async()=>{
  await seed({...identity,estado:'anulado'});await seed(identity);
  await expect(create(identity)).rejects.toMatchObject({statusCode:409});
  expect((await pool!.query('SELECT estado FROM purchase_invoices ORDER BY id')).rows).toEqual([{estado:'anulado'},{estado:'pendiente'}]);
 });
});
