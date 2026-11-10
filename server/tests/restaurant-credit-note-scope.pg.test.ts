import pg from 'pg';
import express from 'express';
import {createServer,type Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import {PgDialect} from 'drizzle-orm/pg-core';
import {beforeAll,afterAll,expect,it,describe,vi} from 'vitest';
const state=vi.hoisted(()=>({execute:null as null|((query:any)=>Promise<any>)}));
vi.mock('../db',()=>({db:{execute:(query:any)=>state.execute!(query)}}));
vi.mock('../permissions',()=>({hasPermission:(_role:string,key:string)=>key==='api:billing:restaurant-credit-note'}));
import {requireCreditNoteAccess} from '../billing/restaurantCreditNoteAccess';
const url=process.env.DATABASE_URL, schema='restaurant_nc_scope_'+randomUUID().replaceAll('-','');
const suite=url?describe:describe.skip;
let root:pg.Pool,pool:pg.Pool,server:Server,origin:string;
suite('Restaurant credit-note origin isolation on disposable PostgreSQL tables',()=>{
 beforeAll(async()=>{
  const target=new URL(url!);
  if(!['127.0.0.1','localhost'].includes(target.hostname)||target.pathname!=='/maran_test')throw Error('Only local maran_test fixtures allowed');
  root=new pg.Pool({connectionString:url});await root.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema},public`});
  await pool.query(`CREATE TABLE restaurant_orders(id varchar PRIMARY KEY);
   CREATE TABLE sales_invoices(id int PRIMARY KEY,restaurant_order_id varchar,reserva_id varchar,group_id varchar,spa_account_id varchar,center_settlement_area text);
   INSERT INTO restaurant_orders VALUES('order');
   INSERT INTO sales_invoices VALUES(1,'order',NULL,NULL,NULL,NULL),(2,NULL,'reservation',NULL,NULL,NULL),
    (3,'order','reservation',NULL,NULL,NULL),(4,'order',NULL,'group',NULL,NULL),
    (5,'order',NULL,NULL,'spa',NULL),(6,'missing-order',NULL,NULL,NULL,NULL),
    (7,'order',NULL,NULL,NULL,'spa'),(8,'order',NULL,NULL,NULL,'restaurant');`);
  state.execute=async query=>{const compiled=new PgDialect().sqlToQuery(query);return pool.query(compiled.sql,compiled.params);};
  const app=express();app.use((req,_res,next)=>{req.user={role:'restaurant'} as any;next();});
  app.post('/invoices/:id/nota-credito',requireCreditNoteAccess,(_req,res)=>res.json({authorized:true}));
  server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as any).port}`;
 });
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await pool?.end();if(root){await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}});
 it('allows only invoices linked to an existing restaurant order',async()=>{
  for(const id of [1,8])expect((await fetch(`${origin}/invoices/${id}/nota-credito`,{method:'POST'})).status).toBe(200);
 });
 it('denies reception, mixed origins, groups, SPA, missing orders and unknown invoices',async()=>{
  for(const id of [2,3,4,5,6,7,999])expect((await fetch(`${origin}/invoices/${id}/nota-credito`,{method:'POST'})).status).toBe(403);
  expect((await pool.query('SELECT count(*)::int AS n FROM sales_invoices')).rows[0].n).toBe(8);
 });
});
