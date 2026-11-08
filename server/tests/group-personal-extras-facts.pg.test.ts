import pg from 'pg';
import {PgDialect} from 'drizzle-orm/pg-core';
import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {groupPersonalExtrasFactsQuery} from '../groupPersonalExtrasFacts';
import {calculateGroupPersonalExtrasCap} from '@shared/groupPersonalExtras';
const url=process.env.DATABASE_URL;
const suite=url?describe:describe.skip;
const schema=`extras_balance_${randomUUID().replaceAll('-','')}`;
let pool:pg.Pool,root:pg.Pool;
async function balance(){const q=new PgDialect().sqlToQuery(groupPersonalExtrasFactsQuery('r1'));const row=(await pool.query(q.sql,q.params)).rows[0];return {row,cap:calculateGroupPersonalExtrasCap({config:row.config,extras:row.extras,directPaid:row.direct_paid,personalPaid:row.personal_paid,lodging:row.room_lodging,groupFunds:row.group_funds,groupLodging:row.group_lodging})};}
suite('group extras facts against local PostgreSQL',()=>{
 beforeAll(async()=>{
  const target=new URL(url!);
  if(!(process.env.CI==='true'&&['localhost','127.0.0.1'].includes(target.hostname)&&target.port==='5432'&&target.pathname==='/maran_test'))throw Error('Requires disposable local CI database');
  root=new pg.Pool({connectionString:url,max:1});await root.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString:url,max:2,options:`-c search_path=${schema},public`});
  await pool.query(`CREATE TABLE groups(id text,master_folio_config text);
   CREATE TABLE reservations(id text,total_room_amount numeric,status text);
   CREATE TABLE group_reservation_links(group_id text,reservation_id text);
   CREATE TABLE charges(reservation_id text,amount numeric,status text,category text);
   CREATE TABLE payments(id text,reservation_id text,amount numeric,status text,group_payment_id text,notes text);
   CREATE TABLE group_payments(id text,group_id text,amount numeric,destination text,distribution text)`);
 });
 beforeEach(async()=>{await pool.query(`TRUNCATE groups,reservations,group_reservation_links,charges,payments,group_payments;
  INSERT INTO groups VALUES('g','accommodation');
  INSERT INTO reservations VALUES('r1',181500,'checked_in'),('r2',181500,'checked_in');
  INSERT INTO group_reservation_links VALUES('g','r1'),('g','r2');
  INSERT INTO charges VALUES('r1',77000,'active','restaurant'),('r1',5000,'anulado','minibar'),('r2',100000,'active','restaurant');
  INSERT INTO payments VALUES('lodging','r1',181500,'active',NULL,NULL),('other-room','r2',999999,'active',NULL,NULL)`);});
 afterAll(async()=>{await pool?.end();if(root){await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}});
 it('keeps the 77000 extras balance after the lodging payment and scopes facts to this room',async()=>{
  expect((await balance()).cap).toBe(77000);
  await pool.query(`INSERT INTO payments VALUES('extras','r1',77000,'active',NULL,'[personal_extras]')`);
  expect((await balance()).cap).toBe(0);
  await pool.query("UPDATE payments SET status='anulado' WHERE id='extras'");
  expect((await balance()).cap).toBe(77000);
 });
 it('counts only a general receipt excess above lodging toward extras',async()=>{
  await pool.query(`INSERT INTO payments VALUES('general-extra','r1',38500,'active',NULL,NULL)`);
  expect((await balance()).cap).toBe(38500);
 });
 it('excludes master-folio child rows and retains the group funding safeguard',async()=>{
  await pool.query(`INSERT INTO group_payments VALUES('master','g',1000,'master_folio','master_folio');
   INSERT INTO payments VALUES('master-child','r1',1000,'active','master',NULL)`);
  const value=await balance();expect(Number(value.row.direct_paid)).toBe(181500);expect(value.cap).toBe(77000);
  await pool.query("UPDATE group_payments SET amount=400000");
  expect((await balance()).cap).toBe(40000);
 });
});
