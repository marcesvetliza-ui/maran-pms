import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import express from 'express';
const state = vi.hoisted(() => ({ db: null as any, readOnly: '' }));
vi.mock('../db', () => ({ db: new Proxy({}, { get(_t, key) { const v = state.db[key]; return typeof v === 'function' ? v.bind(state.db) : v; } }), withReadOnlyDatabaseTransaction: (action: any) => state.db.transaction(async (tx: any) => { const original = state.db; state.db = tx; try { state.readOnly = (await tx.execute(sql`SHOW transaction_read_only`)).rows[0].transaction_read_only; return await action(); } finally { state.db = original; } }, { isolationLevel: 'repeatable read', accessMode: 'read only' }) }));
vi.mock('../auth', () => ({ requireAuth: (_q: any, _s: any, next: any) => next(), requirePermission: () => (_q: any, _s: any, next: any) => next() }));
import { getAgencyProductionReport } from '../agencyProduction';
import { registerAgencyProductionRoutes } from '../routes/agency-production';
const url = process.env.DATABASE_URL, enabled = !!url && process.env.ALLOW_DESTRUCTIVE_PG_TESTS === 'true';
describe.skipIf(!enabled)('agency production · disposable PostgreSQL · read-only historical report', () => {
  let client: Client, server: ReturnType<ReturnType<typeof express>['listen']>, base: string;
  beforeAll(async () => {
    const target = new URL(url!); if (!['localhost', '127.0.0.1'].includes(target.hostname) || !/test/i.test(target.pathname)) throw Error('Disposable local test database required');
    client = new Client({ connectionString: url }); await client.connect(); state.db = drizzle(client);
    await client.query('CREATE TEMP TABLE agencies (LIKE public.agencies INCLUDING DEFAULTS); CREATE TEMP TABLE rooms (LIKE public.rooms INCLUDING DEFAULTS); CREATE TEMP TABLE reservations (LIKE public.reservations INCLUDING DEFAULTS)');
    const app = express(); registerAgencyProductionRoutes(app); server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); if (client) await client.end(); });
  beforeEach(async () => {
    await client.query("TRUNCATE pg_temp.agencies,pg_temp.rooms,pg_temp.reservations; INSERT INTO agencies(id,razon_social,cuil_cuit,commission_rate) VALUES('a','Synthetic net agency','synthetic-a',0),('b','Synthetic agency B','synthetic-b',10),('empty','Synthetic empty agency','synthetic-empty',0); INSERT INTO rooms(id,room_number,room_type_id,floor,is_virtual) VALUES('room','101','type',1,false),('virtual','REUB','type',99,true)");
    const pricing = [{ date: '2002-10-31', rateCents: 10000, discountCents: 0 }, { date: '2002-11-01', rateCents: 20000, discountCents: 0 }, { date: '2002-11-02', rateCents: 30000, discountCents: 0 }];
    for (const [id, agency, status, room] of [['history', 'a', 'checked_out', 'room'], ['confirmed', 'a', 'confirmed', 'room'], ['cancelled', 'a', 'cancelled', 'room'], ['noshow', 'a', 'no_show', 'room'], ['virtual', 'a', 'checked_out', 'virtual'], ['other', 'b', 'checked_out', 'room']]) {
      await client.query("INSERT INTO reservations(id,reservation_code,guest_id,room_id,room_type_id,agency_id,check_in_date,check_out_date,nights,total_room_amount,base_rate_per_night,final_rate_per_night,status,source,created_at,pricing_scheme,nightly_pricing) VALUES($1::text,$1::text,'guest',$4,'type',$2,'2002-10-31','2002-11-03',3,600,200,200,$3,'agencia',now(),'nightly_v1',$5)", [id, agency, status, room, JSON.stringify(pricing)]);
    }
  });
  it('includes historical checkout stays at zero commission and clips nights at period boundaries', async () => {
    const report = await getAgencyProductionReport({ from: '2002-11-01', to: '2002-11-30' });
    expect(report.find(r => r.agency.id === 'a')).toMatchObject({ totalReservations: 1, totalNights: 2, totalRevenue: 500, totalCommission: 0, nightShare: 50 });
    expect(report.find(r => r.agency.id === 'b')).toMatchObject({ totalReservations: 1, totalNights: 2, totalRevenue: 500, totalCommission: 50 });
    expect(state.readOnly).toBe('on');
  });
  it('serves matching global and individual statistics without modifying stored reservations or agency settings', async () => {
    const before = (await client.query('SELECT row_to_json(r) AS data FROM reservations r ORDER BY id')).rows;
    const agencyBefore = (await client.query('SELECT row_to_json(a) AS data FROM agencies a ORDER BY id')).rows;
    const response = await fetch(base + '/api/agencies/report?from=2002-11-01&to=2002-11-30'); expect(response.status).toBe(200); expect((await response.json()).filter((r: any) => r.totalNights > 0)).toHaveLength(2);
    const details = await (await fetch(base + '/api/agencies/a/stats')).json(); expect(details).toMatchObject({ totalReservations: 1, totalNights: 3, totalRevenue: 600 });
    expect((await client.query('SELECT row_to_json(r) AS data FROM reservations r ORDER BY id')).rows).toEqual(before);
    expect((await client.query('SELECT row_to_json(a) AS data FROM agencies a ORDER BY id')).rows).toEqual(agencyBefore);
  });
  it('returns no nights for the checkout day alone and refuses reversed date ranges', async () => {
    expect((await getAgencyProductionReport({ from: '2002-11-03', to: '2002-11-03' })).every(r => r.totalNights === 0)).toBe(true);
    const response = await fetch(base + '/api/agencies/report?from=2002-12-01&to=2002-11-01'); expect(response.status).toBe(400);
  });
});
