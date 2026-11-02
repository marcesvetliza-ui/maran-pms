import pg from "pg";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("../db",()=>({db:{}}));
import { enrichCashDocumentEvidence } from "../cash-document-evidence";
import { getCashDayReport } from "../cash-day-report";
import { cashDocumentSummary } from "@shared/cash-document-classification";
const suite=process.env.CASH_DOCUMENT_TEST_DATABASE_URL ? describe : describe.skip;
let pool:pg.Pool, client:pg.PoolClient, executor:ReturnType<typeof drizzle>;
suite("read-only cash document evidence (temporary PostgreSQL tables)",()=>{
 beforeAll(async()=>{
  pool=new pg.Pool({connectionString:process.env.CASH_DOCUMENT_TEST_DATABASE_URL});client=await pool.connect();executor=drizzle(client);
  await client.query("BEGIN");
  // Temporary tables shadow public names and roll back; no operational data is touched.
  await client.query(`
   CREATE TEMP TABLE cash_movements(id text,source_type text,source_id text,payment_id text,receipt_type text,receipt_number text,payment_method text,amount numeric,movement_type text,area text,source_label text,created_at timestamp,anulado boolean);
   CREATE TEMP TABLE sales_control_archive(kind text,record_id text);
   INSERT INTO cash_movements VALUES
    ('c1','reservation','r1','p1','factura_b','1','cash',240,'income','reception','Factura','2026-11-02 15:00',false),
    ('c2','reservation','r2','p2','cierre_habitacion','2','cash',2627.5,'income','reception','Cierre','2026-11-02 15:01',false),
    ('rest','restaurant_order','order',NULL,'voucher_justo','3','cash',50,'income','restaurant','Restaurante','2026-11-02 03:00',false),
    ('old','manual',NULL,NULL,NULL,NULL,'cash',99,'income','reception','Ayer','2026-11-02 02:59',false),
    ('void','manual',NULL,NULL,NULL,NULL,'cash',900,'income','reception','Anulado','2026-11-02 15:00',true),
    ('info','comprobante','1',NULL,'FB',NULL,'cash',240,'informational','reception','Factura ya cobrada','2026-11-02 15:00',false),
    ('opening','manual',NULL,NULL,'inicio_caja',NULL,'cash',1000,'income','reception','Fondo','2026-11-02 15:00',false),
    ('expense','manual',NULL,NULL,'retiro_efectivo',NULL,'cash',10,'expense','reception','Retiro','2026-11-02 15:00',false),
    ('archived','manual',NULL,NULL,NULL,NULL,'cash',888,'income','reception','Archivado','2026-11-02 15:00',false);
   INSERT INTO sales_control_archive VALUES ('cash_movement','archived');
   CREATE TEMP TABLE payments(id text,reservation_id text,invoice_ref text);
   CREATE TEMP TABLE group_payments(id text,invoice_ref text,invoice_id integer);
   CREATE TEMP TABLE spa_payments(id text,account_id text);
   CREATE TEMP TABLE spa_accounts(id text,invoice_id integer);
   CREATE TEMP TABLE event_payments(id text,invoice_ref text);
   CREATE TEMP TABLE sales_invoices(id integer,tipo_comprobante text,punto_venta integer,numero integer,estado text,payment_id text,reserva_id text,group_payment_id text,restaurant_order_id text,nota_credito_id integer);
   INSERT INTO payments VALUES ('p1','r1','{"id":1}'),('p2','r2','{"id":2}'),('advance','r3',NULL),('bad','r4','invalid legacy JSON');
   INSERT INTO sales_invoices VALUES (1,'FB',5,1,'emitida','p1','r1',NULL,NULL,NULL),(2,'cierre_habitacion',5,2,'emitida','p2','r2',NULL,NULL,NULL);
  `);
 });
 afterAll(async()=>{if(client){await client.query("ROLLBACK");client.release();}if(pool)await pool.end();});
 const input=()=>[
  {id:'c1',sourceType:'reservation',sourceId:'r1',paymentId:'p1',paymentMethod:'cash',amount:240,movementType:'income'},
  {id:'c2',sourceType:'reservation',sourceId:'r2',paymentId:'p2',receiptType:'cierre_habitacion',paymentMethod:'cash',amount:2627.5,movementType:'income'},
  {id:'c3',sourceType:'reservation',sourceId:'r3',paymentId:'advance',paymentMethod:'cash',amount:100,movementType:'income'},
  {id:'c4',sourceType:'legacy',sourceId:'r1',paymentMethod:'cash',amount:240,movementType:'income'},
 ];
 it('daily report reconciles collections from all areas, excludes opening/voids/archives/informational entries and uses the Argentine day',async()=>{
  const report=await getCashDayReport('2026-11-02',executor, sql`NOT EXISTS (SELECT 1 FROM sales_control_archive WHERE kind='cash_movement' AND record_id=cm.id)`);
  expect(report.movimientos.map(m=>m.id)).toEqual(['rest','c1','c2']);
  expect(report.totalGeneral).toBe(2917.5);
  expect(report.totalPorMetodo.cash).toBe(2917.5);
  expect(report.porModulo).toEqual({restaurant:50,reserva:2867.5});
  expect(report.movimientos.map(m=>m.documentClass)).toEqual(['non_fiscal','fiscal','non_fiscal']);
 });
 it('links by exact payment ownership, not matching reservation amounts; references never multiply money',async()=>{
  const result=await enrichCashDocumentEvidence(input(),executor);
  expect(result.map(m=>m.documentClass)).toEqual(['fiscal','non_fiscal','pending','unclassified']);
  expect(result).toHaveLength(4);
  expect(cashDocumentSummary(result).map(row=>row.total)).toEqual([240,2627.5,100,240,0]);
 });
 it('reclassifies an existing advance after issuance without creating a cash row or changing its amount',async()=>{
  await client.query(`INSERT INTO sales_invoices VALUES (3,'FB',5,3,'emitida','advance','r3',NULL,NULL,NULL)`);
  const result=await enrichCashDocumentEvidence(input(),executor);
  expect(result[2]).toMatchObject({id:'c3',amount:100,documentClass:'fiscal',documentReference:'Factura B 0005-00000003'});
  expect(result.reduce((sum,m)=>sum+m.amount,0)).toBe(3207.5);
 });
 it('does not trust a corrupt display reference, or attach another room payment',async()=>{
  const result=await enrichCashDocumentEvidence([{id:'bad',sourceType:'reservation',sourceId:'r4',paymentId:'bad'},{id:'wrong-owner',sourceType:'reservation',sourceId:'r99',paymentId:'p1'}],executor);
  expect(result.map(m=>m.documentClass)).toEqual(['unclassified','unclassified']);
 });
});
