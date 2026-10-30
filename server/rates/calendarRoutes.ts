import type { Express } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../auth';
import { calendarRequestSchema, calendarDay } from '@shared/rate-calendar';
import { readCalendar, editCalendar, CalendarConflict, CalendarInputError } from './calendarService';
const querySchema = z.object({ ratePlanIds: z.string().min(1).max(2100), dateFrom: z.string().refine(calendarDay), dateTo: z.string().refine(calendarDay) }).strict();
const applySchema = calendarRequestSchema.extend({ previewToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export function registerRateCalendarRoutes(app: Express, getPool: () => Promise<Pool> = async () => (await import('../db')).pool) {
  const write = requirePermission('api:rates:write');
  const errorResponse = (res: any, error: unknown) => {
    if (error instanceof CalendarConflict) return res.status(409).json({ error: error.message });
    if (error instanceof CalendarInputError) return res.status(400).json({ error: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Revisá los planes, las fechas y los valores ingresados' });
    return res.status(503).json({ error: 'No se pudo consultar o guardar el calendario. Actualizá la vista antes de reintentar' });
  };
  app.get('/api/rate-calendar', requireAuth, async (req, res) => {
    try { const q = querySchema.parse(req.query); res.json(await readCalendar(await getPool(), q.ratePlanIds.split(','), q.dateFrom, q.dateTo)); }
    catch (error) { errorResponse(res, error); }
  });
  app.post('/api/rate-calendar/preview', write, async (req, res) => {
    try { const request = calendarRequestSchema.parse(req.body); res.json(await editCalendar(await getPool(), request, req.user?.id ?? null)); }
    catch (error) { errorResponse(res, error); }
  });
  app.post('/api/rate-calendar/apply', write, async (req, res) => {
    try { const { previewToken, ...request } = applySchema.parse(req.body); res.json(await editCalendar(await getPool(), request, req.user?.id ?? null, previewToken)); }
    catch (error) { errorResponse(res, error); }
  });
}
