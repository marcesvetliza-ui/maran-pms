import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
const source = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock('../db', () => ({ db: {}, withReadOnlyDatabaseTransaction: vi.fn() }));
vi.mock('../agencyProduction', async original => ({ ...await original<typeof import('../agencyProduction')>(), getAgencyProductionReport: source.report }));
vi.mock('../auth', () => ({ requireAuth: (req: any, res: any, next: any) => req.headers['x-test-user'] ? next() : res.status(401).json({}), requirePermission: (key: string) => (req: any, res: any, next: any) => key === 'sidebar:/agencies' && req.headers['x-test-access'] === 'yes' ? next() : res.status(403).json({}) }));
import { registerAgencyProductionRoutes } from '../routes/agency-production';
let server: ReturnType<ReturnType<typeof express>['listen']>, base: string;
beforeAll(async () => { const app = express(); registerAgencyProductionRoutes(app); server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as any).port}`; });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => { source.report.mockReset().mockResolvedValue([{ agency: { id: 'a' }, totalNights: 3, totalCommission: 0 }]); });
const get = (path: string, headers: Record<string, string> = { 'x-test-user': 'reader', 'x-test-access': 'yes' }) => fetch(base + path, { headers });
it('passes stay-date filters to the report without calling the active-reservations storage view', async () => {
  const response = await get('/api/agencies/report?from=2026-11-01&to=2026-11-30'); expect(response.status).toBe(200); expect((await response.json())[0]).toMatchObject({ totalNights: 3, totalCommission: 0 });
  expect(source.report).toHaveBeenCalledExactlyOnceWith({ from: '2026-11-01', to: '2026-11-30' });
});
it.each(['?from=2026-02-30', '?from=2026-12-01&to=2026-11-01', '?from[]=2026-11-01', '?mode=booked'])('rejects invalid or unsupported filters before reading: %s', async query => {
  expect((await get('/api/agencies/report' + query)).status).toBe(400); expect(source.report).not.toHaveBeenCalled();
});
it('uses the same historical calculation for individual agency statistics', async () => {
  const response = await get('/api/agencies/a/stats'); expect(response.status).toBe(200); expect(source.report).toHaveBeenCalledExactlyOnceWith({ agencyId: 'a' });
  source.report.mockResolvedValue([]); expect((await get('/api/agencies/missing/stats')).status).toBe(404);
});
it.each([['/api/agencies/report', {}, 401], ['/api/agencies/a/stats', { 'x-test-user': 'reader' }, 403]])('requires agency access: %s', async (path, headers, status) => {
  expect((await get(path as string, headers as any)).status).toBe(status); expect(source.report).not.toHaveBeenCalled();
});
it('returns an error instead of a zero-valued production report when the query fails', async () => {
  source.report.mockRejectedValue(new Error('Synthetic database failure')); const response = await get('/api/agencies/report'); expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: 'No se pudo consultar la producción por agencia.' });
});
