import pg from 'pg';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { ensureChannexAriSchema } from '../channex/ariSchema';
import { buildAriValues, addDays, type AriEvent } from '../channex/ari';
import { dispatchChannexAri, AriTransportError } from '../channex/ariWorker';
vi.mock('../auth', () => ({ requireAuth: (_r: any, _s: any, next: any) => next(), requirePermission: () => (_r: any, _s: any, next: any) => next() }));
const url = process.env.CHANNEX_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const schema = `channex_test_${randomUUID().replaceAll('-', '')}`;
let pool: pg.Pool, root: pg.Pool, server: Server, origin: string;
const connection = { id: 'connection', channex_property_id: 'property', floor: 2, currency: 'USD' };
const day = addDays(new Date().toISOString().slice(0, 10), 23);
const event = (kind: 'availability' | 'restrictions' = 'availability'): AriEvent => ({ id: '1', kind, date_from: day, date_to: day, room_type_id: null, rate_plan_id: null, attempts: 0 });
suite('Channex outbox with isolated real PostgreSQL', () => {
  beforeAll(async () => {
    const target = new URL(url!);
    const localFixture = target.hostname === '127.0.0.1' && target.port === '55448' && target.pathname === '/channex_test';
    const ciFixture = process.env.CI === 'true' && ['localhost', '127.0.0.1'].includes(target.hostname) && target.port === '5432' && target.pathname === '/maran_test';
    if (!localFixture && !ciFixture) throw Error('Only the dedicated disposable Channex or CI database is allowed');
    root = new pg.Pool({ connectionString: url, max: 1 }); await root.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, max: 4, options: `-c search_path=${schema},public` });
    await pool.query(`
   CREATE TABLE channex_connections(id varchar PRIMARY KEY,environment text,base_url text,is_active boolean,channex_property_id text,api_key_encrypted text);
   CREATE TABLE room_types(id varchar PRIMARY KEY,name text);
   CREATE TABLE rooms(id varchar PRIMARY KEY,room_number text,room_type_id varchar,floor int,status text,is_active boolean,is_virtual boolean);
   CREATE TABLE reservations(id varchar PRIMARY KEY,room_id varchar,check_in_date date,check_out_date date,status text);
   CREATE TABLE rate_plans(id varchar PRIMARY KEY,room_type_id varchar,base_rate numeric(10,2),currency text,valid_from date,valid_to date);
   CREATE TABLE maintenance_blocks(id varchar PRIMARY KEY,room_id varchar,block_from date,block_to date);
   CREATE TABLE groups(id varchar PRIMARY KEY,check_in_date date,check_out_date date,status text);
   CREATE TABLE group_room_blocks(id varchar PRIMARY KEY,group_id varchar,room_type_id varchar,quantity int,block_check_in_date date,block_check_out_date date);
   CREATE TABLE group_reservation_links(id varchar PRIMARY KEY,group_id varchar,reservation_id varchar);
   CREATE TABLE channex_room_type_mappings(connection_id varchar,channex_room_type_id varchar,room_type_id varchar);
   CREATE TABLE channex_rate_plan_mappings(connection_id varchar,channex_room_type_id varchar,channex_rate_plan_id varchar,rate_plan_id varchar);
  `);
    await ensureChannexAriSchema(pool); await ensureChannexAriSchema(pool);
    const { registerChannexAriRoutes } = await import('../channex/ariRoutes');
    const app = express(); app.use(express.json()); registerChannexAriRoutes(app, pool);
    server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await pool?.end(); if (root) { await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.end(); } });
  beforeEach(async () => {
    await pool.query(`TRUNCATE channex_ari_outbox,channex_ari_settings,channex_connections,room_types,rooms,reservations,rate_plans,maintenance_blocks,groups,group_room_blocks,group_reservation_links,channex_room_type_mappings,channex_rate_plan_mappings CASCADE;
   UPDATE channex_ari_dispatch SET next_call_at=now()-interval '1 minute';
   INSERT INTO channex_connections VALUES('connection','demo','https://staging.channex.io/api/v1',true,'property','synthetic');
   INSERT INTO room_types VALUES('twin','Twin');
   INSERT INTO rooms VALUES('201','201','twin',2,'available',true,false),('202','202','twin',2,'dirty',true,false),('301','301','twin',3,'available',true,false),('virtual','REUB','twin',2,'available',true,true),('inactive','299','twin',2,'available',false,false);
   INSERT INTO rate_plans VALUES('bar','twin',100,'USD',NULL,NULL);
   INSERT INTO channex_room_type_mappings VALUES('connection','remote-twin','twin');
   INSERT INTO channex_rate_plan_mappings VALUES('connection','remote-twin','remote-bar','bar');
  `);
  });
  async function enable() { await pool.query(`INSERT INTO channex_ari_settings(connection_id,enabled,floor,currency,last_horizon_date,capture_started_at) VALUES('connection',true,2,'USD',(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,now())`); }
  it('previews only physical active rooms on floor 2 and captures nothing by default', async () => {
    const response = await fetch(`${origin}/api/channex/connections/connection/ari`); const data = await response.json();
    expect(data.rooms.map((r: any) => r.roomNumber)).toEqual(['201', '202']); expect(data.settings.enabled).toBe(false);
    await pool.query(`UPDATE rate_plans SET base_rate=241 WHERE id='bar'`);
    expect((await pool.query('SELECT count(*)::int AS n FROM channex_ari_outbox')).rows[0].n).toBe(0);
  });
  it('configures scope through the PMS endpoint and queues exactly two full-sync jobs', async () => {
    const r = await fetch(`${origin}/api/channex/connections/connection/ari`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ floor: 2, currency: 'USD', enabled: true }) });
    expect(r.status).toBe(200);
    const jobs = (await pool.query('SELECT kind,date_to-date_from AS span FROM channex_ari_outbox ORDER BY kind')).rows;
    expect(jobs).toEqual([{ kind: 'availability', span: 499 }, { kind: 'restrictions', span: 499 }]);
    expect((await fetch(`${origin}/api/channex/connections/connection/ari/full-sync`, { method: 'POST' })).status).toBe(409);
    const invalid = await fetch(`${origin}/api/channex/connections/connection/ari`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ floor: 3, currency: 'USD', enabled: true }) }); expect(invalid.status).toBe(409);
  });
  it('rolls back outbox events with source writes and captures both sides of a moved reservation', async () => {
    await enable(); const c = await pool.connect();
    try { await c.query('BEGIN'); await c.query(`INSERT INTO reservations VALUES('r','201','${addDays(day, 0)}','${addDays(day, 2)}','confirmed')`); await c.query('ROLLBACK'); } finally { c.release(); }
    expect((await pool.query('SELECT count(*)::int AS n FROM channex_ari_outbox')).rows[0].n).toBe(0);
    await pool.query(`INSERT INTO reservations VALUES('r','201','${addDays(day, 0)}','${addDays(day, 2)}','confirmed'); UPDATE reservations SET check_in_date='${addDays(day, 4)}',check_out_date='${addDays(day, 5)}' WHERE id='r'`);
    const ranges = (await pool.query('SELECT date_from::text,date_to::text FROM channex_ari_outbox ORDER BY id')).rows;
    expect(ranges).toEqual([{ date_from: addDays(day, 0), date_to: addDays(day, 1) }, { date_from: addDays(day, 0), date_to: addDays(day, 1) }, { date_from: addDays(day, 4), date_to: addDays(day, 4) }]);
  });
  it('counts rooms once, excludes other floors, uses checkout as exclusive and maintenance end as inclusive', async () => {
    const availability = async () => (await buildAriValues(pool as any, connection, [event()], day))[0].availability;
    expect(await availability()).toBe(2);
    await pool.query(`INSERT INTO reservations VALUES('checkout','201','${addDays(day, -1)}','${addDays(day, 0)}','confirmed'),('cancelled','202','${addDays(day, 0)}','${addDays(day, 1)}','cancelled')`);
    expect(await availability()).toBe(2);
    await pool.query(`INSERT INTO maintenance_blocks VALUES('m','201','${addDays(day, -1)}','${addDays(day, 0)}'); INSERT INTO reservations VALUES('overlap','201','${addDays(day, 0)}','${addDays(day, 1)}','checked_in')`);
    expect(await availability()).toBe(1);
  });
  it('subtracts unassigned group rooms conservatively without double subtracting multiple blocks', async () => {
    await pool.query(`INSERT INTO groups VALUES('g','${addDays(day, 0)}','${addDays(day, 2)}','confirmed');
   INSERT INTO group_room_blocks VALUES('b1','g','twin',1,NULL,NULL),('b2','g','twin',1,NULL,NULL);
   INSERT INTO reservations VALUES('r','201','${addDays(day, 0)}','${addDays(day, 2)}','confirmed'); INSERT INTO group_reservation_links VALUES('l','g','r')`);
    expect((await buildAriValues(pool as any, connection, [event()], day))[0].availability).toBe(0);
  });
  it('batches actual price changes, persists Channex task IDs and recomputes the latest absolute price', async () => {
    await enable(); await pool.query(`UPDATE rate_plans SET base_rate=241.23 WHERE id='bar'; UPDATE rate_plans SET base_rate=333 WHERE id='bar'`);
    const send = vi.fn(async () => ['00000000-0000-4000-8000-000000000001']);
    expect((await dispatchChannexAri(pool, send, true)).state).toBe('delivered'); expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2]).toEqual([expect.objectContaining({ rate: '333.00', rate_plan_id: 'remote-bar' })]);
    expect((await pool.query("SELECT count(*)::int AS n FROM channex_ari_outbox WHERE status='delivered' AND task_ids IS NOT NULL")).rows[0].n).toBe(4);
  });
  it('retries 429 without dropping events, globally honors cooldown and serializes replicas', async () => {
    await enable(); await pool.query(`UPDATE rate_plans SET base_rate=333 WHERE id='bar'`);
    const failed = vi.fn(async () => { throw new AriTransportError(429, '120') });
    expect((await dispatchChannexAri(pool, failed, true)).state).toBe('retry');
    expect((await dispatchChannexAri(pool, failed, true)).state).toBe('cooldown'); expect(failed).toHaveBeenCalledTimes(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM channex_ari_outbox WHERE status='pending' AND attempts=1 AND run_after>now()+interval '100 seconds'")).rows[0].n).toBe(2);
    await pool.query(`UPDATE channex_ari_dispatch SET next_call_at=now()-interval '1 second'; UPDATE channex_ari_outbox SET run_after=now()`);
    let release!: () => void; const gate = new Promise<void>(r => release = r); let entered!: () => void; const enteredPromise = new Promise<void>(r => entered = r);
    const send = vi.fn(async () => { entered(); await gate; return ['task']; }); const first = dispatchChannexAri(pool, send, true); await enteredPromise;
    try { expect((await dispatchChannexAri(pool, send, true)).state).toBe('busy'); } finally { release(); await first; } expect(send).toHaveBeenCalledTimes(1);
  });
  it('blocks production, missing mappings and currency mismatches without sending', async () => {
    await enable(); await pool.query(`UPDATE rate_plans SET currency='ARS' WHERE id='bar'`); const send = vi.fn();
    expect((await dispatchChannexAri(pool, send, true)).state).toBe('blocked'); expect(send).not.toHaveBeenCalled();
    await pool.query(`UPDATE channex_ari_settings SET enabled=false; UPDATE channex_connections SET environment='real'; UPDATE channex_ari_settings SET enabled=true; UPDATE channex_ari_outbox SET status='pending'`);
    expect((await dispatchChannexAri(pool, send, true)).state).toBe('idle'); expect(send).not.toHaveBeenCalled();
  });
  it('does not send unchanged availability for an update on another floor', async () => {
    await enable(); await pool.query(`UPDATE rooms SET status='dirty' WHERE id='301'`);
    const send = vi.fn(async () => ['first']); expect((await dispatchChannexAri(pool, send, true)).state).toBe('delivered');
    await pool.query(`UPDATE channex_ari_dispatch SET next_call_at=now()-interval '1 second'; UPDATE rooms SET status='available' WHERE id='301'`);
    expect((await dispatchChannexAri(pool, send, true)).state).toBe('delivered'); expect(send).toHaveBeenCalledTimes(1);
  });
  it('prevents mapping edits while capture is enabled and allows them after pausing', async () => {
    await enable(); await expect(pool.query(`UPDATE channex_room_type_mappings SET room_type_id='other' WHERE connection_id='connection'`)).rejects.toThrow('Pausá la captura');
    await expect(pool.query(`UPDATE channex_connections SET base_url='https://app.channex.io/api/v1' WHERE id='connection'`)).rejects.toThrow('Pausá la captura');
    await pool.query(`UPDATE channex_ari_settings SET enabled=false; UPDATE channex_room_type_mappings SET room_type_id='other' WHERE connection_id='connection'`);
  });
  it('recovers every missed day at the edge of the 500-day horizon without a full sync', async () => {
    await enable(); await pool.query(`UPDATE channex_ari_settings SET last_horizon_date=last_horizon_date-3`);
    await dispatchChannexAri(pool, vi.fn(async () => ['edge']), true);
    const rows = (await pool.query(`SELECT date_to-date_from AS span,reason FROM channex_ari_outbox ORDER BY id`)).rows;
    expect(rows).toEqual([{ span: 2, reason: 'horizon_advance' }, { span: 2, reason: 'horizon_advance' }]);
  });
  it('retains 5xx failures for retry and never sends a duplicate payment or reservation', async () => {
    await enable(); await pool.query(`UPDATE rate_plans SET base_rate=241 WHERE id='bar'`);
    expect((await dispatchChannexAri(pool, async () => { throw new AriTransportError(503) }, true)).state).toBe('retry');
    expect((await pool.query("SELECT count(*)::int AS n FROM channex_ari_outbox WHERE status='pending' AND attempts=1")).rows[0].n).toBe(2);
    expect((await pool.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n).toBe(0);
  });

  it('keeps capturing during a pause and resumes without another full sync', async () => {
    const configure = (enabled: boolean) => fetch(`${origin}/api/channex/connections/connection/ari`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ floor: 2, currency: 'USD', enabled }) });
    expect((await configure(true)).status).toBe(200);
    expect((await configure(false)).status).toBe(200);
    await pool.query(`UPDATE rate_plans SET base_rate=321 WHERE id='bar'`);
    const send = vi.fn(); expect((await dispatchChannexAri(pool, send, true)).state).toBe('idle'); expect(send).not.toHaveBeenCalled();
    expect((await configure(true)).status).toBe(200);
    expect((await pool.query("SELECT count(*)::int AS n FROM channex_ari_outbox WHERE reason='full_sync'")).rows[0].n).toBe(2);
    expect((await pool.query("SELECT count(*)::int AS n FROM channex_ari_outbox WHERE reason='rate_plans:update'")).rows[0].n).toBe(2);
  });

});
