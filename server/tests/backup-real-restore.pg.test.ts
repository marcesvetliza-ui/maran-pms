import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
const suite=process.env.DATABASE_URL?describe:describe.skip;
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL}):null;
const suffix=randomUUID().replace(/-/g,''),parent='backup_parent_'+suffix,child='backup_child_'+suffix;
suite('Respaldo real: restricciones, tipos y captura consistente',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);if(!['localhost','127.0.0.1'].includes(url.hostname)||process.env.NODE_ENV==='production')throw new Error('Solo base local');
  await pool!.query(`CREATE TABLE "${parent}"(id serial PRIMARY KEY,parent_id integer REFERENCES "${parent}"(id),label text,labels text[],detail jsonb,precise numeric(24,6),instant timestamp)`);
  await pool!.query(`CREATE TABLE "${child}"(id serial PRIMARY KEY,parent_id integer NOT NULL REFERENCES "${parent}"(id))`);
  await pool!.query(`INSERT INTO "${parent}"(id,parent_id,label,labels,detail,precise,instant) VALUES(1,2,$1,$2,$3,123456789012345678.123456,'2026-10-07 12:34:56.123456'),(2,NULL,'Padre',ARRAY[]::text[],'{}',0,NULL)`,["Texto con 'comillas'\ny salto de línea",['Córdoba','texto, con coma','otra "marca"'],{name:'Datos de prueba'}]);
  await pool!.query(`SELECT setval(pg_get_serial_sequence($1,'id'),2,true)`,[parent]);await pool!.query(`INSERT INTO "${child}"(parent_id) VALUES(1)`);
 });
 afterAll(async()=>{await pool!.query(`DROP TABLE "${child}"`);await pool!.query(`DROP TABLE "${parent}"`);await pool!.end();const {pool:p}=await import('../db');await p.end();});
 it('el respaldo ordena padres antes de hijos y restaura con claves foráneas activas',async()=>{
  const {generateBackupSql,runRestoreTest}=await import('../backup');const sql=(await generateBackupSql()).toString('utf8');
  expect(sql.indexOf(`INSERT INTO "public"."${parent}"`)).toBeLessThan(sql.indexOf(`INSERT INTO "public"."${child}"`));
  expect(sql).toContain("123456789012345678.123456");expect(sql).toContain('2026-10-07 12:34:56.123456');expect(sql).toContain('SET CONSTRAINTS ALL IMMEDIATE;');
  const restored=await runRestoreTest();expect(restored.error).toBeUndefined();expect(restored.success).toBe(true);expect(restored.details.find(d=>d.table===parent)).toMatchObject({original_rows:2,restored_rows:2,ok:true});expect(restored.details.find(d=>d.table===child)).toMatchObject({ok:true});
 });
 it('lee todas las tablas desde el mismo estado aunque haya escrituras posteriores',async()=>{
  const reader=await pool!.connect();try{
   await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await reader.query(`SELECT COUNT(*) FROM "${parent}"`);
   await pool!.query(`WITH added AS (INSERT INTO "${parent}"(label) VALUES('Posterior') RETURNING id) INSERT INTO "${child}"(parent_id) SELECT id FROM added`);
   const {readBackupSnapshot}=await import('../backupSql');const snapshot=await readBackupSnapshot(reader);
   expect(snapshot.tables.find(t=>t.name===parent)?.rows).toHaveLength(2);expect(snapshot.tables.find(t=>t.name===child)?.rows).toHaveLength(1);await reader.query('COMMIT');
  }finally{await reader.query('ROLLBACK');reader.release();}
 });
});
