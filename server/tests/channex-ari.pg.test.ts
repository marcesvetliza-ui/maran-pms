vi.mock('../channex/access',()=>({requireChannex:()=> (_r:any,_s:any,next:any)=>next()}));
import pg from 'pg';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { ensureChannexAriSchema } from '../channex/ariSchema';
import { buildAriValues, addDays, type AriEvent } from '../channex/ari';
import { validateRoomSelections } from '../channex/roomSelection';
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
   CREATE TABLE reservations(id varchar PRIMARY KEY,room_id varchar,check_in_date date,check_out_date date,status text,room_type_id varchar);
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
    const { registerRateCalendarRoutes } = await import('../rates/calendarRoutes');
    registerRateCalendarRoutes(app, async () => pool);
    server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); await pool?.end(); if (root) { await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.end(); } });
  beforeEach(async () => {
    await pool.query(`TRUNCATE rate_calendar_edits,rate_calendar_entries,channex_ari_outbox,channex_ari_settings,channex_connections,room_types,rooms,reservations,rate_plans,maintenance_blocks,groups,group_room_blocks,group_reservation_links,channex_room_type_mappings,channex_rate_plan_mappings CASCADE;
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
  it('splits one PMS category into disjoint physical rooms without counting another floor', async () => {
    await pool.query(`UPDATE channex_room_type_mappings SET room_ids=ARRAY['201'];
      INSERT INTO channex_room_type_mappings(connection_id,channex_room_type_id,room_type_id,room_ids) VALUES('connection','remote-second','twin',ARRAY['202'])`);
    await pool.query(`INSERT INTO reservations VALUES('occupied-201','201',$1::date,$1::date+1,'confirmed','twin')`, [day]);
    const values=await buildAriValues(pool as any,connection,[event()],day);
    expect(values.map(v=>[v.room_type_id,v.availability])).toEqual([['remote-second',1],['remote-twin',0]]);
    const {inventoryPreview}=await import('../channex/ari');
    expect((await inventoryPreview(pool as any,'connection',2)).map(r=>r.roomNumber)).toEqual(['201','202']);
  });
  it('rejects overlaps, empty selections, rooms from another floor and category-wide duplicates', async () => {
    await pool.query(`UPDATE channex_room_type_mappings SET room_ids=ARRAY['201'];
      INSERT INTO channex_room_type_mappings(connection_id,channex_room_type_id,room_type_id,room_ids) VALUES('connection','remote-second','twin',ARRAY['201'])`);
    await expect(validateRoomSelections(pool as any,'connection',2)).rejects.toThrow(/dos categorías/);
    await pool.query(`UPDATE channex_room_type_mappings SET room_ids=ARRAY[]::text[] WHERE channex_room_type_id='remote-second'`);
    await expect(validateRoomSelections(pool as any,'connection',2)).rejects.toThrow(/al menos una/);
    await pool.query(`UPDATE channex_room_type_mappings SET room_ids=ARRAY['301'] WHERE channex_room_type_id='remote-second'`);
    await expect(validateRoomSelections(pool as any,'connection',2)).rejects.toThrow(/piso configurados/);
    await pool.query(`UPDATE channex_room_type_mappings SET room_ids=NULL WHERE channex_room_type_id='remote-second'`);
    await expect(validateRoomSelections(pool as any,'connection',2)).rejects.toThrow(/mapeo único/);
  });
  it('blocks scalar rates for per-person plans and for unverified production pricing modes', async () => {
    await pool.query(`UPDATE channex_rate_plan_mappings SET sell_mode='per_person'`);
    await expect(buildAriValues(pool as any,connection,[event('restrictions')],day)).rejects.toThrow(/precios por ocupación/);
    await pool.query(`UPDATE channex_rate_plan_mappings SET sell_mode=NULL`);
    await expect(buildAriValues(pool as any,{...connection,environment:'real'},[event('restrictions')],day)).rejects.toThrow(/Actualizá el catálogo/);
  });
  it('previews only physical active rooms on floor 2 and captures nothing by default', async () => {
    const response = await fetch(`${origin}/api/channex/connections/connection/ari`); const data = await response.json();
    expect(data.rooms.map((r: any) => r.roomNumber)).toEqual(['201', '202']); expect(data.settings.enabled).toBe(false);
    await pool.query(`UPDATE rate_plans SET base_rate=241 WHERE id='bar'`);
    expect((await pool.query('SELECT count(*)::int AS n FROM channex_ari_outbox')).rows[0].n).toBe(0);
  });
  it('shows newest numeric event IDs first after crossing 99 to 100', async () => {
    await pool.query(`INSERT INTO channex_ari_outbox(id,connection_id,kind,date_from,date_to,reason,task_ids)
      VALUES(99,'connection','restrictions',$1,$1,'calendar','["old-task"]'),
            (100,'connection','restrictions',$1,$1,'calendar','["new-task"]'),
            (101,'connection','restrictions',$1,$1,'calendar','["latest-task"]')`, [day]);
    const response = await fetch(`${origin}/api/channex/connections/connection/ari`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.events.map((e: any) => e.id)).toEqual(['101', '100', '99']);
    expect(data.events[0].task_ids).toEqual(['latest-task']);
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
    expect(Object.keys(send.mock.calls[0][2][0]).sort()).toEqual(['date_from','date_to','property_id','rate','rate_plan_id']);
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
  it.each([503, 400, 'network'])('pauses other queued ARI for at least one minute after %s', async status => {
    await enable(); await pool.query(`UPDATE rate_plans SET base_rate=333 WHERE id='bar'`);
    const send = vi.fn(async () => { if (status === 'network') throw new TypeError('network unavailable'); throw new AriTransportError(Number(status)); });
    expect((await dispatchChannexAri(pool, send, true)).state).toBe(status === 400 ? 'blocked' : 'retry');
    expect((await pool.query("SELECT next_call_at > now()+interval '55 seconds' AS paused FROM channex_ari_dispatch WHERE id=1")).rows[0].paused).toBe(true);
    expect((await dispatchChannexAri(pool, send, true)).state).toBe('cooldown');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('blocks production, missing mappings and currency mismatches without sending', async () => {
    await enable(); await pool.query(`UPDATE rate_plans SET currency='ARS' WHERE id='bar'`); const send = vi.fn();
    expect((await dispatchChannexAri(pool, send, true)).state).toBe('blocked'); expect(send).not.toHaveBeenCalled();
    await pool.query(`UPDATE channex_ari_settings SET enabled=false`);
    await expect(pool.query(`UPDATE channex_connections SET environment='real'`)).rejects.toThrow('otra conexión');
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

  async function calendarRequest(path: string, body: any) {
    const response = await fetch(`${origin}/api/rate-calendar/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  it('reviews and saves dated prices and restrictions through the normal PMS API as one atomic batch', async () => {
    await pool.query(`INSERT INTO rate_plans VALUES('breakfast','twin',120,'USD',NULL,NULL); INSERT INTO channex_rate_plan_mappings VALUES('connection','remote-twin','remote-breakfast','breakfast')`);
    await enable();
    const changes = {
      changes: [{ ratePlanIds: ['bar'], dateFrom: day, dateTo: addDays(day, 1), values: { rate: '179.90', minStayArrival: 3, closedToArrival: true } },
      { ratePlanIds: ['breakfast'], dateFrom: addDays(day, 2), dateTo: addDays(day, 3), values: { rate: '219.25', minStayThrough: 2, stopSell: true } }]
    };
    const preview = await calendarRequest('preview', changes); expect(preview.status).toBe(200); expect(preview.body.changedCells).toBe(4);
    expect((await pool.query('SELECT count(*)::int AS n FROM rate_calendar_entries')).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM channex_ari_outbox')).rows[0].n).toBe(0);
    const saved = await calendarRequest('apply', { ...changes, previewToken: preview.body.previewToken }); expect(saved.status).toBe(200);
    expect((await pool.query('SELECT count(*)::int AS n FROM rate_calendar_entries')).rows[0].n).toBe(4);
    expect((await pool.query('SELECT count(*)::int AS n FROM rate_calendar_edits')).rows[0].n).toBe(1);
    expect((await pool.query('SELECT base_rate FROM rate_plans ORDER BY id')).rows.map(r => r.base_rate)).toEqual(['100.00', '120.00']);
    const events = (await pool.query('SELECT kind,rate_plan_id,date_to-date_from AS span FROM channex_ari_outbox ORDER BY rate_plan_id')).rows;
    expect(events).toEqual([{ kind: 'restrictions', rate_plan_id: 'bar', span: 1 }, { kind: 'restrictions', rate_plan_id: 'breakfast', span: 1 }]);
    const send = vi.fn(async () => ['calendar-task']); expect((await dispatchChannexAri(pool, send, true)).state).toBe('delivered'); expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2]).toEqual([
      expect.objectContaining({ rate_plan_id: 'remote-bar', date_from: day, date_to: addDays(day, 1), rate: '179.90', min_stay_arrival: 3, min_stay_through: 3, closed_to_arrival: true }),
      expect.objectContaining({ rate_plan_id: 'remote-breakfast', date_from: addDays(day, 2), date_to: addDays(day, 3), rate: '219.25', min_stay_through: 2, stop_sell: true })]);
  });
  it('sends the complete certification case 8 from the normal calendar API in one call beyond today+499', async () => {
    await pool.query(`INSERT INTO room_types VALUES('double','Double');
      INSERT INTO channex_room_type_mappings VALUES('connection','remote-double','double');
      INSERT INTO rate_plans VALUES('double-bar','double',120,'USD',NULL,NULL);
      INSERT INTO channex_rate_plan_mappings VALUES('connection','remote-double','remote-double-bar','double-bar')`);
    await enable();
    const today=(await pool.query("SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS day")).rows[0].day;
    // On 04/11/2026 this is exactly 01/12/2027–01/05/2028; keep the test valid as time advances.
    const from=addDays(today,392), to=addDays(from,152);
    const changes={changes:[
      {ratePlanIds:['bar'],dateFrom:from,dateTo:to,values:{rate:'432',closedToArrival:false,closedToDeparture:false,minStayArrival:2}},
      {ratePlanIds:['double-bar'],dateFrom:from,dateTo:to,values:{rate:'342',minStayArrival:3}},
    ]};
    const preview=await calendarRequest('preview',changes);expect(preview.status).toBe(200);
    expect((await calendarRequest('apply',{...changes,previewToken:preview.body.previewToken})).status).toBe(200);
    const jobs=(await pool.query("SELECT date_from::text,date_to::text,date_to-date_from AS span,batch_id::text FROM channex_ari_outbox ORDER BY id")).rows;
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    expect(new Set(jobs.map(job=>job.batch_id)).size).toBe(1);
    expect(jobs.every(job=>job.span<500)).toBe(true);
    const send=vi.fn(async()=>['case-eight-task']);
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('delivered');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2]).toEqual([
      expect.objectContaining({rate_plan_id:'remote-bar',date_from:from,date_to:to,rate:'432.00',min_stay_arrival:2}),
      expect.objectContaining({rate_plan_id:'remote-double-bar',date_from:from,date_to:to,rate:'342.00',min_stay_arrival:3}),
    ]);
    const published=(await pool.query("SELECT target_id,min(day)::text AS first,max(day)::text AS last,count(*)::int AS days FROM channex_ari_published GROUP BY target_id ORDER BY target_id")).rows;
    expect(published).toEqual([
      {target_id:'remote-bar',first:from,last:to,days:153},
      {target_id:'remote-double-bar',first:from,last:to,days:153},
    ]);
    await pool.query("UPDATE channex_ari_dispatch SET next_call_at=now()-interval '1 second'");
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('idle');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('captures sparse future calendar dates without filling untouched gaps and propagates deletion back to the base rate', async () => {
    await enable();
    const first=addDays(day,600),last=addDays(day,900);
    const request={changes:[{ratePlanIds:['bar'],dateFrom:first,dateTo:first,values:{rate:'200'}},
      {ratePlanIds:['bar'],dateFrom:last,dateTo:last,values:{rate:'300'}}]};
    const preview=await calendarRequest('preview',request);expect(preview.status,JSON.stringify(preview.body)).toBe(200);
    expect((await calendarRequest('apply',{...request,previewToken:preview.body.previewToken})).status).toBe(200);
    const jobs=(await pool.query('SELECT date_from::text,date_to::text FROM channex_ari_outbox ORDER BY date_from')).rows;
    expect(jobs).toEqual([{date_from:first,date_to:first},{date_from:last,date_to:last}]);
    const send=vi.fn(async()=>['sparse-task']);
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('delivered');
    expect(send.mock.calls[0][2]).toHaveLength(2);
    expect((await pool.query('SELECT count(*)::int AS n FROM channex_ari_published')).rows[0].n).toBe(2);
    await pool.query('DELETE FROM rate_calendar_entries WHERE rate_plan_id=$1 AND stay_date=$2',['bar',last]);
    await pool.query("UPDATE channex_ari_dispatch SET next_call_at=now()-interval '1 second'");
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('delivered');
    expect(send.mock.calls[1][2]).toEqual([expect.objectContaining({date_from:last,date_to:last,rate:'100.00'})]);
  });

  it('rolls future calendar capture back with the edited cells', async () => {
    await enable(); const c=await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,rate) VALUES('bar',$1,432)",[addDays(day,600)]);
      expect((await c.query('SELECT count(*)::int AS n FROM channex_ari_outbox')).rows[0].n).toBe(1);
      await c.query('ROLLBACK');
    } finally { c.release(); }
    expect((await pool.query('SELECT count(*)::int AS n FROM channex_ari_outbox')).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM rate_calendar_entries')).rows[0].n).toBe(0);
  });

  it('keeps different PMS saves in separate outgoing requests', async () => {
    await enable();
    for(const [offset,price] of [[0,'201'],[1,'202']] as const){
      const request={changes:[{ratePlanIds:['bar'],dateFrom:addDays(day,offset),dateTo:addDays(day,offset),values:{rate:price}}]};
      const preview=await calendarRequest('preview',request);
      expect((await calendarRequest('apply',{...request,previewToken:preview.body.previewToken})).status).toBe(200);
    }
    const send=vi.fn(async()=>['separate-task']);
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('delivered');
    expect(send.mock.calls[0][2]).toEqual([expect.objectContaining({date_from:day,date_to:day,rate:'201.00'})]);
    expect((await pool.query("SELECT count(*)::int AS n FROM channex_ari_outbox WHERE status='pending'")).rows[0].n).toBeGreaterThan(0);
    await pool.query("UPDATE channex_ari_dispatch SET next_call_at=now()-interval '1 second'");
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('delivered');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][2]).toEqual([expect.objectContaining({date_from:addDays(day,1),date_to:addDays(day,1),rate:'202.00'})]);
  });

  it('waits for every pending row of a batch before retrying the request', async () => {
    await enable(); await pool.query("UPDATE rate_plans SET base_rate=432 WHERE id='bar'");
    await pool.query("UPDATE channex_ari_outbox SET run_after=now()+interval '1 minute' WHERE id=(SELECT min(id) FROM channex_ari_outbox)");
    const send=vi.fn(async()=>['whole-batch']);
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('idle');expect(send).not.toHaveBeenCalled();
    await pool.query("UPDATE channex_ari_outbox SET run_after=now()");
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('delivered');expect(send).toHaveBeenCalledTimes(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM channex_ari_outbox WHERE status='pending'")).rows[0].n).toBe(0);
  });

  it('keeps non-calendar events and full sync bounded to the rolling 500-day horizon', async () => {
    const today=(await pool.query("SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text AS day")).rows[0].day;
    const future=addDays(today,540);
    const values=await buildAriValues(pool as any,connection,[{...event('restrictions'),date_from:future,date_to:future,reason:'rate_plans:update'}],today);
    expect(values).toEqual([]);
    const full=await buildAriValues(pool as any,connection,[{...event('restrictions'),date_from:today,date_to:addDays(today,600),reason:'full_sync'}],today);
    expect(full[0].date_from).toBe(today);expect(full.at(-1)!.date_to).toBe(addDays(today,499));
  });

  it('publishes field deltas without a prior snapshot, links minima in preview, and preserves retry state', async () => {
    await enable();
    const send = vi.fn(async () => ['field-task']);
    async function edit(values: any) {
      const body={changes:[{ratePlanIds:['bar'],dateFrom:day,dateTo:addDays(day,2),values}]};
      const preview=await calendarRequest('preview',body);expect(preview.status,JSON.stringify(preview.body)).toBe(200);
      expect((await calendarRequest('apply',{...body,previewToken:preview.body.previewToken})).status).toBe(200);
      await pool.query("UPDATE channex_ari_dispatch SET next_call_at=now()-interval '1 second'");
      return preview.body;
    }
    await edit({rate:'200'});
    const masks=(await pool.query('SELECT changed_fields FROM channex_ari_outbox')).rows;
    expect(masks).toEqual([{changed_fields:['rate']}]);
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('delivered');
    expect(send.mock.calls[0][2]).toEqual([{property_id:'property',rate_plan_id:'remote-bar',date_from:day,date_to:addDays(day,2),rate:'200.00'}]);
    const preview=await edit({minStayThrough:3});
    expect(preview.segments[0].after).toMatchObject({minStayArrival:3,minStayThrough:3});
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('delivered');
    expect(send.mock.calls[1][2]).toEqual([{property_id:'property',rate_plan_id:'remote-bar',date_from:day,date_to:addDays(day,2),min_stay_arrival:3,min_stay_through:3}]);
    await edit({stopSell:true});
    const publishedBefore=(await pool.query('SELECT day,value FROM channex_ari_published ORDER BY day')).rows;
    expect((await dispatchChannexAri(pool,async()=>{throw new AriTransportError(503)},true)).state).toBe('retry');
    expect((await pool.query('SELECT day,value FROM channex_ari_published ORDER BY day')).rows).toEqual(publishedBefore);
    await pool.query("UPDATE channex_ari_dispatch SET next_call_at=now()-interval '1 second'; UPDATE channex_ari_outbox SET run_after=now()");
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('delivered');
    expect(send.mock.calls[2][2]).toEqual([{property_id:'property',rate_plan_id:'remote-bar',date_from:day,date_to:addDays(day,2),stop_sell:true}]);
    expect((await pool.query('SELECT value FROM channex_ari_published LIMIT 1')).rows[0].value).toMatchObject({rate:'200.00',min_stay_arrival:3,min_stay_through:3,stop_sell:true});
    await edit({stopSell:false});await dispatchChannexAri(pool,send,true);
    expect(send.mock.calls[3][2]).toEqual([{property_id:'property',rate_plan_id:'remote-bar',date_from:day,date_to:addDays(day,2),stop_sell:false}]);
    const conflict=await calendarRequest('preview',{changes:[{ratePlanIds:['bar'],dateFrom:day,dateTo:day,values:{minStayArrival:2,minStayThrough:3}}]});
    expect(conflict.status).toBe(400);
  });
  it('keeps masks separate for multiple plans and merges equal adjacent restriction sequences', async () => {
    await pool.query("INSERT INTO rate_plans VALUES('other','twin',120,'USD',NULL,NULL); INSERT INTO channex_rate_plan_mappings VALUES('connection','remote-twin','remote-other','other')");
    await enable();
    const body={changes:[{ratePlanIds:['bar'],dateFrom:day,dateTo:addDays(day,4),values:{closedToArrival:true}}, {ratePlanIds:['other'],dateFrom:day,dateTo:addDays(day,4),values:{rate:'250'}}]};
    const preview=await calendarRequest('preview',body);expect((await calendarRequest('apply',{...body,previewToken:preview.body.previewToken})).status).toBe(200);
    const send=vi.fn(async()=>['multi']);await dispatchChannexAri(pool,send,true);
    expect(send.mock.calls[0][2]).toEqual([
      {property_id:'property',rate_plan_id:'remote-bar',date_from:day,date_to:addDays(day,4),closed_to_arrival:true},
      {property_id:'property',rate_plan_id:'remote-other',date_from:day,date_to:addDays(day,4),rate:'250.00'}]);
  });
  it('keeps independent minima for unmapped plans and normalizes historical mapped minima only on the wire', async () => {
    await pool.query("INSERT INTO rate_plans VALUES('local-only','twin',100,'USD',NULL,NULL)");
    const request={changes:[{ratePlanIds:['local-only'],dateFrom:day,dateTo:day,values:{minStayArrival:2,minStayThrough:4}}]};
    const preview=await calendarRequest('preview',request);expect(preview.status).toBe(200);
    expect(preview.body.segments[0].after).toMatchObject({minStayArrival:2,minStayThrough:4});
    expect((await calendarRequest('apply',{...request,previewToken:preview.body.previewToken})).status).toBe(200);
    await pool.query("INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,min_stay_arrival,min_stay_through) VALUES('bar',$1,3,1)",[day]);
    const values=await buildAriValues(pool as any,connection,[event('restrictions')],day);
    expect(values[0]).toMatchObject({min_stay_arrival:3,min_stay_through:3});
    expect((await pool.query("SELECT min_stay_through FROM rate_calendar_entries WHERE rate_plan_id='bar'")).rows[0].min_stay_through).toBe(1);
  });
  it('records live-test booking dates only and full sync uses exactly two calls for all 500 days', async () => {
    await enable();
    const send=vi.fn(async()=>['live-test']);
    await pool.query('INSERT INTO reservations VALUES($1,$2,$3,$4,$5)',['live','201',day,addDays(day,1),'confirmed']);
    await dispatchChannexAri(pool,send,true);
    expect(send.mock.calls[0][1]).toBe('availability');
    expect(send.mock.calls[0][2]).toEqual([{property_id:'property',room_type_id:'remote-twin',date_from:day,date_to:day,availability:1}]);
    await pool.query('UPDATE reservations SET check_in_date=$1,check_out_date=$2 WHERE id=$3',[addDays(day,7),addDays(day,8),'live']);
    await pool.query("UPDATE channex_ari_dispatch SET next_call_at=now()-interval '1 second'");
    await dispatchChannexAri(pool,send,true);
    expect(send.mock.calls[1][2]).toEqual([
      {property_id:'property',room_type_id:'remote-twin',date_from:day,date_to:day,availability:2},
      {property_id:'property',room_type_id:'remote-twin',date_from:addDays(day,7),date_to:addDays(day,7),availability:1}]);
    expect((await fetch(`${origin}/api/channex/connections/connection/ari/full-sync`,{method:'POST'})).status).toBe(202);
    for(let i=0;i<2;i++) {await pool.query("UPDATE channex_ari_dispatch SET next_call_at=now()-interval '1 second'");expect((await dispatchChannexAri(pool,send,true)).state).toBe('delivered');}
    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls.slice(2).map(call=>call[1]).sort()).toEqual(['availability','restrictions']);
    for(const call of send.mock.calls.slice(2)) expect(call[2].reduce((sum:number,v:any)=>sum+(Date.parse(v.date_to)-Date.parse(v.date_from))/86400000+1,0)).toBe(500);
    await pool.query("UPDATE channex_ari_dispatch SET next_call_at=now()-interval '1 second'");
    expect((await dispatchChannexAri(pool,send,true)).state).toBe('idle');
    expect((await fetch(`${origin}/api/channex/connections/connection/ari/full-sync`,{method:'POST'})).status).toBe(409);
  });

  it('rejects an outdated calendar review without overwriting another operator', async () => {
    const request = { changes: [{ ratePlanIds: ['bar'], dateFrom: day, dateTo: day, values: { rate: '170' } }] };
    const first = await calendarRequest('preview', request);
    const other = { changes: [{ ...request.changes[0], values: { rate: '180' } }] }; const second = await calendarRequest('preview', other);
    expect((await calendarRequest('apply', { ...other, previewToken: second.body.previewToken })).status).toBe(200);
    expect((await calendarRequest('apply', { ...request, previewToken: first.body.previewToken })).status).toBe(409);
    expect((await pool.query('SELECT rate FROM rate_calendar_entries')).rows[0].rate).toBe('180.00');
    expect((await pool.query('SELECT count(*)::int AS n FROM rate_calendar_edits')).rows[0].n).toBe(1);
  });
  it('preserves untouched rules and explicitly restores false, zero and the base rate', async () => {
    await enable();
    const set = { changes: [{ ratePlanIds: ['bar'], dateFrom: day, dateTo: day, values: { rate: '180', minStayArrival: 2, maxStay: 5, stopSell: true, closedToDeparture: true } }] };
    const preview = await calendarRequest('preview', set); await calendarRequest('apply', { ...set, previewToken: preview.body.previewToken });
    const clear = { changes: [{ ratePlanIds: ['bar'], dateFrom: day, dateTo: day, values: { rate: null, maxStay: 0, stopSell: false } }] };
    const reviewed = await calendarRequest('preview', clear); expect((await calendarRequest('apply', { ...clear, previewToken: reviewed.body.previewToken })).status).toBe(200);
    const row = (await pool.query('SELECT * FROM rate_calendar_entries')).rows[0]; expect(row).toMatchObject({ rate: null, min_stay_arrival: 2, max_stay: 0, stop_sell: false, closed_to_departure: true });
    const payload = await buildAriValues(pool as any, connection, [event('restrictions')], day);
    expect(payload[0]).toMatchObject({ rate: '100.00', min_stay_arrival: 2, max_stay: 0, stop_sell: false, closed_to_departure: true });
  });
  it('rolls back calendar, audit and outbox together if any part of saving fails', async () => {
    await enable(); const request = { changes: [{ ratePlanIds: ['bar'], dateFrom: day, dateTo: addDays(day, 2), values: { rate: '180' } }] };
    const reviewed = await calendarRequest('preview', request);
    await pool.query(`CREATE FUNCTION reject_calendar_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;
      CREATE TRIGGER reject_calendar_audit BEFORE INSERT ON rate_calendar_edits FOR EACH ROW EXECUTE FUNCTION reject_calendar_audit()`);
    try {
      expect((await calendarRequest('apply', { ...request, previewToken: reviewed.body.previewToken })).status).toBe(503);
      for (const table of ['rate_calendar_entries', 'rate_calendar_edits', 'channex_ari_outbox']) expect((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n).toBe(0);
    } finally { await pool.query('DROP TRIGGER reject_calendar_audit ON rate_calendar_edits; DROP FUNCTION reject_calendar_audit()'); }
  });
  it('validates stay consistency and plan validity and refuses saving without review', async () => {
    const change = { ratePlanIds: ['bar'], dateFrom: day, dateTo: day, values: { minStayArrival: 4, maxStay: 2 } };
    expect((await calendarRequest('preview', { changes: [change] })).status).toBe(400);
    expect((await calendarRequest('apply', { changes: [{ ...change, values: { rate: '170' } }] })).status).toBe(400);
    await pool.query('UPDATE rate_plans SET valid_to=$1 WHERE id=$2', [addDays(day, -1), 'bar']);
    expect((await calendarRequest('preview', { changes: [{ ...change, values: { rate: '170' } }] })).status).toBe(400);
    expect((await pool.query('SELECT count(*)::int AS n FROM rate_calendar_entries')).rows[0].n).toBe(0);
  });
  it('never splits a committed batch when there are more than 1000 outbox events', async () => {
    await enable(); await pool.query(`INSERT INTO channex_ari_outbox(connection_id,kind,date_from,date_to,rate_plan_id,reason) SELECT 'connection','restrictions',$1,$1,'bar','synthetic_batch' FROM generate_series(1,1201)`, [day]);
    const send = vi.fn(async () => ['batch-task']); expect((await dispatchChannexAri(pool, send, true)).state).toBe('delivered'); expect(send).toHaveBeenCalledTimes(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM channex_ari_outbox WHERE status='delivered'")).rows[0].n).toBe(1201);
  });

  it('restores explicit channel defaults when a dated override is removed', async () => {
    await enable(); await pool.query(`INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,rate,stop_sell,min_stay_through) VALUES('bar',$1,180,true,3)`, [day]);
    await pool.query(`DELETE FROM rate_calendar_entries WHERE rate_plan_id='bar' AND stay_date=$1`, [day]);
    expect((await pool.query("SELECT count(*)::int AS n FROM channex_ari_outbox WHERE reason='rate_calendar:delete'")).rows[0].n).toBe(1);
    expect((await buildAriValues(pool as any, connection, [event('restrictions')], day))[0]).toMatchObject({ rate: '100.00', stop_sell: false, min_stay_arrival: 1, min_stay_through: 1, max_stay: 0, closed_to_arrival: false, closed_to_departure: false });
  });
  it('keeps dated overrides when a base plan price changes', async () => {
    await enable(); await pool.query(`INSERT INTO rate_calendar_entries(rate_plan_id,stay_date,rate) VALUES('bar',$1,180)`, [day]);
    await pool.query(`UPDATE rate_plans SET base_rate=135 WHERE id='bar'`);
    const payload = await buildAriValues(pool as any, connection, [{ ...event('restrictions'), date_to: addDays(day, 1) }], day);
    expect(payload.map(p => p.rate)).toEqual(['180.00', '135.00']);
  });

  it('serializes simultaneous confirmations and keeps only one accepted revision', async () => {
    await enable();
    const requests = [170, 180].map(rate => ({ changes: [{ ratePlanIds: ['bar'], dateFrom: day, dateTo: day, values: { rate: String(rate) } }] }));
    const previews = await Promise.all(requests.map(body => calendarRequest('preview', body)));
    const results = await Promise.all(requests.map((body, i) => calendarRequest('apply', { ...body, previewToken: previews[i].body.previewToken })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await pool.query('SELECT count(*)::int AS n FROM rate_calendar_edits')).rows[0].n).toBe(1);
    expect((await pool.query('SELECT count(*)::int AS n FROM channex_ari_outbox')).rows[0].n).toBe(1);
  });

});
