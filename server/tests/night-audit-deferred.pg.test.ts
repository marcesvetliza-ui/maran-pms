import {it,expect,afterAll} from 'vitest';
import {sql} from 'drizzle-orm';
import {db,pool,withDatabaseTransaction} from '../db';
import {getDeferredDespegarReservationIds} from '../nightAuditDeferred';
afterAll(async()=>pool.end());
it('identifica factura cero CC vigente de Despegar y excluye factura real, anulada, cortesía y nombres parecidos',async()=>{
 expect(['localhost','127.0.0.1']).toContain(new URL(process.env.DATABASE_URL!).hostname);
 const rollback=new Error('rollback');
 await expect(withDatabaseTransaction(async()=>{
  await db.execute(sql`CREATE TEMP TABLE reservations(id text,agency_id text,source text) ON COMMIT DROP`);
  await db.execute(sql`CREATE TEMP TABLE agencies(id text,razon_social text,nombre_fantasia text) ON COMMIT DROP`);
  await db.execute(sql`CREATE TEMP TABLE sales_invoices(reserva_id text,estado text,tipo_comprobante text,monto_total numeric,cash_forma_pago text) ON COMMIT DROP`);
  await db.execute(sql`INSERT INTO agencies VALUES('d','DESPEGAR.COM.AR SA',NULL),('other','Viajes Despegar del Sur',NULL)`);
  await db.execute(sql`INSERT INTO reservations VALUES('pending','d','agencia'),('real','d','agencia'),('void','d','agencia'),('cash','d','agencia'),('other','other','agencia'),('legacy',NULL,'despegar')`);
  await db.execute(sql`INSERT INTO sales_invoices VALUES('pending','emitida','FA',0,'cuenta_corriente'),('real','emitida','FA',0,'cuenta_corriente'),('real','emitida','FA',100,'cuenta_corriente'),('void','anulada','FA',0,'cuenta_corriente'),('cash','emitida','FA',0,'efectivo'),('other','emitida','FA',0,'cuenta_corriente'),('legacy','emitida','FB',0,'cuenta_corriente')`);
  expect([...await getDeferredDespegarReservationIds(['pending','real','void','cash','other','legacy'])].sort()).toEqual(['legacy','pending']);
  expect([...await getDeferredDespegarReservationIds([])]).toEqual([]);
  throw rollback;
 })).rejects.toBe(rollback);
});
