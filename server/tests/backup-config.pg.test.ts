import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {describe,it,expect,beforeEach,afterEach} from 'vitest';
import {saveBackupConfig} from '../backup-config';

const connection=process.env.DATABASE_URL;
if(connection){const url=new URL(connection);if(!['localhost','127.0.0.1'].includes(url.hostname)||!/test/i.test(url.pathname))throw new Error('Backup config regression requires a disposable local test database.');}
(connection?describe:describe.skip)('backup configuration with updated_at NOT NULL and no default',()=>{
  let client:pg.Client,database:ReturnType<typeof drizzle>,schema:string;
  beforeEach(async()=>{
    client=new pg.Client({connectionString:connection});await client.connect();
    schema='backup_config_'+randomUUID().replaceAll('-','');await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`SET search_path TO "${schema}"`);
    await client.query(`CREATE TABLE system_settings(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,key text NOT NULL UNIQUE,value text NOT NULL,category text NOT NULL DEFAULT 'general',description text,updated_at timestamp NOT NULL,updated_by text)`);
    database=drizzle(client);
  });
  afterEach(async()=>{if(client){if(schema)await client.query(`DROP SCHEMA "${schema}" CASCADE`);await client.end();}});
  it('reproduces the reported failure and saves new settings with timestamp and actor',async()=>{
    await expect(client.query("INSERT INTO system_settings(key,value) VALUES ('backup_auto_enabled','true')")).rejects.toMatchObject({code:'23502',column:'updated_at'});
    await saveBackupConfig(database,{enabled:true,email:'backup@example.test'},'operator-1');
    const result=await client.query('SELECT * FROM system_settings ORDER BY key');
    expect(result.rows).toHaveLength(2);expect(result.rows.map(row=>row.value)).toEqual(['true','backup@example.test']);
    for(const row of result.rows){expect(row.updated_at).toBeInstanceOf(Date);expect(row.updated_by).toBe('operator-1');}
  });
  it('updates existing settings and leaves omitted options and unrelated metadata unchanged',async()=>{
    await saveBackupConfig(database,{enabled:true,email:'old@example.test'},'operator-1');
    await client.query("UPDATE system_settings SET updated_at='2000-01-01',category='preserved'");
    const id=(await client.query("SELECT id FROM system_settings WHERE key='backup_email'")).rows[0].id;
    await saveBackupConfig(database,{email:'new@example.test'},'operator-2');
    const email=(await client.query("SELECT * FROM system_settings WHERE key='backup_email'")).rows[0];
    expect(email).toMatchObject({id,value:'new@example.test',category:'preserved',updated_by:'operator-2'});expect(email.updated_at.getTime()).toBeGreaterThan(new Date('2000-01-02').getTime());
    const enabled=(await client.query("SELECT * FROM system_settings WHERE key='backup_auto_enabled'")).rows[0];
    expect(enabled.value).toBe('true');expect(enabled.updated_by).toBe('operator-1');expect(enabled.updated_at.getFullYear()).toBe(2000);
    await saveBackupConfig(database,{enabled:false},'operator-2');expect((await client.query("SELECT value FROM system_settings WHERE key='backup_auto_enabled'")).rows[0].value).toBe('false');
    await expect(saveBackupConfig(database,{},'operator-2')).resolves.toBeUndefined();
  });
  it('does not partially enable a backup if saving the destination fails',async()=>{
    await saveBackupConfig(database,{enabled:false,email:'old@example.test'},'operator-1');
    await client.query("ALTER TABLE system_settings ADD CHECK (value <> 'reject-test-value')");
    await expect(saveBackupConfig(database,{enabled:true,email:'reject-test-value'},'operator-2')).rejects.toMatchObject({code:'23514'});
    const rows=await client.query('SELECT key,value FROM system_settings ORDER BY key');expect(rows.rows).toEqual([{key:'backup_auto_enabled',value:'false'},{key:'backup_email',value:'old@example.test'}]);
  });
});
