import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {updateRoomSelection} from '../channex/roomSelection';
const url=process.env.CHANNEX_TEST_DATABASE_URL;
const suite=url?describe:describe.skip;
const schema=`room_selection_${randomUUID().replaceAll('-','')}`;
let root:pg.Pool,pool:pg.Pool;
suite('physical Channex mapping edits on disposable PostgreSQL',()=>{
 beforeAll(async()=>{
  const target=new URL(url!);
  if(!(process.env.CI==='true'&&['localhost','127.0.0.1'].includes(target.hostname)&&target.port==='5432'&&target.pathname==='/maran_test'))throw Error('Requires disposable local CI database');
  root=new pg.Pool({connectionString:url,max:1});await root.query(`CREATE SCHEMA ${schema}`);
  pool=new pg.Pool({connectionString:url,max:4,options:`-c search_path=${schema},public`});
  await pool.query(`CREATE TABLE channex_connections(id text PRIMARY KEY);
   CREATE TABLE channex_ari_settings(connection_id text,floor int,enabled boolean);
   CREATE TABLE channex_inbound_settings(connection_id text,enabled boolean);
   CREATE TABLE rooms(id text,room_type_id text,floor int,is_active boolean,is_virtual boolean,room_number text);
   CREATE TABLE channex_room_type_mappings(id text,connection_id text,channex_room_type_id text,channex_room_type_title text,room_type_id text,room_ids text[],created_at timestamp DEFAULT now())`);
 });
 beforeEach(async()=>{
  await pool.query(`TRUNCATE channex_connections,channex_ari_settings,channex_inbound_settings,rooms,channex_room_type_mappings;
   INSERT INTO channex_connections VALUES('c');
   INSERT INTO channex_ari_settings VALUES('c',3,false);
   INSERT INTO channex_inbound_settings VALUES('c',false);
   INSERT INTO rooms VALUES('301','premium',3,true,false,'301'),('307','premium',3,true,false,'307'),('401','premium',4,true,false,'401'),('302','exec',3,true,false,'302');
   INSERT INTO channex_room_type_mappings(id,connection_id,channex_room_type_id,channex_room_type_title) VALUES('four','c','remote-four','Premium 4'),('two','c','remote-two','Premium 2')`);
 });
 afterAll(async()=>{await pool?.end();if(root){await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}});
 it('saves disjoint Premium subsets, preserves PMS categories and rolls back a conflicting edit',async()=>{
  expect(await updateRoomSelection(pool,'four',{roomTypeId:'premium',roomIds:['301']})).toMatchObject({roomIds:['301']});
  await updateRoomSelection(pool,'two',{roomTypeId:'premium',roomIds:['307']});
  await expect(updateRoomSelection(pool,'two',{roomTypeId:'premium',roomIds:['301']})).rejects.toThrow(/dos categorías/);
  expect((await pool.query("SELECT room_ids FROM channex_room_type_mappings WHERE id='two'")).rows[0].room_ids).toEqual(['307']);
  expect((await pool.query("SELECT room_type_id FROM rooms WHERE id='301'")).rows[0].room_type_id).toBe('premium');
 });
 it('serializes concurrent edits that try to claim the same room',async()=>{
  const outcomes=await Promise.allSettled(['four','two'].map(id=>updateRoomSelection(pool,id,{roomTypeId:'premium',roomIds:['301']})));
  expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(outcomes.filter(r=>r.status==='rejected')).toHaveLength(1);
 });
 it('rejects wrong floors, categories, repeated IDs and edits while reception is enabled',async()=>{
  for(const roomIds of [['401'],['302'],['missing'],['301','301'],[]])await expect(updateRoomSelection(pool,'four',{roomTypeId:'premium',roomIds})).rejects.toThrow();
  await pool.query('UPDATE channex_inbound_settings SET enabled=true');
  await expect(updateRoomSelection(pool,'four',{roomTypeId:'premium',roomIds:['301']})).rejects.toThrow(/Pausá/);
 });
});
