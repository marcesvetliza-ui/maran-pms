import type { PoolClient } from "pg";

export type BackupTable = {name:string; columns:string[]; rows:Record<string,string|null>[]};
export type BackupForeignKey = {table:string; parent:string; name:string; definition:string};
export type BackupSnapshot = {tables:BackupTable[]; foreignKeys:BackupForeignKey[]; sequences:{name:string;value:string;called:boolean}[]};
export const quoteBackupIdentifier = (name:string) => '"'+name.replace(/"/g,'""')+'"';
const literal = (value:string|null) => value===null?'NULL':"'"+value.replace(/'/g,"''")+"'";
export function backupTableOrder(snapshot:BackupSnapshot):BackupTable[]{
 const remaining=new Map(snapshot.tables.map(t=>[t.name,t])),result:BackupTable[]=[];
 while(remaining.size){
  const ready=[...remaining.values()].filter(t=>!snapshot.foreignKeys.some(f=>f.table===t.name && f.parent!==t.name && remaining.has(f.parent))).sort((a,b)=>a.name.localeCompare(b.name));
  if(!ready.length)throw new Error('El respaldo requiere resolver dependencias cíclicas entre tablas; no se generó un SQL incompleto.');
  for(const t of ready){result.push(t);remaining.delete(t.name);}
 }
 return result;
}
/** Read one consistent data snapshot; textual PG values preserve arrays, bytea and microseconds. */
export async function readBackupSnapshot(client:PoolClient):Promise<BackupSnapshot>{
 const names=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(r=>String(r.table_name));
 const foreignKeys=(await client.query(`SELECT child.relname AS "table",parent.relname AS parent,c.conname AS name,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace n ON n.oid=child.relnamespace WHERE c.contype='f' AND n.nspname='public'`)).rows as BackupForeignKey[];
 const tables:BackupTable[]=[];
 for(const name of names){
  const columns=(await client.query(`SELECT a.attname FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=$1 AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' ORDER BY a.attnum`,[name])).rows.map(r=>String(r.attname));
  const rows=(await client.query(`SELECT ${columns.map(c=>`${quoteBackupIdentifier(c)}::text AS ${quoteBackupIdentifier(c)}`).join(',')} FROM public.${quoteBackupIdentifier(name)}`)).rows;
  tables.push({name,columns,rows});
 }
 const sequenceNames=(await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname='public' ORDER BY c.relname")).rows.map(r=>String(r.relname));
 const sequences:BackupSnapshot['sequences']=[];
 for(const name of sequenceNames){const r=(await client.query(`SELECT last_value::text AS value,is_called AS called FROM public.${quoteBackupIdentifier(name)}`)).rows[0];sequences.push({name,value:r.value,called:r.called});}
 return {tables,foreignKeys,sequences};
}
export function renderBackupSql(snapshot:BackupSnapshot,schema='public',includeTransaction=true,includeSequences=true):string{
 const ordered=backupTableOrder(snapshot),target=quoteBackupIdentifier(schema);
 const lines=['-- Maran: respaldo de datos. Requiere la estructura de la misma versión.',"SET client_encoding = 'UTF8';","SET standard_conforming_strings = on;"];
 if(includeTransaction)lines.push('BEGIN;');
 for(const t of [...ordered].reverse())lines.push(`DELETE FROM ${target}.${quoteBackupIdentifier(t.name)};`);
 for(const t of ordered){
  if(!t.rows.length)continue;
  // One statement per table also preserves non-deferrable self-references.
  const tuples=t.rows.map(r=>'('+t.columns.map(c=>literal(r[c])).join(', ')+')');
  lines.push(`INSERT INTO ${target}.${quoteBackupIdentifier(t.name)} (${t.columns.map(quoteBackupIdentifier).join(', ')}) OVERRIDING SYSTEM VALUE VALUES ${tuples.join(',\n')};`);
 }
 lines.push('SET CONSTRAINTS ALL IMMEDIATE;');
 if(includeSequences)for(const seq of snapshot.sequences)lines.push(`SELECT pg_catalog.setval(${literal(`${target}.${quoteBackupIdentifier(seq.name)}`)}::regclass, ${literal(seq.value)}::bigint, ${seq.called?'true':'false'});`);
 if(includeTransaction)lines.push('COMMIT;');
 return lines.join('\n');
}
