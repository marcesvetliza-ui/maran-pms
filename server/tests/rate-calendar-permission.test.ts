import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../db', () => ({ db: {}, pool: {} }));
vi.mock('../permissions', () => ({ hasPermission: (role: string, key: string) => role === 'manager' && key === 'api:rates:write' }));
import { registerRateCalendarRoutes } from '../rates/calendarRoutes';
let server: Server | undefined;
afterEach(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; });
async function start(role: string, authenticated = true) {
  const pool = vi.fn(async () => ({}) as any), app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'operator', role } as any; req.isAuthenticated = () => authenticated; next(); });
  registerRateCalendarRoutes(app, pool); server = createServer(app); await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  return { pool, url: `http://127.0.0.1:${(server.address() as any).port}` };
}
it('rejects unauthenticated reads before accessing the database', async () => {
  const { url, pool } = await start('manager', false); expect((await fetch(`${url}/api/rate-calendar`)).status).toBe(401); expect(pool).not.toHaveBeenCalled();
});
it('requires the existing rates-write permission for preview and confirmation', async () => {
  const { url, pool } = await start('reception');
  for (const action of ['preview', 'apply']) expect((await fetch(`${url}/api/rate-calendar/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: [] }) })).status).toBe(403);
  expect(pool).not.toHaveBeenCalled();
});
it('allows the authorized role through the permission guard and validates its request', async () => {
  const { url } = await start('manager'); expect((await fetch(`${url}/api/rate-calendar/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: [] }) })).status).toBe(400);
});
