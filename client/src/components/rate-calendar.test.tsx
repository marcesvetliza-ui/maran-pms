import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RateCalendar } from './rate-calendar';
import { queryClient } from '@/lib/queryClient';
import { calendarEffective, applyCalendarValues, calendarDays } from '@shared/rate-calendar';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const plans = [{ id: 'bar', name: 'BAR', currency: 'USD', roomType: { name: 'Twin' } }, { id: 'breakfast', name: 'Desayuno', currency: 'USD', roomType: { name: 'Twin' } }];
let requests: { url: string; method: string; body: any }[] = [];
beforeEach(() => {
  queryClient.clear(); requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const request = { url: String(url), method: options?.method ?? 'GET', body: options?.body ? JSON.parse(String(options.body)) : null }; requests.push(request);
    let body: any = { cells: [] };
    if (request.url.endsWith('/preview')) {
      const changes = request.body.changes;
      const segments = changes.flatMap((change: any) => change.ratePlanIds.map((id: string) => {
        const before = calendarEffective({ id, base_rate: '100.00', currency: 'USD' }, change.dateFrom);
        return { ratePlanId: id, dateFrom: change.dateFrom, dateTo: change.dateTo, before, after: applyCalendarValues(before, change.values, '100.00') };
      }));
      const count = changes.reduce((n: number, c: any) => n + c.ratePlanIds.length * calendarDays(c.dateFrom, c.dateTo).length, 0);
      body = { previewToken: 'a'.repeat(64), selectedCells: count, changedCells: count, segments };
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });
function mount(canEdit = true) { return render(<QueryClientProvider client={queryClient}><RateCalendar plans={plans} canEdit={canEdit} /></QueryClientProvider>); }
function price(id: number, value: string) { fireEvent.change(screen.getByLabelText(`Acción de precio período ${id}`), { target: { value: 'set' } }); fireEvent.change(screen.getByLabelText(`Precio período ${id}`), { target: { value } }); }
it('reviews changes without writing and confirms the same reviewed request explicitly', async () => {
  mount(); price(1, '179.90'); fireEvent.change(screen.getByLabelText('Cerrar ventas período 1'), { target: { value: 'yes' } });
  expect(screen.queryByRole('button', { name: 'Confirmar cambios' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }));
  await screen.findByRole('region', { name: 'Revisión de cambios' });
  const preview = requests.find(r => r.url.endsWith('/preview'))!;
  expect(preview.body.changes[0].values).toEqual({ rate: '179.90', stopSell: true });
  expect(requests.some(r => r.url.endsWith('/apply'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambios' }));
  await waitFor(() => expect(requests.find(r => r.url.endsWith('/apply'))?.body).toEqual({ ...preview.body, previewToken: 'a'.repeat(64) }));
  expect(requests.every(r => r.url.startsWith('/api/rate-calendar'))).toBe(true);
});
it('discards review if the operator changes the proposed values', async () => {
  mount(); price(1, '179.90'); fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }));
  await screen.findByRole('button', { name: 'Confirmar cambios' });
  fireEvent.change(screen.getByLabelText('Precio período 1'), { target: { value: '185' } });
  expect(screen.queryByRole('button', { name: 'Confirmar cambios' })).toBeNull();
  expect(requests.some(r => r.url.endsWith('/apply'))).toBe(false);
});
it('edits multiple plans and periods in one reviewed operation from the regular calendar', async () => {
  mount(); price(1, '179.90'); fireEvent.click(screen.getByRole('button', { name: 'Agregar período' }));
  fireEvent.click(screen.getByLabelText('Twin · BAR (USD) período 2'));
  fireEvent.click(screen.getByLabelText('Twin · Desayuno (USD) período 2'));
  price(2, '219.25'); fireEvent.change(screen.getByLabelText('Mínimo durante la estadía período 2'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Revisar cambios' })); await screen.findByRole('region', { name: 'Revisión de cambios' });
  const request = requests.find(r => r.url.endsWith('/preview'))!.body;
  expect(request.changes).toEqual([expect.objectContaining({ ratePlanIds: ['bar'], values: { rate: '179.90' } }), expect.objectContaining({ ratePlanIds: ['breakfast'], values: { rate: '219.25', minStayThrough: 3 } })]);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambios' })); await waitFor(() => expect(requests.filter(r => r.url.endsWith('/apply'))).toHaveLength(1));
});
it('allows read-only viewing without edit or confirmation controls', async () => {
  mount(false); await waitFor(() => expect(requests.length).toBeGreaterThan(0));
  expect(screen.queryByRole('button', { name: 'Revisar cambios' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Agregar período' })).toBeNull();
});
