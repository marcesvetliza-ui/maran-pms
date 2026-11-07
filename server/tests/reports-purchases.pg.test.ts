import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import express from 'express';
import type {Server} from 'node:http';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('../db',()=>({db:{execute:(q:any)=>state.db.execute(q),transaction:(fn:any,config:any)=>state.db.transaction(fn,config)}}));
vi.mock('../auth',()=>({requireAuth:(_q:any,_s:any,n:any)=>n(),requirePermission:()=> (_q:any,_s:any,n:any)=>n()}));
import {registerReportsRoutes,costosCompras} from '../reports/routes';
// Only temporary tables on the dedicated, explicitly configured test database.
const url=process.env.REPORTS_TEST_DATABASE_URL;
describe.skipIf(!url)('report purchase calculations in PostgreSQL',()=>{
 let client:Client,server:Server,base:string;
 beforeAll(async()=>{
  const parsed=new URL(url!);if(!['localhost','127.0.0.1'].includes(parsed.hostname)||!parsed.pathname.includes('test'))throw Error('Local test DB required');
  client=new Client({connectionString:url});await client.connect();state.db=drizzle(client);
  await client.query(`CREATE TEMP TABLE purchase_invoices(id text,supplier_id text,fecha_emision date,estado text,tipo_comprobante text,monto_total numeric,monto_neto numeric,monto_exento numeric,special_details jsonb,cuenta_contable_id text);
    CREATE TEMP TABLE accounting_suppliers(id text,razon_social text,cuit text);
    CREATE TEMP TABLE accounting_accounts(id text,codigo text,nombre text);`);
  const app=express();registerReportsRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));if(client)await client.end();});
 beforeEach(async()=>{await client.query('TRUNCATE purchase_invoices,accounting_suppliers,accounting_accounts');
  await client.query("INSERT INTO accounting_accounts VALUES('cost','500','Mercadería');INSERT INTO accounting_suppliers VALUES('a','Proveedor A','1'),('b','Proveedor B','2'),('c','Proveedor C','3')");
 });
 const invoice=async(id:string,supplier:string|null,total:number,status:string|null='pendiente',date='2026-11-06',details:any=null,type='FACT-A')=>client.query("INSERT INTO purchase_invoices VALUES($1,$2,$3,$4,$5,$6,$6/1.21,0,$7,'cost')",[id,supplier,date,status,type,total,details]);
 it('excludes cancelled invoice plus keeps its replacement, paid and legacy-null-state purchases',async()=>{
  await invoice('void','a',121,'anulado');await invoice('replacement','a',242);await invoice('paid','b',121,'pagado');await invoice('legacy','c',121,null);
  const costs=await costosCompras('2026-11-01','2026-11-30');expect(Number(costs[0].total)).toBe(484);
 });
 it('preserves existing net/exempt and retention rules without changing credit-note signs',async()=>{
  await invoice('new','a',121,'pagado','2026-11-06',{version:'1'});await invoice('ret','a',100,'pagado','2026-11-06',{version:'1'},'RETENCION');await invoice('nc','a',-60.5,'pagado','2026-11-06',null,'NC-A');
  const costs=await costosCompras('2026-11-01','2026-11-30');expect(Number(costs[0].total)).toBe(39.5);
 });
 it('computes total and percentages before top limit, excludes cancelled suppliers and includes unassigned purchases',async()=>{
  await invoice('a','a',300);await invoice('b','b',200);await invoice('c','c',100);await invoice('none',null,50);await invoice('void','c',10000,'anulado');await invoice('prev-a','a',150,'pagado','2026-10-06');await invoice('prev-void','a',9999,'anulado','2026-10-07');
  const response=await fetch(base+'/api/reports/proveedores?periodo=11/2026&top=2');expect(response.status).toBe(200);const data=await response.json();
  expect(data.totalComprasDelPeriodo).toBe(650);expect(data.totalComprasDelRanking).toBe(500);expect(data.cantidadProveedoresActivos).toBe(3);expect(data.ranking).toHaveLength(2);expect(data.ranking[0].porcentajeDelTotal).toBe(46.2);expect(data.mayorAlza[0]).toEqual({proveedor:'Proveedor A',variacion:100});
 });
 it('returns a genuine empty report for a month with no purchases',async()=>{
  await invoice('old','a',100,'pagado','2026-10-06');const data=await(await fetch(base+'/api/reports/proveedores?periodo=11/2026')).json();expect(data).toMatchObject({ranking:[],totalComprasDelPeriodo:0,totalComprasDelRanking:0,cantidadProveedoresActivos:0});
 });
});
