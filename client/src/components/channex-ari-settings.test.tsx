import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChannexAriSettings } from './channex-ari-settings';
import { queryClient } from '@/lib/queryClient';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const status = { settings: { floor: 2, currency: 'USD', enabled: false }, dispatchEnabled: false, rooms: [{ id: 'r201', roomNumber: '201', roomTypeName: 'Twin', channexRoomTypeId: 'twin' }], summary: [{ status: 'pending', count: 2 }], events: [] };
let requests: { url: string; method: string; body: any }[] = [];
beforeEach(() => {
  queryClient.clear(); requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    requests.push({ url: String(url), method: options?.method ?? 'GET', body: options?.body ? JSON.parse(String(options.body)) : null });
    return new Response(JSON.stringify(status), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });
it('shows the included floor and the disabled dispatch state, and saves scope from the real settings form', async () => {
  render(<QueryClientProvider client={queryClient}><ChannexAriSettings connectionId="connection" /></QueryClientProvider>);
  expect(await screen.findByText(/201 · Twin/)).toBeTruthy();
  expect(screen.getByText(/Envíos externos deshabilitados/)).toBeTruthy();
  expect(screen.getByLabelText('Piso incluido')).toHaveValue(2);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar alcance' }));
  await waitFor(() => expect(requests.some(r => r.method === 'PATCH' && r.url === '/api/channex/connections/connection/ari' && r.body.floor === 2 && r.body.currency === 'USD' && r.body.enabled === false)).toBe(true));
  expect(requests.every(r => r.url.startsWith('/api/channex/'))).toBe(true);
});
it('requests a preview for a changed floor without enabling capture', async () => {
  render(<QueryClientProvider client={queryClient}><ChannexAriSettings connectionId="connection" /></QueryClientProvider>);
  await screen.findByLabelText('Piso incluido');
  fireEvent.change(screen.getByLabelText('Piso incluido'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ver habitaciones' }));
  await waitFor(() => expect(requests.some(r => r.url.endsWith('/ari?floor=3'))).toBe(true));
  expect(requests.some(r => r.method === 'PATCH' || r.method === 'POST')).toBe(false);
});
